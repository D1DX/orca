# Updater Release-Transition Fallback

## Goal

When the user clicks "Check for Updates" (or the background timer fires) during a release window and the manifest fetch 404s because the new release's CDN aliases haven't propagated yet, Orca should silently retry once after a short delay before surfacing any failure. Today the user sees `"GitHub may be temporarily unavailable. Try again in a minute."` (`src/main/updater.ts:220`) — a confusing error toast for what is almost always a self-healing race that resolves in seconds. The fix applies equally to stable and prerelease users; `pinPrereleaseFeed` (`src/main/updater.ts:274`) hits the same atom feed and pins the generic provider at a tag that may not yet be reachable, so it has the same race.

## Background

`autoUpdater.setFeedURL` is configured to point at `https://github.com/stablyai/orca/releases/latest/download` — the generic provider's "latest non-prerelease" alias. The race is in CDN propagation between `gh release edit --draft=false` (`.github/workflows/release-cut.yml:625-654`) and the `releases/latest/download/<manifest>` URLs becoming reachable. electron-builder uploads all platform manifests to the draft *before* the workflow flips `draft=false`, so the only remaining window is GitHub-side propagation of the `latest` alias. That window is typically seconds.

`isBenignCheckFailure` (`src/main/updater-fallback.ts:59`) already classifies these as transient via `isGitHubReleaseTransitionFailure` (`src/main/updater-fallback.ts:46`). Today the benign branch in `sendCheckFailureStatus` (`src/main/updater.ts:197`) logs, schedules a 1h background retry via `AUTO_UPDATE_RETRY_INTERVAL_MS`, and either toasts the user or silently returns to `idle`. The 1h cadence is too coarse to mask a sub-minute race.

## Proposed Behavior

A single delayed silent retry in the benign branch of `sendCheckFailureStatus`. No `setFeedURL` mutation, no atom-feed walk, no candidate enumeration.

### Algorithm

Flag semantics: `transitionRetryInFlight` means "I've already retried once for this user-visible check cycle." It clears when the cycle terminates — success, non-benign error, OR observed benign recurrence.

When `sendCheckFailureStatus` enters its benign branch:

