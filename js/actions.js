import { setAgent } from './state.js';
import { renderNav } from './components/nav.js';
import { isOffline } from './offline.js';

/**
 * Show a toast notification at the bottom-right of the screen.
 * @param {string} message
 * @param {'primary'|'ins'|'del'} variant
 */
export function showToast(message, variant = 'primary') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  toast.textContent = message;
  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  };

  setTimeout(dismiss, 4000);
}

/**
 * Wrap an API call with loading state, error handling, and agent sync.
 * @param {HTMLButtonElement} btn
 * @param {() => Promise} apiFn
 * @returns {Promise}
 */
export async function performAction(btn, apiFn) {
  if (isOffline()) {
    showToast('You are offline', 'del');
    return;
  }
  btn.setAttribute('aria-busy', 'true');
  try {
    const result = await apiFn();
    if (result.data?.agent) {
      setAgent(result.data.agent);
      renderNav();
    }
    showToast('Action completed', 'ins');
    return result;
  } catch (err) {
    showToast(err.message, 'del');
    throw err;
  } finally {
    btn.removeAttribute('aria-busy');
  }
}

// ─── PicoCSS modal helpers ────────────────────────────────────────────
const ANIMATION_DURATION = 400; // ms — matches Pico modal animation
let visibleModal = null;

function openModal(dialog) {
  const { documentElement: html } = document;
  const scrollbarWidth = window.innerWidth - html.clientWidth;
  if (scrollbarWidth) {
    html.style.setProperty('--pico-scrollbar-width', `${scrollbarWidth}px`);
  }
  html.classList.add('modal-is-open', 'modal-is-opening');
  setTimeout(() => {
    visibleModal = dialog;
    html.classList.remove('modal-is-opening');
  }, ANIMATION_DURATION);
  dialog.showModal();
}

function closeModal(dialog) {
  visibleModal = null;
  const { documentElement: html } = document;
  html.classList.add('modal-is-closing');
  setTimeout(() => {
    html.classList.remove('modal-is-closing', 'modal-is-open');
    html.style.removeProperty('--pico-scrollbar-width');
    dialog.close();
  }, ANIMATION_DURATION);
}

// Close on click outside article
document.addEventListener('click', (e) => {
  if (!visibleModal) return;
  const article = visibleModal.querySelector('article');
  if (!article.contains(e.target)) closeModal(visibleModal);
});

/**
 * Open a modal dialog with a form using native PicoCSS dialog pattern.
 * @param {string} title
 * @param {string} fieldsHtml
 * @param {(formData: FormData) => Promise} onSubmit
 * @returns {HTMLDialogElement}
 */
export function openFormDialog(title, fieldsHtml, onSubmit) {
  const formId = `dlg-form-${Date.now()}`;
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <article>
      <header>
        <button aria-label="Close" rel="prev"></button>
        <h3>${title}</h3>
      </header>
      <form id="${formId}">
        ${fieldsHtml}
      </form>
      <footer>
        <button type="button" class="secondary">Cancel</button>
        <button type="button" class="confirm-btn">Confirm</button>
      </footer>
    </article>
  `;

  const form = dialog.querySelector('form');
  const closeBtn = dialog.querySelector('[aria-label="Close"]');
  const cancelBtn = dialog.querySelector('button.secondary');
  const confirmBtn = dialog.querySelector('.confirm-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    await onSubmit(formData);
    closeModal(dialog);
  });

  confirmBtn.addEventListener('click', () => form.requestSubmit());
  closeBtn.addEventListener('click', () => closeModal(dialog));
  cancelBtn.addEventListener('click', () => closeModal(dialog));
  dialog.addEventListener('close', () => dialog.remove());

  document.body.appendChild(dialog);
  openModal(dialog);
  return dialog;
}

/**
 * Show a confirmation dialog. Returns true if confirmed, false otherwise.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function confirmAction(message) {
  return new Promise((resolve) => {
    let submitted = false;
    const dialog = openFormDialog('Confirm', `<p>${message}</p>`, async () => {
      submitted = true;
    });
    dialog.addEventListener('close', () => {
      resolve(submitted);
    });
  });
}

/**
 * Disable cooldown-tagged buttons, re-enabling when the cooldown expires.
 * @param {HTMLElement} container
 * @param {number} expirationMs - timestamp in ms when cooldown expires
 */
export function disableForCooldown(container, expirationMs) {
  const buttons = container.querySelectorAll('button[data-cooldown]');
  if (!buttons.length) return;

  for (const btn of buttons) btn.disabled = true;

  function tick() {
    if (!document.contains(container)) return;
    if (Date.now() >= expirationMs) {
      for (const btn of buttons) btn.disabled = false;
      return;
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/**
 * Re-render the current view by dispatching a hashchange event.
 */
export function refreshView() {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
