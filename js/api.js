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

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Rate limit retry
  if (res.status === 429 && _retries > 0) {
    const retryAfter = parseFloat(res.headers.get('retry-after') || '1');
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return request(method, path, { body, params, _retries: _retries - 1 });
  }

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

export const endpoints = {
  serverStatus: () => api.get('/'),
  myAgent: () => api.get('/my/agent'),
  myShips: (page) => fetchPage('/my/ships', page),
  shipDetail: (symbol) => api.get(`/my/ships/${symbol}`),
  shipCargo: (symbol) => api.get(`/my/ships/${symbol}/cargo`),
  myContracts: (page) => fetchPage('/my/contracts', page),
  systemDetail: (system) => api.get(`/systems/${system}`),
  systemWaypoints: (system, page) => fetchPage(`/systems/${system}/waypoints`, page),
  waypointMarket: (system, waypoint) =>
    api.get(`/systems/${system}/waypoints/${waypoint}/market`),
  factions: (page) => fetchPage('/factions', page),
  register: (symbol, faction) => api.post('/register', { symbol, faction }),
};
