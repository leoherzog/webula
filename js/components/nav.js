// Top nav, rendered on every route: icon links, an offline badge, and the agent menu with credits and logout, or a Login button when logged out.
import { getToken, getAgent, clearToken } from '../state.js';
import { navigate, currentPath } from '../router.js';
import { icon, FACTIONS } from '../icons.js';
import { escapeHtml, credits } from './loading.js';

// Logged out, the nav shows only the public links, since guard() sends the rest to login.
const links = [
  { hash: '#/fleet', label: 'Fleet', icon: 'fa-shuttle-space-vertical' },
  { hash: '#/contracts', label: 'Contracts', icon: 'fa-file-contract' },
  { hash: '#/system', label: 'System', icon: 'fa-solar-system' },
  { hash: '#/factions', label: 'Factions', icon: 'fa-flag' },
  { hash: '#/agents', label: 'Agents', icon: 'fa-users' },
  { hash: '#/leaderboard', label: 'Leaderboard', icon: 'fa-trophy', public: true },
];

export function renderNav() {
  const nav = document.getElementById('app-nav');
  const loggedIn = Boolean(getToken());
  const route = currentPath().split('?')[0];
  // Match whole segments, so #/systems does not mark System.
  const isCurrent = (hash) => route === hash.slice(1) || route.startsWith(`${hash.slice(1)}/`);
  const current = (hash) => (isCurrent(hash) ? ' aria-current="page"' : '');

  nav.innerHTML = `
    <ul>
      ${links.filter((l) => loggedIn || l.public).map((l) => `<li><a href="${l.hash}" aria-label="${l.label}" data-tooltip="${l.label}" data-placement="bottom"${current(l.hash)}><i class="fa-solid fa-fw ${l.icon}"></i></a></li>`).join('')}
    </ul>
    <ul>
      <li id="offline-badge" role="status" aria-label="Offline"${navigator.onLine ? ' hidden' : ''}><i class="fa-solid fa-cloud-slash pico-color-red-450"></i></li>
      <li>${loggedIn ? agentMenu(getAgent()) : `<a href="#/login" role="button" class="outline secondary"${current('#/login')}><i class="fa-solid fa-right-to-bracket"></i> Login</a>`}</li>
    </ul>`;

  nav.querySelector('#logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearToken();
    // Logging out from #/login fires no hashchange, so redraw here.
    renderNav();
    navigate('#/login');
  });
}

// role="button" lets Pico's nav grow the summary when the text wraps on phones; .overflow-auto contains its floated chevron.
function agentMenu(agent) {
  return `
    <details class="dropdown">
      <summary role="button" class="outline secondary overflow-auto">${agent ? `${icon(FACTIONS, agent.startingFaction)} ${escapeHtml(agent.symbol)} &mdash; ${credits(agent.credits)}` : ''}</summary>
      <ul dir="rtl">
        <li><a href="#" id="logout-btn">Logout</a></li>
      </ul>
    </details>`;
}
