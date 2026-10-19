// Ship detail view: navigation, status, stored surveys, frame, cargo valued at the current market, modules and mounts cards, with the actions from ship-actions.js in each card's footer.
import { endpoints, orNull } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, navStatusLabel, systemFromWaypoint, escapeHtml, credits } from '../components/loading.js';
import { icon, SHIP_FRAMES } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { animateCountdowns } from '../components/countdown.js';
import { shipActions, bindShipActions } from './ship-actions.js';

const footer = (html) => (html ? `<footer>${html}</footer>` : '');
const waypointLink = (symbol) => `<a href="#/system/${systemFromWaypoint(symbol)}/waypoint/${symbol}">${symbol}</a>`;
const percent = (n) => `${Math.round(n * 100)}%`;

export async function render(params) {
  const main = getMain();
  const ok = await withLoading(main, async () => {
    const { data: ship } = await endpoints.shipDetail(params.shipSymbol);
    const { nav, cooldown } = ship;
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
    const valueCells = (item) => {
      if (!valued.length) return '';
      const price = prices.get(item.symbol);
      return price == null ? '<td>-</td><td>-</td>' : `<td>${credits(price)}</td><td>${credits(price * item.units)}</td>`;
    };
    // The symbol and its actions share the leading cell so both stay in view when the table scrolls on a phone.
    const cargoRows = ship.cargo.inventory.map((item) =>
      `<tr><td>${item.symbol}${a.cargo(item)}</td><td>${escapeHtml(item.name)}</td><td>${item.units}</td>${valueCells(item)}</tr>`,
    ).join('') || '<tr><td colspan="3">Empty</td></tr>';
    const worth = valued.length
      ? ` · <i class="fa-solid fa-coins"></i> ≈${credits(valued.reduce((sum, i) => sum + prices.get(i.symbol) * i.units, 0))}`
      : '';
    const moduleRows = ship.modules.map((m) => `<tr><td>${m.symbol}</td><td>${escapeHtml(m.name)}</td><td>${m.capacity ?? '-'}</td></tr>`).join('')
      || '<tr><td colspan="3">None</td></tr>';
    const mountRows = ship.mounts.map((m) => `<tr><td>${m.symbol}</td><td>${escapeHtml(m.name)}</td><td>${m.strength ?? '-'}</td></tr>`).join('')
      || '<tr><td colspan="3">None</td></tr>';

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
          <header>Frame</header>
          <dl>
            <dt>Type</dt><dd>${icon(SHIP_FRAMES, ship.frame.symbol)} ${escapeHtml(ship.frame.name)}</dd>
            <dt>Condition</dt><dd>${percent(ship.frame.condition)}</dd>
            <dt>Integrity</dt><dd>${percent(ship.frame.integrity)}</dd>
          </dl>
          ${footer(a.frame)}
        </article>
        <article>
          <header>Reactor</header>
          <dl>
            <dt>Type</dt><dd>${escapeHtml(ship.reactor.name)}</dd>
            <dt>Power</dt><dd>${ship.reactor.powerOutput}</dd>
            <dt>Condition</dt><dd>${percent(ship.reactor.condition)}</dd>
          </dl>
        </article>
        <article>
          <header>Engine</header>
          <dl>
            <dt>Type</dt><dd>${escapeHtml(ship.engine.name)}</dd>
            <dt>Speed</dt><dd>${ship.engine.speed}</dd>
            <dt>Condition</dt><dd>${percent(ship.engine.condition)}</dd>
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
      <article>
        <header>Modules (${ship.modules.length})</header>
        <div class="overflow-auto"><table>
          <thead><tr><th>Symbol</th><th>Name</th><th>Capacity</th></tr></thead>
          <tbody>${moduleRows}</tbody>
        </table></div>
        ${footer(a.modules)}
      </article>
      <article>
        <header>Mounts (${ship.mounts.length})</header>
        <div class="overflow-auto"><table>
          <thead><tr><th>Symbol</th><th>Name</th><th>Strength</th></tr></thead>
          <tbody>${mountRows}</tbody>
        </table></div>
        ${footer(a.mounts)}
      </article>
    </div>`;

    animateCountdowns();
    bindShipActions(main.firstElementChild, ship, market);
  });
  if (ok) startRefresh(() => render(params));
}
