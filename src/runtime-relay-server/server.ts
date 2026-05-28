/* eslint-disable max-lines -- Why: the relay server keeps the HTTP upgrade, host binding, and socket-forwarding lifecycle in one protocol module so invariants are visible together. */
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { createServer, type Server as HttpServer } from 'http'
import { isIP } from 'net'
import { dirname, join } from 'path'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import {
  RUNTIME_RELAY_ATTACH_DEADLINE_MS,
  RUNTIME_RELAY_DEFAULT_PORT,
  RUNTIME_RELAY_HEARTBEAT_INTERVAL_MS,
  RUNTIME_RELAY_MAX_ACTIVE_DATA_SOCKETS_PER_SERVER,
  RUNTIME_RELAY_MAX_CONTROL_BUFFERED_BYTES,
  RUNTIME_RELAY_MAX_BOUND_SERVERS,
  RUNTIME_RELAY_MAX_EARLY_BYTES_PER_CONNECTION,
  RUNTIME_RELAY_MAX_EARLY_FRAMES_PER_CONNECTION,
  RUNTIME_RELAY_MAX_FORWARD_BUFFERED_BYTES,
  RUNTIME_RELAY_MAX_FRAME_BYTES,
  RUNTIME_RELAY_MAX_GLOBAL_ACTIVE_DATA_SOCKETS,
  RUNTIME_RELAY_MAX_GLOBAL_EARLY_BYTES,
  RUNTIME_RELAY_MAX_GLOBAL_PENDING_CLIENTS,
  RUNTIME_RELAY_MAX_PENDING_CLIENTS_PER_SERVER,
  RUNTIME_RELAY_MAX_TOTAL_EARLY_BYTES_PER_SERVER,
  RUNTIME_RELAY_PROTOCOL_VERSION,
  RUNTIME_RELAY_STALE_SOCKET_TIMEOUT_MS,
  RUNTIME_RELAY_WS_PATH,
  createRelayEnrollmentToken,
  createRelayConnectionId,
  isRuntimeRelayHostTokenHash,
  isRuntimeRelayServerId,
  parseRuntimeRelayRequest,
  type RelayControlMessage
} from './protocol'

type RuntimeRelayServerOptions = {
  host?: string
  port?: number
  statePath?: string
  log?: (message: string) => void
  maxForwardBufferedBytes?: number
  enrollmentToken?: string
  maxGlobalPendingClients?: number
  maxGlobalActiveDataSockets?: number
  maxGlobalEarlyBytes?: number
  maxTotalForwardBufferedBytesPerServer?: number
  maxGlobalForwardBufferedBytes?: number
  maxControlBufferedBytes?: number
  heartbeatIntervalMs?: number
  staleSocketTimeoutMs?: number
  shutdownGraceMs?: number
}

export type RuntimeRelayServer = {
  httpUrl: string
  webSocketUrl: string
  enrollmentToken: string
  protocolVersion: number
  stop: () => Promise<void>
}

type RelayHostState = {
  control: WebSocket | null
  pendingClients: Map<string, RelayConnectionState>
  serverDataSockets: Map<string, WebSocket>
  totalBufferedBytes: number
  forwardedBufferedBytes: number
}

type RelayServerState = {
  hosts: Map<string, RelayHostState>
  hostTokenHashes: Map<string, string>
  statePath: string
  globalPendingClients: number
  globalActiveDataSockets: number
  globalEarlyBytes: number
  globalForwardedBytes: number
  limits: RelayServerLimits
}

type RelayConnectionState = {
  connectionId: string
  client: WebSocket
  server: WebSocket | null
  earlyFrames: { data: RawData; isBinary: boolean; byteLength: number }[]
  bufferedBytes: number
  forwardedBufferedBytes: number
  pendingForwardedFrames: Map<number, { target: WebSocket; byteLength: number }>
  forwardedCloseHandlers: Map<WebSocket, () => void>
  nextForwardedFrameId: number
  attachTimer: ReturnType<typeof setTimeout>
}

type RelayStateFile = {
  hostTokenHashes?: Record<string, string>
}

type RelayServerLimits = {
  maxForwardBufferedBytes: number
  maxGlobalPendingClients: number
  maxGlobalActiveDataSockets: number
  maxGlobalEarlyBytes: number
  maxTotalForwardBufferedBytesPerServer: number
  maxGlobalForwardBufferedBytes: number
  maxControlBufferedBytes: number
  staleSocketTimeoutMs: number
  shutdownGraceMs: number
}

