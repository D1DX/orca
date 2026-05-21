import { describe, expect, it } from 'vitest'
import { getBrowserPagesForWorkspace, shouldPollChromiumErrorPage } from './BrowserPane'
import type { BrowserPage } from '../../../../shared/types'

describe('shouldPollChromiumErrorPage', () => {
  it('runs the fallback chrome-error poll only for the active loading browser pane', () => {
    expect(shouldPollChromiumErrorPage({ isActive: true, loading: true })).toBe(true)
    expect(shouldPollChromiumErrorPage({ isActive: false, loading: true })).toBe(false)
    expect(shouldPollChromiumErrorPage({ isActive: true, loading: false })).toBe(false)
    expect(shouldPollChromiumErrorPage({ isActive: false, loading: false })).toBe(false)
  })
})

describe('getBrowserPagesForWorkspace', () => {
  it('returns only the owning workspace page array so unrelated page updates keep the selector stable', () => {
    const pages = [{ id: 'page-1' }] as BrowserPage[]
    const browserPagesByWorkspace = {
      workspaceA: pages,
      workspaceB: [{ id: 'page-2' }] as BrowserPage[]
    }

    expect(getBrowserPagesForWorkspace(browserPagesByWorkspace, 'workspaceA')).toBe(pages)
    expect(
      getBrowserPagesForWorkspace(
        { ...browserPagesByWorkspace, workspaceB: [{ id: 'page-3' }] as BrowserPage[] },
        'workspaceA'
      )
    ).toBe(pages)
    expect(getBrowserPagesForWorkspace(browserPagesByWorkspace, 'missing')).toBe(
      getBrowserPagesForWorkspace({}, 'missing')
    )
  })
})
