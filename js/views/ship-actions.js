import { endpoints, fetchAllPages } from '../api.js';
import { performAction, openFormDialog, confirmAction, disableForCooldown, refreshView, showToast } from '../actions.js';

/**
 * Populate action buttons across ship-detail cards:
 *   #nav-actions     — orbit/dock/navigate/flight mode
 *   #status-actions  — refuel/extract/survey/siphon/refine/scan/chart
 *   #ship-actions    — equipment & maintenance (shipyard only)
 * Also enhances the cargo table with sell/jettison/transfer/buy buttons.
 */
export function populateShipActions(ship, cooldown, waypoint) {
  const status = ship.nav.status;
  const symbol = ship.symbol;
  const hasMarketplace = waypoint?.traits?.some(t => t.symbol === 'MARKETPLACE') ?? false;
  const hasShipyard = waypoint?.traits?.some(t => t.symbol === 'SHIPYARD') ?? false;
  const isGasGiant = waypoint?.type === 'GAS_GIANT';
  const hasRefinery = ship.modules.some(m => m.symbol.includes('REFINERY'));
  const isUncharted = !waypoint?.chart?.submittedBy;

  // --- Navigation actions ---
  const navContainer = document.getElementById('nav-actions');
  if (navContainer) {
    let navHtml = '';
    if (status === 'DOCKED') {
      navHtml += `<button data-action="orbit">Orbit</button>`;
    } else if (status === 'IN_ORBIT') {
      navHtml += `<button data-action="dock">Dock</button>`;
      navHtml += `<button data-action="navigate" class="secondary">Navigate</button>`;
      navHtml += buildFlightModeDropdown(ship.nav.flightMode);
    }
    if (navHtml) {
      navContainer.className = 'action-group';
      navContainer.innerHTML = navHtml;
      attachNavHandlers(navContainer, ship);
    }
  }

  // --- Status / cooldown actions ---
  const statusContainer = document.getElementById('status-actions');
  if (statusContainer) {
    let statusHtml = '';
    if (status === 'DOCKED' && hasMarketplace) {
      statusHtml += `<button data-action="refuel">Refuel</button>`;
    }
    if (status === 'IN_ORBIT') {
      statusHtml += `<button data-action="extract" data-cooldown>Extract</button>`;
      statusHtml += `<button data-action="survey" data-cooldown>Survey</button>`;
      if (isGasGiant) {
        statusHtml += `<button data-action="siphon" data-cooldown>Siphon</button>`;
      }
      if (hasRefinery) {
        statusHtml += `<button data-action="refine" data-cooldown>Refine</button>`;
      }
      statusHtml += `<button data-action="scan-systems" data-cooldown class="outline">Scan Systems</button>`;
      statusHtml += `<button data-action="scan-waypoints" data-cooldown class="outline">Scan Waypoints</button>`;
      statusHtml += `<button data-action="scan-ships" data-cooldown class="outline">Scan Ships</button>`;
      if (isUncharted) {
        statusHtml += `<button data-action="chart" class="outline">Chart</button>`;
      }
    }
    if (statusHtml) {
      statusContainer.className = 'action-group';
      statusContainer.innerHTML = statusHtml;
      attachStatusHandlers(statusContainer, symbol);

      // Apply initial cooldown if active
      if (cooldown?.expiration) {
        const expirationMs = new Date(cooldown.expiration).getTime();
        if (expirationMs > Date.now()) {
          disableForCooldown(statusContainer, expirationMs);
        }
      }
    }
  }

  // --- Equipment & maintenance (DOCKED at SHIPYARD only) ---
  const shipContainer = document.getElementById('ship-actions');
  if (shipContainer && status === 'DOCKED' && hasShipyard) {
    let equipHtml = '';
    equipHtml += `<button data-action="repair" class="outline">Repair</button>`;
    equipHtml += `<button data-action="scrap" class="outline danger">Scrap Ship</button>`;
    equipHtml += `<button data-action="install-mount" class="outline secondary">Install Mount</button>`;
    equipHtml += `<button data-action="remove-mount" class="outline secondary">Remove Mount</button>`;
    equipHtml += `<button data-action="install-module" class="outline secondary">Install Module</button>`;
    equipHtml += `<button data-action="remove-module" class="outline secondary">Remove Module</button>`;
    shipContainer.innerHTML = `<div class="action-group">${equipHtml}</div>`;
    attachEquipmentHandlers(shipContainer, ship);
  }

  // --- Cargo table enhancements ---
  enhanceCargoTable(ship, waypoint);
}

