# GraphTV Style Guide

Grounded in Edward Tufte's analytical design principles, especially *The Visual Display of Quantitative Information*, and adapted for the web rather than copied from print.

## Purpose

GraphTV should feel like an analytical document, not a dashboard. The interface should privilege evidence, comparison, and reading flow over chrome, ornament, and component theater.

This guide is the visual and interaction baseline for the rewrite. It establishes principles and constraints. `docs/redesign.md` contains the specific implementation spec — tokens, dimensions, code snippets. When they conflict, resolve the conflict; don't let them silently drift.

## Core principles

### 1. Above all else, show the data

Every meaningful screen should make the underlying evidence legible quickly. Decorative structure is not neutral; it competes with the signal.

Rules:
- Remove borders, boxes, fills, shadows, and separators unless they clarify structure or interaction.
- Prefer direct labels and spatial grouping over legends.
- Use one accent color for interaction or emphasis, not for atmosphere.
- Treat empty states, loading states, and errors as editorial content, not UI widgets.

### 2. Maximize data-ink, not visual austerity for its own sake

The goal is not "minimalism" in the abstract. The goal is to devote as much visual weight as possible to meaningful information.

Rules:
- Delete non-data ink first: decorative panels, unnecessary gridlines, ornamental gradients, oversized controls, duplicate metadata.
- Delete redundant data-ink next: repeated labels, repeated titles, duplicated values, chart keys that restate obvious grouping.
- Keep context that improves judgment: axes, units, trendlines, comparison frames, notes, and annotations when they materially help interpretation.

### 3. Preserve truthfulness

Charts should not visually exaggerate or suppress differences.

Rules:
- Keep visual encodings proportional to the underlying values.
- Avoid distorted axes, fake perspective, inflated marker sizes, and ornamental smoothing that implies false precision.
- Use interpolation and trendlines as aids, not as substitutes for the actual observations.
- Make uncertainty, incompleteness, and provider disagreement explicit when present.

### 4. Integrate text and graphics tightly

Tufte's work consistently keeps evidence adjacent to explanation. GraphTV should do the same.

Rules:
- Put narrative context, metadata, and chart interpretation beside the chart, not in separate modules far away.
- Desktop detail should live in a persistent sidenote region, not in a detached floating tooltip.
- Mobile detail should expand inline near the chart, not in a modal.
- Use the page as a reading surface: title, synopsis, chart, and notes should feel like one composition.

### 5. Prefer rich context over shallow simplification

Tufte's sparkline work argues for design minimization, not data minimization. The right move is often to add compact context, not to hide information.

Rules:
- Dense shows should use a full-series overview plus a detailed viewport.
- Provide macro and micro trend context together.
- Show cross-provider comparisons where they increase confidence or reveal disagreement.
- Use small multiples or layered context when it improves reasoning more than it costs in complexity.
- The main chart should never compress data points to the point where individual episodes are indistinguishable. When the series exceeds comfortable density, delegate the full-series view to the sparkline and show only a navigable viewport in the main chart.

### 6. The web is not print

We should borrow Tufte's methods, not imitate a book page literally.

Rules:
- Responsive behavior is part of the design, not a fallback.
- Sidenotes may collapse or move inline on small screens.
- Interactive states must be keyboard accessible and touch-appropriate.
- Sticky axes, brush navigation, hover/focus parity, and reduced-motion support are first-class concerns.
- Use motion tastefully to preserve orientation during panning, brushing, and state transitions. Respect `prefers-reduced-motion` — when active, replace animated transitions with instant state changes.

---

## Product expression

The following sections define GraphTV's visual and interaction language — how the principles above translate into concrete design decisions.

### Tone

GraphTV should feel:
- analytical
- literary
- restrained
- precise
- calm

GraphTV should not feel:
- dashboard-like
- glossy
- gamified
- neon
- card-driven
- "AI-generated"

### Typography

Typography should carry most of the visual identity.

