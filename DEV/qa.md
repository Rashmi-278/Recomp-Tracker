# QA Log — Recomp Tracker

---

## Session: 2026-04-05 | Branch: main

### Security Fixes (pre-QA)

| # | Issue | Fix | Commit |
|---|-------|-----|--------|
| S-001 | `VITE_UPSTASH_URL` / `VITE_UPSTASH_TOKEN` exposed in client bundle | Created `/api/redis.js` Vercel serverless proxy; vars renamed to `UPSTASH_URL` / `UPSTASH_TOKEN` (no `VITE_` prefix = never bundled) | `4d49e66` |
| S-002 | `VITE_PRIVY_APP_SECRET` exposed in client bundle | Removed from `.env` entirely; client only needs `VITE_PRIVY_APP_ID` | `4d49e66` |
| S-003 | Username reservation was client-side only (could be bypassed by calling Upstash directly) | Username SETNX now routed through `/api/redis` proxy; enforces `recomp-*` key prefix server-side | `4d49e66` |
| S-004 | SPA routing 404s on direct `/:username` access | Added `vercel.json` with SPA rewrite rules | `4d49e66` |

---

### QA Run — 2026-04-05

**Scope:** Full app (guest mode, daily grid, weekly check-in, notes, public profile, mobile)
**Tool:** gstack browse (headless)
**Health score:** 89/100

#### Bugs Found & Fixed

| ID | Severity | Description | Root Cause | Fix | Commit |
|----|----------|-------------|------------|-----|--------|
| ISSUE-002 | High | React warning on every cell click: `"Removing borderColor border — don't mix shorthand and non-shorthand"` | `s.cellActive` / `s.cellDisabled` / `s.ratingBtnActive` used `borderColor` while base styles used `border` (shorthand) | Replaced all 3 `borderColor` occurrences with full `border: "1px solid ..."` in style objects | `7811c2c` |

#### Flows Verified ✅

- Daily grid: checkbox toggle, adherence ring update, localStorage persistence
- Week navigation: ‹/› buttons, disabled days (days before start date) correctly greyed out
- Weekly check-in tab: all 6 inputs (weight, waist, bodyfat, energy, mood, soreness)
- Notes tab: renders correctly
- Public profile route `/testuser`: shows "not found" state with back link
- Mobile 375×812: layout intact, scrollable

#### Known Deferred Issues

| ID | Severity | Description |
|----|----------|-------------|
| A-001 | Low | Grid cell buttons have no `aria-label` — screen readers see 56+ unlabeled buttons. Low priority for personal use. |

---

### Feature: Date labels in column headers — 2026-04-05

**Request:** Show the actual date (e.g. "Apr 5") in each day column.

**Change:** Added a `dateLabel` computed from `gridStart + week*7 + i` to the column header in both `RecompTracker.jsx` and `PublicProfile.jsx`. New `s.dayDate` style (10px, muted pink). Applied to both the main tracker and the public read-only profile view.

**Commit:** `4839323`
