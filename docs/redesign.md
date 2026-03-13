# GraphTV Design Specification

Tufte-inspired analytical visualization. Based on a design consultation, with implementation research and decisions documented March 12, 2026.

## Design philosophy

The interface transitions from a heavy, container-based dashboard to an elegant, high-data-ink analytical document inspired by Tufte's *The Visual Display of Quantitative Information*. Every visual element should either communicate data or provide essential context. No chrome, no bounding boxes, no decorative containers.

The aesthetic applies to the entire app — search, results, and any future pages share the same typographic, minimal language.

## Decisions

| Question | Decision |
|---|---|
| Theme | Both light and dark from the start. Build a theme system. |
| Season colors | Support multiple palettes: monotone, subtle, vivid. User-selectable. |
| Fonts | System font stacks only. Zero font downloads. Stays within bundle budget. |
| Search page | Same Tufte aesthetic. Unified feel across the whole app. |
| Dense shows | Sparkline minimap for navigation. Main chart shows a viewport; sparkline shows the full series. |

---

## 1. Color and theming

The app ships with a theme system from day one. Two built-in themes; the architecture supports adding more.

### Light theme (default)

Inspired by a printed academic journal.

| Token | Value | Usage |
|---|---|---|
| `canvas` | `#FDFCF8` | Page background — warm off-white to reduce eye strain |
| `canvasSubtle` | `#F5F3EE` | Slight contrast areas (search input background, card-less zones) |
| `textPrimary` | `#1A1A1A` | Titles, body text, data points |
| `textSecondary` | `#737373` | Axes, metadata, secondary labels |
| `trendMacro` | `#D1D1D1` | Whole-show trendline |
| `trendMicro` | `#A3A3A3` | Per-season trendlines |
| `spotColor` | `#A63A28` | Interaction highlight — muted brick red |
| `spotColorMuted` | `#C47A6F` | Lighter variant for secondary highlights |

### Dark theme

The same Tufte principles — minimal ink, maximum data — adapted for dark backgrounds.

| Token | Value | Usage |
|---|---|---|
| `canvas` | `#1A1A1A` | Page background — rich charcoal |
| `canvasSubtle` | `#242424` | Subtle contrast areas |
| `textPrimary` | `#E8E6E1` | Titles, body text, data points |
| `textSecondary` | `#8C8C8C` | Axes, metadata, secondary labels |
| `trendMacro` | `#3D3D3D` | Whole-show trendline |
| `trendMicro` | `#5C5C5C` | Per-season trendlines |
| `spotColor` | `#D4594A` | Interaction highlight — slightly brighter red for contrast |
| `spotColorMuted` | `#A6534A` | Lighter variant |

### Theme implementation

All colors are referenced by token name, never by literal value. The theme lives in `viz/theme.js` and is applied via CSS custom properties on `:root` (or a `[data-theme]` attribute). Switching themes updates the custom properties; no component code changes.

```css
:root[data-theme="light"] {
  --canvas: #FDFCF8;
  --text-primary: #1A1A1A;
  /* ... */
}
:root[data-theme="dark"] {
  --canvas: #1A1A1A;
  --text-primary: #E8E6E1;
  /* ... */
}
```

Default theme follows `prefers-color-scheme` if no explicit choice is stored. User choice persisted in `localStorage`.

---

## 2. Season color palettes

Three built-in palettes. The chart can switch between them without re-fetching data.

### Monotone (Tufte purist)

All episodes rendered in `textPrimary`. No color differentiation between seasons. Seasons distinguished by text labels and spatial grouping only.

Best for: clean screenshots, small season counts, accessibility (no color dependence).

### Subtle (default)

Low-saturation, muted tones per season. Colors are distinguishable but do not shout. No legend needed — the spatial grouping and optional labels carry the primary information, with color as a secondary channel.

Palette generation: evenly spaced hues at low saturation (S ~25-35%) and moderate lightness, adjusted per theme (lighter tones for dark theme, darker tones for light theme). For high season counts (10+), hues cycle but saturation/lightness shift slightly to maintain differentiation.

### Vivid

