# Pesanan — Design Spec

**Date:** 2026-05-27
**Feature:** `/outlet/pesanan/` — Pending Order Queue
**Status:** Approved

---

## Overview

Pesanan is the active order queue for orders created in Order mode from the Retail page. An order lands here immediately after creation and stays until it is either checked out (completed) or cancelled. Completed and cancelled orders move to Riwayat Transaksi.

Cashier and Manager see only their outlet's orders. Admin sees all outlets.

---

## Terminology

| Term | Meaning |
|---|---|
| Pesanan | A pending order created from Retail → Order mode |
| DP (Down Payment) | A partial payment added to a Pesanan before full checkout |
| PTI (Perbaikan Instan) | Instant repair — limited fields, no admin approval |
| PT (Perbaikan Transaksi) | Full repair — any field, requires admin approval |
| Locked | Order cannot be edited, cancelled, or checked out while awaiting PT or cancellation approval |

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
    type: "original" | "instant" | "approved"
    snapshot: PesananSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}
```

### `PesananRepairRequest`

```typescript
interface PesananRepairRequest {
    id: string
    pesananId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: PesananSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
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
type PesananStatus = "active" | "awaiting_pt" | "awaiting_cancellation" | "completed" | "cancelled"

interface Pesanan {
    id: string                          // "PSN-00001" — 5-digit zero-padded
    status: PesananStatus
    currentVersionIndex: number
    versions: PesananVersion[]
    payments: PesananPayment[]          // cumulative DP log
    amountPaid: number                  // sum of all payments
    totalAmount: number                 // computed from current snapshot items at creation
    pendingRequest: PesananRepairRequest | null
    cancellationRequest: PesananCancellationRequest | null
    createdAt: string
    completedAt: string | null
    cancelledAt: string | null
}
```

`totalAmount` is recomputed on PT approval if item quantities change.

### PTI-Allowed Fields

```typescript
type PesananPTIField = "orderMeta" | "memberId"
```

PTI for Pesanan only allows changing `orderMeta` (pickup date, delivery type, WhatsApp, hour) and `memberId`. All other fields require a full PT request.

---

## Routes & Pages

| Route | File | Access |
|---|---|---|
| `/outlet/pesanan/` | `src/routes/outlet/pesanan/+page.svelte` | All roles |
| `/outlet/pesanan/repair` | `src/routes/outlet/pesanan/repair/+page.svelte` | Admin only |

Non-admin accessing `/outlet/pesanan/repair` is redirected to `/outlet/pesanan/`.

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
| `awaiting_pt` | amber "⏳ Menunggu PT" |
| `awaiting_cancellation` | amber "⏳ Menunggu Batal" |

### Action Buttons per Status

| Status | Actions |
|---|---|
| `active` | Checkout · Add DP · PTI · PT · Batalkan |
| `awaiting_pt` | — (locked, badge only) |
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

## PTI — Perbaikan Instan

Opens a small modal with only PTI-allowed fields:

- `orderMeta.orderDate` — date picker
- `orderMeta.hour` — time picker
- `orderMeta.deliveryType` — dropdown (Delivery / Ambil di Outlet)
- `orderMeta.whatsapp` — text input
- `memberId` — member search (same as Retail member picker)

On save: `applyInstantRepair(id, changes, userId)` — creates a new `"instant"` version immediately. No admin approval. Order stays `"active"`.

---

## PT — Perbaikan Transaksi

Opens a full edit modal pre-filled with the current snapshot. All fields are editable: items, freeItems, additionalCosts, additionalCut, transactionType, notes, orderMeta, memberId.

If a previous PT was rejected, a rejection banner is shown with the reason.

On submit: `submitRepairRequest(id, proposedSnapshot, userId)` — `status` → `"awaiting_pt"`, order locked.

On revision (after rejection): `reviseRepairRequest(id, proposedSnapshot, userId)`.

---

## Cancellation

Clicking "Batalkan" opens a confirmation dialog with a required reason input.

On confirm: `requestCancellation(id, userId, reason)` — `status` → `"awaiting_cancellation"`, order locked.

---

## Admin Repair Page — `/outlet/pesanan/repair`

Two tabs: **PT Pending** (default) · **Pembatalan Pending**

A third tab: **Selesai** — resolved PT and cancellation requests across all outlets.

### PT Pending Tab

Columns: Outlet · Ref ID · Diminta Oleh · Tgl Diminta · Revisi ke-N · Review

Inline review panel on row click:
- Current snapshot vs proposed — field-level diff (same pattern as Pergerakan Stok PT)
- Changed fields highlighted

Actions: **Setujui** · **Tolak** (requires reason)

On Setujui: `approveRepairRequest(id, adminId)` — new `"approved"` version committed, `totalAmount` recomputed if items changed, `status` → `"active"`.

On Tolak: `rejectRepairRequest(id, reason, adminId)` — `status` → `"active"`, `pendingRequest.status` → `"rejected"`.

### Pembatalan Pending Tab

Columns: Outlet · Ref ID · Diminta Oleh · Alasan · Tgl Diminta · Aksi

Actions: **Setujui Pembatalan** · **Tolak Pembatalan** (requires reason)

On Setujui: `approveCancellation(id, adminId)` — `status` → `"cancelled"`, `cancelledAt` set. No stock movement (order was never checked out).

On Tolak: `rejectCancellation(id, reason, adminId)` — `status` → `"active"`, cancellationRequest cleared.

---

## Mock Functions (`mock/pesanan.ts`)

```typescript
// Queries
getPesananList(outletId?: string): Pesanan[]         // no arg = all outlets
getPesananById(id: string): Pesanan | undefined
getPendingRepairRequests(): PesananRepairRequest[]
getPendingCancellationRequests(): PesananCancellationRequest[]

// Creation (called from Order mode in Retail)
createPesanan(snapshot: PesananSnapshot): Pesanan

// Down payment
addPayment(id: string, type: string, amount: number): void

// Checkout
checkoutPesanan(id: string, payments: PesananPayment[], userId: string): void

// PTI — no approval, instant version
applyInstantRepair(id: string, changes: Partial<Pick<PesananSnapshot, PesananPTIField>>, userId: string): void

// PT — admin approval required
submitRepairRequest(id: string, proposedSnapshot: PesananSnapshot, userId: string): void
reviseRepairRequest(id: string, proposedSnapshot: PesananSnapshot, userId: string): void
approveRepairRequest(id: string, adminId: string): void
rejectRepairRequest(id: string, reason: string, adminId: string): void

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
| `src/routes/outlet/pesanan/+page.svelte` | Order list, Add DP modal, PTI modal, PT modal, cancellation dialog — all inline |
| `src/routes/outlet/pesanan/repair/+page.svelte` | Admin PT + cancellation approval queue |
| `src/library/types/Pesanan.ts` | All TypeScript interfaces |
| `src/library/mock/pesanan.ts` | In-memory store + all CRUD functions |

All modals (Add DP, PTI, PT, cancellation) are inline in `+page.svelte` — no separate component files needed.

---

## Mock Seed Data

Four seed records:

1. **PSN-00001** — `active`, no payments yet. 2 items. Delivery. Member attached.
2. **PSN-00002** — `active`, partial DP paid (50%). 3 items. Pickup.
3. **PSN-00003** — `awaiting_pt`, pending PT request (item qty change). 1 item.
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
- Push notifications for PT approval or cancellation approval
- Sales staff assignment (no Sales feature yet)
- Receipt printing from Pesanan (handled by Riwayat)
