import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { type RawData } from 'ws'
import { startRuntimeRelayServer, type RuntimeRelayServer } from './server'

const OPEN_TIMEOUT_MS = 1_000

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

describe('runtime relay server limits', () => {
  it('enforces the relay-wide pending client cap', async () => {
    relay = await startTestRelay({ maxGlobalPendingClients: 1 })
    const serverId = 'serverGlobalPend01'
    const token = 'f'.repeat(43)
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      enrollmentToken: relay.enrollmentToken
    })
    const firstClient = await openRelaySocket(relay.webSocketUrl, { role: 'client', serverId })
    const secondClient = await openRelaySocket(relay.webSocketUrl, { role: 'client', serverId })

    await expect(waitForClose(secondClient)).resolves.toMatchObject({
      code: 1013,
      reason: 'Relay unavailable'
    })

    control.close()
    firstClient.close()
  })

  it('fails closed when a control message would exceed the control buffer cap', async () => {
    relay = await startTestRelay({ maxControlBufferedBytes: 48 })
    const serverId = 'serverControlCap01'
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token: 'o'.repeat(43),
      enrollmentToken: relay.enrollmentToken
    })
    const controlClosed = waitForClose(control)
    const client = await openRelaySocket(relay.webSocketUrl, { role: 'client', serverId })
    const clientClosed = waitForClose(client)

    await expect(clientClosed).resolves.toMatchObject({
      code: 1013,
      reason: 'Relay control buffer full'
    })
    await expect(controlClosed).resolves.toMatchObject({
      code: 1013,
      reason: 'Relay control buffer full'
    })
  })

  it('enforces the relay-wide active data socket cap', async () => {
    relay = await startTestRelay({ maxGlobalActiveDataSockets: 1 })
    const firstServerId = 'serverGlobalData01'
    const secondServerId = 'serverGlobalData02'
    const firstToken = 'g'.repeat(43)
    const secondToken = 'h'.repeat(43)
    const firstControl = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId: firstServerId,
      token: firstToken,
      enrollmentToken: relay.enrollmentToken
    })
    const firstConnected = waitForControlMessage(firstControl, 'connected')
    const firstClient = await openRelaySocket(relay.webSocketUrl, {
      role: 'client',
      serverId: firstServerId
    })
    const firstConnection = await firstConnected
    const firstServerData = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId: firstServerId,
      token: firstToken,
      connectionId: firstConnection.connectionId
    })

    const secondControl = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId: secondServerId,
      token: secondToken,
      enrollmentToken: relay.enrollmentToken
    })
    const secondConnected = waitForControlMessage(secondControl, 'connected')
    const secondClient = await openRelaySocket(relay.webSocketUrl, {
      role: 'client',
      serverId: secondServerId
    })
    const secondConnection = await secondConnected
    const secondServerData = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId: secondServerId,
      token: secondToken,
      connectionId: secondConnection.connectionId
    })

    await expect(waitForClose(secondServerData)).resolves.toMatchObject({
      code: 1008,
      reason: 'Unknown relay connection'
    })

    firstControl.close()
    firstClient.close()
    firstServerData.close()
    secondControl.close()
    secondClient.close()
  })

  it('enforces the relay-wide early frame byte cap', async () => {
    relay = await startTestRelay({ maxGlobalEarlyBytes: 4 })
    const serverId = 'serverGlobalEarly01'
    const token = 'i'.repeat(43)
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId,
      token,
      enrollmentToken: relay.enrollmentToken
    })
    const client = await openRelaySocket(relay.webSocketUrl, { role: 'client', serverId })
    const closed = waitForClose(client)

    client.send('12345')

    await expect(closed).resolves.toMatchObject({
      code: 1013,
      reason: 'Relay early buffer full'
    })

    control.close()
  })

  it('terminates sockets that miss relay heartbeat liveness checks', async () => {
    relay = await startTestRelay({ heartbeatIntervalMs: 5, staleSocketTimeoutMs: 0 })
    const control = await openRelaySocket(relay.webSocketUrl, {
      role: 'server',
      serverId: 'serverHeartbeat01',
      token: 'j'.repeat(43),
      enrollmentToken: relay.enrollmentToken
    })

    await expect(waitForClose(control)).resolves.toMatchObject({
      code: 1006,
      reason: ''
    })
  })
})

type TestRelayOptions = {
  maxGlobalPendingClients?: number
  maxGlobalActiveDataSockets?: number
  maxGlobalEarlyBytes?: number
  maxControlBufferedBytes?: number
  heartbeatIntervalMs?: number
  staleSocketTimeoutMs?: number
}

async function startTestRelay(options: TestRelayOptions = {}): Promise<RuntimeRelayServer> {
  tempDir = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-'))
  return startRuntimeRelayServer({
    host: '127.0.0.1',
    port: 0,
    statePath: join(tempDir, 'relay-state.json'),
    maxGlobalPendingClients: options.maxGlobalPendingClients,
    maxGlobalActiveDataSockets: options.maxGlobalActiveDataSockets,
    maxGlobalEarlyBytes: options.maxGlobalEarlyBytes,
    maxControlBufferedBytes: options.maxControlBufferedBytes,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    staleSocketTimeoutMs: options.staleSocketTimeoutMs
  })
}

function openRelaySocket(
  baseUrl: string,
  options:
    | { role: 'client'; serverId: string }
    | {
        role: 'server'
        serverId: string
        token: string
        connectionId?: string
        enrollmentToken?: string
      }
): Promise<WebSocket> {
  const url = new URL(baseUrl)
  url.searchParams.set('role', options.role)
  url.searchParams.set('serverId', options.serverId)
  url.searchParams.set('v', '1')
  if (options.role === 'server' && options.connectionId) {
    url.searchParams.set('connectionId', options.connectionId)
  }
  const ws = new WebSocket(url, {
    headers:
      options.role === 'server'
        ? {
            Authorization: `Bearer ${options.token}`,
            ...(options.enrollmentToken
              ? { 'X-Orca-Relay-Enrollment': options.enrollmentToken }
              : {})
          }
        : undefined
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('Timed out opening relay socket'))
    }, OPEN_TIMEOUT_MS)
    ws.once('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    ws.once('close', () => {
      clearTimeout(timer)
      reject(new Error('Relay socket closed before open'))
    })
  })
}

function waitForControlMessage(
  ws: WebSocket,
  type: string
): Promise<{ type: string; connectionId: string }> {
  return new Promise((resolve) => {
    const onMessage = (data: RawData) => {
      const parsed = JSON.parse(data.toString()) as { type: string; connectionId: string }
      if (parsed.type !== type) {
        return
      }
      ws.off('message', onMessage)
      resolve(parsed)
    }
    ws.on('message', onMessage)
  })
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for relay socket close'))
    }, OPEN_TIMEOUT_MS)
    ws.once('close', (code, reason) => {
      clearTimeout(timer)
      resolve({ code, reason: reason.toString() })
    })
  })
}
