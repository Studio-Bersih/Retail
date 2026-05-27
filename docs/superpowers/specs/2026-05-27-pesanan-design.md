# Pesanan — Design Spec

**Date:** 2026-05-27
**Feature:** `/outlet/pesanan/` — Pending Order Queue
**Status:** Approved

---

## Overview

Pesanan is the active order queue for orders created in Order mode from the Retail page. An order lands here immediately after creation and stays until it is either checked out (completed) or cancelled. Completed and cancelled orders move to Riwayat Transaksi.

While an order is active (not yet checked out), cashiers can freely edit any field — items, quantities, pricing, metadata — without admin approval. Once an order is checked out and becomes a completed transaction in Riwayat, modifications require Perbaikan Transaksi (admin approval).

Cashier and Manager see only their outlet's orders. Admin sees all outlets.

---

## Terminology

| Term | Meaning |
|---|---|
| Pesanan | A pending order created from Retail → Order mode |
| DP (Down Payment) | A partial payment added to a Pesanan before full checkout |
| Edit | Instant in-place edit of any order field — no approval needed while active |
| Locked | Order cannot be edited, cancelled, or checked out while awaiting cancellation approval |

---

## Data Model

### `PesananSnapshot`

```typescript
interface PesananSnapshot {
    id: string
    outletId: string
    createdBy: string
    memberId: string | null
    items: Array<{
        id: string
        name: string
        sku: string
        barcode: string
        price: number
        qty: number
        stock: number
        isFree: boolean
    }>
    freeItems: Array<{
        id: string
        name: string
        sku: string
        barcode: string
        qty: number
        stock: number
        isFree: true
    }>
    additionalCosts: { packaging: number; modification: number; transport: number; other: number }
    additionalCut: { fixedAmount: number; percentage: number }
    transactionType: string
    notes: string
    orderMeta: {
        orderDate: string               // "YYYY-MM-DD"
        whatsapp: string
        branchId: string
        hour: string                    // "HH:MM"
        deliveryType: "pickup" | "delivery"
    }
}
```

### `PesananVersion`

```typescript
interface PesananVersion {
    index: number                       // 1, 2, 3...
    type: "original" | "edit"
    snapshot: PesananSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
}
```

### `PesananCancellationRequest`

```typescript
interface PesananCancellationRequest {
    id: string
    pesananId: string
    status: "pending" | "rejected"
    reason: string
    requestedBy: string
    requestedAt: string
    rejectionReason: string | null
}
```

### `PesananPayment`

```typescript
interface PesananPayment {
    id: string
    type: string                        // "cash" | "emoney" | etc
    amount: number
    paidAt: string                      // ISO timestamp
}
```

### `Pesanan`

```typescript
type PesananStatus = "active" | "awaiting_cancellation" | "completed" | "cancelled"

interface Pesanan {
    id: string                          // "PSN-00001" — 5-digit zero-padded
    status: PesananStatus
    currentVersionIndex: number
    versions: PesananVersion[]
    payments: PesananPayment[]          // cumulative DP log
    amountPaid: number                  // sum of all payments
    totalAmount: number                 // computed from current snapshot items
    cancellationRequest: PesananCancellationRequest | null
    createdAt: string
    completedAt: string | null
    cancelledAt: string | null
}
```

`totalAmount` is recomputed on every edit if item quantities or prices change.

---

## Routes & Pages

| Route | File | Access |
|---|---|---|
| `/outlet/pesanan/` | `src/routes/outlet/pesanan/+page.svelte` | All roles |
| `/outlet/pesanan/cancellation` | `src/routes/outlet/pesanan/cancellation/+page.svelte` | Admin only |

Non-admin accessing `/outlet/pesanan/cancellation` is redirected to `/outlet/pesanan/`.

---

## Main Page — `/outlet/pesanan/`

### Toolbar

Search + per-page select (10/25/50/100) per CLAUDE.md canonical block.

Search filters: Order ID, member name, WhatsApp, notes.

### Table Columns

| Ref ID | Member | Items | Total | Terbayar | Sisa | Tgl Order | Status | Aksi |
|---|---|---|---|---|---|---|---|---|
| PSN-00001 | Name or — | "3 item" | Rp X | Rp Y | Rp Z | YYYY-MM-DD | badge | buttons |

Admin view adds an **Outlet** column before Ref ID.

### Status Badges

| Status | Badge |
|---|---|
| `active` | green "Aktif" |
| `awaiting_cancellation` | amber "⏳ Menunggu Batal" |

### Action Buttons per Status

| Status | Actions |
|---|---|
| `active` | Checkout · Add DP · Edit · Batalkan |
| `awaiting_cancellation` | — (locked, badge only) |

### Pagination

5-button sliding window per CLAUDE.md canonical block.

---

## Down Payment — Add DP Modal

Simple inline modal. Fields:

