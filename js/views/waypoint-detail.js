// Waypoint detail view: type, traits and orbitals, plus the market, shipyard, jump gate and construction site when the waypoint has them.
import { endpoints, orNull } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, escapeHtml, systemFromWaypoint, credits, factionLink } from '../components/loading.js';
import { icon, WAYPOINT_TYPES, SHIP_FRAMES } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { performAction, confirmAction, busyFetch, openDeliverDialog } from '../actions.js';

export async function render(params) {
  const { systemSymbol, waypointSymbol } = params;
  const main = getMain();
  const ok = await withLoading(main, async () => {
    const { data: wp } = await endpoints.waypointDetail(systemSymbol, waypointSymbol);

    const hasMarket = wp.traits.some(t => t.symbol === 'MARKETPLACE');
    const hasShipyard = wp.traits.some(t => t.symbol === 'SHIPYARD');
    const isJumpGate = wp.type === 'JUMP_GATE';
    const isUnderConstruction = wp.isUnderConstruction;

    const [marketRes, shipyardRes, jumpGateRes, constructionRes] = await Promise.all([
      hasMarket ? orNull(endpoints.waypointMarket(systemSymbol, waypointSymbol)) : null,
      hasShipyard ? orNull(endpoints.waypointShipyard(systemSymbol, waypointSymbol)) : null,
      isJumpGate ? orNull(endpoints.waypointJumpGate(systemSymbol, waypointSymbol)) : null,
      isUnderConstruction ? orNull(endpoints.waypointConstruction(systemSymbol, waypointSymbol)) : null,
    ]);

    addDiscoveredSystem(systemSymbol);

    const traitBadges = wp.traits.map(t =>
      `<mark class="pico-background-slate-600" title="${escapeHtml(t.description)}">${escapeHtml(t.name)}</mark>`
    ).join(' ');

    const modifierBadges = wp.modifiers?.map(m =>
      `<mark title="${escapeHtml(m.description)}">${escapeHtml(m.name)}</mark>`
    ).join(' ') || '';

    const orbitalLinks = wp.orbitals?.map(o =>
      `<li><a href="#/system/${systemSymbol}/waypoint/${o.symbol}">${escapeHtml(o.symbol)}</a></li>`
    ).join('') || '';

    // A poll replaces the page, so the shipyard ships the user expanded stay open by type.
    const openShips = new Set([...main.querySelectorAll('details[open] [data-action="buy-ship"]')].map((b) => b.dataset.type));

    main.innerHTML = `
      <div>
        <nav aria-label="breadcrumb">
          <ul>
            <li><a href="#/system/${systemSymbol}">${escapeHtml(systemSymbol)}</a></li>
            <li>${icon(WAYPOINT_TYPES, wp.type)} ${escapeHtml(wp.symbol)}</li>
          </ul>
        </nav>

        <div class="grid">
          <article>
            <header>Waypoint</header>
            <dl>
              <dt>Type</dt><dd>${icon(WAYPOINT_TYPES, wp.type)} ${escapeHtml(wp.type)}</dd>
              <dt>Position</dt><dd>(${wp.x}, ${wp.y})</dd>
              ${wp.faction?.symbol ? `<dt>Faction</dt><dd>${factionLink(wp.faction.symbol)}</dd>` : ''}
              ${wp.orbits ? `<dt>Orbits</dt><dd><a href="#/system/${systemSymbol}/waypoint/${wp.orbits}">${escapeHtml(wp.orbits)}</a></dd>` : ''}
              ${isUnderConstruction ? '<dt>Construction</dt><dd><mark>Under Construction</mark></dd>' : ''}
            </dl>
          </article>
          ${wp.chart ? `
            <article>
              <header>Chart</header>
              <dl>
                ${wp.chart.submittedBy ? `<dt>Charted By</dt><dd>${escapeHtml(wp.chart.submittedBy)}</dd>` : ''}
                ${wp.chart.submittedOn ? `<dt>Charted On</dt><dd>${new Date(wp.chart.submittedOn).toLocaleString()}</dd>` : ''}
              </dl>
            </article>
          ` : ''}
        </div>

        ${traitBadges ? `
          <article>
            <header>Traits</header>
            ${traitBadges}
          </article>
        ` : ''}

        ${modifierBadges ? `
          <article>
            <header>Modifiers</header>
            ${modifierBadges}
          </article>
        ` : ''}

        ${orbitalLinks ? `
          <article>
            <header>Orbitals</header>
            <ul>${orbitalLinks}</ul>
          </article>
        ` : ''}

        ${marketRes ? `
          <article>
            <header>Marketplace</header>
            ${renderMarketData(marketRes.data)}
          </article>
        ` : ''}

        ${shipyardRes ? `
          <article>
            <header>Shipyard</header>
            ${renderShipyardData(shipyardRes.data, openShips)}
          </article>
        ` : ''}

        ${jumpGateRes ? `
          <article>
            <header>Jump Gate Connections</header>
            ${renderJumpGateData(jumpGateRes.data)}
          </article>
        ` : ''}

        ${constructionRes ? `
          <article>
            <header>Construction ${constructionRes.data.isComplete ? '<mark class="pico-background-jade-500">Complete</mark>' : '<mark>In Progress</mark>'}</header>
            ${renderConstructionData(constructionRes.data)}
          </article>
        ` : ''}
      </div>
    `;

    // Listen on this render's elements; listeners on #app-main pile up across renders.
    main.firstElementChild.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (btn?.dataset.action === 'buy-ship') {
        const { type, price } = btn.dataset;
        if (await confirmAction(`Purchase ${type} for ${credits(price)}?`)) {
          performAction(btn, () => endpoints.purchaseShip(type, waypointSymbol));
        }
      } else if (btn?.dataset.action === 'supply') {
        const m = constructionRes.data.materials.find((x) => x.tradeSymbol === btn.dataset.trade);
        const ships = await busyFetch(btn, () => endpoints.allShips());
        // The spec requires the good in the supplying ship's cargo; openDeliverDialog keeps only ships holding it.
        if (ships) openDeliverDialog(btn, `Supply ${m.tradeSymbol}`, ships, m.tradeSymbol, m.required - m.fulfilled,
          (shipSymbol, units) => endpoints.supplyConstruction(systemSymbol, waypointSymbol, { shipSymbol, tradeSymbol: m.tradeSymbol, units }));
      }
    });
  });
  if (ok) startRefresh(() => render(params));
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
    <div class="overflow-auto">
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
              <td>${credits(g.purchasePrice)}</td>
              <td>${credits(g.sellPrice)}</td>
              <td>${g.tradeVolume}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/** Shipyard card body: the fee and ship types, then one expandable spec sheet per ship when a ship of yours is present. */
