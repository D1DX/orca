export type WorktreeRepoAssociation = {
  repoId: string
  repoIds?: readonly string[] | null
}

export function normalizeWorktreeRepoIds(
  primaryRepoId: string,
  repoIds?: readonly string[] | null
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const add = (repoId: string | null | undefined): void => {
    const trimmed = repoId?.trim()
    if (!trimmed || seen.has(trimmed)) {
      return
    }
    seen.add(trimmed)
    result.push(trimmed)
  }

  add(primaryRepoId)
  for (const repoId of repoIds ?? []) {
    add(repoId)
  }
  return result
}

export function getWorktreeRepoIds(worktree: WorktreeRepoAssociation): string[] {
  return normalizeWorktreeRepoIds(worktree.repoId, worktree.repoIds)
}

export function getWorktreeRepoGroupKey(worktree: WorktreeRepoAssociation): string {
  const repoIds = getWorktreeRepoIds(worktree)
  if (repoIds.length <= 1) {
    return `repo:${repoIds[0] ?? worktree.repoId}`
  }

  // Why: the first repo decides the physical worktree location, but repo
  // grouping is organizational. Sort IDs so A+B and B+A share one group.
  return `repo:${repoIds.map(encodeURIComponent).sort().join('+')}`
}
