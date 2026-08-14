# Visualization Dependency Research

Research completed March 12, 2026. Updated after a D3-focused follow-up review. The goal is to evaluate charting options for GraphTV with a high bar for visual quality, customization, responsiveness, and cross-platform viability, and to determine whether GraphTV should roll its own visualization layer.

## Summary

| Option                  | Visual quality       | Customization | Responsive                 | Cross-platform story                                        | Cost / license           | Fit for GraphTV                           | Verdict                                           |
| ----------------------- | -------------------- | ------------- | -------------------------- | ----------------------------------------------------------- | ------------------------ | ----------------------------------------- | ------------------------------------------------- |
| **Apache ECharts**      | High                 | High          | Strong                     | Web-first, SSR, SVG/Canvas                                  | Apache 2.0               | Excellent                                 | Best OSS library                                  |
| **Highcharts**          | Very high            | Very high     | Strong                     | Web + official integrations incl. Flutter                   | Commercial for many uses | Excellent                                 | Best premium library                              |
| **D3**                  | As good as you build | Maximum       | Strong if implemented well | Works in any JavaScript environment; SVG and Canvas capable | ISC                      | Excellent for a narrow custom chart layer | Best bespoke foundation                           |
| **visx**                | Good                 | High          | Depends on implementation  | React web only                                              | MIT                      | Poor fit today                            | Good only after React migration                   |
| **Vega-Lite**           | Good                 | Medium        | Strong                     | Web-focused                                                 | BSD-3-Clause             | Fair                                      | Better for analytics than product UI              |
| **Observable Plot**     | Good defaults        | Medium        | Strong                     | Web-focused                                                 | ISC                      | Fair                                      | Great for fast iteration, not best for branded UI |
| **Plotly.js**           | Good                 | High          | Strong                     | Web-focused                                                 | MIT                      | Fair                                      | Broad but heavier and less GraphTV-like           |
| **Roll our own engine** | Potentially highest  | Maximum       | Fully owned                | Fully owned                                                 | Highest engineering cost | Poor                                      | Not justified                                     |

## Updated conclusion

After the D3-specific review, the choice is clearer:

- If GraphTV wants a **configurable charting library**, `Apache ECharts` is still the best open-source dependency.
- If GraphTV wants a **distinctive product visualization system** built around a small number of custom charts, `D3` is now the best fit.
- The wrong move is still building a full charting engine from scratch.

So the real decision is not whether D3 is “more powerful” than a charting library. It is:

- `ECharts` for a library-driven chart product
- `D3` for a bespoke GraphTV chart layer

Given the current product direction, I would now bias toward a **D3-based custom SVG approach**, provided we keep the chart surface area intentionally small and architect it cleanly.

## What GraphTV actually needs

GraphTV does not need a general-purpose charting platform. It needs a small number of highly polished, highly controllable chart types:

- Episode-by-episode ratings
- Season overlays and trend lines
- Rich hover states with episode metadata
- Excellent layout on phone and desktop
- Strong animation and theming
- Enough extensibility to invent custom visual treatments later

That means the right dependency is the one that gives us:

- a strong rendering foundation
- enough hooks to customize deeply
- low enough maintenance cost that we can focus on design and product
- a clean path to making the chart feel unmistakably like GraphTV rather than like a stock chart library

## D3-focused findings

The D3 docs are unusually explicit about what D3 is and is not:

- D3 describes itself as a library for **bespoke data visualization**.
- D3 explicitly says it is **not a charting library in the traditional sense** and has **no concept of charts**.
- D3 also says that if you are considering rolling your own SVG, Canvas, or WebGL charts, you should treat D3 as the toolbox for doing that.

That framing matters for GraphTV. D3 is not appealing because it gives a better default line chart than Highcharts or ECharts. It is appealing because it makes it practical to build a GraphTV-native chart system without inventing all the primitives ourselves.

### What the official D3 docs confirm

- **Bespoke control is the point**
  - The D3 homepage emphasizes selections, transitions, scales, axes, shapes, and interactions as composable primitives rather than prebuilt charts.
  - Source: https://d3js.org/