Higher saturation, closer to the current GraphTV rainbow. Useful for at-a-glance season identification on dense shows. Still no legend — colors are supplementary, not load-bearing.

### Implementation

The active palette is a setting stored alongside the theme. `viz/theme.js` exports a function `seasonColor(paletteId, seasonIndex, totalSeasons) → color` that returns the appropriate CSS color.

---

## 3. Typography

System font stacks only. Zero font downloads, zero impact on bundle budget.

### Serif stack (narrative: titles, descriptions, annotations, season labels)

```css
font-family: 'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif;
```

Rationale: Iowan Old Style (macOS) and Palatino Linotype (Windows) are high-quality old-style serifs with a warm, bookish feel close to Garamond. URW Palladio L and P052 cover Linux. Falls back to the generic `serif` keyword on Android (Noto Serif).

### Sans-serif stack (quantitative: ratings, dates, episode numbers, UI controls)

```css
font-family: Inter, Roboto, 'Helvetica Neue', 'Arial Nova', 'Nimbus Sans', Arial, sans-serif;
```

Rationale: Inter is installed on many modern systems and is the best free neo-grotesque. Roboto covers Android. Helvetica Neue covers macOS. Arial Nova and Arial cover Windows. Nimbus Sans covers Linux.

### Usage rules

- **Show title**: serif, large (2rem desktop / 1.5rem mobile)
- **Plot synopsis / descriptions**: serif, body size (1rem)
- **Season labels on chart**: serif, small (0.75rem)
- **Ratings, dates, episode numbers**: sans-serif, tabular numerals where supported (`font-variant-numeric: tabular-nums`)
- **Search input, buttons, metadata badges**: sans-serif, body size
- **Sidenote episode title**: serif, medium (1.1rem)
- **Sidenote rating value**: sans-serif, in `spotColor`, slightly larger (1.2rem)

---

## 4. Layout architecture

The layout uses an invisible typographic grid. No cards, no bounding boxes, no visible containers.

### Desktop / widescreen (>768px)

Asymmetric two-column grid.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌─── Left (30%) ───┐  ┌──── Right (70%) ──────────┐   │
│  │                   │  │                            │   │
│  │  [poster thumb]   │  │  Sparkline minimap         │   │
│  │  Show Title       │  │  ·····[▓▓▓▓]·········     │   │
│  │  Year · Genre     │  │                            │   │
│  │                   │  │  Main chart (viewport)     │   │
│  │  Plot synopsis    │  │    Episode dots            │   │
│  │  paragraph...     │  │    Trendlines              │   │
│  │                   │  │    Range-frame axes        │   │
│  │  ── sidenote ──   │  │                            │   │
│  │  (populated on    │  │                            │   │
│  │   hover/click)    │  │                            │   │
│  │                   │  │                            │   │
│  └───────────────────┘  └────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Left column (context):**
- Thumbnail-sized poster image, aligned with the text block (~120px wide, crisp)
- Show title (large serif)
- Metadata line: year, genres (sans-serif, secondary color)
- Plot synopsis paragraph (serif, body)
- Below: the sidenote container (initially empty, populated on chart interaction)

**Right column (data):**
- Sparkline minimap at the top (full series overview with a viewport window)
- Main chart below, showing the episodes within the current viewport
- No borders, no background fill — the chart floats on the page canvas

### Mobile / portrait (<768px)

Single-column stacked flow.

```
┌──────────────────────┐
│ [poster] Title       │
│          Year Genre  │
│                      │
│ Plot synopsis...     │
│                      │
│ ┌──────────────────┐ │
│ │ Sparkline minimap│ │
│ │ ···[▓▓▓]·······  │ │
│ ├──────────────────┤ │
│ │ Y  Chart body    │ │
│ │ a  (viewport)    │ │
│ │ x                │ │
│ │ i                │ │
│ │ s                │ │
│ └──────────────────┘ │
│                      │
│ Episode detail       │
│ (inline expansion)   │
│                      │
└──────────────────────┘
```

**Order:** Poster thumbnail (top-left, ~80px) floated beside title and metadata → plot synopsis → sparkline minimap → main chart → inline episode detail.

