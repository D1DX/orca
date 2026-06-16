# Source Control Create PR Flow

## Problem

- The Source Control primary action still makes users walk the PR path step by step: dirty worktrees surface `Stage All` first, then `Commit`, then a remote action, then the hosted-review composer. The key priority rows live in `src/renderer/src/components/right-sidebar/source-control-primary-action.ts:124` and `src/renderer/src/components/right-sidebar/source-control-primary-action.ts:160`.
- The existing commit and AI generation paths are separate user actions even though they already have reusable single-flight guards and runtime/SSH routing in `src/renderer/src/components/right-sidebar/SourceControl.tsx:1468` and `src/renderer/src/components/right-sidebar/SourceControl.tsx:1569`. `handleCommit()` already returns `boolean`, but it captures the current textarea draft and cannot commit an explicit generated message unless the helper is extracted or extended.
- The hosted-review composer only opens when `hostedReviewCreation.canCreate === true` at `src/renderer/src/components/right-sidebar/SourceControl.tsx:2195`; earlier PR-prep states such as `dirty` or `needs_push` stay in the commit/remote-action surface.
- `push_create_pr` currently only runs `runRemoteAction('push')` at `src/renderer/src/components/right-sidebar/SourceControl.tsx:2620`, so "Push before PR" still leaves the user waiting for state to settle and then clicking Create PR manually.
- Main-process hosted-review creation correctly blocks unsafe states, including dirty trees, unpublished branches, unsynced branches, and unauthenticated providers in `src/main/source-control/hosted-review-creation.ts:338`.
- Conductor's documented workflow makes creating the pull request a first-class action: "Create a pull request" from the workspace, with AI help drafting the PR description and checks tracked after opening. Their changelog also treats compact Create PR / draft PR buttons as git-panel affordances. Sources: https://www.conductor.build/docs/concepts/workflow and https://www.conductor.build/changelog.

## Goal

Make the Source Control primary action feel like a PR-oriented finish flow without bypassing Orca's git safety checks:

1. A user with local changes can start from a visible `Create PR` affordance in the Source Control action band.
2. Orca prepares only the safe prerequisites it can perform from existing primitives: stage, commit with an existing or AI-generated message, push/publish when required, then show the existing hosted-review composer.
3. The final hosted-review creation still goes through the existing store/runtime/main-process preflight; the intent flow may only move the branch into an eligible state.
4. Users can understand where commit-message and PR-description AI behavior comes from and can jump to the existing per-action Source Control AI settings when the flow needs configuration.

## Non-goals

- Do not create reviews for providers that are not already supported by hosted-review creation.
- Do not remove the chevron menu, manual `Stage All`, manual `Commit`, or existing remote actions.
- Do not create commits without an explicit existing commit message or a successfully generated Source Control AI message.
- Do not make GitHub-only assumptions; GitLab merge request copy and behavior must stay provider-aware.
- Do not change mobile Source Control.

## Design

1. Add a Source Control "Create PR intent" path in `SourceControl.tsx`.
   - Track a per-worktree in-flight flag plus compact status/error copy and a captured run token `{ repoId, worktreeId, worktreePath, branch, startedAt }`.
   - Gate the start on every existing mutating operation for that worktree: bulk stage/unstage/discard, commit, commit-message generation, remote action, PR-field generation, and hosted-review creation. Do not let the intent queue behind a stale snapshot.
   - The sequence owns only orchestration. It must not call raw git or hosted-review IPC directly; staging/commit/generation use runtime-aware helpers, hosted-review eligibility/creation continue through the store slice, and every post-await continuation verifies the captured worktree and branch are still current.
   - Per-worktree React state only coordinates this renderer window. Multi-window and terminal mutations remain possible, so correctness comes from post-mutation re-reads and the main-process hosted-review preflight, not from the in-flight flag.
   - Keep this separate from `isCreatingPr` and PR-detail generation state. The existing eligibility effect intentionally skips refreshes while PR generation/submission is active; if the prep flow reused those flags, eligibility could never advance to `canCreate` after commit/push.

