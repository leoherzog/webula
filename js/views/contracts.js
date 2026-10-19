// Contracts view: one card per contract with accept, deliver and fulfill actions, plus negotiating a new contract.
import { endpoints } from '../api.js';
import { getMain, withLoading, systemFromWaypoint, credits } from '../components/loading.js';
import { paginationNav } from '../components/pagination.js';
import { icon, FACTIONS } from '../icons.js';
import { startRefresh } from '../refresh.js';
import { performAction, openFormDialog, openDeliverDialog, confirmAction, showToast, busyFetch } from '../actions.js';

const formatDate = (iso) => new Date(iso).toLocaleString();

export async function render(params) {
  const main = getMain();
  const ok = await withLoading(main, async () => {
    const { data: contracts, meta } = await endpoints.myContracts(params.page);
    main.innerHTML = `
      <section>
        <h2>Contracts</h2>
        <p><button class="outline" data-action="negotiate"><i class="fa-solid fa-file-circle-plus"></i> Negotiate New Contract</button></p>
        ${contracts.length ? `<div class="grid grid-3">${contracts.map(renderContractCard).join('')}</div>` : '<p>No contracts found.</p>'}
      </section>
      ${paginationNav(meta, '#/contracts')}`;

    // Listen on this render's elements; listeners on #app-main pile up across renders.
    main.querySelector('section').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const contract = contracts.find((c) => c.id === btn.dataset.contractId);
      ACTIONS[btn.dataset.action](btn, contract);
    });
  });
  if (ok) startRefresh(() => render(params));
}

const ACTIONS = {
  negotiate: handleNegotiate,
  accept: handleAccept,
  deliver: handleDeliver,
  fulfill: (btn, c) => performAction(btn, () => endpoints.fulfillContract(c.id)),
};

async function handleNegotiate(btn) {
  const ships = await busyFetch(btn, () => endpoints.allShips());
  if (!ships) return;
  // Negotiating needs a ship present at a waypoint.
  const idle = ships.filter((s) => s.nav.status !== 'IN_TRANSIT');
  if (!idle.length) return showToast('No ship is at a waypoint', 'del');
  openFormDialog('Negotiate Contract', `
    <label>Ship
      <select name="shipSymbol" required>${idle.map((s) => `<option value="${s.symbol}">${s.symbol} (${s.nav.waypointSymbol})</option>`).join('')}</select>
    </label>`,
    (fd) => performAction(btn, () => endpoints.negotiateContract(fd.get('shipSymbol'))));
}

async function handleAccept(btn, c) {
  const { onAccepted, onFulfilled } = c.terms.payment;
  if (!await confirmAction(`Accept this contract?<br><br>Payment on accept: <strong>${credits(onAccepted)}</strong><br>Payment on fulfill: <strong>${credits(onFulfilled)}</strong>`)) return;
  performAction(btn, () => endpoints.acceptContract(c.id));
}

async function handleDeliver(btn, c) {
  const d = c.terms.deliver.find((x) => x.tradeSymbol === btn.dataset.tradeSymbol);
  const ships = await busyFetch(btn, () => endpoints.allShips());
  if (!ships) return;
  // The spec requires the delivering ship at the destination; in transit, waypointSymbol is already the destination.
  openDeliverDialog(btn, `Deliver ${d.tradeSymbol}`,
    ships.filter((s) => s.nav.waypointSymbol === d.destinationSymbol && s.nav.status !== 'IN_TRANSIT'),
    d.tradeSymbol, d.unitsRequired - d.unitsFulfilled,
    (shipSymbol, units) => endpoints.deliverContract(c.id, { shipSymbol, tradeSymbol: d.tradeSymbol, units }));
}

function renderActions(c) {
  if (c.fulfilled) return '';
  if (!c.accepted) return `<button type="button" data-action="accept" data-contract-id="${c.id}">Accept</button>`;
  const open = (c.terms.deliver ?? []).filter((d) => d.unitsFulfilled < d.unitsRequired);
  if (!open.length) return `<button type="button" class="outline" data-action="fulfill" data-contract-id="${c.id}">Fulfill</button>`;
  return open.map((d) => `<button type="button" class="outline secondary" data-action="deliver" data-contract-id="${c.id}" data-trade-symbol="${d.tradeSymbol}">Deliver ${d.tradeSymbol} (${d.unitsRequired - d.unitsFulfilled})</button>`).join(' ');
}

function statusText(c) {
  if (c.fulfilled) return 'Fulfilled';
  if (!c.accepted) return 'Pending';
  return 'Active';
}

function renderDeliveries(deliveries = []) {
  if (!deliveries.length) return '-';
  return deliveries.map((d) => `
    <div>
      ${d.tradeSymbol} &rarr; <a href="#/system/${systemFromWaypoint(d.destinationSymbol)}/waypoint/${d.destinationSymbol}">${d.destinationSymbol}</a>
      <progress value="${d.unitsFulfilled}" max="${d.unitsRequired}"></progress>
      <small>${d.unitsFulfilled}/${d.unitsRequired}</small>
    </div>`).join('');
}

function renderContractCard(c) {
  const { terms } = c;
  const actions = renderActions(c);
  return `
    <article>
      <header><strong>${c.type}</strong> &mdash; ${icon(FACTIONS, c.factionSymbol)} ${c.factionSymbol}</header>
      <dl>
        <dt>Status</dt><dd>${statusText(c)}</dd>
        <dt>Deadline</dt><dd>${formatDate(terms.deadline)}</dd>
        ${c.deadlineToAccept ? `<dt>Accept By</dt><dd>${formatDate(c.deadlineToAccept)}</dd>` : ''}
        <dt>Payment</dt><dd>Accept: ${credits(terms.payment.onAccepted)} &mdash; Fulfill: ${credits(terms.payment.onFulfilled)}</dd>
        <dt>Deliveries</dt><dd>${renderDeliveries(terms.deliver)}</dd>
      </dl>
      ${actions ? `<footer>${actions}</footer>` : ''}
    </article>`;
}
