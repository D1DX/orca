import { describe, expect, it } from 'vitest'
import { shouldRunWorkspacePortScan } from './WorkspacePortScanner'

describe('shouldRunWorkspacePortScan', () => {
  it('runs only while the document is visible', () => {
    expect(shouldRunWorkspacePortScan({ documentVisible: true, windowFocused: true })).toBe(true)
    expect(shouldRunWorkspacePortScan({ documentVisible: false, windowFocused: true })).toBe(false)
    expect(shouldRunWorkspacePortScan({ documentVisible: true, windowFocused: false })).toBe(true)
    expect(shouldRunWorkspacePortScan({ documentVisible: false, windowFocused: false })).toBe(false)
  })
})
