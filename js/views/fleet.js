import { endpoints } from '../api.js';
import { setAgent, addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, navStatusLabel, systemFromWaypoint } from '../components/loading.js';
import { renderPagination } from '../components/pagination.js';
import { icon, SHIP_FRAMES, FACTIONS } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { animateCountdowns } from '../components/countdown.js';
import { performAction, openFormDialog, refreshView } from '../actions.js';
import { fetchAllPages } from '../api.js';

export async function render(params, page = 1) {
  const main = getMain();
  await withLoading(main, async () => {
    const [{ data: agent }, { data: ships, meta }] = await Promise.all([
      endpoints.myAgent(),
      endpoints.myShips(page),
    ]);
    setAgent(agent);

    const hqSystem = systemFromWaypoint(agent.headquarters);
    addDiscoveredSystem(hqSystem);
    for (const ship of ships) addDiscoveredSystem(ship.nav.systemSymbol);

    main.innerHTML = `
      <article>
        <dl class="grid">
          <div><dt>Symbol</dt><dd>${agent.symbol}</dd></div>
          <div><dt>Faction</dt><dd>${icon(FACTIONS, agent.startingFaction)} ${agent.startingFaction}</dd></div>
          <div><dt>Headquarters</dt><dd><a href="#/system/${hqSystem}/waypoint/${agent.headquarters}">${agent.headquarters}</a></dd></div>
          <div><dt>Credits</dt><dd>₵${agent.credits.toLocaleString()}</dd></div>
        </dl>
      </article>

      <h2>Fleet</h2>
    `;

    if (ships.length === 0) {
      main.innerHTML += '<p>No ships found.</p>';
      return;
    }

    const cards = ships.map(ship => {
      const isTransit = ship.nav.status === 'IN_TRANSIT';
      const transitRow = isTransit ? `
        <dt>Transit</dt>
        <dd class="countdown-bar countdown-bar-mini">
          <progress class="transit" value="0" max="1"
            data-departure="${ship.nav.route.departureTime}"
            data-arrival="${ship.nav.route.arrival}"
            data-countdown-id="transit-${ship.symbol}">
          </progress>
          <span data-countdown-text="transit-${ship.symbol}"></span>
        </dd>
      ` : '';

      return `
        <article>
          <header>
            <a href="#/fleet/${ship.symbol}">${icon(SHIP_FRAMES, ship.frame.symbol)} <strong>${ship.symbol}</strong></a>
          </header>
          <dl>
            <dt>Role</dt><dd>${ship.registration.role}</dd>
            <dt>Status</dt><dd>${navStatusLabel(ship.nav.status)}</dd>
            <dt>Location</dt><dd><a href="#/system/${ship.nav.systemSymbol}/waypoint/${ship.nav.waypointSymbol}">${ship.nav.waypointSymbol}</a></dd>
            <dt>Flight</dt><dd>${ship.nav.flightMode}</dd>
            <dt>Fuel</dt>
            <dd>
              <progress value="${ship.fuel.current}" max="${ship.fuel.capacity}"></progress>
              ${ship.fuel.current}/${ship.fuel.capacity}
            </dd>
            <dt>Cargo</dt>
            <dd>${ship.cargo.units}/${ship.cargo.capacity}</dd>
            ${transitRow}
          </dl>
          <div id="ship-${ship.symbol}-actions"></div>
        </article>
      `;
    }).join('');

    main.innerHTML += `<div class="grid grid-3">${cards}</div>`;
    renderPagination(main, meta, (p) => render(params, p));

    animateCountdowns();
    populateFleetActions(ships);

    // Delegated click handler on the grid container
    const grid = main.querySelector('.grid.grid-3');
    if (grid) {
      grid.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const symbol = btn.dataset.ship;

        if (action === 'orbit') {
          await performAction(btn, () => endpoints.orbitShip(symbol));
          refreshView();
        } else if (action === 'dock') {
          await performAction(btn, () => endpoints.dockShip(symbol));
          refreshView();
        } else if (action === 'navigate') {
          const systemSymbol = btn.dataset.system;
          const currentWp = btn.dataset.waypoint;
          const dialog = openFormDialog(
            'Navigate Ship',
            `<label>Destination
              <select name="waypointSymbol" required aria-busy="true" disabled>
                <option value="">Loading waypoints…</option>
              </select>
            </label>`,
            async (formData) => {
              const waypointSymbol = formData.get('waypointSymbol');
              await performAction(btn, () => endpoints.navigateShip(symbol, waypointSymbol));
              refreshView();
            }
          );
          const select = dialog.querySelector('select[name="waypointSymbol"]');
          const confirmBtn = dialog.querySelector('.confirm-btn');
          confirmBtn.disabled = true;
          const waypoints = await fetchAllPages(`/systems/${systemSymbol}/waypoints`);
          const options = waypoints
            .filter(w => w.symbol !== currentWp)
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
            .map(w => `<option value="${w.symbol}">${w.symbol} (${w.type})</option>`)
            .join('');
          select.innerHTML = options;
          select.removeAttribute('aria-busy');
          select.disabled = false;
          confirmBtn.disabled = false;
        }
      });
    }
  });
  startRefresh(() => render(params, page));
}

function populateFleetActions(ships) {
  for (const ship of ships) {
    const container = document.getElementById(`ship-${ship.symbol}-actions`);
    if (!container) continue;

    const status = ship.nav.status;

    if (status === 'DOCKED') {
      container.innerHTML = `
        <button class="outline" data-action="orbit" data-ship="${ship.symbol}">Orbit</button>
      `;
    } else if (status === 'IN_ORBIT') {
      container.innerHTML = `
        <button data-action="dock" data-ship="${ship.symbol}">Dock</button>
        <button class="secondary" data-action="navigate" data-ship="${ship.symbol}" data-system="${ship.nav.systemSymbol}" data-waypoint="${ship.nav.waypointSymbol}">Navigate</button>
      `;
    }
    // IN_TRANSIT: no buttons
  }
}
