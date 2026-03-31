import { endpoints } from '../api.js';
import { getAgent, setAgent, addDiscoveredSystem, getDiscoveredSystems } from '../state.js';
import { getMain, withLoading, escapeHtml, systemFromWaypoint } from '../components/loading.js';
import { renderPagination } from '../components/pagination.js';
import { icon, WAYPOINT_TYPES, FACTIONS } from '../icons.js';
import { renderSystemMap, killMap } from '../components/system-map.js';
import { performAction, refreshView } from '../actions.js';

export async function render(params, page = 1) {
  const main = getMain();
  const systemSymbol = params.systemSymbol || await deriveSystem();

  if (!systemSymbol) {
    main.innerHTML = '<p>No system to display. Visit the <a href="#/dashboard">Dashboard</a> first.</p>';
    return;
  }

  // Kill previous map instance on re-render
  killMap();

  await withLoading(main, async () => {
    // Fetch system detail (for map) + paginated waypoints (for list) + ships in parallel
    const [systemRes, waypointsRes, shipsRes] = await Promise.all([
      endpoints.systemDetail(systemSymbol),
      endpoints.systemWaypoints(systemSymbol, page),
      endpoints.myShips(1).catch(() => ({ data: [] })),
    ]);

    const systemData = systemRes.data;
    const waypoints = waypointsRes.data;
    const meta = waypointsRes.meta;
    const ships = shipsRes.data.filter(s => s.nav.systemSymbol === systemSymbol);

    addDiscoveredSystem(systemSymbol);
    for (const s of shipsRes.data) addDiscoveredSystem(s.nav.systemSymbol);

    main.innerHTML = `
      <h2>System: ${escapeHtml(systemSymbol)}</h2>
      <form id="system-jump" role="search">
        <input type="text" name="system" list="discovered-systems" placeholder="Jump to system (e.g. X1-DF55)" required>
        <button type="submit">Go</button>
      </form>
      <datalist id="discovered-systems">
        ${getDiscoveredSystems().map(s => `<option value="${s}">`).join('')}
      </datalist>
      <article>
        <header>System Map</header>
        <div id="system-map" style="width:100%;height:400px;"></div>
      </article>
    `;

    // Defer map render to next frame so the container has layout dimensions
    requestAnimationFrame(() => {
      const mapContainer = document.getElementById('system-map');
      if (mapContainer) renderSystemMap(mapContainer, systemData, ships);
    });

    // Mobile cards
    let cards = '<div class="card-list">';
    for (const wp of waypoints) {
      const traitLabels = wp.traits?.map(t => `<mark class="secondary">${t.symbol}</mark>`).join('') || '-';
      const hasMarket = wp.traits?.some(t => t.symbol === 'MARKETPLACE');
      cards += `
        <article>
          <header><a href="#/system/${systemSymbol}/waypoint/${wp.symbol}">${icon(WAYPOINT_TYPES, wp.type)} <strong>${wp.symbol}</strong></a> &mdash; ${wp.type}</header>
          <dl>
            <dt>Position</dt><dd>(${wp.x}, ${wp.y})</dd>
            <dt>Traits</dt><dd><span class="label-group">${traitLabels}</span></dd>
            ${wp.faction?.symbol ? `<dt>Faction</dt><dd>${icon(FACTIONS, wp.faction.symbol)} ${wp.faction.symbol}</dd>` : ''}
          </dl>
          ${hasMarket ? `<button class="outline market-btn" data-system="${systemSymbol}" data-waypoint="${wp.symbol}">View Market</button>` : ''}
          <div id="market-${wp.symbol}" class="market-detail"></div>
          <div id="waypoint-${wp.symbol}-actions"></div>
        </article>
      `;
    }
    cards += '</div>';

    // Desktop table
    let table = `
      <div class="overflow-auto">
        <table class="responsive-table">
          <thead>
            <tr><th>Symbol</th><th>Type</th><th>Position</th><th>Faction</th><th>Traits</th><th></th></tr>
          </thead>
          <tbody>
            ${waypoints.map(wp => {
              const traitLabels = wp.traits?.map(t => `<mark class="secondary">${t.symbol}</mark>`).join('') || '-';
              const hasMarket = wp.traits?.some(t => t.symbol === 'MARKETPLACE');
              return `
                <tr>
                  <td><a href="#/system/${systemSymbol}/waypoint/${wp.symbol}">${icon(WAYPOINT_TYPES, wp.type)} ${wp.symbol}</a></td>
                  <td>${wp.type}</td>
                  <td>(${wp.x}, ${wp.y})</td>
                  <td>${wp.faction?.symbol ? `${icon(FACTIONS, wp.faction.symbol)} ${wp.faction.symbol}` : '-'}</td>
                  <td><span class="label-group">${traitLabels}</span></td>
                  <td>
                    ${hasMarket ? `<button class="outline market-btn" data-system="${systemSymbol}" data-waypoint="${wp.symbol}">Market</button>` : ''}
                  </td>
                </tr>
                <tr id="market-row-${wp.symbol}" style="display:none"><td colspan="6"><div id="market-table-${wp.symbol}"></div></td></tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    main.innerHTML += cards + table;
    renderPagination(main, meta, (p) => render(params, p));

    populateNavigateShortcuts(waypoints, ships, systemSymbol);

    // System jump form
    main.querySelector('#system-jump').addEventListener('submit', (e) => {
      e.preventDefault();
      const sys = e.target.elements.system.value.trim().toUpperCase();
      if (sys) window.location.hash = `#/system/${sys}`;
    });

    // Market buttons
    for (const btn of main.querySelectorAll('.market-btn')) {
      btn.addEventListener('click', () => loadMarket(btn));
    }

    // Delegated click handler for navigate shortcuts (on card-list, not persistent main, to avoid accumulation on refresh)
    const cardList = main.querySelector('.card-list');
    if (cardList) {
      cardList.addEventListener('click', async (e) => {
        const link = e.target.closest('[data-action="nav-to"]');
        if (!link) return;
        e.preventDefault();
        const shipSymbol = link.dataset.ship;
        const waypointSymbol = link.dataset.waypoint;
        await performAction(link, () => endpoints.navigateShip(shipSymbol, waypointSymbol));
        refreshView();
      });
    }
  });
}

