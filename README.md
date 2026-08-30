# graphtv

graphtv is a bundled client-side app for exploring TV episode ratings across multiple providers, including synchronized show-to-show comparisons.

## Local development

```bash
npm install
npm run dev
```

For HTTPS access from another device on the tailnet:

```bash
npm run dev:tailnet
```

This starts Vite at `http://127.0.0.1:5175/graphtv/` and registers the
path-scoped `https://<tailnet-host>/graphtv/` route with `tailnet-dev-host`.
The dev configuration restores the path internally after Tailscale Serve
strips it, preventing Vite base-path redirect loops.
Set `PORT` to choose another local port, or `TAILNET_EXPOSE=0` to exercise the
same path-based Vite configuration without changing Tailscale Serve state.
`HOST`, `TAILNET_PATH`, and `TAILNET_TARGET_HOST` override the local bind host,
public route, and proxy target host when a non-default setup requires them.

Use `.env.local` for provider credentials:

```bash
TMDB_BEARER_TOKEN=
OMDB_API_KEY=
VITE_RATINGSDB_API_BASE=
```

`VITE_RATINGSDB_API_BASE` is public deployment configuration, not a
credential. Leave it unset when RatingsDB is unavailable.
For a cross-origin RatingsDB, expose the `Retry-After` response header with
`Access-Control-Expose-Headers: Retry-After`; otherwise pending retries use the
client's default delay.

Before opening a pull request or pushing to `master`, run the same validation
used by CI:

```bash
npm run verify
npm run test:e2e
```

`npm run audit` performs the network-backed full dependency audit used by CI.
It is separate from `verify` so local validation and production deployment do
not become unavailable when the advisory service is unreachable.

`test:e2e` builds the app and runs mocked search, single-show, and show-comparison
journeys, keyboard/modal checks, mobile touch interaction, and automated
accessibility scans in Chromium. Install the local browser once with
`npx playwright install chromium`; CI installs Chromium automatically.

`npm run size` enforces gzip budgets for the critical path and each initial
page payload: 27,000 bytes for entry JavaScript, CSS, and referenced assets,
45,000 for search, and 100,000 for each chart route. Aggregate output, optional
features, and the largest chunk remain visible as advisory trends rather than
deployment gates. The limits and the rules for investigating, optimizing, or
deliberately raising them are documented in
[docs/performance.md](docs/performance.md).

## Project card

`.yalethomas/card.svg` is generated from a real show's ratings by
`scripts/build-card-svg.mjs`, which fetches ratings from the app's providers,
runs the app's chart model and mark scaling, then draws them in the monotone
palette with a single selection:

```bash
npm run build:card                                    # Game of Thrones
node scripts/build-card-svg.mjs --show "The Wire"
node scripts/build-card-svg.mjs --season 4            # select a season instead
```

The selection goes to the detected series breakpoint when the show has one the
app would call high confidence — the two regimes and the marker between them.
Shows without one fall back to the season with the steepest trendline; pass
`--season` to override the automatic selection. `.env.local` credentials add
TMDB and IMDb ratings to TVmaze's; without them the card is built from TVmaze
alone and carries no provider spread.

## GitHub Pages

This repo includes a GitHub Pages workflow at [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).

To deploy:

1. In GitHub, set `Settings -> Pages -> Build and deployment -> Source` to `GitHub Actions`.
2. Add these repository secrets if you want the keyed providers enabled in the deployed build:
   - `TMDB_BEARER_TOKEN`
   - `OMDB_API_KEY`
3. Push to `master` or run the workflow manually.

Important:

- This is a static client-side deploy. Any keyed provider credentials included in the build are exposed to the browser.
- The build step obfuscates them to avoid trivial harvesting from git, but it does not keep them secret from users.
