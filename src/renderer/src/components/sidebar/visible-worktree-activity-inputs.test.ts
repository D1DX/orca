import { describe, expect, it } from 'vitest'
import type { BrowserWorkspace, TerminalTab } from '../../../../shared/types'
import {
  getVisibleWorktreeBrowserActivityTabs,
  getVisibleWorktreeTerminalActivityTabs
} from './visible-worktree-activity-inputs'

function terminalTab(id: string, title: string): TerminalTab {
  return {
    id,
    ptyId: id,
    worktreeId: 'wt-1',
    title,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
}

function browserTab(id: string, title: string): BrowserWorkspace {
  return {
    id,
    worktreeId: 'wt-1',
    activePageId: `${id}-page`,
    pageIds: [`${id}-page`],
    url: 'https://example.com',
    title,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0
  }
}

describe('visible worktree activity inputs', () => {
  it('preserves terminal activity projection when only tab metadata changes', () => {
    const first = getVisibleWorktreeTerminalActivityTabs({
      'wt-1': [terminalTab('tab-1', 'First')]
    })

    const second = getVisibleWorktreeTerminalActivityTabs({
      'wt-1': [terminalTab('tab-1', 'Renamed')]
    })

    expect(second).toBe(first)
    expect(second['wt-1']).toBe(first['wt-1'])
  })

  it('updates terminal activity projection when tab ids change', () => {
    const first = getVisibleWorktreeTerminalActivityTabs({
      'wt-1': [terminalTab('tab-1', 'First')]
    })

    const second = getVisibleWorktreeTerminalActivityTabs({
      'wt-1': [terminalTab('tab-1', 'First'), terminalTab('tab-2', 'Second')]
    })

    expect(second).not.toBe(first)
    expect(second['wt-1']?.map((tab) => tab.id)).toEqual(['tab-1', 'tab-2'])
  })

  it('preserves browser activity projection when only browser metadata changes', () => {
    const first = getVisibleWorktreeBrowserActivityTabs({
      'wt-1': [browserTab('browser-1', 'First')]
    })

    const second = getVisibleWorktreeBrowserActivityTabs({
      'wt-1': [browserTab('browser-1', 'Renamed')]
    })

    expect(second).toBe(first)
    expect(second['wt-1']).toBe(first['wt-1'])
  })

  it('updates browser activity projection when browser ids change', () => {
    const first = getVisibleWorktreeBrowserActivityTabs({
      'wt-1': [browserTab('browser-1', 'First')]
    })

    const second = getVisibleWorktreeBrowserActivityTabs({
      'wt-1': [browserTab('browser-2', 'Second')]
    })

    expect(second).not.toBe(first)
    expect(second['wt-1']?.map((tab) => tab.id)).toEqual(['browser-2'])
  })
})
