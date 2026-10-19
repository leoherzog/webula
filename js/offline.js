// Connectivity UI: toggles the nav's offline badge, toasts on change, and shows in the footer when the service worker last fetched fresh API data.
import { showToast } from './actions.js';

const LAST_UPDATED_KEY = 'st_last_updated';

function updateFooter(timestamp) {
  const el = document.getElementById('last-updated');
  if (!timestamp || !el) return;
  el.firstElementChild.textContent = `Last updated: ${new Date(timestamp).toLocaleString()}`;
  el.hidden = false;
}

function setOffline(offline) {
  document.getElementById('offline-badge')?.toggleAttribute('hidden', !offline);
}

export function initOffline() {
  updateFooter(Number(localStorage.getItem(LAST_UPDATED_KEY)));
  window.addEventListener('offline', () => {
    setOffline(true);
    showToast('You are offline. Showing cached data.', 'del');
  });
  window.addEventListener('online', () => {
    setOffline(false);
    showToast('Back online', 'ins');
  });
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type !== 'api-updated') return;
    localStorage.setItem(LAST_UPDATED_KEY, String(event.data.timestamp));
    updateFooter(event.data.timestamp);
  });
}
