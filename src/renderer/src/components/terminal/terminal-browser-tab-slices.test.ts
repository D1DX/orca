import { describe, expect, it } from 'vitest'
import type { BrowserTab } from '../../../../shared/types'
import { getTerminalBrowserTabSlices } from './terminal-browser-tab-slices'

const browserTab = (id: string): BrowserTab => ({
  id,
  worktreeId: 'wt-active',
  url: `https://example.com/${id}`,
  title: id,
  loading: false,
  faviconUrl: null,
  canGoBack: false,
  canGoForward: false,
  loadError: null,
  createdAt: 0
})

describe('getTerminalBrowserTabSlices', () => {
  it('preserves slices when an unmounted worktree browser tab array changes', () => {
    const activeBrowserTabs = [browserTab('active')]
    const mountedIds = new Set(['wt-active'])
    const first = getTerminalBrowserTabSlices(
      { 'wt-active': activeBrowserTabs, 'wt-hidden': [browserTab('hidden-a')] },
      mountedIds,
      'wt-active'
    )
    const second = getTerminalBrowserTabSlices(
      { 'wt-active': activeBrowserTabs, 'wt-hidden': [browserTab('hidden-b')] },
      mountedIds,
      'wt-active'
    )

    expect(second).toBe(first)
    expect(second.activeBrowserTabs).toBe(activeBrowserTabs)
  })

  it('updates slices when a mounted worktree browser tab array changes', () => {
    const mountedIds = new Set(['wt-active', 'wt-mounted'])
    const first = getTerminalBrowserTabSlices(
      { 'wt-active': [browserTab('active')], 'wt-mounted': [browserTab('mounted-a')] },
      mountedIds,
      'wt-active'
    )
    const mountedBrowserTabs = [browserTab('mounted-b')]
    const second = getTerminalBrowserTabSlices(
      { 'wt-active': first.activeBrowserTabs, 'wt-mounted': mountedBrowserTabs },
      mountedIds,
      'wt-active'
    )

    expect(second).not.toBe(first)
    expect(second.mountedBrowserTabsByWorktree['wt-mounted']).toBe(mountedBrowserTabs)
  })
})
