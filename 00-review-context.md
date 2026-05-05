# Review Context

## Branch Info
- Base: origin/main (merge-base 201685b2)
- Current: github-ui

## Changed Files Summary
- M src/main/git/runner.ts
- A src/main/git/runner.test.ts
- A src/main/github/project-view.ts (1515 lines NEW)
- A src/main/github/project-view.test.ts
- A src/main/github/rate-limit.ts
- M src/main/ipc/github.ts
- M src/preload/api-types.ts
- M src/preload/index.ts
- M src/renderer/src/components/GitHubItemDialog.tsx
- M src/renderer/src/components/TaskPage.tsx
- A src/renderer/src/components/github-project/ProjectCell.tsx (984 lines)
- A src/renderer/src/components/github-project/ProjectGroupHeader.tsx
- A src/renderer/src/components/github-project/ProjectItemSlugDialog.tsx
- A src/renderer/src/components/github-project/ProjectPicker.tsx (702 lines)
- A src/renderer/src/components/github-project/ProjectRow.tsx
- A src/renderer/src/components/github-project/ProjectViewList.tsx
- A src/renderer/src/components/github-project/ProjectViewWrapper.tsx (844 lines)
- A src/renderer/src/components/github-project/columns.ts
- A src/renderer/src/components/github-project/group-sort.ts
- A src/renderer/src/components/github-project/group-sort.test.ts
- A src/renderer/src/components/github/GitHubRateLimitPill.tsx
- A src/renderer/src/hooks/useGitHubSlugMetadata.ts
- A src/renderer/src/lib/repo-slug-index.ts
- M src/renderer/src/store/slices/github.ts (~609 added)
- M src/shared/constants.ts
- A src/shared/github-project-types.ts (432 lines)
- M src/shared/types.ts

## Review Standards Reference
- Follow /review-code standards
- Focus on: correctness, security, performance, maintainability
- Priority: Critical > High > Medium > Low

## File Categories

### Backend/API (main process):
- src/main/git/runner.ts
- src/main/git/runner.test.ts
- src/main/github/project-view.ts
- src/main/github/project-view.test.ts
- src/main/github/rate-limit.ts
- src/main/ipc/github.ts
- src/preload/api-types.ts
- src/preload/index.ts

### Frontend/UI:
- src/renderer/src/components/GitHubItemDialog.tsx
- src/renderer/src/components/TaskPage.tsx
- src/renderer/src/components/github-project/*.tsx
- src/renderer/src/components/github-project/columns.ts
- src/renderer/src/components/github-project/group-sort.ts
- src/renderer/src/components/github-project/group-sort.test.ts
- src/renderer/src/components/github/GitHubRateLimitPill.tsx
- src/renderer/src/hooks/useGitHubSlugMetadata.ts
- src/renderer/src/lib/repo-slug-index.ts
- src/renderer/src/store/slices/github.ts

### Utility/Common:
- src/shared/constants.ts
- src/shared/github-project-types.ts
- src/shared/types.ts

## Skipped Issues (Do Not Re-validate)

## Iteration State
Current iteration: 1
Last completed phase: Setup
