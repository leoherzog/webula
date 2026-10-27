// Ship-detail actions: shipActions() decides which buttons and stored surveys a ship gets where it is, following the spec's preconditions, and bindShipActions() sends them.
import { endpoints } from '../api.js';
import { getSurveys, addSurveys, removeSurvey, addDiscoveredSystem } from '../state.js';
import { performAction, openFormDialog, confirmAction, showToast, busyFetch, openNavigateDialog, refreshView } from '../actions.js';
import { navigate } from '../router.js';
import { escapeHtml, navStatusLabel, credits } from '../components/loading.js';

const FLIGHT_MODES = ['DRIFT', 'STEALTH', 'CRUISE', 'BURN'];
// The refine endpoint's `produce` enum.
const REFINE_GOODS = ['IRON', 'COPPER', 'SILVER', 'GOLD', 'ALUMINUM', 'PLATINUM', 'URANITE', 'MERITIUM', 'FUEL'];

// Actions that POST with the ship symbol alone.
const SIMPLE = {
  orbit: endpoints.orbitShip,
  dock: endpoints.dockShip,
  extract: endpoints.extractResources,
  siphon: endpoints.siphonResources,
  chart: endpoints.chartWaypoint,
};

const TRASH = 'fa-trash-can pico-color-red-500';
// The server's survey verification, expiration and exhaustion codes; any other failure leaves the survey usable.
const SPENT_SURVEY = new Set([4220, 4221, 4224]);
const pill = (html, title = '') => `<mark class="pico-background-slate-600"${title && ` title="${escapeHtml(title)}"`}>${html}</mark>`;

/** A table in .overflow-auto; cells are HTML, so callers escape API text. */
function table(heads, rows, empty = 'None') {
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${heads.length}">${empty}</td></tr>`;
  return `<div class="overflow-auto"><table>
    <thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
  </table></div>`;
}

/**
 * Returns the action HTML for each ship-detail card; a field is '' when nothing applies.
 * @param {object|null} market the waypoint's Market when the render loaded one; null keeps every Sell button at a marketplace.
 * @returns {{flightMode: string, nav: string, status: string, surveys: string, frame: string, modules: string, mounts: string, buy: string, cargo: (item: object) => string}}
 */
