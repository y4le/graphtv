# GraphTV Keyboard Navigation

Full keyboard navigation with simultaneous vim and conventional key support. Every action possible with a mouse is possible with a keyboard.

## Mode model

GraphTV uses a mode system inspired by vim:

**Normal mode** — the default when no overlay is open and no text-editing field is focused. Single-letter keys trigger navigation and actions only when focus is on the document body, a declared page focus zone, or a composite widget that explicitly opts in.

**Insert mode** — active when the search input is focused. All keys type into the input. Only `Escape` (exit to normal), `Enter` (submit), and standard text editing keys work.

**Overlay mode** — active when the help overlay, view options panel, or debug panel is open. The overlay traps focus. The toggle key, `Escape`, `q`, or clicking outside closes it. Content is navigable with `j`/`k`/`ArrowUp`/`ArrowDown`.

## Chord handling

Some vim bindings use multi-key sequences (e.g., `gg`). The implementation should:

- Only wait for subsequent input when the pressed key is the first key of a known chord (currently just `g`). All other keys execute immediately with zero delay.
- After a chord-starter key, wait up to ~400ms for the next key. If no key arrives or the next key doesn't complete a known chord, cancel and discard the starter.
- The chord system should be data-driven (a map of prefix → completions) so adding new chords later is trivial.

## Key mappings

### Global (normal mode)

| Action | Vim | Conventional | Notes |
|---|---|---|---|
| Open/close help | `?` | `F1` | Shows context-sensitive bindings |
| Focus search | `/` | — | Enters insert mode |
| Open/close view options | `v` | — | Theme, palette settings |
| Toggle debug panel | `D` | — | Shift+D to avoid accidental triggers |
| Return to search | `q` | — | From results page |

### Search input (insert mode)

| Action | Keys | Notes |
|---|---|---|
| Submit search | `Enter` | |
| Exit to normal mode | `Escape` | Blurs input, text persists |

### Search results (normal mode, search page)

| Action | Vim | Conventional | Notes |
|---|---|---|---|
| Next result | `j` | `ArrowDown` | Clamps at the last result |
| Previous result | `k` | `ArrowUp` | Clamps at the first result |
| Open result | `l` or `Enter` | `Enter` | |
| First result | `gg` | `Home` | Chord: `g` then `g` |
| Last result | `G` | `End` | |

### Chart (normal mode, results page)

On the results page, chart navigation is the default keyboard target in normal mode. The user does not need to tab into the chart before using chart navigation keys. Search, help, debug, and view options remain explicit modes that take over keyboard handling.

The vim spatial metaphor: episodes within a season are characters within a line (`h`/`l`), seasons are lines (`j`/`k`). `w`/`b` (word jump) alias season jump since seasons are the natural grouping unit.

| Action | Vim | Conventional | Notes |
|---|---|---|---|
| Previous episode | `h` | `ArrowLeft` | Wraps across season boundaries |
| Next episode | `l` | `ArrowRight` | Wraps across season boundaries |
| Previous season | `k` or `b` | `ArrowUp` or `Ctrl+ArrowLeft` | First episode of previous season |
| Next season | `j` or `w` | `ArrowDown` or `Ctrl+ArrowRight` | First episode of next season |
| First episode (series) | `gg` or `0` | `Home` | |
| Last episode (series) | `G` or `$` | `End` | |

#### Automatic behaviors

- **Sidenote populates on focus.** Moving keyboard focus to an episode populates the sidenote (desktop) or inline detail (mobile) with that episode's metadata — identical to hover. Exiting the chart does not clear the sidenote; the last-focused episode persists.
- **Viewport follows focus.** When focus moves past the visible viewport edge, the viewport pans smoothly to keep the focused episode visible. The sparkline brush position updates to match. Keyboard users never need to separately control the sparkline.
- **Season jump behavior.** Jumping to the next/previous season lands on the first episode of that season. If already on the first episode of a season, `k`/`ArrowUp` jumps to the first episode of the previous season (not the last episode).
- **Native-control suspension.** If focus is on a native interactive control such as a link, button, select, summary, or any editable field, page-level single-letter shortcuts are suspended. Only the focused control's own behavior and explicit overlay shortcuts apply.

