# Retail Feature — Design Spec

**Date:** 2026-05-08
**Feature:** Retail (Main POS Interface)
**Status:** Approved

---

## 1. Overview

The Retail page is the core transaction interface of Studio Bersih POS. It handles instant sales (Retail mode) and scheduled orders (Order mode), combining member management, voucher application, cart management, free products, pricing adjustments, and multi-method payment into a single page.

---

## Stock Architecture

| Concern | Detail |
|---|---|
| Item catalog | Source items via `getMasterItems()` from `mock/master-items.ts` — replaces `mock/items.ts`. Use `priceLevel1` as the default retail price. |
| Stock display | `RetailCartItem.stock` is populated from `getDisplayStock(itemId, outletId)` from `mock/master-items.ts` — never from raw `OutletStock.stock` |
| Stock logging | Checkout submission calls `logStockMovement()` from `mock/stock-movements.ts` per line item |
| Source: sale | `"sale"` — `delta = -qty` per item, `sourceId = transactionId` |
| Source: void | `"sale_void"` — `delta = +qty` per item (restores stock), `sourceId = transactionId`. Applied when a PT approval reverses a sold item. |

---

## 2. Data Model

```typescript
// Member
interface Member {
    id: string
    name: string
    whatsapp: string
    birthdate: string       // ISO date string
    address: string
    points: number
    isPremium: boolean
}

// Voucher / Coupon
interface Voucher {
    id: string
    code: string
    label: string
    minTransaction: number  // 0 = no minimum
    requiresMember: boolean
    cartEffects: VoucherEffect[]
}

interface VoucherEffect {
    type: "add_item" | "remove_item" | "set_qty"
    itemId: string
    qty: number
    toFreeSection: boolean  // true = lands in Free Products, false = regular cart
}

// Cart items
interface RetailCartItem {
    id: string
    name: string
    sku: string
    barcode: string         // empty string if none
    price: number
    qty: number
    stock: number           // remaining stock, shown below item name
    isFree: false
}

interface FreeCartItem {
    id: string
    name: string
    sku: string
    barcode: string
    qty: number
    stock: number
    isFree: true
}

// Payment
type PaymentMethod =
    | { type: "cash"; amount: number }
    | { type: "emoney"; provider: string; amount: number }

// Order mode additional fields (null when in Retail mode)
interface OrderMeta {
    orderDate: string           // ISO date
    whatsapp: string
    branchId: string            // defaults to own outlet's id
    hour: string                // "HH:MM"
    deliveryType: "pickup" | "delivery"
}

// Checkout payload
interface RetailPayload {
    auth: { userId: string; outletId: string }
    memberId: string | null
    pointsRedeemed: number              // 0 if none; 1 point = IDR 50.000 off
    kupon: { kode: string; nilaiPotongan: number; cartMutations: KuponCartMutation[]; authNip: string | null } | null
    items: RetailCartItem[]
    freeItems: FreeCartItem[]
    additionalCosts: {
        packaging: number
        modification: number
        transport: number
        other: number
    }
    payments: PaymentMethod[]
    isPiutang: boolean
    piutangAmount: number               // 0 if isPiutang is false
    transactionType: string             // from configurable list; default "Private Event"
    notes: string
    orderMeta: OrderMeta | null
}
```

### Point System

- **Earning:** `floor(transactionTotal / 50000)` points awarded after each completed transaction.
- **Redemption:** 1 point = IDR 50.000 discount. Redeemed points are deducted from the total before payment rows are calculated.

### Piutang (Accounts Receivable)

- `piutangAmount = total − sum(paymentRows)`, calculated live.
- Enabled via a checkbox in the Payment Modal.
- Confirm button activates when `sum(payments) + piutangAmount = total`.
- 100% deferred (cash = 0, full piutang) is valid.
- Piutang transactions are listed on a dedicated Piutang dashboard (separate feature).

---

## 3. Routes & File Structure

```
src/
├── routes/outlet/retail/
│   └── +page.svelte                  ← main orchestrator
│                                        mode toggle, order fields,
│                                        left column, coupon modal (inline),
│                                        search suggestion modal (inline)
│
└── library/components/outlet/retail/
    ├── CartSection.svelte             ← right column: cart rows + free products
    └── PaymentModal.svelte            ← payment modal: summary, payment rows,
                                          piutang, transaction type, confirm CTA
```

**3 Svelte files total.** Coupon modal and search suggestion modal are inline markup inside `+page.svelte`, controlled by single booleans.

---

