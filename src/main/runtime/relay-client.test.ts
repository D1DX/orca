import { describe, expect, it, vi } from 'vitest'
import { RUNTIME_RELAY_MAX_FRAME_BYTES } from '../../shared/runtime-relay-limits'
import { RuntimeRelayClient } from './relay-client'

const { FakeWebSocket, createdSockets } = vi.hoisted(() => {
  class HoistedFakeWebSocket {
    static OPEN = 1
    readonly OPEN = 1
    readyState = 1
    readonly endpoint: URL
    readonly options: unknown
    readonly closeCalls: { code?: number; reason?: string }[] = []
    private listeners = new Map<string, ((...args: unknown[]) => void)[]>()

    constructor(endpoint: URL, options: unknown) {
      this.endpoint = endpoint
      this.options = options
      sockets.push(this)
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args)
      }
    }

    close(code?: number, reason?: string): void {
      this.closeCalls.push({ code, reason })
    }
  }

  const sockets: HoistedFakeWebSocket[] = []
  return { FakeWebSocket: HoistedFakeWebSocket, createdSockets: sockets }
})

vi.mock('ws', () => ({
  default: FakeWebSocket
}))

describe('RuntimeRelayClient', () => {
  it('ignores stale control socket events after config rotation', () => {
    createdSockets.length = 0
    const attachDataSocket = vi.fn()
    const client = new RuntimeRelayClient({
      config: { enabled: true, endpoint: 'ws://relay-a.test/ws' },
      identity: { serverId: 'serverIdForRelayClientTest01', hostToken: 'host-token' },
      attachDataSocket
    })

    client.start()
    const oldControl = createdSockets[0]!
    oldControl.emit('open')

    client.updateConfig({ enabled: true, endpoint: 'ws://relay-b.test/ws' })
    expect(createdSockets).toHaveLength(2)

    oldControl.emit(
      'message',
      JSON.stringify({ type: 'connected', connectionId: 'abc123abc123abcd' })
    )

    expect(createdSockets).toHaveLength(2)
    expect(attachDataSocket).not.toHaveBeenCalled()
  })

  it('closes the control socket on invalid JSON values from the relay', () => {
    createdSockets.length = 0
    const attachDataSocket = vi.fn()
    const client = new RuntimeRelayClient({
      config: { enabled: true, endpoint: 'ws://relay-a.test/ws' },
      identity: { serverId: 'serverIdForRelayClientTest02', hostToken: 'host-token' },
      attachDataSocket
    })

    client.start()
    const control = createdSockets[0]!
    control.emit('open')

    expect(() => control.emit('message', 'null')).not.toThrow()
    expect(control.closeCalls).toContainEqual({
      code: 1008,
      reason: 'Invalid relay control message'
    })
  })

  it('sends enrollment tokens as a host-only header', () => {
    createdSockets.length = 0
    const client = new RuntimeRelayClient({
      config: {
        enabled: true,
        endpoint: 'ws://relay-a.test/ws?enrollmentToken=enrollment-secret'
      },
      identity: { serverId: 'serverIdForRelayClientTest03', hostToken: 'host-token' },
      attachDataSocket: vi.fn()
    })

    client.start()
    const control = createdSockets[0]!

    expect(control.endpoint.searchParams.has('enrollmentToken')).toBe(false)
    expect((control.options as { headers: Record<string, string> }).headers).toMatchObject({
      Authorization: 'Bearer host-token',
      'X-Orca-Relay-Enrollment': 'enrollment-secret'
    })
  })

  it('caps received relay frames on control and data sockets', () => {
    createdSockets.length = 0
    const client = new RuntimeRelayClient({
      config: { enabled: true, endpoint: 'ws://relay-a.test/ws' },
      identity: { serverId: 'serverIdForRelayClientTest04', hostToken: 'host-token' },
      attachDataSocket: vi.fn()
    })

    client.start()
    const control = createdSockets[0]!
    control.emit('open')
    control.emit('message', JSON.stringify({ type: 'connected', connectionId: 'abc123abc123abcd' }))

    expect(createdSockets).toHaveLength(2)
    expect((control.options as { maxPayload: number }).maxPayload).toBe(
      RUNTIME_RELAY_MAX_FRAME_BYTES
    )
    expect((createdSockets[1]!.options as { maxPayload: number }).maxPayload).toBe(
      RUNTIME_RELAY_MAX_FRAME_BYTES
    )
  })
})
