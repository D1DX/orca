/* eslint-disable max-lines -- Why: these protocol tests cover direct and relay E2EE compatibility as one matrix so handshake/frame regressions are easier to audit. */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { WebSocket } from 'ws'
import { E2EEChannel, type E2EEChannelOptions } from './e2ee-channel'
import {
  generateKeyPair,
  deriveSharedKey,
  encrypt,
  decrypt,
  encryptBytes,
  decryptBytes
} from './e2ee-crypto'
import {
  createRelayTextFrame,
  decodeRelayBinaryFrame,
  encodeRelayBinaryFrame,
  parseRelayTextFrame
} from '../../../shared/runtime-relay-transport'

function publicKeyToBase64(key: Uint8Array): string {
  return Buffer.from(key).toString('base64')
}

function createMockWs() {
  const sent: string[] = []
  return {
    OPEN: 1 as const,
    readyState: 1,
    send: vi.fn((data: string) => sent.push(data)),
    close: vi.fn(),
    sent
  }
}

function setup(overrides?: Partial<E2EEChannelOptions>) {
  const serverKeys = generateKeyPair()
  const clientKeys = generateKeyPair()
  const ws = createMockWs()
  const onReady = vi.fn()
  const onError = vi.fn()

  const channel = new E2EEChannel(ws as unknown as WebSocket, {
    serverSecretKey: serverKeys.secretKey,
    validateToken: (token) => token === 'valid-token',
    onReady,
    onError,
    ...overrides
  })

  return { channel, ws, serverKeys, clientKeys, onReady, onError }
}

function doHandshake(ctx: ReturnType<typeof setup>) {
  const hello = JSON.stringify({
    type: 'e2ee_hello',
    publicKeyB64: publicKeyToBase64(ctx.clientKeys.publicKey)
  })
  ctx.channel.handleRawMessage(hello)
  const sharedKey = deriveSharedKey(ctx.clientKeys.secretKey, ctx.serverKeys.publicKey)
  ctx.channel.handleRawMessage(
    encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: 'valid-token' }), sharedKey)
  )
  return sharedKey
}

function doRelayHandshake(ctx: ReturnType<typeof setup>) {
  const hello = JSON.stringify({
    type: 'e2ee_hello',
    publicKeyB64: publicKeyToBase64(ctx.clientKeys.publicKey)
  })
  ctx.channel.handleRawMessage(hello)
  const ready = JSON.parse(ctx.ws.sent[0]!) as { challenge: string }
  const sharedKey = deriveSharedKey(ctx.clientKeys.secretKey, ctx.serverKeys.publicKey)
  ctx.channel.handleRawMessage(
    encrypt(
      JSON.stringify({
        type: 'e2ee_auth',
        deviceToken: 'valid-token',
        challenge: ready.challenge
      }),
      sharedKey
    )
  )
  return sharedKey
}

