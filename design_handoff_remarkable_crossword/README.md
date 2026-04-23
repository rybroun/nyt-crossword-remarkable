# Handoff — Ryan's Remarkable (NYT Crossword Delivery Daemon)

> A small local daemon that fetches the next day's NYT crossword PDF and
> uploads it to a reMarkable tablet on a schedule. This folder contains a
> **design prototype** of the configuration + monitoring UI. Your job is to
> recreate the design in the real codebase.

---

## What this bundle is (and isn't)

The files in `prototype/` are **design references** — a hi-fi clickable mock
built with React + inline JSX in plain `<script type="text/babel">` tags, no
build tools. They exist to show the intended look, layout, copy, and
interaction model.

**Do not ship the prototype code as-is.** It uses unversioned UMD React, has
no state management beyond `useState`, and fakes all the network work with
`setTimeout`. Recreate it in the target app's real environment (React, Vue,
SwiftUI, native, etc.) using that codebase's existing component library,
design tokens, and network/state patterns. If there's no codebase yet, pick
an appropriate framework for a local/desktop utility with a web frontend
(Tauri + React is a reasonable default; Electron works too).

The prototype is **high fidelity** — pixel-perfect intent for colors,
typography, spacing, and interaction states. Reproduce it faithfully.

---

## The app in one paragraph

