# GraphTV Execution Plan

Updated March 12, 2026 after the initial rewrite landed. This plan now covers only the remaining redesign work. Completed baseline rewrite items have been removed.

## Current state

The following are already in place and should be treated as foundations, not open work:

- Vite-based bundled app scaffold with linting, formatting, tests, and bundle-size reporting
- normalized data layer and provider modules for TVmaze, TMDB, OMDb, and test fixtures
- router, search/results page flow, and debug mode
- baseline D3 chart implementation

The remaining work is not "finish the rewrite." It is "replace the current product shell and chart system with the design defined in `docs/redesign.md`."

## Working assumptions

- We are optimizing for the best final product, not preserving the current UI.
- We should freely replace current page structure, chart modules, and CSS when the redesign calls for it.
- We keep bundled dependencies and continue treating bundle size as a real constraint.
- Debug mode stays and may improve opportunistically if it helps implementation or inspection.
- The redesign should land in clean, focused commits with messages that explain what changed and why.

## Redesign goals

The end state must match `docs/redesign.md` in substance, not just in mood:

- Tufte-inspired analytical document layout across the whole app
- light and dark themes from day one
- season palettes: monotone, subtle, vivid
- search page and results page sharing one typographic system
- dense-show navigation via sparkline minimap and viewport-based main chart
- desktop sidenote instead of floating tooltip
- mobile inline detail instead of desktop-only hover behavior
- range-frame chart treatment instead of boxed chart scaffolding

## Gap from current implementation

These are the important gaps between the current app and the redesign spec:

- current CSS is still card/panel driven and visually heavy
- current theme system is a single hard-coded dark palette, not a tokenized multi-theme system
- current chart is one SVG with a tooltip, not a sparkline + viewport + sidenote architecture
- current axes and chart framing do not implement the range-frame design
- current results page layout does not use the intended asymmetric document composition
- current search page still feels like an app shell rather than part of the same editorial surface
- current mobile behavior does not implement sticky Y-axis plus inline detail

## Execution strategy

We should not attack this as one giant styling pass. The redesign has clear dependency order:

1. theme and layout primitives
2. chart architecture
3. page integration
4. interaction and accessibility polish

That order keeps us from hard-coding visual decisions into chart modules and prevents CSS churn from fighting in-progress interaction work.

## Planned commit slices

The redesign should land in small, reviewable commits. This is the intended slice plan:

1. theme tokens, persisted settings, and base CSS reset
2. search page redesign and document-level layout primitives
3. chart data/view model updates needed for viewport-based rendering
4. sparkline minimap module and shared viewport state
5. main chart rebuild: range frame, marks, trendlines, labels, crosshairs
6. sidenote/inline detail system replacing tooltip behavior
7. results page composition and responsive desktop/mobile layout
8. keyboard/mobile interaction polish, debug improvements, and cleanup

If a slice becomes too large, split it. Do not collapse unrelated concerns into one commit.

## Phase 1: Theme system and layout foundation

**Goal:** replace the current visual foundation with the tokenized system the redesign requires.

### Tasks

- Replace the current ad hoc `chartTheme` object with a real theme/settings module in `src/viz/theme.js`
- Define token groups for:
  - page colors
  - typography
  - spacing
  - chart dimensions
  - transition timings
- Support:
  - `light` theme
  - `dark` theme
  - `monotone`, `subtle`, and `vivid` season palettes
- Persist theme and palette selection in `localStorage`
- Default theme to `prefers-color-scheme` when no saved preference exists
- Apply theme tokens via CSS custom properties on the document root
- Replace the existing CSS foundation in `css/styles.css`:
  - remove panel/card/glassmorphism styling
  - establish a typographic page rhythm
  - add serif/sans token usage
  - build shared control styles that are minimal and document-like

### Exit criteria

- both light and dark themes work
- palette switching works without data reload
- no remaining panel/card styling in the global shell
- page-level styling derives from tokens rather than hard-coded colors

## Phase 2: Search page redesign

**Goal:** make the search page feel like the first page of the same analytical document.

### Tasks

- Rebuild `src/pages/search.js` markup to match the redesign:
  - centered single-column composition
  - serif title and short supporting copy
  - minimal search form
  - typographic results list instead of cards
- Make result rows lightweight:
  - optional small poster
  - title + year on a single reading line where practical
  - simple hover/focus treatment using text color, underline, or subtle rule changes
- Replace current loading, empty, and error presentation with editorial text states
- Preserve existing provider functionality and debug behavior
- Keep the page accessible via semantic form submission and keyboard focus

### Exit criteria

- search page no longer uses result cards or heavy containers
- empty/loading/error states fit the same visual language
- results read as a list, not a grid of components

## Phase 3: Chart model and viewport architecture

**Goal:** prepare the chart data/model layer for the redesign before drawing new marks.

### Tasks

- Audit `src/viz/scales.js` and `src/viz/marks.js` and reshape them around:
  - full-series episode indexing
  - viewport slices
  - data min/max domains for range-frame rendering
  - season cluster metadata for direct labels
- Define a stable chart view model that can drive:
  - sparkline full-series rendering
  - main chart viewport rendering
  - desktop sidenote selection
  - mobile inline detail selection
- Ensure the model supports:
  - macro trendline across the entire rated series
  - micro trendlines per season
  - omission of null ratings
  - long-show viewport windows without recomputing unrelated structures on every interaction
