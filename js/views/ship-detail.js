import { endpoints } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, navStatusLabel } from '../components/loading.js';
import { icon, SHIP_FRAMES } from '../icons.js';

export async function render({ shipSymbol }) {
  const main = getMain();
  await withLoading(main, async () => {
    const { data: ship } = await endpoints.shipDetail(shipSymbol);
    addDiscoveredSystem(ship.nav.systemSymbol);

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
    const arrival = isTransit ? new Date(nav.route.arrival).toLocaleString() : null;

    main.innerHTML = `
      <h2>
        <a href="#/fleet">&larr; Fleet</a> / ${icon(SHIP_FRAMES, ship.frame.symbol)} ${ship.symbol}
      </h2>

      <div class="grid">
        <article>
          <header>Navigation</header>
          <dl>
            <dt>Status</dt><dd>${navStatusLabel(nav.status)}</dd>
            <dt>Location</dt><dd>${nav.waypointSymbol}</dd>
            <dt>System</dt><dd><a href="#/system/${nav.systemSymbol}">${nav.systemSymbol}</a></dd>
            <dt>Flight Mode</dt><dd>${nav.flightMode}</dd>
            ${isTransit ? `
              <dt>Origin</dt><dd>${nav.route.origin.symbol}</dd>
              <dt>Destination</dt><dd>${nav.route.destination.symbol}</dd>
              <dt>Arrival</dt><dd>${arrival}</dd>
            ` : ''}
          </dl>
        </article>

        <article>
          <header>Fuel</header>
          <progress value="${ship.fuel.current}" max="${ship.fuel.capacity}"></progress>
          <p>${ship.fuel.current} / ${ship.fuel.capacity}</p>
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

      <article>
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
  });
}
