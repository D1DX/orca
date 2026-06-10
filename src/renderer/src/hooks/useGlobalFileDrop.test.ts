import { describe, expect, it } from 'vitest'
import {
  getEditorFileDropSettingsForWorktree,
  shouldUploadRemoteEditorFileDrop
} from './useGlobalFileDrop'

describe('shouldUploadRemoteEditorFileDrop', () => {
  it('does not upload editor drops for local workspaces', () => {
    expect(shouldUploadRemoteEditorFileDrop({ activeRuntimeEnvironmentId: null }, null)).toBe(false)
  })

  it('uploads editor drops while a runtime environment is active', () => {
    expect(shouldUploadRemoteEditorFileDrop({ activeRuntimeEnvironmentId: 'env-1' }, null)).toBe(
      true
    )
  })

  it('uploads editor drops for SSH workspaces', () => {
    expect(shouldUploadRemoteEditorFileDrop({ activeRuntimeEnvironmentId: null }, 'ssh-1')).toBe(
      true
    )
  })

  it('uses the worktree owner runtime instead of the focused runtime', () => {
    expect(
      getEditorFileDropSettingsForWorktree(
        {
          settings: { activeRuntimeEnvironmentId: 'focused-runtime' },
          repos: [{ id: 'repo-1', connectionId: null, executionHostId: 'runtime:owner-runtime' }],
          worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1' }] }
        },
        'wt-1'
      )
    ).toEqual({ activeRuntimeEnvironmentId: 'owner-runtime' })
  })

  it('keeps explicit local worktree editor drops local while a runtime is focused', () => {
    expect(
      getEditorFileDropSettingsForWorktree(
        {
          settings: { activeRuntimeEnvironmentId: 'focused-runtime' },
          repos: [{ id: 'repo-1', connectionId: null, executionHostId: 'local' }],
          worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1' }] }
        },
        'wt-1'
      )
    ).toEqual({ activeRuntimeEnvironmentId: null })
  })
})
