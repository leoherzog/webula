/**
 * Footer countdown to the next server reset, read once at boot from the status endpoint.
 * Stays hidden if the status cannot be fetched.
 */
import { endpoints } from '../api.js';
import { formatRemaining } from './countdown.js';

export async function initServerReset() {
  const el = document.getElementById('server-reset');
  const status = await endpoints.serverStatus().catch(() => null);
  const next = new Date(status?.serverResets?.next);
  if (!el || isNaN(next)) return;

  const textEl = el.querySelector('span');
  el.title = `Next ${status.serverResets.frequency} reset: ${next.toLocaleString()}`;
  el.hidden = false;

  const tick = () => {
    const remain = next - Date.now();
    textEl.textContent = remain > 0 ? `Server reset in ${formatRemaining(remain)}` : 'Server reset in progress';
    if (remain <= 0) clearInterval(timer);
  };
  const timer = setInterval(tick, 1000);
  tick();
}