type RelayHeartbeatSocket = WebSocket & {
  lastPongAt?: number
}

const DEFAULT_RELAY_STATE_PATH = join(process.cwd(), '.orca-runtime-relay-state.json')
const DEFAULT_SHUTDOWN_GRACE_MS = 1_000

export async function startRuntimeRelayServer(
  options: RuntimeRelayServerOptions = {}
): Promise<RuntimeRelayServer> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? RUNTIME_RELAY_DEFAULT_PORT
  const statePath = options.statePath ?? DEFAULT_RELAY_STATE_PATH
  const log = options.log ?? (() => {})
  const limits: RelayServerLimits = {
    maxForwardBufferedBytes:
      options.maxForwardBufferedBytes ?? RUNTIME_RELAY_MAX_FORWARD_BUFFERED_BYTES,
    maxGlobalPendingClients:
      options.maxGlobalPendingClients ?? RUNTIME_RELAY_MAX_GLOBAL_PENDING_CLIENTS,
    maxGlobalActiveDataSockets:
      options.maxGlobalActiveDataSockets ?? RUNTIME_RELAY_MAX_GLOBAL_ACTIVE_DATA_SOCKETS,
    maxGlobalEarlyBytes: options.maxGlobalEarlyBytes ?? RUNTIME_RELAY_MAX_GLOBAL_EARLY_BYTES,
    maxTotalForwardBufferedBytesPerServer:
      options.maxTotalForwardBufferedBytesPerServer ??
      RUNTIME_RELAY_MAX_ACTIVE_DATA_SOCKETS_PER_SERVER * RUNTIME_RELAY_MAX_FORWARD_BUFFERED_BYTES,
    maxGlobalForwardBufferedBytes:
      options.maxGlobalForwardBufferedBytes ??
      (options.maxGlobalActiveDataSockets ?? RUNTIME_RELAY_MAX_GLOBAL_ACTIVE_DATA_SOCKETS) *
        RUNTIME_RELAY_MAX_FORWARD_BUFFERED_BYTES,
    maxControlBufferedBytes:
      options.maxControlBufferedBytes ?? RUNTIME_RELAY_MAX_CONTROL_BUFFERED_BYTES,
    staleSocketTimeoutMs: options.staleSocketTimeoutMs ?? RUNTIME_RELAY_STALE_SOCKET_TIMEOUT_MS,
    shutdownGraceMs: options.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS
  }
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? RUNTIME_RELAY_HEARTBEAT_INTERVAL_MS
  const enrollmentToken = options.enrollmentToken ?? createRelayEnrollmentToken()
  const state: RelayServerState = {
    hosts: new Map(),
    hostTokenHashes: loadRelayBindings(statePath),
    statePath,
    globalPendingClients: 0,
    globalActiveDataSockets: 0,
    globalEarlyBytes: 0,
    globalForwardedBytes: 0,
    limits
  }
  const httpServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, kind: 'runtime_relay_server' }))
      return
    }
    response.writeHead(404)
    response.end('not found')
  })
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: RUNTIME_RELAY_MAX_FRAME_BYTES
  })

  httpServer.on('upgrade', (request, socket, head) => {
    const parsed = parseRuntimeRelayRequest(request)
    if (!parsed.ok) {
      socket.write(`HTTP/1.1 ${parsed.statusCode} ${parsed.reason}\r\n\r\n`)
      socket.destroy()
      return
    }
    if (parsed.value.role === 'server') {
      const accepted = acceptHostToken(
        state,
        parsed.value.serverId,
        parsed.value.hostToken,
        parsed.value.connectionId === null,
        parsed.value.enrollmentToken,
        enrollmentToken,
        log
      )
      if (!accepted) {
        socket.write('HTTP/1.1 401 invalid_host_token\r\n\r\n')
        socket.destroy()
        return
      }
    } else if (!state.hostTokenHashes.has(parsed.value.serverId)) {
      socket.write('HTTP/1.1 404 unknown_server\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      markSocketAlive(ws)
      ws.on('pong', () => markSocketAlive(ws))
      if (parsed.value.role === 'server') {
        if (parsed.value.connectionId === null) {
          attachControlSocket(state, parsed.value.serverId, ws, log)
        } else {
          attachServerDataSocket(state, parsed.value.serverId, parsed.value.connectionId, ws, log)
        }
        return
      }
      attachClientSocket(state, parsed.value.serverId, ws, log)
    })
  })

  const heartbeatTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        if (isSocketStale(client, limits.staleSocketTimeoutMs)) {
          client.terminate()
          continue
        }
        client.ping()
      }
    }
  }, heartbeatIntervalMs)
  if (typeof heartbeatTimer.unref === 'function') {
    heartbeatTimer.unref()
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, host, () => {
      httpServer.off('error', reject)
      resolve()
    })
  })

  const resolved = httpServer.address()
  const resolvedPort = typeof resolved === 'object' && resolved ? resolved.port : port
  const urlHost = formatRelayUrlHost(host)
  return {
    httpUrl: `http://${urlHost}:${resolvedPort}`,
    webSocketUrl: `ws://${urlHost}:${resolvedPort}${RUNTIME_RELAY_WS_PATH}`,
    enrollmentToken,
    protocolVersion: RUNTIME_RELAY_PROTOCOL_VERSION,
    stop: async () => {
      clearInterval(heartbeatTimer)
      await Promise.all([
        closeWebSocketServer(wss, limits.shutdownGraceMs),
        closeHttpServer(httpServer)
      ])
    }
  }
}

