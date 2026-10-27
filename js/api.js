// SpaceTraders v2 client: one fetch wrapper (bearer token, 429 retry, route-scoped abort) and the endpoints table the views call.
import { getToken } from './state.js';
import { navSignal } from './router.js';

const BASE_URL = 'https://api.spacetraders.io/v2';
// The API caps list pages at 20 items.
const PAGE_LIMIT = 20;

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `API Error ${status}`);
    this.status = status;
    // The API's numeric error code, such as 4224 for an exhausted survey.
    this.code = body?.error?.code;
  }
}

async function request(method, path, {
  body,
  params,
  auth = true,
  // A route change aborts the previous view's GETs; the retry below reuses this signal so a stale render cannot pick up the new route's.
  signal = method === 'GET' && auth ? navSignal() : undefined,
  retries = 3,
} = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  // An array becomes a repeated key, as the spec's array query params expect.
  for (const [k, v] of Object.entries(params ?? {})) {
    for (const x of [v].flat()) if (x != null && x !== '') url.searchParams.append(k, x);
  }

  const headers = {};
  const token = auth && getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const hasBody = method !== 'GET';
  if (hasBody) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, { method, headers, body: hasBody ? JSON.stringify(body ?? {}) : undefined, signal });
  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, parseFloat(res.headers.get('retry-after') || '1') * 1000));
    return request(method, path, { body, params, auth, signal, retries: retries - 1 });
  }
  if (res.status === 204) return { data: null };
  const json = await res.json();
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
};

/** Fetches one list page; params are extra query params, and empty values are dropped. */
function fetchPage(path, page = 1, params = {}) {
  return api.get(path, { ...params, page: String(page), limit: String(PAGE_LIMIT) });
}

/** Walks every page of a list. @returns {Promise<object[]>} the items as a plain array. */
async function fetchAllPages(path, params = {}) {
  const first = await fetchPage(path, 1, params);
  const items = first.data;
  const pages = Math.ceil((first.meta?.total ?? items.length) / PAGE_LIMIT);
  for (let p = 2; p <= pages; p++) items.push(...(await fetchPage(path, p, params)).data);
  return items;
}

/** Resolves null when the request fails, but rethrows AbortError so a render superseded by a route change stops. */
export function orNull(promise) {
  return promise.catch((err) => {
    if (err.name === 'AbortError') throw err;
    return null;
  });
}

export const endpoints = {
  // Unauthenticated: the server answers 401 to a token from before the last reset.
  serverStatus: () => request('GET', '/', { auth: false }),
  myAgent: () => api.get('/my/agent'),
  myShips: (page) => fetchPage('/my/ships', page),
  allShips: () => fetchAllPages('/my/ships'),
  shipDetail: (symbol) => api.get(`/my/ships/${symbol}`),
  myContracts: (page) => fetchPage('/my/contracts', page),
  systemDetail: (system) => api.get(`/systems/${system}`),
  systemWaypoints: (system, page, { type, traits } = {}) =>
    fetchPage(`/systems/${system}/waypoints`, page, { type, traits }),
  systemMarkets: (system) => fetchAllPages(`/systems/${system}/waypoints`, { traits: 'MARKETPLACE' }),
  waypointDetail: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}`),
  waypointMarket: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/market`),
  waypointShipyard: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/shipyard`),
  waypointJumpGate: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/jump-gate`),
  waypointConstruction: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/construction`),
  systems: (page) => fetchPage('/systems', page),
  factions: (page) => fetchPage('/factions', page),
  faction: (symbol) => api.get(`/factions/${symbol}`),
  agents: (page) => fetchPage('/agents', page),
  agent: (symbol) => api.get(`/agents/${symbol}`),
  // data.exportToImportMap maps each exported good to the imports that produce it.
  supplyChain: () => api.get('/market/supply-chain'),
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