2. Add an explicit PR-intent primary state instead of overloading today's `create_pr` state.
   - Today `CreateHostedReviewComposer` only renders when `resolvePrimaryAction()` returns `create_pr`, which currently means `hostedReviewCreation.canCreate === true`. Dirty, unpublished, and needs-push states still render `CommitArea`.
   - Add a new resolver input such as `prIntentEligible`/`prIntentInFlight` or a new primary kind that can label the action band `Create PR` while the branch is still in a preparatory state. Keep the existing final `create_pr` kind for the composer-ready state so `CreateHostedReviewComposer` continues to mean "eligible to create now."
   - Enable the intent only for prep blockers the sequence can safely clear: dirty local changes, clean `no_upstream` branches with a current branch and branch commits to publish, `needs_push`, and `needs_sync` only when `shouldForcePushWithLeaseForUpstream(remoteStatus)` is true. A dirty unpublished branch with no branch commits may still be eligible because the sequence can create the first commit, refresh `branchCommitsAhead`, then publish. For ordinary behind/diverged branches, show blocked guidance (`Sync first`) or leave the existing Sync/Pull primary; do not hide that remote changes require an explicit user action.
   - Dirty trees still have safe blockers in the tooltip and dropdown; the button starts the intent sequence instead of directly calling `createHostedReview`. A dirty tree may not have reached the auth check yet, because hosted-review eligibility checks auth only after the branch is clean, published, and not behind; after preparation, auth-required must surface through the existing blocked state.
   - Existing disabled states for conflicts, detached HEAD, default branch, auth-required, unsupported provider, and existing review remain unchanged.

3. Prepare local changes conservatively.
   - If there are stageable unstaged/untracked entries, stage only the paths returned by `getStageAllPaths(grouped.unstaged, 'unstaged')` and `getStageAllPaths(grouped.untracked, 'untracked')`, using the same `bulkStageRuntimeGitPaths` path as `handleStageAllPrimary()`. This preserves the existing unresolved-conflict skip behavior.
   - Refresh status after staging before deciding whether a commit is still needed; external git mutations and path filtering can make the original `grouped` snapshot stale. `refreshActiveGitStatusAfterMutation()` swallows refresh failures for normal UI recovery, so the intent path needs either a result-returning refresh/re-read helper or an explicit fresh `getRuntimeGitStatus` check before continuing.
   - If staged changes remain and a commit message is present, commit that exact captured message and continue only when the commit returns `true`. Existing `handleCommit()` already reports success/failure, but it captures `commitMessage` from React state; extract an explicit-message helper or add a message override for generated messages.
   - If no message is present and Source Control AI has saved defaults, do not call `handleGenerate()` and then hope React state lands before committing. That handler returns `void` and only writes the draft if the textarea is still empty. Instead extract or add a result-returning helper around `generateRuntimeCommitMessage(...)`, then commit the returned message only if the captured worktree/branch is still current and the user has not typed a message meanwhile.
   - Treat "defaults are configured" the same way the current Generate button does: repo action overrides, global Source Control AI action/global agent settings, and legacy commit-message AI can qualify. If those defaults are missing, the resolved AI config is not OK, the custom command is empty, or generation would open the picker/dialog, stop after staging and show a compact inline prompt to generate or type a message. Do not fabricate a commit or auto-open the picker from the intent flow.

