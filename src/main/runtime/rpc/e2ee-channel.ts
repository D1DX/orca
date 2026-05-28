// Why: the E2EE channel sits between the WebSocket transport and the RPC handler.
// It owns the handshake state machine and transparent encrypt/decrypt so the RPC
// handler only sees plaintext JSON, identical to the Unix socket path.
import { randomBytes } from 'crypto'
import type { WebSocket } from 'ws'
import { deriveSharedKey, encrypt, decrypt, encryptBytes, decryptBytes } from './e2ee-crypto'
import {
  RELAY_MAX_SEQUENCE,
  createRelayTextFrame,
  decodeRelayBinaryFrame,
  encodeRelayBinaryFrame,
  parseRelayTextFrame,
  type RuntimeWebSocketTransportKind
} from '../../../shared/runtime-relay-transport'

type ChannelState = 'awaiting_hello' | 'awaiting_auth' | 'ready'

const HANDSHAKE_TIMEOUT_MS = 10_000
const MAX_CONSECUTIVE_DECRYPT_FAILURES = 5
const MAX_BINARY_BUFFERED_AMOUNT = 8 * 1024 * 1024

type E2EEHello = {
  type: 'e2ee_hello'
  publicKeyB64: string
}

type E2EEAuth = {
  type: 'e2ee_auth'
  deviceToken: string
  challenge?: string
}

export type E2EEChannelOptions = {
  serverSecretKey: Uint8Array
  transportKind?: RuntimeWebSocketTransportKind
  validateToken: (token: string) => boolean
  onReady: (channel: E2EEChannel) => void
  onError: (code: number, reason: string) => void
}

export class E2EEChannel {
  private state: ChannelState = 'awaiting_hello'
  private sharedKey: Uint8Array | null = null
  private consecutiveFailures = 0
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  private readonly ws: WebSocket
  private readonly serverSecretKey: Uint8Array
  private readonly transportKind: RuntimeWebSocketTransportKind
  private readonly validateToken: (token: string) => boolean
  private readonly onReady: (channel: E2EEChannel) => void
  private readonly onError: (code: number, reason: string) => void
  private challenge: string | null = null
  private inboundRelaySeq = 0
  private outboundRelaySeq = 0
  // Why: the RPC handler is set after the channel is ready, so the channel
  // can forward decrypted messages. Kept as a callback rather than constructor
  // param because the handler needs the encrypt function for replies.
  private messageHandler:
    | ((
        plaintext: string,
        encryptedReply: (response: string) => void,
        encryptedBinaryReply: (response: Uint8Array<ArrayBufferLike>) => boolean | void
      ) => void)
    | null = null
  private binaryMessageHandler: ((plaintext: Uint8Array<ArrayBufferLike>) => void) | null = null

  deviceToken: string | null = null

  constructor(ws: WebSocket, options: E2EEChannelOptions) {
    this.ws = ws
    this.serverSecretKey = options.serverSecretKey
    this.transportKind = options.transportKind ?? 'direct'
    this.validateToken = options.validateToken
    this.onReady = options.onReady
    this.onError = options.onError

    this.handshakeTimer = setTimeout(() => {
      this.onError(4002, 'E2EE handshake timeout')
    }, HANDSHAKE_TIMEOUT_MS)
  }

  onMessage(
    handler: (
      plaintext: string,
      encryptedReply: (response: string) => void,
      encryptedBinaryReply: (response: Uint8Array<ArrayBufferLike>) => boolean | void
    ) => void
  ): void {
    this.messageHandler = handler
  }

  onBinaryMessage(handler: (plaintext: Uint8Array<ArrayBufferLike>) => void): void {
    this.binaryMessageHandler = handler
  }

  handleRawMessage(raw: string | Uint8Array<ArrayBufferLike>): void {
    if (this.state === 'awaiting_hello') {
      if (typeof raw !== 'string') {
        this.onError(4001, 'Invalid handshake message')
        return
      }
      this.handleHello(raw)
      return
    }

    if (!this.sharedKey) {
      return
    }

    if (typeof raw !== 'string') {
      const plaintextBytes = decryptBytes(raw, this.sharedKey)
      if (plaintextBytes === null) {
        this.trackDecryptFailure()
        return
      }
      this.consecutiveFailures = 0
      if (this.state !== 'ready') {
        this.onError(4001, 'Invalid binary message before authentication')
        return
      }
      const binaryPayload =
        this.transportKind === 'relay'
          ? this.unwrapRelayBinaryFrame(plaintextBytes)
          : plaintextBytes
      if (!binaryPayload) {
        return
      }
      this.binaryMessageHandler?.(binaryPayload)
      return
    }

    const plaintext = decrypt(raw, this.sharedKey)
    if (plaintext === null) {
      this.trackDecryptFailure()
      return
    }

    this.consecutiveFailures = 0
    if (this.state === 'awaiting_auth') {
      this.handleAuth(plaintext)
      return
    }

    const messagePlaintext =
      this.state === 'ready' && this.transportKind === 'relay'
        ? this.unwrapRelayTextFrame(plaintext)
        : plaintext
    if (messagePlaintext === null) {
      return
    }

    // Why: streaming RPC handlers (e.g. terminal.subscribe) retain this
    // closure and may fire emits long after the inbound message handled
    // here. If destroy() runs in between (mobile disconnect, handshake
    // failure) sharedKey becomes null and tweetnacl throws "unexpected
    // type, use Uint8Array" from inside nacl.box.after. Guard both the
    // socket state AND the key so late emits become silent no-ops.
    const encryptedReply = (response: string) => {
      if (!this.sharedKey || this.ws.readyState !== this.ws.OPEN) {
        return
      }
      this.ws.send(encrypt(this.wrapRelayTextFrame(response), this.sharedKey))
    }
    const encryptedBinaryReply = (response: Uint8Array<ArrayBufferLike>): boolean => {
      if (!this.sharedKey || this.ws.readyState !== this.ws.OPEN) {
        return false
      }
      if (this.ws.bufferedAmount > MAX_BINARY_BUFFERED_AMOUNT) {
        return false
      }
      this.ws.send(Buffer.from(encryptBytes(this.wrapRelayBinaryFrame(response), this.sharedKey)), {
        binary: true
      })
      return true
    }
    this.messageHandler?.(messagePlaintext, encryptedReply, encryptedBinaryReply)
  }

