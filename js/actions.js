// Shared write helpers for views: toasts, the Pico modal dialog, performAction around every POST/PATCH with a toast naming the result, and the shared Navigate and Deliver pickers.
import { endpoints, orNull } from './api.js';
import { setAgent } from './state.js';
import { renderNav } from './components/nav.js';
import { formatRemaining } from './components/countdown.js';
import { credits } from './components/loading.js';

const TOAST_BG = { ins: 'pico-background-jade-500', del: 'pico-background-red-500' };

/** Shows message for 4 s in the #toasts popover, above any open modal. @param {'ins'|'del'} variant */
export function showToast(message, variant) {
  const box = document.getElementById('toasts');
  const toast = Object.assign(document.createElement('article'), { className: TOAST_BG[variant], textContent: message });
  box.append(toast);
  raiseToasts();
  setTimeout(() => {
    toast.remove();
    if (!box.children.length) box.hidePopover();
  }, 4000);
}

/** Shows #toasts while it holds a toast. Re-entering the top layer stacks it above a modal opened after it. */
function raiseToasts() {
  const box = document.getElementById('toasts');
  if (!box.children.length) return;
  if (box.matches(':popover-open')) box.hidePopover();
  box.showPopover();
}

/**
 * Sends one write with btn busy, toasts what happened and each ship condition event, syncs data.agent into the nav, then runs after(result).
 * @returns {Promise<object|null>} the response, or null on failure; never rejects.
 */
export async function performAction(btn, apiFn, after = refreshView) {
  if (!navigator.onLine) {
    showToast('You are offline', 'del');
    return null;
  }
  btn.setAttribute('aria-busy', 'true');
  let result;
  try {
    result = await apiFn();
  } catch (err) {
    showToast(err.message, 'del');
    return null;
  } finally {
    btn.removeAttribute('aria-busy');
  }
  if (result.data?.agent) {
    setAgent(result.data.agent);
    renderNav();
  }
  showToast(summarize(result.data), 'ins');
  for (const e of result.data?.events ?? []) showToast(`${e.component}: ${e.name}`, 'del');
  after(result);
  return result;
}

const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const MARKET_VERB = { SELL: 'Sold', PURCHASE: 'Bought' };

/** Names what a write did from its response data, most specific shape first. @returns {string} */
function summarize(data) {
  const t = data?.transaction;
  const yld = data?.extraction?.yield ?? data?.siphon?.yield;
  if (yld) return `Extracted ${yld.units} ${yld.symbol}`;
  if (t?.shipType) return `Purchased ${t.shipType} for ${credits(t.price)}`;
  // Jump buys its antimatter through a MarketTransaction, so it precedes the market branch.
  if (t && data.nav) return `Jumped to ${data.nav.waypointSymbol}`;
  if (MARKET_VERB[t?.type]) return `${MARKET_VERB[t.type]} ${t.units} ${t.tradeSymbol} for ${credits(t.totalPrice)}`;
  // Mount and module changes name a tradeSymbol; repair and scrap share one shape, and only repair returns the ship.
  if (t?.totalPrice != null) return `${t.tradeSymbol ? `Refitted ${t.tradeSymbol}` : data.ship ? 'Repaired' : 'Scrapped'} for ${credits(t.totalPrice)}`;
  if (data?.produced) return `Refined ${data.produced.map((p) => `${p.units} ${p.tradeSymbol}`).join(', ')}`;
  if (data?.surveys) return `Found ${count(data.surveys.length, 'survey')}`;
  if (data?.systems) return `Scanned ${count(data.systems.length, 'system')}`;
  if (data?.waypoints) return `Scanned ${count(data.waypoints.length, 'waypoint')}`;
  if (data?.ships) return `Scanned ${count(data.ships.length, 'ship')}`;
  const left = Date.parse(data?.nav?.route?.arrival) - Date.now();
  if (data?.nav?.status === 'IN_TRANSIT' && left > 0) return `Arriving in ${formatRemaining(left)}`;
  return 'Action completed';
}

/** Runs a GET that feeds a dialog with btn busy; toasts and resolves null on failure. */
export async function busyFetch(btn, fn) {
  btn.setAttribute('aria-busy', 'true');
  try {
    return await fn();
  } catch (err) {
    if (err.name !== 'AbortError') showToast(err.message, 'del');
    return null;
  } finally {
    btn.removeAttribute('aria-busy');
  }
}

/**
 * Opens a Pico modal around a form. Confirm submits natively, so required/min/max validate and Enter submits.
 * The dialog closes unless onSubmit resolves null, so callbacks return performAction(...).
 * Without onSubmit the dialog is read-only: bodyHtml without a form, and a single Close button.
 */
