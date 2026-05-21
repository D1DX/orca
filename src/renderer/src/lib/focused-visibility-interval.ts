export type FocusedVisibilityIntervalTimer = ReturnType<typeof setInterval>

export function isWindowVisible(): boolean {
  return typeof document.visibilityState === 'undefined' || document.visibilityState === 'visible'
}

export function installFocusedVisibilityInterval(args: {
  run: () => void
  intervalMs: number
  setIntervalFn?: (callback: () => void, intervalMs: number) => FocusedVisibilityIntervalTimer
  clearIntervalFn?: (handle: FocusedVisibilityIntervalTimer) => void
}): () => void {
  const setIntervalFn =
    args.setIntervalFn ??
    ((callback: () => void, intervalMs: number): FocusedVisibilityIntervalTimer =>
      setInterval(callback, intervalMs))
  const clearIntervalFn =
    args.clearIntervalFn ??
    ((handle: FocusedVisibilityIntervalTimer): void => clearInterval(handle))
  let intervalId: FocusedVisibilityIntervalTimer | null = null

  const stop = (): void => {
    if (!intervalId) {
      return
    }
    clearIntervalFn(intervalId)
    intervalId = null
  }
  const start = (): void => {
    if (intervalId || !isWindowVisible()) {
      return
    }
    args.run()
    // Why: many callers shell out or cross IPC. Keep their interval alive only
    // while Orca can present the refreshed data, but still refresh a visible
    // unfocused window so status UI does not go stale on a second display.
    intervalId = setIntervalFn(args.run, args.intervalMs)
  }
  const reconcile = (): void => {
    if (isWindowVisible()) {
      start()
    } else {
      stop()
    }
  }

  start()
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', reconcile)
  }
  return () => {
    stop()
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', reconcile)
    }
  }
}