export function shipActions(ship, waypoint, market) {
  const { status, flightMode } = ship.nav;
  const docked = status === 'DOCKED';
  const orbiting = status === 'IN_ORBIT';
  const hasTrait = (symbol) => waypoint?.traits.some((t) => t.symbol === symbol) ?? false;
  const hasMount = (prefix) => ship.mounts.some((m) => m.symbol.startsWith(prefix));
  const hasModule = (test) => ship.modules.some((m) => test(m.symbol));
  const inCargo = (prefix) => ship.cargo.inventory.some((i) => i.symbol.startsWith(prefix));
  const trades = (symbol) => market?.tradeGoods?.some((g) => g.symbol === symbol) ?? true;
  const coolingDown = ship.cooldown.remainingSeconds > 0;
  const atMarket = docked && hasTrait('MARKETPLACE');
  const atShipyard = docked && hasTrait('SHIPYARD');
  // The extract/survey description names no mount, so stored surveys follow extract's mining equipment rule.
  const canExtract = orbiting && (hasMount('MOUNT_MINING_LASER') || hasMount('MOUNT_GAS_SIPHON'));
  const surveys = canExtract ? getSurveys(ship.nav.waypointSymbol) : [];
  const join = (...parts) => parts.filter(Boolean).join(' ');
  const button = (action, label, cls = '', cooldown = false, attrs = '') =>
    `<button type="button"${cls && ` class="${cls}"`} data-action="${action}"${attrs}${cooldown ? ` data-cooldown${coolingDown ? ' disabled' : ''}` : ''}>${label}</button>`;
  const iconButton = (item, action, label, icon, cls) =>
    `<button type="button" class="${cls}" data-action="${action}" data-symbol="${item.symbol}" data-units="${item.units}" aria-label="${label}" data-tooltip="${label}" data-placement="right"><i class="fa-solid ${icon}"></i></button>`;
  // A deposit listed more than once is likelier to be extracted, so repeats show as a count.
  const deposits = (survey) => Object.entries(Object.groupBy(survey.deposits, (d) => d.symbol))
    .map(([symbol, list]) => pill(`${escapeHtml(symbol)}${list.length > 1 ? ` ×${list.length}` : ''}`)).join(' ');

  return {
    flightMode: orbiting
      ? `<select name="flightMode" aria-label="Flight mode">${FLIGHT_MODES.map((m) => `<option${m === flightMode ? ' selected' : ''}>${m}</option>`).join('')}</select>`
      : flightMode,
    nav: docked ? button('orbit', 'Orbit')
      : orbiting ? join(
        button('dock', 'Dock'),
        button('navigate', 'Navigate', 'secondary'),
        // An unfinished gate cannot be jumped through.
        waypoint?.type === 'JUMP_GATE' && !waypoint.isUnderConstruction && button('jump', 'Jump', 'secondary', true),
        hasModule((s) => s.startsWith('MODULE_WARP_DRIVE')) && button('warp', 'Warp', 'secondary'),
      ) : '',
    status: join(
      atMarket && button('refuel', 'Refuel'),
      // Mount and module requirements are from each endpoint's description in the spec.
      canExtract && button('extract', 'Extract', '', true),
      orbiting && hasMount('MOUNT_SURVEYOR') && button('survey', 'Survey', '', true),
      orbiting && waypoint?.type === 'GAS_GIANT' && hasMount('MOUNT_GAS_SIPHON')
        && hasModule((s) => s === 'MODULE_GAS_PROCESSOR_I') && button('siphon', 'Siphon', '', true),
      orbiting && hasModule((s) => s.includes('REFINERY')) && button('refine', 'Refine', '', true),
      orbiting && hasMount('MOUNT_SENSOR_ARRAY') && join(
        button('scan-systems', 'Scan Systems', 'outline', true),
        button('scan-waypoints', 'Scan Waypoints', 'outline', true),
        button('scan-ships', 'Scan Ships', 'outline', true),
      ),
      orbiting && hasTrait('UNCHARTED') && button('chart', 'Chart', 'outline'),
    ),
    // Extract leads each row so it stays in view when the table scrolls on a phone.
    surveys: surveys.length ? table(['', 'Size', 'Deposits', 'Expires'], surveys.map((s) => [
      button('extract-survey', 'Extract', '', true, ` data-signature="${escapeHtml(s.signature)}"`),
      escapeHtml(s.size),
      deposits(s),
      new Date(s.expiration).toLocaleTimeString([], { timeStyle: 'short' }),
    ])) : '',
    frame: atShipyard ? join(button('repair', 'Repair', 'outline'), button('scrap', `<i class="fa-solid ${TRASH}"></i> Scrap Ship`, 'outline secondary')) : '',
    // Installing needs the part in the cargo hold. The spec requires a Shipyard for mounts but not for modules, so modules gate on status alone.
    modules: docked ? join(
      inCargo('MODULE_') && button('install-module', 'Install Module', 'outline secondary'),
      ship.modules.length && button('remove-module', 'Remove Module', 'outline secondary'),
    ) : '',
    mounts: atShipyard ? join(
      inCargo('MOUNT_') && button('install-mount', 'Install Mount', 'outline secondary'),
      ship.mounts.length && button('remove-mount', 'Remove Mount', 'outline secondary'),
    ) : '',
    buy: atMarket ? button('buy', '<i class="fa-solid fa-cart-shopping"></i> Buy Cargo', 'outline secondary') : '',
    cargo: (item) => `<div role="group">${join(
      atMarket && trades(item.symbol) && iconButton(item, 'sell', `Sell ${item.symbol}`, 'fa-coins', 'outline'),
      (docked || orbiting) && iconButton(item, 'transfer', `Transfer ${item.symbol}`, 'fa-right-left', 'outline secondary'),
      iconButton(item, 'jettison', `Jettison ${item.symbol}`, TRASH, 'outline secondary'),
    )}</div>`,
  };
}