function attachControlSocket(
  state: RelayServerState,
  serverId: string,
  ws: WebSocket,
  log: (message: string) => void
): void {
  const host = getHostState(state.hosts, serverId)
  host.control?.close(1012, 'Control socket replaced')
  host.control = ws
  if (
    !sendControl(ws, {
      message: { type: 'sync', connectionIds: Array.from(host.pendingClients.keys()) },
      maxBufferedBytes: state.limits.maxControlBufferedBytes
    })
  ) {
    failControlSocket(state, host, ws, 1013, 'Relay control buffer full')
    return
  }
  log(`[runtime-relay] control connected serverId=${serverId}`)
  const cleanupControl = () => {
    if (host.control === ws) {
      host.control = null
      for (const connectionId of Array.from(host.pendingClients.keys())) {
        closeConnection(state, host, connectionId, 1011, 'Host control disconnected')
      }
    }
  }
  ws.on('close', cleanupControl)
  ws.on('error', cleanupControl)
}

function attachClientSocket(
  state: RelayServerState,
  serverId: string,
  ws: WebSocket,
  log: (message: string) => void
): void {
  const host = getHostState(state.hosts, serverId)
  if (
    !host.control ||
    host.pendingClients.size >= RUNTIME_RELAY_MAX_PENDING_CLIENTS_PER_SERVER ||
    state.globalPendingClients >= state.limits.maxGlobalPendingClients
  ) {
    ws.close(1013, 'Relay unavailable')
    return
  }
  const connectionId = createRelayConnectionId()
  const attachTimer = setTimeout(() => {
    closeConnection(state, host, connectionId, 1013, 'Host data attach timeout')
  }, RUNTIME_RELAY_ATTACH_DEADLINE_MS)
  if (typeof attachTimer.unref === 'function') {
    attachTimer.unref()
  }
  const connection: RelayConnectionState = {
    connectionId,
    client: ws,
    server: null,
    earlyFrames: [],
    bufferedBytes: 0,
    forwardedBufferedBytes: 0,
    pendingForwardedFrames: new Map(),
    forwardedCloseHandlers: new Map(),
    nextForwardedFrameId: 0,
    attachTimer
  }
  host.pendingClients.set(connectionId, connection)
  state.globalPendingClients += 1
  if (
    !sendControl(host.control, {
      message: { type: 'connected', connectionId },
      maxBufferedBytes: state.limits.maxControlBufferedBytes
    })
  ) {
    failControlSocket(state, host, host.control, 1013, 'Relay control buffer full')
    return
  }
  log(`[runtime-relay] client connected serverId=${serverId} connectionId=${connectionId}`)
  ws.on('message', (data, isBinary) => forwardClientFrame(state, host, connection, data, isBinary))
  ws.on('close', () => closeConnection(state, host, connectionId, 1000, 'Client disconnected'))
  ws.on('error', () => closeConnection(state, host, connectionId, 1011, 'Client socket error'))
}

