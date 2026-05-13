import type { WorkspaceSessionState } from '../../../../shared/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '@/lib/floating-terminal'

export function getFloatingTerminalSession(session: WorkspaceSessionState): WorkspaceSessionState {
  const tabs = session.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []
  const tabIds = new Set(tabs.map((tab) => tab.id))
  const activeTabId = session.activeTabIdByWorktree?.[FLOATING_TERMINAL_WORKTREE_ID] ?? null
  return {
    activeRepoId: null,
    activeWorktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    activeTabId,
    tabsByWorktree: tabs.length > 0 ? { [FLOATING_TERMINAL_WORKTREE_ID]: tabs } : {},
    terminalLayoutsByTabId: Object.fromEntries(
      Object.entries(session.terminalLayoutsByTabId).filter(([tabId]) => tabIds.has(tabId))
    ),
    activeTabIdByWorktree: {
      [FLOATING_TERMINAL_WORKTREE_ID]: activeTabId
    },
    activeWorktreeIdsOnShutdown: session.activeWorktreeIdsOnShutdown?.includes(
      FLOATING_TERMINAL_WORKTREE_ID
    )
      ? [FLOATING_TERMINAL_WORKTREE_ID]
      : []
  }
}

export async function persistFloatingTerminalSession(
  floatingPayload: WorkspaceSessionState
): Promise<void> {
  const current = await window.api.session.get()
  const currentFloatingTabs = current.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []
  const nextFloatingTabs = floatingPayload.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []
  const currentFloatingTabIds = new Set(currentFloatingTabs.map((tab) => tab.id))
  const nextFloatingTabIds = new Set(nextFloatingTabs.map((tab) => tab.id))
  const terminalLayoutsByTabId = Object.fromEntries(
    Object.entries(current.terminalLayoutsByTabId).filter(
      ([tabId]) => !currentFloatingTabIds.has(tabId)
    )
  )
  for (const [tabId, layout] of Object.entries(floatingPayload.terminalLayoutsByTabId)) {
    if (nextFloatingTabIds.has(tabId)) {
      terminalLayoutsByTabId[tabId] = layout
    }
  }
  const activeWorktreeIdsOnShutdown = new Set(current.activeWorktreeIdsOnShutdown ?? [])
  activeWorktreeIdsOnShutdown.delete(FLOATING_TERMINAL_WORKTREE_ID)
  if (floatingPayload.activeWorktreeIdsOnShutdown?.includes(FLOATING_TERMINAL_WORKTREE_ID)) {
    activeWorktreeIdsOnShutdown.add(FLOATING_TERMINAL_WORKTREE_ID)
  }
  await window.api.session.set({
    ...current,
    tabsByWorktree: {
      ...current.tabsByWorktree,
      [FLOATING_TERMINAL_WORKTREE_ID]: nextFloatingTabs
    },
    terminalLayoutsByTabId,
    activeTabIdByWorktree: {
      ...current.activeTabIdByWorktree,
      [FLOATING_TERMINAL_WORKTREE_ID]:
        floatingPayload.activeTabIdByWorktree?.[FLOATING_TERMINAL_WORKTREE_ID] ??
        nextFloatingTabs[0]?.id ??
        null
    },
    activeWorktreeIdsOnShutdown: Array.from(activeWorktreeIdsOnShutdown)
  })
}
