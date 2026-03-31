import { endpoints } from '../api.js';
import { setAgent, addDiscoveredSystem } from '../state.js';
import { getMain, withLoading, systemFromWaypoint } from '../components/loading.js';
import { icon, FACTIONS } from '../icons.js';
import { startRefresh } from '../refresh.js';

export async function render() {
  const main = getMain();
  await withLoading(main, async () => {
    const { data: agent } = await endpoints.myAgent();
    setAgent(agent);

    const system = systemFromWaypoint(agent.headquarters);
    addDiscoveredSystem(system);

    main.innerHTML = `
      <h2>Dashboard</h2>
      <div class="grid">
        <article>
          <header>Agent</header>
          <dl>
            <dt>Symbol</dt><dd>${agent.symbol}</dd>
            <dt>Faction</dt><dd>${icon(FACTIONS, agent.startingFaction)} ${agent.startingFaction}</dd>
            <dt>Headquarters</dt><dd><a href="#/system/${system}/waypoint/${agent.headquarters}">${agent.headquarters}</a></dd>
          </dl>
        </article>
        <article>
          <header>Status</header>
          <dl>
            <dt>Credits</dt><dd>${agent.credits.toLocaleString()}</dd>
            <dt>Ships</dt><dd><a href="#/fleet">${agent.shipCount}</a></dd>
          </dl>
        </article>
      </div>
      <div id="dashboard-actions"></div>
    `;
  });
  startRefresh(() => render());
}
