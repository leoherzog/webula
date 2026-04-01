import { addRoute, start, navigate } from './router.js';
import { getToken } from './state.js';
import { renderNav } from './components/nav.js';
import { ready as iconsReady } from './icons.js';
import { initOffline } from './offline.js';

import { render as loginView } from './views/login.js';
import { render as dashboardView } from './views/dashboard.js';
import { render as fleetView } from './views/fleet.js';
import { render as shipDetailView } from './views/ship-detail.js';
import { render as contractsView } from './views/contracts.js';
import { render as systemView } from './views/system.js';
import { render as waypointDetailView } from './views/waypoint-detail.js';

function guard(viewFn) {
  return (params) => {
    if (!getToken()) {
      navigate('#/login');
      return;
    }
    renderNav();
    viewFn(params);
  };
}

addRoute('/login', loginView);
addRoute('/dashboard', guard(dashboardView));
addRoute('/fleet', guard(fleetView));
addRoute('/fleet/:shipSymbol', guard(shipDetailView));
addRoute('/contracts', guard(contractsView));
addRoute('/system', guard(systemView));
addRoute('/system/:systemSymbol', guard(systemView));
addRoute('/system/:systemSymbol/waypoint/:waypointSymbol', guard(waypointDetailView));

iconsReady.then(() => {
  initOffline();
  if (!getToken() && !window.location.hash.startsWith('#/login')) {
    navigate('#/login');
  }
  start(() => navigate(getToken() ? '#/dashboard' : '#/login'));
});
