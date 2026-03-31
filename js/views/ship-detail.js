import { endpoints } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, navStatusLabel, systemFromWaypoint } from '../components/loading.js';
import { icon, SHIP_FRAMES } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { animateCountdowns } from '../components/countdown.js';
import { populateShipActions } from './ship-actions.js';

export async function render({ shipSymbol }) {
  const main = getMain();
  await withLoading(main, async () => {
    const [{ data: ship }, { data: cooldown }] = await Promise.all([
      endpoints.shipDetail(shipSymbol),
      endpoints.shipCooldown(shipSymbol),
    ]);
    addDiscoveredSystem(ship.nav.systemSymbol);

    let waypoint = null;
    if (ship.nav.status !== 'IN_TRANSIT') {
      try {
        const { data: wp } = await endpoints.waypointDetail(ship.nav.systemSymbol, ship.nav.waypointSymbol);
        waypoint = wp;
      } catch { /* ignore - waypoint data is supplementary */ }
    }

    const cargoRows = ship.cargo.inventory.map(item =>
      `<tr><td>${item.symbol}</td><td>${item.name}</td><td>${item.units}</td></tr>`
    ).join('') || '<tr><td colspan="3">Empty</td></tr>';

    const moduleRows = ship.modules.map(m =>
      `<tr><td>${m.symbol}</td><td>${m.name || m.symbol}</td><td>${m.capacity ?? '-'}</td></tr>`
    ).join('');

    const mountRows = ship.mounts.map(m =>
      `<tr><td>${m.symbol}</td><td>${m.name || m.symbol}</td><td>${m.strength ?? '-'}</td></tr>`
    ).join('');

    const nav = ship.nav;
    const isTransit = nav.status === 'IN_TRANSIT';

    const transitHtml = isTransit ? `
      <dt>Origin</dt><dd><a href="#/system/${systemFromWaypoint(nav.route.origin.symbol)}/waypoint/${nav.route.origin.symbol}">${nav.route.origin.symbol}</a></dd>
      <dt>Destination</dt><dd><a href="#/system/${systemFromWaypoint(nav.route.destination.symbol)}/waypoint/${nav.route.destination.symbol}">${nav.route.destination.symbol}</a></dd>
      <dt>Transit</dt>
      <dd class="countdown-bar">
        <progress class="transit" value="0" max="1"
          data-departure="${nav.route.departureTime}"
          data-arrival="${nav.route.arrival}"
          data-countdown-id="transit-${shipSymbol}">
        </progress>
        <span data-countdown-text="transit-${shipSymbol}"></span>
      </dd>
    ` : '';

    const cooldownHtml = cooldown ? `
      <dl>
        <dt>Cooldown</dt>
        <dd class="countdown-bar">
          <progress class="cooldown" value="0" max="1"
            data-expiration="${cooldown.expiration}"
            data-total-seconds="${cooldown.totalSeconds}"
            data-countdown-id="cooldown-${shipSymbol}">
          </progress>
          <span data-countdown-text="cooldown-${shipSymbol}"></span>
        </dd>
      </dl>
    ` : '';

    main.innerHTML = `
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
            <dt>Location</dt><dd><a href="#/system/${nav.systemSymbol}/waypoint/${nav.waypointSymbol}">${nav.waypointSymbol}</a></dd>
            <dt>System</dt><dd><a href="#/system/${nav.systemSymbol}">${nav.systemSymbol}</a></dd>
            <dt>Flight Mode</dt><dd>${nav.flightMode}</dd>
            ${transitHtml}
          </dl>
          <div id="nav-actions"></div>
        </article>

        <article>
          <header>Status</header>
          <dl>
            <dt>Fuel</dt>
            <dd>
              <progress value="${ship.fuel.current}" max="${ship.fuel.capacity}"></progress>
              ${ship.fuel.current} / ${ship.fuel.capacity}
            </dd>
          </dl>
          ${cooldownHtml}
          <div id="status-actions"></div>
        </article>
      </div>

      <div class="grid">
        <article>
          <header>Frame</header>
          <dl>
            <dt>Type</dt><dd>${icon(SHIP_FRAMES, ship.frame.symbol)} ${ship.frame.name}</dd>
            <dt>Condition</dt><dd>${Math.round((ship.frame.condition ?? 1) * 100)}%</dd>
            <dt>Integrity</dt><dd>${Math.round((ship.frame.integrity ?? 1) * 100)}%</dd>
          </dl>
        </article>
        <article>
          <header>Reactor</header>
          <dl>
            <dt>Type</dt><dd>${ship.reactor.name}</dd>
            <dt>Power</dt><dd>${ship.reactor.powerOutput}</dd>
            <dt>Condition</dt><dd>${Math.round((ship.reactor.condition ?? 1) * 100)}%</dd>
          </dl>
        </article>
        <article>
          <header>Engine</header>
          <dl>
            <dt>Type</dt><dd>${ship.engine.name}</dd>
            <dt>Speed</dt><dd>${ship.engine.speed}</dd>
            <dt>Condition</dt><dd>${Math.round((ship.engine.condition ?? 1) * 100)}%</dd>
          </dl>
        </article>
      </div>

      <article id="cargo-section">
        <header>Cargo (${ship.cargo.units}/${ship.cargo.capacity})</header>
        <div class="overflow-auto">
          <table>
            <thead><tr><th>Symbol</th><th>Name</th><th>Units</th></tr></thead>
            <tbody>${cargoRows}</tbody>
          </table>
        </div>
      </article>

      <div class="grid">
        <article>
          <header>Modules (${ship.modules.length})</header>
          <div class="overflow-auto">
            <table>
              <thead><tr><th>Symbol</th><th>Name</th><th>Capacity</th></tr></thead>
              <tbody>${moduleRows}</tbody>
            </table>
          </div>
        </article>
        <article>
          <header>Mounts (${ship.mounts.length})</header>
          <div class="overflow-auto">
            <table>
              <thead><tr><th>Symbol</th><th>Name</th><th>Strength</th></tr></thead>
              <tbody>${mountRows}</tbody>
            </table>
          </div>
        </article>
      </div>

      <section id="ship-actions"></section>
    `;

    animateCountdowns();
    populateShipActions(ship, cooldown, waypoint);
  });
  startRefresh(() => render({ shipSymbol }));
}