- **D3 works in any JavaScript environment**
  - The getting started docs explicitly say D3 works in any JavaScript environment and show vanilla HTML, npm usage, React, and Svelte patterns.
  - Source: https://d3js.org/getting-started

- **SVG and Canvas are both first-class**
  - `d3-shape` can render either SVG path data or draw directly to a Canvas context.
  - `d3-path` exists specifically to let the same path-building logic work for SVG and Canvas.
  - Sources:
    - https://d3js.org/d3-shape
    - https://d3js.org/d3-path

- **Interactive behaviors are mature**
  - `d3-zoom` handles mouse, wheel, and pinch zooming and is DOM-agnostic.
  - `d3-brush` provides mouse and touch brushing in SVG.
  - Sources:
    - https://d3js.org/d3-zoom
    - https://d3js.org/d3-brush

- **Efficient updates are built in**
  - `selection.join` gives a clean enter/update/exit model for updating marks without rebuilding the whole chart scene.
  - Source: https://d3js.org/d3-selection/joining

- **Axes and animated updates are first-class**
  - `d3-axis` supports rendering and updating axes after scales change, including through transitions.
  - Source: https://d3js.org/d3-axis

### Important implication from the docs

The D3 docs also recommend Observable Plot unless low-level control is actually needed. That is useful evidence in GraphTV’s case.

- If the goal were “just render a ratings line chart,” D3 would be overkill.
- But if the goal is “build a signature chart experience with custom marks, tooltips, transitions, overlays, focus states, and possibly SVG/Canvas switching later,” then D3 is exactly the right level.

Source: https://d3js.org/what-is-d3

## Where D3 is strongest for GraphTV

- **Visual identity**
  - This is the main reason to choose D3. The chart can feel native to GraphTV instead of like a themed third-party chart.

- **A narrow chart surface**
  - GraphTV appears to need a few custom charts, not a broad catalog of commodity chart types. D3 gets more attractive as that scope stays narrow.

- **SVG-first product work**
  - For rich hover states, episode dots, trend overlays, labels, guides, and precise visual tuning, SVG is the right medium.
  - D3 is extremely strong here.

- **Canvas fallback without rewriting the mental model**
  - If very long-running series eventually force a Canvas path for performance, D3’s path and shape modules make that transition more practical.

- **Framework flexibility**
  - Even if GraphTV later moves to React or another framework, D3’s data, scale, and shape modules remain useful. The official docs explicitly show D3 being used in multiple environments.

## Where D3 is weaker

- **You own more of the product**
  - This is both the value and the cost. D3 gives primitives, not full chart components.

- **Accessibility is not free**
  - Inference from the docs: because D3 is a low-level toolbox rather than a component library, keyboard behavior, ARIA semantics, focus management, and screen-reader affordances remain our responsibility.

- **Responsiveness is not automatic**
  - D3 gives the tools; we still need to design the measurement model, viewBox strategy, tick density rules, mobile layout behavior, and touch targets.

- **Design discipline matters more**
  - With Highcharts or ECharts, it is harder to make a deeply inconsistent chart. With D3, it is easy to build something visually impressive but brittle if the local rendering architecture is sloppy.

## What “D3-based approach” should mean

If GraphTV chooses D3, the implementation should be intentionally narrow and structured.

### Good D3 plan

- Use **D3 for primitives**, not as a justification for ad hoc DOM mutation everywhere.
- Build one local chart module such as `renderRatingsChart(container, data, options)`.
- Keep data normalization separate from rendering.
- Use **SVG first** for product polish and inspectability.
- Use D3 modules primarily for:
  - scales
  - axes
  - line and symbol generation
  - selections and keyed joins
  - transitions
  - pointer / zoom / brush behaviors only if the product actually needs them

### Bad D3 plan

- Scatter D3 calls across unrelated modules
- Mix API fetching, parsing, layout, and rendering into one function
- Build generic chart abstractions too early
- Add Canvas or zooming before the base static chart is excellent

## Recommended D3 architecture for GraphTV

If GraphTV goes this direction, the first version should stay focused.

### Rendering model

- Primary renderer: **SVG**
- Fallback later if needed: Canvas for dense plots only
- Container layout handled by CSS
- Chart dimensions handled by one measurement layer plus a rerender/update function