**Viewport navigation:** The sparkline minimap shows the full series and a draggable viewport window. Swiping on the sparkline or dragging the window moves the main chart viewport. The main chart body may also use `overflow-x: auto` as a secondary scroll mechanism on touch, synced with the sparkline window position.

**Sticky Y-axis:** On mobile, the Y-axis is separated into a fixed-width container alongside the scrollable chart body (the "separate containers" approach — see implementation notes below). The Y-axis never scrolls horizontally.

**Inline expansion:** On mobile, tapping an episode point expands the detail block below the chart (no sidenote column available). Tapping a different point updates it. Tapping background collapses it.

---

## 5. Chart anatomy

All gridlines, bounding boxes, and background fills are removed to maximize the data-ink ratio.

The chart has two layers: a **sparkline minimap** showing the full series, and a **main chart** showing the current viewport in detail.

### Sparkline minimap

A high-density, wordless miniature of the entire series. It sits above the main chart and spans the full available width.

**Design:**
- A thin, continuous line connecting all episode ratings (1px, `trendMicro` color), with tiny dots at each episode (1.5px radius, `textPrimary`)
- No axes, no labels, no trendlines — pure data silhouette
- Height: ~40px desktop, ~30px mobile. Tall enough to see the shape, short enough to not compete with the main chart.
- A semi-transparent **viewport window** (a filled rectangle in `spotColor` at ~10% opacity, with `spotColor` left/right border lines at ~40% opacity) highlights the portion of the series currently shown in the main chart

**Function:**
- Provides immediate macro context: "this show started strong, dipped in the middle, recovered at the end" — before the user reads a single data point
- Acts as a navigation scrubber: clicking or tapping a position on the sparkline centers the main chart viewport there
- The viewport window is draggable (mouse drag on desktop, touch drag on mobile)
- As the window moves, the main chart viewport updates smoothly (animated pan)

