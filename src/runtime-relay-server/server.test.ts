import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  delay,
  openRawRelaySocket,
  openRelaySocket,
  waitForClose,
  waitForControlMessage,
  waitForMessage,
  waitForRawSocketClose
} from './relay-server-test-sockets'
import { startRuntimeRelayServer, type RuntimeRelayServer } from './server'

let relay: RuntimeRelayServer | null = null
let tempDir: string | null = null

afterEach(async () => {
  await relay?.stop()
  relay = null
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

describe('runtime relay server', () => {
  it('enrolls host control token and rejects later wrong host token', async () => {
    relay = await startTestRelay()
    const serverId = 'serverTokenBinding01'
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token: 'a'.repeat(43),
      enrollmentToken: relay.enrollmentToken
    })

    await expect(
      openRelaySocket(relay.webSocketUrl, {
        role: 'server',
        serverId,
        token: 'b'.repeat(43)
      })
    ).rejects.toThrow()

    control.close()
  })

  it('forwards opaque frames between client and host data sockets', async () => {
    relay = await startTestRelay()
    const serverId = 'serverForwarding01'
    const token = 'c'.repeat(43)
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      enrollmentToken: relay.enrollmentToken
    })
    const connectedControl = waitForControlMessage(control, 'connected')
    const client = await openRelaySocket(relay.webSocketUrl, { role: 'client', serverId })
    const connectedMessage = (await connectedControl) as {
      type: string
      connectionId: string
    }
    expect(connectedMessage.type).toBe('connected')

    const serverData = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      connectionId: connectedMessage.connectionId
    })
    const serverReceived = waitForMessage(serverData)
    client.send('client-frame')
    expect(await serverReceived).toBe('client-frame')

    const clientReceived = waitForMessage(client)
    serverData.send('server-frame')
    expect(await clientReceived).toBe('server-frame')

    control.close()
    client.close()
    serverData.close()
  })

  it('advertises bracketed URLs for IPv6 hosts', async () => {
    relay = await startTestRelay({ host: '::1' })

    expect(relay.httpUrl).toMatch(/^http:\/\/\[::1\]:\d+$/)
    expect(relay.webSocketUrl).toMatch(/^ws:\/\/\[::1\]:\d+\/ws$/)
  })

  it('rejects clients for unknown server ids', async () => {
    relay = await startTestRelay()
    await expect(
      openRelaySocket(relay.webSocketUrl, { role: 'client', serverId: 'unknownServerId01' })
    ).rejects.toThrow()
  })

  it('rejects first host enrollment without the relay enrollment token', async () => {
    relay = await startTestRelay()
    await expect(
      openRelaySocket(relay.webSocketUrl, {
        role: 'server',
        serverId: 'serverNoEnrollment',
        token: 'e'.repeat(43)
      })
    ).rejects.toThrow()
  })

  it('fails closed when persisted relay bindings are unreadable', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-'))
    const statePath = join(tempDir, 'relay-state.json')
    writeFileSync(statePath, '{not-valid-json')

    await expect(
      startRuntimeRelayServer({
        host: '127.0.0.1',
        port: 0,
        statePath
      })
    ).rejects.toThrow('Failed to read runtime relay state')
  })

  it('fails closed when persisted relay bindings have an invalid shape', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-'))
    const statePath = join(tempDir, 'relay-state.json')
    writeFileSync(statePath, JSON.stringify({ hostTokenHashes: [] }))

    await expect(
      startRuntimeRelayServer({
        host: '127.0.0.1',
        port: 0,
        statePath
      })
    ).rejects.toThrow('Failed to read runtime relay state')
  })

  it('fails closed when persisted relay state is not an object', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-'))
    const statePath = join(tempDir, 'relay-state.json')
    writeFileSync(statePath, JSON.stringify([]))

    await expect(
      startRuntimeRelayServer({
        host: '127.0.0.1',
        port: 0,
        statePath
      })
    ).rejects.toThrow('Failed to read runtime relay state')
  })

  it('rejects first host enrollment and rolls back binding when persistence fails', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-'))
    const blockerPath = join(tempDir, 'relay-state-parent')
    const statePath = join(blockerPath, 'relay-state.json')
    const logs: string[] = []
    writeFileSync(blockerPath, 'not a directory')
    relay = await startRuntimeRelayServer({
      host: '127.0.0.1',
      port: 0,
      statePath,
      log: (message) => logs.push(message)
    })
    const serverId = 'serverPersistFail1'

    await expect(
      openRelaySocket(relay.webSocketUrl, {
        role: 'server',
        serverId,
        token: 'm'.repeat(43),
        enrollmentToken: relay.enrollmentToken
      })
    ).rejects.toThrow()

    unlinkSync(blockerPath)
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token: 'n'.repeat(43),
      enrollmentToken: relay.enrollmentToken
    })

    expect(logs.some((message) => message.includes('failed to persist host binding'))).toBe(true)
    control.close()
  })

  it('closes a connection instead of buffering indefinitely when forwarding stalls', async () => {
    relay = await startTestRelay({ maxForwardBufferedBytes: 0 })
    const serverId = 'serverBackpressure1'
    const token = 'd'.repeat(43)
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      enrollmentToken: relay.enrollmentToken
    })
    const connectedControl = waitForControlMessage(control, 'connected')
    const client = await openRelaySocket(relay.webSocketUrl, { role: 'client', serverId })
    const connectedMessage = (await connectedControl) as {
      type: string
      connectionId: string
    }
    const serverData = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      connectionId: connectedMessage.connectionId
    })

    const clientClosed = waitForClose(client)
    client.send('client-frame')

    await expect(clientClosed).resolves.toMatchObject({
      code: 1013,
      reason: 'Relay forward buffer full'
    })

    control.close()
    serverData.close()
  })

  it('closes before enqueueing a frame that would exceed the forward buffer cap', async () => {
    relay = await startTestRelay({ maxForwardBufferedBytes: 4 })
    const serverId = 'serverFrameCap0001'
    const token = 'k'.repeat(43)
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      enrollmentToken: relay.enrollmentToken
    })
    const connectedControl = waitForControlMessage(control, 'connected')
    const client = await openRelaySocket(relay.webSocketUrl, { role: 'client', serverId })
    const connectedMessage = (await connectedControl) as {
      type: string
      connectionId: string
    }
    const serverData = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      connectionId: connectedMessage.connectionId
    })

    const clientClosed = waitForClose(client)
    client.send('12345')

    await expect(clientClosed).resolves.toMatchObject({
      code: 1013,
      reason: 'Relay forward buffer full'
    })

    control.close()
    serverData.close()
  })

  it('force-terminates relay sockets that do not finish shutdown close', async () => {
    relay = await startTestRelay({ shutdownGraceMs: 10 })
    const rawSocket = await openRawRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId: 'serverShutdown001',
      token: 'l'.repeat(43),
      enrollmentToken: relay.enrollmentToken
    })
    const rawSocketClosed = waitForRawSocketClose(rawSocket)

    const stopPromise = relay.stop()
    relay = null

    await expect(Promise.race([stopPromise.then(() => 'stopped'), delay(500)])).resolves.toBe(
      'stopped'
    )
    await expect(rawSocketClosed).resolves.toBeUndefined()
  })
})

type TestRelayOptions = {
  host?: string
  maxForwardBufferedBytes?: number
  shutdownGraceMs?: number
}

async function startTestRelay(options: TestRelayOptions = {}): Promise<RuntimeRelayServer> {
  tempDir = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-'))
  return startRuntimeRelayServer({
    host: options.host ?? '127.0.0.1',
    port: 0,
    statePath: join(tempDir, 'relay-state.json'),
    maxForwardBufferedBytes: options.maxForwardBufferedBytes,
    shutdownGraceMs: options.shutdownGraceMs
  })
}
