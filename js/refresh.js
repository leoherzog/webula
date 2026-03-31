let timerId = null;
let refreshing = false;
let generation = 0;

export function isRefreshing() {
  return refreshing;
}

export function startRefresh(callback, interval = 30000) {
  stopRefresh();
  const gen = ++generation;
  timerId = setInterval(async () => {
    if (gen !== generation) return;
    refreshing = true;
    try {
      await callback();
    } catch {
      // Silently ignore — keep showing stale content
    } finally {
      refreshing = false;
    }
  }, interval);
}

export function stopRefresh() {
  generation++;
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}
