# Recomp Tracker — Design System & Feature Spec

## Design Principles

1. **Intentional, not generic.** Every color, font, and spacing decision is specific to this app. No generic card grids or bootstrap patterns.
2. **Dark feminine aesthetic.** Deep mauve/crimson backgrounds + hot pink gradient accents. Feels like a late-night journal, not a fitness dashboard.
3. **Delight where it counts.** Celebration overlay, floating hearts, hype messages — only on real wins (perfect day). Not everywhere.
4. **Data density with breathing room.** 44px cells, 11px date labels, subtle borders. Dense but not claustrophobic.
5. **Mobile-first.** Everything below 480px collapses to single column. Touch targets minimum 44px.

---

## Color System

| Token | Value | Use |
|-------|-------|-----|
| `bg-deep` | `#1a0a10` | App background |
| `bg-mid` | `#120810` | Gradient mid |
| `bg-dark` | `#0d0609` | Gradient bottom |
| `pink-primary` | `#ff6b9d` | Primary accent, links, active |
| `pink-hot` | `#e84393` | Gradient end, CTA buttons |
| `pink-light` | `#ff85b3` | Text accents, titles |
| `pink-pale` | `#ffb6d3` | Soft highlights |
| `pink-ghost` | `#ffd1e3` | Disabled highlights |
| `text-primary` | `#e8c8d8` | Body text |
| `text-muted` | `#886677` | Secondary text |
| `text-dim` | `#664455` | Tertiary text, subtext |
| `text-faint` | `#553344` | Very muted, barely visible |
| `border` | `rgba(255,107,157,0.12)` | Default border |
| `border-active` | `rgba(255,107,157,0.4)` | Active/focused border |
| `surface` | `rgba(255,107,157,0.04)` | Card backgrounds |
| `surface-active` | `rgba(255,107,157,0.12)` | Active cell/card bg |

### Gradients
- **Title gradient:** `linear-gradient(135deg, #ff6b9d, #e84393, #ff85b3)` — applied as `-webkit-background-clip: text`
- **CTA button:** `linear-gradient(135deg, #ff6b9d, #e84393)`
- **Progress bar (full):** `linear-gradient(90deg, #ff6b9d, #e84393, #a855f7)`
- **Progress bar (mid):** `linear-gradient(90deg, #ff6b9d, #ffb6d3)`
- **Progress bar (early):** `linear-gradient(90deg, #ffb6d3, #ffd1e3)`

---

## Typography

| Role | Font | Size | Weight | Notes |
|------|------|------|--------|-------|
| App title (RECOMP) | Playfair Display | 32px | 800 | `letterSpacing: 6px`, gradient text |
| Section header | DM Sans | 12px | 700 | `letterSpacing: 3px`, ALL CAPS |
| Week label | DM Sans | 16px | 700 | `letterSpacing: 1px` |
| Body / param name | DM Sans | 13px | 600 | |
| Subtext | DM Sans | 11px | 400 | `color: text-dim` |
| Day name (Mon…) | DM Sans | 13px | 700 | `letterSpacing: 1px` |
| Date label | DM Sans | 11px | 500 | `color: text-faint` (min readable) |
| Tiny label | DM Sans | 10px | 600 | Use sparingly — milestones only |

---

## Spacing Scale

`4 / 6 / 8 / 12 / 14 / 16 / 20 / 24 / 40` — stick to these.

---

## Component Patterns

### Grid Cell
```
width: 44px, height: 44px
borderRadius: 10px
border: 1px solid rgba(255,107,157,0.12)
bg: rgba(255,107,157,0.03)

Active:
  bg: rgba(255,107,157,0.12)
  border: 1px solid rgba(255,107,157,0.4)
  boxShadow: 0 0 12px rgba(255,107,157,0.15)

Hover (via .rc-cell CSS class):
  bg: rgba(255,107,157,0.09)
  border-color: rgba(255,107,157,0.35)

Active:
  transform: scale(0.92)

Disabled:
  bg: rgba(255,107,157,0.01)
  border: 1px solid rgba(255,107,157,0.04)
  opacity: 0.2
```

### Card
```
bg: rgba(255,107,157,0.04)
border: 1px solid rgba(255,107,157,0.1)
borderRadius: 14px
padding: 16px
```

### Button — Primary CTA
```
bg: linear-gradient(135deg, #ff6b9d, #e84393)
border: none, color: #fff
padding: 14px 40px, borderRadius: 50px
fontSize: 16px, fontWeight: 700, letterSpacing: 1px
boxShadow: 0 4px 20px rgba(255,107,157,0.4)
```

