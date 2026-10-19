// localStorage state: the agent token and cached agent, saved tokens for quick login, systems seen so far, and the agent's unexpired surveys.
const TOKEN_KEY = 'st_token';
const AGENT_KEY = 'st_agent';
const SYSTEMS_KEY = 'st_discovered_systems';
const TOKEN_HISTORY_KEY = 'st_token_history';
const SURVEYS_KEY = 'st_surveys';
const API_CACHE = 'webula-api'; // sw.js caches API responses here, keyed by URL alone

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  // Cached API responses and surveys belong to the previous agent; Cache Storage exists only in secure contexts.
  if (token !== getToken()) {
    globalThis.caches?.delete(API_CACHE);
    localStorage.removeItem(SURVEYS_KEY);
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  globalThis.caches?.delete(API_CACHE);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AGENT_KEY);
  localStorage.removeItem(SYSTEMS_KEY);
  localStorage.removeItem(SURVEYS_KEY);
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

const unexpired = (survey) => Date.parse(survey.expiration) > Date.now();

/** Every stored survey that has not expired; drops expired ones from storage. */
function loadSurveys() {
  const raw = localStorage.getItem(SURVEYS_KEY);
  const all = raw ? JSON.parse(raw) : [];
  const live = all.filter(unexpired);
  if (live.length < all.length) saveSurveys(live);
  return live;
}

function saveSurveys(surveys) {
  localStorage.setItem(SURVEYS_KEY, JSON.stringify(surveys.filter(unexpired)));
}

/** @returns {object[]} the unexpired surveys for waypointSymbol, as the API returned them. */
export function getSurveys(waypointSymbol) {
  return loadSurveys().filter((s) => s.symbol === waypointSymbol);
}

/** Stores Survey objects unmodified, since the extract endpoint rejects a changed one. */
export function addSurveys(surveys) {
  const added = new Set(surveys.map((s) => s.signature));
  saveSurveys([...loadSurveys().filter((s) => !added.has(s.signature)), ...surveys]);
}

export function removeSurvey(signature) {
  saveSurveys(loadSurveys().filter((s) => s.signature !== signature));
}
