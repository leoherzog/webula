import { endpoints } from '../api.js';
import { getMain, withLoading } from '../components/loading.js';
import { renderPagination } from '../components/pagination.js';
import { icon, FACTIONS } from '../icons.js';

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export async function render(params, page = 1) {
  const main = getMain();
  await withLoading(main, async () => {
    const { data: contracts, meta } = await endpoints.myContracts(page);

    main.innerHTML = '<h2>Contracts</h2>';

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
      <table class="responsive-table">
        <thead>
          <tr>
            <th>Type</th><th>Faction</th><th>Status</th>
            <th>Deadline</th><th>Payment</th><th>Deliveries</th>
          </tr>
        </thead>
        <tbody>
          ${contracts.map(c => renderContractRow(c)).join('')}
        </tbody>
      </table>
    `;

    main.innerHTML += cards + table;
    renderPagination(main, meta, (p) => render(params, p));
  });
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
      <span>${d.tradeSymbol}</span>
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
          Accept: ${terms.payment.onAccepted?.toLocaleString() ?? 0}c
          &mdash; Fulfill: ${terms.payment.onFulfilled?.toLocaleString() ?? 0}c
        </dd>
        <dt>Deliveries</dt>
        <dd>${renderDeliveries(terms.deliver)}</dd>
      </dl>
      <div id="contract-${c.id}-actions"></div>
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
      <td>${terms.payment.onAccepted?.toLocaleString() ?? 0} / ${terms.payment.onFulfilled?.toLocaleString() ?? 0}</td>
      <td>${renderDeliveries(terms.deliver)}</td>
    </tr>
  `;
}
