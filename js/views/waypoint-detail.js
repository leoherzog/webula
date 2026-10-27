// Waypoint detail view: type, traits and orbitals, plus the market, shipyard, jump gate and construction site when the waypoint has them.
// Market goods show their supply-chain links, and the market and shipyard list their recent transactions.
import { endpoints, orNull } from '../api.js';
import { addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, escapeHtml, systemFromWaypoint, credits, factionLink, agentLink } from '../components/loading.js';
import { icon, WAYPOINT_TYPES, SHIP_FRAMES } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { performAction, confirmAction, busyFetch, openDeliverDialog } from '../actions.js';

// The supply chain is fixed within a server reset, so the first successful fetch serves every later render and poll.
let supplyChain = null;

/** The export-to-import map, or null when the fetch fails; a failure is not cached. */
async function getSupplyChain() {
  supplyChain ??= (await orNull(endpoints.supplyChain()))?.data?.exportToImportMap ?? null;
  return supplyChain;
}

export async function render(params) {
  const { systemSymbol, waypointSymbol } = params;
  const main = getMain();
  // Read before withLoading's spinner replaces the page, so expanded sections also survive the refresh after an action; another waypoint's page contributes none.
  const openKeys = new Set([...main.querySelectorAll(`[data-waypoint="${waypointSymbol}"] details[open][data-key]`)].map((d) => d.dataset.key));
  const ok = await withLoading(main, async () => {
    const { data: wp } = await endpoints.waypointDetail(systemSymbol, waypointSymbol);

    const hasMarket = wp.traits.some(t => t.symbol === 'MARKETPLACE');
    const hasShipyard = wp.traits.some(t => t.symbol === 'SHIPYARD');
    const isJumpGate = wp.type === 'JUMP_GATE';
    const isUnderConstruction = wp.isUnderConstruction;

    const [marketRes, shipyardRes, jumpGateRes, constructionRes, chain] = await Promise.all([
      hasMarket ? orNull(endpoints.waypointMarket(systemSymbol, waypointSymbol)) : null,
      hasShipyard ? orNull(endpoints.waypointShipyard(systemSymbol, waypointSymbol)) : null,
      isJumpGate ? orNull(endpoints.waypointJumpGate(systemSymbol, waypointSymbol)) : null,
      isUnderConstruction ? orNull(endpoints.waypointConstruction(systemSymbol, waypointSymbol)) : null,
      hasMarket ? getSupplyChain() : null,
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

    main.innerHTML = `
      <div data-waypoint="${waypointSymbol}">
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
            ${renderMarketData(marketRes.data, chain, openKeys)}
          </article>
        ` : ''}

        ${shipyardRes ? `
          <article>
            <header>Shipyard</header>
            ${renderShipyardData(shipyardRes.data, openKeys)}
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

/** Attributes for a <details> that the next poll reopens when it is open now; keys are unique on the page. */
const keepOpen = (openKeys, key) => ` data-key="${key}"${openKeys.has(key) ? ' open' : ''}`;

const formatTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

/**
 * A collapsible table of transactions, newest first.
 * @param {(t: object) => string[]} cells one transaction's cells after the time.
 */
function transactionTable(openKeys, key, title, headers, transactions, cells) {
  const rows = transactions.toSorted((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .map((t) => `<tr><td>${formatTime(t.timestamp)}</td>${cells(t).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `
    <details${keepOpen(openKeys, key)}>
      <summary>${title} (${transactions.length})</summary>
      <div class="overflow-auto">
        <table>
          <thead><tr><th>Time</th>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  `;
}

/**
 * A good's supply-chain note: an export's inputs, or the exports here that an import feeds.
 * @returns {string} a <small> note, or '' for exchange goods, unlinked goods, or a null chain.
 */
function chainNote(chain, market, symbol, type) {
  const goods = !chain ? []
    : type === 'EXPORT' ? chain[symbol] ?? []
    : type === 'IMPORT' ? market.exports.filter((e) => chain[e.symbol]?.includes(symbol)).map((e) => e.symbol)
    : [];
  return goods.length ? `<small>${type === 'EXPORT' ? 'made from' : 'feeds'} ${escapeHtml(goods.join(', '))}</small>` : '';
}

/** Marketplace card body: priced goods when a ship of yours is present, else the export, import and exchange lists, then recent trades. */
function renderMarketData(market, chain, openKeys) {
  const note = (symbol, type) => chainNote(chain, market, symbol, type);
  const goods = market.tradeGoods?.length ? tradeGoodsTable(market.tradeGoods, note) : marketLists(market, note);
  // Ship symbols stay plain text, because most belong to other agents and #/fleet/:shipSymbol serves only yours.
  const trades = market.transactions?.length
    ? transactionTable(openKeys, 'market-transactions', 'Recent Trades', ['Ship', 'Type', 'Good', 'Units', 'Unit Price', 'Total'], market.transactions,
      (t) => [escapeHtml(t.shipSymbol), t.type, escapeHtml(t.tradeSymbol), t.units, credits(t.pricePerUnit), credits(t.totalPrice)])
    : '';
  return goods + trades;
}

function marketLists(market, note) {
  const list = (label, goods, type) => goods?.length
    ? `<dt>${label}</dt><dd>${goods.map((g) => `<div>${g.symbol} ${note(g.symbol, type)}</div>`).join('')}</dd>`
    : '';
  const sections = list('Exports', market.exports, 'EXPORT') + list('Imports', market.imports, 'IMPORT') + list('Exchange', market.exchange, 'EXCHANGE');
  return sections ? `<dl>${sections}</dl>` : '<p>No market data (ship must be present for prices).</p>';
}

/** The priced goods; the Supply Chain column shows only when some good has a note. */
function tradeGoodsTable(goods, note) {
  const notes = goods.map((g) => note(g.symbol, g.type));
  const showChain = notes.some(Boolean);
  return `
    <div class="overflow-auto">
      <table>
        <thead>
          <tr><th>Good</th><th>Type</th><th>Supply</th><th>Activity</th><th>Buy</th><th>Sell</th><th>Volume</th>${showChain ? '<th>Supply Chain</th>' : ''}</tr>
        </thead>
        <tbody>
          ${goods.map((g, i) => `
            <tr>
              <td>${g.symbol}</td>
              <td>${g.type}</td>
              <td>${g.supply}</td>
              <td>${g.activity ?? ''}</td>
              <td>${credits(g.purchasePrice)}</td>
              <td>${credits(g.sellPrice)}</td>
              <td>${g.tradeVolume}</td>
              ${showChain ? `<td>${notes[i]}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/** Shipyard card body: the fee and ship types, one expandable spec sheet per ship when a ship of yours is present, then recent purchases. */
function renderShipyardData(shipyard, openKeys) {
  const typeBadges = shipyard.shipTypes.map(st =>
    `<mark class="pico-background-slate-600">${escapeHtml(st.type)}</mark>`
  ).join(' ');

  const ships = shipyard.ships?.length
    ? shipyard.ships.map((s) => renderShipyardShip(s, openKeys)).join('')
    : '<p>Ship details visible when a ship is present.</p>';

  // ShipyardTransaction.shipSymbol is deprecated and holds the ship type anyway.
  const purchases = shipyard.transactions?.length
    ? transactionTable(openKeys, 'shipyard-transactions', 'Recent Purchases', ['Agent', 'Ship Type', 'Price'], shipyard.transactions,
      (t) => [agentLink(t.agentSymbol), escapeHtml(t.shipType), credits(t.price)])
    : '';

  return `
    <dl>
      <dt>Modifications Fee</dt><dd>${credits(shipyard.modificationsFee)}</dd>
      <dt>Ship Types</dt><dd>${typeBadges}</dd>
    </dl>
    ${ships}
    ${purchases}
  `;
}

const partPills = (parts) => parts.map((p) =>
  `<mark class="pico-background-slate-600" title="${escapeHtml(p.description)}">${escapeHtml(p.name)}</mark>`
).join(' ') || 'None';

/** One ShipyardShip as a <details>: price and supply in the summary, specs and the Buy button inside. */
function renderShipyardShip(s, openKeys) {
  // ShipModule.capacity also counts crew quarters, so cargo sums only the cargo holds.
  const cargo = s.modules.filter((m) => m.symbol.startsWith('MODULE_CARGO_HOLD')).reduce((sum, m) => sum + (m.capacity ?? 0), 0);
  return `
    <details${keepOpen(openKeys, s.type)}>
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
