# GraphTV Keyboard Navigation

Full keyboard navigation with simultaneous vim and conventional key support. Every action possible with a mouse is possible with a keyboard.

## Mode model

GraphTV uses a mode system inspired by vim:

**Normal mode** — the default when no overlay is open and no text-editing field is focused. Single-letter keys trigger navigation and actions only when focus is on the document body, a declared page focus zone, or a composite widget that explicitly opts in.

**Insert mode** — active when the search input is focused. All keys type into the input. Only `Escape` (exit to normal), `Enter` (submit), and standard text editing keys work.

**Overlay mode** — active when the help, credits, view options, or debug panel is open. The overlay traps focus. The toggle key, `Escape`, `q`, or clicking outside closes it. Scrollable content is navigable with `j`/`k`/`ArrowUp`/`ArrowDown`.

**Docks** — non-modal panels pinned to the bottom of the viewport (currently the mark scaling panel). A dock does not change mode: focus can move freely between the dock and the page, so chart shortcuts keep working while it is open. Inside the dock, `Escape` or the dock's toggle key closes it and returns focus to where it came from; range sliders use their native `ArrowLeft`/`ArrowRight`, `Home`/`End`, and `PageUp`/`PageDown`.

## Chord handling

Some vim bindings use multi-key sequences (e.g., `gg`). The implementation should:

- Only wait for subsequent input when the pressed key is the first key of a known chord (currently just `g`). All other keys execute immediately with zero delay.
- After a chord-starter key, wait up to ~400ms for the next key. If no key arrives or the next key doesn't complete a known chord, cancel and discard the starter.
- The chord system should be data-driven (a map of prefix → completions) so adding new chords later is trivial.

## Key mappings

### Global (normal mode)

| Action                  | Vim | Conventional | Notes                                           |
| ----------------------- | --- | ------------ | ----------------------------------------------- |
| Open/close help         | `?` | `F1`         | Shows context-sensitive bindings                |
| Focus search            | `/` | —            | Enters insert mode                              |
| Compare/change shows    | `c` | —            | Results and show-comparison pages               |
| Open/close view options | `o` | —            | Theme, palette settings                         |
| Toggle mark scaling     | `m` | —            | Results and comparison; opens a bottom dock     |
| Toggle debug panel      | `D` | —            | Shift+D to avoid accidental triggers            |
| Go back                 | `q` | —            | Results to search; comparison to its first show |

Shortcut suffixes remain visible on keyboard-capable layouts. Coarse, non-hover devices hide those printed suffixes while preserving the same keyboard bindings for attached keyboards.

### Search input (insert mode)

| Action              | Keys     | Notes                                                                                            |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Submit search       | `Enter`  | A blank or whitespace-only submission clears committed results and returns to the landing state. |
| Exit to normal mode | `Escape` | Blurs input, text persists                                                                       |

Editing the field changes a draft. Existing results remain tied to the last submitted query,
even if the draft is deleted completely. The visible trailing “Clear search and results”
control is the explicit reset action; it clears the draft, committed results, status, selection,
and query URL, then returns focus to the input. Escape remains a mode-exit key and does not clear.

### Search results (normal mode, search page)

| Action          | Vim            | Conventional | Notes                      |
| --------------- | -------------- | ------------ | -------------------------- |
| Next result     | `j`            | `ArrowDown`  | Clamps at the last result  |
| Previous result | `k`            | `ArrowUp`    | Clamps at the first result |
| Open result     | `l` or `Enter` | `Enter`      |                            |
| First result    | `gg`           | `Home`       | Chord: `g` then `g`        |
| Last result     | `G`            | `End`        |                            |

### Browse collections (focused rail)

Collection rails use native Tab navigation for show links. When a rail itself is focused, it handles these keys locally without changing the selected search result.

| Action                | Keys         |
| --------------------- | ------------ |
| Scroll backward       | `ArrowLeft`  |
| Scroll forward        | `ArrowRight` |
| Jump to start of rail | `Home`       |
| Jump to end of rail   | `End`        |

### Chart (normal mode, results page)

On the results page, chart navigation is the default keyboard target in normal mode. The user does not need to tab into the chart before using chart navigation keys. Search, help, debug, and view options remain explicit modes that take over keyboard handling.

The vim spatial metaphor: episodes within a season are characters within a line (`h`/`l`), and seasons are lines (`j`/`k`).

#### Pointer and touch gestures

