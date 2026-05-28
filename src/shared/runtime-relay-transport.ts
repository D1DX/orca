export const RELAY_BINARY_SEQUENCE_BYTES = 8
export const RELAY_MAX_SEQUENCE = Number.MAX_SAFE_INTEGER

export type RuntimeWebSocketTransportKind = 'direct' | 'relay'

export type RelayTextFrame = {
  type: 'e2ee_frame'
  seq: number
  payload: string
}

export function getRuntimeWebSocketTransportKind(endpoint: string): RuntimeWebSocketTransportKind {
  try {
    const url = new URL(endpoint)
    return url.searchParams.get('role') === 'client' && url.searchParams.has('serverId')
      ? 'relay'
      : 'direct'
  } catch {
    return 'direct'
  }
}

export function createRelayTextFrame(seq: number, payload: string): string {
  return JSON.stringify({ type: 'e2ee_frame', seq, payload })
}

export function parseRelayTextFrame(plaintext: string): RelayTextFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(plaintext)
  } catch {
    return null
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { type?: unknown }).type !== 'e2ee_frame' ||
    typeof (parsed as { seq?: unknown }).seq !== 'number' ||
    typeof (parsed as { payload?: unknown }).payload !== 'string'
  ) {
    return null
  }
  const frame = parsed as RelayTextFrame
  if (!Number.isSafeInteger(frame.seq) || frame.seq < 1) {
    return null
  }
  return frame
}

export function encodeRelayBinaryFrame(
  seq: number,
  payload: Uint8Array<ArrayBufferLike>
): Uint8Array {
  const framed = new Uint8Array(RELAY_BINARY_SEQUENCE_BYTES + payload.length)
  const view = new DataView(framed.buffer, framed.byteOffset, RELAY_BINARY_SEQUENCE_BYTES)
  view.setBigUint64(0, BigInt(seq), false)
  framed.set(payload, RELAY_BINARY_SEQUENCE_BYTES)
  return framed
}

export function decodeRelayBinaryFrame(
  plaintext: Uint8Array<ArrayBufferLike>
): { seq: number; payload: Uint8Array<ArrayBufferLike> } | null {
  if (plaintext.length < RELAY_BINARY_SEQUENCE_BYTES) {
    return null
  }
  const view = new DataView(plaintext.buffer, plaintext.byteOffset, RELAY_BINARY_SEQUENCE_BYTES)
  const seq = Number(view.getBigUint64(0, false))
  if (!Number.isSafeInteger(seq) || seq < 1) {
    return null
  }
  return {
    seq,
    payload: plaintext.slice(RELAY_BINARY_SEQUENCE_BYTES)
  }
}

export class RelayFrameSequencer {
  private inboundSeq = 0
  private outboundSeq = 0

  nextOutboundSeq(): number | null {
    if (this.outboundSeq >= RELAY_MAX_SEQUENCE) {
      return null
    }
    this.outboundSeq += 1
    return this.outboundSeq
  }

  acceptInboundSeq(seq: number): boolean {
    if (!Number.isSafeInteger(seq) || seq !== this.inboundSeq + 1) {
      return false
    }
    this.inboundSeq = seq
    return true
  }
}
