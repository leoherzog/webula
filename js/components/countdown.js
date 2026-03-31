/**
 * Smooth client-side countdown animations for <progress> elements.
 * Call animateCountdowns() after any render that places progress elements
 * with data-arrival or data-expiration attributes.
 *
 * Transit bars:  <progress data-departure="ISO" data-arrival="ISO" value="0" max="1">
 * Cooldown bars: <progress data-expiration="ISO" data-total-seconds="N" value="0" max="1">
 *
 * Companion text: <span data-countdown-text="SAME_ID"> paired via data-countdown-id.
 * Each rAF loop self-terminates when its element leaves the DOM.
 */

export function animateCountdowns() {
  for (const bar of document.querySelectorAll('progress[data-arrival]')) {
    animateTransit(bar);
  }
  for (const bar of document.querySelectorAll('progress[data-expiration]')) {
    animateCooldown(bar);
  }
}

function animateTransit(bar) {
  const departure = new Date(bar.dataset.departure).getTime();
  const arrival = new Date(bar.dataset.arrival).getTime();
  const total = arrival - departure;
  if (!(total > 0)) return;
  const textEl = findCompanionText(bar);

  function tick() {
    if (!document.contains(bar)) return;
    const now = Date.now();
    bar.value = Math.min((now - departure) / total, 1);
    if (textEl) {
      const remain = Math.max(arrival - now, 0);
      textEl.textContent = remain > 0 ? formatRemaining(remain) : 'Arrived';
    }
    if (bar.value < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateCooldown(bar) {
  const expiration = new Date(bar.dataset.expiration).getTime();
  const totalMs = parseFloat(bar.dataset.totalSeconds) * 1000;
  if (!totalMs || totalMs <= 0) return;
  const textEl = findCompanionText(bar);

  function tick() {
    if (!document.contains(bar)) return;
    const remain = Math.max(expiration - Date.now(), 0);
    bar.value = Math.min(1 - remain / totalMs, 1);
    if (textEl) textEl.textContent = remain > 0 ? formatRemaining(remain) : 'Ready';
    if (remain > 0) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function findCompanionText(bar) {
  const id = bar.dataset.countdownId;
  if (id) return document.querySelector(`[data-countdown-text="${id}"]`);
  return null;
}

function formatRemaining(ms) {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
