import { describe, expect, it } from 'vitest'
import {
  getResourceUsageAllWorktrees,
  getResourceUsageRepos,
  getResourceUsageRuntimePaneTitlesByTabId,
  getResourceUsageTabsByWorktree
} from './resource-usage-open-slices'
import type { AppState } from '../../store'

describe('resource usage open slices', () => {
  it('returns stable empty slices while the popover is closed', () => {
    const tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] } as unknown as AppState['tabsByWorktree']
    const runtimePaneTitlesByTabId = {
      'tab-1': { 'tab-1:0': 'Working' }
    } as AppState['runtimePaneTitlesByTabId']

    const closedTabs = getResourceUsageTabsByWorktree({ tabsByWorktree }, false)
    const closedTitles = getResourceUsageRuntimePaneTitlesByTabId(
      { runtimePaneTitlesByTabId },
      false
    )

    expect(closedTabs).toBe(getResourceUsageTabsByWorktree({ tabsByWorktree: {} }, false))
    expect(closedTitles).toBe(
      getResourceUsageRuntimePaneTitlesByTabId({ runtimePaneTitlesByTabId: {} }, false)
    )
    expect(closedTabs).toEqual({})
    expect(closedTitles).toEqual({})
  })

  it('returns live slices while the popover is open', () => {
    const tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] } as unknown as AppState['tabsByWorktree']
    const runtimePaneTitlesByTabId = {
      'tab-1': { 'tab-1:0': 'Working' }
    } as AppState['runtimePaneTitlesByTabId']

    expect(getResourceUsageTabsByWorktree({ tabsByWorktree }, true)).toBe(tabsByWorktree)
    expect(getResourceUsageRuntimePaneTitlesByTabId({ runtimePaneTitlesByTabId }, true)).toBe(
      runtimePaneTitlesByTabId
    )
  })

  it('gates repo and worktree slices while closed or runtime-backed', () => {
    const repos = [{ id: 'repo-1' }] as AppState['repos']
    const worktree = { id: 'wt-1', repoId: 'repo-1' }
    const worktreesByRepo = {
      'repo-1': [worktree]
    } as unknown as AppState['worktreesByRepo']

    expect(getResourceUsageRepos({ repos }, false, false)).toBe(
      getResourceUsageRepos({ repos: [] }, false, false)
    )
    expect(getResourceUsageAllWorktrees({ worktreesByRepo }, false, false)).toBe(
      getResourceUsageAllWorktrees({ worktreesByRepo: {} }, false, false)
    )
    expect(getResourceUsageRepos({ repos }, true, true)).toEqual([])
    expect(getResourceUsageAllWorktrees({ worktreesByRepo }, true, true)).toEqual([])
    expect(getResourceUsageRepos({ repos }, true, false)).toBe(repos)
    expect(getResourceUsageAllWorktrees({ worktreesByRepo }, true, false)).toEqual([worktree])
  })
})
