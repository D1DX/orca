import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installWorktreeVisibleRefreshVisibilityListener } from './WorktreeList'

describe('installWorktreeVisibleRefreshVisibilityListener', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('subscribes to document visibility changes so visible PR refresh can rerun on return', () => {
    const listeners = new Map<string, () => void>()
    const onChange = vi.fn()
    const removeEventListener = vi.fn()

    vi.stubGlobal('document', {
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners.set(event, listener)
      }),
      removeEventListener
    })

    const cleanup = installWorktreeVisibleRefreshVisibilityListener(onChange)

    listeners.get('visibilitychange')?.()
    expect(onChange).toHaveBeenCalledTimes(1)

    cleanup()
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', onChange)
  })

  it('keeps the visibility listener wired into the visible PR refresh effect', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./WorktreeList.tsx', import.meta.url)),
      'utf-8'
    )

    expect(source).toContain('installWorktreeVisibleRefreshVisibilityListener(() => {')
    expect(source).toContain('setDocumentVisibilityRevision((revision) => revision + 1)')
    expect(source).toMatch(/documentVisibilityRevision,\n\s+groupBy,/)
  })
})
