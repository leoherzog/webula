// Render helpers shared by views: the loading/error wrapper, HTML escaping, and small formatters.
import { isRefreshing } from '../refresh.js';

export function getMain() {
  return document.getElementById('app-main');
}

function showLoading(el) {
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = '<p>Loading...</p>';
}

function showError(el, error) {
  el.removeAttribute('aria-busy');
  el.innerHTML = `
    <article>
      <header>Error</header>
      <p>${escapeHtml(error.message)}</p>
      ${error.status === 401 ? '<p><a href="#/login">Re-authenticate</a></p>' : ''}
    </article>
  `;
}

/**
 * Runs fn with Pico's spinner on el and renders any error into it; a poll skips the spinner and keeps old content on any error but 401.
 * @returns {Promise<boolean>} false when a route change aborted fn; the caller must not start polling then.
 */
export async function withLoading(el, fn) {
  const quiet = isRefreshing();
  if (!quiet) showLoading(el);
  try {
    await fn();
  } catch (err) {
    if (err.name === 'AbortError') return false;
    if (!quiet || err.status === 401) showError(el, err);
  }
  el.removeAttribute('aria-busy');
  return true;
}

/** Escapes text for HTML content and quoted attribute values. */
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Formats a credit amount, such as ₵1,234. */
export const credits = (n) => `₵${Number(n).toLocaleString()}`;

export function systemFromWaypoint(waypointSymbol) {
  const parts = waypointSymbol.split('-');
  return `${parts[0]}-${parts[1]}`;
}

const NAV_STATUS_BG = {
  DOCKED: 'pico-background-jade-500',
  IN_ORBIT: 'pico-background-azure-550',
  IN_TRANSIT: '',
};

export function navStatusLabel(status) {
  const bg = NAV_STATUS_BG[status] ?? 'pico-background-slate-600';
  return `<mark${bg ? ` class="${bg}"` : ''}>${escapeHtml(status)}</mark>`;
}
