import type { GlobalSettings, Repo, WorkspaceHostScope } from '../../../../shared/types'
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import {
  buildExecutionHostRegistry,
  type ExecutionHostHealth
} from '../../../../shared/execution-host-registry'
import type { RuntimeCompatVerdict } from '../../../../shared/protocol-compat'
import type { SshConnectionState } from '../../../../shared/ssh-types'
import { translate } from '@/i18n/i18n'

export type SidebarHostOption = {
  id: ExecutionHostId
  label: string
  detail: string
  kind: 'local' | 'ssh' | 'runtime'
  health: ExecutionHostHealth
  // Why: surfaced to the sidebar host-header menu so it can warn on version skew.
  compatibility?: RuntimeCompatVerdict
}

export type SidebarHostScopeOption = {
  id: WorkspaceHostScope
  label: string
  detail: string
  health: ExecutionHostHealth | 'mixed'
}

export function buildSidebarHostOptions(args: {
  repos: readonly Pick<Repo, 'connectionId' | 'executionHostId'>[]
  sshTargetLabels: ReadonlyMap<string, string>
  sshConnectionStates?: ReadonlyMap<string, SshConnectionState>
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
}): SidebarHostOption[] {
  return buildExecutionHostRegistry({
    repos: args.repos,
    settings: args.settings,
    sshTargetLabels: args.sshTargetLabels,
    sshConnectionStates: args.sshConnectionStates
  })
}

export function shouldShowHostScopeControls(hosts: readonly SidebarHostOption[]): boolean {
  return hosts.some((host) => host.id !== LOCAL_EXECUTION_HOST_ID)
}

export function buildSidebarHostScopeOptions(
  hosts: readonly SidebarHostOption[]
): SidebarHostScopeOption[] {
  return [
    {
      id: ALL_EXECUTION_HOSTS_SCOPE,
      label: translate('auto.components.sidebar.sidebarHostOptions.3e102f111c', 'All hosts'),
      detail: hosts.map((host) => host.label).join(', '),
      health: 'mixed'
    },
    ...hosts.map((host) => ({
      id: host.id,
      label: host.label,
      detail: host.detail,
      health: host.health
    }))
  ]
}

export function getSidebarHostScopeLabel(
  scope: WorkspaceHostScope,
  options: readonly SidebarHostScopeOption[]
): string {
  return options.find((option) => option.id === scope)?.label ?? 'All hosts'
}

export function getSidebarHostHealthLabel(health: SidebarHostScopeOption['health']): string {
  switch (health) {
    case 'local':
      return 'Local'
    case 'available':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'blocked':
      return 'Update needed'
    case 'disconnected':
      return 'Disconnected'
    case 'error':
      return 'Needs attention'
    case 'mixed':
      return 'Mixed'
  }
}
