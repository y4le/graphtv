# GraphTV Execution Plan

Written March 12, 2026. This is the single working plan for GraphTV. It supersedes the earlier `roadmap.md` and `cleanup.md` documents.

## Working assumptions

- We are optimizing for the **best final product**, not preservation of current behavior, design, or architecture.
- We will treat the existing codebase as a starting point, not as a compatibility target. Old code gets thrown out, not migrated incrementally.
- We want **bundled dependencies** and should aggressively control total shipped size.
- We should **keep debug mode** and improve it opportunistically.
- We want a clean provider interface with **robust multi-provider support**: filling in gaps from one provider with another, showing ratings from multiple sources side by side, and eventually averaging or aggregating ratings.
- **TVmaze is the default provider** (keyless, CORS, good coverage). TMDB, OMDb, and eventually a custom IMDb server are additional providers.
- Work should land in **clean, focused commits** with messages that explain what changed and why.

## Core principles

- Optimize for clean architecture first, then polish, then extension.
- Build the new system directly. No temporary compatibility layers.
- Keep module boundaries strong: pages, data, providers, visualization.
- Bundle size target: **< 100 KB gzipped total JS/CSS**. Smaller is better.
- Keep the D3 surface narrow and intentional.
- **Test-first development** for all logic code (stats, normalization, data composition). Write tests that capture the main path and meaningful edge cases before implementing. Avoid test theater — no tautological tests, no asserting implementation details, no tests that just prove the mock works.
- Use debug mode for faster development and inspection, not as an excuse for leaking internals.

## Target architecture

```
┌─────────────────────────────────────────────────┐
│                     Pages                        │
│  landing / search         results / chart        │
│  ┌─────────────┐         ┌──────────────────┐   │
│  │ search form │         │ show header      │   │
│  │ result list │         │ ratings chart    │   │
│  │ loading/err │         │ multi-provider   │   │
│  └─────────────┘         │ rating display   │   │
│                          │ loading/err      │   │
│                          └──────────────────┘   │
├─────────────────────────────────────────────────┤
│                  Visualization                   │
│  viz/ratingsChart.js   — SVG scene + update      │
│  viz/scales.js         — D3 scale helpers        │
│  viz/marks.js          — dots, trendlines, etc.  │
│  viz/tooltip.js        — HTML tooltip            │
│  viz/theme.js          — colors, spacing, tokens │
├─────────────────────────────────────────────────┤
│                    Data Layer                     │
│  data/schema.js        — Show, Season, Episode   │
│  data/provider.js      — dispatch + composition  │
│  data/merge.js         — multi-source merging    │
│  data/stats.js         — regression, math        │
├──────────┬──────────┬──────────┬────────────────┤
│ Providers│          │          │                 │
│ tvmaze/  │  tmdb/   │  omdb/   │  imdb-server/  │
│ (default)│          │ (opt.)   │  (future)       │
└──────────┴──────────┴──────────┴────────────────┘
```

## Build and dependency strategy

### Bundler: Vite

Vite is the default. It meets every requirement:

- Fast dev server with HMR
- Rollup-based production build with tree-shaking
- Static output deployable to GitHub Pages
- Native ESM support
- Minimal configuration
- Good bundle analysis via `rollup-plugin-visualizer` or `vite-bundle-analyzer`

### D3 modules

Install the full `d3` package via npm; rely on Vite's tree-shaking to include only what we import. Start with these modules:

- `d3-scale` — linear scales for episode position and rating
- `d3-axis` — axis rendering with smart tick generation
- `d3-selection` — DOM manipulation and data joins
- `d3-shape` — line generators for trendlines
- `d3-transition` — animated updates

Additional D3 modules (e.g. `d3-zoom`, `d3-brush`, `d3-color`) can be added if they provide significant functionality. The bar is: does this module save substantial custom code or meaningfully improve the product? If yes, use it. The tree-shaking means unused modules cost nothing.

### Styling: vanilla CSS

One `styles.css` file. Design tokens in `viz/theme.js` for chart-specific values; CSS handles page layout and general styling. No CSS framework, no CSS modules — the app isn't complex enough to need them.

### Bundle size budget

Target: **< 100 KB gzipped** for all shipped JS and CSS combined. Smaller is better.

For reference:
- D3 subset (~15-20 KB gzipped) + app code should land well under this
- Current app ships ~483 KB of chart libraries alone
- Vite's tree-shaking will keep unused D3 modules out of the bundle

