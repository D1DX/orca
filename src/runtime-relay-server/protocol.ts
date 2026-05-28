import { randomBytes, randomUUID } from 'crypto'
import type { IncomingMessage } from 'http'
export { RUNTIME_RELAY_MAX_FRAME_BYTES } from '../shared/runtime-relay-limits'

export const RUNTIME_RELAY_PROTOCOL_VERSION = 1
export const RUNTIME_RELAY_WS_PATH = '/ws'
export const RUNTIME_RELAY_DEFAULT_PORT = 8787
export const RUNTIME_RELAY_ENROLLMENT_TOKEN_BYTES = 32
export const RUNTIME_RELAY_MAX_PENDING_CLIENTS_PER_SERVER = 64
export const RUNTIME_RELAY_MAX_ACTIVE_DATA_SOCKETS_PER_SERVER = 64
export const RUNTIME_RELAY_MAX_GLOBAL_PENDING_CLIENTS = 1024
export const RUNTIME_RELAY_MAX_GLOBAL_ACTIVE_DATA_SOCKETS = 1024
export const RUNTIME_RELAY_MAX_BOUND_SERVERS = 10_000
export const RUNTIME_RELAY_MAX_EARLY_FRAMES_PER_CONNECTION = 4
export const RUNTIME_RELAY_MAX_EARLY_BYTES_PER_CONNECTION = 4 * 1024 * 1024
export const RUNTIME_RELAY_MAX_TOTAL_EARLY_BYTES_PER_SERVER = 16 * 1024 * 1024
export const RUNTIME_RELAY_MAX_GLOBAL_EARLY_BYTES = 64 * 1024 * 1024
export const RUNTIME_RELAY_MAX_FORWARD_BUFFERED_BYTES = 8 * 1024 * 1024
export const RUNTIME_RELAY_MAX_CONTROL_BUFFERED_BYTES = 1024 * 1024
export const RUNTIME_RELAY_ATTACH_DEADLINE_MS = 15_000
export const RUNTIME_RELAY_HEARTBEAT_INTERVAL_MS = 15_000
export const RUNTIME_RELAY_STALE_SOCKET_TIMEOUT_MS = 45_000

const SERVER_ID_RE = /^[A-Za-z0-9_-]{16,128}$/
const CONNECTION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/
const HOST_TOKEN_HASH_RE = /^[a-f0-9]{64}$/
const MIN_HOST_TOKEN_LENGTH = 32

export type RuntimeRelayRole = 'server' | 'client'

export type RuntimeRelayClientRequest = {
  role: 'client'
  serverId: string
}

export type RuntimeRelayServerRequest =
  | {
      role: 'server'
      serverId: string
      hostToken: string
      enrollmentToken: string | null
      connectionId: null
    }
  | {
      role: 'server'
      serverId: string
      hostToken: string
      enrollmentToken: string | null
      connectionId: string
    }

export type RuntimeRelayRequest = RuntimeRelayClientRequest | RuntimeRelayServerRequest

export type RelayControlMessage =
  | { type: 'sync'; connectionIds: string[] }
  | { type: 'connected'; connectionId: string }
  | { type: 'disconnected'; connectionId: string }

export function createRelayConnectionId(): string {
  return randomUUID().replace(/-/g, '')
}

export function createRelayEnrollmentToken(): string {
  return randomBytes(RUNTIME_RELAY_ENROLLMENT_TOKEN_BYTES).toString('base64url')
}

export function isRuntimeRelayServerId(value: unknown): value is string {
  return typeof value === 'string' && SERVER_ID_RE.test(value)
}

export function isRuntimeRelayHostTokenHash(value: unknown): value is string {
  return typeof value === 'string' && HOST_TOKEN_HASH_RE.test(value)
}

export function parseRuntimeRelayRequest(
  request: IncomingMessage
): { ok: true; value: RuntimeRelayRequest } | { ok: false; statusCode: number; reason: string } {
  const host = request.headers.host ?? '127.0.0.1'
  let url: URL
  try {
    url = new URL(request.url ?? '/', `http://${host}`)
  } catch {
    return { ok: false, statusCode: 400, reason: 'invalid_url' }
  }
  if (url.pathname !== RUNTIME_RELAY_WS_PATH) {
    return { ok: false, statusCode: 404, reason: 'not_found' }
  }
  if (url.searchParams.get('v') !== String(RUNTIME_RELAY_PROTOCOL_VERSION)) {
    return { ok: false, statusCode: 400, reason: 'invalid_version' }
  }
  const role = url.searchParams.get('role')
  const serverId = url.searchParams.get('serverId')
  if ((role !== 'server' && role !== 'client') || !isRuntimeRelayServerId(serverId)) {
    return { ok: false, statusCode: 400, reason: 'invalid_relay_request' }
  }
  if (role === 'client') {
    return { ok: true, value: { role, serverId } }
  }
  const hostToken = parseHostAuthorization(request)
  if (!hostToken || hostToken.length < MIN_HOST_TOKEN_LENGTH) {
    return { ok: false, statusCode: 401, reason: 'invalid_host_token' }
  }
  const connectionId = url.searchParams.get('connectionId')
  if (connectionId !== null && !CONNECTION_ID_RE.test(connectionId)) {
    return { ok: false, statusCode: 400, reason: 'invalid_connection_id' }
  }
  return {
    ok: true,
    value: {
      role,
      serverId,
      hostToken,
      enrollmentToken: parseEnrollmentToken(request),
      connectionId
    }
  }
}

function parseHostAuthorization(request: IncomingMessage): string | null {
  const authorization = request.headers.authorization
  if (!authorization) {
    return null
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  return match?.[1] ?? null
}

function parseEnrollmentToken(request: IncomingMessage): string | null {
  const value = request.headers['x-orca-relay-enrollment']
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}
