// SpaceTraders v2 client: one fetch wrapper (bearer token, 429 retry, route-scoped abort, a TTL cache for GETs) and the endpoints table the views call.
import { getToken } from './state.js';
import { navSignal } from './router.js';
import { reportFailure } from './refresh.js';

const BASE_URL = 'https://api.spacetraders.io/v2';
// The API caps list pages at 20 items.
const PAGE_LIMIT = 20;
const MAX_RETRIES = 3;

// How long a GET reuses its last response. Writes drop every entry but FIXED ones, which hold data fixed for a server reset.
const FRESH = 30_000;
const SLOW = 5 * 60_000;
const FIXED = Infinity;
const CACHE_MAX = 200;

// URL to { json, ttl, time }, oldest first.
const cache = new Map();
let cacheToken = null;
// Counts writes, so a GET in flight during one does not cache what the write changed.
let writes = 0;
// sw.js sets this header on a cached copy it serves because the fetch failed.
const FALLBACK_HEADER = 'x-webula-fallback';

const STATUS_TEXT = { 502: 'The SpaceTraders API returned 502 Bad Gateway. Try again in a few minutes.' };

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || STATUS_TEXT[status] || `API Error ${status}`);
    this.status = status;
    // The API's numeric error code, such as 4224 for an exhausted survey.
    this.code = body?.error?.code;
  }
}

function cached(key) {
  const entry = cache.get(key);
  return entry && Date.now() - entry.time < entry.ttl ? structuredClone(entry.json) : null;
}

