# Webula

Webula is a static web client for the [SpaceTraders API v2](https://spacetraders.io/). It shows the agent, fleet, contracts, systems, waypoints, factions and other agents, and sends ship, cargo, contract, shipyard and construction actions.

It is vanilla ES modules with no build step and no `package.json`. Pico CSS and `pico.colors.min.css` load from jsdelivr at the `@2` range, Sigma.js 3.0.3 and Graphology 0.26.0 at exact versions, and Font Awesome 7 Pro loads from its kit script. The token and small caches live in `localStorage`. Serve the repo root over HTTP, because ES modules fail under `file://` and `sw.js` and `manifest.json` use root-absolute paths.

## Files

```
index.html               # shell: search and preview meta, JSON-LD, nav, main, footer, #toasts; registers sw.js
404.html                 # Cloudflare Pages' answer to missing paths
robots.txt               # keeps crawlers out of the submodules, scripts and this file; names the sitemap
sitemap.xml              # lists /, the only indexable page
_headers                 # Pages response headers: noindex on the pages.dev host
manifest.json, icons/    # PWA manifest, icons, and the og-image.png link preview
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
  refresh.js             # 5 s polling with backoff
  offline.js             # offline badge, Last updated footer
  components/
    loading.js           # withLoading, escapeHtml, navStatusLabel, credits, factionLink, agentLink, agentMark
    countdown.js         # countdown <progress> bars
    pagination.js        # previous/next links
    nav.js               # top nav for both auth states, agent menu
    server-reset.js      # footer countdown to the next server reset
    system-map.js        # Sigma map of one system
  views/                 # one module per route or list-and-detail pair; ship-actions.js serves ship-detail.js
scripts/verify_icons.py  # checks icons.json against the spec's enums
api-docs/, pico/         # reference submodules; never edit
```

## Routes

| Hash | View |
|---|---|
| `#/login` | `login.js`: token login, saved agents, server status and description, stats, announcements, links |
| `#/leaderboard` | `leaderboard.js`: most credits and most charts, with the logged-in and saved agents marked |
| `#/fleet` | `fleet.js`: agent summary, ship cards |
| `#/fleet/:shipSymbol` | `ship-detail.js`: stored surveys, registration, crew, part specs and requirements, cargo valued at the local market |
| `#/contracts` | `contracts.js` |
| `#/system`, `#/system/:systemSymbol` | `system.js`: system summary, map, waypoint cards filtered by type and trait |
| `#/system/:systemSymbol/waypoint/:waypointSymbol` | `waypoint-detail.js`: market with supply chain, shipyard with ship specs, recent transactions, jump gate, construction |
| `#/systems` | `systems.js`: every system, paginated |
| `#/factions`, `#/factions/:factionSymbol` | `factions.js`: faction cards, or one faction with its trait descriptions |
| `#/agents`, `#/agents/:agentSymbol` | `agents.js`: every agent, paginated, or one agent's public profile |

`guard()` protects every route but login and leaderboard, which use `page()`. Both render the nav, which without a token shows only the links marked `public` and a Login button in place of the agent menu. An unmatched hash goes to `#/fleet`, or to `#/login` without a token. Route params match `[\w-]+`, so they are safe in HTML. Paginated views keep the page in the hash query as `page=N`, which handlers receive as `params.page`.

Handlers also receive `params.query`, the hash's `URLSearchParams`, whose values are untrusted until checked against a known list. The system view keeps its filters there as `?type=&traits=`, and `paginationNav(meta, base)` keeps any query in `base`.

## Views

- `render(params)` wraps its work in `withLoading(getMain(), fn)`, which shows the spinner, renders errors, and adds a login link on a 401.
- A route change aborts the previous view's GETs. `withLoading` then returns false and writes nothing, leaving `aria-busy` on `#app-main` for the next view's spinner. A view that writes `#app-main` without `withLoading`, like login, must remove `aria-busy` itself.
- Fleet, contracts, ship detail and waypoint detail poll every 5 s, calling `startRefresh(() => render(params))` only when `withLoading` returned true. Systems, factions, agents and leaderboard show static data and don't poll.
- A poll keeps the old content on any error but 401. `withLoading` reports a failed render to `refresh.js`, and `api.js` reports every 429, 5xx, network failure and service-worker fallback, so a page that survives a failed `orNull()` sub-fetch still backs off.
- After a failure the next poll waits 10 s, or 2 min for a 502 because the API's DDoS layer asks for a few minutes. Each further failure at least doubles the wait, up to 5 min. A 401 stops polling. A hidden or offline tab skips polls and runs the one that came due when it returns.
- Build the page HTML in one template and assign it once. Polled views assign it with `setContent(main, html)`, which skips the write when a poll renders the same HTML, so focus, an open select and busy buttons survive. Run `animateCountdowns()` only when it returns true.
- A write closes open `<details>`, so ship detail and waypoint detail key theirs and reopen the keys that were open. Read the keys before `withLoading`, whose spinner replaces the page on the refresh after an action, and scope them to the page's symbol so another ship or waypoint doesn't inherit them.
- Data fixed for a server reset, like the supply chain, uses the `FIXED` cache tier in `api.js`, so views fetch it on every render.
- Put action buttons in the card's `<footer>`, and omit the footer when it would be empty.
- Polled views bind delegated listeners as `onclick` or `onchange` properties on an element the render created. A poll that skips the write rebinds on the same element, and a property replaces the old handler with one that sees the new data, where `addEventListener` would stack them. Never bind to `#app-main`, which outlives views and would keep the handler on the next route.

## Actions

- `performAction(btn, apiFn, after = refreshView)` refuses offline, marks `btn` busy, toasts a summary of the response and each ship condition event in red, stores `data.agent` for the nav's credits, then runs `after`. It resolves null on failure and never rejects, so call sites need no try/catch. A custom `after` replaces the refresh, so it calls the exported `refreshView()` itself.
- `summarize()` names a response by its shape, most specific first. Contract and construction shapes precede the cargo-only shape of jettison and transfer, and accept and fulfill differ only by `contract.fulfilled`.
- `openFormDialog(title, bodyHtml, onSubmit)` submits natively, so `required`, `min` and `max` validate. It stays open when `onSubmit` resolves null, so callbacks return `performAction(...)`. Without `onSubmit` it is read-only, with no form and one Close button, which is how scans show their results. Any `data-close` element inside closes it, so links in a result carry it or sit inside one.
- `confirmAction(message)` takes HTML, so escape API text. Repair and scrap put the `repairQuote()` or `scrapQuote()` price in it.
- `busyFetch(btn, fn)` runs a GET that feeds a dialog. `openNavigateDialog` and `openDeliverDialog` are the shared pickers.
- Ship pickers for deliver, supply, transfer and negotiate take their ships from `endpoints.allShips()`. `openNavigateDialog` loads the system and `systemMarkets()` in one `busyFetch`, and a failed market lookup only drops the market flags.
- Gate buttons and picker options on a mount, module, trait or waypoint type only when the endpoint's description in `api-docs/reference/SpaceTraders.json` states it. Docked and in-orbit checks may follow the game where the spec is silent, as may offering `jumpShip` only at a built `JUMP_GATE`, whose connections the jump description refers to.
- Cooldown-bound buttons carry `data-cooldown` and stay disabled until `ship.cooldown` expires.
- Ship detail loads the waypoint's market once per render, only when docked or holding cargo, and passes it to `shipActions` and `bindShipActions`. Sell and Buy reuse it and fetch only when it is null, and Sell shows only for goods it trades. The cargo table's Sell and Value columns show only when the market prices some of the cargo.
- Surveys live in `localStorage` as `st_surveys`, unmodified, because `extractWithSurvey` rejects a changed one. `state.js` reads and writes them through `getSurveys(waypointSymbol)`, `addSurveys(surveys)` and `removeSurvey(signature)`, drops expired ones, and clears them with the token. Ship detail offers them only to an orbiting ship with a Mining Laser or Gas Siphon, because `extract/survey` names no mount and replaces extract's survey payload. An extract with survey discards that survey only on the server's survey verification, expiration or exhaustion code (4220, 4221, 4224).

## API client

- Every call carries the bearer token except `serverStatus()`, because `GET /` answers 401 to a token from before the last reset.
- Authenticated GETs carry `navSignal()`. A view passes it to `serverStatus(signal)` itself, because unauthenticated GETs get none. Wrap optional sub-fetches in `orNull()`, which rethrows `AbortError` so a superseded render stops, and a 401 so the page shows the login link and polling stops.
- A 429 is retried 3 times. One from the rate limiter carries `x-ratelimit-type` and waits its `retry-after`; any other backs off 1, 2, then 4 s. The limits are 2 requests per second per IP and per account, with a burst of 30 over 60 s.
- Authenticated GETs may pass a TTL: `FRESH` (30 s) for markets, shipyards, construction and agents, `SLOW` (5 min) for waypoints and factions, and `FIXED` for systems, jump gates and the supply chain. `/my/*` is never cached.
- A write drops every cache entry but `FIXED` ones, even when its connection fails, and a GET in flight during a write is not stored. A token change drops them all, and a GET in flight during one is not stored. The cache stores and returns `structuredClone` copies, so callers may mutate responses.
- A cache hit throws `AbortError` when the route has changed, as an aborted fetch would. A non-JSON error body, like a gateway 502, becomes an `ApiError`.
- `fetchPage` and `fetchAllPages` take extra query params. Null and empty values are dropped, and an array becomes a repeated key. `systemWaypoints(system, page, { type, traits })` sends only those two filters.
- Responses are `{ data, meta? }`, where `meta` has `total`, `page` and `limit`. `GET /` is unwrapped, and a 204 becomes `{ data: null }`.
- Errors carry `message`, `status` and the API's numeric error `code`.
- List pages hold at most 20 items. `allShips()` and `systemMarkets()` walk them all and return plain arrays.
- The live API returns a faction's `headquarters` as a system symbol, though the spec calls it a waypoint, so `factions.js` links either. An agent's `headquarters` is a waypoint.

## Service worker

- Every GET is network-first, and the cache answers only offline. API responses go to `webula-api`, newest 100; everything else goes to `SHELL_CACHE`.
- Cache keys ignore the token, so `state.js` deletes `webula-api` when the token changes or is cleared. That name must match `API_CACHE` in `sw.js`.
- `APP_SHELL` must list every file the app loads and nothing that is missing, because one 404 fails the install. `404.html`, `robots.txt`, `sitemap.xml` and `icons/og-image.png` stay out, because the app never loads them. Editing `sw.js` reinstalls the worker; code changes need no version bump.
- Offline with nothing cached, a GET gets a 503 JSON "You are offline". Writes pass through, and `performAction` refuses them offline.
- A cached API copy served for a failed fetch carries `x-webula-fallback`, which `api.js` shows but neither caches nor counts as a successful poll. The name must match `FALLBACK_HEADER` in `api.js`.
- Fresh API responses post `api-updated`, which `offline.js` shows as Last updated.

## Search and previews

- Search engines drop the hash, so `/` is the only indexable page and the only URL in `sitemap.xml`. Its title, description, canonical link, Open Graph tags and JSON-LD live in the `index.html` head.
- Bump the sitemap's `lastmod` when the homepage's content changes, meaning the `index.html` head or the login view.
- The description appears in the meta description, `og:description`, the JSON-LD and `manifest.json`. Change all four together.
- `og:image` and the JSON-LD `image` need absolute URLs. `icons/og-image.png` is 1200×630.
- JSON-LD nodes reference each other by `@id`. The author and publisher is `https://herzog.tech/#person`, the Person node herzog.tech's own JSON-LD defines, so keep that `@id` matching it.
- `app.js` sets `document.title` to the route's name plus " · Webula". Login keeps the title from `index.html`, because Google indexes the rendered homepage, which is login. For the same reason login renders the page's only `<h1>`.
- `404.html` makes Cloudflare Pages answer a missing path with a 404. Without it Pages serves `index.html` with a 200 for every path. It is served at any depth, so its URLs are root-absolute. Pages also serves it at `/404` with a 200, so it carries `noindex`.
- Pages serves the whole repo, submodules included. `robots.txt` disallows those, `scripts/` and `AGENTS.md`, and must never disallow `js/`, `css/` or `icons.json`, which Google needs to render the page.
- The production `*.pages.dev` host duplicates the custom domain, so `_headers` sends it `X-Robots-Tag: noindex`. Pages adds that header to preview deployments itself.

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

- Pico and Font Awesome first. Check `pico/scss/` and the FA utilities (`fa-fw`, `fa-spin`, `fa-stack`, `fa-ul`/`fa-li`, sizes) before writing CSS. `style.css` holds only the `dl` grid, the `mark` pill shape, `.grid-3`, `#toasts`, the agent menu's inline-block fix for Firefox and the phone nav spacing.
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
- Render faction symbols with `factionLink(symbol)` and agent symbols with `agentLink(symbol)`, which escapes and leaves a symbol outside `[\w-]+` as plain text. Agent routes are guarded, so the leaderboard links names only when a token is stored. `agentMark(symbol, me, saved)` sets the You or Saved pill beside a name.
- Progress bars are plain `<progress>`. Countdown bars carry `data-start`, `data-end` and `data-done`, and `animateCountdowns()` writes into the `<small>` that follows.
- Toasts use `showToast(message, 'ins' | 'del')`.
- Format credits with `credits(n)` from `loading.js`.
- Pass API text and user input through `escapeHtml()`, attribute values included. Enum values and ship, waypoint and system symbols may stay raw, because the router already assumes symbols match `[\w-]+`. The agent symbol is user-chosen, so escape it.
- Find icons with the `/suggest-icon` and `/add-icon` skills, not web search.