### Button — Ghost
```
bg: rgba(255,107,157,0.08)
border: 1px solid rgba(255,107,157,0.15)
color: #ff85b3
borderRadius: 8px, padding: 8px 16px
Hover (.rc-weekbtn): bg rgba(255,107,157,0.14)
```

### Rating Buttons (1-5)
```
flex: 1, padding: 10px 0, minHeight: 44px
bg: rgba(255,107,157,0.04)
border: 1px solid rgba(255,107,157,0.12)
borderRadius: 10px, color: #664455
Active: bg rgba(255,107,157,0.15), border rgba(255,107,157,0.4), color #ff6b9d
Unset: null value — buttons show no highlighted state
Hover (.rc-rating): bg rgba(255,107,157,0.1), color #ffb6d3
```

### Tab Bar
```
flex row, full width
Default: color: #664455, borderBottom: 2px solid transparent
Active: color: #ff85b3, borderBottom: 2px solid #ff6b9d
```

---

## Tab Structure

```
Daily  |  Weekly  |  Lifts  |  Notes
```

- **Daily** — 8-row × 7-day adherence grid
- **Weekly** — Check-in metrics (weight, waist, bf%, energy, mood, soreness)
- **Lifts** — Strength training log (see spec below)
- **Notes** — Free-form weekly journal

---

## Lifts Tab — Full Design Spec

### Overview
Log gym sessions by pasting free-form text (same format as Keep Notes). The app parses it into structured data, displays a confirmation, stores history, and renders progression charts per exercise.

### Input Area

```
┌────────────────────────────────────────────┐
│ Apr 5 — gym session                         │
│ farmer walk — 24kg 50 steps                 │
│ lat pulldowns 3x12 @40kg                    │
│ shoulder press 3x10 @15kg                   │
│ goblet squat 3x15 @16kg                     │
│ hip hinge 3x12 @20kg                        │
│ plank hold 3x45s                            │
└────────────────────────────────────────────┘
                [ Log it 💪 ]
```

**Style:** Same as `notesArea` — `rgba(255,107,157,0.03)` bg, `rgba(255,107,157,0.1)` border, 14px, `borderRadius: 14px`.

**Placeholder (shown when empty):**
```
Apr 5 — gym session
farmer walk — 24kg 50 steps
lat pulls 3x12 @40kg
shoulder press 3x10 @15kg
goblet squat 3x15 @16kg
hip hinge 3x12 @20kg
plank hold 3x45s
```

**"Log it" button:** Same as primary CTA but smaller — `padding: 10px 28px, fontSize: 14px`.

**Session accumulation — Keep Notes style:**
Each "Log it" MERGES new exercises into today's existing session (append, not replace). The user logs one exercise at a time after completing it. Textarea starts empty each time. Today's growing session is shown in the history list after every save. If the same exercise is logged twice in one day, new sets are APPENDED. This is the core UX contract for the Lifts tab.

### Parse Logic (client-side, no LLM required)

The parser handles these formats:
```
farmer walk — 24kg 50 steps       → { exercise: "Farmer Walk", weight: 24, unit: "kg", steps: 50 }
lat pulls 3x12 @40kg              → { exercise: "Lat Pulldown", sets: 3, reps: 12, weight: 40, unit: "kg" }
shoulder press 3x10 @15kg         → { exercise: "Shoulder Press", sets: 3, reps: 10, weight: 15, unit: "kg" }
goblet squat 3x15 @16kg           → { exercise: "Goblet Squat", sets: 3, reps: 15, weight: 16, unit: "kg" }
hip hinge 3x12 @20kg              → { exercise: "Hip Hinge", sets: 3, reps: 12, weight: 20, unit: "kg" }
plank hold 3x45s                  → { exercise: "Plank", sets: 3, duration: 45, unit: "s" }
```

Lines starting with a date header (e.g. "Apr 5", "April 5", "4/5") set the session date. All subsequent lines are exercises.

Unrecognized lines are stored as raw strings (shown in confirmation as "unrecognized: xyz") but not discarded.

### Confirmation Card (shown immediately after parse)

Appears below the input area. Shows parsed result with a muted pink card:

```
✓ Parsed — Apr 5
────────────────────────────────
🚶‍♀️ Farmer Walk    24kg × 50 steps
💪 Lat Pulldown   3×12 @ 40kg
🏋️‍♀️ Shoulder Press  3×10 @ 15kg
🏋️‍♀️ Goblet Squat    3×15 @ 16kg
🏋️‍♀️ Hip Hinge       3×12 @ 20kg
⏱  Plank Hold      3 × 45s
────────────────────────────────
[ ✓ Looks right — save it ]  [ Clear ]
```