Rules:
- Use system fonts only.
- Use the publisher signature's Geist Mono hierarchy for every text surface,
  including narrative material, controls, metadata, debug output, and chart
  labels.
- Express hierarchy through position, scale, weight, case, spacing, and color
  rather than switching font families.
- Keep heading hierarchy shallow. If content needs many heading levels, the layout is probably wrong.
- Use tabular numerals for ratings, years, counts, and aligned metadata.

Canonical stack and compatibility aliases:

```css
--font-app: "Geist Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
--font-serif: var(--font-app);
--font-sans: var(--font-app);
--font-mono: var(--font-app);
```

### Color

Color should support reading and comparison, not define the product.

Rules:
- Default to warm off-white for light theme and rich charcoal for dark theme.
- Body text should be near-black or near-white, never pure black/white.
- Reserve vivid color for interaction, focus, and selective data emphasis.
- Season colors are supplementary, not load-bearing.
- Charts must remain understandable in monotone mode.
- When multiple providers rate the same episode, make the comparison legible without requiring interaction. Disagreement should be visually distinct from consensus.

Required settings:
- Theme: `light`, `dark`. Default follows `prefers-color-scheme`. User choice persisted in `localStorage`.
- Season palette: `monotone`, `subtle`, `vivid`. User choice persisted in `localStorage`.

### Layout

Layout should behave like a page composition, not a grid of components.

Rules:
- Avoid card shells for primary content.
- Use generous whitespace and alignment to create structure instead of visible containers.
- On desktop, prefer asymmetric two-column layouts with context on the left and evidence on the right.
- On mobile, stack content in reading order and keep the chart usable with sticky reference elements where needed.
- Align poster, title, metadata, synopsis, and note regions to a shared text measure.
- Let landing-page type, artwork, and content measures grow when large displays provide meaningful extra room; avoid leaving a laptop-sized island on high-resolution viewports.

Responsive approach: fluid, not breakpoint-driven. Use relative units, flexible containers, and CSS features like `clamp()`, container queries, and flexible grids so the layout adapts continuously. Reserve breakpoints for genuine layout restructuring (e.g., collapsing two columns to one), not for adjusting spacing or type size at arbitrary thresholds.

### Charts

Charts are the product core. They should feel engineered, not skinned.

Rules:
- Remove full plot boxes and heavy grid systems.
- Use one season row inside the graph with its rule serving as the graph's bottom edge, bridging left to the Y-axis, and boundary ticks pointing upward. Show `Season N` when it fits and only `N` when space is tight. Selectable labels and season trendlines share one selection state.
- Show episode points clearly; trendlines should support interpretation without overpowering the points.
- Use a range-frame or other light reference marks instead of conventional chart scaffolding when possible.
- For dense series, pair a sparkline overview with a viewport-based detailed chart. The main chart should always render episodes at comfortable spacing — never compress the entire series into an unreadable mass.
- When showing data from multiple providers, make the comparison legible without requiring interaction. Provider disagreement should be distinguishable by position, mark shape, or secondary color — not only by hovering.
- Use motion tastefully to preserve orientation during viewport pans, brush interactions, and state transitions. When `prefers-reduced-motion` is active, replace animated transitions with instant state changes.

### Interaction

Interaction should reveal detail without breaking reading flow.

Rules:
- Hover, focus, and tap should reveal the same underlying information.
- Desktop detail belongs in a sidenote region adjacent to the chart.
- Mobile detail belongs inline below the chart.
- Keep the last meaningful detail visible until replaced or cleared.
- Full keyboard navigation with simultaneous vim and conventional key support. See `docs/keyboard.md` for the complete specification.
- Results-page keyboard navigation should target chart state directly in normal mode; chart interaction should not depend on tabbing into a dense point cloud first.
- Global single-letter shortcuts should suspend when focus is inside native interactive controls or trapped overlays.
- Avoid floating tooltip systems as the primary information surface.
- Animated transitions should be tasteful and functional — they orient the user during state changes (viewport pans, detail swaps, theme switches), not decorate. When `prefers-reduced-motion` is active, all animated transitions become instant.

