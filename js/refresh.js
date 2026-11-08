// Re-renders the current view every 5 s, backing off exponentially after a failed poll and pausing while the tab is hidden or offline.
// router.js stops it on every route change.
const INTERVAL = 5000;
const MAX_DELAY = 5 * 60_000;
// The API's DDoS protection answers 502 and asks clients to wait a few minutes.
const BAD_GATEWAY_DELAY = 2 * 60_000;

let poll = null;
let timerId = null;
// A poll came due while the tab was hidden or offline, and runs when both end.
let due = false;
let refreshing = false;
let delay = INTERVAL;
let failure = null;
// Bumped on every stop, so a poll that outlives its route schedules nothing.
let generation = 0;

/** True while a poll re-render runs, so withLoading keeps the old content instead of showing a spinner. */
export function isRefreshing() {
  return refreshing;
}

/** Clears the failure recorded for the current view; withLoading calls it as each render starts. */
export function beginRender() {
  failure = null;
}

/**
 * Records a failure that sets the next poll's delay: the render's own error, or a GET it survived, such as an orNull() sub-fetch.
 * The first one wins, except that a 401 always does, because it stops polling.
 */
export function reportFailure(err) {
  if (!failure || err.status === 401) failure = err;
}

/** Polls callback, the current view's render; the call each poll's render makes keeps the running schedule and its backoff. */
export function startRefresh(callback) {
  poll = callback;
  if (refreshing) return;
  clearTimeout(timerId);
  delay = INTERVAL;
  schedule();
}

export function stopRefresh() {
  generation++;
  clearTimeout(timerId);
  timerId = null;
  poll = null;
  due = false;
  delay = INTERVAL;
  failure = null;
  // A route change during a poll must render the new view with its spinner and errors.
  refreshing = false;
}

/** Arms the next poll from the latest render's outcome. A 401 stops polling, because a rejected token does not recover. */
function schedule() {
  if (failure?.status === 401) return;
  // Each failure at least doubles the last delay, so a 502's wait never shrinks when a different error follows.
  const first = failure?.status === 502 ? BAD_GATEWAY_DELAY : INTERVAL * 2;
  delay = failure ? Math.min(Math.max(first, delay * 2), MAX_DELAY) : INTERVAL;
  timerId = setTimeout(run, delay);
}

async function run() {
  timerId = null;
  if (document.hidden || !navigator.onLine) {
    due = true;
    return;
  }
  const current = generation;
  refreshing = true;
  try {
    await poll();
  } finally {
    if (current === generation) refreshing = false;
  }
  if (current === generation) schedule();
}

function resume() {
  if (!due || document.hidden || !navigator.onLine) return;
  due = false;
  run();
}

document.addEventListener('visibilitychange', resume);
window.addEventListener('online', resume);
