import { randomBytes } from 'crypto'
import { connect, type Socket } from 'net'
import WebSocket, { type RawData } from 'ws'

const OPEN_TIMEOUT_MS = 1_000

export function openRelaySocket(
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

export function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(data.toString())
    })
  })
}

export function waitForControlMessage(
  ws: WebSocket,
  type: string
): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    const onMessage = (data: RawData) => {
      const parsed = JSON.parse(data.toString()) as Record<string, string>
      if (parsed.type !== type) {
        return
      }
      ws.off('message', onMessage)
      resolve(parsed)
    }
    ws.on('message', onMessage)
  })
}

export function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
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

export function openRawRelaySocket(
  baseUrl: string,
  options: {
    role: 'server'
    serverId: string
    token: string
    enrollmentToken: string
  }
): Promise<Socket> {
  const url = new URL(baseUrl)
  url.searchParams.set('role', options.role)
  url.searchParams.set('serverId', options.serverId)
  url.searchParams.set('v', '1')
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Timed out opening raw relay socket'))
    }, OPEN_TIMEOUT_MS)
    socket.once('connect', () => {
      socket.write(
        [
          `GET ${url.pathname}${url.search} HTTP/1.1`,
          `Host: ${url.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
          'Sec-WebSocket-Version: 13',
          `Authorization: Bearer ${options.token}`,
          `X-Orca-Relay-Enrollment: ${options.enrollmentToken}`,
          '\r\n'
        ].join('\r\n')
      )
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.on('data', (chunk) => {
      if (!chunk.toString('utf8').includes('\r\n\r\n')) {
        return
      }
      clearTimeout(timer)
      if (chunk.toString('utf8').startsWith('HTTP/1.1 101')) {
        resolve(socket)
        return
      }
      socket.destroy()
      reject(new Error(`Unexpected relay upgrade response: ${chunk.toString('utf8')}`))
    })
  })
}

export function waitForRawSocketClose(socket: Socket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', () => resolve())
  })
}

export function delay(ms: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve('timeout'), ms)
  })
}