### Loading and empty states

Loading and empty states are editorial content, not UI widgets. They should match the typographic and tonal quality of the rest of the app.

Rules:
- Prefer text-based loading indicators over animated spinners. State the action in progress: "Searching..." or "Loading seasons..." in the shared app face and secondary color.
- Add a subtle pulse or shimmer to loading text so the interface does not appear frozen. The effect should be gentle — the page breathing, not blinking. A slow opacity oscillation or a soft luminance sweep across the text.
- Empty states should be specific: "No shows found for 'query'" rather than a generic empty illustration.
- Error states should say what failed, what data is still available, and what the user can do next.
- When `prefers-reduced-motion` is active, replace the pulse or shimmer with a static ellipsis or a non-animated indicator.

### Content style

The copy should match the visual system.

Rules:
- Use short declarative labels.
- Prefer specific metadata over marketing language.
- Avoid hype, jokes, and anthropomorphic UI text.

### Accessibility

Analytical restraint is not enough; the interface must stay operable and legible.

Rules:
- Meet contrast requirements in both themes.
- Do not rely on color alone for season identification or provider disagreement cues.
- Ensure all interactive chart points are focusable.
- Respect `prefers-reduced-motion`: all animated transitions become instant when active.
- Make mobile interactions viable without hover.
- Preserve readable type sizes and line lengths.

### Debug mode

Debug mode is a first-class feature, not an afterthought. It may be denser and more utilitarian than the product surface, but it should not feel like a different app.

Rules:
- Preserve the shared monospaced alignment for data dumps, identifiers, and raw values.
- Use flat structure — dense, scannable, and copy-pasteable. No collapsible trees or nested modals.
- Debug UI should be visually distinct enough that it's clearly not part of the product surface — a gated overlay or panel with a subtle background tint.
- Keep the same Tufte restraint: no decorative chrome, no gratuitous styling. Factual and inspectable.
- Debug content is lazy-loaded and excluded from the production-critical path.

---

## GraphTV-specific design rules

These are the practical rules to enforce during implementation and review.

### Allowed

- subtle background tone shifts
- sparse reference lines
- direct labels near data
- asymmetry in layout
- dense information if it remains legible
- inline notes, sidenotes, and marginal annotations
- compact controls for theme, palette, and debug state

### Discouraged

- cards around search results
- boxed chart panels
- legends that duplicate visible grouping
- persistent decorative gradients
- heavy drop shadows
- glassmorphism
- oversized pills and badges
- animated flourish that does not improve orientation

### Forbidden by default

- 3D chart effects
- ornamental illustrations inside charts
- pure-black-on-pure-white or pure-white-on-pure-black page themes
- hidden data behind hover-only interaction
- rainbow color use without a specific interpretive purpose
- component-library aesthetics overriding the document feel

---

## Review checklist

Before shipping a screen, ask:

1. Does the visual weight fall mostly on data and meaning, or on interface scaffolding?
2. Can the user understand the chart without consulting a legend or floating tooltip?
3. Is the chart truthful in proportion, scale, and emphasis?
4. Does the layout read naturally as a document on desktop and mobile?
5. Does interaction preserve context instead of interrupting it?
6. Would this still feel intentional in monotone and without animation?
7. Is the design using Tufte-inspired methods appropriately for the web, rather than imitating print literally?

---

## Sources

- Edward Tufte, *The Visual Display of Quantitative Information* (Graphics Press, 1983; 2nd ed. 2001)
- Edward Tufte, "Sparkline theory and practice"
  https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
- Tufte CSS project documentation
  https://edwardtufte.github.io/tufte-css/
- IEEE Spectrum, "Tufte-isms"
  https://spectrum.ieee.org/tufteisms
- data.europa.eu, "Chart junk and data ink: origins"
  https://data.europa.eu/apps/data-visualisation-guide/chart-junk-and-data-ink-origins
