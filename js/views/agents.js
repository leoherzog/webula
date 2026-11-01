// Agents view: a paginated table of every agent with the logged-in and saved agents marked, or one agent's public profile when the route names it.
import { endpoints } from '../api.js';
import { getAgent, getTokenHistory } from '../state.js';
import { getMain, withLoading, escapeHtml, credits, factionLink, agentLink, agentMark, systemFromWaypoint } from '../components/loading.js';
import { paginationNav } from '../components/pagination.js';

export async function render(params) {
  const main = getMain();
  const me = getAgent()?.symbol;
  const saved = new Set(getTokenHistory().map((h) => h.symbol));
  await withLoading(main, async () => {
    if (params.agentSymbol) {
      const { data: agent } = await endpoints.agent(params.agentSymbol);
      main.innerHTML = agentDetail(agent, me, saved);
      return;
    }
    const { data: agents, meta } = await endpoints.agents(params.page);
    main.innerHTML = `
      <h2>Agents</h2>
      ${agents.length ? `
        <div class="overflow-auto">
          <table class="striped">
            <thead><tr><th>Agent</th><th>Faction</th><th>Headquarters</th><th>Ships</th><th>Credits</th></tr></thead>
            <tbody>
              ${agents.map((a) => `
                <tr>
                  <td>${agentLink(a.symbol)} ${agentMark(a.symbol, me, saved)}</td>
                  <td>${factionLink(a.startingFaction)}</td>
                  <td>${hqLink(a.headquarters)}</td>
                  <td>${a.shipCount.toLocaleString()}</td>
                  <td>${credits(a.credits)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p>No agents found.</p>'}
      ${paginationNav(meta, '#/agents')}`;
  });
}

function agentDetail(agent, me, saved) {
  return `
    <nav aria-label="breadcrumb">
      <ul>
        <li><a href="#/agents">Agents</a></li>
        <li>${escapeHtml(agent.symbol)}</li>
      </ul>
    </nav>
    <article>
      <header><strong>${escapeHtml(agent.symbol)}</strong> ${agentMark(agent.symbol, me, saved)}</header>
      <dl class="grid">
        <div><dt>Faction</dt><dd>${factionLink(agent.startingFaction)}</dd></div>
        <div><dt>Headquarters</dt><dd>${hqLink(agent.headquarters)}</dd></div>
        <div><dt>Credits</dt><dd>${credits(agent.credits)}</dd></div>
        <div><dt>Ships</dt><dd>${agent.shipCount.toLocaleString()}</dd></div>
      </dl>
      ${agent.symbol === me ? '<footer><a href="#/fleet" role="button" class="outline"><i class="fa-solid fa-shuttle-space-vertical"></i> Your Fleet</a></footer>' : ''}
    </article>`;
}

const hqLink = (wp) => `<a href="#/system/${systemFromWaypoint(wp)}/waypoint/${wp}">${wp}</a>`;
