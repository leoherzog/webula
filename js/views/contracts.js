import { endpoints } from '../api.js';
import { getMain, withLoading, systemFromWaypoint } from '../components/loading.js';
import { renderPagination } from '../components/pagination.js';
import { icon, FACTIONS } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { performAction, openFormDialog, confirmAction, refreshView, showToast } from '../actions.js';

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export async function render(params, page = 1) {
  const main = getMain();
  await withLoading(main, async () => {
    const { data: contracts, meta } = await endpoints.myContracts(page);

    main.innerHTML = `
      <header class="page-header">
        <h2>Contracts</h2>
        <button class="outline" data-action="negotiate"><span class="mobile-nav">+ New</span><span class="desktop-nav">Negotiate New Contract</span></button>
      </header>
    `;

    if (contracts.length === 0) {
      main.innerHTML += '<p>No contracts found.</p>';
      return;
    }

    // Mobile cards
    let cards = '<div class="card-list">';
    for (const c of contracts) {
      cards += renderContractCard(c);
    }
    cards += '</div>';

    // Desktop table
    let table = `
      <div class="overflow-auto">
        <table class="responsive-table">
          <thead>
            <tr>
              <th>Type</th><th>Faction</th><th>Status</th>
              <th>Deadline</th><th>Payment</th><th>Deliveries</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${contracts.map(c => renderContractRow(c)).join('')}
          </tbody>
        </table>
      </div>
    `;

    main.innerHTML += cards + table;

    // Populate action areas for each contract
    for (const c of contracts) {
      const actionEls = main.querySelectorAll(`.contract-actions[data-contract-id="${c.id}"]`);
      const html = renderActions(c);
      for (const el of actionEls) {
        el.innerHTML = html;
      }
    }

    renderPagination(main, meta, (p) => render(params, p));

    // Delegated click handler for action buttons (on cards+table, not persistent main, to avoid accumulation on refresh)
    const cardList = main.querySelector('.card-list');
    const tableEl = main.querySelector('.responsive-table');
    if (cardList) cardList.addEventListener('click', handleActionClick);
    if (tableEl) tableEl.addEventListener('click', handleActionClick);
    // Negotiate button is separate
    const negBtn = main.querySelector('[data-action="negotiate"]');
    if (negBtn) negBtn.addEventListener('click', () => handleNegotiate(negBtn));
  });
  startRefresh(() => render(params, page));
}

function handleActionClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const contractId = btn.dataset.contractId;

  if (action === 'negotiate') {
    return; // handled by direct listener
  } else if (action === 'accept') {
    handleAccept(btn, contractId);
  } else if (action === 'deliver') {
    handleDeliver(btn, contractId, btn.dataset.tradeSymbol, parseInt(btn.dataset.remaining, 10));
  } else if (action === 'fulfill') {
    handleFulfill(btn, contractId);
  }
}

async function handleNegotiate(btn) {
  try {
    const { data: ships } = await endpoints.myShips(1);
    if (!ships || ships.length === 0) {
      showToast('No ships available', 'del');
      return;
    }
    const options = ships.map(s => `<option value="${s.symbol}">${s.symbol}</option>`).join('');
    openFormDialog('Negotiate Contract', `
      <label>Ship
        <select name="shipSymbol" required>${options}</select>
      </label>
    `, async (formData) => {
      const shipSymbol = formData.get('shipSymbol');
      await performAction(btn, () => endpoints.negotiateContract(shipSymbol));
      refreshView();
    });
  } catch (err) {
    showToast(err.message, 'del');
  }
}

async function handleAccept(btn, contractId) {
  const onAccepted = btn.dataset.onAccepted || '0';
  const onFulfilled = btn.dataset.onFulfilled || '0';
  const confirmed = await confirmAction(
    `Accept this contract?<br><br>Payment on accept: <strong>₵${onAccepted}</strong><br>Payment on fulfill: <strong>₵${onFulfilled}</strong>`
  );
  if (!confirmed) return;
  try {
    await performAction(btn, () => endpoints.acceptContract(contractId));
    refreshView();
  } catch {
    // performAction already toasts on error
  }
}

