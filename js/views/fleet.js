import { endpoints } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, navStatusLabel, systemFromWaypoint } from '../components/loading.js';
import { renderPagination } from '../components/pagination.js';
import { icon, SHIP_FRAMES } from '../icons.js';

export async function render(params, page = 1) {
  const main = getMain();
  await withLoading(main, async () => {
    const { data: ships, meta } = await endpoints.myShips(page);
    for (const ship of ships) addDiscoveredSystem(ship.nav.systemSymbol);

    main.innerHTML = `<h2>Fleet</h2>`;

    if (ships.length === 0) {
      main.innerHTML += '<p>No ships found.</p>';
      return;
    }

    const cards = ships.map(ship => `
      <article>
        <header>
          <a href="#/fleet/${ship.symbol}">${icon(SHIP_FRAMES, ship.frame.symbol)} <strong>${ship.symbol}</strong></a>
        </header>
        <dl>
          <dt>Role</dt><dd>${ship.registration.role}</dd>
          <dt>Status</dt><dd>${navStatusLabel(ship.nav.status)}</dd>
          <dt>Location</dt><dd>${ship.nav.waypointSymbol}</dd>
          <dt>Flight</dt><dd>${ship.nav.flightMode}</dd>
          <dt>Fuel</dt>
          <dd>
            <progress value="${ship.fuel.current}" max="${ship.fuel.capacity}"></progress>
            ${ship.fuel.current}/${ship.fuel.capacity}
          </dd>
          <dt>Cargo</dt>
          <dd>${ship.cargo.units}/${ship.cargo.capacity}</dd>
        </dl>
        <div id="ship-${ship.symbol}-actions"></div>
      </article>
    `).join('');

    main.innerHTML += `<div class="grid grid-3">${cards}</div>`;
    renderPagination(main, meta, (p) => render(params, p));
  });
}
