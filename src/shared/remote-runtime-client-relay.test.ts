/* oxlint-disable max-lines -- Why: relay E2EE tests keep paired client/server fixtures in one file. */
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  decrypt,
  decryptBytes,
  deriveSharedKey,
  encrypt,
  encryptBytes,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64
} from './e2ee-crypto'
import { encodePairingOffer, parsePairingCode, type PairingOffer } from './pairing'
import { sendRemoteRuntimeRequest, subscribeRemoteRuntimeRequest } from './remote-runtime-client'
import {
  decodeRelayBinaryFrame,
  encodeRelayBinaryFrame,
  parseRelayTextFrame
} from './runtime-relay-transport'

const servers: WebSocketServer[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          for (const client of server.clients) {
            client.close()
          }
          server.close(() => resolve())
        })
    )
  )
})

describe('legacy remote runtime relay transport', () => {
  it('echoes relay challenges and sequences relay one-shot requests', async () => {
    const server = await createOneShotRelayServer()

    const response = await sendRemoteRuntimeRequest<{ satisfied: boolean }>(
      server.pairing,
      'terminal.wait',
      { terminal: 't1', for: 'tui-idle', timeoutMs: 550 },
      300
    )

    expect(response).toMatchObject({
      ok: true,
      result: { satisfied: true }
    })
  })

  it('echoes relay challenges and sequences subscription text and binary frames', async () => {
    const server = await createSubscriptionRelayServer()
    const onResponse = vi.fn()
    const onError = vi.fn()

    const subscription = await subscribeRemoteRuntimeRequest(
      server.pairing,
      'terminal.subscribe',
      { terminal: 't1' },
      1000,
      {
        onResponse,
        onError
      }
    )

    await vi.waitFor(() =>
      expect(onResponse).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, result: { type: 'subscribed' } })
      )
    )
    const bytes = new Uint8Array([4, 5, 6])
    expect(subscription.sendBinary(bytes)).toBe(true)
    await expect(server.nextBinary).resolves.toEqual(bytes)
    expect(onError).not.toHaveBeenCalled()
    subscription.close()
  })

  it('closes an established subscription after a replayed relay text frame', async () => {
    const server = await createTamperedSubscriptionRelayServer('text')
    const onError = vi.fn()

    const subscription = await subscribeRemoteRuntimeRequest(
      server.pairing,
      'terminal.subscribe',
      { terminal: 't1' },
      1000,
      {
        onResponse: vi.fn(),
        onError
      }
    )

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'invalid_runtime_response' })
      )
    )
    await vi.waitFor(() => expect(server.onClose).toHaveBeenCalled())
    subscription.close()
  })

  it('closes an established subscription after a replayed relay binary frame', async () => {
    const server = await createTamperedSubscriptionRelayServer('binary')
    const onError = vi.fn()

    const subscription = await subscribeRemoteRuntimeRequest(
      server.pairing,
      'terminal.subscribe',
      { terminal: 't1' },
      1000,
      {
        onResponse: vi.fn(),
        onError
      }
    )

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'invalid_runtime_response' })
      )
    )
    await vi.waitFor(() => expect(server.onClose).toHaveBeenCalled())
    subscription.close()
  })
})

async function createSubscriptionRelayServer(): Promise<{
  pairing: PairingOffer
  nextBinary: Promise<Uint8Array>
}> {
  const serverKeyPair = generateKeyPair()
  let resolveBinary: (bytes: Uint8Array) => void = () => {}
  const nextBinary = new Promise<Uint8Array>((resolve) => {
    resolveBinary = resolve
  })
  const wss = new WebSocketServer({ port: 0 })
  servers.push(wss)

  wss.on('connection', (ws) => {
    let sharedKey: Uint8Array | null = null
    let authenticated = false
    let inboundSeq = 0
    let outboundSeq = 0

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!sharedKey) {
          return
        }
        const decrypted = decryptBytes(new Uint8Array(data as Buffer), sharedKey)
        if (!decrypted) {
          return
        }
        const plaintext = unwrapRelayBinary(decrypted, ++inboundSeq)
        if (plaintext) {
          resolveBinary(plaintext)
        }
        return
      }

      const frame = data.toString()
      if (!sharedKey) {
        const hello = JSON.parse(frame) as { publicKeyB64: string }
        sharedKey = deriveSharedKey(
          serverKeyPair.secretKey,
          publicKeyFromBase64(hello.publicKeyB64)
        )
        ws.send(JSON.stringify({ type: 'e2ee_ready', challenge: 'relay-challenge' }))
        return
      }

      const plaintext = decrypt(frame, sharedKey)
      if (!plaintext) {
        return
      }
      if (!authenticated) {
        expect(JSON.parse(plaintext)).toMatchObject({
          type: 'e2ee_auth',
          deviceToken: 'device-token',
          challenge: 'relay-challenge'
        })
        authenticated = true
        sendEncrypted(ws, sharedKey, { type: 'e2ee_authenticated' }, null)
        return
      }

      const requestPlaintext = unwrapRelayText(plaintext, ++inboundSeq)
      if (!requestPlaintext) {
        return
      }
      const request = JSON.parse(requestPlaintext) as { id: string }
      sendEncrypted(
        ws,
        sharedKey,
        {
          id: request.id,
          ok: true,
          streaming: true,
          result: { type: 'subscribed' },
          _meta: { runtimeId: 'runtime-test' }
        },
        ++outboundSeq
      )
    })
  })

  return {
    pairing: await createRelayPairing(wss, serverKeyPair.publicKey, 'serverRelayClient01'),
    nextBinary
  }
}

