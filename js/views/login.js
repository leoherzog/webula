import { endpoints } from '../api.js';
import { setToken, setAgent, clearToken, getTokenHistory, addTokenHistory, removeTokenHistory } from '../state.js';
import { navigate } from '../router.js';
import { getMain, escapeHtml } from '../components/loading.js';
import { renderNav } from '../components/nav.js';

export async function render() {
  const main = getMain();

  main.innerHTML = `
    <article>
      <header><h2>SpaceTraders Login</h2></header>

      <form id="token-form">
        <div id="saved-tokens"></div>
        <label>
          Agent Token
          <input type="password" name="token" required placeholder="Paste your agent token">
        </label>
        <button type="submit">Login</button>
      </form>

      <div id="login-error" role="alert"></div>
    </article>
  `;

  const tokenForm = main.querySelector('#token-form');
  const errorEl = main.querySelector('#login-error');
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
      navigate('#/fleet');
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
}
