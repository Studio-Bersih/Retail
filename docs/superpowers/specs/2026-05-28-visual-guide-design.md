---
title: Visual Design System & UI/UX Guide
date: 2026-05-28
status: approved
---

# Visual Design System — Studio Bersih POS

## Overview

This spec records the design decisions made during the May 28 brainstorming session that produced the revised `docs/ui-ux.md`. It serves as the rationale document behind the cheat-sheet reference; implementation should derive from `ui-ux.md` directly.

---

## 1. Palette & Theming

**Decision:** Warm brown palette inspired by Claude's default UI, not a stock DaisyUI theme.

**Primary:** `#C2622A` (burnt orange-brown). Same value in both light and dark themes — the brand accent never shifts.

**Two named themes** registered in `tailwind.config.js`:
- `bersih` — cream/warm-white backgrounds, dark warm text
- `bersih-dark` — deep espresso backgrounds, warm cream text

**Drawer** is always dark (`#2C1E12` / `#0F0A05`) regardless of active theme. This separates navigation chrome from content and creates a consistent left-rail identity.

**Semantic color tokens** (success / error / warning / info) follow the warm palette: muted greens and ambers in light mode, neon variants in dark mode. These are defined as DaisyUI theme values, not custom CSS vars.

**Rejected:** A dark sidebar as the primary navigation chrome — replaced by a hamburger-triggered drawer (see §3).

---

## 2. Typography & Spacing

**Font family:** System stack only (`'Inter', 'Segoe UI', system-ui, sans-serif`). No custom font loaded — avoids FOUT and reduces bundle size.

**Scale:** 7 roles (Page title → Caption), all under 20px. Declared as Tailwind class strings, not a custom `@font-face` or CSS var — stays within DaisyUI's defaults and can be applied anywhere.

**Spacing:** Closed set of gap/padding values (listed in `ui-ux.md §3`). Arbitrary additions must update the table — prevents drift across features.

**Border radii:** 8 discrete values. Higher radius = higher stakes (payment modal at 14px, standard buttons at 7px).

---

## 3. Navigation Architecture

**Pattern:** Single fixed navbar (`56px` tall) with a hamburger-triggered slide-in drawer.

**Rejected alternatives:**
- Persistent sidebar — occupies horizontal real estate; poor fit for a POS used on tablets and smaller monitors
- Top tab bar (separate from navbar) — creates a "double bar" feel; wasted vertical space

**Navbar layout (left → right):**
```
[☰] [Logo] [|] [Retail] [Order] [── tab strip flex:1 ──] [＋] [Greeting/outlet·version] [|] [☀/🌙] [RK avatar]
```

The tab strip uses `flex:1 min-w-0` to absorb all available space between the quick actions and the greeting zone. Tabs scroll horizontally (invisible scrollbar) when they overflow.

**Drawer:** 252px, slides from left, dark background, contains the full navigation tree. Closes on backdrop click or `Esc`. Mirrors the navbar height so header aligns visually when drawer is open.

---

## 4. Tab System

**Decision:** Chrome-style multi-tab navigation — users can open multiple features simultaneously and switch without losing state.

**Key properties:**
- Tabs live in the layout component's `$state` — not in a Svelte store and not persisted to localStorage
- Ephemeral: tabs are lost on page refresh (intentional — POS sessions are short; no value in restoring stale tab state)
- Active tab: orange underline (`2px`, `var(--primary)`) + tinted background (`var(--tab-active-bg)`) — browser tab metaphor without the trapezoid shape
- Inactive tabs: muted text, transparent background, soft hover

**Empty state:** When no tabs are open, a full-viewport-height grid shows 6 feature cards (`Retail`, `Order`, `Pesanan`, `Riwayat`, `Kasir Harian`, `Master Item`). Copywriting: "Mau mulai dari mana?" — friendly, not clinical.

**Quick actions (`Retail` + `Order` buttons):** Pinned in the navbar so the most-used flows are reachable without opening the drawer or locating a tab.

---

## 5. Icon System

**Library:** Lucide Icons (MIT licensed, lucide.dev). Chosen over Apple SF Symbols because SF Symbols are Apple-platform-exclusive (no web embedding license). Lucide is visually similar, web-first, and MIT.

**Storage:** Downloaded as `.svg` files to `/static/icons/kebab-case.svg`. Source drawn directly from lucide.dev.

**Usage:** Inline SVG preferred (inherits `currentColor`). `<img>` tag acceptable when color control is not needed.

**Inventory:** 24 icons initially (see `ui-ux.md §4`). New icons must be added to the inventory table.

---

## 6. Theme Toggle

**Mechanism:** `data-theme` attribute on `<html>` element, switched by a Svelte 5 `$effect`. DaisyUI reads this attribute to apply the correct theme token set.

**Toggle control:** Pill-shaped toggle (`38×20px`) with sun/moon icons flanking it. Smooth CSS transition (`250ms`). Toggle track turns `var(--primary)` in dark mode.

**No persistence:** Theme state is not saved to localStorage in the base spec. A follow-up can add persistence if user preference retention is prioritized.

---

## 7. Component Conventions

**Buttons:** 7 variants (primary, ghost, outline, error, warning, success, icon-only). All use `btn-sm`. Never two primary buttons adjacent to each other.

**Modals:** Inline in `+page.svelte` unless shared across pages. High-stakes modals (payment, deletion) require `backdrop-blur-sm`. Triggered by `$state(false)` boolean — no dialog element or portal.

**Toasts:** `svelte-sonner` with `richColors` always on. No custom toast styles.

**Tables:** Every list page gets search + per-page dropdown + pagination as a unit. The canonical Svelte 5 rune block in `ui-ux.md §6` is copied verbatim; field names are the only thing adjusted per feature.

---

## 8. Reference Document Format

**Decision:** Full self-contained developer cheat-sheet (`ui-ux.md`) rather than a prose narrative.

**Format:** Every section leads with the value or class string — no prose before the answer. Tables for tokens and inventories. Copy-paste Svelte blocks for patterns.

**Audience:** The implementing developer reading `ui-ux.md` in a code editor alongside the Svelte file they are writing.

**Rationale:** A cheat-sheet consulted during implementation is more useful than a design narrative that requires interpretation. All design rationale lives here (in this spec); all actionable values live in `ui-ux.md`.

---

## What Is Not In Scope

- Animation library (framer-motion, auto-animate) — `fadeSlideIn` keyframe in `app.css` is sufficient
- Custom font loading — system stack chosen explicitly
- Tab persistence across sessions — intentionally excluded; sessions are short
- Mobile-first responsive breakpoints — POS is tablet/desktop targeted; no `sm:`/`md:` breakpoints specified
