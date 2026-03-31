const routes = [];

export function addRoute(pattern, handler) {
  const paramNames = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    regex: new RegExp(`^${regexStr}$`),
    paramNames,
    handler,
  });
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function currentPath() {
  return window.location.hash.slice(1) || '/dashboard';
}

export function start(fallback) {
  const resolve = () => {
    const path = currentPath();
    for (const route of routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
        route.handler(params);
        return;
      }
    }
    if (fallback) fallback();
  };

  window.addEventListener('hashchange', resolve);
  resolve();
}