async function handleDeliver(btn, contractId, tradeSymbol, remaining) {
  try {
    const { data: ships } = await endpoints.myShips(1);
    if (!ships || ships.length === 0) {
      showToast('No ships available', 'del');
      return;
    }
    const options = ships.map(s => `<option value="${s.symbol}">${s.symbol}</option>`).join('');
    openFormDialog(`Deliver ${tradeSymbol}`, `
      <label>Ship
        <select name="shipSymbol" required>${options}</select>
      </label>
      <label>Units
        <input type="number" name="units" min="1" max="${remaining}" value="${remaining}" required>
      </label>
    `, async (formData) => {
      const shipSymbol = formData.get('shipSymbol');
      const units = parseInt(formData.get('units'), 10);
      await performAction(btn, () => endpoints.deliverContract(contractId, { shipSymbol, tradeSymbol, units }));
      refreshView();
    });
  } catch (err) {
    showToast(err.message, 'del');
  }
}

async function handleFulfill(btn, contractId) {
  try {
    await performAction(btn, () => endpoints.fulfillContract(contractId));
    refreshView();
  } catch {
    // performAction already toasts on error
  }
}

function renderActions(c) {
  const terms = c.terms;

  if (c.fulfilled) {
    return '<mark class="ins">Completed</mark>';
  }

  if (!c.accepted) {
    const onAccepted = terms.payment.onAccepted?.toLocaleString() ?? '0';
    const onFulfilled = terms.payment.onFulfilled?.toLocaleString() ?? '0';
    return `<button data-action="accept" data-contract-id="${c.id}" data-on-accepted="${onAccepted}" data-on-fulfilled="${onFulfilled}">Accept</button>`;
  }

  // Accepted but not fulfilled
  const deliveries = terms.deliver || [];
  const allComplete = deliveries.every(d => d.unitsFulfilled >= d.unitsRequired);

  if (allComplete) {
    return `<button data-action="fulfill" data-contract-id="${c.id}" class="outline">Fulfill</button>`;
  }

  // Show deliver button for each incomplete delivery
  return deliveries
    .filter(d => d.unitsFulfilled < d.unitsRequired)
    .map(d => {
      const remaining = d.unitsRequired - d.unitsFulfilled;
      return `<button data-action="deliver" data-contract-id="${c.id}" data-trade-symbol="${d.tradeSymbol}" data-remaining="${remaining}" class="outline secondary">Deliver ${d.tradeSymbol} (${remaining})</button>`;
    })
    .join(' ');
}

function statusText(c) {
  if (c.fulfilled) return 'Fulfilled';
  if (!c.accepted) return 'Pending';
  return 'Active';
}

function renderDeliveries(deliveries) {
  if (!deliveries || deliveries.length === 0) return '-';
  return deliveries.map(d => `
    <div class="delivery-progress">
      <span>${d.tradeSymbol} &rarr; <a href="#/system/${systemFromWaypoint(d.destinationSymbol)}/waypoint/${d.destinationSymbol}">${d.destinationSymbol}</a></span>
      <progress value="${d.unitsFulfilled}" max="${d.unitsRequired}"></progress>
      <small>${d.unitsFulfilled}/${d.unitsRequired}</small>
    </div>
  `).join('');
}

function renderContractCard(c) {
  const terms = c.terms;
  return `
    <article>
      <header>
        <strong>${c.type}</strong> &mdash; ${icon(FACTIONS, c.factionSymbol)} ${c.factionSymbol}
        <span style="float:right">${statusText(c)}</span>
      </header>
      <dl>
        <dt>Deadline</dt><dd>${formatDate(terms.deadline)}</dd>
        <dt>Accept By</dt><dd>${formatDate(c.deadlineToAccept)}</dd>
        <dt>Payment</dt>
        <dd>
          Accept: ₵${terms.payment.onAccepted?.toLocaleString() ?? 0}
          &mdash; Fulfill: ₵${terms.payment.onFulfilled?.toLocaleString() ?? 0}
        </dd>
        <dt>Deliveries</dt>
        <dd>${renderDeliveries(terms.deliver)}</dd>
      </dl>
      <div class="contract-actions" data-contract-id="${c.id}"></div>
    </article>
  `;
}

function renderContractRow(c) {
  const terms = c.terms;
  return `
    <tr>
      <td>${c.type}</td>
      <td>${icon(FACTIONS, c.factionSymbol)} ${c.factionSymbol}</td>
      <td>${statusText(c)}</td>
      <td>${formatDate(terms.deadline)}</td>
      <td>₵${terms.payment.onAccepted?.toLocaleString() ?? 0} / ₵${terms.payment.onFulfilled?.toLocaleString() ?? 0}</td>
      <td>${renderDeliveries(terms.deliver)}</td>
      <td class="contract-actions" data-contract-id="${c.id}"></td>
    </tr>
  `;
}