- **Scan episodes:** With a mouse or pen, press empty plot space and drag. On touch, hold for about 300ms and then drag. The vertical line follows the pointer while the nearest rated episode is previewed by x-position; release commits that episode.
- **Pan:** Swipe horizontally on touch, horizontally scroll with a trackpad, or drag the overview window. A touch swipe that moves before the hold completes pans instead of scanning.
- **Zoom:** Pinch with two fingers, Ctrl-scroll with a trackpad, or resize the overview window.
- **Compare episodes:** With one episode selected, Shift-click another episode to compare the pair. A Shift-click without an existing episode selection behaves like an ordinary single selection. On touch, select an episode, choose the **⚖** button beside the episode navigator's Next button, then tap the second episode.
- **Cancel scanning:** Press `Escape`, begin a two-finger pinch, or let the browser cancel the pointer gesture. The prior committed selection is restored.
- **Page scroll:** A vertical touch gesture beginning on the chart remains native page scrolling.

| Action                    | Vim        | Conventional | Notes                                                                        |
| ------------------------- | ---------- | ------------ | ---------------------------------------------------------------------------- |
| Previous episode          | `h`        | `ArrowLeft`  | Wraps across season boundaries                                               |
| Next episode              | `l`        | `ArrowRight` | Wraps across season boundaries                                               |
| Previous season           | `k`        | `ArrowUp`    | Cycles season trendlines when one is selected; otherwise jumps to the season |
| Next season               | `j`        | `ArrowDown`  | Cycles season trendlines when one is selected; otherwise jumps to the season |
| First episode (series)    | `gg`       | `Home`       |                                                                              |
| Last episode (series)     | `G`        | `End`        |                                                                              |
| Pan back half viewport    | `Ctrl-U`   | —            | Preserves the selected episode                                               |
| Pan forward half viewport | `Ctrl-D`   | —            | Preserves the selected episode                                               |
| Fit entire series         | `f`        | —            | Preserves the selected episode                                               |
| Reset zoom                | `r`        | —            | Restores default density without losing the current location                 |
| Cycle primary provider    | `p`        | —            | Uses providers with usable episode ratings and preserves the chart selection |
| Zoom out                  | `-`        | —            | Anchors on the visible selected episode, otherwise the viewport center       |
| Zoom in                   | `=` or `+` | —            | Anchors on the visible selected episode, otherwise the viewport center       |
| Start/exit comparison     | `v`        | —            | The selected episode becomes the anchor                                      |
| Commit comparison         | `Enter`    | —            | Uses the episode previewed while comparison is armed                         |

While comparison is armed, the arrow and `h`/`j`/`k`/`l` keys move the candidate without replacing the anchor. Boundary jumps (`Home`/`gg` and `End`/`G`) leave comparison and select the first or last episode. Once committed, episode navigation is inert until the reader exits with `v`, `Escape`, the visible exit control, or an ordinary episode selection.

### Show comparison (normal mode)

The two show lanes share the results-chart bindings for episode navigation, provider cycling, pan, zoom, fit, reset, and trend visibility. Commands act on the active lane while viewport changes remain synchronized. The resting state after both charts is the show-comparison context rather than either chart’s full-series detail. A head-to-head may hold one explicitly selected episode from each lane; it compares observed ratings without drawing or calculating a cross-series episode span.

| Action                | Vim           | Conventional      | Notes                                                              |
| --------------------- | ------------- | ----------------- | ------------------------------------------------------------------ |
| First lane            | `Shift-K`     | `Shift-ArrowUp`   | Selects the nearest rated episode at the same ordinal              |
| Second lane           | `Shift-J`     | `Shift-ArrowDown` | Selects the nearest rated episode at the same ordinal              |
| Arm/exit head-to-head | `v`           | —                 | Preserve the selected episode, then choose one from the other show |
| Add with pointer      | `Shift-click` | —                 | Preserves the existing episode when selecting the other lane       |
| Change shows          | `c`           | —                 | Opens the inline picker; each lane also has Replace                |
| Open search           | `/`           | —                 | Returns to the search page                                         |
| Open first show       | `q`           | —                 | Leaves comparison with the first show open alone                   |

The URL records the shows as `show` and `vs` and qualifies episode selections by lane. A single selection uses `select=b:s01e02`; a head-to-head uses `select=a:s01e03,b:s02e04`. Shift-switching lanes preserves the first episode and selects the nearest rated episode in the other show. With only one selected lane, the companion chart shows a faint same-ordinal cursor.

#### Automatic behaviors

