export function getMain() {
  return document.getElementById('app-main');
}

export function showLoading(el) {
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = '<p>Loading...</p>';
}

export function showError(el, error) {
  el.removeAttribute('aria-busy');
  el.innerHTML = `
    <article>
      <header>Error</header>
      <p>${escapeHtml(error.message)}</p>
      ${error.status === 401 ? '<p><a href="#/login">Re-authenticate</a></p>' : ''}
    </article>
  `;
}

export async function withLoading(el, fn) {
  showLoading(el);
  try {
    await fn();
  } catch (err) {
    showError(el, err);
  } finally {
    el.removeAttribute('aria-busy');
  }
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function systemFromWaypoint(waypointSymbol) {
  const parts = waypointSymbol.split('-');
  return `${parts[0]}-${parts[1]}`;
}

const NAV_STATUS_VARIANT = {
  DOCKED: 'ins',
  IN_ORBIT: 'primary',
  IN_TRANSIT: '',
};

export function navStatusLabel(status) {
  const variant = NAV_STATUS_VARIANT[status] ?? 'secondary';
  const cls = variant ? ` class="${variant}"` : '';
  return `<mark${cls}>${escapeHtml(status)}</mark>`;
}
