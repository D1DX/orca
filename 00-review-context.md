# Review Context

## Branch Info

- Base: origin/main
- Current: brennanb2025/agent-panes-reporting

## Changed Files Summary

| File | Status |
| --- | --- |
| docs/agent-status-pane-mismapping.md | A |
| src/renderer/src/App.tsx | M |
| src/renderer/src/components/sidebar/WorktreeCardAgents.tsx | M |
| src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx | M |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.test.ts | M |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts | M |
| src/renderer/src/components/terminal-pane/TerminalPane.tsx | M |
| src/renderer/src/components/terminal-pane/layout-serialization.test.ts | M |
| src/renderer/src/components/terminal-pane/layout-serialization.ts | M |
| src/renderer/src/components/terminal-pane/pty-connection.test.ts | M |
| src/renderer/src/components/terminal-pane/pty-connection.ts | M |
| src/renderer/src/components/terminal-pane/stale-agent-row.ts | A |
| src/renderer/src/components/terminal-pane/use-terminal-pane-global-effects.ts | M |
| src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts | M |
| src/renderer/src/constants/terminal.ts | M |
| src/renderer/src/hooks/useAutoAckViewedAgent.test.ts | M |
| src/renderer/src/hooks/useAutoAckViewedAgent.ts | M |
| src/renderer/src/hooks/useIpcEvents.ts | M |
| src/renderer/src/lib/activate-tab-and-focus-pane.ts | M |
| src/renderer/src/lib/agent-status-count.test.ts | M |
| src/renderer/src/lib/agent-status.ts | M |
| src/renderer/src/lib/pane-manager/mint-stable-pane-id.ts | A |
| src/renderer/src/lib/pane-manager/mobile-fit-overrides.ts | M |
| src/renderer/src/lib/pane-manager/pane-fit-resize-observer.test.ts | M |
| src/renderer/src/lib/pane-manager/pane-lifecycle.test.ts | M |
| src/renderer/src/lib/pane-manager/pane-lifecycle.ts | M |
| src/renderer/src/lib/pane-manager/pane-manager-types.ts | M |
| src/renderer/src/lib/pane-manager/pane-manager.test.ts | A |
| src/renderer/src/lib/pane-manager/pane-manager.ts | M |
| src/renderer/src/lib/pane-manager/pane-public-view.ts | M |
| src/renderer/src/lib/pane-manager/pane-terminal-gpu-acceleration.test.ts | M |
| src/renderer/src/lib/pane-manager/pane-tree-ops.test.ts | M |
| src/renderer/src/store/slices/agent-status.ts | M |
| src/renderer/src/store/slices/terminals.ts | M |
| src/shared/agent-status-types.ts | M |
| src/shared/stable-pane-id.test.ts | A |
| src/shared/stable-pane-id.ts | A |
| src/shared/types.ts | M |

## Changed Line Ranges (PR Scope)

<!-- In scope: issues on these lines OR caused by these changes. Out of scope: unrelated pre-existing issues -->

