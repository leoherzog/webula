import { endpoints } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, escapeHtml, systemFromWaypoint } from '../components/loading.js';
import { icon, WAYPOINT_TYPES, FACTIONS } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { performAction, confirmAction, openFormDialog, refreshView, showToast } from '../actions.js';

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
        <article id="shipyard-section">
          <header>Shipyard</header>
          ${renderShipyardData(shipyardRes.data, waypointSymbol)}
        </article>
      ` : ''}

      ${jumpGateRes ? `
        <article>
          <header>Jump Gate Connections</header>
          ${renderJumpGateData(jumpGateRes.data)}
        </article>
      ` : ''}

      ${constructionRes ? `
        <article id="construction-section">
          <header>Construction ${constructionRes.data.isComplete ? '<mark class="ins">Complete</mark>' : '<mark>In Progress</mark>'}</header>
          ${renderConstructionData(constructionRes.data, systemSymbol, waypointSymbol)}
        </article>
      ` : ''}

      <section id="waypoint-actions"></section>
    `;

    // Attach shipyard buy handlers
    if (shipyardRes) {
      const section = document.getElementById('shipyard-section');
      if (section) {
        for (const btn of section.querySelectorAll('.buy-ship-btn')) {
          btn.addEventListener('click', async () => {
            const type = btn.dataset.type;
            const price = btn.dataset.price;
            const wp = btn.dataset.waypoint;
            const confirmed = await confirmAction(`Purchase ${type} for ₵${Number(price).toLocaleString()}?`);
            if (!confirmed) return;
            try {
              await performAction(btn, () => endpoints.purchaseShip(type, wp));
              refreshView();
            } catch { /* error handled by performAction */ }
          });
        }
      }
    }

    // Attach construction supply handlers
    if (constructionRes) {
      const section = document.getElementById('construction-section');
      if (section) {
        for (const btn of section.querySelectorAll('.supply-btn')) {
          btn.addEventListener('click', async () => {
            const trade = btn.dataset.trade;
            const sys = btn.dataset.system;
            const wp = btn.dataset.waypoint;

            // Fetch ships for the selector
            let ships = [];
            try {
              const res = await endpoints.myShips(1);
              ships = res.data || [];
            } catch { /* ignore */ }

            if (ships.length === 0) {
              showToast('No ships available', 'del');
              return;
            }

            const shipOptions = ships.map(s =>
              `<option value="${s.symbol}">${s.symbol} (${s.nav.status} @ ${s.nav.waypointSymbol})</option>`
            ).join('');

            openFormDialog(
              `Supply ${trade}`,
              `<label>Ship
                <select name="shipSymbol" required>${shipOptions}</select>
              </label>
              <label>Units
                <input type="number" name="units" min="1" value="1" required>
              </label>`,
              async (formData) => {
                const shipSymbol = formData.get('shipSymbol');
                const units = parseInt(formData.get('units'), 10);
                await performAction(btn, () => endpoints.supplyConstruction(sys, wp, { shipSymbol, tradeSymbol: trade, units }));
                refreshView();
              }
            );
          });
        }
      }
    }
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
              <td>₵${g.purchasePrice.toLocaleString()}</td>
              <td>₵${g.sellPrice.toLocaleString()}</td>
              <td>${g.tradeVolume}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderShipyardData(shipyard, waypointSymbol) {
  const typeBadges = shipyard.shipTypes.map(st =>
    `<mark class="secondary">${escapeHtml(st.type)}</mark>`
  ).join('');

  let shipsTable = '<p>Ship details visible when a ship is present.</p>';
  if (shipyard.ships?.length) {
    shipsTable = `
      <div class="overflow-auto">
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Supply</th><th>Activity</th><th>Price</th><th></th></tr>
          </thead>
          <tbody>
            ${shipyard.ships.map(s => `
              <tr>
                <td>${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.type)}</td>
                <td>${s.supply}</td>
                <td>${s.activity || '-'}</td>
                <td>₵${s.purchasePrice.toLocaleString()}</td>
                <td><button class="outline buy-ship-btn" data-type="${s.type}" data-price="${s.purchasePrice}" data-waypoint="${waypointSymbol}">Buy</button></td>
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

function renderConstructionData(construction, systemSymbol, waypointSymbol) {
  return `
    <div class="overflow-auto">
      <table>
        <thead><tr><th>Material</th><th>Progress</th><th>Required</th><th></th></tr></thead>
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
              <td><button class="outline supply-btn" data-trade="${m.tradeSymbol}" data-system="${systemSymbol}" data-waypoint="${waypointSymbol}">Supply</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
