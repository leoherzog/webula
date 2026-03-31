export function renderPagination(container, meta, onPageChange) {
  const { total, page, limit } = meta;
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return;

  const nav = document.createElement('nav');
  nav.innerHTML = `
    <ul>
      <li><button class="outline" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">Previous</button></li>
      <li><span>Page ${page} of ${totalPages}</span></li>
      <li><button class="outline" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Next</button></li>
    </ul>
  `;

  for (const btn of nav.querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p >= 1 && p <= totalPages) onPageChange(p);
    });
  }

  container.appendChild(nav);
}