### View options panel (overlay mode)

Opened by `v` in normal mode. A compact panel for toggling theme and cycling the season palette.

The panel shows the available options as a short list. Each option displays its current value and its shortcut key as a visual hint.

```
View Options              [Escape to close]
─────────────────────────
  Theme        light ◉ / dark ○         t
  Palette      subtle ○ / vivid ◉ / mono ○    c
```

#### Navigation

| Action | Vim | Conventional | Notes |
|---|---|---|---|
| Move between options | `j`/`k` | `ArrowUp`/`ArrowDown` | |
| Toggle/cycle focused option | `Enter` | `Enter` | Theme: toggles. Palette: cycles. |
| Toggle theme directly | `t` | — | Works from anywhere in the panel |
| Cycle palette directly | `c` | — | Works from anywhere in the panel |
| Close panel | `v`, `q`, or `Escape` | `Escape` | |

#### Interaction model

- **Click:** Clicking a specific value (e.g., "dark" or "vivid") selects it directly.
- **j/k + Enter:** Navigate to the option row, press Enter to toggle or cycle.
- **Direct keys:** `t` toggles theme and `c` cycles palette regardless of which row is focused — the hint keys are always active while the panel is open.
- **Immediate feedback:** Changes apply instantly as the user toggles. No "apply" step.
- Changes persist to `localStorage`.

### Help overlay (overlay mode)

| Action | Keys | Notes |
|---|---|---|
| Close | `?`, `F1`, `q`, or `Escape` | |
| Scroll content | `j`/`k`, `ArrowUp`/`ArrowDown` | If content overflows |

The help overlay is context-sensitive: it shows bindings relevant to the current screen with global bindings always visible. Both conventional and vim keys are shown, conventional listed first. Non-vim users should not have to parse vim notation to find their key.

### Debug panel (overlay mode)

| Action | Keys | Notes |
|---|---|---|
| Close | `D`, `q`, or `Escape` | |
| Scroll content | `j`/`k`, `ArrowUp`/`ArrowDown` | If content overflows |

## Focus management

### Tab order

`Tab` moves between major focus zones in document order:

**Search page:** search input → results list

**Results page:** search input (if visible) → show info region → overlay triggers and controls

Within each zone, the zone's internal navigation takes over where applicable. `Tab` moves to the next zone, `Shift+Tab` to the previous. The chart does not require tab-entry in normal mode; page navigation keys target chart state directly.

### Focus indicators

- Focus rings use `spotColor` in both themes, not browser defaults.
- The active episode highlight (spotColor, enlarged radius) serves as the chart focus indicator — the same visual treatment as hover.
- Results list items get a text-color shift to `spotColor` on focus, matching hover.

### Focus restoration

- When closing an overlay (help, view options, debug), focus returns to the element that was focused before the overlay opened.
- When navigating from search to results, initial focus goes to the show title region, not the chart. The user can Tab into the chart when ready.
- When navigating back to search from results, focus goes to the search input.

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
Normal ──[v pressed]──→ Overlay (view options)
Normal ──[D pressed]──→ Overlay (debug)
Insert ──[Escape]──→ Normal (input blurred)
Insert ──[Enter]──→ Normal (search submitted, results appear)
Overlay ──[Escape, q, toggle key, or outside click]──→ Normal (focus restored)
```

### Preventing conflicts

- In insert mode, all single-letter keys type into the input. No vim bindings fire.
- In overlay mode, only the overlay's own bindings are active. Background keys are suppressed.
- `?` only triggers help when no text input is focused. Inside the search input, `?` types normally. To open help from insert mode: `Escape` first, then `?`.
- If focus is on a native interactive control such as a link, button, select, summary, or editable field, page-level single-letter shortcuts do not fire.
- Browser defaults (e.g., `Ctrl+F` for find, `Ctrl+L` for address bar) are never intercepted.