// ─── Navigation handlers ──────────────────────────────────────────────

function attachNavHandlers(container, ship) {
  const symbol = ship.symbol;
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'orbit') {
      await performAction(btn, () => endpoints.orbitShip(symbol));
      refreshView();
    } else if (action === 'dock') {
      await performAction(btn, () => endpoints.dockShip(symbol));
      refreshView();
    } else if (action === 'navigate') {
      const dialog = openFormDialog('Navigate', `
        <label>Destination
          <select name="waypointSymbol" required aria-busy="true" disabled>
            <option value="">Loading waypoints…</option>
          </select>
        </label>
      `, async (fd) => {
        const wp = fd.get('waypointSymbol');
        await performAction(btn, () => endpoints.navigateShip(symbol, wp));
        refreshView();
      });
      const select = dialog.querySelector('select[name="waypointSymbol"]');
      const confirmBtn = dialog.querySelector('.confirm-btn');
      confirmBtn.disabled = true;
      const waypoints = await fetchAllPages(`/systems/${ship.nav.systemSymbol}/waypoints`);
      const options = waypoints
        .filter(w => w.symbol !== ship.nav.waypointSymbol)
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map(w => `<option value="${w.symbol}">${w.symbol} (${w.type})</option>`)
        .join('');
      select.innerHTML = options;
      select.removeAttribute('aria-busy');
      select.disabled = false;
      confirmBtn.disabled = false;
    }
  });

  // Flight mode dropdown
  container.addEventListener('click', (e) => {
    const link = e.target.closest('[data-flight-mode]');
    if (!link) return;
    e.preventDefault();
    const mode = link.dataset.flightMode;
    const details = container.querySelector('details.dropdown');
    if (details) details.removeAttribute('open');
    performAction(link, () => endpoints.setFlightMode(symbol, mode)).then(() => refreshView());
  });
}

// ─── Status / cooldown handlers ───────────────────────────────────────

function attachStatusHandlers(container, symbol) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    switch (action) {
      case 'refuel':
        openFormDialog('Refuel Ship', `
          <label>Units (leave empty for full refuel)
            <input type="number" name="units" min="1" placeholder="All">
          </label>
        `, async (fd) => {
          const raw = fd.get('units')?.trim();
          const units = raw ? parseInt(raw, 10) : undefined;
          await performAction(btn, () => endpoints.refuelShip(symbol, units));
          refreshView();
        });
        break;

      case 'extract':
        await handleCooldownAction(btn, container, () => endpoints.extractResources(symbol));
        break;

      case 'survey':
        await handleCooldownAction(btn, container, () => endpoints.surveyWaypoint(symbol));
        break;

      case 'siphon':
        await handleCooldownAction(btn, container, () => endpoints.siphonResources(symbol));
        break;

      case 'refine':
        openFormDialog('Refine Resources', `
          <label>Produce (trade symbol)
            <input type="text" name="produce" placeholder="e.g. IRON" required>
          </label>
        `, async (fd) => {
          const produce = fd.get('produce').trim();
          if (!produce) return;
          const result = await performAction(btn, () => endpoints.refineShip(symbol, produce));
          applyCooldown(result, container);
          refreshView();
        });
        break;

      case 'scan-systems':
        await handleCooldownAction(btn, container, () => endpoints.scanSystems(symbol));
        break;

      case 'scan-waypoints':
        await handleCooldownAction(btn, container, () => endpoints.scanWaypoints(symbol));
        break;

      case 'scan-ships':
        await handleCooldownAction(btn, container, () => endpoints.scanShips(symbol));
        break;

      case 'chart':
        await performAction(btn, () => endpoints.chartWaypoint(symbol));
        refreshView();
        break;
    }
  });
}

// ─── Equipment & maintenance handlers ─────────────────────────────────

