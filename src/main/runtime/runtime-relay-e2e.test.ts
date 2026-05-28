import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { startRuntimeRelayServer } from '../../runtime-relay-server/server'
import { parsePairingCode } from '../../shared/pairing'
import { RemoteRuntimeRequestConnection } from '../../shared/remote-runtime-request-connection'
import { saveRuntimeRelayConfig } from './relay-config'
import { OrcaRuntimeRpcServer } from './runtime-rpc'
import type { OrcaRuntimeService } from './orca-runtime'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition')
    }
    await sleep(20)
  }
}

describe('runtime relay end-to-end', () => {
  it('serves encrypted runtime RPC over a self-hosted relay', async () => {
    const relayDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-e2e-relay-'))
    const runtimeDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-relay-e2e-runtime-'))
    const relay = await startRuntimeRelayServer({
      port: 0,
      statePath: join(relayDataPath, 'relay-state.json')
    })
    saveRuntimeRelayConfig(runtimeDataPath, {
      enabled: true,
      endpoint: `${relay.webSocketUrl}?enrollmentToken=${relay.enrollmentToken}`
    })

    const runtime = {
      getRuntimeId: () => 'runtime-relay-e2e',
      getStartedAt: () => 1_700_000_000_000,
      getStatus: vi.fn().mockResolvedValue({ graphStatus: 'ready' }),
      cleanupSubscriptionsForConnection: vi.fn(),
      cancelMobileDictationForConnection: vi.fn(),
      onClientDisconnected: vi.fn()
    } as unknown as OrcaRuntimeService
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: runtimeDataPath,
      enableWebSocket: true,
      wsPort: 0
    })

    await server.start()
    try {
      await waitFor(() => server.getRelayStatus().state === 'connected')
      expect(
        server.createRelayPairingOffer({
          name: 'Invalid Scope',
          scope: 'admin' as never
        })
      ).toEqual({ available: false, reason: 'invalid_scope' })
      const offer = server.createRelayPairingOffer({
        name: 'Relay E2E',
        rotate: true,
        scope: 'runtime'
      })
      expect(offer.available).toBe(true)
      if (!offer.available) {
        throw new Error('Relay pairing unavailable')
      }
      expect(offer.endpoint).toContain('role=client')

      const pairing = parsePairingCode(offer.pairingUrl)
      expect(pairing).toBeTruthy()
      if (!pairing) {
        throw new Error('Relay pairing parse failed')
      }

      const connection = new RemoteRuntimeRequestConnection(pairing)
      try {
        const response = await connection.request<{ graphStatus: string }>(
          'status.get',
          undefined,
          2_000
        )
        expect(response).toMatchObject({
          ok: true,
          result: { graphStatus: 'ready' },
          _meta: { runtimeId: 'runtime-relay-e2e' }
        })
        expect(runtime.getStatus).toHaveBeenCalledTimes(1)
      } finally {
        connection.close()
      }
    } finally {
      await server.stop()
      await relay.stop()
    }
  })
})
