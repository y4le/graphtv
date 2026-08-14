# GraphTV Redesign Record

Updated August 14, 2026. This is a record of the redesign decisions now represented in the application, not a backlog.

## Implemented experience

- Tufte-inspired search and results pages with light, dark, and system themes
- season palettes and configurable episode density
- a two-column desktop composition with responsive mobile layout
- one viewport-driven ratings chart with integrated season axis, range-frame Y-axis, full-show and season trendlines, source-spread marks, and breakpoint analysis
- a sparkline minimap that stays synchronized with chart navigation
- desktop sidenotes and mobile inline episode detail
- centralized keyboard navigation documented in [keyboard.md](keyboard.md)
- help, credits, debug, and view-options dialogs with focus trapping, restoration, outside-click closing, and reduced-motion behavior
- explicit focus styles in both themes

## Decisions that superseded the original plan

The early redesign proposed a second mobile renderer with a sticky Y-axis and a horizontally scrolling chart body. That path was never reachable in the finished UI and duplicated viewport, selection, and synchronization logic. It has been removed. Mobile now uses the same bounded viewport model as desktop, with touch/pointer panning and the sparkline as the overview control.

The original draft used `v` for view options. The shipped keyboard system uses `o`, matching the visible “Options (o)” controls and [keyboard reference](keyboard.md).

Theme and palette values are CSS-owned. JavaScript owns persisted settings and state transitions; it reads resolved CSS colors only for SVG attributes that cannot reliably consume CSS custom-property expressions.

## Design invariants

1. The primary-provider result becomes useful before supplemental providers finish.
2. A chart update preserves selection and viewport when the underlying episode identity remains valid.
3. Wrong cross-provider data is worse than missing data.
4. Keyboard, pointer, and touch input operate on the same chart state.
5. Overlays isolate background interaction and restore the user’s prior focus.
6. Motion is optional; meaning never depends on animation.
7. Mobile and desktop share model and rendering code unless a measured constraint proves they cannot.
8. Debug surfaces expose diagnostics without becoming part of the primary product surface.

For module ownership, operational constraints, and verification commands, see [execution_plan.md](execution_plan.md).