function attachEquipmentHandlers(container, ship) {
  const symbol = ship.symbol;
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    switch (action) {
      case 'repair':
        await performAction(btn, () => endpoints.repairShip(symbol));
        refreshView();
        break;

      case 'scrap': {
        const ok = await confirmAction('Scrap this ship? This action is permanent and cannot be undone.');
        if (!ok) return;
        await performAction(btn, () => endpoints.scrapShip(symbol));
        window.location.hash = '#/fleet';
        break;
      }

      case 'install-mount':
        openFormDialog('Install Mount', `
          <label>Mount Symbol
            <input type="text" name="mountSymbol" placeholder="MOUNT_MINING_LASER_II" required>
          </label>
        `, async (fd) => {
          const ms = fd.get('mountSymbol').trim();
          if (!ms) return;
          await performAction(btn, () => endpoints.installMount(symbol, ms));
          refreshView();
        });
        break;

      case 'remove-mount':
        openFormDialog('Remove Mount', `
          <label>Mount
            <select name="mountSymbol" required>
              ${ship.mounts.map(m => `<option value="${m.symbol}">${m.name || m.symbol}</option>`).join('')}
            </select>
          </label>
        `, async (fd) => {
          const ms = fd.get('mountSymbol');
          if (!ms) return;
          await performAction(btn, () => endpoints.removeMount(symbol, ms));
          refreshView();
        });
        break;

      case 'install-module':
        openFormDialog('Install Module', `
          <label>Module Symbol
            <input type="text" name="moduleSymbol" placeholder="MODULE_CARGO_HOLD_II" required>
          </label>
        `, async (fd) => {
          const ms = fd.get('moduleSymbol').trim();
          if (!ms) return;
          await performAction(btn, () => endpoints.installModule(symbol, ms));
          refreshView();
        });
        break;

      case 'remove-module':
        openFormDialog('Remove Module', `
          <label>Module
            <select name="moduleSymbol" required>
              ${ship.modules.map(m => `<option value="${m.symbol}">${m.name || m.symbol}</option>`).join('')}
            </select>
          </label>
        `, async (fd) => {
          const ms = fd.get('moduleSymbol');
          if (!ms) return;
          await performAction(btn, () => endpoints.removeModule(symbol, ms));
          refreshView();
        });
        break;
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function buildFlightModeDropdown(currentMode) {
  const modes = ['DRIFT', 'STEALTH', 'CRUISE', 'BURN'];
  const items = modes.map(m =>
    `<li><a href="#" data-flight-mode="${m}"${m === currentMode ? ' aria-current="true"' : ''}>${m}</a></li>`
  ).join('');
  return `
    <details class="dropdown">
      <summary>${currentMode}</summary>
      <ul>${items}</ul>
    </details>
  `;
}

async function handleCooldownAction(btn, container, apiFn) {
  try {
    const result = await performAction(btn, apiFn);
    applyCooldown(result, container);
    refreshView();
  } catch {
    // performAction already showed toast
  }
}

function applyCooldown(result, container) {
  const cd = result?.data?.cooldown;
  if (cd?.expiration) {
    const expirationMs = new Date(cd.expiration).getTime();
    disableForCooldown(container, expirationMs);
  }
}

// ─── Cargo table enhancements ─────────────────────────────────────────

function enhanceCargoTable(ship, waypoint) {
  const symbol = ship.symbol;
  const status = ship.nav.status;
  const hasMarketplace = waypoint?.traits?.some(t => t.symbol === 'MARKETPLACE') ?? false;
  const isDocked = status === 'DOCKED';
  const showSell = isDocked && hasMarketplace;

  const cargoArticle = document.getElementById('cargo-section');
  if (!cargoArticle) return;

  const hasInventory = ship.cargo.inventory.length > 0;

  // Add "Buy Cargo" button to header if docked at marketplace
  if (showSell) {
    const header = cargoArticle.querySelector('header');
    header.innerHTML += ` <button class="outline secondary" data-cargo-action="buy" style="float:right;margin:0;padding:0.25rem 0.5rem;font-size:0.8rem;">Buy Cargo</button>`;
  }

  // Add actions column to the table if we have inventory and any actions available
  if (hasInventory) {
    const thead = cargoArticle.querySelector('thead tr');
    const tbody = cargoArticle.querySelector('tbody');
    if (!thead || !tbody) return;

    thead.innerHTML += '<th>Actions</th>';

    const rows = tbody.querySelectorAll('tr');
    ship.cargo.inventory.forEach((item, i) => {
      if (!rows[i]) return;
      let actions = '';
      if (showSell) {
        actions += `<button class="outline" data-cargo-action="sell" data-symbol="${item.symbol}" data-max="${item.units}" style="padding:0.15rem 0.4rem;font-size:0.75rem;">Sell</button> `;
      }
      actions += `<button class="outline secondary" data-cargo-action="transfer" data-symbol="${item.symbol}" data-max="${item.units}" style="padding:0.15rem 0.4rem;font-size:0.75rem;">Transfer</button> `;
      actions += `<button class="outline danger" data-cargo-action="jettison" data-symbol="${item.symbol}" data-max="${item.units}" style="padding:0.15rem 0.4rem;font-size:0.75rem;">Jettison</button>`;
      const td = document.createElement('td');
      td.innerHTML = actions;
      rows[i].appendChild(td);
    });
  }

  // Delegated click handler on cargo article
  cargoArticle.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-cargo-action]');
    if (!btn) return;

    const action = btn.dataset.cargoAction;
    const tradeSymbol = btn.dataset.symbol;
    const max = parseInt(btn.dataset.max, 10);

    switch (action) {
      case 'sell':
        openFormDialog('Sell Cargo', `
          <label>Selling: <strong>${tradeSymbol}</strong></label>
          <label>Quantity (max ${max})
            <input type="number" name="units" min="1" max="${max}" value="${max}" required>
          </label>
        `, async (fd) => {
          const units = parseInt(fd.get('units'), 10);
          if (!units || units < 1) return;
          await performAction(btn, () => endpoints.sellCargo(symbol, tradeSymbol, units));
          refreshView();
        });
        break;

      case 'jettison': {
        const ok = await confirmAction(`Jettison ${tradeSymbol}? This cargo will be permanently lost.`);
        if (!ok) return;
        await performAction(btn, () => endpoints.jettisonCargo(symbol, tradeSymbol, max));
        refreshView();
        break;
      }

      case 'transfer':
        openTransferDialog(btn, symbol, tradeSymbol, max);
        break;

      case 'buy':
        openBuyCargoDialog(btn, ship);
        break;
    }
  });
}