/**
 * Handles every action inside root, which must be created by the current render: #app-main outlives renders and would gain a listener per poll.
 * @param {object|null} market the Market passed to shipActions(); Sell and Buy reuse it and fetch only when it is null.
 */
export function bindShipActions(root, ship, market) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action } = btn.dataset;
    if (SIMPLE[action]) performAction(btn, () => SIMPLE[action](ship.symbol));
    else DIALOGS[action](btn, ship, market);
  });
  root.addEventListener('change', (e) => {
    const select = e.target;
    if (select.name !== 'flightMode') return;
    performAction(select, () => endpoints.setFlightMode(ship.symbol, select.value))
      .then((result) => { if (!result) select.value = ship.nav.flightMode; });
  });
  const { cooldown } = ship;
  if (cooldown.remainingSeconds > 0) {
    setTimeout(() => {
      for (const btn of root.querySelectorAll('[data-cooldown]')) btn.disabled = false;
    }, Date.parse(cooldown.expiration) - Date.now());
  }
}

/** Sends a scan, refreshes the view for the new cooldown, then shows body(data) in a read-only dialog. */
function scan(btn, send, title, body) {
  performAction(btn, send, (r) => {
    refreshView();
    openFormDialog(title, body(r.data));
  });
}

// data-close makes a result link close the dialog as it navigates.
const SCANS = {
  'scan-systems': (btn, ship) => scan(btn, () => endpoints.scanSystems(ship.symbol), 'Scanned Systems', ({ systems }) => {
    for (const s of systems) addDiscoveredSystem(s.symbol);
    return table(['System', 'Type', 'Distance'], systems.toSorted((a, b) => a.distance - b.distance)
      .map((s) => [`<a href="#/system/${s.symbol}" data-close>${s.symbol}</a>`, s.type, s.distance]), 'No systems in range');
  }),
  'scan-waypoints': (btn, ship) => scan(btn, () => endpoints.scanWaypoints(ship.symbol), 'Scanned Waypoints', ({ waypoints }) =>
    table(['Waypoint', 'Type', 'Traits'], waypoints.map((w) => [
      `<a href="#/system/${w.systemSymbol}/waypoint/${w.symbol}" data-close>${w.symbol}</a>`,
      w.type,
      w.traits.map((t) => pill(escapeHtml(t.name), t.description)).join(' ') || '-',
    ]), 'No waypoints in range')),
  'scan-ships': (btn, ship) => scan(btn, () => endpoints.scanShips(ship.symbol), 'Scanned Ships', ({ ships }) =>
    table(['Ship', 'Role', 'Status', 'Location'], ships.map((s) => [
      escapeHtml(s.symbol), s.registration.role, navStatusLabel(s.nav.status), s.nav.waypointSymbol,
    ]), 'No ships in range')),
};

