// Systems view: a paginated table of every system in the universe, each linked to its system view.
import { endpoints } from '../api.js';
import { getMain, withLoading, escapeHtml, factionLink } from '../components/loading.js';
import { paginationNav } from '../components/pagination.js';
import { icon, STAR_TYPES } from '../icons.js';

export async function render(params) {
  const main = getMain();
  await withLoading(main, async () => {
    const { data: systems, meta } = await endpoints.systems(params.page);
    main.innerHTML = `
      <h2>Systems</h2>
      ${systems.length ? `
        <div class="overflow-auto">
          <table class="striped">
            <thead><tr><th>System</th><th>Star</th><th>Name</th><th>Sector</th><th>Constellation</th><th>Position</th><th>Waypoints</th><th>Factions</th></tr></thead>
            <tbody>${systems.map(systemRow).join('')}</tbody>
          </table>
        </div>` : '<p>No systems found.</p>'}
      ${paginationNav(meta, '#/systems')}`;
  });
}

function systemRow(s) {
  return `
    <tr>
      <td><a href="#/system/${s.symbol}">${s.symbol}</a></td>
      <td>${icon(STAR_TYPES, s.type)} ${s.type}</td>
      <td>${escapeHtml(s.name || '-')}</td>
      <td>${s.sectorSymbol}</td>
      <td>${escapeHtml(s.constellation || '-')}</td>
      <td>(${s.x}, ${s.y})</td>
      <td>${s.waypoints.length}</td>
      <td>${s.factions.map((f) => factionLink(f.symbol)).join(' ') || '-'}</td>
    </tr>`;
}
