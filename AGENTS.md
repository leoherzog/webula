# Webula

Webula is a static web client for the [SpaceTraders API v2](https://spacetraders.io/). It shows the agent, fleet, contracts, systems, waypoints, factions and other agents, and sends ship, cargo, contract, shipyard and construction actions.

It is vanilla ES modules with no build step and no `package.json`. Pico CSS and `pico.colors.min.css` load from jsdelivr at the `@2` range, Sigma.js 3.0.3 and Graphology 0.26.0 at exact versions, and Font Awesome 7 Pro loads from its kit script. The token and small caches live in `localStorage`. Serve the repo root over HTTP, because ES modules fail under `file://` and `sw.js` and `manifest.json` use root-absolute paths.

## Files

```
index.html               # shell: nav, main, footer, #toasts; registers sw.js
manifest.json, icons/    # PWA manifest and icons
sw.js                    # network-first service worker
css/style.css            # the few rules Pico lacks
icons.json               # enum to icon and color map
js/
  app.js                 # routes, guard(), boot
  router.js              # hash router, page and query params, per-route AbortSignal
  api.js                 # fetch wrapper and endpoints
  state.js               # localStorage: token, agents, systems, surveys
  icons.js               # JSON-module import of icons.json, icon()
  actions.js             # performAction, dialogs, toasts, shared pickers
  refresh.js             # 30 s polling
  offline.js             # offline badge, Last updated footer
  components/
    loading.js           # withLoading, escapeHtml, navStatusLabel, credits, factionLink, agentLink
    countdown.js         # countdown <progress> bars
    pagination.js        # previous/next links
    nav.js               # top nav and agent menu
    server-reset.js      # footer countdown to the next server reset
    system-map.js        # Sigma map of one system
  views/                 # one module per route or list-and-detail pair; ship-actions.js serves ship-detail.js
scripts/verify_icons.py  # checks icons.json against the spec's enums
api-docs/, pico/         # reference submodules; never edit
```

## Routes

| Hash | View |
|---|---|
| `#/login` | `login.js`: token login, saved agents, server status, stats, announcements, links, leaderboard with saved agents marked |
| `#/fleet` | `fleet.js`: agent summary, ship cards |
| `#/fleet/:shipSymbol` | `ship-detail.js`: stored surveys, cargo valued at the local market |
| `#/contracts` | `contracts.js` |
| `#/system`, `#/system/:systemSymbol` | `system.js`: map, waypoint cards filtered by type and trait |
| `#/system/:systemSymbol/waypoint/:waypointSymbol` | `waypoint-detail.js`: market, shipyard with ship specs, jump gate, construction |
| `#/systems` | `systems.js`: every system, paginated |
| `#/factions`, `#/factions/:factionSymbol` | `factions.js`: faction cards, or one faction with its trait descriptions |
| `#/agents`, `#/agents/:agentSymbol` | `agents.js`: every agent, paginated, or one agent's public profile |

`guard()` protects every route but login. An unmatched hash goes to `#/fleet`, or to `#/login` without a token. Route params match `[\w-]+`, so they are safe in HTML. Paginated views keep the page in the hash query as `page=N`, which handlers receive as `params.page`.

Handlers also receive `params.query`, the hash's `URLSearchParams`, whose values are untrusted until checked against a known list. The system view keeps its filters there as `?type=&traits=`, and `paginationNav(meta, base)` keeps any query in `base`.

## Views

- `render(params)` wraps its work in `withLoading(getMain(), fn)`, which shows the spinner, renders errors, and adds a login link on a 401.
- A route change aborts the previous view's GETs. `withLoading` then returns false and writes nothing, leaving `aria-busy` on `#app-main` for the next view's spinner. A view that writes `#app-main` without `withLoading`, like login, must remove `aria-busy` itself.
- Fleet, contracts, ship detail and waypoint detail poll every 30 s, calling `startRefresh(() => render(params))` only when `withLoading` returned true. A poll keeps the old content on any error but 401. Systems, factions and agents show static data and don't poll.
- Build the page HTML in one template and assign it once. A poll thus closes open `<details>`, so waypoint detail reopens the shipyard ships that were open in the old DOM.
- Put action buttons in the card's `<footer>`, and omit the footer when it would be empty.
- Bind delegated listeners to an element the render created, never to `#app-main`, which outlives renders and would gain a listener per poll.

## Actions

- `performAction(btn, apiFn, after = refreshView)` refuses offline, marks `btn` busy, toasts a summary of the response and each ship condition event in red, stores `data.agent` for the nav's credits, then runs `after`. It resolves null on failure and never rejects, so call sites need no try/catch. A custom `after` replaces the refresh, so it calls the exported `refreshView()` itself.
- `openFormDialog(title, bodyHtml, onSubmit)` submits natively, so `required`, `min` and `max` validate. It stays open when `onSubmit` resolves null, so callbacks return `performAction(...)`. Without `onSubmit` it is read-only, with no form and one Close button, which is how scans show their results. Any `data-close` element inside closes it.
- `confirmAction(message)` takes HTML, so escape API text. Repair and scrap put the `repairQuote()` or `scrapQuote()` price in it.
- `busyFetch(btn, fn)` runs a GET that feeds a dialog. `openNavigateDialog` and `openDeliverDialog` are the shared pickers.
- Ship pickers for deliver, supply, transfer and negotiate take their ships from `endpoints.allShips()`. `openNavigateDialog` loads the system and `systemMarkets()` in one `busyFetch`, and a failed market lookup only drops the market flags.
- Gate buttons and picker options on a mount, module, trait or waypoint type only when the endpoint's description in `api-docs/reference/SpaceTraders.json` states it. Docked and in-orbit checks may follow the game where the spec is silent, as may offering `jumpShip` only at a built `JUMP_GATE`, whose connections the jump description refers to.
- Cooldown-bound buttons carry `data-cooldown` and stay disabled until `ship.cooldown` expires.
- Ship detail loads the waypoint's market once per render, only when docked or holding cargo, and passes it to `shipActions` and `bindShipActions`. Sell and Buy reuse it and fetch only when it is null, and Sell shows only for goods it trades. The cargo table's Sell and Value columns show only when the market prices some of the cargo.
- Surveys live in `localStorage` as `st_surveys`, unmodified, because `extractWithSurvey` rejects a changed one. `state.js` reads and writes them through `getSurveys(waypointSymbol)`, `addSurveys(surveys)` and `removeSurvey(signature)`, drops expired ones, and clears them with the token. Ship detail offers them only to an orbiting ship with a Mining Laser or Gas Siphon, because `extract/survey` names no mount and replaces extract's survey payload. An extract with survey discards that survey only on the server's survey verification, expiration or exhaustion code (4220, 4221, 4224).

## API client

- Every call carries the bearer token except `serverStatus()`, because `GET /` answers 401 to a token from before the last reset.
- Authenticated GETs carry `navSignal()`. Wrap optional sub-fetches in `orNull()`, which rethrows `AbortError` so a superseded render stops.
- A 429 is retried 3 times after `retry-after`.
- `fetchPage` and `fetchAllPages` take extra query params. Null and empty values are dropped, and an array becomes a repeated key. `systemWaypoints(system, page, { type, traits })` sends only those two filters.
- Responses are `{ data, meta? }`, where `meta` has `total`, `page` and `limit`. `GET /` is unwrapped, and a 204 becomes `{ data: null }`.
- Errors carry `message`, `status` and the API's numeric error `code`.
- List pages hold at most 20 items. `allShips()` and `systemMarkets()` walk them all and return plain arrays.
- The live API returns a faction's `headquarters` as a system symbol, though the spec calls it a waypoint, so `factions.js` links either. An agent's `headquarters` is a waypoint.

## Service worker

- Every GET is network-first, and the cache answers only offline. API responses go to `webula-api`, newest 100; everything else goes to `SHELL_CACHE`.
- Cache keys ignore the token, so `state.js` deletes `webula-api` when the token changes or is cleared. That name must match `API_CACHE` in `sw.js`.
- `APP_SHELL` must list exactly the shipped files, because one 404 fails the install. Editing `sw.js` reinstalls the worker; code changes need no version bump.
- Offline with nothing cached, a GET gets a 503 JSON "You are offline". Writes pass through, and `performAction` refuses them offline.
- Fresh API responses post `api-updated`, which `offline.js` shows as Last updated.

## Icons and CI

- `icons.json` maps `shipFrames`, `factions`, `waypointTypes` and `starTypes` to a Font Awesome icon and a `pico-color-*` class. `icons.js` imports it as a JSON module.
- `icon(MAP, key)` falls back to the category's `_default` and warns once per unmapped key.
- The system map reads the class's `--pico-color-*` property, so use only classes `pico.colors` defines.
- `.github/workflows/verify-icons.yml` runs `scripts/verify_icons.py` weekly against the spec's upstream HEAD, on pushes that touch `icons.json`, the script or the workflow, and on demand.
- Run it locally with `uv run scripts/verify_icons.py`.

## System map

- `renderSystemMap(container, systemData, ships)` needs a container that is in the document and has an explicit height.
- One Sigma instance lives at a time. A new render kills the previous one, and the next hashchange kills it too, freeing the WebGL context and Sigma's resize listener.
- Sigma throws without WebGL, so `system.js` catches it and keeps the waypoint grid.
- Every map color comes from a `--pico-color-*` property through `paletteColor()`. Ship dots match `navStatusLabel`'s pills, and labels, edges and dimmed nodes use zinc-400.
- Sigma's canvas composites as premultiplied alpha, so an unscaled `rgba()` renders too bright. Pass translucent colors as `paletteColor(cls, alpha)`, which scales the channels.

## Conventions

- Pico and Font Awesome first. Check `pico/scss/` and the FA utilities (`fa-fw`, `fa-spin`, `fa-stack`, `fa-ul`/`fa-li`, sizes) before writing CSS. `style.css` holds only the `dl` grid, the `mark` pill shape, `.grid-3` and `#toasts`.
- A card is an `<article>` with a `<header>`, and its actions go in a `<footer>`. Card lists use `<div class="grid grid-3">`.
- `aria-busy="true"` shows Pico's spinner.
- `.outline` and `.secondary` mark lesser buttons. Destructive actions are `outline secondary` with a red `fa-trash-can`, behind a `confirmAction`.
- `<div role="group">` joins controls. Icon-only buttons need `aria-label` and a matching `data-tooltip`, not `title`, which would show a second tooltip.
- Dropdowns are `<details class="dropdown">`. Use `<summary role="button">` for a button-styled trigger and `<ul dir="rtl">` to right-align the menu.
- An accordion is a plain `<details>`. Give its `<summary>` `role="button"` when it holds pills that may wrap, because Pico sets a bare summary's line height to 1rem and wrapped pills overlap.
- Wrap wide tables in `.overflow-auto`. Keep dropdowns out of it, because it clips them. A `data-tooltip` inside it sits in the leading column with `data-placement="right"`, so it opens over the row instead of past the edge.
- Color with `pico-color-{family}-{shade}` and `pico-background-{family}-{shade}`, never a literal.
- `manifest.json`, the theme-color meta and the icons cannot read CSS, so they use palette hex: azure-500 `#017fc0` on slate-950 `#0e1118`.
- A pill is a `<mark>`: bare for a highlight, or with a `pico-background-*` class. Separate pills with spaces. `navStatusLabel(status)` renders ship status.
- Never put a link inside a `pico-background-azure-*` pill, because Pico's link color matches it. Use a bare `<mark>` or set the pill beside the link.
- Render faction symbols with `factionLink(symbol)` and agent symbols with `agentLink(symbol)`, which escapes and leaves a symbol outside `[\w-]+` as plain text. Agent routes are guarded, so login links leaderboard names only when a token is stored.
- Progress bars are plain `<progress>`. Countdown bars carry `data-start`, `data-end` and `data-done`, and `animateCountdowns()` writes into the `<small>` that follows.
- Toasts use `showToast(message, 'ins' | 'del')`.
- Format credits with `credits(n)` from `loading.js`.
- Pass API text and user input through `escapeHtml()`, attribute values included. Enum values and ship, waypoint and system symbols may stay raw, because the router already assumes symbols match `[\w-]+`. The agent symbol is user-chosen, so escape it.
- Find icons with the `/suggest-icon` and `/add-icon` skills, not web search.
