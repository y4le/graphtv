# GraphTV

GraphTV is a bundled client-side app for exploring TV episode ratings across multiple providers.

## Local development

```bash
npm install
npm run dev
```

Use `.env.local` for provider credentials:

```bash
TMDB_BEARER_TOKEN=
OMDB_API_KEY=
TVDB_API_KEY=
TVDB_READ_TOKEN=
```

## GitHub Pages

This repo includes a GitHub Pages workflow at [.github/workflows/deploy-pages.yml](/Users/yale/dev/graphtv/.github/workflows/deploy-pages.yml).

To deploy:

1. In GitHub, set `Settings -> Pages -> Build and deployment -> Source` to `GitHub Actions`.
2. Add these repository secrets if you want the keyed providers enabled in the deployed build:
   - `TMDB_BEARER_TOKEN`
   - `OMDB_API_KEY`
   - `TVDB_API_KEY`
   - `TVDB_READ_TOKEN`
3. Push to `master` or run the workflow manually.

Important:
- This is a static client-side deploy. Any keyed provider credentials included in the build are exposed to the browser.
- The build step obfuscates them to avoid trivial harvesting from git, but it does not keep them secret from users.
