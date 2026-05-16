# Diff Tab File Tree

## Problem

Source Control has the only file-tree navigation for combined diffs today.
`SourceControl.tsx` builds and renders branch tree rows (`treeRootsByArea`/`visibleBranchTreeRows`, "Committed on Branch", "View all" at `openBranchAllDiffs`).

`CombinedDiffViewer` owns:
- entry selection (`entries` from snapshot/live fallback)
- section identity (`section.key`)
- virtualized rendering + incremental runtime diff loading (`getRuntimeGitDiff`, `getRuntimeGitBranchDiff`, `getRuntimeGitCommitDiff`)

It currently has no in-tab tree, so navigation in combined tabs is linear.

## Goal

Add a left file tree inside `CombinedDiffViewer` for combined uncommitted/branch/commit tabs.
Tree clicks must navigate existing virtualized sections and use existing section loading only.

## Non-goals

- Source Control list/tree redesign
- New git/diff backend APIs
- Replacing combined diff virtualization/scheduler/cache
- Persisting tree width/collapse state

## Design

1. Build tree from `entries` already chosen by `CombinedDiffViewer`.
- Do not read alternative store slices for tree data.
- Tree content must match section content exactly for that tab instance.

2. Reuse existing tree builders.
- Uncommitted: `buildGitStatusSourceControlTree` + `compactSourceControlTree` + `flattenSourceControlTree`
- Branch/commit: `buildSourceControlTree` + `compactSourceControlTree` + `flattenSourceControlTree`

3. Do not translate via tree node keys.
- Tree file keys are `${area}::${entry.path}` (`entry.path`, not normalized node path).
- Section keys are `${prefix}:${entry.path}` where prefix is:
  - uncommitted: `entry.area`
  - branch: `combined-branch`
  - commit: `combined-commit`
- Build navigation target from `node.entry`, not by rewriting `node.key`.

4. Click behavior.
- Resolve section index from `section.key -> index` map rebuilt on `sections` change.
- If target section is collapsed, expand via existing `toggleSection(index)` (this already queues load on expand).
- Scroll with `virtualizer.scrollToIndex(index, { align: 'start' })`.
- Do not call loaders directly with new codepaths.

5. Layout.
- Render tree + diff in a horizontal split under existing toolbar/header area.
- Keep diff pane as the only vertical scroll container used by virtualizer.
- Follow `docs/STYLEGUIDE.md` tokens/primitives only.

## Correctness Constraints

- Preserve empty/error/conflict-skipped states and existing toolbar actions.
- Preserve runtime/SSH behavior by keeping current loader calls and `connectionId` wiring untouched.
- Preserve section cache semantics (`entrySignature`, `generationRef`, module-level caches).

## Invalidation and Concurrency

- Recompute section lookup map whenever `sections` changes.
- `toggleSection` mutates collapse state asynchronously; navigation should tolerate a short stale frame between expand and scroll.
- Rely on existing generation guard (`generationRef`) for stale async loads when entries change mid-flight.
- Keep tree collapse UI state local to the combined tab; do not couple to Source Control’s `collapsedTreeDirs` state.
- Combined diff caches are renderer-process local; no cross-window synchronization.

## Important Existing Behavior to Keep (and Document)

- Uncommitted tabs use `uncommittedEntriesSnapshot` when present; otherwise `getCombinedUncommittedEntries(...)` fallback.
- Commit tabs are snapshot-only (`commitEntriesSnapshot ?? []`).
- Branch tabs currently use `branchEntriesSnapshot` only when snapshot length is `> 0`, otherwise they fall back to live branch entries.

That last branch rule is a real consistency edge case: a tab opened with an empty snapshot can later show newly refreshed live entries. If stability is required, this should be fixed in implementation (use `undefined` vs defined-empty as the fallback gate), not papered over in tree code.

## Edge Cases

- Same path across staged/unstaged/untracked: keep area-specific section identity.
- Renames: navigate by current `path`; preserve `oldPath` for loader/open actions.
- Click during entry-set replacement: no-op safely if section index/key disappears.
- Tabs created before snapshot fields existed: tree must mirror current fallback filtering (including unresolved conflict exclusion).

## Feasibility

- There is no "load all rendered sections in one call" API in current runtime diff APIs.
- Tree navigation is a section jump aid over existing lazy per-section loading.
- Reusing Source Control tree builders is feasible; selection/open state must remain local to combined diff viewer.

## Rollout

1. Add `CombinedDiffFileTree` in `src/renderer/src/components/editor/`.
2. Feed it the already-resolved `entries` from `CombinedDiffViewer`.
3. Add mode-aware section-key mapping from row entry metadata.
4. Wire row click to `toggleSection` (if needed) + `scrollToIndex`.
5. Add focused tests for:
- area-disambiguated same-path uncommitted entries
- branch/commit key mapping
- collapsed target navigation
- branch empty-snapshot fallback behavior (documented current behavior or fixed behavior, whichever is chosen)
6. Run renderer typecheck/lint/tests.
