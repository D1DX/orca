import { describe, expect, it, vi } from 'vitest'
import { getEditorExternalWatchTargets } from './useEditorExternalWatch'

vi.mock('@/store', () => ({
  useAppStore: {
    getState: vi.fn()
  }
}))
vi.mock('@/components/editor/editor-autosave', () => ({
  notifyEditorExternalFileChange: vi.fn(),
  getOpenFilesForExternalFileChange: vi.fn(() => [])
}))

describe('getEditorExternalWatchTargets', () => {
  const repo = { id: 'repo-1', path: '/repo', kind: 'git', connectionId: null }
  const worktree = { id: 'wt-1', repoId: 'repo-1', path: '/repo' }

  const makeState = (isDirty: boolean) =>
    ({
      openFiles: [
        {
          id: 'file-1',
          worktreeId: 'wt-1',
          filePath: '/repo/notes.md',
          relativePath: 'notes.md',
          isDirty
        }
      ],
      worktreesByRepo: { 'repo-1': [worktree] },
      repos: [repo],
      activeWorktreeId: null,
      settings: null
    }) as never

  it('preserves the snapshot when open-file metadata changes without changing watched roots', () => {
    const first = getEditorExternalWatchTargets(makeState(false))
    const second = getEditorExternalWatchTargets(makeState(true))

    expect(second).toBe(first)
    expect(second.targets).toEqual([
      {
        worktreeId: 'wt-1',
        worktreePath: '/repo',
        connectionId: undefined,
        runtimeEnvironmentId: undefined
      }
    ])
  })
})