## 4. Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Retail] [Order]   ← mode toggle                           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  [Order fields — collapsible, only in Order mode]           │
├──────────────────────┬──────────────────────────────────────┤
│  col-span-4          │  col-span-8                          │
│  +page.svelte        │  CartSection.svelte                  │
│                      │                                      │
│  🔍 Search           │  🛒 Cart items                       │
│  👤 Member           │     Item name                        │
│  🎟 Coupon           │     Stock: N tersisa                 │
│  ➕ Additional Cost  │     [−] qty [+]   IDR X   [✕]       │
│  ➖ Additional Cut   │                                      │
│  📝 Keterangan       │  🎁 Free Products (green section)    │
│                      ├──────────────────────────────────────┤
│                      │  [💳 Bayar — IDR X]  (Ctrl+Enter)   │
└──────────────────────┴──────────────────────────────────────┘
```

---

## 5. Left Column — `+page.svelte`

### Mode Toggle

Two buttons: **Retail** (default) and **Order**. Switching to Order reveals the Order Fields block.

### Order Fields (Order mode only)

Shown as a collapsible block directly below the mode toggle:

| Field | Type | Default |
|---|---|---|
| Order Date | Date picker | Today |
| WhatsApp | Text | — |
| Branch | Dropdown (outlets) | Own outlet |
| Hour | Time input (HH:MM) | — |
| Type | Dropdown: Pickup / Delivery | Pickup |

### Search Field

- `ESC` from anywhere → focus this field (unless a modal is open; ESC closes the modal first).
- **Exact SKU or barcode match:** auto-inserts 1 qty to cart, clears the field.
- **Name / partial search:** opens the Search Suggestion Modal.

### Search Suggestion Modal (inline)

Triggered by name search. Dismissed by `ESC`.

- Lists matching products, each row showing: name, SKU, barcode (if present), stock.
- `↑ / ↓` — navigate rows.
- `← / →` — toggle destination: **Cart** (default, highlighted) or **Free Products**.
- `Enter` — opens inline qty prompt at the bottom of the modal: *"Berapa banyak?"*
  - Type a number → inserts that qty to the selected destination, closes modal, clears field.
  - `ESC` → closes modal without inserting.

### Member Section

- Search input to find a member.
- When selected, shows a member card with: Name, premium badge (if `isPremium`), WhatsApp, Address, Birthdate, Points balance (e.g., "8 pts = IDR 400.000").
- **Redeem button** — opens a simple inline prompt to enter how many points to redeem (validated: cannot exceed available points or make total negative).

### Coupon Section

- A button labelled "🎟 Browse / Enter Code" opens the Coupon Modal.
- When a voucher is active, the section shows the active code and a remove button.

### Coupon Modal (inline)

- **Code search field** at the top — filters the list and can unlock a specific voucher by exact code (scratch-card flow).
- **Voucher list** — all vouchers always shown:
  - **Available** (bright): min transaction met and member condition satisfied. Shows what the voucher does.
  - **Disabled** (dimmed): shows the exact blocking reason ("Transaksi kurang IDR X" or "Pilih member terlebih dahulu").
- Selecting a voucher applies its `cartEffects` immediately:
  - `add_item` with `toFreeSection: true` → item added to Free Products section.
  - `add_item` with `toFreeSection: false` → item added to regular cart.
  - `remove_item` → item removed from cart.
  - `set_qty` → adjusts qty of an existing cart row.
- **One voucher at a time.** Selecting a new one replaces the current one and reverses the previous effects.

### Additional Cost

Four fixed-IDR fields in a 2×2 grid:

| Field | Default |
|---|---|
| Packaging | IDR 0 |
| Item Modification | IDR 0 |
| Transport Fee | IDR 0 |
| Other | IDR 0 |

### Additional Cut

Two fields side by side:

- Fixed IDR amount (e.g., IDR 5.000)
- Percentage (0–100%) — applied after the fixed cut

### Keterangan

Standard multi-line text field. Sent as `notes` in the payload.

---

## 6. Right Column — `CartSection.svelte`

### Cart Section

Each row shows:
- Item name (bold)
- `Stock: N tersisa` in muted green below the name
- `[−]` qty `[+]` controls
- Line total (price × qty)
- Remove button `[✕]`

Quantities can also be edited via direct keyboard input when a row is focused.

### Free Products Section

Visually distinct block with a green border, labelled "🎁 Free Products". Same row structure as the cart but no price shown. Items here have `isFree: true` semantics — they reduce stock but carry IDR 0 value.

---

## 7. Payment Modal — `PaymentModal.svelte`

Opened by `Ctrl+Enter` or the Bayar button. Dismissed by `ESC`.

### Price Summary

Displayed as a stacked breakdown before the payment rows:

```
Subtotal              IDR X
⭐ Redeem N pts       − IDR X
✂️ Additional Cut     − IDR X
➕ Costs              + IDR X
─────────────────────────────
TOTAL                 IDR X
```

### Payment Rows

- **Cash row** — always present, non-removable. Pre-filled with the full total. Shows "Kembali: IDR X" when overpaid.
- **E-Money rows** — added dynamically via "+ Tambah Metode Pembayaran (E-Money)" button. Each row: provider dropdown (BCA, BRI, ShopeePay, GoPay, OVO) + amount field + remove `[✕]`. Provider list sourced from mock/config.
- No limit on the number of payment rows.

### Piutang

A checkbox row below the payment rows:

- **Label:** "Piutang — IDR X" where IDR X = total − sum(paymentRows), updated live.
- When checked: the confirm button activates (payments + piutangAmount = total).
- When unchecked: confirm requires sum(payments) = total.
- 100% deferred (all payments = 0, Piutang checked) is a valid state.

### Transaction Type

Dropdown sourced from the transaction types API. Pre-selected to **"Private Event"** (hardcoded default). Sent as `transactionType` in the payload.

### Confirm Button

- Disabled unless `isPiutang` is checked OR `sum(payments) >= total`.
- Label: "✓ Konfirmasi Pembayaran — IDR X" (shows amount paid now, excludes piutang).
- Submits the `RetailPayload` via `usePost`.

---

## 8. Keyboard Shortcut Reference

| Key | Context | Action |
|---|---|---|
| `ESC` | Anywhere, no modal open | Focus Search field |
| `ESC` | Modal open | Close modal |
| `Ctrl+Enter` | Main page | Open Payment Modal |
| `↑ / ↓` | Search suggestion modal | Navigate product rows |
| `← / →` | Search suggestion modal | Toggle Cart / Free destination |
| `Enter` | Search suggestion modal, row selected | Open qty prompt |
| Number keys | Qty prompt | Set qty |
| `Enter` | Qty prompt | Confirm insert, close modal |
| `ESC` | Qty prompt | Close modal without inserting |
