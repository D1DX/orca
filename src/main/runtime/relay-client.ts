/* eslint-disable max-lines -- Why: the host relay client is one socket lifecycle state machine; splitting control/data cleanup would obscure stale-socket guards. */
import WebSocket from 'ws'
import { RUNTIME_RELAY_MAX_FRAME_BYTES } from '../../shared/runtime-relay-limits'
import type { RuntimeRelayIdentity } from './relay-identity'

export type RuntimeRelayConfig = {
  enabled: boolean
  endpoint: string
}

export type RuntimeRelayStatus =
  | { state: 'disabled'; activeDataSockets: 0; error: null }
  | { state: 'connecting'; activeDataSockets: number; error: string | null }
  | { state: 'connected'; activeDataSockets: number; error: null }
  | { state: 'error'; activeDataSockets: number; error: string }

type RuntimeRelayClientOptions = {
  config: RuntimeRelayConfig
  identity: RuntimeRelayIdentity
  attachDataSocket: (ws: WebSocket, onAuthenticated: () => void) => void
  onStatusChange?: (status: RuntimeRelayStatus) => void
  reconnectBaseMs?: number
  maxDataSockets?: number
  maxSyncIds?: number
  dataAttachDeadlineMs?: number
}

type RelayControlMessage =
  | { type: 'sync'; connectionIds: string[] }
  | { type: 'connected'; connectionId: string }
  | { type: 'disconnected'; connectionId: string }

const DEFAULT_RECONNECT_BASE_MS = 1_000
const DEFAULT_MAX_DATA_SOCKETS = 32
const DEFAULT_DATA_ATTACH_DEADLINE_MS = 15_000
const CONNECTION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/

export class RuntimeRelayClient {
  private config: RuntimeRelayConfig
  private readonly identity: RuntimeRelayIdentity
  private readonly attachDataSocket: (ws: WebSocket, onAuthenticated: () => void) => void
  private readonly onStatusChange: ((status: RuntimeRelayStatus) => void) | undefined
  private readonly reconnectBaseMs: number
  private readonly maxDataSockets: number
  private readonly maxSyncIds: number
  private readonly dataAttachDeadlineMs: number
  private control: WebSocket | null = null
  private stopped = true
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private dataSockets = new Map<string, WebSocket>()
  private dataAttachTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private status: RuntimeRelayStatus = { state: 'disabled', activeDataSockets: 0, error: null }

  constructor(options: RuntimeRelayClientOptions) {
    this.config = options.config
    this.identity = options.identity
    this.attachDataSocket = options.attachDataSocket
    this.onStatusChange = options.onStatusChange
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS
    this.maxDataSockets = options.maxDataSockets ?? DEFAULT_MAX_DATA_SOCKETS
    this.maxSyncIds = options.maxSyncIds ?? this.maxDataSockets
    this.dataAttachDeadlineMs = options.dataAttachDeadlineMs ?? DEFAULT_DATA_ATTACH_DEADLINE_MS
  }

  start(): void {
    this.stopped = false
    if (!this.config.enabled) {
      this.setStatus({ state: 'disabled', activeDataSockets: 0, error: null })
      return
    }
    this.connectControl()
  }

  stop(): void {
    this.stopped = true
    this.clearReconnectTimer()
    this.control?.close(1000, 'Relay client stopped')
    this.control = null
    for (const ws of this.dataSockets.values()) {
      ws.close(1000, 'Relay client stopped')
    }
    this.dataSockets.clear()
    for (const timer of this.dataAttachTimers.values()) {
      clearTimeout(timer)
    }
    this.dataAttachTimers.clear()
    this.setStatus({ state: 'disabled', activeDataSockets: 0, error: null })
  }

  updateConfig(config: RuntimeRelayConfig): void {
    this.config = config
    this.stop()
    this.start()
  }

  getStatus(): RuntimeRelayStatus {
    return this.status
  }

  isConnected(): boolean {
    return this.status.state === 'connected'
  }

  createClientEndpoint(): string | null {
    if (!this.config.enabled || !this.isConnected()) {
      return null
    }
    const endpoint = normalizeRelayEndpoint(this.config.endpoint)
    if (!endpoint) {
      return null
    }
    endpoint.searchParams.set('role', 'client')
    endpoint.searchParams.set('serverId', this.identity.serverId)
    endpoint.searchParams.set('v', '1')
    return endpoint.toString()
  }

  private connectControl(): void {
    if (this.stopped || !this.config.enabled) {
      return
    }
    const endpoint = normalizeRelayEndpoint(this.config.endpoint)
    if (!endpoint) {
      this.setStatus({
        state: 'error',
        activeDataSockets: this.dataSockets.size,
        error: 'Invalid relay endpoint'
      })
      return
    }
    endpoint.searchParams.set('role', 'server')
    endpoint.searchParams.set('serverId', this.identity.serverId)
    endpoint.searchParams.set('v', '1')
    const enrollmentToken = extractRelayEnrollmentToken(this.config.endpoint)
    this.setStatus({ state: 'connecting', activeDataSockets: this.dataSockets.size, error: null })
    const ws = new WebSocket(endpoint, {
      maxPayload: RUNTIME_RELAY_MAX_FRAME_BYTES,
      headers: {
        Authorization: `Bearer ${this.identity.hostToken}`,
        ...(enrollmentToken ? { 'X-Orca-Relay-Enrollment': enrollmentToken } : {})
      }
    })
    this.control = ws
    ws.on('open', () => {
      if (!this.isCurrentControl(ws)) {
        return
      }
      this.reconnectAttempt = 0
      this.setStatus({ state: 'connected', activeDataSockets: this.dataSockets.size, error: null })
    })
    ws.on('message', (data) => {
      if (!this.isCurrentControl(ws)) {
        return
      }
      this.handleControlMessage(data.toString())
    })
    ws.on('close', () => this.handleControlClosed(ws))
    ws.on('error', (error) => {
      if (!this.isCurrentControl(ws)) {
        return
      }
      this.setStatus({
        state: 'error',
        activeDataSockets: this.dataSockets.size,
        error: error instanceof Error ? error.message : String(error)
      })
    })
  }

