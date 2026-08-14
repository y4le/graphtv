# GraphTV Architecture Status

Updated August 14, 2026. The redesign plan is complete; this document records the implemented architecture and the checks that protect it.

## Product architecture

- Vite builds a static, client-side application with D3 used only for visualization primitives.
- Provider transports normalize TVmaze, TMDB, and OMDb responses into one schema. Cross-provider alignment is conservative and provenance-aware.
- Results load as a stream: the primary provider renders first and configured supplemental providers update the same chart model as they settle.
- Provider work is bounded, abortable, cached, and cancelled when its stream ends or its caller aborts.
- One responsive SVG chart uses a shared viewport model on desktop and mobile. The sparkline, chart navigation, pointer gestures, and keyboard commands all update that model; the abandoned separate scrolling renderer was removed.
- Theme state is owned by `src/viz/theme.js`. CSS owns token resolution while chart code reads computed colors only when SVG attributes require literal values.
- One document-level keyboard controller routes normal, insert, and overlay modes. Overlay behavior, focus trapping, and focus restoration are centralized.

## Repository boundaries

- `src/data/`: normalized models, merging, alignment, caches, and provider orchestration
- `src/providers/`: provider-specific transport and normalization
- `src/pages/`: search/results page composition and page lifecycle
- `src/ui/`: reusable overlays, carousels, keyboard routing, and supporting UI
- `src/viz/`: chart model, marks, viewport behavior, themes, and sidenotes
- `src/lib/`: small environment-independent helpers
- `test/`: unit, integration, DOM, CSS-contract, and build-configuration coverage

## Deliberate constraints

- Production has no test database or mock-data runtime path. Fixtures live under `test/` only.
- GitHub Pages is a static deployment. TMDB and OMDb credentials configured for a build are recoverable by browser users; encoding prevents accidental source-control disclosure, not extraction. A server-side proxy is required if those credentials ever need to be secret.
- TVmaze remains the keyless baseline, so the application works without build credentials.
- Source maps are not published in production builds.
- Malformed or ambiguous provider data is omitted instead of guessed into a chart.

## Validation

Run before merging:

```bash
npm run verify
npm run audit
```

`verify` covers linting, unit/integration and DOM tests, formatting, the production build, and bundle budgets. The audit remains separate because the advisory service is network-backed.

For chart-model performance measurements:

```bash
npm run bench:chart-model
```

The benchmark compares a full breakpoint analysis with the common supplemental-provider update where primary rating inputs are unchanged.
