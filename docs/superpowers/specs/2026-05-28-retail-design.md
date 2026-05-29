# Retail Page Design Spec

**Date:** 2026-05-28
**Status:** Approved

---

## Overview

The Retail page is the primary point-of-sale interface for cashiers. It handles product scanning, cart management, member lookup, pricing adjustments, and payment confirmation. It operates in a single-cart session (no multi-tab) for this version.

---

## Out of Scope

- **Kupon / promo application** — separate integration pass
- **QRIS QR code display** — deferred (OQ-R01)
- **Order mode** — separate spec and implementation
- **Multi-tab sessions** — future enhancement
- **Receipt printing** — separate utility

---

## Files

| File | Role |
|---|---|
| `src/routes/outlet/retail/+page.svelte` | Orchestrator. Full 35/65 layout. Contains all four snippets and wires everything to the cart store. |
| `src/library/components/outlet/retail/PaymentModal.svelte` | Payment modal. Isolated because it is a modal/form complex enough to deserve separation (CLAUDE.md exception). Uses `<Modal size="lg">`. |
| `src/library/stores/cart.ts` | Single writable store for all live transaction state. |
| `src/library/types/Cart.ts` | `CartItem` and `CartState` interfaces. |

No other component files. CartSection and PricingPanel live as `{#snippet}` blocks inside `+page.svelte`.

---

## Backend Change — `kategori_acara`

Add a nullable `VARCHAR` column `kategori_acara` to the `transactions` table.

**Drizzle schema (`server/src/db/schema.ts`):**
```typescript
kategoriAcara: varchar('kategori_acara', { length: 100 })
```

**Model (`server/src/models/transactions.model.ts`):** pass `kategoriAcara` from payload into the `db.insert(transactions)` call.

**Payload validation:** add `kategoriAcara: z.string().optional()` to the transaction body schema. Defaults to `"Private Event"` on the frontend if not set.

---

## Cart Store — `src/library/stores/cart.ts`

```typescript
// src/library/types/Cart.ts
export interface CartItem {
    id:          string
    name:        string
    sku:         string
    price:       number      // unit price; always 0 when isFree
    qty:         number
    isFree:      boolean
    stock:       number      // current outlet stock — display only
    preAdjDelta: number      // pending pre-adjustment delta — display only
}

export interface CartState {
    items:           CartItem[]
    memberId:        string | null
    memberName:      string | null
    memberPhone:     string | null
    isPremiumMember: boolean
    percentDiscount: number
    fixedDiscount:   number
    additionalCosts: { packaging: number; transport: number; modification: number }
    paymentMethods:  Array<{ method: string; amount: number }>
    kategoriAcara:   string
    notes:           string
}
```

**Initial state:**
```typescript
const initial: CartState = {
    items:           [],
    memberId:        null,
    memberName:      null,
    memberPhone:     null,
    isPremiumMember: false,
    percentDiscount: 0,
    fixedDiscount:   0,
    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
    paymentMethods:  [{ method: 'Tunai', amount: 0 }],
    kategoriAcara:   'Private Event',
    notes:           '',
}
```

**Exported helper functions:**
- `addItem(item: CartItem)` — appends if no matching `id + isFree` combo exists; increments qty if match found
- `removeItem(id: string, isFree: boolean)` — removes the matching row
- `setQty(id: string, isFree: boolean, qty: number)` — sets qty; removes row if qty ≤ 0
- `setMember(id, name, phone, isPremium)` — sets member fields
- `clearMember()` — nulls all member fields
- `clearCart()` — resets store to initial state

**Derived values** — computed inline in the page with `$derived`, never stored:
```typescript
let subtotal      = $derived(cart.items.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.qty, 0))
let discount      = $derived(subtotal * cart.percentDiscount / 100 + cart.fixedDiscount)
let additionalTotal = $derived(cart.additionalCosts.packaging + cart.additionalCosts.transport + cart.additionalCosts.modification)
let total         = $derived(Math.max(0, subtotal - discount + additionalTotal))
let totalPaid     = $derived(cart.paymentMethods.reduce((s, m) => s + m.amount, 0))
let kembalian     = $derived(totalPaid - total)
```

---

## Page Layout — `+page.svelte`

35% left pane / 65% right pane, `height: 100vh - navbarHeight`, no page scroll.

```svelte
<div class="page">
    <div class="left-pane">
        <div class="card">{@render searchField()}</div>
        <div class="card flex-1 overflow-hidden">
            {@render memberField()}
            {@render pricingPanel()}
        </div>
    </div>
    <div class="right-pane">
        <div class="card flex-1 overflow-hidden">
            {@render cartRows()}
        </div>
    </div>
</div>

<PaymentModal bind:isModal={payModalOpen} {total} {totalPaid} {kembalian} />
```

