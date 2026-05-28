# Riwayat Transaksi — Design Spec

**Date:** 2026-05-27
**Feature:** `/outlet/riwayat/` — Completed Transaction History
**Status:** Approved

---

## Overview

Riwayat Transaksi is the read-and-repair history of all completed sales transactions. Two sources feed into it: Retail (direct checkout) and Pesanan (order checkout). Completed and cancelled Pesanan move here after their final state is committed.

All roles see the list. Cashiers and managers see their outlet only. Admin sees all outlets. PT (Perbaikan Transaksi) is the only repair mode available — no PTI, since stock is already consumed, payments are received, and all movements are logged.

---

## Terminology

| Term | Meaning |
|---|---|
| Riwayat | Completed transaction history |
| PT (Perbaikan Transaksi) | Full repair — all fields, requires admin approval |
| Pesanan Order Receipt | Order slip printed at order creation, handed to customer for pickup/delivery |
| Checkout Receipt | Final bill printed at Pesanan checkout — confirms full payment |

---

## Data Model

### `RetailSnapshot`

```typescript
interface RetailSnapshot {
    source: 'retail'
    outletId: string
    cashierId: string
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
    payments: Array<{ type: string; amount: number }>
    transactionType: string
    notes: string
    orderMeta: {
        orderDate: string
        whatsapp: string
        branchId: string
        hour: string
        deliveryType: 'pickup' | 'delivery'
    } | null
    pointsRedeemed: number
    kupon: { kode: string; nilaiPotongan: number; cartMutations: KuponCartMutation[]; authNip: string | null } | null
    isPiutang: boolean
    piutangAmount: number
}
```

### `PesananTransactionSnapshot`

```typescript
interface PesananTransactionSnapshot {
    source: 'pesanan'
    pesananId: string                   // original PSN-NNNNN for traceability
    outletId: string
    cashierId: string
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
    payments: Array<{ type: string; amount: number }>    // all payments: DP installments + final checkout
    transactionType: string
    notes: string
    orderMeta: {
        orderDate: string
        whatsapp: string
        branchId: string
        hour: string
        deliveryType: 'pickup' | 'delivery'
    }
}
```

### `RiwayatSnapshot`

```typescript
type RiwayatSnapshot = RetailSnapshot | PesananTransactionSnapshot
```

TypeScript discriminates on `snapshot.source`.

### `RiwayatVersion`

```typescript
interface RiwayatVersion {
    index: number                       // 0, 1, 2...
    type: 'original' | 'approved'       // no 'instant' — PTI does not exist in Riwayat
    snapshot: RiwayatSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null            // populated when type === 'approved'
}
```

### `RepairRequest`

```typescript
interface RepairRequest {
    id: string
    riwayatId: string
    status: 'pending' | 'rejected' | 'deleted'
    proposedSnapshot: RiwayatSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number                   // increments on each resubmit after rejection
}
```

### `RiwayatEntry`

```typescript
type RiwayatSource = 'retail' | 'pesanan'
type RiwayatStatus = 'active' | 'awaiting_pt'

interface RiwayatEntry {
    id: string                          // TRX-NNNNN for retail; PSN-NNNNN for pesanan
    source: RiwayatSource
    status: RiwayatStatus
    currentVersionIndex: number
    versions: RiwayatVersion[]
    pendingRequest: RepairRequest | null
    totalAmount: number                 // recomputed on PT approval if items change
    outletId: string
    completedAt: string                 // ISO timestamp of checkout confirmation
    isDeleted: boolean
}
```

`RiwayatEntry.id` preserves the original transaction ID for receipt traceability.

---

## Routes & Pages

| Route | File | Access |
|---|---|---|
| `/outlet/riwayat/` | `src/routes/outlet/riwayat/+page.svelte` | All roles |
| `/outlet/riwayat/repair/` | `src/routes/outlet/riwayat/repair/+page.svelte` | Admin only |

Non-admin accessing `/outlet/riwayat/repair/` is redirected to `/outlet/riwayat/`.

---

## Main Page — `/outlet/riwayat/`

### Tabs

**Retail** (default) · **Pesanan**

### Toolbar (shared, both tabs)