| File | Changed Lines |
| --- | --- |
| docs/agent-status-pane-mismapping.md | 1-349 (new file) |
| src/renderer/src/App.tsx | 5-12, 85, 104, 186, 886 |
| src/renderer/src/components/sidebar/WorktreeCardAgents.tsx | 11, 55, 89-101, 114, 117 |
| src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx | 652, 742, 754, 851-857, 859-861 |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.test.ts | 54 |
| src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts | 83-86, 88-90, 146, 154-155, 158, 176-184 |
| src/renderer/src/components/terminal-pane/TerminalPane.tsx | 301-306, 412-430, 555-561, 891-896 |
| src/renderer/src/components/terminal-pane/layout-serialization.test.ts | 264-298 |
| src/renderer/src/components/terminal-pane/layout-serialization.ts | 204-205, 210, 215-250, 354-370 |
| src/renderer/src/components/terminal-pane/pty-connection.test.ts | 147-150, 1161 |
| src/renderer/src/components/terminal-pane/pty-connection.ts | 114-119, 285-290 |
| src/renderer/src/components/terminal-pane/stale-agent-row.ts | 1-31 (new file) |
| src/renderer/src/components/terminal-pane/use-terminal-pane-global-effects.ts | 12-13, 120-133, 136-142 |
| src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts | 581-586, 694-716 |
| src/renderer/src/constants/terminal.ts | 26-36 |
| src/renderer/src/hooks/useAutoAckViewedAgent.test.ts | 20-25, 35, 81, 89, 110, 117, 122, 143, 150, 174, 181-214 |
| src/renderer/src/hooks/useAutoAckViewedAgent.ts | 5-30, 37-51, 59-60, 62-65, 67-69, 73-74, 77-79, 81, 136-142, 148, 157-158, 184, 197-198 |
| src/renderer/src/hooks/useIpcEvents.ts | 23, 841-854, 914-917, 920-925, 930-931, 934, 939-941 |
| src/renderer/src/lib/activate-tab-and-focus-pane.ts | 4-20, 22, 28-32, 34 |
| src/renderer/src/lib/agent-status-count.test.ts | 148-161, 179-187 |
| src/renderer/src/lib/agent-status.ts | 31-35, 43-45, 47-50, 60, 66-82, 100, 105-106, 114-120 |
| src/renderer/src/lib/pane-manager/mint-stable-pane-id.ts | 1-24 (new file) |
| src/renderer/src/lib/pane-manager/mobile-fit-overrides.ts | 15-21, 78, 95, 108, 110, 117 |
| src/renderer/src/lib/pane-manager/pane-fit-resize-observer.test.ts | 38 |
| src/renderer/src/lib/pane-manager/pane-lifecycle.test.ts | 26, 235 |
| src/renderer/src/lib/pane-manager/pane-lifecycle.ts | 53, 120 |
| src/renderer/src/lib/pane-manager/pane-manager-types.ts | 37-53, 74-80 |
| src/renderer/src/lib/pane-manager/pane-manager.test.ts | 1-231 (new file) |
| src/renderer/src/lib/pane-manager/pane-manager.ts | 1, 44, 57-62, 161, 163-167, 294, 298-299, 302-306, 311, 314, 331-333, 337-377 |
| src/renderer/src/lib/pane-manager/pane-public-view.ts | 6 |
| src/renderer/src/lib/pane-manager/pane-terminal-gpu-acceleration.test.ts | 8 |
| src/renderer/src/lib/pane-manager/pane-tree-ops.test.ts | 47 |
| src/renderer/src/store/slices/agent-status.ts | 33 |
| src/renderer/src/store/slices/terminals.ts | 66-73, 157-164, 221-223, 250, 781-805 |
| src/shared/agent-status-types.ts | 63-66 |
| src/shared/stable-pane-id.test.ts | 1-54 (new file) |
| src/shared/stable-pane-id.ts | 1-37 (new file) |
| src/shared/types.ts | 368-373 |

## Review Standards Reference

- Follow /review-code standards
- Focus on: correctness, security, performance, maintainability
- Priority levels: Critical > High > Medium > Low

## File Categories

### Frontend/UI (renderer code, .tsx)

- src/renderer/src/App.tsx
- src/renderer/src/components/sidebar/WorktreeCardAgents.tsx
- src/renderer/src/components/status-bar/ResourceUsageStatusSegment.tsx
- src/renderer/src/components/status-bar/mergeSnapshotAndSessions.test.ts
- src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts
- src/renderer/src/components/terminal-pane/TerminalPane.tsx
- src/renderer/src/components/terminal-pane/layout-serialization.test.ts
- src/renderer/src/components/terminal-pane/layout-serialization.ts
- src/renderer/src/components/terminal-pane/pty-connection.test.ts
- src/renderer/src/components/terminal-pane/pty-connection.ts
- src/renderer/src/components/terminal-pane/stale-agent-row.ts
- src/renderer/src/components/terminal-pane/use-terminal-pane-global-effects.ts
- src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts
- src/renderer/src/hooks/useAutoAckViewedAgent.test.ts
- src/renderer/src/hooks/useAutoAckViewedAgent.ts
- src/renderer/src/hooks/useIpcEvents.ts
- src/renderer/src/lib/activate-tab-and-focus-pane.ts
- src/renderer/src/lib/pane-manager/mint-stable-pane-id.ts
- src/renderer/src/lib/pane-manager/mobile-fit-overrides.ts
- src/renderer/src/lib/pane-manager/pane-fit-resize-observer.test.ts
- src/renderer/src/lib/pane-manager/pane-lifecycle.test.ts
- src/renderer/src/lib/pane-manager/pane-lifecycle.ts
- src/renderer/src/lib/pane-manager/pane-manager-types.ts
- src/renderer/src/lib/pane-manager/pane-manager.test.ts
- src/renderer/src/lib/pane-manager/pane-manager.ts
- src/renderer/src/lib/pane-manager/pane-public-view.ts
- src/renderer/src/lib/pane-manager/pane-terminal-gpu-acceleration.test.ts
- src/renderer/src/lib/pane-manager/pane-tree-ops.test.ts
- src/renderer/src/store/slices/agent-status.ts
- src/renderer/src/store/slices/terminals.ts
- src/renderer/src/lib/agent-status-count.test.ts
- src/renderer/src/lib/agent-status.ts
- src/renderer/src/constants/terminal.ts