function attachServerDataSocket(
  state: RelayServerState,
  serverId: string,
  connectionId: string,
  ws: WebSocket,
  log: (message: string) => void
): void {
  const host = getHostState(state.hosts, serverId)
  const connection = host.pendingClients.get(connectionId)
  const hadServerDataSocket = host.serverDataSockets.has(connectionId)
  if (
    !connection ||
    (!hadServerDataSocket &&
      (host.serverDataSockets.size >= RUNTIME_RELAY_MAX_ACTIVE_DATA_SOCKETS_PER_SERVER ||
        state.globalActiveDataSockets >= state.limits.maxGlobalActiveDataSockets))
  ) {
    ws.close(1008, 'Unknown relay connection')
    return
  }
  connection.server?.close(1012, 'Server data socket replaced')
  connection.server = ws
  host.serverDataSockets.set(connectionId, ws)
  if (!hadServerDataSocket) {
    state.globalActiveDataSockets += 1
  }
  clearTimeout(connection.attachTimer)
  for (const frame of connection.earlyFrames.splice(0)) {
    if (!forwardFrame(state, host, connection, ws, frame.data, frame.isBinary)) {
      closeConnection(state, host, connectionId, 1013, 'Relay forward buffer full')
      return
    }
    host.totalBufferedBytes = Math.max(0, host.totalBufferedBytes - frame.byteLength)
    state.globalEarlyBytes = Math.max(0, state.globalEarlyBytes - frame.byteLength)
    connection.bufferedBytes = Math.max(0, connection.bufferedBytes - frame.byteLength)
  }
  connection.bufferedBytes = 0
  log(`[runtime-relay] server data connected serverId=${serverId} connectionId=${connectionId}`)
  ws.on('message', (data, isBinary) => {
    if (connection.client.readyState === connection.client.OPEN) {
      if (!forwardFrame(state, host, connection, connection.client, data, isBinary)) {
        closeConnection(state, host, connectionId, 1013, 'Relay forward buffer full')
      }
    }
  })
  ws.on('close', () => {
    if (connection.server === ws) {
      closeConnection(state, host, connectionId, 1011, 'Host data disconnected')
    }
  })
  ws.on('error', () => {
    if (connection.server === ws) {
      closeConnection(state, host, connectionId, 1011, 'Host data socket error')
    }
  })
}

function forwardClientFrame(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState,
  data: RawData,
  isBinary: boolean
): void {
  const server = connection.server
  if (server && server.readyState === WebSocket.OPEN) {
    if (!forwardFrame(state, host, connection, server, data, isBinary)) {
      closeConnection(state, host, connection.connectionId, 1013, 'Relay forward buffer full')
    }
    return
  }
  const byteLength = relayFrameByteLength(data)
  if (
    connection.earlyFrames.length >= RUNTIME_RELAY_MAX_EARLY_FRAMES_PER_CONNECTION ||
    connection.bufferedBytes + byteLength > RUNTIME_RELAY_MAX_EARLY_BYTES_PER_CONNECTION ||
    host.totalBufferedBytes + byteLength > RUNTIME_RELAY_MAX_TOTAL_EARLY_BYTES_PER_SERVER ||
    state.globalEarlyBytes + byteLength > state.limits.maxGlobalEarlyBytes
  ) {
    closeConnection(state, host, connection.connectionId, 1013, 'Relay early buffer full')
    return
  }
  connection.earlyFrames.push({ data, isBinary, byteLength })
  connection.bufferedBytes += byteLength
  host.totalBufferedBytes += byteLength
  state.globalEarlyBytes += byteLength
}

function closeConnection(
  state: RelayServerState,
  host: RelayHostState,
  connectionId: string,
  code: number,
  reason: string
): void {
  const connection = host.pendingClients.get(connectionId)
  if (!connection) {
    return
  }
  releaseAllForwardedFrames(state, host, connection)
  host.pendingClients.delete(connectionId)
  state.globalPendingClients = Math.max(0, state.globalPendingClients - 1)
  if (host.serverDataSockets.delete(connectionId)) {
    state.globalActiveDataSockets = Math.max(0, state.globalActiveDataSockets - 1)
  }
  clearTimeout(connection.attachTimer)
  host.totalBufferedBytes = Math.max(0, host.totalBufferedBytes - connection.bufferedBytes)
  state.globalEarlyBytes = Math.max(0, state.globalEarlyBytes - connection.bufferedBytes)
  connection.client.close(code, reason)
  connection.server?.close(code, reason)
  const control = host.control
  if (control && control.readyState === WebSocket.OPEN) {
    if (
      !sendControl(control, {
        message: { type: 'disconnected', connectionId },
        maxBufferedBytes: state.limits.maxControlBufferedBytes
      })
    ) {
      failControlSocket(state, host, control, 1013, 'Relay control buffer full')
    }
  }
}

function markSocketAlive(ws: WebSocket): void {
  ;(ws as RelayHeartbeatSocket).lastPongAt = Date.now()
}