const DIALOGS = {
  ...SCANS,
  navigate: openNavigateDialog,
  jump: async (btn, ship) => {
    const gate = await busyFetch(btn, () => endpoints.waypointJumpGate(ship.nav.systemSymbol, ship.nav.waypointSymbol));
    if (!gate) return;
    const { connections } = gate.data;
    if (!connections.length) return showToast('This jump gate has no connections', 'del');
    openFormDialog('Jump', `
      <label>Destination gate
        <select name="waypointSymbol" required>${connections.map((c) => `<option>${escapeHtml(c)}</option>`).join('')}</select>
      </label>`,
      (fd) => performAction(btn, () => endpoints.jumpShip(ship.symbol, fd.get('waypointSymbol'))));
  },
  warp: (btn, ship) => openFormDialog('Warp', `
    <label>Destination waypoint
      <input name="waypointSymbol" required pattern="[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+" placeholder="X1-AB12-C34" autocapitalize="characters" spellcheck="false">
      <small>Fuel ${ship.fuel.current}/${ship.fuel.capacity}</small>
    </label>`,
    (fd) => performAction(btn, () => endpoints.warpShip(ship.symbol, fd.get('waypointSymbol').toUpperCase()))),
  survey: (btn, ship) => performAction(btn, () => endpoints.surveyWaypoint(ship.symbol), (r) => {
    addSurveys(r.data.surveys);
    refreshView();
  }),
  'extract-survey': (btn, ship) => {
    const survey = getSurveys(ship.nav.waypointSymbol).find((s) => s.signature === btn.dataset.signature);
    if (!survey) {
      showToast('That survey has expired', 'del');
      return refreshView();
    }
    performAction(btn, async () => {
      try {
        return await endpoints.extractWithSurvey(ship.symbol, survey);
      } catch (err) {
        if (SPENT_SURVEY.has(err.code)) {
          removeSurvey(survey.signature);
          refreshView();
        }
        throw err;
      }
    });
  },
  refuel: (btn, ship) => openFormDialog('Refuel', `
    <label>Units (empty fills the tank)
      <input type="number" name="units" min="1" placeholder="All">
    </label>`,
    (fd) => performAction(btn, () => endpoints.refuelShip(ship.symbol, Number(fd.get('units')) || undefined))),
  refine: (btn, ship) => openFormDialog('Refine', `
    <label>Produce
      <select name="produce" required>${REFINE_GOODS.map((g) => `<option>${g}</option>`).join('')}</select>
    </label>`,
    (fd) => performAction(btn, () => endpoints.refineShip(ship.symbol, fd.get('produce')))),
  repair: async (btn, ship) => {
    const quote = await busyFetch(btn, () => endpoints.repairQuote(ship.symbol));
    if (!quote || !await confirmAction(`Repair ${ship.symbol} for <strong>${credits(quote.data.transaction.totalPrice)}</strong>?`)) return;
    performAction(btn, () => endpoints.repairShip(ship.symbol));
  },
  scrap: async (btn, ship) => {
    const quote = await busyFetch(btn, () => endpoints.scrapQuote(ship.symbol));
    if (!quote || !await confirmAction(`Scrap ${ship.symbol} for <strong>${credits(quote.data.transaction.totalPrice)}</strong>? This cannot be undone.`)) return;
    performAction(btn, () => endpoints.scrapShip(ship.symbol), () => navigate('#/fleet'));
  },
  'install-mount': (btn, ship) => pickDialog(btn, 'Install Mount',
    ship.cargo.inventory.filter((i) => i.symbol.startsWith('MOUNT_')), (s) => endpoints.installMount(ship.symbol, s)),
  'remove-mount': (btn, ship) => pickDialog(btn, 'Remove Mount', ship.mounts, (s) => endpoints.removeMount(ship.symbol, s)),
  'install-module': (btn, ship) => pickDialog(btn, 'Install Module',
    ship.cargo.inventory.filter((i) => i.symbol.startsWith('MODULE_')), (s) => endpoints.installModule(ship.symbol, s)),
  'remove-module': (btn, ship) => pickDialog(btn, 'Remove Module', ship.modules, (s) => endpoints.removeModule(ship.symbol, s)),
  sell: openSellDialog,
  transfer: openTransferDialog,
  jettison: async (btn, ship) => {
    const { symbol, units } = btn.dataset;
    if (!await confirmAction(`Jettison ${units} ${symbol}? The cargo is lost.`)) return;
    performAction(btn, () => endpoints.jettisonCargo(ship.symbol, symbol, Number(units)));
  },
  buy: openBuyDialog,
};

/** Picks one item by symbol and sends it with send(symbol). */
function pickDialog(btn, title, items, send) {
  const options = items.map((i) => `<option value="${i.symbol}">${escapeHtml(i.name)}</option>`).join('');
  openFormDialog(title, `<label>Item <select name="symbol" required>${options}</select></label>`,
    (fd) => performAction(btn, () => send(fd.get('symbol'))));
}

