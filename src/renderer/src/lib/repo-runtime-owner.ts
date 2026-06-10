import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type { GlobalSettings, Repo } from '../../../shared/types'

export type RepoRuntimeOwnerState = {
  repos?: readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[]
  settings?: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
}

export function getRuntimeEnvironmentIdForRepo(
  state: RepoRuntimeOwnerState,
  repoId: string | null | undefined
): string | null {
  if (!repoId) {
    return null
  }
  const repo = state.repos?.find((entry) => entry.id === repoId)
  const hasExplicitOwner = Boolean(repo?.executionHostId?.trim() || repo?.connectionId?.trim())
  if (repo && hasExplicitOwner) {
    const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
    return parsed?.kind === 'runtime' ? parsed.environmentId : null
  }
  return state.settings?.activeRuntimeEnvironmentId?.trim() || null
}

export function getSettingsForRepoRuntimeOwner(
  state: RepoRuntimeOwnerState,
  repoId: string | null | undefined
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> {
  return {
    ...state.settings,
    activeRuntimeEnvironmentId: getRuntimeEnvironmentIdForRepo(state, repoId)
  }
}
