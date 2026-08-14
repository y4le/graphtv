# GraphTV Remaining Redesign Spec

This document now contains only the redesign items that are still incomplete. Completed foundation work has been removed.

## Completed

These redesign goals are already implemented:

- Tufte-inspired search page and results-page visual language
- light and dark themes
- season palettes: monotone, alternating, rainbow, zigzag, maximin
- system-font typography
- desktop two-column results composition
- sparkline minimap + viewport-based main chart
- range-frame Y-axis
- integrated bottom season axis with responsive labels
- macro and micro trendlines
- desktop sidenote and mobile inline detail replacing floating tooltips

## Remaining redesign work

## 1. Keyboard Navigation

Keyboard behavior is specified in [docs/keyboard.md](/Users/yale/dev/graphtv/docs/keyboard.md). The remaining redesign requirement is to implement that spec fully.

Required outcomes:

- results-page normal-mode navigation targets chart state directly
- vim and conventional keybindings both work
- page-level shortcuts suspend while focus is inside native interactive controls
- `gg` chord handling works without delaying non-chord keys
- search results are keyboard navigable with clamped list boundaries
- viewport auto-follows keyboard navigation on the chart

## 2. View Options Overlay

Theme and palette controls should no longer live as always-visible masthead controls. The remaining design is an overlay opened by `v`.

Required outcomes:

- compact view options overlay
- theme, palette, and episode-density selection inside the overlay
- direct click support
- keyboard navigation inside the overlay
- instant application and persistence to `localStorage`

## 3. Help And Debug Overlay Behavior

The help overlay and debug surface still need to match the overlay model.

Required outcomes:

- `?` and `F1` open a context-sensitive help overlay
- debug is keyboard-operable and behaves coherently with the overlay system
- overlays trap focus
- overlays restore focus on close
- overlays close on `Escape`, `q`, toggle key, or outside click

## 4. Mobile Sticky-Axis Fallback

The mobile chart still needs the true sticky-axis plus horizontally scrollable body fallback described in the original redesign.

Required outcomes:

- fixed Y-axis container
- separate horizontally scrollable chart body
- body scrolling synced with viewport state
- body scrolling synced with sparkline state
- no circular update loops
- subtle overflow cue if needed

## 5. Final Visual Polish

The remaining visual details are small but real.

Required outcomes:

- remove the chart background fill so the chart sits directly on the page canvas
- add reduced-motion handling for chart and overlay transitions
- ensure focus indicators are clear and intentional in both themes
- remove dead CSS and leftover pre-redesign presentation code

## Definition of done

The redesign is complete when:

1. [docs/keyboard.md](/Users/yale/dev/graphtv/docs/keyboard.md) is implemented in substance, not partially
2. theme, palette, and episode-density controls live in the view options overlay instead of the masthead
3. help/debug/view overlays all trap focus and close consistently
4. mobile sticky-axis scrolling fallback is real, not nominal
5. the chart no longer paints a boxed background behind itself
