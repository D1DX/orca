import { describe, expect, it } from 'vitest'
import {
  formatWindowShortcutBinding,
  isRecordableWindowShortcutBinding,
  normalizeWindowShortcutBindings
} from './window-shortcut-bindings'

describe('window shortcut bindings', () => {
  it('normalizes persisted custom bindings and drops unsafe bare keys', () => {
    expect(
      normalizeWindowShortcutBindings({
        openQuickOpen: { key: 'k', code: 'KeyK', meta: true },
        toggleLeftSidebar: { key: 'b', code: 'KeyB', shift: true },
        unknown: { key: 'x', meta: true }
      })
    ).toEqual({
      openQuickOpen: { key: 'k', code: 'KeyK', meta: true }
    })
  })

  it('requires a non-shift modifier for recorded app shortcuts', () => {
    expect(isRecordableWindowShortcutBinding({ key: 'k', shift: true })).toBe(false)
    expect(isRecordableWindowShortcutBinding({ key: 'k', alt: true })).toBe(true)
  })

  it('formats modifier labels for each platform', () => {
    const binding = { key: 'ArrowLeft', code: 'ArrowLeft', meta: true, alt: true, shift: true }

    expect(formatWindowShortcutBinding(binding, true)).toEqual(['⌘', '⌥', '⇧', '←'])
    expect(formatWindowShortcutBinding(binding, false)).toEqual(['Meta', 'Alt', 'Shift', '←'])
  })
})