Search input + date-from picker + date-to picker + per-page select (10/25/50/100). Any filter change resets `currentPage` to 1.

Search filters by tab:
- Retail: ID, member, notes
- Pesanan: ID, member, WhatsApp, notes

Date filter applies to `completedAt`.

### Table Columns

**Retail tab:**

| ID | Member | Items | Total | Tgl Transaksi | Kasir | Status | Aksi |
|---|---|---|---|---|---|---|---|

**Pesanan tab:**

| ID | Member | Items | Total | Tgl Order | Tgl Selesai | Kasir | Status | Aksi |
|---|---|---|---|---|---|---|---|---|

Admin view adds an **Outlet** column before ID on both tabs.

### Status Badges

| Status | Badge |
|---|---|
| `active` | — (no badge) |
| `awaiting_pt` | amber "⏳ Menunggu PT" |

### Action Buttons per Status

| Status | Actions |
|---|---|
| `active` (Retail) | Lihat · Print · PT · Delete (admin only) |
| `active` (Pesanan) | Lihat · Print Order · Print Checkout · PT · Delete (admin only) |
| `awaiting_pt` | Lihat · (locked — no other actions) |

### Pagination

5-button sliding window per CLAUDE.md canonical block.

---

## Lihat (View) Modal

Inline modal, adapts to source. Read-only.

**Common sections:**
- Items table: name · qty · price · subtotal
- Free items (if any)
- Additional costs breakdown
- Additional cut
- Total + payments breakdown (method + amount per line)
- Transaction type, notes

**Retail only:**
- Order meta if present (delivery type, date, WhatsApp)

**Pesanan only:**
- Order meta (always present): order date, delivery type, WhatsApp, hour
- DP installment log with dates

**Bottom of modal (both):**
- Version history strip: V1 → V2 → V3, each labeled `original` or `approved`, with who changed it and when

---

## Receipt Modals

### Retail Receipt

Standard POS format. Triggered by "Print" on a Retail row.

Content:
- Outlet name + transaction ID + date + cashier
- Item list: name · qty · price · subtotal
- Subtotal, additional costs, additional cut, **Total**
- Payment breakdown per method
- Member name if attached
- Notes if any

Print button: `window.print()`

### Pesanan Order Receipt

Order slip format. Triggered by "Print Order" on a Pesanan row. This is the slip handed to the customer at order creation — it identifies the order for pickup or delivery.

Content:
- Outlet name + PSN ID + order date + delivery type
- Customer WhatsApp
- Pickup hour / delivery details
- Item list: name · qty · price
- DP installments log: method, amount, date per line
- Total order amount + amount paid so far at order time

Print button: `window.print()`

### Checkout Receipt

Final bill format. Triggered by "Print Checkout" on a Pesanan row. Confirms full payment received.

Content:
- Outlet name + PSN ID + checkout date + cashier
- Item list: name · qty · price · subtotal
- Additional costs + additional cut
- **Grand total**
- All payments: DP installments + final checkout payment(s), each on its own line
- Total paid (should equal grand total)

Print button: `window.print()`

---

## PT — Perbaikan Transaksi

PTI does not exist in Riwayat. All repairs require admin approval.

**User flow:**
1. Clicks "PT" on an active row
2. Full edit modal opens pre-filled with current snapshot — all fields editable (items, qty, costs, payments, notes, orderMeta, memberId)
3. If previous PT was rejected: banner shows rejection reason and revision count
4. Submit → `submitRepairRequest()` → status `"awaiting_pt"`, row locked
5. After rejection: `reviseRepairRequest()` increments `revisions`

---

## Admin Repair Page — `/outlet/riwayat/repair/`

Three tabs: **Menunggu** (default) · **Selesai** · **Deleted**

### Menunggu Tab

Columns: Outlet · ID · Sumber · Diminta Oleh · Tgl Diminta · Revisi ke-N · Aksi

Row click opens inline diff panel: current snapshot vs proposed snapshot, field by field, changed fields highlighted.

