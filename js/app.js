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

// index.html's title, which crawlers index for the homepage; login keeps it.
const HOME_TITLE = document.title;

/**
 * Wraps a public view: sets the tab title, and the nav renders for either auth state.
 * @param {string | ((params: object) => string)} [title] page name before " · Webula"; omitted keeps HOME_TITLE
 */
function page(viewFn, title) {
  return (params) => {
    const name = typeof title === 'function' ? title(params) : title;
    document.title = name ? `${name} · Webula` : HOME_TITLE;
    renderNav();
    viewFn(params);
  };
}

/** Wraps a view that needs a token; without one it goes to login. */
function guard(viewFn, title) {
  return (params) => {
    if (!getToken()) {
      navigate('#/login');
      return;
    }
    page(viewFn, title)(params);
  };
}

addRoute('/login', page(loginView));
addRoute('/leaderboard', page(leaderboardView, 'Leaderboard'));
addRoute('/fleet', guard(fleetView, 'Fleet'));
addRoute('/fleet/:shipSymbol', guard(shipDetailView, (p) => p.shipSymbol));
addRoute('/contracts', guard(contractsView, 'Contracts'));
addRoute('/system', guard(systemView, 'System'));
addRoute('/system/:systemSymbol', guard(systemView, (p) => p.systemSymbol));
addRoute('/system/:systemSymbol/waypoint/:waypointSymbol', guard(waypointDetailView, (p) => p.waypointSymbol));
addRoute('/systems', guard(systemsView, 'Systems'));
addRoute('/factions', guard(factionsView, 'Factions'));
addRoute('/factions/:factionSymbol', guard(factionsView, (p) => p.factionSymbol));
addRoute('/agents', guard(agentsView, 'Agents'));
addRoute('/agents/:agentSymbol', guard(agentsView, (p) => p.agentSymbol));

initOffline();
initServerReset();
start(() => navigate(getToken() ? '#/fleet' : '#/login'));