Add lightweight bundle analysis tooling in Phase 1. Check the budget before each phase ships.

## Data strategy

### Internal schema

All providers normalize into one stable shape. The rest of the app never sees raw API responses.

```
Show {
  id: string                  // provider-prefixed: "tvmaze:123", "tmdb:456"
  title: string
  year: string                // first air date or year
  plot: string | null
  poster: string | null       // full URL or null
  totalSeasons: number
  genres: string[]
  ratings: ProviderRating[]   // ratings from one or more sources
  externalIds: {              // for cross-referencing between providers
    imdb?: string
    tmdb?: number
    tvmaze?: number
  }
}

Season {
  number: number
  title: string | null
  episodes: Episode[]
}

Episode {
  title: string
  plot: string | null
  season: number
  episode: number
  date: string | null
  ratings: ProviderRating[]   // per-source ratings
  poster: string | null
}

ProviderRating {
  source: string              // "tvmaze", "tmdb", "omdb", etc.
  rating: number | null       // normalized to 0-10 scale
  votes: number | null
}
```

Key design decisions:
- `ratings` is an array, not a single value. Every show and episode can carry ratings from multiple providers simultaneously.
- `externalIds` enables cross-provider lookups. TVmaze returns IMDb and TVDB IDs in its `externals` field; TMDB returns similar cross-references. These enable fetching the same show from a second provider without a search.
- `poster` is `null` when unavailable, not a broken URL. Normalization must guard against null image paths from APIs.

### Multi-provider composition (`data/merge.js`)

The data layer should support:

- **Gap filling**: if TVmaze returns `null` for an episode rating, check TMDB or OMDb for the same episode
- **Side-by-side ratings**: show ratings from multiple sources so the user can see how they differ
- **Aggregation**: compute an averaged or weighted rating across sources
- **Episode list reconciliation**: providers sometimes disagree on episode count or numbering (specials, split episodes). The merge layer should detect and handle mismatches rather than silently producing wrong data.

Phase 2 builds the schema and provider interface to support this. The actual multi-provider UI can land later, but the data model must not block it.

### Providers

| Provider | Auth | Role | Notes |
|---|---|---|---|
| `tvmaze` | None | Default | Keyless, CORS, 70k+ shows. Start here. |
| `tmdb` | Bearer token | Secondary | Higher rate limits. Good for gap-filling. |
| `omdb` | API key | Optional | Actual IMDb ratings (gold standard). 1k/day free limit. |
| `imdb-server` | Custom | Future | Self-hosted API over IMDb non-commercial datasets. |
| `testdb` | None | Dev only | Mock data for offline development and tests. |

Each provider has two files:

- `transport.js` — HTTP calls, auth headers, `response.ok` checks, rate limit handling
- `normalize.js` — pure functions mapping raw API responses to the internal schema

Normalization is pure and independently testable. Transport handles all network concerns.

### Stats (`data/stats.js`)

Pure math functions. No DOM or API awareness.

- `linearRegression(data) → { slope, intercept }`
- `trendline(ratings, startX, endX) → [point, point]`

**Known edge cases to handle** (bugs from the current implementation that must not be reintroduced):

- **Single data point**: `linearRegression` must not divide by zero. Return a flat line at the single value.
- **Zero data points**: return `null` or skip — do not produce `NaN` or `Infinity`.
- **Null ratings in input**: filter them out before computing regression. Don't pass `null` into the sum.
- **Trendline x-domain alignment**: the regression line endpoints must use the same x-coordinates as the scatter points. The old code had Season 1 trends starting at `x=0` instead of `x=1`, and later seasons starting one episode early.

These should all be captured as test cases before writing the implementation.

## Testing philosophy

**Test-first for logic code.** For stats, normalization, and data composition:

1. Write tests first that capture the expected behavior — main path and meaningful edge cases.
2. Implement the code.
3. Confirm tests pass.

**What makes a good test:**

- It would catch a real bug or a real regression.
- It tests behavior, not implementation details.
- It can survive a refactor of the code under test.

**What to avoid:**

- Tautological tests that assert what the mock returns.
- Testing framework wiring instead of app logic.
- Snapshot tests of large objects where a targeted assertion would be clearer.
- Tests that exist only to increase a coverage number.

**What to test:**

