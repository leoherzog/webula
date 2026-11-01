// Entry point: registers the routes, guards every route but login and leaderboard behind a token, and starts the router.
import { addRoute, start, navigate } from './router.js';
import { getToken } from './state.js';
import { renderNav } from './components/nav.js';
import { initOffline } from './offline.js';
import { initServerReset } from './components/server-reset.js';

import { render as loginView } from './views/login.js';
import { render as fleetView } from './views/fleet.js';
import { render as shipDetailView } from './views/ship-detail.js';
import { render as contractsView } from './views/contracts.js';
import { render as systemView } from './views/system.js';
import { render as waypointDetailView } from './views/waypoint-detail.js';
import { render as systemsView } from './views/systems.js';
import { render as factionsView } from './views/factions.js';
import { render as agentsView } from './views/agents.js';
import { render as leaderboardView } from './views/leaderboard.js';

/** Wraps a public view: the nav renders for either auth state. */
function page(viewFn) {
  return (params) => {
    renderNav();
    viewFn(params);
  };
}

/** Wraps a view that needs a token; without one it goes to login. */
function guard(viewFn) {
  return (params) => {
    if (!getToken()) {
      navigate('#/login');
      return;
    }
    page(viewFn)(params);
  };
}

addRoute('/login', page(loginView));
addRoute('/leaderboard', page(leaderboardView));
addRoute('/fleet', guard(fleetView));
addRoute('/fleet/:shipSymbol', guard(shipDetailView));
addRoute('/contracts', guard(contractsView));
addRoute('/system', guard(systemView));
addRoute('/system/:systemSymbol', guard(systemView));
addRoute('/system/:systemSymbol/waypoint/:waypointSymbol', guard(waypointDetailView));
addRoute('/systems', guard(systemsView));
addRoute('/factions', guard(factionsView));
addRoute('/factions/:factionSymbol', guard(factionsView));
addRoute('/agents', guard(agentsView));
addRoute('/agents/:agentSymbol', guard(agentsView));

initOffline();
initServerReset();
start(() => navigate(getToken() ? '#/fleet' : '#/login'));
