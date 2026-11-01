// Leaderboard view: the server's most-credits and most-charts tables from the public status call, with the logged-in and saved agents marked. Public, so it renders in either auth state.
import { endpoints } from '../api.js';
import { getToken, getAgent, getTokenHistory } from '../state.js';
import { navSignal } from '../router.js';
import { getMain, withLoading, escapeHtml, credits, agentLink, agentMark } from '../components/loading.js';

export async function render() {
  const main = getMain();
  const me = getAgent()?.symbol;
  const saved = new Set(getTokenHistory().map((h) => h.symbol));
  await withLoading(main, async () => {
    const status = await endpoints.serverStatus(navSignal());
    const boards = status.leaderboards ?? {};
    main.innerHTML = `
      <hgroup>
        <h2><i class="fa-solid fa-trophy"></i> Leaderboard</h2>
        ${status.resetDate ? `<p>Since the reset on ${escapeHtml(status.resetDate)}</p>` : ''}
      </hgroup>
      <div class="grid">
        ${leaderboardCard('Most Credits', 'Credits', boards.mostCredits, (e) => credits(e.credits), me, saved)}
        ${leaderboardCard('Most Charts', 'Charts', boards.mostSubmittedCharts, (e) => e.chartCount.toLocaleString(), me, saved)}
      </div>`;
  });
}

/** One leaderboard table; a missing list reads as empty. */
function leaderboardCard(title, scoreLabel, entries, score, me, saved) {
  // Agent routes are guarded, so a logged-out user gets plain names.
  const name = getToken() ? agentLink : escapeHtml;
  const body = entries?.length ? `
    <div class="overflow-auto">
      <table class="striped">
        <thead><tr><th>#</th><th>Agent</th><th>${scoreLabel}</th></tr></thead>
        <tbody>
          ${entries.map((e, i) => `<tr><td>${i + 1}</td><td>${name(e.agentSymbol)} ${agentMark(e.agentSymbol, me, saved)}</td><td>${escapeHtml(score(e))}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>` : '<p><small>No entries yet.</small></p>';
  return `<article><header>${title}</header>${body}</article>`;
}