Actions:
- **Setujui** — `approveRepairRequest(id, adminId)`: new `"approved"` version committed, `totalAmount` recomputed if items changed, `logStockMovement` called for each item where qty changed (delta = newQty − oldQty), `status` → `"active"`
- **Tolak** (requires reason) — `rejectRepairRequest(id, reason, adminId)`: `status` → `"active"`, `pendingRequest.status` → `"rejected"`, cashier can revise
- **Hapus Request** — `deleteRepairRequest(id, adminId)`: dismisses request without approval or rejection, `pendingRequest.status` → `"deleted"`, `status` → `"active"`
- **Hapus Transaksi** — `deleteTransaction(id, adminId)`: `isDeleted` → `true`, entry hidden from main list

### Selesai Tab

Approved and rejected PT requests across all outlets. Read-only log.

Columns: Outlet · ID · Sumber · Diproses Oleh · Tgl Diproses · Hasil (Disetujui / Ditolak) · Alasan Tolak

### Deleted Tab

Soft-deleted transactions. Admin only, read-only.

Columns: Outlet · ID · Sumber · Dihapus Oleh · Tgl Dihapus

---

## Mock Functions (`mock/riwayat.ts`)

```typescript
// Queries
getRiwayatList(outletId?: string): RiwayatEntry[]           // excludes isDeleted; no arg = all outlets
getRiwayatById(id: string): RiwayatEntry | undefined
getPendingRepairRequests(): RepairRequest[]
getResolvedRepairRequests(): RepairRequest[]                 // approved + rejected only (not deleted); for Selesai tab
getDeletedTransactions(): RiwayatEntry[]                     // for Deleted tab

// Creation — called by Retail checkout and Pesanan checkoutPesanan
createRiwayatEntry(snapshot: RiwayatSnapshot): RiwayatEntry

// PT — admin approval required
submitRepairRequest(id: string, proposedSnapshot: RiwayatSnapshot, userId: string): void
reviseRepairRequest(id: string, proposedSnapshot: RiwayatSnapshot, userId: string): void
approveRepairRequest(id: string, adminId: string): void
rejectRepairRequest(id: string, reason: string, adminId: string): void
deleteRepairRequest(id: string, adminId: string): void

// Admin hard delete
deleteTransaction(id: string, adminId: string): void
```

ID format: `TRX-` prefix, 5-digit zero-padded counter for Retail entries. Pesanan-sourced entries use the original `PSN-` ID.

---

## Mock Seed Data

Five records:

1. **TRX-00001** — Retail, `active`. 2 items. Member attached. Cash payment. No PT history.
2. **TRX-00002** — Retail, `awaiting_pt`. 1 item. PT pending — proposed qty change. No rejection yet.
3. **TRX-00003** — Retail, `active`. Version 2 — PT approved once (item price corrected). 3 items.
4. **PSN-00001** — Pesanan, `active`. Delivery order. Had DP (50%) + final checkout payment.
5. **PSN-00002** — Pesanan, `active`. Pickup order. Paid in full at checkout, no DP.

---

## Integration

**Retail checkout** calls `createRiwayatEntry({ source: 'retail', ...payload })` after successful payment.

**Pesanan checkout** (`checkoutPesanan`) calls `createRiwayatEntry({ source: 'pesanan', pesananId: id, cashierId: userId, ...snapshot, payments: allPayments })` after stock movements are logged.

`logStockMovement` is called by the checkout functions, not by Riwayat itself. On PT approval, Riwayat calls `logStockMovement` only for items whose qty changed (delta = new − old).

---

## Svelte Files

| File | Responsibility |
|---|---|
| `src/routes/outlet/riwayat/+page.svelte` | Retail + Pesanan tabs, date filter, table, Lihat modal, receipt modals, PT form modal |
| `src/routes/outlet/riwayat/repair/+page.svelte` | Admin PT queue: Menunggu / Selesai / Deleted tabs, diff panel |
| `src/library/types/Riwayat.ts` | All TypeScript interfaces |
| `src/library/mock/riwayat.ts` | In-memory store + all CRUD functions |

All modals are inline in `+page.svelte`.

---

## Out of Scope

- PTI (Perbaikan Transaksi Instan) — not available in Riwayat; all repairs require admin approval
- Push notifications when PT request arrives
- Export to CSV or PDF
- Accounting reconciliation view
- Customer-facing receipt link
- Receipt printing from Pesanan active orders (handled by Pesanan page)