function renderShipyardData(shipyard, openShips) {
  const typeBadges = shipyard.shipTypes.map(st =>
    `<mark class="pico-background-slate-600">${escapeHtml(st.type)}</mark>`
  ).join(' ');

  const ships = shipyard.ships?.length
    ? shipyard.ships.map((s) => renderShipyardShip(s, openShips.has(s.type))).join('')
    : '<p>Ship details visible when a ship is present.</p>';

  return `
    <dl>
      <dt>Modifications Fee</dt><dd>${credits(shipyard.modificationsFee)}</dd>
      <dt>Ship Types</dt><dd>${typeBadges}</dd>
    </dl>
    ${ships}
  `;
}

const partPills = (parts) => parts.map((p) =>
  `<mark class="pico-background-slate-600" title="${escapeHtml(p.description)}">${escapeHtml(p.name)}</mark>`
).join(' ') || 'None';

/** One ShipyardShip as a <details>: price and supply in the summary, specs and the Buy button inside. */
function renderShipyardShip(s, open) {
  // ShipModule.capacity also counts crew quarters, so cargo sums only the cargo holds.
  const cargo = s.modules.filter((m) => m.symbol.startsWith('MODULE_CARGO_HOLD')).reduce((sum, m) => sum + (m.capacity ?? 0), 0);
  return `
    <details${open ? ' open' : ''}>
      <summary role="button" class="outline secondary">
        ${icon(SHIP_FRAMES, s.frame.symbol)} ${escapeHtml(s.name)} ${credits(s.purchasePrice)}
        <mark class="pico-background-slate-600">Supply ${s.supply}</mark>
        ${s.activity ? `<mark class="pico-background-slate-600">Activity ${s.activity}</mark>` : ''}
      </summary>
      <p>${escapeHtml(s.description)}</p>
      <dl>
        <dt>Frame</dt><dd>${escapeHtml(s.frame.name)}</dd>
        <dt>Module Slots</dt><dd>${s.frame.moduleSlots}</dd>
        <dt>Mounting Points</dt><dd>${s.frame.mountingPoints}</dd>
        <dt>Fuel Capacity</dt><dd>${s.frame.fuelCapacity}</dd>
        <dt>Engine</dt><dd>${escapeHtml(s.engine.name)}</dd>
        <dt>Speed</dt><dd>${s.engine.speed}</dd>
        <dt>Reactor</dt><dd>${escapeHtml(s.reactor.name)}</dd>
        <dt>Power Output</dt><dd>${s.reactor.powerOutput}</dd>
        <dt>Cargo Capacity</dt><dd>${cargo}</dd>
        <dt>Crew</dt><dd>${s.crew.required} required, ${s.crew.capacity} capacity</dd>
        <dt>Modules</dt><dd>${partPills(s.modules)}</dd>
        <dt>Mounts</dt><dd>${partPills(s.mounts)}</dd>
      </dl>
      <button type="button" class="outline" data-action="buy-ship" data-type="${s.type}" data-price="${s.purchasePrice}">Buy</button>
    </details>
  `;
}

function renderJumpGateData(jumpGate) {
  if (!jumpGate.connections.length) return '<p>No connections.</p>';
  return `
    <ul>
      ${jumpGate.connections.map(c => {
        const sys = systemFromWaypoint(c);
        return `<li><a href="#/system/${sys}/waypoint/${c}">${escapeHtml(c)}</a> (${escapeHtml(sys)})</li>`;
      }).join('')}
    </ul>
  `;
}

function renderConstructionData(construction) {
  return `
    <div class="overflow-auto">
      <table>
        <thead><tr><th>Material</th><th>Progress</th><th>Required</th><th></th></tr></thead>
        <tbody>
          ${construction.materials.map(m => `
            <tr>
              <td>${escapeHtml(m.tradeSymbol)}</td>
              <td><progress value="${m.fulfilled}" max="${m.required}"></progress> <small>${m.fulfilled}/${m.required}</small></td>
              <td>${m.required}</td>
              <td>${m.fulfilled < m.required ? `<button type="button" class="outline" data-action="supply" data-trade="${m.tradeSymbol}">Supply</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
