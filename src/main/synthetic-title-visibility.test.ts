import { describe, expect, it } from 'vitest'
import { shouldSendSyntheticTitleFrame } from './synthetic-title-visibility'

describe('shouldSendSyntheticTitleFrame', () => {
  it('skips decorative spinner frames only while the window is hidden', () => {
    expect(
      shouldSendSyntheticTitleFrame({ force: false, windowVisible: false, windowFocused: true })
    ).toBe(false)
    expect(
      shouldSendSyntheticTitleFrame({ force: false, windowVisible: true, windowFocused: false })
    ).toBe(true)
    expect(
      shouldSendSyntheticTitleFrame({ force: false, windowVisible: true, windowFocused: true })
    ).toBe(true)
  })

  it('always sends forced terminal-state frames', () => {
    expect(
      shouldSendSyntheticTitleFrame({ force: true, windowVisible: false, windowFocused: false })
    ).toBe(true)
  })
})