The user runs a small background daemon on their laptop. Every night at a
configured time (default 10 PM ET, when the next day's NYT puzzle drops) it
(1) fetches the printable PDF from nytimes.com using a stored session cookie,
(2) uploads it to their reMarkable tablet via `rmapi`, and (3) records the
result. The UI is a **single-page dashboard** plus a **first-run wizard**
and a **settings drawer**. No login, no multi-user — this runs on the user's
machine for themselves.

---

## Design language

The aesthetic is a **quiet, editorial newspaper** — not a SaaS dashboard.
It leans into the "printed nightly" metaphor: cream paper, inky serif
headlines, monospace metadata, thin rules, a very restrained warm-red accent.

### Fonts (Google Fonts)

- **Serif:** Source Serif 4 (variable) — headlines, body prose, italic
  phrasing. Default weight 400; headlines 500–700. Use italics liberally
  for editorial voice (e.g. _"a small daemon, printed nightly"_).
- **Sans:** Source Sans 3 — UI body copy where serif is too literary
  (buttons, dense fields, some metadata).
- **Mono:** IBM Plex Mono — labels, kickers, timestamps, filenames, log
  output, status pills.

### Color tokens

All colors live as CSS custom properties at the top of `prototype/styles.css`.
Use the OKLCH definitions verbatim if possible; hex equivalents are
approximate.

| Token | OKLCH | ≈Hex | Usage |
|---|---|---|---|
| `--paper`   | `oklch(96% 0.012 85)`  | `#F5EFE3` | Page background |
| `--paper-2` | `oklch(93% 0.015 82)`  | `#EDE4D4` | Cards, elevated surfaces |
| `--paper-3` | `oklch(90% 0.018 80)`  | `#E3D8C3` | Neutral cell background |
| `--ink`     | `oklch(22% 0.015 60)`  | `#2A241B` | Primary text, rules |
| `--ink-2`   | `oklch(38% 0.018 55)`  | `#554A3C` | Secondary text |
| `--ink-3`   | `oklch(58% 0.018 55)`  | `#8A7F6F` | Tertiary text, hints |
| `--rule`        | `oklch(22% 0.015 60 / 0.12)` | — | Hairline divider |
| `--rule-2`      | `oklch(22% 0.015 60 / 0.22)` | — | Medium rule |
| `--rule-strong` | `oklch(22% 0.015 60 / 0.38)` | — | Strong rule / input border |
| `--accent` | `oklch(48% 0.14 30)`  | `#B6412A` | Warm red — primary CTA, selection ring |
| `--ok`     | `oklch(48% 0.08 150)` | `#4D7254` | Delivered state, success pills |
| `--warn`   | `oklch(62% 0.12 70)`  | `#B99046` | Warning state |
| `--err`    | `oklch(48% 0.14 30)`  | `#B6412A` | Error state (same hue as accent) |

The page uses a subtle diagonal paper-fiber texture:
```css
background:
  repeating-linear-gradient(115deg,
    transparent 0 3px,
    oklch(22% 0.015 60 / 0.015) 3px 4px);
```

### Spacing & rhythm

- Grid gutters: 24–32px between major regions; 12–18px inside cards.
- Hairline rules (`--rule`) divide every small group; the _strong_ rule
  under section titles is 1px solid `--ink`.
- Buttons are **square** (0 border-radius). Cards are mostly square too —
  only a handful of tight radii (2–4px) appear, for tiny swatches.
- Letter-spacing: serif headlines `-0.02em`; mono UPPERCASE kickers `0.14em`.

---

## Three surfaces to build

### 1. Dashboard (the main screen)

Layout is a two-column split:

```
┌─ masthead (slim bar) ────────────────────────────────────────────────┐
│  Ryan's Remarkable           [● NYT]  [● reMarkable]                 │
└──────────────────────────────────────────────────────────────────────┘

┌─ Delivery record (left, ~2fr) ────────┐  ┌─ Auto-fetch (right, ~1fr) ┐
│ grid toolbar                          │  │ "Every day"               │
│ [calendar-style activity grid]        │  │  at 10:00 PM ET           │
│ (legend)                              │  │  Next run · Sat · 10:00   │
│ (progress strip appears during fetch) │  │  Last run · 4 min ago     │
└───────────────────────────────────────┘  │  [Edit] [Pause 24h]       │
                                           └───────────────────────────┘
```

#### Masthead
- Full-width slim bar, white-on-paper with a 1px `--ink` bottom rule.
- Left: wordmark "Ryan's _Remarkable_" (serif, "Remarkable" in italic).
- Right (pushed to end): two "lights" — pill-shaped buttons labeled `● NYT`
  and `● reMarkable` where the dot is colored by status:
  - `ok` — green dot, subtle glow.
  - `warn` — amber dot, slow pulse.
  - `err` — red dot, fast pulse.
- Clicking a healthy light shows a toast ("NYT session valid · expires in
  ~27 days"). Clicking an unhealthy one reopens the first-run wizard at the
  relevant step.

#### Delivery record — grid toolbar

Single row above the grid. Order is fixed so controls never shift:

1. **Left:** "Delivery record" heading (serif) + kicker (mono, uppercase)
   that says `all days` or `grouped by day of week`.
2. **Right cluster**, in order:
   - **Pivot tabs:** `[All days | Day of week]`. Two-button segmented
     control, 1px ink border, 32px tall, active state filled ink / paper
     text.
   - **Year stepper:** `[‹][  2026  ][›]`. Same 32px height, 1px ink border.
     Clamp to `[2010, current year]`. Disabled arrow is `--ink-3` and
     non-interactive.
   - **Weekday picker** (only when Day of week is active): `[Sun|Mon|Tue|
     Wed|Thu|Fri|Sat]`. Same styling family as the pivot. Mounts/unmounts
     in place — do not reserve empty space.

#### Delivery record — the activity grid

A GitHub-style contribution calendar, but for daily puzzle deliveries.
**Cells are 14×14 with 3px gap.** Built with CSS Grid; absolute column/row
indices so rendering is cheap.

Two views, both rendering the **same cell primitive** with different X/Y
mappings:

**A. "All days" view** (default)
- X axis = weeks of the selected year (~52 columns).
- Y axis = day of week, Sun→Sat (7 rows).
- Month letter labels (`Jan Feb Mar …`) float above the grid, positioned
  by the first week that contains day 1–7 of each month.
- Day-of-week labels `Sun Mon Tue Wed Thu Fri Sat` sit in a 28px column to
  the left.
- Dates from the previous/next year (the first/last partial weeks) are
  still rendered but at 25% opacity and non-interactive (`.cell.outside`).

**B. "Day of week" view**
- Pick a weekday with the picker (defaults to today's weekday).
- X axis = 12 months of the year (Jan…Dec, single-letter labels
  `J F M A M J J A S O N D`).
- Y axis = occurrence within the month, **1st…5th** (5 rows). Label column
  reads `1st 2nd 3rd 4th 5th` instead of `Sun Mon …`.
- Months with only four occurrences of the selected weekday leave row 5
  as a blank placeholder in that column.
- Same 14×14 cells, same 3px gap, same pitch as the All-days grid. The
  entire view fits in a compact ~200px-wide block.

**Cell states & colors**

| State             | Treatment                                                       |
|-------------------|------------------------------------------------------------------|
| `ok`              | Filled `oklch(48% 0.08 150 / 0.75)` (green), border slightly darker. |
| `err`             | Filled `oklch(48% 0.14 30 / 0.80)` (red).                        |
| `none` (past, unscheduled, no attempt) | Background `--paper-3`, hairline border. |
| `future-scheduled` (upcoming, on schedule) | Transparent fill, 0.5px solid warm-red border `oklch(42% 0.12 22 / 0.55)`. |
| `future` (upcoming, off schedule) | Transparent, 0.5px dashed faint border, opacity 0.5. |
| `today`           | 1px ink outline with 1px offset, stacked on top of whatever state fill. |
| `selected`        | 1.5px accent outline with 1px offset, stacked on top of state + today. |

**Hover** scales the cell to 1.35× and darkens the border to `--ink`.
**Tooltip** is a fixed-position dark card (`--ink` background, paper text)
that follows the hovered cell. Contents:

| State              | Tooltip                                                             |
|--------------------|---------------------------------------------------------------------|
| `ok`               | Date · Weekday · `✓ Delivered · 218 KB` · filename (mono) · "Click for details" |
| `err`              | Date · Weekday · `✕ Failed` · failure reason (italic serif) · "Click to retry" |
| `none`             | Date · Weekday · `— Not scheduled` · "Click to fetch this day"      |
| `future-scheduled` | Date · Weekday · `◷ Scheduled · 10:00 PM ET` · "Click to preview"   |
| `future`           | Date · Weekday · `Not scheduled`                                    |

**Click behavior** (same cell primitive in both views):
- `ok` → open a modal with delivery details + a fake log block.
- `err` → kick off the fetch simulation for that date (toast: "Retrying…").
- `none` → kick off the fetch simulation for that date (toast: "Fetching…").
- `future-scheduled` → toast "Scheduled for … at 10:00 PM ET", select.
- `future` → no-op.

**Legend row** below the grid, in mono small-caps:
`Delivered · Failed · Unscheduled · Upcoming · Not scheduled` with matching
mini swatches.

#### Fetch simulation / progress strip

When a fetch is running (kicked off by clicking a cell or the tweak button),
a strip appears below the grid with three phases:
1. `01 · Download PDF` — 0–100%
2. `02 · Prepare file` — 0–100%
3. `03 · Upload to tablet` — 0–100%

Each phase has a mono "Queued / Running / Done" caption, a bold serif title,
and a thin progress bar. Below the steps is a scrolling log in mono — a few
lines like `HTTP 200 · 218 KB received`, `rmapi put /Crosswords/…`,
`Delivered ✓ · 1.62 s total`.

The full simulation runs over ~4–5 seconds. On completion, the grid cell
for that date flips from `none`/`err` to `ok`, the strip disappears, and a
toast fires.

#### Auto-fetch aside (right column)

Single card, about 320px wide. Order of elements:
1. **Section head:** "Auto-fetch" / kicker `SCHEDULE`.
2. **The phrase:** huge serif italic summary — `Every day` / `at 10:00 PM ET`.
   If user picked weekdays only: `Weekdays`. Weekends: `Weekends`. Custom
   subsets: comma list of weekday abbreviations.
3. **Supporting line** (serif, smaller): one-sentence human description of
   what that means.
4. **Two metadata rows:** `NEXT RUN · Sat · 10:00 PM` and `LAST RUN · 4 min
   ago`. Mono label left, serif/mono value right, hairline rule between.
5. **Card actions:** `[Edit schedule]` (primary small button) and
   `[Pause 24h]` (ghost small button).

#### Footer (colophon)

Slim full-width line: `Ryan's Remarkable · a small daemon, printed nightly`
on the left (serif italic); `v0.4.1 · preferences` on the right. The word
"preferences" is a link styled as a mono small-caps underline — opens the
settings drawer.

### 2. Settings drawer

A **right-side drawer** that slides in over a dim scrim. 520px wide,
full height.

Sections, in order, each with its own serif `<h3>` + italic serif subtitle:

1. **Schedule** — day-of-week picker (same control from the wizard),
   time input, timezone select.
2. **reMarkable destination** — auth callout card (status + description +
   Re-pair button if not ok), folder input (default `/Crosswords`),
   filename pattern input with token hints: `{date}`, `{weekday}`, `{iso}`.
3. **NYT authentication** — auth callout card with session cookie status
   and `[Re-authenticate]` button.
4. **Diagnostics** — `[Export logs] [Open config] [Restart scheduler]`.

The auth callout is its own mini component: colored left border by status,
`row` with name + state on top, italic `desc` line, action button on the
bottom.

### 3. First-run wizard

A **modal over scrim**, ~720px wide, 4 steps. The step rail sits below the
wizard masthead as `[01 Welcome] [02 Sign in] [03 Pair] [04 Rhythm]` — the
active step is filled ink, completed steps are check-marked.

1. **Welcome** — serif headline with italic emphasis: _"A few quiet
   minutes and you're done."_ Card below lists the three things to gather
   (NYT login, tablet with Wi-Fi on, URL for the pair code). Single CTA
   `Begin`.

2. **Sign in to NYT** — `_"Let's meet the paper."_` Email + password
   inputs, `Sign in` button flips to `Signing in…` then `✓ Signed in` with
   an italic line: "Cookie captured. Expires in about 30 days." Auto-
   advances after 500ms.

3. **Pair your tablet** — `_"Introduce the slate."_` Eight-character OTP
   input: 8 separate `<input maxLength=1>` boxes that auto-advance on
   keystroke and backspace to the previous box. `Exchange code` button
   flips to `Pairing…` → `✓ Paired`, italic: "Device registered as 'my-rm'."
   Auto-advance.

4. **Set the rhythm** — `_"Set the rhythm, and rest."_` Day picker, time,
   timezone, folder path. `Finish setup →` button completes.

Bottom bar on every step: left is a `Skip setup for now` ghost link; right
has `[Back]` (step 2+) and a primary advance button (disabled until the
step's task is complete).

---

## Shared components

### DowPicker (day-of-week picker)

Used in both the wizard step 4 and the settings drawer schedule section.
Two stacked rows:

- **Presets** (top): `Every day · Weekdays · Weekends · M · W · F · Clear`
  — thin buttons, active state filled ink.
- **Individual days** (bottom): seven square toggles `S M T W T F S`
  that flip individually. Active state `--accent` background with paper
  text.

Preset clicks set the array directly. Individual toggles XOR their index
into the current array.

### Status pill

`<span class="status-pill ok|warn|err">Delivered</span>`. Tiny mono
uppercase chip, colored by status.

### Tweaks panel (prototype-only)

The prototype includes a floating tweaks panel (bottom-right) for
simulating states: NYT status, reMarkable status, showing/hiding the
wizard, density toggle. **You don't need to ship this in the real app** —
it's purely for the design review. Skip it.

---

## State model

The prototype keeps a single top-level state object:

```js
{
  nytStatus: 'ok' | 'warn' | 'err',
  rmStatus:  'ok' | 'warn' | 'err',
  scheduleDays: number[],            // [0..6], 0 = Sunday
  scheduleTime: string,              // 'HH:mm' 24h
  scheduleTz:   string,              // 'ET' | 'CT' | ...
  rmFolder:     string,              // e.g. '/Crosswords'
  rmPattern:    string,              // e.g. 'NYT Crossword — {date}'
  history:      HistoryRow[],
  selectedDate: string,              // ISO 'YYYY-MM-DD'
  fetch: {                           // transient, while a fetch runs
    phase: 'idle' | 'download' | 'convert' | 'upload' | 'done',
    progress: number,                // 0–100
    log: { ts: string, msg: string, kind?: 'ok'|'err' }[],
  },
}
```

```ts
type HistoryRow = {
  id: string;              // e.g. 'h042'
  puzzle: Date;            // the date the puzzle is FOR
  fetchedAt: Date;         // when we downloaded it
  status: 'ok' | 'err';
  size: string;            // e.g. '218 KB' or '—'
  folder: string;          // e.g. '/Crosswords'
  filename?: string;       // on ok
  reason?: string;         // on err, human-readable
};
```

In the real app, `history` comes from a local SQLite / JSON file the daemon
writes. `fetch` state is live and comes from the currently-running job (if
any) over a local IPC channel or polling endpoint.

---

## Implementation notes & gotchas

- **Grid rendering:** both the All-days and Day-of-week views share the
  same `.cell` primitive and the same `cal-grid-wrap` + `cal-months`
  scaffolding. Keep the primitive rendering data-driven (pass `cellState`,
  `handleClick`, `showTip`) so swapping X/Y axes is a matter of generating
  different date arrays. See `activity-grid.jsx` for the reference split.

- **Tooltip positioning:** use `position: fixed` with `top/left` set from
  the hovered button's `getBoundingClientRect()`, translate `(-50%, calc
  (-100% - 10px))`. This keeps the tooltip outside the grid's scroll
  container so it doesn't clip at the edges.

- **Year clamp:** MIN_YEAR is 2010 (arbitrary — oldest archive year we
  claim to support). MAX_YEAR is the current calendar year.

- **"Now" is fixed in the prototype** (`const NOW = new Date(2026,3,23,...)`)
  so the mock reads the same every time. In the real app, use actual
  `new Date()` and treat `todayIso` as the boundary between past (may
  have `ok`/`err`/`none`) and future (`future-scheduled` / `future`).

- **Click-to-fetch-past** is a real feature, not just a prototype thing.
  The daemon supports back-filling any archive date; the grid click is
  the primary UI for that.

- **Click-to-retry** on err cells: only enabled if both `nytStatus` and
  `rmStatus` are healthy; otherwise toast "Fix connections first."

- **Accessibility:** the pivot and weekday picker use `role="tablist"` /
  `aria-selected`. Grid cells have a full `aria-label` like
  `"April 12, 2026 · ok"`.

- **No emoji anywhere** except the tiny ✓ ✕ ◷ used as pseudo-icons in the
  tooltip + buttons. Match the prototype exactly — don't swap in a real
  icon set.

- **Responsive:** the dashboard layout collapses to a single column below
  ~960px wide (aside drops beneath the grid). The grid itself is allowed
  to overflow horizontally with `overflow-x: auto` inside its wrap —
  never shrink the cells.

---

## Files in `prototype/`

| File | What's in it |
|---|---|
| `Ryans Remarkable.html` | Entry point. Loads fonts, React, Babel, and the JSX files below. |
| `styles.css` | Every style in the prototype. All tokens live at the top. |
| `data.jsx` | Seeded history, date helpers (`isoDate`, `fmtMediumDate`, etc.), `describeSchedule`, `computeNextRun`, fixed `NOW`. |
| `components.jsx` | `StatusPill`, `ToastLayer`, `Modal`, `StatusCard`, `DowPicker`. |
| `app.jsx` | Top-level app shell: masthead, main layout, tweaks panel, toast layer, modal for delivery details. |
| `dashboard.jsx` | The Delivery record + Auto-fetch layout, grid toolbar, and `runFetchSim`. |
| `activity-grid.jsx` | The `ActivityGrid`, `WeekView` (All days), `DowView`, `CellTip`. |
| `settings.jsx` | The right-side settings drawer. |
| `wizard.jsx` | The 4-step first-run wizard. |
| `tweaks-panel.jsx` | Prototype-only tweak controls — don't ship. |

## Files in `screenshots/`

| File | Shows |
|---|---|
| `01-dashboard-allday.png` | Dashboard with the default All-days activity grid. |
| `02-dashboard-dow.png`    | Dashboard with the Day-of-week view active (weekday picker visible). |
| `03-settings.png`         | Settings drawer open over the dashboard. |

---

## Recommended build order

1. Scaffold the page shell: masthead, main + aside layout, colophon,
   global color/font tokens.
2. Stub out `ActivityGrid` with hardcoded data — get the All-days cell
   grid rendering at the right size and pitch before doing anything else.
   Everything else hangs off this view.
3. Add the tooltip, legend, and cell-click handlers.
4. Add the grid toolbar (pivot, year stepper, weekday picker).
5. Implement the Day-of-week view — it reuses the same cell primitive,
   just different date arrays.
6. Build the auto-fetch aside + the fetch progress strip.
7. Wire in the real daemon data source (history + live fetch state).
8. Build the settings drawer.
9. Build the wizard.
10. Polish states: `ok`/`warn`/`err` on the masthead lights, toasts,
    empty/disconnected states.