function store(key, json, ttl) {
  cache.delete(key);
  // Callers may mutate what they get, as fetchAllPages appends to the first page, so the cache keeps its own copy.
  cache.set(key, { json: structuredClone(json), ttl, time: Date.now() });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function dropChangeable() {
  writes++;
  for (const [key, entry] of cache) if (entry.ttl !== FIXED) cache.delete(key);
}

async function request(method, path, {
  body,
  params,
  auth = true,
  // A route change aborts the previous view's GETs; the retry below reuses this signal so a stale render cannot pick up the new route's.
  signal = method === 'GET' && auth ? navSignal() : undefined,
  // Milliseconds an authenticated GET reuses its response; 0 always fetches.
  ttl = 0,
  attempt = 0,
} = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  // An array becomes a repeated key, as the spec's array query params expect.
  for (const [k, v] of Object.entries(params ?? {})) {
    for (const x of [v].flat()) if (x != null && x !== '') url.searchParams.append(k, x);
  }

  const token = auth && getToken();
  // Cached responses belong to the agent whose token fetched them.
  if (auth && token !== cacheToken) {
    cache.clear();
    cacheToken = token;
  }
  const useCache = method === 'GET' && auth && ttl > 0;
  const hit = useCache && cached(url.href);
  if (hit) {
    // A superseded render must stop here, as it would on an aborted fetch.
    signal?.throwIfAborted();
    return hit;
  }

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = method !== 'GET';
  if (hasBody) headers['Content-Type'] = 'application/json';

  const writesBefore = writes;
  let res;
  try {
    res = await fetch(url, { method, headers, body: hasBody ? JSON.stringify(body ?? {}) : undefined, signal });
  } catch (err) {
    if (err.name !== 'AbortError') reportFailure(err);
    throw err;
  } finally {
    // The server may have applied a write whose connection then dropped.
    if (hasBody) dropChangeable();
  }
  if (res.status === 429 && attempt < MAX_RETRIES) {
    // Only the rate limiter sets x-ratelimit-type, and its retry-after is exact; a 429 from the cloud layer backs off 1, 2, then 4 s.
    const retryAfter = parseFloat(res.headers.get('retry-after'));
    const wait = res.headers.has('x-ratelimit-type') && retryAfter >= 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
    return request(method, path, { body, params, auth, signal, ttl, attempt: attempt + 1 });
  }
  if (res.status === 204) return { data: null };
  // A gateway error such as the DDoS layer's 502 may not be JSON; an abort while reading must still surface as one.
  const json = await res.json().catch((err) => {
    if (err.name === 'AbortError') throw err;
    return null;
  });
  if (!res.ok || !json) {
    const err = new ApiError(res.status, json);
    // Server trouble slows polling even when the view survives it; a client error such as a 404 does not.
    if (res.status === 429 || res.status >= 500) reportFailure(err);
    throw err;
  }
  // A copy served for a failed fetch is shown, but neither cached nor counted as a success.
  if (res.headers.has(FALLBACK_HEADER)) reportFailure(new Error('Showing a cached copy'));
  // A token change while this request was in flight means the response belongs to the previous agent.
  else if (useCache && writes === writesBefore && token === cacheToken) store(url.href, json, ttl);
  return json;
}

const api = {
  get: (path, params, ttl) => request('GET', path, { params, ttl }),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
};

/** Fetches one list page; params are extra query params, and empty values are dropped. */
function fetchPage(path, page = 1, params = {}, ttl = 0) {
  return api.get(path, { ...params, page: String(page), limit: String(PAGE_LIMIT) }, ttl);
}

/** Walks every page of a list. @returns {Promise<object[]>} the items as a plain array. */
async function fetchAllPages(path, params = {}, ttl = 0) {
  const first = await fetchPage(path, 1, params, ttl);
  const items = first.data;
  const pages = Math.ceil((first.meta?.total ?? items.length) / PAGE_LIMIT);
  for (let p = 2; p <= pages; p++) items.push(...(await fetchPage(path, p, params, ttl)).data);
  return items;
}

/** Resolves null when the request fails, but rethrows AbortError so a render superseded by a route change stops, and a 401 so the page asks for a new token. */
export function orNull(promise) {
  return promise.catch((err) => {
    if (err.name === 'AbortError' || err.status === 401) throw err;
    return null;
  });
}

export const endpoints = {
  // Unauthenticated: the server answers 401 to a token from before the last reset. A view passes navSignal(), since unauthenticated GETs get none by default.
  serverStatus: (signal) => request('GET', '/', { auth: false, signal }),
  myAgent: () => api.get('/my/agent'),
  myShips: (page) => fetchPage('/my/ships', page),
  allShips: () => fetchAllPages('/my/ships'),
  shipDetail: (symbol) => api.get(`/my/ships/${symbol}`),
  myContracts: (page) => fetchPage('/my/contracts', page),
  systemDetail: (system) => api.get(`/systems/${system}`, null, FIXED),
  systemWaypoints: (system, page, { type, traits } = {}) =>
    fetchPage(`/systems/${system}/waypoints`, page, { type, traits }, SLOW),
  systemMarkets: (system) => fetchAllPages(`/systems/${system}/waypoints`, { traits: 'MARKETPLACE' }, SLOW),
  // Charts, modifiers and construction status can change under other agents.
  waypointDetail: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}`, null, SLOW),
  waypointMarket: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/market`, null, FRESH),
  waypointShipyard: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/shipyard`, null, FRESH),
  waypointJumpGate: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/jump-gate`, null, FIXED),
  waypointConstruction: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/construction`, null, FRESH),
  systems: (page) => fetchPage('/systems', page, {}, FIXED),
  factions: (page) => fetchPage('/factions', page, {}, SLOW),
  faction: (symbol) => api.get(`/factions/${symbol}`, null, SLOW),
  agents: (page) => fetchPage('/agents', page, {}, FRESH),
  agent: (symbol) => api.get(`/agents/${symbol}`, null, FRESH),
  // data.exportToImportMap maps each exported good to the imports that produce it.
  supplyChain: () => api.get('/market/supply-chain', null, FIXED),
  // Contracts
  acceptContract: (contractId) => api.post(`/my/contracts/${contractId}/accept`),
  deliverContract: (contractId, body) => api.post(`/my/contracts/${contractId}/deliver`, body),
  fulfillContract: (contractId) => api.post(`/my/contracts/${contractId}/fulfill`),
  negotiateContract: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/negotiate/contract`),

  // Navigation
  orbitShip: (symbol) => api.post(`/my/ships/${symbol}/orbit`),
  dockShip: (symbol) => api.post(`/my/ships/${symbol}/dock`),
  navigateShip: (symbol, waypointSymbol) => api.post(`/my/ships/${symbol}/navigate`, { waypointSymbol }),
  setFlightMode: (symbol, flightMode) => api.patch(`/my/ships/${symbol}/nav`, { flightMode }),
  jumpShip: (symbol, waypointSymbol) => api.post(`/my/ships/${symbol}/jump`, { waypointSymbol }),
  warpShip: (symbol, waypointSymbol) => api.post(`/my/ships/${symbol}/warp`, { waypointSymbol }),

  // Cargo
  purchaseCargo: (shipSymbol, symbol, units) => api.post(`/my/ships/${shipSymbol}/purchase`, { symbol, units }),
  sellCargo: (shipSymbol, symbol, units) => api.post(`/my/ships/${shipSymbol}/sell`, { symbol, units }),
  transferCargo: (shipSymbol, body) => api.post(`/my/ships/${shipSymbol}/transfer`, body),
  jettisonCargo: (shipSymbol, symbol, units) => api.post(`/my/ships/${shipSymbol}/jettison`, { symbol, units }),

  // Mining & Extraction
  surveyWaypoint: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/survey`),
  extractResources: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/extract`),
  siphonResources: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/siphon`),
  // The server rejects a survey whose properties changed, so send it exactly as the survey endpoint returned it.
  extractWithSurvey: (shipSymbol, survey) => api.post(`/my/ships/${shipSymbol}/extract/survey`, survey),

  // Scanning
  scanSystems: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/scan/systems`),
  scanWaypoints: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/scan/waypoints`),
  scanShips: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/scan/ships`),

  // Equipment
  installMount: (shipSymbol, symbol) => api.post(`/my/ships/${shipSymbol}/mounts/install`, { symbol }),
  removeMount: (shipSymbol, symbol) => api.post(`/my/ships/${shipSymbol}/mounts/remove`, { symbol }),
  installModule: (shipSymbol, symbol) => api.post(`/my/ships/${shipSymbol}/modules/install`, { symbol }),
  removeModule: (shipSymbol, symbol) => api.post(`/my/ships/${shipSymbol}/modules/remove`, { symbol }),

  // Management
  refuelShip: (symbol, units) => api.post(`/my/ships/${symbol}/refuel`, units ? { units } : undefined),
  repairQuote: (symbol) => api.get(`/my/ships/${symbol}/repair`),
  repairShip: (symbol) => api.post(`/my/ships/${symbol}/repair`),
  refineShip: (symbol, produce) => api.post(`/my/ships/${symbol}/refine`, { produce }),
  chartWaypoint: (symbol) => api.post(`/my/ships/${symbol}/chart`),
  scrapQuote: (symbol) => api.get(`/my/ships/${symbol}/scrap`),
  scrapShip: (symbol) => api.post(`/my/ships/${symbol}/scrap`),

  // Shipyard
  purchaseShip: (shipType, waypointSymbol) => api.post('/my/ships', { shipType, waypointSymbol }),

  // Construction
  supplyConstruction: (systemSymbol, waypointSymbol, body) => api.post(`/systems/${systemSymbol}/waypoints/${waypointSymbol}/construction/supply`, body),
};
