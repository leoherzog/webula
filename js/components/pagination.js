// Previous/next links for paginated views. The page lives in the hash's query as page=N, so refreshes, polls and the back button keep it.

/**
 * Returns pager HTML for an API list `meta`, or '' on page 1 of 1.
 * @param {string} base the view's hash, optionally with a query that the links keep, e.g. '#/system/X1-A?type=PLANET'
 */
export function paginationNav({ total, page, limit }, base) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages === 1 && page === 1) return '';
  const sep = base.includes('?') ? '&' : '?';
  // Without href an out-of-range link cannot be focused or followed; Pico dims [role=button][disabled].
  const link = (p, label) => (p < 1 || p > pages
    ? `<a role="button" class="outline" disabled aria-disabled="true">${label}</a>`
    : `<a role="button" class="outline" href="${base}${sep}page=${p}">${label}</a>`);
  // A stale ?page=N past the end gets Previous to the last page.
  return `<nav><ul><li>${link(Math.min(page - 1, pages), 'Previous')}</li><li>Page ${page} of ${pages}</li><li>${link(page + 1, 'Next')}</li></ul></nav>`;
}
