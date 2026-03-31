const TOKEN_KEY = 'st_token';
const AGENT_KEY = 'st_agent';
const SYSTEMS_KEY = 'st_discovered_systems';
const TOKEN_HISTORY_KEY = 'st_token_history';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AGENT_KEY);
  localStorage.removeItem(SYSTEMS_KEY);
}

export function getAgent() {
  const raw = localStorage.getItem(AGENT_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setAgent(agent) {
  localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
}

export function getDiscoveredSystems() {
  const raw = localStorage.getItem(SYSTEMS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function addDiscoveredSystem(symbol) {
  const systems = getDiscoveredSystems();
  if (!systems.includes(symbol)) {
    systems.push(symbol);
    systems.sort();
    localStorage.setItem(SYSTEMS_KEY, JSON.stringify(systems));
  }
}

export function getTokenHistory() {
  const raw = localStorage.getItem(TOKEN_HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function addTokenHistory(symbol, token) {
  const history = getTokenHistory();
  const existing = history.findIndex(h => h.token === token);
  if (existing !== -1) {
    history[existing].symbol = symbol;
  } else {
    history.push({ symbol, token });
  }
  history.sort((a, b) => a.symbol.localeCompare(b.symbol));
  localStorage.setItem(TOKEN_HISTORY_KEY, JSON.stringify(history));
}

export function removeTokenHistory(token) {
  const history = getTokenHistory().filter(h => h.token !== token);
  localStorage.setItem(TOKEN_HISTORY_KEY, JSON.stringify(history));
}
