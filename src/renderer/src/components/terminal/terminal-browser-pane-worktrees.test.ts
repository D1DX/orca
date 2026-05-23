import { describe, expect, it } from 'vitest'
import {
  getTerminalBrowserPaneWorktreeIds,
  shouldRenderPreReadyBrowserPaneFallback
} from './terminal-browser-pane-worktrees'

describe('getTerminalBrowserPaneWorktreeIds', () => {
  it('returns mounted worktrees unchanged for normal mounted browser panes', () => {
    const mounted = ['wt-active']

    const result = getTerminalBrowserPaneWorktreeIds({
      mountedWorktreeIds: mounted,
      worktreeIds: ['wt-active'],
      activeWorktreeId: 'wt-active',
      activeTabType: 'browser',
      activeBrowserTabCount: 1
    })

    expect(result).toBe(mounted)
  })

  it('adds the active browser worktree before terminal panes are allowed to mount', () => {
    const result = getTerminalBrowserPaneWorktreeIds({
      mountedWorktreeIds: [],
      worktreeIds: ['wt-active'],
      activeWorktreeId: 'wt-active',
      activeTabType: 'browser',
      activeBrowserTabCount: 1
    })

    expect(result).toEqual(['wt-active'])
  })

  it('does not add missing or non-browser active worktrees', () => {
    expect(
      getTerminalBrowserPaneWorktreeIds({
        mountedWorktreeIds: [],
        worktreeIds: ['wt-other'],
        activeWorktreeId: 'wt-active',
        activeTabType: 'browser',
        activeBrowserTabCount: 1
      })
    ).toEqual([])

    expect(
      getTerminalBrowserPaneWorktreeIds({
        mountedWorktreeIds: [],
        worktreeIds: ['wt-active'],
        activeWorktreeId: 'wt-active',
        activeTabType: 'terminal',
        activeBrowserTabCount: 1
      })
    ).toEqual([])
  })

  it('flags only active unmounted browser worktrees for pre-ready fallback rendering', () => {
    expect(
      shouldRenderPreReadyBrowserPaneFallback({
        worktreeIds: ['wt-active'],
        activeWorktreeId: 'wt-active',
        activeTabType: 'browser',
        activeBrowserTabCount: 1,
        activeWorktreeMounted: false
      })
    ).toBe(true)

    expect(
      shouldRenderPreReadyBrowserPaneFallback({
        worktreeIds: ['wt-active'],
        activeWorktreeId: 'wt-active',
        activeTabType: 'browser',
        activeBrowserTabCount: 1,
        activeWorktreeMounted: true
      })
    ).toBe(false)
    expect(
      shouldRenderPreReadyBrowserPaneFallback({
        worktreeIds: ['wt-active'],
        activeWorktreeId: 'wt-active',
        activeTabType: 'terminal',
        activeBrowserTabCount: 1,
        activeWorktreeMounted: false
      })
    ).toBe(false)
  })
})