**Adaptive behavior:**
- For short shows (≤ ~40 episodes / ~3 seasons): the main chart shows all episodes at once. The sparkline is still rendered for visual consistency but the viewport window spans the full width (effectively no scrolling). The sparkline remains useful as a macro context element.
- For long shows (40+ episodes): the main chart viewport shows a comfortable window (enough horizontal space that labels fit and dots don't overlap — roughly 6-10 seasons depending on episode count). The sparkline becomes essential for navigation.
- The viewport window has a minimum width (~15% of the sparkline) so it's always grabbable, even for very long shows.

**D3 implementation:**
- The sparkline is a separate SVG element above the main chart SVG
- The viewport window maps to `d3-brush` with `brushX()` — D3's brush provides the drag/resize/click behavior out of the box
- Brush `on("brush", ...)` events update the main chart's x-scale domain, triggering a re-render of the visible portion
- The brush extent is constrained to the sparkline's full episode range

```javascript
const brush = d3.brushX()
  .extent([[0, 0], [sparklineWidth, sparklineHeight]])
  .on('brush end', ({ selection }) => {
    if (!selection) return;
    const [x0, x1] = selection.map(sparklineXScale.invert);
    updateMainChartViewport(x0, x1);
  });

sparklineSvg.append('g')
  .attr('class', 'viewport-brush')
  .call(brush)
  .call(brush.move, defaultViewportExtent);
```

Style the brush to match the design: remove the default dark overlay, apply the `spotColor` translucent fill and border lines to the selection rect, hide the resize handles for a cleaner look (or keep them subtle).

### Axes: the range frame

Following Tufte's range frame concept, axes encode data rather than just providing a coordinate reference.

**Y-axis (rating):**
- The axis line is drawn **only from the lowest data point's rating to the highest** — e.g., a vertical line segment from 7.2 to 9.4
- Endpoint labels show the exact data min and max (e.g., "7.2" and "9.4"), formatted to one decimal
- A few interior ticks at round numbers (e.g., 8.0, 9.0) are permitted if they fall within the data range, but only if they maintain at least ~20px distance from the endpoints to avoid label collision
- No tick marks protruding from the axis line — labels sit beside the line directly
- Color: `textSecondary`

**X-axis (episodes/time):**
- No continuous horizontal axis line
- Season labels ("Season 1", "Season 2", ...) sit directly above or below each season's cluster of data points, in serif at a small size
- No per-episode labels on the axis — the episode number is communicated through the sidenote/tooltip on interaction

**No grid lines.** The data points and range frame provide sufficient reference.

### D3 implementation of range frame

```javascript
// Set scale domain to data extents, not 0-10
const yScale = d3.scaleLinear()
  .domain([dataMin, dataMax])
  .range([chartHeight, 0]);

// Use tickValues for endpoints + filtered interior ticks
const interior = yScale.ticks(5).filter(t => t > dataMin && t < dataMax);
const allTicks = [dataMin, ...interior, dataMax];

const yAxis = d3.axisLeft(yScale)
  .tickValues(allTicks)
  .tickSizeOuter(0)
  .tickSizeInner(0)
  .tickFormat(d3.format('.1f'));

// After rendering: replace the domain path with a range-frame line
axisGroup.select('.domain').remove();
axisGroup.append('line')
  .attr('y1', yScale(dataMin))
  .attr('y2', yScale(dataMax))
  .attr('stroke', 'var(--text-secondary)');
```

Filter interior ticks that are too close to the endpoints (< 20px) to prevent label overlap.

### Data points (episodes)

- Small, crisp circles: **3px radius**, no outlines/strokes
- Color: from the active season palette (monotone: `textPrimary`; subtle/vivid: per-season color)
- Positioned by absolute episode index (x) and rating (y)
- Episodes with `null` ratings are omitted, not plotted at zero

### Trendlines

Two layers, both behind the data points:

**Macro trendline (entire show):**
- 1px dashed line in `trendMacro` color
- Spans the full chart width
- Computed from all episodes with non-null ratings
- Sits behind everything else (lowest z-order in SVG)

**Micro trendlines (per-season):**
- 1px solid line in `trendMicro` color
- Each spans only the x-range of its season
- Sit behind data points but in front of the macro line
- Seasons with 0 or 1 rated episodes get no trendline

**Season labels:**
- Positioned directly above or below each season's cluster
- Serif, small (0.75rem), `textSecondary` color
- No color-coded legend — labels are the primary season identifier

### Responsive sizing

- Sparkline height: ~40px desktop, ~30px mobile
- Main chart height: ~400px desktop, ~250px mobile
- Chart width fills the available right column (desktop) or full viewport minus Y-axis (mobile)
- Data point radius does not change with chart size — 3px is a fixed minimum for touch targets
- The main chart always renders only the episodes within the current viewport at comfortable spacing — it never compresses dots to fit the full series. The sparkline handles the full-series view.

---

## 6. Interaction design

Interactions are informational, not decorative. No obstructive tooltips — the user reads the chart and the annotation simultaneously.

### Sparkline navigation

The sparkline minimap supports three interaction modes:

**Click/tap to jump:** Clicking or tapping a position on the sparkline centers the main chart viewport on that part of the series. The transition is a smooth animated pan (~300ms).

**Drag the viewport window:** The highlighted viewport rectangle is draggable. Dragging it pans the main chart in real time (no animation delay — direct 1:1 tracking). On mobile, this is a horizontal swipe gesture on the sparkline.

**Resize the viewport window (optional, desktop only):** Dragging the left or right edge of the viewport window zooms in or out — a narrower window shows fewer seasons at larger spacing, a wider window shows more seasons compressed. This is the `d3-brush` resize behavior. On mobile, resizing is omitted to keep touch targets simple; the viewport width is fixed.

**Visual feedback:** The viewport window is always visible. When being dragged, the border lines increase from ~40% to ~70% opacity. The sparkline dots within the viewport window may optionally render at slightly higher contrast than dots outside it.

### Hover state (desktop)

When the cursor enters a data point:

1. **Point highlight:** The hovered point changes to `spotColor` and grows from 3px to 4.5px radius (smooth transition, ~150ms)
2. **Crosshairs:** Hairline (0.5px) dashed lines in `textSecondary` extend from the point horizontally to the Y-axis and vertically down to the X-axis region. These help the eye connect the point to its exact rating value.
3. **Sidenote population:** The sidenote area in the left column instantly populates with:
   - Season and episode number (sans-serif, secondary)
   - Episode title (serif, medium)
   - Rating value (sans-serif, `spotColor`, slightly larger)
   - Air date (sans-serif, secondary)
   - Plot synopsis paragraph (serif, body)
4. **No tooltip.** The sidenote replaces the tooltip. The user's eye moves between chart and sidenote without a floating element blocking the data.

When the cursor leaves all data points:
- Point returns to default size and color (smooth transition)
- Crosshairs fade out
- Sidenote persists showing the last-hovered episode (does not clear — Tufte principle: don't erase information)

### Touch state (mobile)

1. **Tap a data point:** Same visual changes as desktop hover — point highlights in `spotColor`, crosshairs appear
2. **Inline expansion:** The episode detail block expands below the chart, pushing page content down. Contains the same information as the desktop sidenote.
3. **Tap a different point:** The detail block updates in place (smooth crossfade)
4. **Tap background:** The detail block collapses and the point returns to default

### Keyboard accessibility

- Tab through data points in episode order
- Focused point shows the same highlight + sidenote/inline detail as hover
- Arrow keys move between adjacent points
- Escape clears focus

---

## 7. Search page

The search page shares the Tufte aesthetic. It is the opening page of the same "document."

### Layout

- Centered single-column, maximum width ~600px
- App title at top: "GraphTV" in serif, large
- Subtitle or tagline (optional): serif, secondary color, small
- Search input: minimal border (1px `textSecondary`), no rounded corners, serif placeholder text, background `canvasSubtle`
- Submit button: text-only ("Search" in sans-serif), no background fill, underlined or subtle border on hover

### Results list

- Each result: show title (serif, body), year (sans-serif, secondary), on a single line
- Poster thumbnails are small (~40px) and optional — omit if they slow down the feel
- No cards, no background highlights — results are a typographic list
- Hover/active state: `spotColor` on the title text
- Loading state: small serif text ("Searching..." in secondary color), not a spinner
- Empty state: "No shows found for '[query]'" in serif, secondary
- Error state: brief serif message with a retry link

### Transition to results

Navigating to a result is a page navigation (URL change). No animated transition between search and results — the document simply changes.

---

## 8. Chart container structure

The sparkline minimap and the main chart are separate SVG elements, both managed by `viz/ratingsChart.js`.

### Desktop structure

```html
<div class="chart-container">
  <svg class="sparkline"><!-- full series minimap + brush --></svg>
  <svg class="main-chart"><!-- viewport: axes, dots, trendlines, crosshairs --></svg>
</div>
```

On desktop, neither SVG scrolls. The sparkline brush controls which portion of the data the main chart renders. The main chart re-renders its content when the viewport changes (D3 update pattern).

### Mobile structure (sticky Y-axis)

On mobile, the main chart may need a fixed Y-axis alongside a scrollable chart body as a secondary navigation mechanism (in addition to the sparkline).

```html
<div class="chart-container">
  <svg class="sparkline"><!-- full series minimap + brush --></svg>
  <div class="main-chart-wrapper" style="display: flex;">
    <div class="y-axis-container" style="flex-shrink: 0; width: 45px;">
      <svg><!-- Y-axis range frame only --></svg>
    </div>
    <div class="chart-body" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
      <svg width="{dynamic}"><!-- dots, trendlines, x-labels --></svg>
    </div>
  </div>
</div>
```

The Y-axis container never scrolls. The chart body can scroll horizontally as a complement to the sparkline navigation. Scrolling the chart body syncs the sparkline viewport window position, and vice versa.

**Alignment:** Both the Y-axis SVG and chart body SVG share the same `yScale` and vertical margins. Heights match exactly.

**Sync behavior:** When the user swipes the chart body directly, the sparkline viewport window updates to reflect the new position. When the user drags the sparkline viewport, the chart body scroll position updates. Both are driven by the same underlying viewport state.

**Gotchas to handle:**
- Vertical alignment between the two SVGs must be pixel-exact — use the same margin constants
- The chart body should show a subtle fade on the right edge when content overflows, hinting at more data
- Avoid circular event loops: sparkline brush update → chart scroll update → sparkline brush update. Gate updates with a "source" flag.

---

## 9. Module mapping

How the design maps to the planned `viz/` module structure from the execution plan:

| Design concept | Module | Notes |
|---|---|---|
| Color tokens, font stacks, palette generation | `viz/theme.js` | Exports CSS custom properties, `seasonColor()`, theme switching |
| Sparkline minimap + viewport brush | `viz/sparkline.js` | Owns the sparkline SVG, `d3-brush` setup, viewport state. Emits viewport change events. |
| Range frame axes | `viz/marks.js` | Custom axis rendering replacing default D3 axis |
| Episode dots, trendlines, season labels, crosshairs | `viz/marks.js` | SVG groups layered in correct z-order |
| Scale computation (data-extent domain, not 0-10) | `viz/scales.js` | Range frame requires `domain([dataMin, dataMax])`. Also computes sparkline scales. |
| Sidenote population (desktop) | `viz/sidenote.js` | Targets the left-column sidenote container instead of a floating tooltip |
| Inline expansion (mobile) | `viz/sidenote.js` | Same module, different target container based on viewport |
| Chart SVG scene, resize, viewport sync | `viz/ratingsChart.js` | Owns the container, sparkline, main chart, and `ResizeObserver`. Coordinates viewport state between sparkline brush and main chart rendering. |
| Two-column layout, search page, result list | `pages/` + `css/styles.css` | Page layout is CSS; page logic is in page modules |

**Notes:**
- The execution plan called the interaction module `viz/tooltip.js`. Given the Tufte sidenote pattern, `viz/sidenote.js` is a better name. It handles both the desktop sidenote and the mobile inline expansion.
- `viz/sparkline.js` is a new module not in the original execution plan. It adds `d3-brush` to the D3 module list (already noted as acceptable if it provides significant functionality — the sparkline navigation is a core feature, not a nice-to-have).

---

## 10. Design tokens summary

All values referenced in one place for implementation.

### Spacing

| Token | Value | Usage |
|---|---|---|
| `pageMaxWidth` | `1200px` | Maximum content width |
| `columnGap` | `2rem` | Gap between left and right columns |
| `leftColumnWidth` | `30%` | Context column width |
| `chartMinHeight` | `250px` | Minimum chart height (mobile) |
| `chartDesktopHeight` | `400px` | Default chart height (desktop) |

### Sparkline

| Token | Value | Usage |
|---|---|---|
| `sparklineHeight` | `40px` (desktop), `30px` (mobile) | Minimap height |
| `sparklinePointRadius` | `1.5px` | Tiny episode dots |
| `sparklineLineWidth` | `1px` | Connecting line stroke |
| `sparklineLineColor` | `trendMicro` | Connecting line color |
| `viewportFill` | `spotColor` at 10% opacity | Viewport window background |
| `viewportBorder` | `spotColor` at 40% opacity | Viewport window left/right edges |
| `viewportBorderActive` | `spotColor` at 70% opacity | Viewport border while dragging |
| `viewportMinWidth` | `15%` | Minimum viewport window width as % of sparkline |

### Main chart

| Token | Value | Usage |
|---|---|---|
| `pointRadius` | `3px` | Default episode dot radius |
| `pointRadiusHover` | `4.5px` | Highlighted dot radius |
| `trendMacroWidth` | `1px` | Macro trendline stroke |
| `trendMacroStyle` | `dashed` | Macro trendline dash |
| `trendMicroWidth` | `1px` | Micro trendline stroke |
| `trendMicroStyle` | `solid` | Micro trendline style |
| `crosshairWidth` | `0.5px` | Hover crosshair stroke |
| `crosshairStyle` | `dashed` | Hover crosshair dash |
| `axisStrokeWidth` | `1px` | Range frame axis line |

### Transitions

| Token | Value | Usage |
|---|---|---|
| `hoverTransition` | `150ms ease` | Point highlight and crosshair appearance |
| `sidenoteTransition` | `200ms ease` | Sidenote content swap |
| `inlineExpandDuration` | `250ms ease` | Mobile detail block expand/collapse |
| `viewportPanDuration` | `300ms ease` | Animated pan when clicking the sparkline |