  private isCurrentControl(ws: WebSocket): boolean {
    return this.control === ws && !this.stopped && this.config.enabled
  }

  private handleControlMessage(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      this.control?.close(1008, 'Invalid relay control message')
      return
    }
    if (!parsed || typeof parsed !== 'object') {
      this.control?.close(1008, 'Invalid relay control message')
      return
    }
    const message = parsed as RelayControlMessage
    if (message.type === 'sync') {
      this.handleSync(message.connectionIds)
      return
    }
    if (message.type === 'connected') {
      this.openDataSocket(message.connectionId)
      return
    }
    if (message.type === 'disconnected') {
      this.closeDataSocket(message.connectionId)
      return
    }
    this.control?.close(1008, 'Unknown relay control message')
  }

  private handleSync(connectionIds: string[]): void {
    if (!Array.isArray(connectionIds) || connectionIds.length > this.maxSyncIds) {
      this.control?.close(1008, 'Relay sync too large')
      return
    }
    const ids = new Set<string>()
    for (const id of connectionIds) {
      if (!CONNECTION_ID_RE.test(id)) {
        this.control?.close(1008, 'Invalid relay connection id')
        return
      }
      ids.add(id)
    }
    for (const id of ids) {
      this.openDataSocket(id)
    }
    for (const id of Array.from(this.dataSockets.keys())) {
      if (!ids.has(id)) {
        this.closeDataSocket(id)
      }
    }
  }

  private openDataSocket(connectionId: string): void {
    if (!CONNECTION_ID_RE.test(connectionId) || this.dataSockets.has(connectionId)) {
      return
    }
    if (this.dataSockets.size >= this.maxDataSockets) {
      this.control?.close(1013, 'Relay data socket cap reached')
      return
    }
    const endpoint = normalizeRelayEndpoint(this.config.endpoint)
    if (!endpoint) {
      return
    }
    endpoint.searchParams.set('role', 'server')
    endpoint.searchParams.set('serverId', this.identity.serverId)
    endpoint.searchParams.set('connectionId', connectionId)
    endpoint.searchParams.set('v', '1')
    const ws = new WebSocket(endpoint, {
      maxPayload: RUNTIME_RELAY_MAX_FRAME_BYTES,
      headers: { Authorization: `Bearer ${this.identity.hostToken}` }
    })
    this.dataSockets.set(connectionId, ws)
    const timer = setTimeout(() => {
      ws.close(1008, 'Relay data E2EE attach timeout')
    }, this.dataAttachDeadlineMs)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
    this.dataAttachTimers.set(connectionId, timer)
    // Why: the relay may flush client frames immediately when the data socket
    // upgrades, so attach the encrypted RPC channel before the open callback.
    this.attachDataSocket(ws, () => {
      const current = this.dataAttachTimers.get(connectionId)
      if (current) {
        clearTimeout(current)
        this.dataAttachTimers.delete(connectionId)
      }
    })
    ws.on('open', () => {
      this.emitCurrentStatus()
    })
    ws.on('close', () => this.closeDataSocket(connectionId, ws))
    ws.on('error', () => this.closeDataSocket(connectionId, ws))
    this.emitCurrentStatus()
  }

  private closeDataSocket(connectionId: string, expected?: WebSocket): void {
    const ws = this.dataSockets.get(connectionId)
    if (!ws || (expected && ws !== expected)) {
      return
    }
    this.dataSockets.delete(connectionId)
    const timer = this.dataAttachTimers.get(connectionId)
    if (timer) {
      clearTimeout(timer)
      this.dataAttachTimers.delete(connectionId)
    }
    ws.close()
    this.emitCurrentStatus()
  }

  private handleControlClosed(ws: WebSocket): void {
    if (this.control !== ws) {
      return
    }
    this.control = null
    for (const id of Array.from(this.dataSockets.keys())) {
      this.closeDataSocket(id)
    }
    if (!this.stopped && this.config.enabled) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectAttempt += 1
    const delay = Math.min(this.reconnectBaseMs * 2 ** (this.reconnectAttempt - 1), 30_000)
    this.setStatus({
      state: 'connecting',
      activeDataSockets: this.dataSockets.size,
      error: 'Relay disconnected'
    })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectControl()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private emitCurrentStatus(): void {
    if (this.status.state === 'connected') {
      this.setStatus({ state: 'connected', activeDataSockets: this.dataSockets.size, error: null })
    }
  }

  private setStatus(status: RuntimeRelayStatus): void {
    this.status = status
    this.onStatusChange?.(status)
  }
}

export function normalizeRelayEndpoint(endpoint: string): URL | null {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return null
    }
    url.pathname = url.pathname.replace(/\/$/, '') || '/ws'
    if (url.pathname !== '/ws') {
      url.pathname = `${url.pathname}/ws`
    }
    url.search = ''
    url.hash = ''
    return url
  } catch {
    return null
  }
}

function extractRelayEnrollmentToken(endpoint: string): string | null {
  try {
    const url = new URL(endpoint)
    return url.searchParams.get('enrollmentToken') || null
  } catch {
    return null
  }
}
