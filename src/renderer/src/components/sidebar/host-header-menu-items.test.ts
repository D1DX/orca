import { describe, expect, it } from 'vitest'
import { buildHostHeaderMenuModel } from './host-header-menu-items'

describe('buildHostHeaderMenuModel', () => {
  it('offers only Focus + Manage for the local host', () => {
    const model = buildHostHeaderMenuModel({ kind: 'local', health: 'local' })
    expect(model.actions).toEqual(['focus', 'manage'])
    expect(model.blocked).toBeNull()
  })

  it('offers Reconnect for a disconnected SSH host', () => {
    const model = buildHostHeaderMenuModel({
      kind: 'ssh',
      health: 'disconnected',
      sshConnected: false
    })
    expect(model.actions).toEqual(['focus', 'ssh-reconnect', 'manage'])
  })

  it('offers Disconnect for a connected SSH host', () => {
    const model = buildHostHeaderMenuModel({
      kind: 'ssh',
      health: 'available',
      sshConnected: true
    })
    expect(model.actions).toEqual(['focus', 'ssh-disconnect', 'manage'])
  })

  it('offers Check connection for a runtime host', () => {
    const model = buildHostHeaderMenuModel({ kind: 'runtime', health: 'available' })
    expect(model.actions).toEqual(['focus', 'runtime-check-connection', 'manage'])
  })

  it('surfaces a server-too-old block for a blocked runtime host', () => {
    const model = buildHostHeaderMenuModel({
      kind: 'runtime',
      health: 'blocked',
      compatibility: {
        kind: 'blocked',
        reason: 'server-too-old',
        clientProtocolVersion: 5,
        serverProtocolVersion: 1,
        requiredServerProtocolVersion: 4
      }
    })
    expect(model.blocked).toEqual({ reason: 'server-too-old' })
    expect(model.actions).toContain('runtime-check-connection')
  })

  it('surfaces a client-too-old block per verdict reason', () => {
    const model = buildHostHeaderMenuModel({
      kind: 'runtime',
      health: 'blocked',
      compatibility: {
        kind: 'blocked',
        reason: 'client-too-old',
        clientProtocolVersion: 1,
        serverProtocolVersion: 5,
        requiredClientProtocolVersion: 4
      }
    })
    expect(model.blocked).toEqual({ reason: 'client-too-old' })
  })

  it('does not surface a block when health is not blocked', () => {
    const model = buildHostHeaderMenuModel({
      kind: 'runtime',
      health: 'available',
      compatibility: { kind: 'ok', clientProtocolVersion: 5, serverProtocolVersion: 5 }
    })
    expect(model.blocked).toBeNull()
  })
})
