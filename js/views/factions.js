// Factions view: a card grid of every faction, or one faction with its traits' descriptions when the route names it.
import { endpoints } from '../api.js';
import { getMain, withLoading, escapeHtml, systemFromWaypoint } from '../components/loading.js';
import { paginationNav } from '../components/pagination.js';
import { icon, FACTIONS } from '../icons.js';

export async function render(params) {
  const main = getMain();
  await withLoading(main, async () => {
    if (params.factionSymbol) {
      const { data: faction } = await endpoints.faction(params.factionSymbol);
      main.innerHTML = factionDetail(faction);
      return;
    }
    const { data: factions, meta } = await endpoints.factions(params.page);
    main.innerHTML = `
      <h2>Factions</h2>
      ${factions.length ? `<div class="grid grid-3">${factions.map(factionCard).join('')}</div>` : '<p>No factions found.</p>'}
      ${paginationNav(meta, '#/factions')}`;
  });
}

function factionCard(f) {
  const traits = f.traits.map((t) => `<mark class="pico-background-slate-600">${escapeHtml(t.name)}</mark>`).join(' ') || '-';
  return `
    <article>
      <header><a href="#/factions/${f.symbol}">${icon(FACTIONS, f.symbol)} <strong>${escapeHtml(f.name)}</strong></a> ${recruiting(f)}</header>
      <p>${escapeHtml(f.description)}</p>
      <dl>
        <dt>Symbol</dt><dd>${f.symbol}</dd>
        ${f.headquarters ? `<dt>Headquarters</dt><dd>${hqLink(f.headquarters)}</dd>` : ''}
        <dt>Traits</dt><dd>${traits}</dd>
      </dl>
    </article>`;
}

function factionDetail(f) {
  return `
    <nav aria-label="breadcrumb">
      <ul>
        <li><a href="#/factions">Factions</a></li>
        <li>${icon(FACTIONS, f.symbol)} ${f.symbol}</li>
      </ul>
    </nav>
    <article>
      <header>${icon(FACTIONS, f.symbol)} <strong>${escapeHtml(f.name)}</strong> ${recruiting(f)}</header>
      <p>${escapeHtml(f.description)}</p>
      ${f.headquarters ? `<dl><dt>Headquarters</dt><dd>${hqLink(f.headquarters)}</dd></dl>` : ''}
    </article>
    <article>
      <header>Traits</header>
      ${f.traits.length
        ? `<dl>${f.traits.map((t) => `<dt>${escapeHtml(t.name)}</dt><dd>${escapeHtml(t.description)}</dd>`).join('')}</dl>`
        : '<p>None</p>'}
    </article>`;
}

const recruiting = (f) => (f.isRecruiting
  ? '<mark class="pico-background-jade-500">Recruiting</mark>'
  : '<mark class="pico-background-slate-600">Not recruiting</mark>');

/** Links a headquarters to its waypoint, or to its system when it names only a system, as the live API does despite the spec. */
function hqLink(hq) {
  const system = systemFromWaypoint(hq);
  return hq === system
    ? `<a href="#/system/${system}">${hq}</a>`
    : `<a href="#/system/${system}/waypoint/${hq}">${hq}</a>`;
}
