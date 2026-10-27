// System view: the Sigma map of one system and a paginated grid of its waypoints, filtered by type and trait from the hash query.
// Each card's Navigate Here menu lists the ships orbiting elsewhere in the system, nearest first.
import { endpoints, orNull } from '../api.js';
import { getAgent, addDiscoveredSystem, getDiscoveredSystems } from '../state.js';
import { getMain, withLoading, escapeHtml, systemFromWaypoint, factionLink } from '../components/loading.js';
import { paginationNav } from '../components/pagination.js';
import { icon, WAYPOINT_TYPES, STAR_TYPES } from '../icons.js';
import { renderSystemMap } from '../components/system-map.js';
import { performAction } from '../actions.js';

// Filter choices, each in the spec's WaypointType or WaypointTraitSymbol enum; a query value outside them is ignored.
const FILTERS = {
  type: Object.keys(WAYPOINT_TYPES).filter((k) => k !== '_default'),
  traits: ['MARKETPLACE', 'SHIPYARD', 'UNCHARTED', 'UNDER_CONSTRUCTION'],
};

export async function render(params) {
  const main = getMain();
  const hq = getAgent()?.headquarters;
  const systemSymbol = params.systemSymbol ?? (hq && systemFromWaypoint(hq));
  if (!systemSymbol) {
    // A load aborted by this route change leaves the previous view's spinner flag set.
    main.removeAttribute('aria-busy');
    main.innerHTML = '<p>No system to display. Visit the <a href="#/fleet">Fleet</a> first.</p>';
    return;
  }

  const filters = Object.fromEntries(Object.entries(FILTERS).map(([name, allowed]) => {
    const value = params.query.get(name);
    return [name, allowed.includes(value) ? value : ''];
  }));

  await withLoading(main, async () => {
    const [{ data: system }, { data: waypoints, meta }, allShips] = await Promise.all([
      endpoints.systemDetail(systemSymbol),
      endpoints.systemWaypoints(systemSymbol, params.page, filters),
      orNull(endpoints.allShips()),
    ]);
    const ships = (allShips ?? []).filter((s) => s.nav.systemSymbol === systemSymbol);
    const orbiting = ships.filter((s) => s.nav.status === 'IN_ORBIT');
    addDiscoveredSystem(systemSymbol);
    for (const s of allShips ?? []) addDiscoveredSystem(s.nav.systemSymbol);

    main.innerHTML = `
      <h2>${icon(STAR_TYPES, system.type)} ${systemSymbol} <small>${system.type}</small></h2>
      <form role="search">
        <input type="text" name="system" list="discovered-systems" placeholder="Jump to system (e.g. X1-DF55)" required pattern="\\s*[\\w\\-]+\\s*">
        <button type="submit">Go</button>
      </form>
      <p><a href="#/systems"><i class="fa-solid fa-list"></i> All systems</a></p>
      <datalist id="discovered-systems">${getDiscoveredSystems().map((s) => `<option value="${escapeHtml(s)}">`).join('')}</datalist>
      <form role="group">
        ${filterSelect('type', 'Waypoint type', 'All types', filters.type)}
        ${filterSelect('traits', 'Waypoint trait', 'All traits', filters.traits)}
      </form>
      <article>
        <header>System Map</header>
        <div id="system-map" style="height:400px"></div>
      </article>
      ${waypoints.length
        ? `<div class="grid grid-3">${waypoints.map((wp) => waypointCard(wp, systemSymbol, orbiting)).join('')}</div>`
        : '<p>No waypoints match.</p>'}
      ${paginationNav(meta, filterHash(systemSymbol, filters))}`;

    try {
      renderSystemMap(main.querySelector('#system-map'), system, ships);
    } catch (err) {
      // Sigma throws without WebGL; the waypoint grid still works.
      console.error(err);
      main.querySelector('#system-map').outerHTML = '<p>Map unavailable in this browser.</p>';
    }

    // The input's pattern rejects blank or spaced values, which match no route; its '-' stays escaped because browsers compile pattern with the v flag.
    main.querySelector('form[role="search"]').addEventListener('submit', (e) => {
      e.preventDefault();
      window.location.hash = `#/system/${e.target.elements.system.value.trim().toUpperCase()}`;
    });
    main.querySelector('form[role="group"]').addEventListener('change', (e) => {
      window.location.hash = filterHash(systemSymbol, Object.fromEntries(new FormData(e.currentTarget)));
    });
    // Listen on this render's elements; listeners on #app-main pile up across renders.
    main.querySelector('.grid-3')?.addEventListener('click', (e) => {
      const link = e.target.closest('[data-action="nav-to"]');
      if (!link) return;
      e.preventDefault();
      performAction(link, () => endpoints.navigateShip(link.dataset.ship, link.dataset.waypoint));
    });
  });
}

/** The view's hash for filters, leaving out empty ones. It carries no page, so a filter change starts at page 1. */
function filterHash(systemSymbol, filters) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return `#/system/${systemSymbol}${query ? `?${query}` : ''}`;
}

/** A filter <select> over FILTERS[name], with an empty "all" option and current selected. */
function filterSelect(name, label, all, current) {
  return `
    <select name="${name}" aria-label="${label}">
      <option value="">${all}</option>
      ${FILTERS[name].map((v) => `<option value="${v}"${v === current ? ' selected' : ''}>${v}</option>`).join('')}
    </select>`;
}

function waypointCard(wp, systemSymbol, orbiting) {
  const traits = wp.traits.map((t) => `<mark class="pico-background-slate-600">${t.symbol}</mark>`).join(' ') || '-';
  // An orbiting ship is at its route's destination, the only nav field with coordinates.
  const senders = orbiting
    .filter((s) => s.nav.waypointSymbol !== wp.symbol)
    .map((s) => {
      const { x, y } = s.nav.route.destination;
      return { symbol: s.symbol, distance: Math.round(Math.hypot(x - wp.x, y - wp.y)) };
    })
    .sort((a, b) => a.distance - b.distance);
  return `
    <article>
      <header><a href="#/system/${systemSymbol}/waypoint/${wp.symbol}">${icon(WAYPOINT_TYPES, wp.type)} <strong>${wp.symbol}</strong></a> &mdash; ${wp.type}</header>
      <dl>
        <dt>Position</dt><dd>(${wp.x}, ${wp.y})</dd>
        <dt>Traits</dt><dd>${traits}</dd>
        ${wp.faction ? `<dt>Faction</dt><dd>${factionLink(wp.faction.symbol)}</dd>` : ''}
      </dl>
      ${senders.length ? `
        <footer>
          <details class="dropdown">
            <summary role="button" class="outline">Navigate Here</summary>
            <ul>${senders.map((s) => `<li><a href="#" data-action="nav-to" data-ship="${s.symbol}" data-waypoint="${wp.symbol}">${s.symbol} · ${s.distance}u</a></li>`).join('')}</ul>
          </details>
        </footer>` : ''}
    </article>`;
}
