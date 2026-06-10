import { describe, expect, it } from 'vitest'
import {
  buildSidebarHostOptions,
  buildSidebarHostScopeOptions,
  getSidebarHostHealthLabel,
  shouldShowHostScopeControls
} from './sidebar-host-options'

describe('sidebar host options', () => {
  it('hides host controls for local-only workspaces', () => {
    const hosts = buildSidebarHostOptions({
      repos: [{ connectionId: null }],
      sshTargetLabels: new Map(),
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(hosts).toEqual([
      {
        id: 'local',
        label: 'Local Mac',
        detail: 'This computer',
        kind: 'local',
        health: 'local'
      }
    ])
    expect(shouldShowHostScopeControls(hosts)).toBe(false)
  })

  it('includes SSH hosts from labels and repos', () => {
    const hosts = buildSidebarHostOptions({
      repos: [{ connectionId: 'ssh-from-repo' }],
      sshTargetLabels: new Map([['ssh-saved', 'Saved SSH']]),
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(hosts.map((host) => host.id)).toEqual(['local', 'ssh:ssh-saved', 'ssh:ssh-from-repo'])
    expect(hosts.map((host) => host.health)).toEqual(['local', 'disconnected', 'disconnected'])
    expect(shouldShowHostScopeControls(hosts)).toBe(true)
  })

  it('includes SSH health in options', () => {
    const hosts = buildSidebarHostOptions({
      repos: [{ connectionId: 'ssh-1' }],
      sshTargetLabels: new Map([['ssh-1', 'Builder']]),
      sshConnectionStates: new Map([
        [
          'ssh-1',
          {
            targetId: 'ssh-1',
            status: 'connected',
            error: null,
            reconnectAttempt: 0
          }
        ]
      ]),
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(hosts.find((host) => host.id === 'ssh:ssh-1')).toMatchObject({
      label: 'Builder',
      health: 'available'
    })
  })

  it('includes the focused runtime compatibility host', () => {
    const hosts = buildSidebarHostOptions({
      repos: [],
      sshTargetLabels: new Map(),
      settings: { activeRuntimeEnvironmentId: 'runtime-1' }
    })

    expect(hosts.map((host) => host.id)).toEqual(['local', 'runtime:runtime-1'])
    expect(hosts.find((host) => host.id === 'runtime:runtime-1')).toMatchObject({
      detail: 'Orca server',
      health: 'available'
    })
  })

  it('builds all-host plus focused-host scope options', () => {
    const hosts = buildSidebarHostOptions({
      repos: [{ connectionId: 'ssh-1' }],
      sshTargetLabels: new Map([['ssh-1', 'Builder']]),
      settings: { activeRuntimeEnvironmentId: null }
    })

    expect(buildSidebarHostScopeOptions(hosts)).toMatchObject([
      { id: 'all', label: 'All hosts', detail: 'Local Mac, Builder', health: 'mixed' },
      { id: 'local', label: 'Local Mac', health: 'local' },
      { id: 'ssh:ssh-1', label: 'Builder', health: 'disconnected' }
    ])
  })

  it('labels host health for compact sidebar UI', () => {
    expect(getSidebarHostHealthLabel('available')).toBe('Connected')
    expect(getSidebarHostHealthLabel('connecting')).toBe('Connecting')
    expect(getSidebarHostHealthLabel('blocked')).toBe('Update needed')
    expect(getSidebarHostHealthLabel('error')).toBe('Needs attention')
  })
})
