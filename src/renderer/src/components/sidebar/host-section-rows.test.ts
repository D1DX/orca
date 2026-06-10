import { describe, expect, it } from 'vitest'
import type { Repo, Worktree } from '../../../../shared/types'
import type { Row } from './worktree-list-groups'
import { addHostSectionRows, type HostSectionRow } from './host-section-rows'

function repo(id: string, connectionId?: string | null): Repo {
  return {
    id,
    path: `/${id}`,
    displayName: id,
    badgeColor: '#000000',
    addedAt: 0,
    connectionId
  }
}

function worktree(id: string, repoId: string): Worktree {
  return {
    id,
    repoId,
    path: `/${repoId}/${id}`,
    branch: `refs/heads/${id}`,
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    comment: '',
    isUnread: false,
    isPinned: false,
    displayName: id,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

function header(key: string, label = key): Extract<Row, { type: 'header' }> {
  return {
    type: 'header',
    key,
    label,
    count: 1,
    tone: 'text-foreground'
  }
}

function repoHeader(project: Repo): Extract<Row, { type: 'header' }> {
  return {
    ...header(`repo:${project.id}`, project.displayName),
    repo: project
  }
}

function item(id: string, project: Repo): Extract<Row, { type: 'item' }> {
  return {
    type: 'item',
    worktree: worktree(id, project.id),
    repo: project,
    depth: 0,
    groupDepth: 0,
    lineageTrail: [],
    isLastLineageChild: true,
    lineageChildCount: 0
  }
}

function rowKey(row: HostSectionRow): string {
  return row.type === 'item' ? row.worktree.id : row.key
}

describe('addHostSectionRows', () => {
  it('does not add host headers for a specific host scope', () => {
    const local = repo('local')
    const rows = [repoHeader(local), item('local-wt', local)]

    const sectioned = addHostSectionRows({
      rows,
      hostOptions: [
        { id: 'local', label: 'Local Mac', detail: 'This computer', health: 'local' },
        { id: 'ssh:ssh-1', label: 'Builder', detail: 'SSH', health: 'available' }
      ],
      workspaceHostScope: 'local',
      defaultHostId: 'local'
    })

    expect(sectioned).toHaveLength(2)
    expect(sectioned).toEqual(rows)
  })

  it('does not add host headers when only the local host exists', () => {
    const local = repo('local')
    const rows = [repoHeader(local), item('local-wt', local)]

    expect(
      addHostSectionRows({
        rows,
        hostOptions: [
          { id: 'local', label: 'Local Mac', detail: 'This computer', health: 'local' }
        ],
        workspaceHostScope: 'all',
        defaultHostId: 'local'
      })
    ).toEqual(rows)
  })

  it('groups rows under host headers in all-host scope', () => {
    const local = repo('local')
    const ssh = repo('ssh', 'ssh-1')
    const rows = [repoHeader(local), item('local-wt', local), repoHeader(ssh), item('ssh-wt', ssh)]

    const sectioned = addHostSectionRows({
      rows,
      hostOptions: [
        { id: 'local', label: 'Local Mac', detail: 'This computer', health: 'local' },
        { id: 'ssh:ssh-1', label: 'Builder', detail: 'SSH', health: 'available' }
      ],
      workspaceHostScope: 'all',
      defaultHostId: 'local'
    })

    expect(sectioned.map(rowKey)).toEqual([
      'host:local',
      'repo:local',
      'local-wt',
      'host:ssh:ssh-1',
      'repo:ssh',
      'ssh-wt'
    ])
    expect(sectioned.filter((row) => row.type === 'host-header')).toMatchObject([
      { label: 'Local Mac', count: 1 },
      { label: 'Builder', count: 1 }
    ])
  })

  it('keeps non-repo group headers with the following host-owned rows', () => {
    const local = repo('local')
    const ssh = repo('ssh', 'ssh-1')
    const rows = [header('all'), item('local-wt', local), header('done'), item('ssh-wt', ssh)]

    const sectioned = addHostSectionRows({
      rows,
      hostOptions: [
        { id: 'local', label: 'Local Mac', detail: 'This computer', health: 'local' },
        { id: 'ssh:ssh-1', label: 'Builder', detail: 'SSH', health: 'available' }
      ],
      workspaceHostScope: 'all',
      defaultHostId: 'local'
    })

    expect(sectioned.map(rowKey)).toEqual([
      'host:local',
      'all',
      'local-wt',
      'host:ssh:ssh-1',
      'done',
      'ssh-wt'
    ])
  })

  it('uses the focused runtime as the owner for non-SSH repos', () => {
    const project = repo('runtime-project')
    const rows = [repoHeader(project), item('runtime-wt', project)]

    const sectioned = addHostSectionRows({
      rows,
      hostOptions: [
        { id: 'local', label: 'Local Mac', detail: 'This computer', health: 'local' },
        { id: 'runtime:env-1', label: 'env-1', detail: 'Orca server', health: 'available' }
      ],
      workspaceHostScope: 'all',
      defaultHostId: 'runtime:env-1'
    })

    expect(sectioned[0]).toMatchObject({
      type: 'host-header',
      key: 'host:runtime:env-1',
      label: 'env-1'
    })
  })
})