| Layer | What | Approach |
|---|---|---|
| Normalization | Each provider's `normalize.js` | Fixture-driven: save real API response snapshots, assert the normalized output matches the expected schema |
| Stats | `linearRegression`, `trendline` | Edge-case-heavy: normal data, single point, empty, null ratings, large datasets |
| Merge | `data/merge.js` composition | Multi-fixture: feed two providers' outputs, assert gap-filling and reconciliation behavior |
| Scales | Domain/range from season data | Unit tests for edge cases (single season, empty episodes, extreme ratings) |
| Provider dispatch | Correct provider selected, lazy loading | Unit tests with mocked imports |

Normalization tests are the highest value — they catch API response shape changes before anything else breaks.

## Debug mode

Debug mode stays. Activated via `?debug` URL param.

Minimum support:

- Current provider selection
- Active show identifier and external IDs
- Normalized data inspection (show, seasons, merged ratings)
- Provider errors surfaced clearly
- Optional rendering diagnostics if cheap

Implementation: a gated debug panel or overlay module. Debug-only code is lazy-loaded and excluded from the production-critical path. No mutable globals scattered across modules.

## Target file structure

```
graphtv/
├── index.html
├── css/
│   └── styles.css
├── src/
│   ├── main.js                  — router + entry point
│   ├── pages/
│   │   ├── search.js
│   │   ├── results.js
│   │   └── shared.js            — loading/error/empty state helpers
│   ├── data/
│   │   ├── schema.js            — internal types + validation
│   │   ├── provider.js          — dispatch + lazy loading
│   │   ├── merge.js             — multi-provider composition
│   │   └── stats.js             — regression, math
│   ├── providers/
│   │   ├── tvmaze/
│   │   │   ├── transport.js
│   │   │   └── normalize.js
│   │   ├── tmdb/
│   │   │   ├── transport.js
│   │   │   └── normalize.js
│   │   ├── omdb/
│   │   │   ├── transport.js
│   │   │   └── normalize.js
│   │   └── testdb/
│   │       └── index.js         — wraps test fixtures as a provider
│   ├── viz/
│   │   ├── ratingsChart.js      — public chart API
│   │   ├── scales.js
│   │   ├── marks.js
│   │   ├── tooltip.js
│   │   └── theme.js
│   └── debug/
│       └── panel.js             — lazy-loaded debug overlay
├── test/
│   ├── fixtures/                — saved API response snapshots
│   │   ├── tvmaze/
│   │   ├── tmdb/
│   │   └── omdb/
│   ├── providers/
│   │   ├── tvmaze.normalize.test.js
│   │   ├── tmdb.normalize.test.js
│   │   └── omdb.normalize.test.js
│   ├── data/
│   │   ├── stats.test.js
│   │   └── merge.test.js
│   └── viz/
│       └── scales.test.js
├── docs/
│   ├── execution_plan.md        — this file
│   └── research/
│       ├── api.md
│       └── viz.md
├── package.json
├── vite.config.js
├── eslint.config.js
├── .prettierrc
└── .gitignore
```

Notes:
- Source code lives in `src/` (Vite convention). Old `js/` directory goes away.
- Test fixtures serve double duty: they back the normalization tests AND power the testdb provider. The testdb provider imports from `test/fixtures/` and runs the normalization functions against them, mimicking a real provider without any network calls.
- The `debug/` module is lazy-loaded via dynamic `import()` so it adds zero cost to production page loads.

## Execution phases

### Phase 1: Foundation and scaffolding

**Goal:** establish the project structure, tooling, bundling, and test harness.

**Tasks:**

- Initialize `package.json` with `name`, `version`, `type: "module"`
- Install and configure Vite with static output
- Install and configure ESLint (flat config), Prettier, Vitest
- Add npm scripts: `dev`, `build`, `preview`, `test`, `lint`, `format`
- Add lightweight bundle size reporting
- Create the directory structure: `src/`, `test/`, `docs/`
- Create a minimal `index.html` + `src/main.js` entry point that Vite can serve
- Delete old code: `js/lib/chart.js`, `js/lib/highcharts.js`, `js/chartjs.js`, `js/hichart.js`, `js/omdb.js`, `js/testdb.js`, `js/api.js`, `js/searchPage.js`, `js/resultsPage.js`, `js/tmdb.js`, `js/stats.js`, `js/util.js`
- Confirm: dev server runs, production build produces static files, test command runs, lint command runs