- **Sidenote populates on focus.** Moving keyboard focus to an episode populates the sidenote (desktop) or inline detail (mobile) with that episode's metadata — identical to hover. Exiting the chart does not clear the sidenote; the last-focused episode persists.
- **Viewport follows focus.** When focus enters the outer 10% of the visible viewport, the viewport pans smoothly to preserve that edge buffer. The sparkline brush position updates to match. Keyboard users never need to separately control the sparkline.
- **Viewport commands preserve context.** Fitting and zooming never clear the selected episode. Reset zoom centers the default-width viewport on the selected episode when it is visible; if the selection is offscreen, it preserves the viewport center.
- **Comparison preserves chronology and provenance.** The earlier episode is always shown first and the later episode second: left-to-right on desktop and top-to-bottom on mobile. Rating change is calculated only when both displayed ratings use the same provider. The season rule connects the two endpoints, and both episode marks remain emphasized.
- **Comparison unwinds before selection clears.** The first `Escape` returns to the anchor episode; a second returns to the full-series trend. Comparison is intentionally session-local: the URL retains only the anchor, so reloading restores an ordinary single selection.
- **Season jump behavior.** With an episode selected, jumping to the next/previous season lands on the first episode of that season. Selecting a season trendline moves its last episode inside the 10% viewport buffer, then does the same for its first episode so the whole season is shown when it fits and the start takes priority when it does not. With a season trendline selected, `j`/`k` cycle only the available season trendlines and wrap at either end. The inline arrow buttons do the same when multiple season trendlines are available; with only one, they enter that season's episodes instead of becoming inert.
- **No deselected state.** `Escape`, clicking empty chart space, or re-selecting the current trendline returns to the full-series trend summary. Its sidenote details stay available even when the drawn full-series line is switched off in view options; only a series too short for a trend falls back to an unselected browse view.
- **Native-control suspension.** If focus is on a native interactive control such as a link, button, select, summary, or any editable field, page-level single-letter shortcuts are suspended. Only the focused control's own behavior and explicit overlay shortcuts apply.

### View options panel (overlay mode)

Opened by `o` in normal mode. A compact panel for changing theme, palette, default episode density, trendline, rating-spread, and y-axis settings.

The panel shows the available options as a short list. Each option displays its current value and its shortcut key as a visual hint.

#### Navigation

| Action                      | Vim                   | Conventional             | Notes                                                      |
| --------------------------- | --------------------- | ------------------------ | ---------------------------------------------------------- |
| Move between options        | `j`/`k`               | `ArrowUp`/`ArrowDown`    |                                                            |
| Change focused value        | `h`/`l`               | `ArrowLeft`/`ArrowRight` | Left selects Off/previous; right selects On/next           |
| Toggle/cycle focused option | `Enter`               | `Enter` or `Space`       | Theme, palette, and density cycle; boolean settings toggle |
| Close panel                 | `o`, `q`, or `Escape` | `Escape`                 |                                                            |

#### Direct accelerators

| Key | Action                          |
| --- | ------------------------------- |
| `t` | Cycle System/Light/Dark theme   |
| `c` | Cycle color palette             |
| `d` | Cycle default episode density   |
| `s` | Toggle season trendlines        |
| `f` | Toggle full-show trendline      |
| `r` | Toggle rating source spread     |
| `y` | Toggle the absolute 0–10 y-axis |

#### Interaction model

- **Click:** Clicking a specific value (e.g., "dark" or "rainbow") selects it directly.
- **Spatial editing:** Navigate to a row, then use left/right to set its value or Enter/Space to toggle or cycle it.
- **Direct keys:** An accelerator toggles its option and focuses the corresponding row, enabling quick modal sequences such as `o`, `y`, `o`.
- **Key repeat:** Direct toggles ignore repeated keydown events so holding a key cannot toggle twice.
- **Immediate feedback:** Changes apply instantly as the user toggles. No "apply" step.
- **Episode density:** `Roomy`, `Balanced`, and `Dense` set progressively larger default episode windows; `Full series` fits every episode. A default window expands through the full series whenever point spacing remains comfortable, or by up to three episodes to finish a nearby season. Reset Zoom returns to the selected density; manual zoom remains exact.
- **Inline explanations:** Options with less obvious visual effects include an info tooltip beside their label.
- Changes persist to `localStorage`.

### Help overlay (overlay mode)

| Action         | Keys                           | Notes                |
| -------------- | ------------------------------ | -------------------- |
| Close          | `?`, `F1`, `q`, or `Escape`    |                      |
| Scroll content | `j`/`k`, `ArrowUp`/`ArrowDown` | If content overflows |