function isSocketStale(ws: WebSocket, staleSocketTimeoutMs: number): boolean {
  const lastPongAt = (ws as RelayHeartbeatSocket).lastPongAt
  return typeof lastPongAt === 'number' && Date.now() - lastPongAt > staleSocketTimeoutMs
}

function getHostState(hosts: Map<string, RelayHostState>, serverId: string): RelayHostState {
  let host = hosts.get(serverId)
  if (!host) {
    host = {
      control: null,
      pendingClients: new Map(),
      serverDataSockets: new Map(),
      totalBufferedBytes: 0,
      forwardedBufferedBytes: 0
    }
    hosts.set(serverId, host)
  }
  return host
}

function sendControl(
  ws: WebSocket,
  options: { message: RelayControlMessage; maxBufferedBytes: number }
): boolean {
  if (ws.readyState !== ws.OPEN) {
    return false
  }
  const payload = JSON.stringify(options.message)
  const byteLength = Buffer.byteLength(payload)
  if (ws.bufferedAmount + byteLength > options.maxBufferedBytes) {
    return false
  }
  try {
    ws.send(payload)
    return true
  } catch {
    return false
  }
}

function failControlSocket(
  state: RelayServerState,
  host: RelayHostState,
  ws: WebSocket,
  code: number,
  reason: string
): void {
  if (host.control === ws) {
    // Clear first so fail-closed connection cleanup cannot enqueue more control frames.
    host.control = null
    for (const connectionId of Array.from(host.pendingClients.keys())) {
      closeConnection(state, host, connectionId, code, reason)
    }
  }
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close(code, reason)
  }
}

function forwardFrame(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState,
  target: WebSocket,
  data: RawData,
  isBinary: boolean
): boolean {
  const byteLength = relayFrameByteLength(data)
  if (
    target.bufferedAmount + byteLength > state.limits.maxForwardBufferedBytes ||
    connection.forwardedBufferedBytes + byteLength > state.limits.maxForwardBufferedBytes ||
    host.forwardedBufferedBytes + byteLength > state.limits.maxTotalForwardBufferedBytesPerServer ||
    state.globalForwardedBytes + byteLength > state.limits.maxGlobalForwardBufferedBytes
  ) {
    return false
  }
  const frameId = trackForwardedFrame(state, host, connection, target, byteLength)
  try {
    target.send(data, { binary: isBinary }, () => {
      releaseForwardedFrame(state, host, connection, frameId)
    })
  } catch {
    releaseForwardedFrame(state, host, connection, frameId)
    return false
  }
  return true
}

function trackForwardedFrame(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState,
  target: WebSocket,
  byteLength: number
): number {
  const frameId = connection.nextForwardedFrameId
  connection.nextForwardedFrameId += 1
  connection.pendingForwardedFrames.set(frameId, { target, byteLength })
  connection.forwardedBufferedBytes += byteLength
  host.forwardedBufferedBytes += byteLength
  state.globalForwardedBytes += byteLength
  ensureForwardedSocketCloseHandler(state, host, connection, target)
  return frameId
}

function ensureForwardedSocketCloseHandler(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState,
  target: WebSocket
): void {
  if (connection.forwardedCloseHandlers.has(target)) {
    return
  }
  const releaseTargetFrames = () => {
    releaseForwardedFramesForSocket(state, host, connection, target)
  }
  connection.forwardedCloseHandlers.set(target, releaseTargetFrames)
  target.once('close', releaseTargetFrames)
}

function releaseForwardedFrame(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState,
  frameId: number
): void {
  const frame = connection.pendingForwardedFrames.get(frameId)
  if (!frame) {
    return
  }
  connection.pendingForwardedFrames.delete(frameId)
  subtractForwardedBytes(state, host, connection, frame.byteLength)
  clearForwardedSocketCloseHandlerIfIdle(connection, frame.target)
}

function releaseForwardedFramesForSocket(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState,
  target: WebSocket
): void {
  for (const [frameId, frame] of connection.pendingForwardedFrames) {
    if (frame.target === target) {
      connection.pendingForwardedFrames.delete(frameId)
      subtractForwardedBytes(state, host, connection, frame.byteLength)
    }
  }
  clearForwardedSocketCloseHandler(connection, target)
}

function releaseAllForwardedFrames(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState
): void {
  for (const frame of connection.pendingForwardedFrames.values()) {
    subtractForwardedBytes(state, host, connection, frame.byteLength)
  }
  connection.pendingForwardedFrames.clear()
  for (const [target, releaseTargetFrames] of connection.forwardedCloseHandlers) {
    target.off('close', releaseTargetFrames)
  }
  connection.forwardedCloseHandlers.clear()
}