4. Continue through remote prerequisites.
   - Refresh git status/upstream and hosted-review eligibility after each mutation before deciding the next step. Refresh branch compare after commit and remote mutations; staging alone does not affect branch compare.
   - `runRemoteAction()` currently returns `Promise<void>` and swallows failures into `remoteActionErrors`, so it is not safe to chain after it blindly. Add a result-returning wrapper for the intent path, or change `runRemoteAction` to return `boolean` while preserving existing UI behavior.
   - If no upstream exists after the refreshed post-commit state shows branch commits ahead, publish with the existing push target and repo-owner runtime settings.
   - If the branch is ahead only, push.
   - If the branch is `needs_sync` because remote commits are behind/diverged and not patch-equivalent, stop with the existing sync/rebase guidance rather than auto-pulling or merging remote changes into a PR flow.
   - If `behindCommitsArePatchEquivalent === true`, use the existing force-with-lease decision path and continue only after a successful refresh shows the branch is eligible.

5. Reuse the existing hosted-review composer for final PR/MR details.
   - Open the composer only after refreshed hosted-review eligibility reaches `canCreate`. `needs_push` is not a composer-ready state today and the main-process preflight will still reject it.
   - Trigger PR/MR detail generation automatically only through the existing `useCreatePullRequestDialogFields` `generateDetailsOnOpen` path or when saved Source Control AI text-generation defaults for `pullRequest` allow `handleGeneratePullRequestFieldsClick()` to run without opening the dialog.
   - Keep `CreateHostedReviewComposer` as the visible review surface and preserve draft/base/title/body controls.

6. Preserve Source Control AI customization and make settings discoverable.
   - Commit-message and pull-request generation already resolve per-action recipes from `sourceControlAi.actions.commitMessage` and `sourceControlAi.actions.pullRequest`, with repo overrides supported through `repo.sourceControlAi.actionOverrides`. The intent flow must use those same resolvers rather than adding new prompt fields.
   - When generation cannot run because defaults are missing or the user would need to pick an agent/model, show compact inline copy with a settings action that calls `openSourceControlAiSettings`. With an active repo, that helper opens the repository Source Control AI section; without one, it opens global Settings -> Git -> Source Control AI (`source-control-ai-settings`).
   - Do not add new visible instructions in the happy path. Keep the settings link only in blocked/configuration states and existing AI generation dialogs.
   - Respect hosted-review creation defaults from `sourceControlAi.prCreationDefaults`, including draft, template, generate-details-on-open, and open-after-create behavior.

7. Keep provider and host routing intact.
   - Use `activeRepoSettings`, `activeWorktreeId`, `worktreePath`, and `getConnectionId(activeWorktreeId)` for staging, commit, remote, and AI generation calls.
   - Keep hosted-review eligibility and creation on `useAppStore().getHostedReviewCreationEligibility` / `createHostedReview`; the store already routes by repo owner settings, runtime environment, and SSH `connectionId`.
   - Keep GitHub/GitLab copy from `localizedHostedReviewCopy`; do not introduce generic "PR" labels where the existing provider copy says MR.
   - Preserve fork publishing by passing `activeWorktree.pushTarget` through every publish/push/force-push path. The current UI explicitly warns when pushes target a fork.

## Data flow

- User clicks Source Control primary `Create PR`.
- Renderer intent sequence:
  - stage all safe paths if needed;
  - refresh status;
  - generate or require commit message;
  - commit via runtime git;
  - refresh status, upstream, branch compare, and review eligibility;
  - publish/push/force-push-with-lease if safe and confirmed by the refreshed upstream state;
  - refresh eligibility again;
  - render hosted-review composer;
  - optionally generate title/body;
  - final user click creates review through existing `createHostedReview`.
- Store/runtime/main process revalidate branch, dirty state, upstream state, provider, and auth before creating the review.

## Edge cases

