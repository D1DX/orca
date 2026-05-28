import { homedir } from 'os'
import { join } from 'path'
import type { CommandHandler } from '../dispatch'
import { formatCliStatus, formatStatus, printResult } from '../format'
import { RuntimeClientError, serveOrcaApp } from '../runtime-client'
import { startRuntimeRelayServer } from '../../runtime-relay-server/server'

export const CORE_HANDLERS: Record<string, CommandHandler> = {
  open: async ({ client, json }) => {
    const result = await client.openOrca()
    printResult(result, json, formatCliStatus)
  },
  serve: async ({ flags, json }) => {
    if (flags.get('no-pairing') === true && flags.get('mobile-pairing') === true) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use either --mobile-pairing or --no-pairing, not both.'
      )
    }
    const rawPort = flags.get('port')
    if (typeof rawPort === 'string') {
      const port = Number(rawPort)
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new RuntimeClientError('invalid_argument', `Invalid --port value: ${rawPort}`)
      }
    }
    const exitCode = await serveOrcaApp({
      json,
      port: typeof rawPort === 'string' ? rawPort : null,
      pairingAddress:
        typeof flags.get('pairing-address') === 'string'
          ? (flags.get('pairing-address') as string)
          : null,
      noPairing: flags.get('no-pairing') === true,
      mobilePairing: flags.get('mobile-pairing') === true
    })
    process.exitCode = exitCode
  },
  'relay serve': async ({ flags, json }) => {
    const rawHost = flags.get('host')
    if (flags.has('host') && (!isNonBlankString(rawHost) || rawHost.trim() !== rawHost)) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --host value.')
    }
    const host = typeof rawHost === 'string' ? rawHost : '127.0.0.1'
    const rawPort = flags.get('port')
    if (flags.has('port') && !isNonBlankString(rawPort)) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --port value.')
    }
    const port = typeof rawPort === 'string' ? Number(rawPort) : 8787
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new RuntimeClientError('invalid_argument', `Invalid --port value: ${String(rawPort)}`)
    }
    const rawStatePath = flags.get('state-path')
    if (flags.has('state-path') && !isNonBlankString(rawStatePath)) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --state-path value.')
    }
    const rawEnrollmentToken = flags.get('enrollment-token')
    if (flags.has('enrollment-token') && !isNonBlankString(rawEnrollmentToken)) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --enrollment-token value.')
    }
    const rawPublicUrl = flags.get('public-url')
    if (
      flags.has('public-url') &&
      (!isNonBlankString(rawPublicUrl) || rawPublicUrl.trim() !== rawPublicUrl)
    ) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --public-url value.')
    }
    const advertisedWebSocketUrl =
      typeof rawPublicUrl === 'string' ? normalizeRelayPublicWebSocketUrl(rawPublicUrl) : null
    try {
      const relay = await startRuntimeRelayServer({
        host,
        port,
        statePath:
          typeof rawStatePath === 'string' ? rawStatePath : defaultRuntimeRelayServerStatePath(),
        enrollmentToken: typeof rawEnrollmentToken === 'string' ? rawEnrollmentToken : undefined,
        log: (message) => {
          const output = `${message}\n`
          if (json) {
            process.stderr.write(output)
          } else {
            process.stdout.write(output)
          }
        }
      })
      const startup = {
        ok: true,
        kind: 'runtime_relay_server',
        protocolVersion: relay.protocolVersion,
        httpUrl: relay.httpUrl,
        webSocketUrl: relay.webSocketUrl,
        advertisedWebSocketUrl:
          advertisedWebSocketUrl ?? (isWildcardBindHost(host) ? null : relay.webSocketUrl),
        publicUrlRequired: advertisedWebSocketUrl === null && isWildcardBindHost(host),
        enrollmentToken: relay.enrollmentToken
      }
      process.stdout.write(json ? `${JSON.stringify(startup)}\n` : formatRelayStartup(startup))
      await waitForRelayShutdown(relay.stop)
    } catch (error) {
      if (json) {
        const code = error instanceof RuntimeClientError ? error.code : 'runtime_error'
        const message = error instanceof Error ? error.message : String(error)
        process.stdout.write(
          `${JSON.stringify({
            ok: false,
            kind: 'runtime_relay_server',
            error: { code, message }
          })}\n`
        )
        process.exitCode = 1
        return
      }
      throw error
    }
  },
  status: async ({ client, json }) => {
    const result = await client.getCliStatus()
    if (!json && !result.result.runtime.reachable) {
      process.exitCode = 1
    }
    printResult(result, json, formatStatus)
  }
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeRelayPublicWebSocketUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new RuntimeClientError('invalid_argument', `Invalid --public-url value: ${rawUrl}`)
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new RuntimeClientError('invalid_argument', 'Use a ws:// or wss:// URL for --public-url.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass --public-url without credentials, query parameters, or fragments.'
    )
  }
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/ws'
  }
  if (url.pathname !== '/ws') {
    throw new RuntimeClientError('invalid_argument', 'Use a --public-url ending in /ws.')
  }
  return url.toString()
}

function isWildcardBindHost(host: string): boolean {
  return ['0.0.0.0', '::', '[::]'].includes(host)
}

function defaultRuntimeRelayServerStatePath(): string {
  const envPath = process.env.ORCA_USER_DATA_PATH
  const userDataPath =
    envPath && envPath.trim()
      ? envPath
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support', 'orca')
        : process.platform === 'win32'
          ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'orca')
          : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'orca')
  return join(userDataPath, 'runtime-relay-server-state.json')
}

function formatRelayStartup(startup: {
  httpUrl: string
  webSocketUrl: string
  advertisedWebSocketUrl: string | null
  publicUrlRequired: boolean
  enrollmentToken: string
  protocolVersion: number
}): string {
  const lines = [
    `Orca runtime relay listening on ${startup.httpUrl}`,
    startup.advertisedWebSocketUrl
      ? `Configure Orca/mobile with: ${startup.advertisedWebSocketUrl}`
      : 'Configure Orca/mobile with your public wss://.../ws endpoint; 0.0.0.0 and :: are bind addresses only.',
    startup.advertisedWebSocketUrl === startup.webSocketUrl
      ? null
      : `Bind-only WebSocket endpoint: ${startup.webSocketUrl}`,
    `Enrollment token: ${startup.enrollmentToken}`,
    `Protocol version: ${startup.protocolVersion}`,
    'Stop it with Ctrl+C.',
    ''
  ]
  if (startup.publicUrlRequired) {
    lines.splice(
      3,
      0,
      'For self-hosting, pass --public-url wss://relay.example.com/ws or configure that public URL in Orca settings.'
    )
  }
  return lines.filter((line): line is string => line !== null).join('\n')
}

function waitForRelayShutdown(stop: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    let stopping = false
    const shutdown = () => {
      if (stopping) {
        return
      }
      stopping = true
      void stop().finally(() => {
        process.off('SIGINT', shutdown)
        process.off('SIGTERM', shutdown)
        resolve()
      })
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
}
