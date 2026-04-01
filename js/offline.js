import { showToast } from './actions.js';

const LAST_UPDATED_KEY = 'st_last_updated';

export function isOffline() {
  return !navigator.onLine;
}

export function getLastUpdated() {
  const raw = localStorage.getItem(LAST_UPDATED_KEY);
  return raw ? Number(raw) : null;
}

export function setLastUpdated(timestamp) {
  localStorage.setItem(LAST_UPDATED_KEY, String(timestamp));
  updateFooter(timestamp);
}

function updateFooter(timestamp) {
  const el = document.getElementById('last-updated');
  if (!el) return;
  if (timestamp) {
    el.textContent = `Last updated: ${new Date(timestamp).toLocaleString()}`;
  }
}

function setOfflineState(offline) {
  if (offline) {
    document.documentElement.setAttribute('data-offline', '');
  } else {
    document.documentElement.removeAttribute('data-offline');
  }
}

export function initOffline() {
  // Set initial state
  setOfflineState(!navigator.onLine);
  updateFooter(getLastUpdated());

  window.addEventListener('offline', () => {
    setOfflineState(true);
    showToast('You are offline — showing cached data', 'del');
  });

  window.addEventListener('online', () => {
    setOfflineState(false);
    showToast('Back online', 'ins');
  });

  // Listen for service worker messages about fresh API data
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'api-updated') {
        setLastUpdated(event.data.timestamp);
      }
    });
  }
}
