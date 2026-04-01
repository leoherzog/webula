# Webula — Agent Guide

## What is this?

A static-site GUI for the [SpaceTraders API](https://spacetraders.io/) game. No build tools, no frameworks — vanilla JS with ES modules, PicoCSS v2 for styling, Font Awesome 7 Pro for icons. All auth and game state lives in browser `localStorage`.

**Phase 1** is read-only: view agent info, fleet, contracts, system waypoints, and markets. The code is structured so Phase 2 (action buttons/forms) can be added by filling the `*-actions` placeholder divs in each view.

## Stack

| Layer | Technology | Loaded from |
|---|---|---|
| CSS framework | PicoCSS v2 (dark theme) | jsdelivr CDN |
| CSS colors | PicoCSS colors (utility classes) | jsdelivr CDN |
| Icons | Font Awesome 7 Pro | Kit script (`kit.fontawesome.com`) |
| Visualization | Sigma.js v3 + Graphology | jsdelivr CDN (ES module `+esm`) |
| JS | Vanilla ES modules (`type="module"`) | Local files |
| API | SpaceTraders v2 (`api.spacetraders.io/v2`) | Bearer token auth |

No `package.json`, no `node_modules`, no bundler. Serve with any static HTTP server (ES modules require it — `file://` won't work).

## File structure

```
index.html                          # SPA shell: header/nav, main, footer
css/style.css                       # Minimal custom CSS (PicoCSS handles most)
icons.json                          # Icon/color mappings (single source of truth)
js/
  app.js                            # Entry: routes, auth guards, boot
  api.js                            # Fetch wrapper: auth, retry, pagination, endpoints
  router.js                         # Hash-based SPA router with :params
  state.js                          # localStorage: token, cached agent, token history
  icons.js                          # Loads icons.json, exports icon() helper
  components/
    loading.js                      # withLoading(), showError(), escapeHtml(), etc.
    nav.js                          # Responsive nav bar (dropdown mobile, horizontal desktop)
    pagination.js                   # Reusable prev/next page controls
    system-map.js                   # Sigma.js system waypoint map
  views/
    login.js                        # Token login (bearer token + saved agents)
    fleet.js                        # Agent dashboard + paginated ship cards
    ship-detail.js                  # Full ship info: nav, frame, reactor, cargo, modules
    contracts.js                    # Contract list (cards on mobile, table on desktop)
    system.js                       # System map + waypoint browser + market data
scripts/
  verify_icons.py                   # Checks icons.json against API spec enums
.github/workflows/
  verify-icons.yml                  # Weekly CI: detect icon mapping drift
api-docs/                           # SpaceTraders OpenAPI spec (models + reference)
pico/                               # PicoCSS v2 source (SCSS reference)
```

## Architecture

### Routing (`router.js`)
Hash-based SPA. Routes registered in `app.js` via `addRoute(pattern, handler)`.

| Hash | View | Auth |
|---|---|---|
| `#/login` | `login.js` | No |
| `#/fleet` | `fleet.js` | Yes |
| `#/fleet/:shipSymbol` | `ship-detail.js` | Yes |
| `#/contracts` | `contracts.js` | Yes |
| `#/system` | `system.js` | Yes |
| `#/system/:systemSymbol` | `system.js` | Yes |

Auth-guarded routes use `guard(viewFn)` which checks `getToken()` and redirects to `#/login` if missing.

### Data flow

```
localStorage (token, agent)
  ↓
app.js guard() checks token
  ↓
View render(params) called
  ↓
endpoints.xxx() — api.js injects Bearer token, retries 429s
  ↓
withLoading() — shows spinner, catches errors, renders HTML
  ↓
icon(MAP, key) — resolves FA icon + Pico color from icons.json
```

### API client (`api.js`)
- Base URL: `https://api.spacetraders.io/v2`
- Auto-injects `Authorization: Bearer <token>` from `state.js`
- Rate limit: retries 429 responses up to 3 times with `retry-after` delay
- All responses are `{ data, meta? }` — `meta` has `total`, `page`, `limit` for pagination
- Throws `ApiError(status, body)` on non-2xx

### View pattern
Every view exports `async function render(params)`:
1. Gets `#app-main` via `getMain()`
2. Wraps async work in `withLoading(main, async () => { ... })`
3. Builds HTML with template literals + `icon()` + `escapeHtml()`
4. Leaves `<div id="*-actions">` placeholders for future Phase 2 action UI
5. Paginated views accept optional `page` param, re-invoke `render()` on page change

### Icon system (`icons.json` + `icons.js`)
`icons.json` is the single source of truth for 4 categories: `shipFrames`, `factions`, `waypointTypes`, `starTypes`. Each entry maps to a Font Awesome icon name and a PicoCSS color utility class.

Every category has a `_default` entry. When `icon(MAP, key)` encounters an unmapped key, it uses the default and logs `console.warn`.

`icons.js` fetches `icons.json` at startup and exports a `ready` promise. `app.js` awaits `ready` before starting the router.

### System map (`system-map.js`)
Uses Sigma.js v3 (WebGL graph renderer) + Graphology (graph data structure), loaded as ES modules from jsdelivr CDN.

- Waypoints → graph nodes at API-provided x,y coordinates, colored/sized by type
- Orbitals → edges connecting moons to parent bodies
- Ships → small offset nodes near their waypoint, colored by nav status
- Hover highlights connected nodes, dims unrelated ones
- Click scrolls to waypoint in the list (or navigates to ship detail)
- Pan/zoom built-in (mouse + touch)
- `killMap()` cleans up WebGL resources on navigation

### Responsive layout
Mobile-first via PicoCSS defaults. Custom CSS is minimal:

| Breakpoint | Layout changes |
|---|---|
| < 768px | Single-column cards, dropdown nav, `.card-list` visible |
| >= 768px | Horizontal nav, `.responsive-table` visible, 2-col grids |
| >= 1024px | `.grid-3` for 3-column fleet cards |

### CI (`verify-icons.yml`)
Python script compares `icons.json` keys against enum values in `api-docs/models/*.json` schemas. Runs weekly (Monday 9am UTC), on relevant file changes, and on manual trigger. Fails if mappings are out of sync with the API spec.

## Conventions

- **PicoCSS first**: use semantic HTML and PicoCSS classes/patterns before writing custom CSS. Reference `pico/scss/` source for available styles.
- **`<article>` = card**: PicoCSS styles `<article>` with `<header>` as a card component.
- **`aria-busy="true"`**: PicoCSS renders a loading spinner on buttons and containers.
- **`.outline`**: PicoCSS class for outline-style buttons (secondary emphasis).
- **`<div role="group">`**: PicoCSS inline button groups.
- **`<details class="dropdown">`**: PicoCSS v2 dropdown pattern (NOT `role="list"` which is v1).
- **`.overflow-auto`**: PicoCSS utility for scrollable table wrappers.
- **Pico color classes**: `pico-color-{family}-{shade}` for text color, `pico-background-{family}-{shade}` for backgrounds. Loaded via `pico.colors.css`.
- **`<mark>` labels/pills**: extends Pico's native `<mark>` with variant classes for colored pills. Bare `<mark>` = Pico default highlight. Variants: `.ins` (green, success), `.del` (red, danger), `.primary` (accent), `.secondary` (neutral/muted). Wrap multiple labels in `<span class="label-group">` for flex-wrap layout. Use `navStatusLabel(status)` from `loading.js` for ship nav status badges.
- **Font Awesome**: use `/suggest-icon` and `/add-icon` skills for icon lookups, not web search.
- **No build step**: everything must work as plain static files served over HTTP.
- **`escapeHtml()`**: always use for user-provided or API-returned text rendered as HTML.
- **Placeholders**: every view leaves `<div id="*-actions">` containers for Phase 2 expansion.