1. If `transitionRetryInFlight === true`: clear the flag, also clear `pendingTransitionBackstopTimer` (stale once today's behavior schedules `autoUpdateCheckTimer` via `scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)` at `updater.ts:213`), and fall through to today's behavior (soft toast for user-initiated with calmer copy below, silent for background, 1h scheduled retry). Do NOT schedule another 30s retry — this is the recurrence path.
2. Else if `isGitHubReleaseTransitionFailure(message)` is true: set `transitionRetryInFlight = true`, `setTimeout(..., TRANSITION_RETRY_DELAY_MS)` where `TRANSITION_RETRY_DELAY_MS = 30_000`, ALSO schedule a 1h backstop timer (see Probe Budget), and return without toast / without `sendStatus({state:'idle'})`.
3. Else: today's behavior unchanged.

On fire, the 30s timer calls a launch-only helper `forceLaunchUpdateCheck({ userInitiated })` that bypasses `runBackgroundUpdateCheck`'s `currentStatus.state === 'checking'` early-return (`src/main/updater.ts:307`). Status stays `'checking'` across the wait window, so the existing entrypoints would no-op without the bypass. The helper does `(shouldResolvePrereleaseFeed() ? pinPrereleaseFeed().then(launch) : launch())` directly (`launch = () => autoUpdater.checkForUpdates()`), preserving the prerelease atom-feed read on retry. The 1h backstop timer ALSO calls `forceLaunchUpdateCheck` for the same reason.

The existing event handlers (`update-available` / `update-not-available` / `error`) handle the retry's outcome. The `update-available` / `update-not-available` handlers also clear `transitionRetryInFlight` so the next user-visible check cycle (hours later) starts fresh; this lives alongside the existing `clearBackgroundCheckLaunchPending` calls in `src/main/updater-events.ts`.

### Probe Budget

Up to two extra `checkForUpdates()` round-trips: the 30s retry, plus the 1h backstop if app-nap throttles the 30s retry's events past the backstop's fire time. In the common (events-not-throttled) case it's one. 30s wall-clock between the original failure and the retry — long enough for typical `latest`-alias propagation, short enough that user-perceived latency on a manual check is bounded at ~30s + the retry's own duration. No extra HEAD probes, no atom-feed fetches beyond what `pinPrereleaseFeed` already does for prerelease users.

A 1h backstop timer is scheduled at the same time as the 30s timer — belt-and-suspenders for macOS app-nap, where a throttled 30s retry may never produce an event. The backstop is a custom `setTimeout(forceLaunchUpdateCheck, AUTO_UPDATE_RETRY_INTERVAL_MS)` tracked via `pendingTransitionBackstopTimer` (NOT `scheduleAutomaticUpdateCheck`, whose callback `runBackgroundUpdateCheck` would no-op against the still-`'checking'` status). If the 30s retry succeeds, its `update-available` / `update-not-available` handler reschedules the 24h cadence and clears the 1h backstop timer.

### Re-entry Guard

Module-scoped `transitionRetryInFlight: boolean`, mirroring `backgroundCheckLaunchPending` (`src/main/updater.ts:307`, `:324`, `:330`). Set when scheduling the 30s timer. Cleared in four places, all of which mark the end of a user-visible check cycle: (a) `sendCheckFailureStatus`'s benign branch when the flag is already set (recurrence path — see Algorithm step 1), (b) `sendCheckFailureStatus`'s non-benign-error branch (`src/main/updater.ts:227-232`) so a real DNS / outage error doesn't strand the flag and silently no-op every subsequent click, (c) the `update-available` / `update-not-available` event handlers in `src/main/updater-events.ts`, (d) the `before-quit` cleanup in `src/main/updater-events.ts:70`. Clearing in a `finally` right after the retry's launch would be a no-op: `autoUpdater.checkForUpdates()` is fire-and-forget and the recurrence arrives via the `'error'` handler on a later tick, by which time the flag would already be false. No persistence across restarts; the race only exists in a live process.

### Status During the 30s Wait

After the original benign error, the new branch deliberately skips `sendStatus({state:'idle'})` so the UI status remains `'checking'` (with `userInitiated` preserved if set). That's honest — a check is still in progress. The 30s retry timer and 1h backstop both call `forceLaunchUpdateCheck`, which bypasses the `currentStatus.state === 'checking'` guard in `runBackgroundUpdateCheck` (`src/main/updater.ts:307`); without the bypass, every retry path would no-op against its own status. `forceLaunchUpdateCheck` also calls `setUserInitiatedCheck(opts.userInitiated)` before launching — the original `'error'` handler cleared the module flag synchronously at `updater-events.ts:196` before the retry was scheduled, so without re-priming, the retry's `update-available` / `update-not-available` / `'error'` handlers would all read `getUserInitiatedCheck() === false` and silently drop the user-initiated styling/recurrence-toast path. Concurrent-click protection during the wait comes from `transitionRetryInFlight`, NOT from status: `checkForUpdatesFromMenu` (`src/main/updater.ts:359`) gains a `transitionRetryInFlight === true` early-return only — we deliberately do NOT add a `state === 'checking'` guard there, since that's the very condition the retry helpers are designed to fire through.

### Prerelease Path

No new logic. Both retry entrypoints already gate on `shouldResolvePrereleaseFeed()` (`src/main/updater.ts:266`) and call `pinPrereleaseFeed()` before `autoUpdater.checkForUpdates()`. The 30s delay is enough for both the `latest` alias and the per-tag `releases/download/<tag>/` paths used by the pinned feed.

### Soft Message Tweak

Replace the message at `src/main/updater.ts:220`:

  Before: `"GitHub may be temporarily unavailable. Try again in a minute."`
  After:  `"Couldn't reach the update server. Try again in a few minutes."`

The "we'll try again shortly" phrasing was rejected: this copy is shown only AFTER the 30s retry has already failed, and the next automatic attempt is up to 1h away. "Shortly" is misleading. The new copy softens the alarm and gives the user something actionable (manual re-click), while the in-process 1h backstop continues working.

Only shown when both the original check *and* the 30s retry hit a benign failure. The renderer continues to prefix with `"Could not check for updates."` (card) or `"Update check failed."` (Settings), so the displayed string remains coherent.

## Why Not An Atom-Feed Walk

A walk-the-feed-and-pin-N-1 design was considered and rejected. The race is post-publish CDN propagation, which is GitHub-side and bounded in seconds — a single delayed retry is sufficient and matches the actual failure shape. Walking the atom feed would offer the user N-1 right after they saw "v1.4 released", producing either a false-confidence "you're up to date" or a confusing-downgrade UX. It would also require mutating `autoUpdater.setFeedURL` from inside an error handler, creating global-state interactions with `pinPrereleaseFeed`, `enableIncludePrerelease` (`src/main/updater.ts:339`), and the event handlers' `clearAvailableUpdateContext` / `clearBackgroundCheckLaunchPending` calls. The retry-only path doesn't touch global state.

## Companion Workflow Improvement

Recommended as a separate PR, out of scope here: after `gh release edit --draft=false` in `.github/workflows/release-cut.yml:651-654`, add a verification step that HEADs `releases/latest/download/{latest-mac.yml,latest.yml,latest-linux.yml}` (and the `<tag>/...` variants) with retry-and-backoff for up to 60s, failing the workflow if any are unreachable. That converts any propagation longer than 60s into a CI alert rather than a silent user-facing race, and complements the client-side retry without depending on it.

## Non-Goals

- Distinguishing CDN-propagation race from a real GitHub outage. The retry costs one extra request; for a real outage we fall through to today's behavior.
- Persisting state across launches.
- Telling the user we retried. Silent is the correct UX.
- Detecting the race on the *download* phase (manifest present, asset 404). Different code path (`downloadUpdate`); out of scope.

## File-Level Changes

- `src/main/updater.ts`
  - Add `const TRANSITION_RETRY_DELAY_MS = 30 * 1000`.
  - Add module-scoped `let transitionRetryInFlight = false`.
  - Add module-scoped `let pendingTransitionRetryTimer: ReturnType<typeof setTimeout> | null = null` and `let pendingTransitionBackstopTimer: ReturnType<typeof setTimeout> | null = null` so the `before-quit` handler in `updater-events.ts` can clear both via callback.
  - Factor a launch-only helper `forceLaunchUpdateCheck(opts: { userInitiated: boolean })` that calls `setUserInitiatedCheck(opts.userInitiated)` to restore the module flag the original `'error'` handler cleared at `updater-events.ts:196` (the retry's event handlers read `getUserInitiatedCheck()` directly — threading the parameter to `sendCheckFailureStatus` is insufficient for the success-path handlers), then does `(shouldResolvePrereleaseFeed() ? pinPrereleaseFeed().then(launch) : launch())` directly with `launch = () => autoUpdater.checkForUpdates()`. No `currentStatus.state === 'checking'` check — that's the guard we're bypassing. Wrap the resulting promise in `.catch(err => void sendCheckFailureStatus(String(err?.message ?? err), opts.userInitiated))`, mirroring the defensive pattern at `runBackgroundUpdateCheck:329-332` and `checkForUpdatesFromMenu:379-382`; without this, a synchronous throw in `setFeedURL` or a future electron-updater rejection-without-`'error'` path would strand `transitionRetryInFlight` and silently no-op every subsequent manual click. The 30s retry timer and 1h backstop both invoke this helper. `activeUpdateNudgeId` is read live by event handlers (which is correct — a `dismissNudge` during the 30s wait should propagate), so it's deliberately NOT a parameter; the existing `runBackgroundUpdateCheck` / `checkForUpdatesFromMenu` entrypoints stay unchanged for normal launches.
  - In `sendCheckFailureStatus`'s benign branch (around `:204`-`:224`): recurrence path (flag already set) clears the flag, also clears `pendingTransitionBackstopTimer` so it doesn't redundantly fire alongside the freshly-scheduled `autoUpdateCheckTimer` from today's-behavior fall-through, and falls through to today's behavior. Otherwise, if `isGitHubReleaseTransitionFailure(message)` is true: set the flag, store the `setTimeout(() => forceLaunchUpdateCheck({ userInitiated }), TRANSITION_RETRY_DELAY_MS)` handle in `pendingTransitionRetryTimer`, ALSO `setTimeout(() => forceLaunchUpdateCheck({ userInitiated }), AUTO_UPDATE_RETRY_INTERVAL_MS)` stored in `pendingTransitionBackstopTimer` (NOT `scheduleAutomaticUpdateCheck`, which would no-op against the still-`'checking'` status), and return without toast / without `sendStatus({state:'idle'})` so status stays `'checking'`. Each timer's callback nulls out its own handle.
  - In `sendCheckFailureStatus`'s non-benign-error branch (`:227-232`), clear `transitionRetryInFlight` (and clear/null `pendingTransitionRetryTimer` / `pendingTransitionBackstopTimer` if set). Without this, a real outage on the retry strands the flag and the new manual-click guard silently no-ops every subsequent click.
  - Add a `transitionRetryInFlight` early-return at the top of `checkForUpdatesFromMenu` (`:359`). Do NOT add a `state === 'checking'` guard here — that's the condition the retry helpers are designed to fire through, and `runBackgroundUpdateCheck`'s existing `:307` guard already covers parallel background launches. Manual-click dedup during the 30s wait is the flag's job.
  - Update the message at `:220` to the calmer copy.

- `src/main/updater-events.ts`
  - Extend `UpdaterHandlerContext` (`:15`) with two new callbacks alongside the existing `clearBackgroundCheckLaunchPending`: `clearTransitionRetryInFlight: () => void` and `clearPendingTransitionRetryTimer: () => void` (the latter clears both the 30s and 1h-backstop handles). `updater-events.ts` doesn't import from `updater.ts`, so the module-scoped flag and timer handles must reach the handlers via context callbacks, mirroring the existing pattern.
  - In the `update-available` and `update-not-available` handlers (alongside the existing `clearBackgroundCheckLaunchPending` / `clearAvailableUpdateContext` calls), call `clearTransitionRetryInFlight` and `clearPendingTransitionRetryTimer`. Marks the end of the current user-visible check cycle so a benign failure hours later can retry once again, and supersedes the still-pending 1h backstop on retry success.
  - Extend the existing `app.on('before-quit', ...)` handler (`:70`) to also call `clearPendingTransitionRetryTimer` and `clearTransitionRetryInFlight` via the new context callbacks. Avoids a stale 30s or 1h-backstop timer firing during shutdown. (Note: `onBeforeQuitCleanup` in `updater.ts:33` only fires from `performQuitAndInstall`, not user quit, so the cleanup must live here.)

- `src/main/updater-fallback.ts`
  - `isGitHubReleaseTransitionFailure` is already exported (`:46`). No change.

- `src/main/updater.check-failure.test.ts` (the home — already exercises `sendCheckFailureStatus`; use `vi.useFakeTimers()` for the 30s `setTimeout`)
  - Benign release-transition failure → schedules a 30s retry AND a 1h backstop; status stays `'checking'`.
  - Retry succeeds → user sees normal `available` / `not-available`, no error toast; flag cleared by event handler.
  - Retry also fails benignly → recurrence path clears the flag and `pendingTransitionBackstopTimer`, falls through to today's behavior (calmer toast for user-initiated, silent for background, 1h scheduled retry via `autoUpdateCheckTimer` from `scheduleAutomaticUpdateCheck(AUTO_UPDATE_RETRY_INTERVAL_MS)` at `updater.ts:213` — NOT the original `pendingTransitionBackstopTimer`). Assert `pendingTransitionBackstopTimer` is cleared on recurrence so it doesn't fire alongside the freshly-scheduled `autoUpdateCheckTimer`. Also assert that because `forceLaunchUpdateCheck` re-primed `userInitiatedCheck`, the recurrence's `'error'` handler captures `wasUserInitiated = true` and `sendCheckFailureStatus` takes the user-initiated soft-toast branch (`updater.ts:222`'s `if`, not the silent `else`).
  - Manual `checkForUpdatesFromMenu` click during the 30s wait → guarded, no parallel `checkForUpdates()` call.
  - `before-quit` during the 30s wait → timer is cleared, no fire after shutdown.
  - Prerelease path: `pinPrereleaseFeed` invoked twice (original + retry), confirming a fresh atom-feed read.

## Trade-offs

- A user-initiated check now has a worst-case latency of ~30s + check-RTT before any error is shown. We trade fast feedback during a real outage for a calm, accurate experience during the common (release-window) failure mode.
- We don't proactively offer a known-good older release while N is mid-publish. The next 1h scheduled background check picks up N once propagation completes; for users who explicitly clicked Check, the calmer copy frames the wait correctly.
- We rely on GitHub's `latest`-alias propagation completing within 30s. If it doesn't, we fall through to today's behavior (visible message, 1h retry). The companion workflow-side fix would catch propagation > 60s as a CI alert.
- The 1h backstop is scheduled alongside the 30s retry rather than only after it. If macOS app-nap throttles the timer so far that no event fires, the 1h backstop still recovers the cadence; if the retry succeeds, its event handlers reschedule the 24h cadence and the 1h backstop is a harmless extra entry.
