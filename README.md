# graphtv

graphtv is a bundled client-side app for exploring TV episode ratings across multiple providers.

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
```

Before opening a pull request or pushing to `master`, run the same validation
used by CI:

```bash
npm run verify
```

`npm run audit` performs the network-backed full dependency audit used by CI.
It is separate from `verify` so local validation and production deployment do
not become unavailable when the advisory service is unreachable.

The production asset budget defaults to 90,000 gzip bytes total and 75,000
gzip bytes for the entry JavaScript chunk. Set `MAX_TOTAL_GZIP_BYTES` or
`MAX_ENTRY_GZIP_BYTES` when intentionally revising those limits.

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
