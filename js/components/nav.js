import { getAgent, clearToken } from '../state.js';
import { navigate, currentPath } from '../router.js';
import { icon, FACTIONS } from '../icons.js';

const links = [
  { hash: '#/dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
  { hash: '#/fleet', label: 'Fleet', icon: 'fa-shuttle-space-vertical' },
  { hash: '#/contracts', label: 'Contracts', icon: 'fa-file-contract' },
  { hash: '#/system', label: 'System', icon: 'fa-solar-system' },
];

export function renderNav() {
  const nav = document.getElementById('app-nav');
  const agent = getAgent();
  const path = currentPath();

  const navLinks = links.map(l => {
    const current = path.startsWith(l.hash.slice(1)) ? ' aria-current="page"' : '';
    return `<li><a href="${l.hash}"${current}><i class="fa-solid ${l.icon}"></i> ${l.label}</a></li>`;
  }).join('');

  nav.innerHTML = `
    <ul class="mobile-nav">
      <li>
        <details class="dropdown">
          <summary>Menu</summary>
          <ul>
            ${navLinks}
          </ul>
        </details>
      </li>
    </ul>
    <ul class="desktop-nav">
      ${navLinks}
    </ul>
    <ul>
      <li>
        <details class="dropdown agent-dropdown">
          <summary>${agent ? `${agent.startingFaction ? icon(FACTIONS, agent.startingFaction) + ' ' : ''}${agent.symbol} &mdash; ${agent.credits?.toLocaleString() ?? '?'}c` : ''}</summary>
          <ul>
            <li><a href="#" id="logout-btn">Logout</a></li>
          </ul>
        </details>
      </li>
    </ul>
  `;

  nav.querySelector('#logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    clearToken();
    nav.innerHTML = '';
    navigate('#/login');
  });
}
