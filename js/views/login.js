// Login view: sign in with a pasted or saved agent token; below it, the public server status, stats, announcements, links and leaderboards, with saved agents marked.
import { endpoints } from '../api.js';
import { setToken, setAgent, clearToken, getTokenHistory, addTokenHistory, removeTokenHistory } from '../state.js';
import { navigate } from '../router.js';
import { getMain, escapeHtml, credits } from '../components/loading.js';
import { renderNav } from '../components/nav.js';
import { confirmAction } from '../actions.js';

export async function render() {
  const main = getMain();
  // A load aborted by this route change leaves the previous view's spinner flag set.
  main.removeAttribute('aria-busy');
  main.innerHTML = `
    <article>
      <header><h2>SpaceTraders Login</h2></header>
      <form>
        <div id="saved-agents"></div>
        <label for="token">Agent Token</label>
        <input type="password" id="token" name="token" required placeholder="Paste your agent token" aria-describedby="token-error">
        <small id="token-error" role="alert"></small>
        <button type="submit">Login</button>
      </form>
    </article>
    <section id="leaderboard"></section>`;

  renderServerInfo(main.querySelector('#leaderboard'));

  const form = main.querySelector('form');
  const input = form.elements.token;
  const errorEl = main.querySelector('#token-error');
  const savedEl = main.querySelector('#saved-agents');

  function renderSavedTokens() {
    const history = getTokenHistory();
    savedEl.innerHTML = history.length ? `
      <p><small>Saved agents</small></p>
      ${history.map((h) => `
        <p>
          <button type="button" class="outline" data-login="${escapeHtml(h.token)}">${escapeHtml(h.symbol)}</button>
          <button type="button" class="outline secondary" data-remove="${escapeHtml(h.token)}" data-symbol="${escapeHtml(h.symbol)}" aria-label="Forget ${escapeHtml(h.symbol)}" data-tooltip="Forget ${escapeHtml(h.symbol)}"><i class="fa-solid fa-trash-can pico-color-red-500"></i></button>
        </p>`).join('')}` : '';
  }
  renderSavedTokens();

  savedEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.remove) {
      if (!await confirmAction(`Forget ${escapeHtml(btn.dataset.symbol)} and its saved token?`)) return;
      removeTokenHistory(btn.dataset.remove);
      renderSavedTokens();
    } else {
      loginWithToken(btn.dataset.login, btn);
    }
  });

  async function loginWithToken(token, btn) {
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    btn.setAttribute('aria-busy', 'true');
    setToken(token);
    try {
      const { data: agent } = await endpoints.myAgent();
      setAgent(agent);
      addTokenHistory(agent.symbol, token);
      renderNav();
      navigate('#/fleet');
    } catch (err) {
      clearToken();
      // Pico colors the <small> after an aria-invalid input as an error; a saved agent's failure leaves the input valid.
      if (btn.type === 'submit') input.setAttribute('aria-invalid', 'true');
      errorEl.textContent = err.message;
    } finally {
      btn.removeAttribute('aria-busy');
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const token = input.value.trim();
    // `required` accepts whitespace-only input.
    if (token) loginWithToken(token, form.querySelector('[type="submit"]'));
  });
}

/** Fills `el` from the one unauthenticated status call, or hides it if that fails; a missing part renders nothing. */
async function renderServerInfo(el) {
  el.setAttribute('aria-busy', 'true');
  try {
    const status = await endpoints.serverStatus();
    const saved = new Set(getTokenHistory().map((h) => h.symbol));
    const boards = [
      leaderboardCard('Most Credits', 'Credits', status.leaderboards?.mostCredits, (e) => credits(e.credits), saved),
      leaderboardCard('Most Charts', 'Charts', status.leaderboards?.mostSubmittedCharts, (e) => e.chartCount.toLocaleString(), saved),
    ].join('');
    el.innerHTML = `
      <h3><i class="fa-solid fa-server"></i> Server</h3>
      ${statusLine(status)}
      ${statsCard(status.stats)}
      ${(status.announcements ?? []).map(announcement).join('')}
      ${linksList(status.links)}
      ${boards ? `<h3><i class="fa-solid fa-trophy"></i> Leaderboard</h3><div class="grid">${boards}</div>` : ''}`;
  } catch {
    el.hidden = true;
  } finally {
    el.removeAttribute('aria-busy');
  }
}

function statusLine({ status, version, resetDate }) {
  const parts = [status, version && `API ${version}`, resetDate && `Last reset ${resetDate}`].filter(Boolean);
  return parts.length ? `<p><small>${parts.map(escapeHtml).join(' · ')}</small></p>` : '';
}

const STAT_KEYS = ['accounts', 'agents', 'ships', 'systems', 'waypoints'];

function statsCard(stats) {
  const items = STAT_KEYS.filter((key) => Number.isFinite(stats?.[key])).map((key) =>
    `<div><dt>${key[0].toUpperCase()}${key.slice(1)}</dt><dd>${stats[key].toLocaleString()}</dd></div>`).join('');
  return items ? `<article><dl class="grid">${items}</dl></article>` : '';
}

function announcement({ title, body }) {
  const paragraphs = String(body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return `
    <details>
      <summary><i class="fa-solid fa-bullhorn"></i> ${escapeHtml(title)}</summary>
      ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
    </details>`;
}

/** Lists the https links once each; any other scheme is dropped, since the URL goes into an href. */
function linksList(links) {
  const names = new Map();
  for (const { name, url } of links ?? []) {
    const href = URL.parse(url);
    if (href?.protocol === 'https:' && !names.has(href.href)) names.set(href.href, name);
  }
  if (!names.size) return '';
  const items = [...names].map(([href, name]) => `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(name)}</a></li>`);
  return `<details><summary><i class="fa-solid fa-link"></i> Links</summary><ul>${items.join('')}</ul></details>`;
}

/** One leaderboard table, with the user's saved agents marked; empty when the API omits the list. */
function leaderboardCard(title, scoreLabel, entries, score, saved) {
  if (!Array.isArray(entries)) return '';
  const agent = (symbol) => saved.has(symbol)
    ? `<mark class="pico-background-azure-550" title="Saved agent">${escapeHtml(symbol)}</mark>`
    : escapeHtml(symbol);
  const body = entries.length ? `
    <div class="overflow-auto">
      <table class="striped">
        <thead><tr><th>#</th><th>Agent</th><th>${scoreLabel}</th></tr></thead>
        <tbody>
          ${entries.map((e, i) => `<tr><td>${i + 1}</td><td>${agent(e.agentSymbol)}</td><td>${escapeHtml(score(e))}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  ` : '<p><small>No entries yet.</small></p>';
  return `<article><header>${title}</header>${body}</article>`;
}