function subtractForwardedBytes(
  state: RelayServerState,
  host: RelayHostState,
  connection: RelayConnectionState,
  byteLength: number
): void {
  connection.forwardedBufferedBytes = Math.max(0, connection.forwardedBufferedBytes - byteLength)
  host.forwardedBufferedBytes = Math.max(0, host.forwardedBufferedBytes - byteLength)
  state.globalForwardedBytes = Math.max(0, state.globalForwardedBytes - byteLength)
}

function clearForwardedSocketCloseHandlerIfIdle(
  connection: RelayConnectionState,
  target: WebSocket
): void {
  for (const frame of connection.pendingForwardedFrames.values()) {
    if (frame.target === target) {
      return
    }
  }
  clearForwardedSocketCloseHandler(connection, target)
}

function clearForwardedSocketCloseHandler(
  connection: RelayConnectionState,
  target: WebSocket
): void {
  const releaseTargetFrames = connection.forwardedCloseHandlers.get(target)
  if (!releaseTargetFrames) {
    return
  }
  target.off('close', releaseTargetFrames)
  connection.forwardedCloseHandlers.delete(target)
}

function relayFrameByteLength(data: RawData): number {
  if (typeof data === 'string') {
    return Buffer.byteLength(data)
  }
  if (Array.isArray(data)) {
    return data.reduce((sum, buffer) => sum + buffer.byteLength, 0)
  }
  return data.byteLength
}

function acceptHostToken(
  state: RelayServerState,
  serverId: string,
  hostToken: string,
  allowEnroll: boolean,
  providedEnrollmentToken: string | null,
  enrollmentToken: string,
  log: (message: string) => void
): boolean {
  const hash = hashHostToken(hostToken)
  const existing = state.hostTokenHashes.get(serverId)
  if (existing) {
    return existing === hash
  }
  if (
    !allowEnroll ||
    providedEnrollmentToken !== enrollmentToken ||
    state.hostTokenHashes.size >= RUNTIME_RELAY_MAX_BOUND_SERVERS
  ) {
    return false
  }
  state.hostTokenHashes.set(serverId, hash)
  try {
    writeRelayBindings(state.statePath, state.hostTokenHashes)
  } catch (error) {
    // Failed first enrollment must not pin an in-memory token that was never persisted.
    state.hostTokenHashes.delete(serverId)
    log(
      `[runtime-relay] failed to persist host binding serverId=${serverId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return false
  }
  return true
}

function hashHostToken(hostToken: string): string {
  return createHash('sha256').update(hostToken).digest('hex')
}

function loadRelayBindings(statePath: string): Map<string, string> {
  if (!existsSync(statePath)) {
    return new Map()
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as RelayStateFile
    if (!isPlainRecord(parsed)) {
      throw new Error('relay state must be an object')
    }
    const hostTokenHashes = parsed.hostTokenHashes ?? {}
    if (!isPlainRecord(hostTokenHashes)) {
      throw new Error('hostTokenHashes must be an object')
    }
    const entries = Object.entries(hostTokenHashes)
    for (const [serverId, hash] of entries) {
      if (!isRuntimeRelayServerId(serverId) || !isRuntimeRelayHostTokenHash(hash)) {
        throw new Error('hostTokenHashes contains an invalid binding')
      }
    }
    return new Map(entries)
  } catch (error) {
    throw new Error(
      `Failed to read runtime relay state at ${statePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function writeRelayBindings(statePath: string, bindings: Map<string, string>): void {
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(
    statePath,
    JSON.stringify({ hostTokenHashes: Object.fromEntries(bindings) }, null, 2),
    { mode: 0o600 }
  )
}

function formatRelayUrlHost(host: string): string {
  return isIP(host) === 6 ? `[${host}]` : host
}

function closeWebSocketServer(wss: WebSocketServer, shutdownGraceMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const forceCloseTimer = setTimeout(() => {
      for (const client of wss.clients) {
        if (client.readyState !== WebSocket.CLOSED) {
          client.terminate()
        }
      }
    }, shutdownGraceMs)

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1001, 'Relay shutting down')
      } else if (client.readyState !== WebSocket.CLOSED) {
        client.terminate()
      }
    }

    wss.close((error) => {
      clearTimeout(forceCloseTimer)
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function closeHttpServer(httpServer: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