- Unresolved conflicts: leave primary disabled as Commit/Resolve flow; no PR intent.
- Partially staged files: stage all safe unstaged/untracked paths before committing, matching the existing lint-staged safety rule; conflict rows remain skipped by `getStageAllPaths`.
- Staged plus unrelated unstaged files: the intent stages the rest before committing so the review branch is complete; this intentionally differs from the current plain Commit primary, which permits committing only staged changes.
- Stage failure or ignored-path mismatch: stop, refresh status, and leave the normal Source Control rows visible.
- Post-mutation refresh failure: stop with compact retry copy; continuing from the old `grouped`, `remoteStatus`, or eligibility snapshot is unsafe.
- Commit message AI disabled or missing defaults: stage only, then stop with a visible commit-message requirement and a Source Control AI settings action.
- Pull-request detail AI disabled or missing defaults: still show the composer; leave the existing Generate button/dialog behavior intact and expose the same settings target from blocked copy if a new inline block is added.
- Commit message generation race: if the user types while generation runs, do not overwrite or auto-commit their draft; stop with the generated draft or the user's draft visible.
- Concurrent Source Control mutation in the same window: do not start while bulk staging, commit, generation, remote, PR generation, or create-review operations are active.
- Commit hook failure: stop, preserve the existing commit failure banner and AI fix affordance.
- Behind/diverged upstream: do not auto-pull unless the existing action is an explicit sync selected by the user; show guidance.
- No upstream: publish only when the branch has commits and a current branch ref.
- Needs push: push before showing the review composer; force-with-lease only when existing upstream logic says patch-equivalent.
- SSH worktrees: route through runtime/connection-aware git helpers, not local-only `window.api.git` calls.
- GitLab: labels, title, create action, and auth guidance say MR/GitLab.
- Auth required or unsupported provider: surface the existing blocked reason; do not start the sequence.
- Fork push target: publish/push must preserve `activeWorktree.pushTarget`; do not assume `origin`.
- Existing linked review appears during the run: stop after refresh and let the existing-review UI win.
- User switches worktrees or branches mid-flow: per-worktree guards plus branch/run-token checks prevent completing against the wrong worktree or opening a composer for a stale branch.
- Multi-window/external mutation: every mutation step must refresh from git and hosted-review eligibility rather than relying on the pre-click snapshot.

## Test plan

- Unit: `source-control-primary-action.test.ts` covers the new PR-intent rows for dirty, staged-with-message, message-required, publish-capable, needs-push, and patch-equivalent force-push states; it also preserves conflict, detached-head, default-branch, auth, unsupported-provider, existing-review, and ordinary needs-sync blocks.
- Unit: `source-control-dropdown-items.test.ts` covers `push_create_pr` copy/availability after any behavior change, including GitLab MR copy and force-with-lease copy.
- Renderer component: add Source Control tests around PR-intent orchestration:
  - stages exactly the safe `getStageAllPaths` paths;
  - stops on post-mutation refresh/re-read failure;
  - stops when generation defaults are unavailable and renders a settings action wired to the existing Source Control AI target;
  - commits only an explicit captured/generated message, not stale textarea state;
  - does not continue after commit/stage/remote failure;
  - aborts UI continuation after worktree or branch switch.
- Store/runtime/main tests: add coverage only if new hosted-review routing is touched. Prefer no changes here.
- Existing tests: run `pnpm test -- src/renderer/src/components/right-sidebar/source-control-primary-action.test.ts src/renderer/src/components/right-sidebar/source-control-dropdown-items.test.ts src/renderer/src/components/right-sidebar/CommitArea.test.tsx src/renderer/src/components/right-sidebar/PullRequestComposer.generate-tooltip.test.tsx`.
- Full checks: run `pnpm typecheck` and `pnpm lint`.
- Electron: validate the visible action band and composer in a dirty worktree, a staged-message worktree, a needs-push worktree, a blocked needs-sync worktree, and a GitLab/MR copy state if a safe fixture/mock path exists.

## UI Quality Bar

- Follow `docs/STYLEGUIDE.md` and existing Source Control density: small `Button` sizes, existing split-button geometry, lucide icons, token colors, and inline muted/error copy.
- The new flow must not introduce a modal for the happy path when defaults are configured.
- No layout shift, clipping, overlapping file rows, or tall instructional card in the Source Control sidebar.
- In-progress and stopped states must be visible near the action band, concise, and not replace the user's commit/PR fields. Settings copy should say "Source Control AI settings" and use the existing settings action rather than spelling out a long path in the sidebar.

