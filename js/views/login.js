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

    <section id="leaderboard"></section>
  `;

  renderLeaderboard(main.querySelector('#leaderboard'));

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

/** Fills `el` with the server leaderboards, or hides it if the status fetch fails. */
async function renderLeaderboard(el) {
  el.setAttribute('aria-busy', 'true');
  try {
    const { leaderboards } = await endpoints.serverStatus();
    el.innerHTML = `
      <h3><i class="fa-solid fa-trophy"></i> Leaderboard</h3>
      <div class="grid">
        ${leaderboardCard('Most Credits', 'Credits', leaderboards.mostCredits, e => `₵${e.credits.toLocaleString()}`)}
        ${leaderboardCard('Most Charts', 'Charts', leaderboards.mostSubmittedCharts, e => e.chartCount.toLocaleString())}
      </div>
    `;
  } catch {
    el.hidden = true;
  } finally {
    el.removeAttribute('aria-busy');
  }
}

function leaderboardCard(title, scoreLabel, entries, score) {
  const body = entries.length ? `
    <div class="overflow-auto">
      <table class="striped">
        <thead><tr><th>#</th><th>Agent</th><th>${scoreLabel}</th></tr></thead>
        <tbody>
          ${entries.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.agentSymbol)}</td><td>${score(e)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  ` : '<p><small>No entries yet.</small></p>';
  return `<article><header>${title}</header>${body}</article>`;
}
