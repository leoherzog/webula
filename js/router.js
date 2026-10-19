// Hash router: matches '#/path?query' against registered patterns, and on every change aborts the previous route's GETs and stops its polling.
import { stopRefresh } from './refresh.js';

const routes = [];
let controller = new AbortController();

/** Signal for the current route's GETs; aborted when the route changes. */
export const navSignal = () => controller.signal;

/** Registers handler for a pattern such as '/fleet/:shipSymbol'. Params match [\w-]+, the SpaceTraders symbol charset, so they are safe to put in HTML. */
export function addRoute(pattern, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([\\w-]+)';
  });
  routes.push({ regex: new RegExp(`^${regexStr}$`), paramNames, handler });
}

export function navigate(hash) {
  window.location.hash = hash;
}

/** The hash without '#', query included, e.g. '/fleet?page=2'. */
export function currentPath() {
  return window.location.hash.slice(1);
}

/**
 * Resolves the hash now and on every hashchange. Handlers get route params, `page` (>= 1) from '?page=N',
 * and `query`, the hash's URLSearchParams, whose values are untrusted until the view checks them against a known list.
 */
export function start(fallback) {
  const resolve = () => {
    controller.abort();
    controller = new AbortController();
    stopRefresh();
    const [path, search] = currentPath().split('?');
    const query = new URLSearchParams(search);
    const page = Math.max(1, parseInt(query.get('page'), 10) || 1);
    for (const { regex, paramNames, handler } of routes) {
      const match = path.match(regex);
      if (!match) continue;
      const params = { page, query };
      paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
      handler(params);
      return;
    }
    fallback();
  };
  window.addEventListener('hashchange', resolve);
  resolve();
}
