import { describe, expect, it } from 'vitest'
import { shouldRefreshWorktreeCardDecoration } from './WorktreeCardHelpers'

describe('shouldRefreshWorktreeCardDecoration', () => {
  it('skips card decoration refreshes only while the app is hidden', () => {
    expect(
      shouldRefreshWorktreeCardDecoration({ documentVisible: false, windowFocused: true })
    ).toBe(false)
    expect(
      shouldRefreshWorktreeCardDecoration({ documentVisible: true, windowFocused: false })
    ).toBe(true)
    expect(
      shouldRefreshWorktreeCardDecoration({ documentVisible: true, windowFocused: true })
    ).toBe(true)
  })
})