### Module structure

- `viz/ratingsChart.js`
  - owns the SVG scene graph and update cycle
- `viz/scales.js`
  - episode, season, and rating scale helpers
- `viz/marks.js`
  - dots, trend line, season separators, hover guides
- `viz/tooltip.js`
  - HTML tooltip positioning and content
- `viz/theme.js`
  - colors, stroke widths, spacing, typography tokens

### Interaction model

- Phase 1
  - hover
  - focus state
  - touch tap behavior
  - responsive relayout
- Phase 2
  - optional zoom or brush only if long series make it necessary

### Why SVG first

- better for art direction
- better for inspection and debugging
- easier accessibility work
- better fit for the number of points GraphTV is likely to render

## Detailed findings by option

### Apache ECharts — best open-source library

- **URL:** https://echarts.apache.org/en/index.html
- **License:** Apache 2.0
- **Rendering model:** Supports both Canvas and SVG renderers.
- **Customization:** Strong. ECharts explicitly supports custom series and custom rendering behavior.
- **Responsive story:** Strong. Resize handling and responsive use are first-class parts of the library.
- **Cross-platform story:** Best read as web-first, but flexible enough for browser apps, embedded contexts, and server-side rendering use cases.
- **Why it fits GraphTV:**
  - strong defaults
  - enough control for brand styling
  - open-source licensing
- **Trade-offs:**
  - still feels like configuring a library rather than designing a native GraphTV chart system
  - option objects can sprawl quickly unless wrapped behind local abstractions
- **Relevant docs:**
  - Homepage: https://echarts.apache.org/en/index.html
  - Canvas vs SVG guidance: https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/
  - Custom series: https://echarts.apache.org/handbook/en/how-to/custom-series/

### Highcharts — best premium library

- **URL:** https://www.highcharts.com/products/highcharts/
- **License:** Commercial for many production uses
- **Rendering model:** Mature SVG-first charting with extensive built-in interactions and ecosystem support.
- **Customization:** Very strong.
- **Responsive story:** Strong.
- **Cross-platform story:** Stronger than most charting libraries because Highsoft also publishes official integrations, including Flutter.
- **Why it fits GraphTV:**
  - high polish quickly
  - excellent built-in interaction capabilities
  - already present in the repo
- **Trade-offs:**
  - licensing cost and constraints
  - still fundamentally a library-themed experience unless heavily wrapped
- **Relevant docs:**
  - Product page: https://www.highcharts.com/products/highcharts/
  - Downloads and build options: https://www.highcharts.com/download/
  - Flutter integration: https://www.highcharts.com/integrations/flutter/

### D3 — best foundation for a bespoke layer

- **URL:** https://d3js.org/
- **License:** ISC
- **Rendering model:** Low-level primitives for scales, axes, shapes, interactions, and transitions.
- **Customization:** Maximum.
- **Responsive story:** Strong if implemented well, but not automatic.
- **Cross-platform story:** Official docs say D3 works in any JavaScript environment and show vanilla HTML, React, and Svelte patterns. It is still a primitives toolkit rather than a product widget library.
- **Why it fits GraphTV:**
  - strongest path to a distinctive visual language
  - realistic because GraphTV appears to need only a few custom chart types
  - official D3 primitives map closely to the chart GraphTV wants to build
  - SVG and Canvas can share path-generation concepts if performance needs change later
- **Trade-offs:**
  - we own axes, resize behavior, touch interactions, accessibility, and performance decisions
  - engineering cost is higher than ECharts or Highcharts
- **Relevant docs:**
  - Homepage: https://d3js.org/
  - What is D3: https://d3js.org/what-is-d3
  - Getting started: https://d3js.org/getting-started
  - Axis module: https://d3js.org/d3-axis
  - Selection joins: https://d3js.org/d3-selection/joining
  - Shape module: https://d3js.org/d3-shape
  - Path module: https://d3js.org/d3-path
  - Zoom module: https://d3js.org/d3-zoom
  - Brush module: https://d3js.org/d3-brush

### visx — attractive only if GraphTV becomes a React app

