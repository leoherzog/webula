// Top nav: icon links to the main views, an offline badge, and the agent menu with credits and logout.
import { getAgent, clearToken } from '../state.js';
import { navigate, currentPath } from '../router.js';
import { icon, FACTIONS } from '../icons.js';
import { escapeHtml, credits } from './loading.js';

const links = [
  { hash: '#/fleet', label: 'Fleet', icon: 'fa-shuttle-space-vertical' },
  { hash: '#/contracts', label: 'Contracts', icon: 'fa-file-contract' },
  { hash: '#/system', label: 'System', icon: 'fa-solar-system' },
  { hash: '#/factions', label: 'Factions', icon: 'fa-flag' },
  { hash: '#/agents', label: 'Agents', icon: 'fa-users' },
];

export function renderNav() {
  const nav = document.getElementById('app-nav');
  const agent = getAgent();
  const route = currentPath().split('?')[0];
  // Match whole segments, so #/systems does not mark System.
  const isCurrent = (hash) => route === hash.slice(1) || route.startsWith(`${hash.slice(1)}/`);

  // role="button" lets Pico's nav grow the summary when the text wraps on phones; .overflow-auto contains its floated chevron.
  nav.innerHTML = `
    <ul>
      ${links.map((l) => `<li><a href="${l.hash}" aria-label="${l.label}" data-tooltip="${l.label}" data-placement="bottom"${isCurrent(l.hash) ? ' aria-current="page"' : ''}><i class="fa-solid fa-fw ${l.icon}"></i></a></li>`).join('')}
    </ul>
    <ul>
      <li id="offline-badge" role="status" aria-label="Offline"${navigator.onLine ? ' hidden' : ''}><i class="fa-solid fa-cloud-slash pico-color-red-450"></i></li>
      <li>
        <details class="dropdown">
          <summary role="button" class="outline secondary overflow-auto">${agent ? `${icon(FACTIONS, agent.startingFaction)} ${escapeHtml(agent.symbol)} &mdash; ${credits(agent.credits)}` : ''}</summary>
          <ul dir="rtl">
            <li><a href="#" id="logout-btn">Logout</a></li>
          </ul>
        </details>
      </li>
    </ul>`;

  nav.querySelector('#logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    clearToken();
    nav.innerHTML = '';
    navigate('#/login');
  });
}
