import { endpoints } from '../api.js';
import { setToken, setAgent, clearToken, getTokenHistory, addTokenHistory, removeTokenHistory } from '../state.js';
import { navigate } from '../router.js';
import { getMain, escapeHtml } from '../components/loading.js';
import { renderNav } from '../components/nav.js';
import { icon, FACTIONS } from '../icons.js';

async function fetchAllFactions() {
  const factions = [];
  let page = 1;
  while (true) {
    const { data, meta } = await endpoints.factions(page);
    factions.push(...data);
    if (page * meta.limit >= meta.total) break;
    page++;
  }
  return factions;
}

export async function render() {
  const main = getMain();

  main.innerHTML = `
    <article>
      <header><h2>SpaceTraders Login</h2></header>

      <div role="group">
        <button id="tab-token" class="outline">Use Token</button>
        <button id="tab-register">Register</button>
      </div>

      <form id="token-form" style="display:none">
        <div id="saved-tokens"></div>
        <label>
          Bearer Token
          <input type="password" name="token" required placeholder="Paste your agent token">
        </label>
        <button type="submit">Login</button>
      </form>

      <form id="register-form">
        <label>
          Agent Symbol (3-14 chars, uppercase)
          <input type="text" name="symbol" required minlength="3" maxlength="14"
                 pattern="[A-Z0-9_-]+" placeholder="MY_AGENT" style="text-transform:uppercase">
        </label>
        <label>
          Faction <span id="faction-icon"></span>
          <select name="faction" required aria-busy="true">
            <option value="">Loading factions...</option>
          </select>
        </label>
        <button type="submit">Register</button>
      </form>

      <div id="login-error" role="alert"></div>
    </article>
  `;

  const tokenForm = main.querySelector('#token-form');
  const registerForm = main.querySelector('#register-form');
  const tabToken = main.querySelector('#tab-token');
  const tabRegister = main.querySelector('#tab-register');
  const errorEl = main.querySelector('#login-error');
  const factionSelect = registerForm.elements.faction;

  const factionIconEl = main.querySelector('#faction-icon');

  function updateFactionIcon() {
    const val = factionSelect.value;
    factionIconEl.innerHTML = val ? icon(FACTIONS, val) : '';
  }

  factionSelect.addEventListener('change', updateFactionIcon);

  // Fetch factions in the background
  fetchAllFactions().then(factions => {
    factionSelect.removeAttribute('aria-busy');
    factionSelect.innerHTML = factions.map(f =>
      `<option value="${f.symbol}" title="${escapeHtml(f.description)}" ${f.isRecruiting ? '' : 'disabled'}>${f.name} (${f.symbol})</option>`
    ).join('');
    updateFactionIcon();
  }).catch(err => {
    factionSelect.removeAttribute('aria-busy');
    factionSelect.innerHTML = '<option value="">Failed to load factions</option>';
  });

  function showTab(tab) {
    if (tab === 'token') {
      tokenForm.style.display = '';
      registerForm.style.display = 'none';
      tabToken.classList.remove('outline');
      tabRegister.classList.add('outline');
    } else {
      tokenForm.style.display = 'none';
      registerForm.style.display = '';
      tabRegister.classList.remove('outline');
      tabToken.classList.add('outline');
    }
  }

  tabToken.addEventListener('click', () => showTab('token'));
  tabRegister.addEventListener('click', () => showTab('register'));

  const savedTokensEl = main.querySelector('#saved-tokens');

  function renderSavedTokens() {
    const history = getTokenHistory();
    if (!history.length) {
      savedTokensEl.innerHTML = '';
      return;
    }
    savedTokensEl.innerHTML = `
      <p><small>Saved agents</small></p>
      <span class="label-group">
        ${history.map(h => `
          <mark class="primary saved-token" role="button" data-token="${escapeHtml(h.token)}">${escapeHtml(h.symbol)}
            <a class="remove-token" data-token="${escapeHtml(h.token)}" aria-label="Remove ${escapeHtml(h.symbol)}">&times;</a>
          </mark>
        `).join('')}
      </span>
      <br>
    `;

    savedTokensEl.querySelectorAll('.saved-token').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-token')) return;
        loginWithToken(el.dataset.token);
      });
    });

    savedTokensEl.querySelectorAll('.remove-token').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTokenHistory(el.dataset.token);
        renderSavedTokens();
      });
    });
  }

  renderSavedTokens();

  async function loginWithToken(token) {
    setToken(token);
    try {
      const { data: agent } = await endpoints.myAgent();
      setAgent(agent);
      addTokenHistory(agent.symbol, token);
      renderNav();
      navigate('#/dashboard');
    } catch (err) {
      clearToken();
      errorEl.innerHTML = `<p><mark>${escapeHtml(err.message)}</mark></p>`;
    }
  }

  tokenForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = tokenForm.elements.token.value.trim();
    if (!token) return;
    tokenForm.querySelector('button').setAttribute('aria-busy', 'true');
    await loginWithToken(token);
    tokenForm.querySelector('button').removeAttribute('aria-busy');
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const symbol = registerForm.elements.symbol.value.trim().toUpperCase();
    const faction = registerForm.elements.faction.value;
    if (!faction) return;
    registerForm.querySelector('button[type=submit]').setAttribute('aria-busy', 'true');
    try {
      const { data } = await endpoints.register(symbol, faction);
      addTokenHistory(data.agent.symbol, data.token);
      setToken(data.token);
      setAgent(data.agent);
      renderNav();
      navigate('#/dashboard');
    } catch (err) {
      errorEl.innerHTML = `<p><mark>${escapeHtml(err.message)}</mark></p>`;
    }
    registerForm.querySelector('button[type=submit]').removeAttribute('aria-busy');
  });
}