- **URL:** https://github.com/airbnb/visx
- **License:** MIT
- **Rendering model:** React visualization primitives built on top of D3 utilities.
- **Customization:** High, but only inside a React component model.
- **Responsive story:** Good if the app already uses React patterns.
- **Cross-platform story:** Mostly React web.
- **Why it fits GraphTV:**
  - good option if the app later migrates to React and wants a design-system-first chart layer
- **Trade-offs:**
  - not a practical fit for the current plain-JS repo
  - still leaves substantial chart implementation work to us

### Vega-Lite — better for analytics than branded product visuals

- **URL:** https://vega.github.io/vega-lite/docs/
- **License:** BSD-3-Clause
- **Rendering model:** Declarative JSON grammar for visualization.
- **Customization:** Good for analytical composition, weaker for highly art-directed product UI.
- **Responsive story:** Good.
- **Cross-platform story:** Solid for web.
- **Why it fits GraphTV:**
  - fast way to generate a sound analytical chart
- **Trade-offs:**
  - more specification system than product visualization system
  - less attractive if GraphTV wants custom motion and bespoke interaction
- **Relevant docs:**
  - Vega-Lite docs: https://vega.github.io/vega-lite/docs/
  - Vega Embed: https://vega.github.io/vega-embed/

### Observable Plot — elegant defaults, limited product expressiveness

- **URL:** https://observablehq.com/plot/
- **License:** ISC
- **Rendering model:** High-level plotting API optimized for concise analytical charts.
- **Customization:** Medium.
- **Responsive story:** Good.
- **Cross-platform story:** Web-focused.
- **Why it fits GraphTV:**
  - great for prototyping and data storytelling
- **Trade-offs:**
  - not my preferred foundation for a consumer-facing chart experience where visual identity matters as much as the data

### Plotly.js — broad capability, less aligned aesthetic

- **URL:** https://plotly.com/javascript/
- **License:** MIT
- **Rendering model:** Broad interactive charting system with extensive coverage.
- **Customization:** High.
- **Responsive story:** Strong.
- **Cross-platform story:** Good for web.
- **Why it fits GraphTV:**
  - many chart types and interactions out of the box
- **Trade-offs:**
  - heavier feel
  - more “analysis tool” than “beautiful bespoke product chart” in practice

## Evaluating “roll our own”

There are two very different meanings of “roll our own.”

### 1. Build our own charting engine

This means owning:

- scales and axes
- labels and collision handling
- resize behavior
- animation orchestration
- pointer and touch interaction
- tooltip positioning
- accessibility
- export behavior
- browser rendering quirks
- performance tuning

GraphTV should **not** do this.

### 2. Build our own GraphTV chart layer on top of a rendering foundation

This means:

- choosing `D3`, `ECharts`, or `Highcharts`
- hiding the dependency behind local abstractions like `renderRatingsChart(...)`
- owning the visual language, theming, and interaction design
- keeping the dependency from leaking through the whole app

This is the right way to think about customization.

## Recommendation

### If GraphTV wants a library

Choose **Apache ECharts**.

### If GraphTV wants a product-defining chart experience

Choose **D3 with a custom SVG layer**.

### If GraphTV wants the lowest migration cost and accepts the license trade-off

Keep **Highcharts**, but rebuild the current implementation cleanly.

## Final recommendation

For GraphTV specifically:

1. **Do not build a charting engine from scratch.**
2. **If we want a library, default to Apache ECharts.**
3. **If we want a bespoke chart system, choose D3 with an SVG-first custom layer.**
4. **Keep Highcharts only if the main goal is speed of migration.**

My current call is:

- **Best library choice:** Apache ECharts
- **Best pragmatic choice:** Highcharts
- **Best bespoke choice:** D3-based custom SVG layer
- **Best fit for the current product direction:** D3-based custom SVG layer
- **Bad choice:** rolling a full charting engine ourselves

## Practical next step

Given the current direction, the next step should be narrower than a full bake-off:

1. Build one **D3 SVG prototype** of the GraphTV ratings chart.
2. Validate:
   - visual quality
   - mobile behavior
   - tooltip and focus behavior
   - responsiveness
   - implementation complexity
3. Only build an `ECharts` comparison prototype if the D3 version starts to look too expensive to maintain.