async function openTransferDialog(btn, shipSymbol, tradeSymbol, max) {
  btn.setAttribute('aria-busy', 'true');
  try {
    const { data: ships } = await endpoints.myShips(1);
    const currentShip = ships.find(s => s.symbol === shipSymbol);
    if (!currentShip) return;

    const sameLocation = ships.filter(s =>
      s.symbol !== shipSymbol &&
      s.nav.waypointSymbol === currentShip.nav.waypointSymbol &&
      s.nav.status !== 'IN_TRANSIT'
    );

    if (sameLocation.length === 0) {
      showToast('No other ships at this waypoint', 'del');
      return;
    }

    const options = sameLocation.map(s =>
      `<option value="${s.symbol}">${s.symbol} (${s.cargo.units}/${s.cargo.capacity})</option>`
    ).join('');

    openFormDialog('Transfer Cargo', `
      <label>Item: <strong>${tradeSymbol}</strong></label>
      <label>Target Ship
        <select name="targetShip" required>${options}</select>
      </label>
      <label>Quantity (max ${max})
        <input type="number" name="units" min="1" max="${max}" value="${max}" required>
      </label>
    `, async (fd) => {
      const targetShip = fd.get('targetShip');
      const units = parseInt(fd.get('units'), 10);
      if (!targetShip || !units) return;
      await performAction(btn, () => endpoints.transferCargo(shipSymbol, {
        tradeSymbol,
        units,
        shipSymbol: targetShip,
      }));
      refreshView();
    });
  } finally {
    btn.removeAttribute('aria-busy');
  }
}

async function openBuyCargoDialog(btn, ship) {
  btn.setAttribute('aria-busy', 'true');
  try {
    const system = ship.nav.systemSymbol;
    const wp = ship.nav.waypointSymbol;
    const { data: market } = await endpoints.waypointMarket(system, wp);

    const goods = market.tradeGoods || [];
    if (goods.length === 0) {
      showToast('No goods available at this market', 'del');
      return;
    }

    const options = goods.map(g =>
      `<option value="${g.symbol}">${g.symbol} — ₵${g.purchasePrice} (supply: ${g.supply})</option>`
    ).join('');

    const available = ship.cargo.capacity - ship.cargo.units;

    openFormDialog('Buy Cargo', `
      <label>Good
        <select name="tradeSymbol" required>${options}</select>
      </label>
      <label>Quantity (cargo space: ${available})
        <input type="number" name="units" min="1" max="${available}" value="1" required>
      </label>
    `, async (fd) => {
      const tradeSymbol = fd.get('tradeSymbol');
      const units = parseInt(fd.get('units'), 10);
      if (!tradeSymbol || !units) return;
      await performAction(btn, () => endpoints.purchaseCargo(ship.symbol, tradeSymbol, units));
      refreshView();
    });
  } finally {
    btn.removeAttribute('aria-busy');
  }
}
