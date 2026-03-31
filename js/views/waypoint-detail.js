import { endpoints } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, escapeHtml, systemFromWaypoint } from '../components/loading.js';
import { icon, WAYPOINT_TYPES, FACTIONS } from '../icons.js';
import { startRefresh } from '../refresh.js';

export async function render({ systemSymbol, waypointSymbol }) {
  const main = getMain();
  await withLoading(main, async () => {
    const { data: wp } = await endpoints.waypointDetail(systemSymbol, waypointSymbol);

    const hasMarket = wp.traits?.some(t => t.symbol === 'MARKETPLACE');
    const hasShipyard = wp.traits?.some(t => t.symbol === 'SHIPYARD');
    const isJumpGate = wp.type === 'JUMP_GATE';
    const isUnderConstruction = wp.isUnderConstruction;

    const [marketRes, shipyardRes, jumpGateRes, constructionRes] = await Promise.all([
      hasMarket ? endpoints.waypointMarket(systemSymbol, waypointSymbol).catch(() => null) : null,
      hasShipyard ? endpoints.waypointShipyard(systemSymbol, waypointSymbol).catch(() => null) : null,
      isJumpGate ? endpoints.waypointJumpGate(systemSymbol, waypointSymbol).catch(() => null) : null,
      isUnderConstruction ? endpoints.waypointConstruction(systemSymbol, waypointSymbol).catch(() => null) : null,
    ]);

    addDiscoveredSystem(systemSymbol);

    const traitBadges = wp.traits?.map(t =>
      `<mark class="secondary" title="${escapeHtml(t.description)}">${escapeHtml(t.name)}</mark>`
    ).join('') || '';

    const modifierBadges = wp.modifiers?.map(m =>
      `<mark title="${escapeHtml(m.description)}">${escapeHtml(m.name)}</mark>`
    ).join('') || '';

    const orbitalLinks = wp.orbitals?.map(o =>
      `<li><a href="#/system/${systemSymbol}/waypoint/${o.symbol}">${escapeHtml(o.symbol)}</a></li>`
    ).join('') || '';

    main.innerHTML = `
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
            ${wp.faction?.symbol ? `<dt>Faction</dt><dd>${icon(FACTIONS, wp.faction.symbol)} ${escapeHtml(wp.faction.symbol)}</dd>` : ''}
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
          <span class="label-group">${traitBadges}</span>
        </article>
      ` : ''}

      ${modifierBadges ? `
        <article>
          <header>Modifiers</header>
          <span class="label-group">${modifierBadges}</span>
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
          ${renderShipyardData(shipyardRes.data)}
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
          <header>Construction ${constructionRes.data.isComplete ? '<mark class="ins">Complete</mark>' : '<mark>In Progress</mark>'}</header>
          ${renderConstructionData(constructionRes.data)}
        </article>
      ` : ''}

      <section id="waypoint-actions"></section>
    `;
  });
  startRefresh(() => render({ systemSymbol, waypointSymbol }));
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
              <td>${g.purchasePrice.toLocaleString()}</td>
              <td>${g.sellPrice.toLocaleString()}</td>
              <td>${g.tradeVolume}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderShipyardData(shipyard) {
  const typeBadges = shipyard.shipTypes.map(st =>
    `<mark class="secondary">${escapeHtml(st.type)}</mark>`
  ).join('');

  let shipsTable = '<p>Ship details visible when a ship is present.</p>';
  if (shipyard.ships?.length) {
    shipsTable = `
      <div class="overflow-auto">
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Supply</th><th>Activity</th><th>Price</th></tr>
          </thead>
          <tbody>
            ${shipyard.ships.map(s => `
              <tr>
                <td>${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.type)}</td>
                <td>${s.supply}</td>
                <td>${s.activity || '-'}</td>
                <td>${s.purchasePrice.toLocaleString()}c</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <dl>
      <dt>Modifications Fee</dt><dd>${shipyard.modificationsFee.toLocaleString()}c</dd>
      <dt>Ship Types</dt><dd><span class="label-group">${typeBadges}</span></dd>
    </dl>
    ${shipsTable}
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
        <thead><tr><th>Material</th><th>Progress</th><th>Required</th></tr></thead>
        <tbody>
          ${construction.materials.map(m => `
            <tr>
              <td>${escapeHtml(m.tradeSymbol)}</td>
              <td>
                <div class="delivery-progress">
                  <progress value="${m.fulfilled}" max="${m.required}"></progress>
                  <small>${m.fulfilled}/${m.required}</small>
                </div>
              </td>
              <td>${m.required}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