---

## Snippet — `{#snippet searchField()}`

**CARI PRODUK card.** Single `<input>` at the top, auto-focused on mount and after every item add (`tick()` + `input.focus()`).

### Search mode (partial text)

- On input: debounce 300ms, call `GET /api/items?outletId=&search=`
- Show dropdown below the input (absolute-positioned, z-index above pricing card)
- Each row: item name, SKU (monospace), stock, unit price
- Keyboard: `↑ ↓` move highlight; `← →` toggle BAYAR / GRATIS on highlighted row; `Enter` → open qty prompt; `Esc` → clear input and close dropdown

**BAYAR / GRATIS toggle on highlighted row:**
- Default: BAYAR (orange pill active, normal price shown)
- After `←` or `→`: GRATIS (green pill active, price shows "GRATIS", row tints green)
- Toggle state is ephemeral — resets to BAYAR when highlight moves to a different row

### Exact SKU mode

- If input matches `/^[A-Z0-9]+-[A-Z0-9]+$/` (e.g. `SKU-001`): skip debounce, fetch immediately, skip list, jump straight to qty prompt

### Qty prompt (replaces dropdown)

Appears in the same position as the dropdown.

- Shows: item name, SKU, unit price (or "GRATIS"), "Sudah di keranjang: N pcs" if same `id + isFree` combo exists in cart
- `<input type="number" min="1">` auto-selected on open
- `Enter` → call `addItem(...)`, close prompt, re-focus search input
- `Esc` → return to dropdown (does not close it, restores previous search results)

### Mode badge

Below the input: "Mode Retail" pill. Non-interactive in this spec.

---

## Snippet — `{#snippet memberField()}`

**MEMBER section** inside the pricing card.

Single `<input>` with person icon. Placeholder: "Nama, ID, atau nomor HP..."

### Exact match (immediate fetch)
- Input starts with `MBR-` → exact ID lookup
- Input is all digits ≥ 8 chars → phone number lookup
- On match: hide input, show member card immediately

### Partial name (debounce)
- Debounce 300ms, call `GET /api/members?search=`
- Show dropdown (max 5 rows): name, member ID
- `↑ ↓` navigate; `Enter` selects; `Esc` clears input
- If no results: single "Tidak ditemukan" row, non-selectable

### Member card (selected state)

**Regular member** — green card:
```
┌─────────────────────────────────┐  green border
│ [SR]  Sari Rahayu               │
│       MBR-00124 · 0812-xxx-xxxx ×│
└─────────────────────────────────┘
```

**Premium member** — amber/gold card:
```
┌──────────────────────────────────────┐  amber border
│ ♛  Sari Rahayu         [PREMIUM]    │  gold name, amber bg
│    MBR-00124 · 0812-xxx-xxxx       × │
└──────────────────────────────────────┘
```

- `×` clears selection, restores the search input
- No indicator on regular members — only premium gets the gold treatment

---

## Snippet — `{#snippet pricingPanel()}`

Inside the same pricing card, below the member section. Separated by a `<hr>`.

```
Subtotal           Rp 500.000          (read-only)
[Diskon %  ] [Diskon Rp  ]            (<Rupiah> inputs, side by side)
Potongan           – Rp 50.000         (read-only, green)

▲ Biaya Tambahan              Rp 15.000  (collapsible, defaults open, chevron toggles)
  Packaging   [Rp 10.000]
  Transport   [Rp  5.000]
  Modifikasi  [Rp      0]

──────────────────────────────
TOTAL              Rp 465.000          (large, orange)

[  Bayar Sekarang   Ctrl+Enter  ]      (disabled if cart.items is empty)
```

All currency inputs use `<Rupiah bind:value={...} />`.

---

## Snippet — `{#snippet cartRows()}`

**KERANJANG section** — right pane, full height, scrollable body.

**Column layout:** `[Produk 1fr] [Qty 96px] [Subtotal 88px] [Del 22px]`

Row numbers (`#1`, `#2`...) are absolute-positioned 18px to the left of each row, outside the grid.

**Regular row:**
```
#1  Sabun Cuci Muka Premium          −  3  +    Rp 225.000   🗑
    SKU-001
    Stok: 48 pcs  [pre-adj +5]
```

**Free row** (immediately after its paired regular row, separated by dashed connector):
```
    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·   (dashed line)
#2  Sabun Cuci Muka Premium          −  1  +      GRATIS     🗑
    SKU-001
    [GRATIS]  Stok: 48 pcs  [pre-adj +5]
```
- Free rows: green name, green qty controls, green "GRATIS" price, `GRATIS` badge
- Dashed connector: `background: repeating-linear-gradient(90deg, ...)`

**Low stock indicator:** when `stock ≤ 5` → stock value in amber + `⚠ hampir habis` badge.

