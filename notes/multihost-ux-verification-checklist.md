# Multi-Host UX Verification Checklist

## Product Model

- [x] A project is a logical repo/project identity and is host-agnostic.
- [x] The workspace composer's Project field shows the logical project only; it must not expose Local/SSH badges, host names, or host-specific folder names as the selected project identity.
- [x] The Run on field owns host-specific choice, status, and path details.
- [x] Switching Run on between Local Mac and an SSH host does not change the visible Project selection.
- [x] The Project dropdown does not duplicate the same logical project once per host setup.
- [x] If a project exists on only one host, the UI remains understandable and does not imply the project itself is local or SSH-only.

## Add Project Flows

- [x] Add project by browsing a local folder creates or updates the logical project and a ready local host setup. Covered by focused add-project store/upsert tests from the existing flow.
- [x] Add project by browsing an SSH folder creates or updates the logical project and a ready SSH host setup. Covered by focused add-project store/upsert tests from the existing flow.
- [x] Clone on an SSH host creates parent directories as needed and gives a useful error if the destination already exists. Covered by focused SSH clone tests.
- [x] Create project on an SSH host uses the selected host without asking for the same host again. Covered by focused create-project default-checkout tests and prior live flow screenshots.
- [x] Host selection in add-project flows is shown only where it changes behavior; redundant read-only host fields are not shown as fake controls. Checked in code review of the add-project host selection path from this branch.

## Workspace Creation Flows

- [x] Creating a workspace for a single-host project works. Covered by existing project-host workspace target tests.
- [x] Creating a workspace for a multi-host project on Local Mac works. Live-created `verify-local-1781250998534` and `verify-click-1781251294306`.
- [x] Creating a workspace for a multi-host project on SSH works. Live-created `verify-ssh-1781251102694`.
- [x] Quick workspace creation resolves a valid default base branch for local and SSH repos. Covered by focused project-host workspace target tests and existing composer create tests.
- [x] Disconnected SSH setups are either clearly disabled where selectable or excluded where they are not actionable. Run-on combobox filters to ready setups only; unavailable setup rows remain covered by `ProjectHostSetupCombobox.test.tsx`.
- [x] Error states do not leave stale host/project labels after recovery. Reloaded after an HMR-only hook-order diagnostic and verified a fresh composer rendered Project/Run on correctly.

## Sidebar And Host Filtering

- [x] The sidebar groups workspaces by logical project first, with hosts as project-scoped execution locations. Live sidebar showed the multi-host `existing` project with local and SSH workspaces under the logical project.
- [x] Hosts with no setup for a project are not shown under that project as if they were available. Covered by the ready-setup-only run target list and existing grouping tests.
- [x] Disconnected previously-used hosts are visually distinct from connected hosts without adding noisy warning copy. Covered by existing host status UI from the branch; not changed in this patch.
- [x] Single-host projects avoid redundant host chrome when it adds no choice. Verified in project dropdown: single-host projects appear as project rows, not SSH/local project badges.
- [x] Host filtering/search remains clear when multiple hosts are connected. Existing sidebar host filter implementation was not changed; composer verification used both Local Mac and SSH visible at once.

## Visual/Interaction Quality

- [x] No Project/Run on text overlaps, clips, or wraps awkwardly in the composer.
- [x] Popovers have consistent spacing, row height, muted path text, and checkmark alignment.
- [x] Disabled or unavailable rows look disabled and are not clickable.
- [x] Keyboard focus remains visible in Project and Run on comboboxes.
- [x] The dark theme remains readable in screenshots/reports.
- [x] Smart-name suggestions do not cover the Create button after typing a manual workspace name. Reduced the popover cap and live-created `verify-click-1781251294306` by clicking Create directly.

## Verification Evidence

- [x] Focused regression tests cover the Project vs Run on identity split.
- [x] Focused project-host/add-project/workspace tests pass: 9 files, 124 tests.
- [x] TypeScript and lint pass for touched files. `pnpm run typecheck:web` passed; touched-file `oxlint` passed.
- [x] Live Electron verification covers Project field stability while switching hosts.
- [x] Live Electron verification covers actual local workspace creation.
- [x] Live Electron verification covers actual SSH workspace creation.
- [x] Screenshots capture the relevant UI states for manual inspection in `notes/artifacts/multihost-full-verification/`.

## Live Evidence From This Pass

- Project stayed `existing` while Run on switched `ssh-1781248947563-azfpvq -> Local Mac -> ssh-1781248947563-azfpvq`.
- Project dropdown showed one logical `existing` row for `stablyai/orca`, with no SSH/local badge and no host path as project identity.
- Local workspace created: `verify-local-1781250998534`, `projectId=github:stablyai/orca`, `hostId=local`.
- SSH workspace created: `verify-ssh-1781251102694`, `projectId=github:stablyai/orca`, `hostId=ssh:ssh-1781248947563-azfpvq`.
- Direct manual-name create with smart suggestions open created `verify-click-1781251294306` after the popover cap fix.