describe('E2EEChannel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('handshake', () => {
    it('completes handshake with valid encrypted auth', () => {
      const ctx = setup()
      doHandshake(ctx)

      expect(ctx.onReady).toHaveBeenCalledWith(ctx.channel)
      expect(ctx.onError).not.toHaveBeenCalled()
      expect(ctx.channel.deviceToken).toBe('valid-token')

      const readyMsg = JSON.parse(ctx.ws.sent[0]!)
      expect(readyMsg).toMatchObject({ type: 'e2ee_ready' })
      expect(typeof readyMsg.challenge).toBe('string')
      const authMsg = decrypt(
        ctx.ws.sent[1]!,
        deriveSharedKey(ctx.clientKeys.secretKey, ctx.serverKeys.publicKey)
      )
      expect(JSON.parse(authMsg!)).toEqual({ type: 'e2ee_authenticated' })
    })

    it('does not authenticate from plaintext hello alone', () => {
      const ctx = setup()
      ctx.channel.handleRawMessage(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(ctx.clientKeys.publicKey)
        })
      )

      expect(ctx.onReady).not.toHaveBeenCalled()
      expect(JSON.parse(ctx.ws.sent[0]!)).toMatchObject({ type: 'e2ee_ready' })
    })

    it('rejects invalid encrypted token', () => {
      const ctx = setup()
      ctx.channel.handleRawMessage(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: publicKeyToBase64(ctx.clientKeys.publicKey)
        })
      )
      const sharedKey = deriveSharedKey(ctx.clientKeys.secretKey, ctx.serverKeys.publicKey)
      ctx.channel.handleRawMessage(
        encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: 'bad-token' }), sharedKey)
      )

      expect(ctx.onError).toHaveBeenCalledWith(4001, 'Unauthorized')
      expect(ctx.onReady).not.toHaveBeenCalled()
    })

    it('rejects malformed JSON', () => {
      const ctx = setup()
      ctx.channel.handleRawMessage('not json')

      expect(ctx.onError).toHaveBeenCalledWith(4001, 'Invalid handshake message')
    })

    it('rejects missing fields', () => {
      const ctx = setup()
      ctx.channel.handleRawMessage(JSON.stringify({ type: 'e2ee_hello' }))

      expect(ctx.onError).toHaveBeenCalledWith(4001, 'Invalid e2ee_hello')
    })

    it('rejects invalid public key length', () => {
      const ctx = setup()
      ctx.channel.handleRawMessage(
        JSON.stringify({
          type: 'e2ee_hello',
          publicKeyB64: Buffer.from('short').toString('base64')
        })
      )

      expect(ctx.onError).toHaveBeenCalledWith(4001, 'Invalid public key')
    })

    it('times out if no hello received', () => {
      const ctx = setup()

      vi.advanceTimersByTime(10_001)

      expect(ctx.onError).toHaveBeenCalledWith(4002, 'E2EE handshake timeout')
    })

    it('clears timeout after successful handshake', () => {
      const ctx = setup()
      doHandshake(ctx)

      vi.advanceTimersByTime(10_001)

      expect(ctx.onError).not.toHaveBeenCalled()
    })
  })

  describe('post-handshake messaging', () => {
    it('decrypts and forwards messages', () => {
      const ctx = setup()
      const sharedKey = doHandshake(ctx)
      const received: string[] = []

      ctx.channel.onMessage((plaintext) => {
        received.push(plaintext)
      })

      const request = '{"id":"rpc-1","method":"status.get"}'
      ctx.channel.handleRawMessage(encrypt(request, sharedKey))

      expect(received).toEqual([request])
    })

    it('provides encrypted reply function', () => {
      const ctx = setup()
      const sharedKey = doHandshake(ctx)

      ctx.channel.onMessage((_plaintext, encryptedReply) => {
        encryptedReply('{"id":"rpc-1","ok":true}')
      })

      ctx.channel.handleRawMessage(encrypt('{"id":"rpc-1","method":"status.get"}', sharedKey))

      // The reply (ws.sent[2], after ready + authenticated) should be encrypted
      const replyEncrypted = ctx.ws.sent[2]!
      const replyPlain = decrypt(replyEncrypted, sharedKey)
      expect(replyPlain).toBe('{"id":"rpc-1","ok":true}')
    })

    it('decrypts and forwards binary messages after authentication', () => {
      const ctx = setup()
      const sharedKey = doHandshake(ctx)
      const received: Uint8Array<ArrayBufferLike>[] = []

      ctx.channel.onBinaryMessage((bytes) => {
        received.push(bytes)
      })

      ctx.channel.handleRawMessage(encryptBytes(new Uint8Array([1, 2, 3]), sharedKey))

      expect([...received[0]!]).toEqual([1, 2, 3])
    })

    it('silently drops messages with wrong key', () => {
      const ctx = setup()
      doHandshake(ctx)
      const received: string[] = []

      ctx.channel.onMessage((plaintext) => {
        received.push(plaintext)
      })

      const attackerKey = deriveSharedKey(generateKeyPair().secretKey, generateKeyPair().publicKey)
      ctx.channel.handleRawMessage(encrypt('attack', attackerKey))

      expect(received).toEqual([])
    })

    it('closes after too many consecutive decrypt failures', () => {
      const ctx = setup()
      doHandshake(ctx)
      ctx.channel.onMessage(() => {})

      const badKey = deriveSharedKey(generateKeyPair().secretKey, generateKeyPair().publicKey)

      for (let i = 0; i < 4; i++) {
        ctx.channel.handleRawMessage(encrypt('bad', badKey))
      }
      expect(ctx.onError).not.toHaveBeenCalled()

      ctx.channel.handleRawMessage(encrypt('bad', badKey))
      expect(ctx.onError).toHaveBeenCalledWith(4003, 'Too many decryption failures')
    })

    it('resets failure count on successful decrypt', () => {
      const ctx = setup()
      const sharedKey = doHandshake(ctx)
      ctx.channel.onMessage(() => {})

      const badKey = deriveSharedKey(generateKeyPair().secretKey, generateKeyPair().publicKey)

      for (let i = 0; i < 4; i++) {
        ctx.channel.handleRawMessage(encrypt('bad', badKey))
      }

      // Successful decrypt resets the counter
      ctx.channel.handleRawMessage(encrypt('good', sharedKey))

      for (let i = 0; i < 4; i++) {
        ctx.channel.handleRawMessage(encrypt('bad', badKey))
      }
      expect(ctx.onError).not.toHaveBeenCalled()
    })

    it('requires relay auth challenge on relay sockets', () => {
      const ctx = setup({ transportKind: 'relay' })
      const sharedKey = doHandshake(ctx)

      expect(sharedKey).toBeTruthy()
      expect(ctx.onReady).not.toHaveBeenCalled()
      expect(ctx.onError).toHaveBeenCalledWith(4001, 'Missing relay auth challenge')
    })

    it('rejects duplicate relay text frame sequence before dispatch', () => {
      const ctx = setup({ transportKind: 'relay' })
      const sharedKey = doRelayHandshake(ctx)
      const received: string[] = []
      ctx.channel.onMessage((plaintext) => {
        received.push(plaintext)
      })

      const request = '{"id":"rpc-1","method":"status.get"}'
      const frame = encrypt(createRelayTextFrame(1, request), sharedKey)
      ctx.channel.handleRawMessage(frame)
      ctx.channel.handleRawMessage(frame)

      expect(received).toEqual([request])
      expect(ctx.onError).toHaveBeenCalledWith(4007, 'Invalid relay frame sequence')
    })

    it('wraps relay replies with outbound sequence numbers', () => {
      const ctx = setup({ transportKind: 'relay' })
      const sharedKey = doRelayHandshake(ctx)

      ctx.channel.onMessage((_plaintext, encryptedReply) => {
        encryptedReply('{"id":"rpc-1","ok":true}')
      })
      ctx.channel.handleRawMessage(
        encrypt(createRelayTextFrame(1, '{"id":"rpc-1","method":"status.get"}'), sharedKey)
      )

      const replyPlain = decrypt(ctx.ws.sent[2]!, sharedKey)
      const frame = parseRelayTextFrame(replyPlain!)
      expect(frame).toMatchObject({ seq: 1, payload: '{"id":"rpc-1","ok":true}' })
    })

    it('rejects duplicate relay binary frame sequence before dispatch', () => {
      const ctx = setup({ transportKind: 'relay' })
      const sharedKey = doRelayHandshake(ctx)
      const received: Uint8Array<ArrayBufferLike>[] = []
      ctx.channel.onBinaryMessage((plaintext) => {
        received.push(plaintext)
      })

      const frame = encryptBytes(encodeRelayBinaryFrame(1, new Uint8Array([4, 5])), sharedKey)
      ctx.channel.handleRawMessage(frame)
      ctx.channel.handleRawMessage(frame)

      expect([...received[0]!]).toEqual([4, 5])
      expect(ctx.onError).toHaveBeenCalledWith(4007, 'Invalid relay frame sequence')
    })

    it('wraps relay binary replies with outbound sequence numbers', () => {
      const ctx = setup({ transportKind: 'relay' })
      const sharedKey = doRelayHandshake(ctx)

      ctx.channel.onMessage((_plaintext, _encryptedReply, encryptedBinaryReply) => {
        encryptedBinaryReply(new Uint8Array([9, 8, 7]))
      })
      ctx.channel.handleRawMessage(
        encrypt(createRelayTextFrame(1, '{"id":"rpc-1","method":"browser.screencast"}'), sharedKey)
      )

      const replyPlain = decryptBytes(ctx.ws.sent[2]! as unknown as Uint8Array, sharedKey)
      const frame = decodeRelayBinaryFrame(replyPlain!)
      expect(frame?.seq).toBe(1)
      expect([...(frame?.payload ?? [])]).toEqual([9, 8, 7])
    })
  })

  describe('cross-compatibility', () => {
    it('desktop encrypt is decryptable by desktop decrypt (sanity)', () => {
      const a = generateKeyPair()
      const b = generateKeyPair()
      const sharedA = deriveSharedKey(a.secretKey, b.publicKey)
      const sharedB = deriveSharedKey(b.secretKey, a.publicKey)

      const msg = '{"method":"terminal.subscribe","params":{"terminal":"t1"}}'
      const enc = encrypt(msg, sharedA)
      expect(decrypt(enc, sharedB)).toBe(msg)
    })
  })

  describe('destroy', () => {
    it('clears state and stops forwarding', () => {
      const ctx = setup()
      const sharedKey = doHandshake(ctx)
      const received: string[] = []

      ctx.channel.onMessage((plaintext) => {
        received.push(plaintext)
      })

      ctx.channel.destroy()
      ctx.channel.handleRawMessage(encrypt('after destroy', sharedKey))

      expect(received).toEqual([])
    })

    // Why: streaming RPC handlers (terminal.subscribe) retain the
    // encryptedReply closure created inside handleRawMessage. If destroy()
    // runs (mobile disconnect) before a late streaming emit, the closure's
    // captured this.sharedKey is null. Without a guard, encrypt() would
    // call nacl.box.after with a null key and throw an unhandled
    // "unexpected type, use Uint8Array" rejection.
    it('does not throw when streaming emit fires after destroy', () => {
      const ctx = setup()
      const sharedKey = doHandshake(ctx)
      const sentBefore = ctx.ws.sent.length

      let capturedReply: ((response: string) => void) | null = null
      ctx.channel.onMessage((_plaintext, encryptedReply) => {
        capturedReply = encryptedReply
      })

      ctx.channel.handleRawMessage(encrypt('subscribe-trigger', sharedKey))
      expect(capturedReply).not.toBeNull()

      ctx.channel.destroy()

      const callLateEmit = () => capturedReply?.('late streaming frame')
      expect(callLateEmit).not.toThrow()
      expect(ctx.ws.sent.length).toBe(sentBefore)
    })
  })
})