**Pre-adj delta:** positive = green badge (`▲ +N`), negative = red badge (`▼ −N`), zero = hidden.

Cart header shows total row count and total pcs. "Kosongkan" button clears cart (no confirm dialog).

---

## PaymentModal — `PaymentModal.svelte`

Uses `<Modal size="lg" title="Konfirmasi Pembayaran" bind:isModal>`.

**Props:**
```typescript
interface Props {
    isModal:   boolean
    total:     number
    totalPaid: number
    kembalian: number
}
```
The modal imports the cart store directly to build the payload and calls `clearCart()` on success. No callback needed from the parent.

Internally uses `{#snippet}` to organize its own sections:
- `{#snippet totalBox()}` — large total tagihan display
- `{#snippet paymentMethods()}` — dynamic method rows
- `{#snippet summaryBox()}` — per-method breakdown + kembalian
- `{#snippet formFields()}` — Catatan textarea + Kategori Acara select

**Payment methods list:**
- Tunai row: always first, cannot be removed, `<Rupiah bind:value>` for amount
- Additional rows: provider `<select>` (options from `GET /api/config/payment-methods`, fetched on modal open) + `<Rupiah bind:value>` + remove `×`
- When selected provider is `QRIS`: expand a placeholder QR panel below (grey box, "QRIS akan tampil di sini — OQ-R01")
- "+ Tambah metode pembayaran" dashed button appends new row with first available provider pre-selected

**Summary box:**
```
Total tagihan      Rp 465.000
Tunai              Rp 300.000
QRIS               Rp 165.000
──────────────────────────────
Total dibayar      Rp 465.000
Kembalian tunai    Rp       0    (only shown when Tunai method exists)
```

**Kategori Acara `<select>`** — hardcoded, default "Private Event":
```
Private Event · Pernikahan · Pengajian / Acara Keagamaan · Ulang Tahun
Wisuda · Reuni · Gathering Kantor · Sunatan · Acara Sosial / Komunitas
Tidak Ada Acara
```

**Konfirmasi button:** disabled when `totalPaid < total`. On click:
1. Build transaction payload (from cart store + derived values + kategoriAcara + notes)
2. POST to `POST /api/transactions` with `X-Idempotency-Key: crypto.randomUUID()`
3. On 201: `clearCart()`, close modal, re-focus search, show success toast
4. On 409 `STOCK_INSUFFICIENT`: toast "Stok [nama item] tidak mencukupi", keep modal open
5. On 409 `COUPON_EXHAUSTED`: toast "Kupon sudah habis", keep modal open
6. On any other error: toast generic error message, keep modal open

**Transaction payload shape:**
```typescript
{
    memberId:        cart.memberId,
    mode:            'retail',
    items:           cart.items.map(i => ({ id: i.id, qty: i.qty, price: i.price, isFree: i.isFree })),
    subtotal,
    kupon:           null,                // reserved for kupon integration pass
    additionalCosts: cart.additionalCosts,
    total,
    notes:           cart.notes,
    kategoriAcara:   cart.kategoriAcara,
    paymentMethods:  cart.paymentMethods,
}
```

---

## Keyboard Shortcuts

| Key | Scope | Action |
|---|---|---|
| `Ctrl+Enter` | Page | Open payment modal (if cart non-empty) |
| `Ctrl+Enter` | Payment modal | Confirm payment (if totalPaid ≥ total) |
| `Esc` | Payment modal | Close modal |
| `Esc` | Qty prompt | Return to search dropdown |
| `Esc` | Search dropdown | Clear input, close dropdown |
| `↑ ↓` | Search dropdown | Navigate items |
| `← →` | Search dropdown (highlighted row) | Toggle BAYAR / GRATIS |
| `↑ ↓` | Member dropdown | Navigate members |
| `Enter` | Member dropdown | Select highlighted member |

---

## API Calls

| Endpoint | When |
|---|---|
| `GET /api/items?outletId=&search=` | On search input (debounced 300ms or immediate for SKU) |
| `GET /api/members?search=` | On member input (debounced 300ms or immediate for ID/phone) |
| `GET /api/config/payment-methods?outletId=` | On payment modal open |
| `POST /api/transactions` | On payment confirm |

---

## Mock Data Requirements

- `mock/items.ts` — at least 20 items with varied SKUs, categories, stock levels (some low ≤ 5), preAdjDelta values
- `mock/members.ts` — at least 10 members, mix of regular and premium (`isPremium: boolean`)
- `mock/payment-methods.ts` — list of provider names: `["Tunai", "QRIS", "GoPay", "OVO", "Dana", "ShopeePay", "BCA Transfer", "BRI Transfer", "BNI Transfer", "Mandiri Transfer"]`