"Save it" persists to Redis/localStorage. Input clears. Confirmation fades out.
"Clear" resets everything without saving.

**Style:** Same card pattern (`rgba(255,107,157,0.04)` bg, `1px solid rgba(255,107,157,0.1)` border, `borderRadius: 14px`).

### Session History

Below the input (or after save), show logged sessions in reverse chronological order.

Each session is a collapsible row:
```
Apr 5  ·  6 exercises  ·  Farmer Walk 24kg, Press 15kg …        [▼]
Apr 1  ·  6 exercises  ·  Farmer Walk 22kg, Press 12.5kg …      [▼]
```

When expanded, shows the full parsed confirmation card layout.

**Style:** Each row `borderBottom: 1px solid rgba(255,107,157,0.06)`, `padding: 12px 0`, `fontSize: 13px`, `color: #886677`.

### Progression Charts

Shown below session history. One chart per tracked exercise.

**Chart design:**
- SVG polyline — matching the adherence ring aesthetic
- X-axis: session dates (abbreviated: "Apr 5", "Apr 1")
- Y-axis: primary metric (kg for weighted exercises, steps for farmer walk, seconds for plank)
- Pink dots at each data point (`#ff6b9d`, radius 4px)
- Connecting lines: `rgba(255,107,157,0.5)`, `strokeWidth: 2`
- Background grid lines: `rgba(255,107,157,0.05)`
- Chart area bg: `rgba(255,107,157,0.02)`
- `borderRadius: 14px`, `border: 1px solid rgba(255,107,157,0.08)`

**Per-exercise layout:**
```
┌────────────────────────────────────────┐
│ 🏋️‍♀️ Shoulder Press                         │
│                              +5kg total│
│ 20 ·                        ●──────────●│
│ 17.5·           ●──────────●          │
│ 15 · ●──────────●                     │
│      Apr 1  Apr 5  Apr 10  Apr 15     │
│                                        │
│ ⚡ Plateau: held 12.5kg for 3 sessions │
│   → Try: +2.5kg or aim for 12 reps    │
└────────────────────────────────────────┘
```

### Plateau Detection

After 3+ sessions with the same weight (or decreasing), show a warning:

**Style:**
```
background: rgba(255, 200, 50, 0.08)
border: 1px solid rgba(255, 200, 50, 0.2)
borderRadius: 8px
padding: 8px 12px
fontSize: 12px
color: #d4a800
```

Text format: `⚡ Plateau: held {weight}kg for {n} sessions → Try: +2.5kg or aim for {reps+1} reps`

**Logic:** Compare last 3 `weight` values for same exercise. If max − min ≤ 0, plateau = true. Show under the chart, not as a modal/toast.

### Empty State

When no sessions have been logged:
```
🏋️‍♀️
No gym sessions logged yet.

Paste your session notes above and hit "Log it".
Format: exercise name, weight/reps, e.g.
  shoulder press 3x10 @15kg
```

**Style:** `textAlign: center`, `padding: 40px 20px`, `color: #664455`, `fontSize: 14px`.

### Mobile

- Input textarea: full width, `minHeight: 140px`
- Chart: full width, `height: 120px` (compact)
- Session history rows: full width
- No horizontal scrolling needed — charts scale to container

---

## Existing Gaps Fixed (2026-04-05 design review)

| # | Gap | Fix |
|---|-----|-----|
| D-001 | No hover state on grid cells | `.rc-cell:hover` CSS class added to APP_CSS |
| D-002 | Week nav no disabled visual at boundaries | `opacity: 0.3 + pointerEvents: none` when at week 0 or maxWeek |
| D-003 | Rating buttons default to 3 (looks pre-filled) | Default changed to `null` — no button highlighted until user taps |
| D-004 | `dayDate` 10px font below accessible minimum | Bumped to 11px, color lightened to `#664455` |
| D-005 | Weekly check-in 2-col grid: rating buttons ~21px wide on mobile | `@media (max-width: 480px)` collapses to 1 column |
| D-006 | Guest "sign in" hint nearly invisible (11px, `#664455`) | 12px, `#886677` |
| D-007 | No DESIGN.md — design system was implicit | This file |

---

## Deferred / Out of Scope

- Scroll affordance gradient on grid (right-side fade) — low priority, users are used to scroll
- Progress milestone label overlap on narrow screens — affects <320px width only
- `aria-label` on grid cells (A-001 from QA log) — low priority, personal use app