function populateNavigateShortcuts(waypoints, ships, systemSymbol) {
  const orbitShips = ships.filter(s => s.nav.status === 'IN_ORBIT');
  if (orbitShips.length === 0) return;

  for (const wp of waypoints) {
    const container = document.getElementById(`waypoint-${wp.symbol}-actions`);
    if (!container) continue;

    const eligible = orbitShips.filter(s => s.nav.waypointSymbol !== wp.symbol);
    if (eligible.length === 0) continue;

    const shipLinks = eligible.map(s =>
      `<li><a href="#" data-action="nav-to" data-ship="${s.symbol}" data-waypoint="${wp.symbol}">${s.symbol}</a></li>`
    ).join('');

    container.innerHTML = `
      <details class="dropdown">
        <summary class="outline">Navigate Here</summary>
        <ul>${shipLinks}</ul>
      </details>
    `;
  }
}

async function loadMarket(btn) {
  const sys = btn.dataset.system;
  const wp = btn.dataset.waypoint;
  btn.setAttribute('aria-busy', 'true');

  try {
    const { data: market } = await endpoints.waypointMarket(sys, wp);

    const html = renderMarketData(market);

    // Fill both mobile and desktop containers
    const mobileEl = document.getElementById(`market-${wp}`);
    if (mobileEl) mobileEl.innerHTML = html;

    const desktopEl = document.getElementById(`market-table-${wp}`);
    if (desktopEl) {
      desktopEl.innerHTML = html;
      const row = document.getElementById(`market-row-${wp}`);
      if (row) row.style.display = '';
    }
  } catch (err) {
    const errHtml = `<p><span class="pico-color-red-500">${escapeHtml(err.message)}</span></p>`;
    const mobileEl = document.getElementById(`market-${wp}`);
    if (mobileEl) mobileEl.innerHTML = errHtml;
  }

  btn.removeAttribute('aria-busy');
}

function renderMarketData(market) {
  const goods = market.tradeGoods;
  if (!goods || goods.length === 0) {
    const sections = [];
    if (market.exports?.length) sections.push(`<dt>Exports</dt><dd>${market.exports.map(g => g.symbol).join(', ')}</dd>`);
    if (market.imports?.length) sections.push(`<dt>Imports</dt><dd>${market.imports.map(g => g.symbol).join(', ')}</dd>`);
    if (market.exchange?.length) sections.push(`<dt>Exchange</dt><dd>${market.exchange.map(g => g.symbol).join(', ')}</dd>`);
    if (sections.length === 0) return '<p>No market data (ship must be present for prices).</p>';
    return `<dl>${sections.join('')}</dl>`;
  }

  return `
    <table>
      <thead>
        <tr><th>Good</th><th>Type</th><th>Supply</th><th>Buy</th><th>Sell</th><th>Volume</th></tr>
      </thead>
      <tbody>
        ${goods.map(g => `
          <tr>
            <td>${g.symbol}</td>
            <td>${g.type}</td>
            <td>${g.supply}</td>
            <td>${g.purchasePrice.toLocaleString()}</td>
            <td>${g.sellPrice.toLocaleString()}</td>
            <td>${g.tradeVolume}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function deriveSystem() {
  try {
    const { data: agent } = await endpoints.myAgent();
    setAgent(agent);
    return systemFromWaypoint(agent.headquarters);
  } catch {
    const agent = getAgent();
    if (!agent?.headquarters) return null;
    return systemFromWaypoint(agent.headquarters);
  }
}