The help overlay is context-sensitive: it shows bindings relevant to the current screen with global bindings always visible. Both conventional and vim keys are shown, conventional listed first. Non-vim users should not have to parse vim notation to find their key.

The footer links to a separate credits and attribution panel. Its data-provider section reflects the data currently visible on the page, and its back action returns to the help footer with focus restored to the credits entry.

### Debug panel (overlay mode)

| Action         | Keys                           | Notes                |
| -------------- | ------------------------------ | -------------------- |
| Close          | `D`, `q`, or `Escape`          |                      |
| Scroll content | `j`/`k`, `ArrowUp`/`ArrowDown` | If content overflows |

## Focus management

### Tab order

`Tab` moves between major focus zones in document order:

**Search page:** search input → clear control (when present) → Search button → selected result

**Results page:** search input (if visible) → show info region → overlay triggers and controls

**Show comparison:** page actions → comparison picker (when open) → lane charts → show actions → context table

Within each zone, the zone's internal navigation takes over where applicable. `Tab` moves to the next zone, `Shift+Tab` to the previous. The chart does not require tab-entry in normal mode; page navigation keys target chart state directly.

### Focus indicators

- Focus rings use `spotColor` in both themes, not browser defaults.
- The active episode highlight (spotColor, enlarged radius) serves as the chart focus indicator — the same visual treatment as hover. During comparison, both endpoints retain that emphasis and an accent segment on the season rule connects them.
- Results list items get a text-color shift to `spotColor` on focus, matching hover.

### Focus restoration

- When closing an overlay (help, credits, view options, debug), focus returns to the element that was focused before the overlay opened.
- When navigating from search to results, initial focus goes to the show title region, not the chart. The user can Tab into the chart when ready.
- When navigating back to search from results, focus goes to the search input.
- When a comparison opens, initial focus goes to its combined title. Closing the inline show picker restores focus to the action that opened it.

## Reduced motion

All keyboard-triggered transitions (viewport panning, sidenote swaps, overlay open/close) respect `prefers-reduced-motion`. When active, transitions become instant.

## Implementation notes

### Key listener architecture

One top-level `keydown` listener on `document`, not per-element listeners scattered across modules. The listener checks the current mode, active overlay state, and whether focus is currently inside a native interactive control that should suppress page-level single-letter shortcuts. This keeps keyboard logic centralized and testable.

```
keydown → determine mode (normal / insert / overlay)
        → determine context (search results / chart / page)
        → determine whether native-control suppression is active
        → check chord state (is this a continuation of `g`?)
        → dispatch to handler
        → if unhandled, let the browser default through
```

### Chord state machine

```
IDLE ──[g pressed]──→ WAITING
WAITING ──[g pressed within 400ms]──→ execute `gg` action → IDLE
WAITING ──[other key within 400ms]──→ discard, handle new key normally → IDLE
WAITING ──[400ms timeout]──→ discard → IDLE
```

Only `g` is a chord starter. All other keys execute immediately with zero delay. Adding new chords means adding entries to the prefix map — no structural changes needed.

### Mode transitions

```
Normal ──[/ pressed]──→ Insert (search input focused)
Normal ──[? pressed]──→ Overlay (help)
Normal ──[o pressed]──→ Overlay (view options)
Normal ──[D pressed]──→ Overlay (debug)
Insert ──[Escape]──→ Normal (input blurred)
Insert ──[non-empty Enter]──→ Normal (search submitted, results appear)
Insert ──[empty Enter]──→ Insert (search state reset, input remains focused)
Overlay ──[Escape, q, toggle key, or outside click]──→ Normal (focus restored)
```

### Preventing conflicts

- In insert mode, all single-letter keys type into the input. No vim bindings fire.
- In overlay mode, only the overlay's own bindings are active. Background keys are suppressed.
- `?` only triggers help when no text input is focused. Inside the search input, `?` types normally. To open help from insert mode: `Escape` first, then `?`.
- If focus is on a native interactive control such as a link, button, select, summary, or editable field, page-level single-letter shortcuts do not fire.
- Composite widgets marked for local keyboard handling suppress page-level navigation while focused; their own documented keys continue to work.
- Modified shortcuts do not fire except for the chart's intentional `Ctrl-U` and `Ctrl-D` half-viewport pans. Browser and operating-system commands such as reload, address-bar focus, Command-D bookmarks, and browser zoom are never intercepted. Shift remains available for intentional keys such as `?`, `D`, `G`, and `+`.