- Add or update tests for scale/domain and trendline alignment behavior if the current coverage is insufficient

### Exit criteria

- chart state is explicit and viewport-driven
- no chart logic depends on tooltip-only interaction
- scale and trendline behavior still pass correctness checks

## Phase 4: Sparkline minimap and viewport state

**Goal:** implement the full-series overview and navigation model that dense shows require.

### Tasks

- Add `src/viz/sparkline.js`
- Render a separate sparkline SVG with:
  - full-series line
  - tiny points
  - no axes or labels
- Add viewport state management:
  - default viewport sizing for short vs long shows
  - click/tap to jump
  - drag to pan
  - optional desktop resize via `d3-brush`
- Coordinate sparkline interactions with the main chart viewport
- Animate viewport jumps enough to preserve orientation without feeling ornamental
- Ensure the viewport state can also sync with mobile horizontal scrolling if needed

### Exit criteria

- sparkline is a separate module and SVG
- long shows render through a viewport instead of compressing the full series into the main chart
- sparkline navigation changes the main chart predictably

## Phase 5: Main chart rebuild

**Goal:** replace the current chart rendering with the redesign's range-frame analytical treatment.

### Tasks

- Rebuild `src/viz/marks.js` to render:
  - range-frame Y-axis from data min to data max
  - endpoint labels and filtered interior ticks
  - no full plot box
  - no conventional X-axis baseline
  - direct season labels near clusters
  - episode dots at the target visual size
  - macro dashed trendline behind the chart
  - micro solid season trendlines behind dots
  - crosshairs for active point state
- Rebuild `src/viz/ratingsChart.js` around:
  - separate sparkline and main chart SVGs
  - shared viewport state
  - `ResizeObserver`
  - explicit update and destroy behavior
- Remove tooltip-oriented code paths and the old `tooltip.js` dependency from the chart
- Ensure resize/update paths do not leak DOM nodes

### Exit criteria

- the main chart visually matches the redesign direction
- the chart is no longer a boxed dashboard chart
- trendlines and points remain correctly aligned under viewport updates

## Phase 6: Sidenote and responsive detail system

**Goal:** replace floating tooltip behavior with chart-adjacent reading surfaces.

### Tasks

- Replace `src/viz/tooltip.js` with `src/viz/sidenote.js`
- Desktop behavior:
  - populate a persistent sidenote region in the left column
  - keep last-viewed episode visible on mouse leave
- Mobile behavior:
  - show inline episode detail below the chart
  - update in place when another point is tapped
  - collapse on background dismissal where practical
- Support the same information architecture on hover, focus, and tap:
  - season/episode number
  - title
  - rating
  - air date
  - synopsis

### Exit criteria

- no floating tooltip remains as the primary detail surface
- desktop and mobile each have an appropriate detail presentation
- selected detail persists long enough to be read

## Phase 7: Results page composition

**Goal:** make the results page read like a composed analytical page rather than a stacked app panel.

### Tasks

- Rebuild `src/pages/results.js` markup to match the desktop two-column composition:
  - poster, title, metadata, synopsis, sidenote on the left
  - sparkline and main chart on the right
- Add responsive mobile composition:
  - poster/title/meta block at top
  - synopsis
  - sparkline
  - chart with sticky Y-axis / scrollable body treatment if needed
  - inline episode detail below
- Keep provider comparison visible and useful without turning into badge clutter
- Reconcile debug placement with the new layout so it stays informative but visually secondary
- Update page title and route presentation as needed

### Exit criteria

- results page structure matches the redesign on desktop and mobile
- poster and metadata support the reading flow instead of dominating it
- chart detail and context feel like one composition

## Phase 8: Interaction, accessibility, and polish

**Goal:** finish the redesign to a quality level that will support future iteration cleanly.

### Tasks

- Keyboard interaction:
  - tab through data points
  - arrow-key navigation between adjacent points
  - escape to clear focus/selection
- Mobile polish:
  - ensure touch targets are usable
  - verify viewport manipulation is stable
  - verify sticky/reference elements stay aligned
- Reduced-motion handling for transitions
- Contrast and theme verification in both themes
- Opportunistic debug improvements if the new chart state would materially help inspection:
  - current theme/palette
  - viewport extent
  - selected episode
  - provider disagreement or mismatch summaries
- Final cleanup:
  - remove dead CSS
  - remove dead chart helper code
  - verify naming matches the redesign architecture

### Exit criteria

- desktop hover/focus and mobile tap behavior are coherent
- the chart is keyboard navigable
- theme/palette/debug state are inspectable
- the codebase is cleaner after the redesign, not just differently styled

## Validation checklist

Before considering the redesign complete:

1. `npm test` passes
2. `npm run lint` passes
3. `npm run build` passes
4. bundle size remains comfortably under the project budget
5. no tooltip-first interaction remains in the chart flow
6. both themes and all three season palettes work
7. dense shows are navigable without compressing the chart into noise
8. search and results feel like one product language

## Implementation notes

- `docs/redesign.md` is the product spec; this file is the work sequence.
- Where the redesign and the current code disagree, the redesign wins.
- If an implementation detail in the current app fights the target architecture, replace it instead of layering around it.
- Prefer rewriting chart modules cleanly over preserving partial abstractions that were built for the old presentation.
