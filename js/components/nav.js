import { getAgent, clearToken } from '../state.js';
import { navigate, currentPath } from '../router.js';
import { icon, FACTIONS } from '../icons.js';

const links = [
  { hash: '#/dashboard', label: 'Dashboard' },
  { hash: '#/fleet', label: 'Fleet' },
  { hash: '#/contracts', label: 'Contracts' },
  { hash: '#/system', label: 'System' },
];

export function renderNav() {
  const nav = document.getElementById('app-nav');
  const agent = getAgent();
  const path = currentPath();

  const navLinks = links.map(l => {
    const current = path.startsWith(l.hash.slice(1)) ? ' aria-current="page"' : '';
    return `<li><a href="${l.hash}"${current}>${l.label}</a></li>`;
  }).join('');

  nav.innerHTML = `
    <ul>
      <li><strong><a href="#/dashboard" class="contrast">SpaceTraders</a></strong></li>
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
      <li>${agent ? `${agent.startingFaction ? icon(FACTIONS, agent.startingFaction) + ' ' : ''}${agent.symbol} &mdash; ${agent.credits?.toLocaleString() ?? '?'}c` : ''}</li>
      <li><a href="#" id="logout-btn" class="secondary">Logout</a></li>
    </ul>
  `;

  nav.querySelector('#logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    clearToken();
    nav.innerHTML = '';
    navigate('#/login');
  });
}