## Review Screenshots

1. Dirty worktree Source Control panel with the primary `Create PR` affordance and visible changes list.
2. Staged changes with no commit message after clicking `Create PR`, showing the inline "message required / generate" stop state.
3. Needs-push state after successful push showing the hosted-review composer with provider-correct create copy.
4. AI-generated PR/MR details in the composer, ready for user review.
5. Existing conflict or default-branch blocked state proving the PR intent is not offered.

## Rollout

1. Add tests for the primary-action state machine rows and any new PR-intent state helper.
2. Extract any new primary/dropdown state helpers into focused files instead of growing `source-control-dropdown-items.ts`; it already exceeds the max-lines budget and the workspace rule forbids adding new max-lines disables.
3. Extract or add result-returning helpers for commit-message generation, explicit-message commit, remote mutations, and post-mutation refresh/re-read; do this before wiring the intent flow so chaining is testable.
4. Implement the Source Control PR-intent coordinator using existing stage/commit/generation/remote/review helpers.
5. Wire the primary click and dropdown `push_create_pr` through the coordinator.
6. Add inline status/error UI in the existing action band.
7. Run unit/type/lint checks.
8. Validate in Electron and capture screenshots.

## Lightweight Eng Review

- Scope: Keep the first version renderer-only plus tests unless extracting result-returning helpers requires small local module changes. Do not add a new main-process review API because existing hosted-review eligibility/create preflight remains the authority.
- Architecture/data flow: `SourceControl.tsx` may coordinate the flow, but it should not become a second git state machine. Provider detection and hosted-review creation stay in the hosted-review store/main/runtime path; git mutations stay in runtime-aware helpers; PR detail generation stays in the existing composer hook/store-backed generation path. Per-worktree and per-branch run-token guards are required.
- Failure modes covered:
  - stale status after staging;
  - stale eligibility after commit/push;
  - branch/worktree switch while the sequence is running;
  - external mutation from another window or terminal;
  - hook failure;
  - generation cancellation/failure;
  - generation success after user typed a draft;
  - missing Source Control AI defaults and discoverability of per-action settings;
  - remote push/publish failure currently swallowed by `runRemoteAction`;
  - post-mutation refresh failure currently swallowed by `refreshActiveGitStatusAfterMutation`;
  - dirty tree still blocked by main-process preflight;
  - SSH connection drop;
  - GitLab copy/provider differences;
  - fork push target;
  - behind/diverged branch requiring explicit user action.
- Test coverage required:
  - primary-action unit rows for dirty/commit/message-required/publish/push/create/blocked-sync states;
  - dropdown unit rows for `push_create_pr`;
  - focused renderer tests for the coordinator stopping when message generation is unavailable, opening the existing Source Control AI settings target from the inline action, not continuing after remote failure, and ignoring stale branch/worktree completions;
  - existing commit/composer tests unchanged;
  - Electron screenshots for the five review states.
- Performance/blast radius: No startup work, polling, or new watchers. The sequence runs only on click and reuses existing IPC/runtime calls. Extra refreshes are required after mutations; keep them bounded to post-stage, post-commit, and post-remote steps.
- UI quality bar: Match the current Source Control split-button and hosted-review composer; add only compact inline status/error text near the action band.
- Required review screenshots:
  1. Dirty worktree with `Create PR` primary.
  2. Stopped message-required state.
  3. Needs-push/create composer state.
  4. Generated PR details.
  5. Blocked conflict/default-branch state.
- Residual risks: Fully automatic commit generation depends on saved Source Control AI defaults; users without defaults still need one explicit message/generate choice. Electron validation may need a throwaway repository to avoid mutating a real remote review.