**Exit criteria:**

- `npm run dev` serves the app
- `npm run build` produces a deployable `dist/` folder
- `npm test` runs and passes (even if there are zero real tests yet)
- `npm run lint` and `npm run format` work
- Bundle size is measurable

### Phase 2: Data layer and providers

**Goal:** build the normalized data model, provider system, and stats module with test-first development.

**Tasks:**

- Define the internal schema in `src/data/schema.js`
- Write stats tests first: main path, single point, zero points, null ratings, x-domain alignment
- Implement `src/data/stats.js` and pass all stats tests
- Save real API response snapshots as test fixtures for TVmaze, TMDB, and OMDb
- Write normalization tests for TVmaze first (it's the default provider)
- Implement `src/providers/tvmaze/normalize.js` and `transport.js`
- Write normalization tests for TMDB
- Implement `src/providers/tmdb/normalize.js` and `transport.js`
- Write normalization tests for OMDb
- Implement `src/providers/omdb/normalize.js` and `transport.js`
- Build `src/data/provider.js` with lazy-loaded provider dispatch
- Build `src/providers/testdb/index.js` wrapping test fixtures
- Add transport-level error handling: `response.ok` checks, meaningful error messages, rate limit detection
- Stub `src/data/merge.js` with the multi-provider composition interface (gap-filling, reconciliation). Full implementation can land in Phase 5, but the interface should be designed now.

**Exit criteria:**

- TVmaze, TMDB, and OMDb all normalize into the same internal schema
- Provider modules are lazy-loaded (only the selected provider is fetched)
- All normalization and stats tests pass
- `testdb` provider works offline using saved fixtures

### Phase 3: App shell, routing, and debug

**Goal:** build the page skeleton and data flow so the app is navigable end-to-end.

**Tasks:**

- Define the URL model:
  - `(no params)` or `?q=` → search page
  - `?show=tvmaze:123` or `?show=tmdb:456` → results page
  - `?api=` overrides default provider
  - `?debug` activates debug mode
  - Legacy `?i=` and `?t=` params redirect to `?show=` format
- Implement router in `src/main.js`
- Build page skeleton for search and results (containers, loading/error states)
- Wire search page to provider `search()` and render results
- Wire results page to provider `getShow()` + `getSeasons()` via `Promise.all`
- Build `src/pages/shared.js` with `renderLoading`, `renderError`, `renderEmpty` helpers
- Build initial debug panel: provider name, show ID, external IDs, raw normalized data dump
- Lazy-load the debug panel module

**Exit criteria:**

- Searching for a show works end-to-end through TVmaze
- Selecting a result navigates to results page and fetches data
- Loading, error, and empty states are visible
- Debug panel shows normalized data when `?debug` is active

### Phase 4: D3 visualization

**Goal:** build the custom SVG chart system.

**Tasks:**

- Install `d3` via npm (tree-shaken by Vite to only the used modules)
- Build `src/viz/theme.js` — dark theme tokens: background, text, season palette, point sizing rules, stroke widths, font sizes
- Build `src/viz/scales.js` — D3 scale factories for episode x-position and rating y-position. Write tests for domain computation edge cases.
- Build `src/viz/marks.js` — scatter dots (per-season color, dynamic sizing), trendlines (from `stats.js` output), season separator guides
- Build `src/viz/tooltip.js` — HTML tooltip with episode title, rating, date, plot. Screen-edge clamping. Touch-tap support.
- Build `src/viz/ratingsChart.js` — public API: `createChart(container, seasons, options)`, `updateChart(chart, seasons)`. Uses `ResizeObserver` for responsive resize. Owns the SVG element and render cycle.
- Wire results page to call `createChart()` with normalized season data
- Verify chart works on desktop and mobile widths
- Verify tooltip works with mouse hover and touch tap
- Check bundle size — D3 modules should add ~15-20 KB gzipped

**Exit criteria:**

- Chart renders episode ratings as a scatter plot with per-season colors
- Trendlines are correctly positioned (no offset bugs)
- Tooltips show rich episode metadata
- Chart resizes cleanly without leaking DOM elements
- Mobile touch interaction works
- Total bundle is under 100 KB gzipped

### Phase 5: Page design and product UX

**Goal:** build the polished end-to-end experience.

**Tasks:**

Search page:
- Semantic `<form>` with search input and submit button
- Loading state while search is in flight
- Empty state when no results match
- Error state with retry affordance
- Result list with poster thumbnail, title, year
- Keyboard accessible (tab to result, enter to select)

Results page:
- Show header: title, year, genres, plot — **visible by default**, not hidden behind hover
- Poster image as decorative element, not the primary interaction trigger
- Chart container with loading skeleton while seasons fetch
- Error state if fetch fails (partial success: show metadata even if some seasons fail)
- Multi-provider rating display in the show header (e.g. "TVmaze: 8.4 · TMDB: 8.1")

Layout and styling:
- Allow vertical scrolling — remove `overflow: hidden`
- Responsive breakpoints: single-column on narrow screens, chart fills available width
- Clean CSS transitions (no `transition: all`, animate specific properties)
- Valid HTML: proper `<meta>` tags, no void element closing tags, semantic structure
- Dark theme as default

General:
- Page title updates with show name on results page
- Clean URL display (no unnecessary params)

**Exit criteria:**

- App feels like a coherent product, not a wired-together demo
- Search → results flow works smoothly on desktop and mobile
- Show metadata is immediately readable without interaction tricks
- Error and loading states are visible and helpful
- CSS is clean and intentional

### Phase 6: Multi-provider and refinement

**Goal:** build out multi-provider support and polish.

**Tasks:**

- Implement `src/data/merge.js`:
  - Gap filling (null TVmaze rating → check TMDB/OMDb)
  - Side-by-side display (show all available ratings per episode)
  - Aggregation (weighted average across sources)
  - Episode list reconciliation (detect numbering mismatches)
- Write merge tests with multi-provider fixture combinations
- Build UI for multi-provider rating comparison (chart overlay, header badges, or toggle)
- Accessibility: keyboard navigation through chart points, ARIA labels, focus management
- Animated transitions on chart update
- Bundle size optimization pass
- Richer debug panel: merged data view, provider comparison, mismatch highlighting
- Consider `imdb-server` backend design

**Exit criteria:**

- Multi-provider ratings are visible and useful
- Accessibility basics work (keyboard, screen reader)
- Bundle stays under 100 KB gzipped
- Architecture is stable enough that refinement doesn't fight the foundation

## Known logic bugs from the old codebase

These are documented here so they are not reintroduced in the new implementation. All should be captured as test cases during test-first development.

| Bug | Where it was | What to test in new code |
|---|---|---|
| Regression divide-by-zero on 1 episode | `stats.js:1-30` | `stats.test.js`: single-point input returns flat line |
| Trendline offset misalignment | `hichart.js:14-18`, `stats.js:19-30` | `stats.test.js`: trendline endpoints match scatter x-domain |
| Null image paths produce broken URLs | `tmdb.js:33,55,81,89` | `normalize.test.js`: null `poster_path` → `null`, not `".../null"` |
| Raw fields dumped into UI | `resultsPage.js:16-32` | Page code explicitly selects display fields from schema |
| Silent `undefined` on unknown provider | `api.js:5-35` | `provider.test.js`: unknown provider throws descriptive error |
| Resize leaks DOM elements | `hichart.js:108-116` | `ratingsChart` tests: update/resize reuses container |
| `window.seasons` global state | `resultsPage.js:36-45` | No `window.*` in new code; state is local and passed explicitly |

## Commit strategy

- One conceptual change per commit when practical.
- Avoid mixing unrelated cleanup and feature work.
- Commit messages explain what changed and why.

Good examples:
- `Add Vite scaffold with ESLint, Prettier, and Vitest`
- `Define normalized Show/Season/Episode schema with ProviderRating`
- `Add TVmaze normalization with fixture-driven tests`
- `Build SVG ratings chart with D3 scales and marks`
- `Add multi-provider merge with gap-filling and reconciliation`

## Autonomous decision rules

Proceed without asking when:

- The decision is an implementation detail inside this plan
- The choice improves architecture, testability, or bundle size without changing product direction
- A dependency choice is clearly better for bundling and maintainability
- A debug improvement is cheap, useful, and doesn't distort the main UX
- Adding a D3 module saves substantial code or meaningfully improves the product

Stop and ask when:

- The product direction changes materially
- The multi-provider model implies a major UX decision
- A build or deployment assumption needs a nontrivial tradeoff
- There is a conflict with user-authored in-progress work
- Bundle size would exceed the 100 KB budget
