// Re-renders the current view every 30 s; router.js stops it on every route change.
let timerId = null;
let refreshing = false;

/** True while a poll re-render runs, so withLoading keeps the old content instead of showing a spinner. */
export function isRefreshing() {
  return refreshing;
}

export function startRefresh(callback) {
  stopRefresh();
  timerId = setInterval(async () => {
    refreshing = true;
    try {
      await callback();
    } finally {
      refreshing = false;
    }
  }, 30000);
}

export function stopRefresh() {
  clearInterval(timerId);
  timerId = null;
  // A route change during a poll must render the new view with its spinner and errors.
  refreshing = false;
}
