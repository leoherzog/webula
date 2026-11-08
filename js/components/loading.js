// Render helpers shared by views: the loading/error wrapper, HTML escaping, and small formatters.
import { isRefreshing, beginRender, reportFailure } from '../refresh.js';
import { icon, FACTIONS } from '../icons.js';

// The HTML setContent last wrote into each element; the spinner and error card clear it.
const shown = new WeakMap();

export function getMain() {
  return document.getElementById('app-main');
}

function showLoading(el) {
  shown.delete(el);
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = '<p>Loading...</p>';
}

function showError(el, error) {
  shown.delete(el);
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
 * Reports a failed render to refresh.js, which backs off.
 * @returns {Promise<boolean>} false when a route change aborted fn; the caller must not start polling then.
 */
export async function withLoading(el, fn) {
  const quiet = isRefreshing();
  if (!quiet) showLoading(el);
  beginRender();
  try {
    await fn();
  } catch (err) {
    if (err.name === 'AbortError') return false;
    reportFailure(err);
    if (!quiet || err.status === 401) showError(el, err);
  }
  el.removeAttribute('aria-busy');
  return true;
}

/**
 * Writes html into el, except on a poll whose html matches what el shows, so focus, an open select and busy buttons survive.
 * Every route change shows the spinner first, so only the same view's last render can match.
 * @returns {boolean} whether el was rewritten; when false, skip work for new elements such as animateCountdowns().
 */
export function setContent(el, html) {
  if (isRefreshing() && shown.get(el) === html) return false;
  el.innerHTML = html;
  shown.set(el, html);
  return true;
}

/** Escapes text for HTML content and quoted attribute values. */
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Formats a credit amount, such as ₵1,234. */
export const credits = (n) => `₵${Number(n).toLocaleString()}`;

/** A faction symbol with its icon, linked to its faction page. */
export const factionLink = (symbol) => `<a href="#/factions/${symbol}">${icon(FACTIONS, symbol)} ${symbol}</a>`;

/** An escaped agent symbol linked to its public profile; a symbol outside the router's [\w-]+ charset stays plain text. */
export function agentLink(symbol) {
  const text = escapeHtml(symbol);
  return /^[\w-]+$/.test(symbol) ? `<a href="#/agents/${symbol}">${text}</a>` : text;
}

/** A pill marking the logged-in agent or a saved one, set beside the name; '' for anyone else. */
export function agentMark(symbol, me, saved) {
  if (symbol === me) return '<mark class="pico-background-jade-500">You</mark>';
  return saved.has(symbol) ? '<mark class="pico-background-azure-550" title="Saved agent">Saved</mark>' : '';
}

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