  private trackDecryptFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_DECRYPT_FAILURES) {
      this.onError(4003, 'Too many decryption failures')
    }
  }

  private handleHello(raw: string): void {
    let hello: E2EEHello
    try {
      hello = JSON.parse(raw) as E2EEHello
    } catch {
      this.onError(4001, 'Invalid handshake message')
      return
    }

    if (hello.type !== 'e2ee_hello' || !hello.publicKeyB64) {
      this.onError(4001, 'Invalid e2ee_hello')
      return
    }

    // Why: derive the shared key from our secret + client's public key.
    // Both sides compute the same shared secret via ECDH.
    const clientPublicKey = Uint8Array.from(Buffer.from(hello.publicKeyB64, 'base64'))
    if (clientPublicKey.length !== 32) {
      this.onError(4001, 'Invalid public key')
      return
    }

    this.sharedKey = deriveSharedKey(this.serverSecretKey, clientPublicKey)
    this.state = 'awaiting_auth'
    this.challenge = randomBytes(24).toString('base64url')

    // Why: send e2ee_ready as plaintext — the client needs it to know the
    // key exchange succeeded before it can send encrypted authentication.
    // The challenge is echoed inside encrypted auth to make relay handshakes fresh.
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify({ type: 'e2ee_ready', challenge: this.challenge }))
    }
  }

  private handleAuth(plaintext: string): void {
    let auth: E2EEAuth
    try {
      auth = JSON.parse(plaintext) as E2EEAuth
    } catch {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'bad_auth' } })
      this.onError(4001, 'Invalid e2ee_auth')
      return
    }

    if (auth.type !== 'e2ee_auth' || !auth.deviceToken) {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'bad_auth' } })
      this.onError(4001, 'Invalid e2ee_auth')
      return
    }
    if (this.transportKind === 'relay' && auth.challenge !== this.challenge) {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'bad_auth' } })
      this.onError(4001, 'Missing relay auth challenge')
      return
    }
    if (!this.validateToken(auth.deviceToken)) {
      this.sendEncryptedControl({ type: 'e2ee_error', error: { code: 'unauthorized' } })
      this.onError(4001, 'Unauthorized')
      return
    }

    this.deviceToken = auth.deviceToken
    this.state = 'ready'

    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }

    this.sendEncryptedControl({ type: 'e2ee_authenticated' })
    this.onReady(this)
  }

  private sendEncryptedControl(message: unknown): void {
    if (this.ws.readyState === this.ws.OPEN && this.sharedKey) {
      this.ws.send(encrypt(JSON.stringify(message), this.sharedKey))
    }
  }

  private nextOutboundRelaySeq(): number {
    if (this.transportKind !== 'relay') {
      return 0
    }
    if (this.outboundRelaySeq >= RELAY_MAX_SEQUENCE) {
      this.onError(4008, 'Relay frame sequence exhausted')
      return 0
    }
    this.outboundRelaySeq += 1
    return this.outboundRelaySeq
  }

  private wrapRelayTextFrame(payload: string): string {
    if (this.transportKind !== 'relay') {
      return payload
    }
    const seq = this.nextOutboundRelaySeq()
    return createRelayTextFrame(seq, payload)
  }

  private wrapRelayBinaryFrame(payload: Uint8Array<ArrayBufferLike>): Uint8Array {
    if (this.transportKind !== 'relay') {
      return payload
    }
    return encodeRelayBinaryFrame(this.nextOutboundRelaySeq(), payload)
  }

  private acceptRelaySeq(seq: unknown): boolean {
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq !== this.inboundRelaySeq + 1) {
      this.onError(4007, 'Invalid relay frame sequence')
      return false
    }
    this.inboundRelaySeq = seq
    return true
  }

  private unwrapRelayTextFrame(plaintext: string): string | null {
    const frame = parseRelayTextFrame(plaintext)
    if (!frame) {
      this.onError(4007, 'Invalid relay text frame')
      return null
    }
    return this.acceptRelaySeq(frame.seq) ? frame.payload : null
  }

  private unwrapRelayBinaryFrame(plaintext: Uint8Array<ArrayBufferLike>): Uint8Array | null {
    const frame = decodeRelayBinaryFrame(plaintext)
    if (!frame) {
      this.onError(4007, 'Invalid relay binary frame')
      return null
    }
    if (!this.acceptRelaySeq(frame.seq)) {
      return null
    }
    return frame.payload
  }

  destroy(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    this.sharedKey = null
    this.challenge = null
    this.messageHandler = null
    this.binaryMessageHandler = null
  }
}