| Field | Type | Rules |
|---|---|---|
| Metode | dropdown | cash / emoney options from mockPaymentMethods |
| Jumlah | number input | > 0, ≤ remaining due |

On submit: `addPayment(id, type, amount)` — appends to `Pesanan.payments`, updates `amountPaid`. Order stays `"active"`.

---

## Checkout

Opens the existing `PaymentModal.svelte` from Retail, pre-filled with the current snapshot's items, costs, and totals. The already-paid amount (`amountPaid`) is displayed as a credit. Cashier only needs to cover the remaining balance.

On confirm:
1. `checkoutPesanan(id, payments, userId)` called
2. `logStockMovement()` called per line item (`source: "sale"`, `delta: -qty`)
3. `status` → `"completed"`, `completedAt` set
4. Record moves to Riwayat (visible via `status === "completed"`)

---

## Edit — Instant Order Edit

Opens a full edit modal pre-filled with the current snapshot. All fields are editable: items (add, remove, change qty), freeItems, additionalCosts, additionalCut, transactionType, notes, orderMeta, memberId.

No admin approval required — changes apply immediately because the order has not been checked out yet. Stock is not affected until checkout.

On save: `editPesanan(id, newSnapshot, userId)` — creates a new `"edit"` version, recomputes `totalAmount`, order stays `"active"`.

---

## Cancellation

Clicking "Batalkan" opens a confirmation dialog with a required reason input.

On confirm: `requestCancellation(id, userId, reason)` — `status` → `"awaiting_cancellation"`, order locked.

Cancellation requires admin approval because it is an intentional business decision to void a pending commitment.

---

## Admin Cancellation Page — `/outlet/pesanan/cancellation`

Two tabs: **Menunggu** (default) · **Selesai**

### Menunggu Tab

Columns: Outlet · Ref ID · Diminta Oleh · Alasan · Tgl Diminta · Aksi

Actions: **Setujui Pembatalan** · **Tolak Pembatalan** (requires reason)

On Setujui: `approveCancellation(id, adminId)` — `status` → `"cancelled"`, `cancelledAt` set. No stock movement (order was never checked out).

On Tolak: `rejectCancellation(id, reason, adminId)` — `status` → `"active"`, cancellationRequest cleared.

### Selesai Tab

Shows all resolved cancellation requests (approved and rejected) across all outlets. Read-only.

---

## Mock Functions (`mock/pesanan.ts`)

```typescript
// Queries
getPesananList(outletId?: string): Pesanan[]         // no arg = all outlets
getPesananById(id: string): Pesanan | undefined
getPendingCancellationRequests(): PesananCancellationRequest[]

// Creation (called from Order mode in Retail)
createPesanan(snapshot: PesananSnapshot): Pesanan

// Down payment
addPayment(id: string, type: string, amount: number): void

// Checkout
checkoutPesanan(id: string, payments: PesananPayment[], userId: string): void

// Edit — instant, all fields, no approval
editPesanan(id: string, newSnapshot: PesananSnapshot, userId: string): void

// Cancellation — admin approval required
requestCancellation(id: string, userId: string, reason: string): void
approveCancellation(id: string, adminId: string): void
rejectCancellation(id: string, reason: string, adminId: string): void
```

ID format: `PSN-` prefix, 5-digit zero-padded counter.

---

## Svelte Files

| File | Responsibility |
|---|---|
| `src/routes/outlet/pesanan/+page.svelte` | Order list, Add DP modal, Edit modal, cancellation dialog — all inline |
| `src/routes/outlet/pesanan/cancellation/+page.svelte` | Admin cancellation approval queue |
| `src/library/types/Pesanan.ts` | All TypeScript interfaces |
| `src/library/mock/pesanan.ts` | In-memory store + all CRUD functions |

All modals (Add DP, Edit, cancellation) are inline in `+page.svelte` — no separate component files needed.

---

## Mock Seed Data

Four seed records:

1. **PSN-00001** — `active`, no payments yet. 2 items. Delivery. Member attached.
2. **PSN-00002** — `active`, partial DP paid (50%). 3 items. Pickup.
3. **PSN-00003** — `active`, edited once (version 2). Item qty changed. Pickup.
4. **PSN-00004** — `awaiting_cancellation`, pending cancellation with reason.

---

## Integration with Retail

When a cashier submits an order in Order mode from `/outlet/retail/`, the Retail page calls `createPesanan(snapshot)` instead of `usePost("/api/retail/checkout")`. The Pesanan record is created immediately with `status: "active"` and `payments: []`.

`logStockMovement()` is NOT called at order creation — only at checkout completion.

---

## Out of Scope

- Order expiry / automatic cancellation after N days
- Partial item fulfilment (all items fulfilled together at checkout)
- Customer-facing order status tracking
- Push notifications for cancellation approval
- Sales staff assignment (no Sales feature yet)
- Receipt printing from Pesanan (handled by Riwayat)
