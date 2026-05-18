import { parsePaneKey } from '../../../../shared/stable-pane-id'

type TabLookup = Record<string, { id: string }[]>

export type ResourceSessionNavigationDeps = {
  tabsByWorktree: TabLookup
  setOpen: (open: boolean) => void
  activateAndRevealWorktree: (worktreeId: string) => unknown
  activateTabAndFocusPane: (
    tabId: string,
    leafId: string | null,
    opts: { flashFocusedPane: true }
  ) => void
}

export function isResourceSessionActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}

export function navigateResourceSessionToTab(
  tabId: string,
  paneKey: string | null,
  deps: ResourceSessionNavigationDeps
): void {
  deps.setOpen(false)

  for (const [worktreeId, tabs] of Object.entries(deps.tabsByWorktree)) {
    if (tabs.some((tab) => tab.id === tabId)) {
      deps.activateAndRevealWorktree(worktreeId)
      break
    }
  }

  // Why: paneKey suffixes are stable UUID leaf ids after replay/reload.
  // Legacy numeric keys degrade to tab-only activation instead of guessing.
  const parsed = paneKey ? parsePaneKey(paneKey) : null
  deps.activateTabAndFocusPane(tabId, parsed?.tabId === tabId ? parsed.leafId : null, {
    flashFocusedPane: true
  })
}
