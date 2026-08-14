# GraphTV Execution Plan

Updated March 12, 2026. This plan now contains only the remaining redesign work.

## Already complete

These items are implemented and are no longer open work:

- bundled Vite app scaffold with linting, tests, and bundle-size reporting
- provider/data layer rewrite
- Tufte-inspired search page
- tokenized light/dark theme system and season palettes
- results-page two-column composition
- sparkline + viewport-based chart architecture
- range-frame Y-axis and macro/micro trendlines
- desktop sidenote and mobile inline detail replacing tooltip-first behavior

## Remaining work

The redesign is not complete yet. The remaining gaps are:

- full keyboard system from `docs/keyboard.md`
- view options panel as an overlay instead of always-visible masthead controls
- help overlay and keyboard-operable debug overlay behavior
- overlay focus trapping, restoration, and close behavior
- mobile sticky-axis plus real horizontally scrollable chart-body fallback
- removal of the chart background fill so the chart fully sits on the page canvas
- reduced-motion handling for chart/overlay transitions
- focus indicators and keyboard polish across results and chart interactions
- opportunistic debug improvements for viewport/selection/theme state
- cleanup of dead CSS and old presentation leftovers

## Commit slices

Use focused commits. The remaining work should land roughly in these slices:

1. keyboard infrastructure and mode system
2. results/search keyboard navigation and chart keyboard routing
3. help overlay, view options overlay, and overlay focus trapping
4. mobile chart-body scrolling and sticky-axis fallback
5. visual polish, reduced motion, debug improvements, and cleanup

If one slice grows too large, split it.

## Phase 1: Keyboard Infrastructure

**Goal:** build the shared keyboard system and mode model from `docs/keyboard.md`.

### Tasks

- Add a centralized `keydown` listener
- Implement mode detection:
  - normal
  - insert
  - overlay
- Implement native-control suppression so page-level single-letter shortcuts do not fire while focus is inside:
  - links
  - buttons
  - selects
  - summaries
  - editable fields
  - trapped overlays
- Implement data-driven chord handling for `gg`
- Ensure unhandled keys fall through to browser defaults

### Exit criteria

- one keyboard dispatch path exists for the app
- `gg` chord handling works without delaying non-chord keys
- native interactive controls do not get hijacked by page-level shortcuts

## Phase 2: Search And Results Keyboard Navigation

**Goal:** implement keyboard navigation on real page surfaces.

### Tasks

- Search page:
  - `j`/`k` and `ArrowUp`/`ArrowDown` move through results
  - `l`/`Enter` opens the active result
  - `gg`/`G` and `Home`/`End` jump to first/last result
  - navigation clamps at the list ends
- Results page:
  - normal-mode navigation routes directly to chart state
  - `h`/`l` or `ArrowLeft`/`ArrowRight` move by episode
  - `j`/`k` or `ArrowUp`/`ArrowDown` move by season
  - `gg`/`G` and `Home`/`End` jump to the first/last episode
  - viewport auto-follows keyboard navigation
- Global commands:
  - `/` focuses search
  - `q` returns to search from results
  - `D` toggles debug
  - `?` and `F1` open help

### Exit criteria

- mouse-equivalent navigation exists on both pages
- results-page keyboard navigation works without tabbing into the chart
- viewport follows keyboard movement predictably

## Phase 3: Overlay System

**Goal:** implement the remaining overlay-based UI instead of inline controls.

### Tasks

- Replace always-visible masthead theme/palette controls with a view options overlay
- Build the help overlay
- Update debug presentation so it behaves as an overlay in keyboard mode
- For all overlays:
  - trap focus
  - restore focus on close
  - close on `Escape`, `q`, toggle key, or outside click
  - support `j`/`k` and arrow-key internal navigation where applicable
- View options overlay:
  - theme toggle
  - palette cycling/selection
  - direct click support
  - instant persistence to `localStorage`

### Exit criteria

- help, view options, and debug all behave like coherent overlays
- overlays are fully keyboard operable
- inline masthead controls are gone

## Phase 4: Mobile Chart Fallback

**Goal:** finish the mobile chart behavior described in the redesign.

### Tasks

- Implement a real horizontally scrollable chart-body fallback on mobile
- Keep the Y-axis visually sticky and aligned with the body
- Sync body scrolling with viewport state and sparkline state
- Avoid circular update loops between:
  - body scroll
  - viewport updates
  - sparkline brush updates
- Add any subtle overflow affordance needed to show there is more chart off-screen

### Exit criteria

- mobile chart-body scrolling actually works
- Y-axis remains aligned and fixed
- sparkline and body scroll stay in sync

## Phase 5: Visual And Interaction Polish

**Goal:** finish the remaining redesign and cleanup items.

### Tasks

- Remove the chart background fill so the chart truly floats on the page canvas
- Add reduced-motion handling for chart/overlay transitions
- Improve focus indicators in both themes
- Improve debug mode opportunistically with:
  - current theme/palette
  - viewport extent
  - selected episode
  - mismatch summaries
- Remove dead CSS and stale presentation classes left from pre-redesign structure
- Verify naming and module boundaries still match the redesign architecture

### Exit criteria

- no obvious visual remnants of the old presentation remain
- motion respects `prefers-reduced-motion`
- focus state is visible and intentional in both themes
- debug mode helps inspect the new chart state

## Validation Checklist

Before considering the redesign done:

1. `npm test` passes
2. `npm run lint` passes
3. `npm run build` passes
4. bundle size remains comfortably under budget
5. every interactive element is keyboard navigable with both vim and conventional keys
6. help, view options, and debug overlays all open, navigate, and close by keyboard
7. mobile chart-body scrolling and sticky-axis fallback work coherently
8. the chart sits on the page canvas without a boxed background
9. reduced-motion behavior is respected
10. the codebase is cleaner after the polish pass, not just more featureful
