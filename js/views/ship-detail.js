// Ship detail view: navigation, status, stored surveys, registration, crew, frame, reactor, engine, cargo valued at the current market, and expandable modules and mounts, with the actions from ship-actions.js in each card's footer.
import { endpoints, orNull } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, navStatusLabel, systemFromWaypoint, escapeHtml, credits, factionLink } from '../components/loading.js';
import { icon, SHIP_FRAMES } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { animateCountdowns } from '../components/countdown.js';
import { shipActions, bindShipActions } from './ship-actions.js';

const footer = (html) => (html ? `<footer>${html}</footer>` : '');
const waypointLink = (symbol) => `<a href="#/system/${systemFromWaypoint(symbol)}/waypoint/${symbol}">${symbol}</a>`;
const percent = (n) => `${Math.round(n * 100)}%`;
const formatTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
const pill = (html) => `<mark class="pico-background-slate-600">${html}</mark>`;
/** A <dt>/<dd> pair for an HTML value, or '' when the value is empty. */
const row = (label, value) => (value ? `<dt>${label}</dt><dd>${value}</dd>` : '');

/** ShipRequirements as "1 power, 2 crew, 1 slot"; every field is optional, so it may return ''. */
function requires(r) {
  return [
    r.power != null && `${r.power} power`,
    r.crew != null && `${r.crew} crew`,
    r.slots != null && `${r.slots} slot${r.slots === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ');
}

/** The rows a frame, reactor and engine share. */
const componentRows = (c) => `
  <dt>Quality</dt><dd>${c.quality}</dd>
  <dt>Condition</dt><dd>${percent(c.condition)}</dd>
  <dt>Integrity</dt><dd>${percent(c.integrity)}</dd>
  ${row('Requires', requires(c.requirements))}`;

/**
 * Installed modules or mounts, one <details> per symbol: name, count and stats in the summary; symbol, description, deposits and requirements inside.
 * @param {Set<string>} openParts the data-part keys that were open in the previous render
 */
function partList(parts, shipSymbol, openParts) {
  // Parts that share a symbol share every field, so duplicates collapse into one entry with a count.
  return Object.values(Object.groupBy(parts, (p) => p.symbol)).map((group) => {
    const p = group[0];
    const key = `${shipSymbol} ${p.symbol}`;
    const stats = [
      group.length > 1 && pill(`×${group.length}`),
      p.capacity != null && pill(`Capacity ${p.capacity}`),
      p.range != null && pill(`Range ${p.range}`),
      p.strength != null && pill(`Strength ${p.strength}`),
    ].filter(Boolean).join(' ');
    const facts = row('Deposits', p.deposits?.map((d) => pill(d)).join(' ')) + row('Requires', requires(p.requirements));
    return `
      <details data-part="${key}"${openParts.has(key) ? ' open' : ''}>
        <summary role="button" class="outline secondary">${escapeHtml(p.name)} ${stats}</summary>
        <p><small>${p.symbol}</small>${p.description ? `<br>${escapeHtml(p.description)}` : ''}</p>
        ${facts && `<dl>${facts}</dl>`}
      </details>`;
  }).join('') || '<p>None</p>';
}

export async function render(params) {
  const main = getMain();
  // Read before withLoading's spinner replaces the page, so open parts also survive the refresh after an action.
  const openParts = new Set([...main.querySelectorAll('details[open][data-part]')].map((d) => d.dataset.part));
  const ok = await withLoading(main, async () => {
    const { data: ship } = await endpoints.shipDetail(params.shipSymbol);
    const { nav, cooldown, crew, registration } = ship;
    addDiscoveredSystem(nav.systemSymbol);
    const waypoint = nav.status === 'IN_TRANSIT'
      ? null
      : (await orNull(endpoints.waypointDetail(nav.systemSymbol, nav.waypointSymbol)))?.data ?? null;
    // Only cargo prices and docked trading read the market, so a ship with neither skips the GET.
    const market = waypoint?.traits.some((t) => t.symbol === 'MARKETPLACE') && (nav.status === 'DOCKED' || ship.cargo.inventory.length)
      ? (await orNull(endpoints.waypointMarket(nav.systemSymbol, nav.waypointSymbol)))?.data ?? null
      : null;
    const prices = new Map(market?.tradeGoods?.map((g) => [g.symbol, g.sellPrice]));
    const valued = ship.cargo.inventory.filter((i) => prices.has(i.symbol));
    const a = shipActions(ship, waypoint, market);

    const transit = nav.status === 'IN_TRANSIT' ? `
      <dt>Origin</dt><dd>${waypointLink(nav.route.origin.symbol)}</dd>
      <dt>Destination</dt><dd>${waypointLink(nav.route.destination.symbol)}</dd>
      <dt>Transit</dt><dd><progress value="0" max="1" data-start="${nav.route.departureTime}" data-end="${nav.route.arrival}" data-done="Arrived"></progress> <small></small></dd>` : '';
    const cooldownBar = cooldown.remainingSeconds > 0
      ? `<progress value="0" max="1" data-start="${new Date(Date.parse(cooldown.expiration) - cooldown.totalSeconds * 1000).toISOString()}" data-end="${cooldown.expiration}" data-done="Ready"></progress> <small></small>`
      : '<progress value="1" max="1"></progress> <small>Ready</small>';
    const { consumed } = ship.fuel;
    const valueCells = (item) => {
      if (!valued.length) return '';
      const price = prices.get(item.symbol);
      return price == null ? '<td>-</td><td>-</td>' : `<td>${credits(price)}</td><td>${credits(price * item.units)}</td>`;
    };
    // The symbol and its actions share the leading cell so both stay in view when the table scrolls on a phone.
    const cargoRows = ship.cargo.inventory.map((item) =>
      `<tr><td>${item.symbol}${a.cargo(item)}</td><td>${escapeHtml(item.name)}<br><small>${escapeHtml(item.description)}</small></td><td>${item.units}</td>${valueCells(item)}</tr>`,
    ).join('') || '<tr><td colspan="3">Empty</td></tr>';
    const worth = valued.length
      ? ` · <i class="fa-solid fa-coins"></i> ≈${credits(valued.reduce((sum, i) => sum + prices.get(i.symbol) * i.units, 0))}`
      : '';

    main.innerHTML = `<div>
      <nav aria-label="breadcrumb">
        <ul>
          <li><a href="#/fleet">Fleet</a></li>
          <li>${icon(SHIP_FRAMES, ship.frame.symbol)} ${ship.symbol}</li>
        </ul>
      </nav>
      <div class="grid">
        <article>
          <header>Navigation</header>
          <dl>
            <dt>Status</dt><dd>${navStatusLabel(nav.status)}</dd>
            <dt>Location</dt><dd>${waypointLink(nav.waypointSymbol)}</dd>
            <dt>System</dt><dd><a href="#/system/${nav.systemSymbol}">${nav.systemSymbol}</a></dd>
            <dt>Flight Mode</dt><dd>${a.flightMode}</dd>
            ${transit}
          </dl>
          ${footer(a.nav)}
        </article>
        <article>
          <header>Status</header>
          <dl>
            <dt>Fuel</dt><dd><progress value="${ship.fuel.current}" max="${ship.fuel.capacity}"></progress> ${ship.fuel.current} / ${ship.fuel.capacity}</dd>
            ${row('Fuel Used', consumed && `${consumed.amount} at ${formatTime(consumed.timestamp)}`)}
            <dt>Cooldown</dt><dd>${cooldownBar}</dd>
          </dl>
          ${footer(a.status)}
        </article>
      </div>
      ${a.surveys && `<article>
        <header>Surveys</header>
        ${a.surveys}
      </article>`}
      <div class="grid">
        <article>
          <header>Registration</header>
          <dl>
            <dt>Name</dt><dd>${escapeHtml(registration.name)}</dd>
            <dt>Faction</dt><dd>${factionLink(registration.factionSymbol)}</dd>
            <dt>Role</dt><dd>${registration.role}</dd>
          </dl>
        </article>
        <article>
          <header>Crew</header>
          <dl>
            <dt>Members</dt><dd>${crew.current} / ${crew.capacity}</dd>
            <dt>Required</dt><dd>${crew.required}</dd>
            <dt>Morale</dt><dd><progress value="${crew.morale}" max="100"></progress> ${crew.morale} / 100</dd>
            <dt>Rotation</dt><dd>${crew.rotation}</dd>
            <dt>Wages</dt><dd>${credits(crew.wages)} per member per hour</dd>
          </dl>
        </article>
      </div>
      <div class="grid">
        <article>
          <header>Frame</header>
          <p>${escapeHtml(ship.frame.description)}</p>
          <dl>
            <dt>Type</dt><dd>${icon(SHIP_FRAMES, ship.frame.symbol)} ${escapeHtml(ship.frame.name)}</dd>
            <dt>Module Slots</dt><dd>${ship.frame.moduleSlots}</dd>
            <dt>Mounting Points</dt><dd>${ship.frame.mountingPoints}</dd>
            <dt>Fuel Capacity</dt><dd>${ship.frame.fuelCapacity}</dd>
            ${componentRows(ship.frame)}
          </dl>
          ${footer(a.frame)}
        </article>
        <article>
          <header>Reactor</header>
          <p>${escapeHtml(ship.reactor.description)}</p>
          <dl>
            <dt>Type</dt><dd>${escapeHtml(ship.reactor.name)}</dd>
            <dt>Power</dt><dd>${ship.reactor.powerOutput}</dd>
            ${componentRows(ship.reactor)}
          </dl>
        </article>
        <article>
          <header>Engine</header>
          <p>${escapeHtml(ship.engine.description)}</p>
          <dl>
            <dt>Type</dt><dd>${escapeHtml(ship.engine.name)}</dd>
            <dt>Speed</dt><dd>${ship.engine.speed}</dd>
            ${componentRows(ship.engine)}
          </dl>
        </article>
      </div>
      <article>
        <header>Cargo (${ship.cargo.units}/${ship.cargo.capacity})${worth}</header>
        <div class="overflow-auto">
          <table>
            <thead><tr><th>Symbol</th><th>Name</th><th>Units</th>${valued.length ? '<th>Sell</th><th>Value</th>' : ''}</tr></thead>
            <tbody>${cargoRows}</tbody>
          </table>
        </div>
        ${footer(a.buy)}
      </article>
      <div class="grid">
        <article>
          <header>Modules (${ship.modules.length})</header>
          ${partList(ship.modules, ship.symbol, openParts)}
          ${footer(a.modules)}
        </article>
        <article>
          <header>Mounts (${ship.mounts.length})</header>
          ${partList(ship.mounts, ship.symbol, openParts)}
          ${footer(a.mounts)}
        </article>
      </div>
    </div>`;

    animateCountdowns();
    bindShipActions(main.firstElementChild, ship, market);
  });
  if (ok) startRefresh(() => render(params));
}
