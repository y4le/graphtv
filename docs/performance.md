# Performance and asset policy

GraphTV should stay fast through structural choices, not byte-level code golf. The build protects payloads that a user actually downloads, reports broader trends, and leaves enough headroom that ordinary product work does not become a budget exercise.

## Enforced budgets

`npm run size` reads Vite's production manifest and measures the gzip-compressed application-code closure initially loaded after the HTML for each page. A closure includes the application entry, its stylesheet and referenced assets, the selected page module, and all of their static imports, with shared files counted once. Deferred dynamic imports are excluded until the feature that requests them is measured.

| Experience                                                  |     Hard limit |
| ----------------------------------------------------------- | -------------: |
| Critical path: entry JavaScript, CSS, and referenced assets |  27,000 B gzip |
| Search route                                                |  45,000 B gzip |
| Results route                                               | 100,000 B gzip |
| Comparison route                                            | 100,000 B gzip |

The committed source of truth is [`bundle-budget.json`](../bundle-budget.json). Missing manifest entries and exceeded route limits fail verification. A route at 90% of its limit produces an advisory so there is time to inspect it before the limit is exhausted; CI exposes these advisories as GitHub annotations rather than burying them in a successful step's log.

These measurements are stable proxies for transfer cost, not exact wire sizes. Gzip is pinned to level 6; GitHub Pages may use another content encoding, and already-compressed fonts or images are conservatively passed through the same proxy. Provider credentials also change generated output by a few hundred bytes, which the budget headroom intentionally absorbs.

## Reported, not enforced

The size report also shows:

- every emitted application file, sorted by gzip size;
- each optional help, view-options, debug, and density closure beyond the critical path; shared files can appear in more than one feature line;
- the largest JavaScript chunk;
- total emitted application weight, excluding the build manifest.

These figures help reveal trends and dependency costs, but they do not map directly to one navigation. Total weight combines mutually exclusive routes and optional features; largest-chunk size depends on Rollup's packaging decisions. They are advisory review prompts, not optimization targets. The report warns, without failing, above 60,000 gzip bytes for one JavaScript chunk or 150,000 gzip bytes in total.

The optional-feature list and its review thresholds also live in `bundle-budget.json`. If a configured feature is absent from the manifest, the report emits a non-blocking advisory instead of silently dropping it.

## Review rules

Take a focused performance look when:

- a route reaches 90% of its budget;
- one change adds more than 5,000 gzip bytes to an enforced route;
- a new runtime dependency is proposed; or
- browser profiling on a representative device or network shows a meaningful loading, parsing, rendering, or interaction delay.

Start with structural levers: keep optional features and provider transports behind dynamic imports, remove unused work, and move noncritical JavaScript or CSS off the initial route. Measure the route again after the change.

Do not start optimization work solely because total output or a single chunk grew. Avoid work when the expected route saving is below 1,000 gzip bytes, when it requires hand-rolling a maintained library primitive to save less than 5,000 bytes, or when it merely reshuffles chunk boundaries without reducing a route closure. CI wall-clock and synthetic timing limits are intentionally excluded because their noise would create false failures; use targeted browser profiles when runtime evidence warrants them.

Raising a hard limit is a product decision, not a CI repair. The PR that raises one must state:

1. the affected route and before/after payload;
2. what the user receives for the increase;
3. whether the work can be lazy-loaded or moved off the critical path; and
4. why the chosen limit still leaves reasonable headroom.

Change the committed budget rather than bypassing it in CI. Budget increases belong with the feature that requires them, not with unrelated cleanup.
