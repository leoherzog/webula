// Fleet view: the agent summary and a paginated grid of ship cards with orbit, dock and navigate buttons.
import { endpoints } from '../api.js';
import { getAgent, setAgent, addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, navStatusLabel, systemFromWaypoint, escapeHtml, credits } from '../components/loading.js';
import { renderNav } from '../components/nav.js';
import { paginationNav } from '../components/pagination.js';
import { icon, SHIP_FRAMES, FACTIONS } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { animateCountdowns } from '../components/countdown.js';
import { performAction, openNavigateDialog } from '../actions.js';

export async function render(params) {
  const main = getMain();
  const ok = await withLoading(main, async () => {
    const [{ data: agent }, { data: ships, meta }] = await Promise.all([
      endpoints.myAgent(),
      endpoints.myShips(params.page),
    ]);
    // Re-rendering the nav closes an open agent menu, so only do it when the credits it shows changed.
    const creditsChanged = getAgent()?.credits !== agent.credits;
    setAgent(agent);
    if (creditsChanged) renderNav();
    const hqSystem = systemFromWaypoint(agent.headquarters);
    addDiscoveredSystem(hqSystem);
    for (const ship of ships) addDiscoveredSystem(ship.nav.systemSymbol);

    main.innerHTML = `
      <article>
        <dl class="grid">
          <div><dt>Symbol</dt><dd>${escapeHtml(agent.symbol)}</dd></div>
          <div><dt>Faction</dt><dd>${icon(FACTIONS, agent.startingFaction)} ${agent.startingFaction}</dd></div>
          <div><dt>Headquarters</dt><dd><a href="#/system/${hqSystem}/waypoint/${agent.headquarters}">${agent.headquarters}</a></dd></div>
          <div><dt>Credits</dt><dd>${credits(agent.credits)}</dd></div>
        </dl>
      </article>
      <h2>Fleet</h2>
      ${ships.length ? `<div class="grid grid-3">${ships.map(shipCard).join('')}</div>` : '<p>No ships found.</p>'}
      ${paginationNav(meta, '#/fleet')}`;
    animateCountdowns();

    // Listen on this render's elements; listeners on #app-main pile up across renders.
    main.querySelector('.grid-3')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const ship = ships.find((s) => s.symbol === btn.dataset.ship);
      if (btn.dataset.action === 'orbit') performAction(btn, () => endpoints.orbitShip(ship.symbol));
      else if (btn.dataset.action === 'dock') performAction(btn, () => endpoints.dockShip(ship.symbol));
      else openNavigateDialog(btn, ship);
    });
  });
  if (ok) startRefresh(() => render(params));
}

function shipCard(ship) {
  const { nav, cooldown } = ship;
  const actions = fleetActions(ship);
  return `
    <article>
      <header><a href="#/fleet/${ship.symbol}">${icon(SHIP_FRAMES, ship.frame.symbol)} <strong>${ship.symbol}</strong></a></header>
      <dl>
        <dt>Role</dt><dd>${ship.registration.role}</dd>
        <dt>Status</dt><dd>${navStatusLabel(nav.status)}</dd>
        <dt>Location</dt><dd><a href="#/system/${nav.systemSymbol}/waypoint/${nav.waypointSymbol}">${nav.waypointSymbol}</a></dd>
        <dt>Flight</dt><dd>${nav.flightMode}</dd>
        <dt>Fuel</dt><dd><progress value="${ship.fuel.current}" max="${ship.fuel.capacity}"></progress> ${ship.fuel.current}/${ship.fuel.capacity}</dd>
        <dt>Cargo</dt><dd>${ship.cargo.units}/${ship.cargo.capacity}</dd>
        ${nav.status === 'IN_TRANSIT' ? `<dt>Transit</dt><dd><progress value="0" max="1" data-start="${nav.route.departureTime}" data-end="${nav.route.arrival}" data-done="Arrived"></progress> <small></small></dd>` : ''}
        ${cooldown.remainingSeconds > 0 ? `<dt>Cooldown</dt><dd><progress value="0" max="1" data-start="${new Date(Date.parse(cooldown.expiration) - cooldown.totalSeconds * 1000).toISOString()}" data-end="${cooldown.expiration}" data-done="Ready"></progress> <small></small></dd>` : ''}
      </dl>
      ${actions ? `<footer>${actions}</footer>` : ''}
    </article>`;
}

function fleetActions(ship) {
  const data = `data-ship="${ship.symbol}"`;
  if (ship.nav.status === 'DOCKED') return `<button type="button" class="outline" data-action="orbit" ${data}>Orbit</button>`;
  if (ship.nav.status === 'IN_ORBIT') return `<button type="button" data-action="dock" ${data}>Dock</button> <button type="button" class="secondary" data-action="navigate" ${data}>Navigate</button>`;
  return '';
}