### Utility/Common (shared)

- src/shared/agent-status-types.ts
- src/shared/stable-pane-id.test.ts
- src/shared/stable-pane-id.ts
- src/shared/types.ts

### Docs (excluded from code review - reference only)

- docs/agent-status-pane-mismapping.md

## Skipped Issues (Do Not Re-validate)

<!-- Issues validated but deemed not worth fixing. Do not re-validate these in future iterations. -->

(none yet)

## Iteration State

Current iteration: 1
Last completed phase: Combine + Validate
Files fixed this iteration: []

## Validated Issues (✅ Fix this iteration)

| # | File | Line | Severity | Issue | Found by |
| - | ---- | ---- | -------- | ----- | -------- |
| 1 | src/renderer/src/lib/pane-manager/pane-manager.ts | 161-188 | High | `closePane` clears stableId maps before invoking `onPaneClosed`; lifecycle callback's `getStablePaneId(paneId)` returns null so `dropAgentStatus` no-ops for CLI-driven closes (use-terminal-pane-lifecycle.ts:583). Fix by passing the closed stableId through the `onPaneClosed` callback. | Claude × 2 |
| 2 | src/renderer/src/lib/pane-manager/pane-manager.ts | 353-369 | Medium | `adoptStablePaneId` doesn't guard against the target UUID already being mapped to a different live pane — bidirectional maps would become inconsistent. | Claude × 2 + Codex |
| 3 | src/renderer/src/components/sidebar/WorktreeCardAgents.tsx | 87-117 | Medium | When `parsePaneKey` returns null, `activateTabAndFocusPane(tabId, null, ...)` early-returns and never dispatches the focus event, so `surfaceStaleAgentRow` never fires and the malformed/legacy row is not dismissed. Comment claims dismissal happens. | Claude × 3 + Codex |
| 4 | src/shared/stable-pane-id.ts | 12 | Medium | `V4_UUID_RE` uses `/i` flag but minted UUIDs are always lowercase; uppercase UUIDs from external sources would alias as distinct paneKeys in maps that key by string. Drop `/i`. | Claude |
| 5 | src/renderer/src/components/status-bar/mergeSnapshotAndSessions.ts | 146-159 | Medium | Local `parsePaneKey` accepts any non-empty suffix; the shared `parsePaneKey` (used by IPC ingress) requires a v4 UUID. Contract split — replace local helper with shared import. | Claude × 2 |
| 6 | src/renderer/src/store/slices/terminals.ts | 276, 496 | Low (doc drift) | Stale comments referencing `${tabId}:${paneId}` after the migration to `${tabId}:${stablePaneId}`. | Deletion-impact |
| 7 | src/renderer/src/components/sidebar/smart-sort.ts | 65 | Low (doc drift) | Stale `${tabId}:${paneId}` comment. | Deletion-impact |
| 8 | src/renderer/src/components/dashboard/useDashboardData.ts | 104 | Low (doc drift) | Stale `${tabId}:${paneId}` comment. | Deletion-impact |
| 9 | src/renderer/src/components/sidebar/CacheTimer.tsx | 35 | Low (doc drift) | Stale `${tabId}:${paneId}` comment. | Deletion-impact |
| 10 | src/main/agent-hooks/server.ts | 1096 | Low (doc drift) | Stale `${tabId}:${paneId}` comment. | Deletion-impact |
