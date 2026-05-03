# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Studio Bersih - POS** is a SvelteKit + TypeScript Point of Sale (POS) web application for multi-outlet retail businesses. This is a documentation-first project — the `/docs/` folder contains the full specification; source code in `src/` is to be implemented against it.

## Tech Stack

- **SvelteKit** with file-based routing (`src/routes/`)
- **TypeScript** throughout
- **TailwindCSS + DaisyUI** — dark-first theme, utility classes only
- **Svelte Stores** for all global state (no external state manager)
- **Vite** (implicit via SvelteKit)
- **Prettier** — 4-space indent, `printWidth: 200`

## Commands

```bash
npm run dev        # Start local dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Lint
npm run format     # Format with Prettier
```

> No `package.json` exists yet. When initializing, install: `@sveltejs/kit`, `svelte`, `typescript`, `tailwindcss`, `daisyui`, `prettier`, `prettier-plugin-svelte`, `svelte-sonner`.

## Architecture

### Routing (`src/routes/`)
- `/` (`+page.svelte`) — Login page
- `/outlet/` — Protected by `+layout.svelte` (redirects unauthenticated to `/`)
  - `dashboard/` — Outlet operational stats
  - `retail/` — Main POS interface
  - `history/retail/` — Paginated transaction logs
- `/factory/` — Admin/multi-outlet dashboard

### Library (`src/library/`)
The core of the app. All business logic lives here.

- **`stores/`** — Four global reactive stores:
  - `auth.ts` — Session (`userId`, `userName`, `role`, `outletId`); persisted in encrypted LocalStorage; cleared by `forceWipe()`
  - `cart.ts` — Active transaction state; item list, pricing, payment methods
  - `mode.ts` — `"retail" | "order"` operational mode switch
  - `toast.ts` — UI notification queue (uses `svelte-sonner`)

- **`hooks/`** — API interaction layer:
  - `useGet.ts` — Data fetching with loading/error states
  - `usePost.ts` — JSON payload submission (checkout, updates)

- **`components/outlet/retail/`** — The main POS feature components:
  - `Retail.svelte` / `Order.svelte` — Top-level mode orchestrators
  - `ProductSearchField.svelte` — SKU vs. keyword input; auto-focuses after every item add
  - `CartSection.svelte` — Cart list, quantities, free-product tracking
  - `PricingPanel.svelte` — Discount (% and fixed), additional costs calculation
  - `PaymentModal.svelte` — Checkout orchestration; builds and submits transaction payload

- **`mock/`** — High-fidelity client-side mocks for offline development. All `useGet`/`usePost` calls fall back to these during dev. Files: `auth.ts`, `items.ts`, `members.ts`, `history.ts`, `outlets.ts`, `promos.ts`, `payment-methods.ts`.

- **`utils/`**:
  - `cleaner.ts` — `forceWipe()`: clears LocalStorage, SessionStorage, all stores, redirects to `/`
  - `formatter.ts` — Date/currency formatting using native `Intl` APIs (Indonesian locale `id-ID`, IDR currency)
  - `Carbon.ts` — Date parsing

- **`types/`** — TypeScript domain types: `Cart.ts`, `Master.ts`

- **`validator/useDefault.ts`** — Singleton for date boundary defaults (first/last/current day of month)

### Transaction Payload Shape
```typescript
{
    auth: { userId: string, outletId: string },
    memberId: string | null,
    items: Array<{ id: string, qty: number, price: number, isFree: boolean }>,
    pricing: {
        subtotal: number,
        percentDiscount: number,
        fixedDiscount: number,
        additionalCost: { packaging: number, transport: number, modification: number },
        total: number
    },
    paymentMethods: Array<{ method: string, amount: number }>,
    notes: string,
    mode: "retail" | "order"
}
```

## Coding Conventions

From `docs/coding-styles.md`:

- **Pure functions** in `utils/` — isolated inputs, no UI side effects
- **Literal union types** over `enum` (e.g., `"retail" | "order"`, not `enum Mode`)
- **Explicit exports** at file bottom (`export { funcA, funcB }`) or inline `export function`
- **Null safety**: strings fall back to `"-"` or `""`, numbers to `0`; use Regex for scrubbing
- **No hardcoded error strings** — source from `useNotice.connection.*` validator mappings
- **Native APIs over packages**: use `Intl.NumberFormat` for IDR currency, `toLocaleDateString` with `id-ID` locale for dates — never MomentJS or similar
- **Store access in non-Svelte scripts**: use `get(storeName)` from `svelte/store`
- **`useDefault`** is the single source of truth for date boundary logic — don't duplicate it

## UI/UX Rules

- **Keyboard-first**: `Ctrl+Enter` = checkout, `Esc` = close modal, arrow keys = navigate lists/quantities
- After any item add or modal close, focus returns to `ProductSearchField`
- Layout: left pane = Search + Pricing, right pane = Cart
- All icons are SVGs in `/static/icons/`
- Modals use backdrop-blur for high-stakes actions (Payment, Promo)

## Authentication

- `$auth` store holds session; persisted in encrypted LocalStorage
- `forceWipe()` in `utils/cleaner.ts` is the single logout/session-expiry handler
- Role-based gating via `$auth.role` (`"cashier" | "manager" | "admin"`)
- Every transaction payload embeds `cashierId` + `outletId` from `$auth` automatically

## Reference Docs

Full specifications are in `/docs/`:
- `overview.md` — Business objectives and pillars
- `features.md` — Feature breakdown
- `structures.md` — Complete `src/` directory layout
- `api.md` — Hooks, stores, mocking system
- `authentication.md` — Auth flow and cleaner protocol
- `database.md` — Entity schemas
- `ui-ux.md` — Design system and keyboard shortcuts
- `coding-styles.md` — Full coding conventions
- `tasks.md` — Implementation task checklist
