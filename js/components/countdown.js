// Animates countdown <progress> bars: each fills from data-start to data-end and writes the time left into the <small> that follows it.
const duration = new Intl.DurationFormat('en', { style: 'narrow' });

/** Starts a rAF loop for every progress[data-end] in the document; each loop ends when its bar finishes or leaves the DOM. */
export function animateCountdowns() {
  for (const bar of document.querySelectorAll('progress[data-end]')) {
    const start = Date.parse(bar.dataset.start);
    const end = Date.parse(bar.dataset.end);
    // An empty or unparsable span would assign NaN to value, which <progress> rejects with a TypeError.
    if (!(end > start)) continue;
    const text = bar.nextElementSibling;
    const tick = () => {
      if (!bar.isConnected) return;
      const remain = end - Date.now();
      bar.value = Math.min(Math.max(1 - remain / (end - start), 0), 1);
      text.textContent = remain > 0 ? formatRemaining(remain) : bar.dataset.done;
      if (remain > 0) requestAnimationFrame(tick);
    };
    tick();
  }
}

/** Formats a positive duration as e.g. "2d 3h 4m 5s", omitting zero units. */
export function formatRemaining(ms) {
  const s = Math.ceil(ms / 1000);
  return duration.format({
    days: Math.floor(s / 86400),
    hours: Math.floor(s / 3600) % 24,
    minutes: Math.floor(s / 60) % 60,
    seconds: s % 60,
  });
}