async function createTamperedSubscriptionRelayServer(kind: 'text' | 'binary'): Promise<{
  pairing: PairingOffer
  onClose: ReturnType<typeof vi.fn>
}> {
  const serverKeyPair = generateKeyPair()
  const onClose = vi.fn()
  const wss = new WebSocketServer({ port: 0 })
  servers.push(wss)

  wss.on('connection', (ws) => {
    let sharedKey: Uint8Array | null = null
    let authenticated = false
    let inboundSeq = 0

    ws.once('close', onClose)
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        return
      }
      const frame = data.toString()
      if (!sharedKey) {
        const hello = JSON.parse(frame) as { publicKeyB64: string }
        sharedKey = deriveSharedKey(
          serverKeyPair.secretKey,
          publicKeyFromBase64(hello.publicKeyB64)
        )
        ws.send(JSON.stringify({ type: 'e2ee_ready', challenge: 'relay-challenge' }))
        return
      }

      const plaintext = decrypt(frame, sharedKey)
      if (!plaintext) {
        return
      }
      if (!authenticated) {
        authenticated = true
        sendEncrypted(ws, sharedKey, { type: 'e2ee_authenticated' }, null)
        return
      }

      const requestPlaintext = unwrapRelayText(plaintext, ++inboundSeq)
      if (!requestPlaintext) {
        return
      }
      const request = JSON.parse(requestPlaintext) as { id: string }
      if (kind === 'text') {
        sendEncrypted(
          ws,
          sharedKey,
          {
            id: request.id,
            ok: true,
            streaming: true,
            result: { type: 'subscribed' },
            _meta: { runtimeId: 'runtime-test' }
          },
          2
        )
        return
      }
      ws.send(Buffer.from(encryptBytes(encodeRelayBinaryFrame(2, new Uint8Array([9])), sharedKey)))
    })
  })

  return {
    pairing: await createRelayPairing(wss, serverKeyPair.publicKey, 'serverRelayClient03'),
    onClose
  }
}

async function createOneShotRelayServer(): Promise<{ pairing: PairingOffer }> {
  const serverKeyPair = generateKeyPair()
  const wss = new WebSocketServer({ port: 0 })
  servers.push(wss)

  wss.on('connection', (ws) => {
    let sharedKey: Uint8Array | null = null
    let authenticated = false
    let inboundSeq = 0
    let outboundSeq = 0

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        return
      }
      const frame = data.toString()
      if (!sharedKey) {
        const hello = JSON.parse(frame) as { publicKeyB64: string }
        sharedKey = deriveSharedKey(
          serverKeyPair.secretKey,
          publicKeyFromBase64(hello.publicKeyB64)
        )
        ws.send(JSON.stringify({ type: 'e2ee_ready', challenge: 'relay-challenge' }))
        return
      }

      const plaintext = decrypt(frame, sharedKey)
      if (!plaintext) {
        return
      }
      if (!authenticated) {
        expect(JSON.parse(plaintext)).toMatchObject({
          type: 'e2ee_auth',
          deviceToken: 'device-token',
          challenge: 'relay-challenge'
        })
        authenticated = true
        sendEncrypted(ws, sharedKey, { type: 'e2ee_authenticated' }, null)
        return
      }

      const requestPlaintext = unwrapRelayText(plaintext, ++inboundSeq)
      if (!requestPlaintext) {
        return
      }
      const request = JSON.parse(requestPlaintext) as { id: string }
      const key = sharedKey
      const keepalive = setInterval(() => {
        sendEncrypted(ws, key, { _keepalive: true }, ++outboundSeq)
      }, 100)
      ws.once('close', () => clearInterval(keepalive))
      setTimeout(() => {
        clearInterval(keepalive)
        sendEncrypted(
          ws,
          key,
          {
            id: request.id,
            ok: true,
            result: { satisfied: true },
            _meta: { runtimeId: 'runtime-test' }
          },
          ++outboundSeq
        )
      }, 550)
    })
  })

  return {
    pairing: await createRelayPairing(wss, serverKeyPair.publicKey, 'serverRelayClient02')
  }
}

async function createRelayPairing(
  wss: WebSocketServer,
  publicKey: Uint8Array,
  serverId: string
): Promise<PairingOffer> {
  await new Promise<void>((resolve) => wss.once('listening', resolve))
  const address = wss.address() as AddressInfo
  const pairing = parsePairingCode(
    encodePairingOffer({
      v: 2,
      endpoint: `ws://127.0.0.1:${address.port}?role=client&serverId=${serverId}&v=1`,
      deviceToken: 'device-token',
      publicKeyB64: publicKeyToBase64(publicKey)
    })
  )
  if (!pairing) {
    throw new Error('Failed to create test pairing')
  }
  return pairing
}

function sendEncrypted(
  ws: WebSocket,
  sharedKey: Uint8Array,
  message: unknown,
  relaySeq: number | null
): void {
  const payload = JSON.stringify(message)
  ws.send(
    encrypt(
      relaySeq === null ? payload : JSON.stringify({ type: 'e2ee_frame', seq: relaySeq, payload }),
      sharedKey
    )
  )
}

function unwrapRelayText(plaintext: string, expectedSeq: number): string | null {
  const frame = parseRelayTextFrame(plaintext)
  expect(frame?.seq).toBe(expectedSeq)
  return frame?.payload ?? null
}

function unwrapRelayBinary(
  plaintext: Uint8Array<ArrayBufferLike>,
  expectedSeq: number
): Uint8Array<ArrayBufferLike> | null {
  const frame = decodeRelayBinaryFrame(plaintext)
  expect(frame?.seq).toBe(expectedSeq)
  return frame?.payload ?? null
}
