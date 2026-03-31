import { getToken } from './state.js';

const BASE_URL = 'https://api.spacetraders.io/v2';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `API Error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, { body, params, _retries = 3 } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const hasBody = method !== 'GET' && method !== 'DELETE';
  if (hasBody) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body ?? {}) : undefined,
  });

  // Rate limit retry
  if (res.status === 429 && _retries > 0) {
    const retryAfter = parseFloat(res.headers.get('retry-after') || '1');
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return request(method, path, { body, params, _retries: _retries - 1 });
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

export function fetchPage(path, page = 1, limit = 20) {
  return api.get(path, { page: String(page), limit: String(limit) });
}

export async function fetchAllPages(path, limit = 20) {
  const first = await fetchPage(path, 1, limit);
  const items = first.data;
  const total = first.meta?.total ?? items.length;
  const pages = Math.ceil(total / limit);
  for (let p = 2; p <= pages; p++) {
    const res = await fetchPage(path, p, limit);
    items.push(...res.data);
  }
  return items;
}

export const endpoints = {
  serverStatus: () => api.get('/'),
  myAgent: () => api.get('/my/agent'),
  myShips: (page) => fetchPage('/my/ships', page),
  shipDetail: (symbol) => api.get(`/my/ships/${symbol}`),
  shipCargo: (symbol) => api.get(`/my/ships/${symbol}/cargo`),
  shipCooldown: (symbol) => api.get(`/my/ships/${symbol}/cooldown`),
  myContracts: (page) => fetchPage('/my/contracts', page),
  systemDetail: (system) => api.get(`/systems/${system}`),
  systemWaypoints: (system, page) => fetchPage(`/systems/${system}/waypoints`, page),
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
  factions: (page) => fetchPage('/factions', page),
  register: (symbol, faction) => api.post('/register', { symbol, faction }),

  // Contracts
  acceptContract: (contractId) => api.post(`/my/contracts/${contractId}/accept`),
  deliverContract: (contractId, body) => api.post(`/my/contracts/${contractId}/deliver`, body),
  fulfillContract: (contractId) => api.post(`/my/contracts/${contractId}/fulfill`),
  negotiateContract: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/negotiate/contract`),

  // Navigation
  orbitShip: (symbol) => api.post(`/my/ships/${symbol}/orbit`),
  dockShip: (symbol) => api.post(`/my/ships/${symbol}/dock`),
  navigateShip: (symbol, waypointSymbol) => api.post(`/my/ships/${symbol}/navigate`, { waypointSymbol }),
  jumpShip: (symbol, waypointSymbol) => api.post(`/my/ships/${symbol}/jump`, { waypointSymbol }),
  warpShip: (symbol, waypointSymbol) => api.post(`/my/ships/${symbol}/warp`, { waypointSymbol }),
  setFlightMode: (symbol, flightMode) => api.patch(`/my/ships/${symbol}/nav`, { flightMode }),

  // Cargo
  purchaseCargo: (shipSymbol, symbol, units) => api.post(`/my/ships/${shipSymbol}/purchase`, { symbol, units }),
  sellCargo: (shipSymbol, symbol, units) => api.post(`/my/ships/${shipSymbol}/sell`, { symbol, units }),
  transferCargo: (shipSymbol, body) => api.post(`/my/ships/${shipSymbol}/transfer`, body),
  jettisonCargo: (shipSymbol, symbol, units) => api.post(`/my/ships/${shipSymbol}/jettison`, { symbol, units }),

  // Mining & Extraction
  surveyWaypoint: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/survey`),
  extractResources: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/extract`),
  extractWithSurvey: (shipSymbol, survey) => api.post(`/my/ships/${shipSymbol}/extract/survey`, survey),
  siphonResources: (shipSymbol) => api.post(`/my/ships/${shipSymbol}/siphon`),

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
  repairShip: (symbol) => api.post(`/my/ships/${symbol}/repair`),
  refineShip: (symbol, produce) => api.post(`/my/ships/${symbol}/refine`, { produce }),
  chartWaypoint: (symbol) => api.post(`/my/ships/${symbol}/chart`),
  scrapShip: (symbol) => api.post(`/my/ships/${symbol}/scrap`),

  // Shipyard
  purchaseShip: (shipType, waypointSymbol) => api.post('/my/ships', { shipType, waypointSymbol }),

  // Construction
  supplyConstruction: (systemSymbol, waypointSymbol, body) => api.post(`/systems/${systemSymbol}/waypoints/${waypointSymbol}/construction/supply`, body),
};