export function openFormDialog(title, bodyHtml, onSubmit) {
  const html = document.documentElement;
  const formId = `dialog-form-${Date.now()}`;
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <article>
      <header><button aria-label="Close" rel="prev" data-close></button><h3>${title}</h3></header>
      ${onSubmit ? `<form id="${formId}">${bodyHtml}</form>` : bodyHtml}
      <footer>
        ${onSubmit ? `<button type="button" class="secondary" data-close>Cancel</button>
        <button form="${formId}">Confirm</button>` : '<button type="button" data-close>Close</button>'}
      </footer>
    </article>`;
  if (onSubmit) {
    const form = dialog.querySelector('form');
    const confirm = dialog.querySelector('[form]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (confirm.hasAttribute('aria-busy')) return;
      confirm.setAttribute('aria-busy', 'true');
      try {
        if (await onSubmit(new FormData(form)) !== null) dialog.close();
      } finally {
        confirm.removeAttribute('aria-busy');
      }
    });
  }
  // Pico's <dialog> is the full-screen backdrop. A press inside the article released outside it also clicks the <dialog>, so check where it started.
  let downOnBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === dialog; });
  dialog.addEventListener('click', (e) => {
    if ((downOnBackdrop && e.target === dialog) || e.target.closest('[data-close]')) dialog.close();
  });
  // showModal() makes everything outside the dialog inert, so #toasts moves inside it to stay announced.
  const toasts = document.getElementById('toasts');
  // 'close' also fires on Escape, so the scroll lock is always released.
  dialog.addEventListener('close', () => {
    html.classList.remove('modal-is-open');
    html.style.removeProperty('--pico-scrollbar-width');
    document.body.append(toasts);
    raiseToasts();
    dialog.remove();
  });
  html.style.setProperty('--pico-scrollbar-width', `${innerWidth - html.clientWidth}px`);
  html.classList.add('modal-is-open');
  dialog.append(toasts);
  document.body.append(dialog);
  dialog.showModal();
  raiseToasts();
  return dialog;
}

/** Resolves true when the user confirms message (HTML; escape API text). */
export function confirmAction(message) {
  return new Promise((resolve) => {
    let ok = false;
    openFormDialog('Confirm', `<p>${message}</p>`, () => (ok = true))
      .addEventListener('close', () => resolve(ok));
  });
}

/** Re-renders the current route. */
export function refreshView() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Opens the Navigate dialog for an orbiting ship: destinations nearest first, marketplaces flagged, and the ship's fuel.
 * The system and its markets load in one busyFetch; a failed market lookup only drops the flags.
 */
export async function openNavigateDialog(btn, ship) {
  const system = ship.nav.systemSymbol;
  const res = await busyFetch(btn, () => Promise.all([endpoints.systemDetail(system), orNull(endpoints.systemMarkets(system))]));
  if (!res) return;
  const [detail, markets] = res;
  const isMarket = new Set(markets?.map((w) => w.symbol));
  // When not in transit, route.destination is the ship's current position.
  const here = ship.nav.route.destination;
  const options = detail.data.waypoints
    .filter((w) => w.symbol !== ship.nav.waypointSymbol)
    .map((w) => [w, Math.round(Math.hypot(w.x - here.x, w.y - here.y))])
    .sort((a, b) => a[1] - b[1])
    .map(([w, d]) => `<option value="${w.symbol}">${w.symbol} (${w.type}, ${d}u)${isMarket.has(w.symbol) ? ' · market' : ''}</option>`)
    .join('');
  openFormDialog('Navigate', `
    <label for="navigate-destination">Destination</label>
    <select id="navigate-destination" name="waypointSymbol" required aria-describedby="navigate-fuel">${options}</select>
    <small id="navigate-fuel">Fuel ${ship.fuel.current}/${ship.fuel.capacity}</small>`,
    (fd) => performAction(btn, () => endpoints.navigateShip(ship.symbol, fd.get('waypointSymbol'))));
}

/**
 * Picks a ship holding tradeSymbol and a unit count up to min(remaining, held), then sends send(shipSymbol, units).
 * Callers pre-filter ships by location when the endpoint requires it.
 */
export function openDeliverDialog(btn, title, ships, tradeSymbol, remaining, send) {
  const held = (s) => s.cargo.inventory.find((i) => i.symbol === tradeSymbol)?.units ?? 0;
  const eligible = ships.filter((s) => held(s) > 0);
  if (!eligible.length) return showToast(`No eligible ship holds ${tradeSymbol}`, 'del');
  const max = (s) => Math.min(remaining, held(s));
  const dialog = openFormDialog(title, `
    <label>Ship
      <select name="shipSymbol" required>${eligible.map((s) => `<option value="${s.symbol}" data-max="${max(s)}">${s.symbol} (${held(s)} held @ ${s.nav.waypointSymbol})</option>`).join('')}</select>
    </label>
    <label>Units
      <input type="number" name="units" min="1" max="${max(eligible[0])}" value="${max(eligible[0])}" required>
    </label>`,
    (fd) => performAction(btn, () => send(fd.get('shipSymbol'), Number(fd.get('units')))));
  const select = dialog.querySelector('select');
  const units = dialog.querySelector('[name="units"]');
  select.addEventListener('change', () => { units.max = units.value = select.selectedOptions[0].dataset.max; });
}