/** The market's trade goods from the render's copy, else a fresh GET. @returns {Promise<object[]|null>} null when the GET fails. */
async function tradeGoods(btn, ship, market) {
  if (market?.tradeGoods) return market.tradeGoods;
  const res = await busyFetch(btn, () => endpoints.waypointMarket(ship.nav.systemSymbol, ship.nav.waypointSymbol));
  return res && (res.data.tradeGoods ?? []);
}

async function openSellDialog(btn, ship, market) {
  const { symbol, units } = btn.dataset;
  const goods = await tradeGoods(btn, ship, market);
  if (!goods) return;
  const good = goods.find((g) => g.symbol === symbol);
  if (!good) return showToast(`This market does not buy ${symbol}`, 'del');
  // The spec caps each sale at the good's tradeVolume.
  const max = Math.min(Number(units), good.tradeVolume);
  const dialog = openFormDialog(`Sell ${symbol}`, `
    <label>Units at ${credits(good.sellPrice)} each (max ${max} per sale)
      <input type="number" name="units" min="1" max="${max}" value="${max}" required>
      <small>Total <output name="total">${credits(max * good.sellPrice)}</output></small>
    </label>`,
    (fd) => performAction(btn, () => endpoints.sellCargo(ship.symbol, symbol, Number(fd.get('units')))));
  const form = dialog.querySelector('form');
  form.addEventListener('input', () => {
    form.elements.total.value = credits((Number(form.elements.units.value) || 0) * good.sellPrice);
  });
}

async function openTransferDialog(btn, ship) {
  const { symbol, units } = btn.dataset;
  const ships = await busyFetch(btn, () => endpoints.allShips());
  if (!ships) return;
  // The spec requires both ships at one waypoint and in the same state (both docked or both in orbit).
  const targets = ships.filter((s) => s.symbol !== ship.symbol
    && s.nav.waypointSymbol === ship.nav.waypointSymbol && s.nav.status === ship.nav.status);
  if (!targets.length) return showToast(`No other ${ship.nav.status} ship at ${ship.nav.waypointSymbol}`, 'del');
  openFormDialog(`Transfer ${symbol}`, `
    <label>Target ship
      <select name="shipSymbol" required>${targets.map((s) => `<option value="${s.symbol}">${s.symbol} (${s.cargo.units}/${s.cargo.capacity})</option>`).join('')}</select>
    </label>
    <label>Units
      <input type="number" name="units" min="1" max="${units}" value="${units}" required>
    </label>`,
    (fd) => performAction(btn, () => endpoints.transferCargo(ship.symbol, {
      tradeSymbol: symbol,
      units: Number(fd.get('units')),
      shipSymbol: fd.get('shipSymbol'),
    })));
}

async function openBuyDialog(btn, ship, market) {
  const space = ship.cargo.capacity - ship.cargo.units;
  if (space < 1) return showToast('The cargo hold is full', 'del');
  const goods = await tradeGoods(btn, ship, market);
  if (!goods) return;
  if (!goods.length) return showToast('No goods for sale here', 'del');
  // The spec caps each purchase at the good's tradeVolume.
  const max = (g) => Math.min(space, g.tradeVolume);
  const dialog = openFormDialog('Buy Cargo', `
    <label>Good
      <select name="tradeSymbol" required>${goods.map((g) => `<option value="${g.symbol}" data-max="${max(g)}">${g.symbol}: ${credits(g.purchasePrice)} (supply ${g.supply}, max ${g.tradeVolume} per purchase)</option>`).join('')}</select>
    </label>
    <label>Units (cargo space ${space})
      <input type="number" name="units" min="1" max="${max(goods[0])}" value="1" required>
    </label>`,
    (fd) => performAction(btn, () => endpoints.purchaseCargo(ship.symbol, fd.get('tradeSymbol'), Number(fd.get('units')))));
  const select = dialog.querySelector('select');
  select.addEventListener('change', () => {
    dialog.querySelector('[name="units"]').max = select.selectedOptions[0].dataset.max;
  });
}
