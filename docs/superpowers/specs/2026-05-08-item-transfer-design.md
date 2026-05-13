# Item Transfer — Design Spec

**Date:** 2026-05-08
**Feature:** Item Transfer (Stock Transfer Between Outlets)
**Status:** Approved

---

## 1. Overview

Item Transfer is a stock movement feature for transferring inventory between branches. A sending branch (Branch A) creates a transfer request targeting one or more destination branches. Each destination branch independently accepts (with confirmed quantities) or rejects the transfer. Stock only moves when a receiving branch accepts — not on creation.

| Aspect | Detail |
|---|---|
| Stock effect | On acceptance: sender outlet decreases by `qtyReceived`; receiving outlet increases by `qtyReceived` |
| Sender stock | Stays unchanged on creation. Decreases by `qtyReceived` at acceptance. Shortfall (`qtySent - qtyReceived`) stays at sender if `returnable=true`; is also deducted (written off) if `returnable=false` |
| Scheduled transfers | Transfers with a future `tanggal` enter `scheduled` state; receiving branches cannot act until the date arrives |
| Returnable flag | Per-transfer setting: if `true`, undelivered qty (sent minus received) is logged as a return to the sender; if `false`, the shortfall is written off |
| PIC | Auto-set from `$auth.userId` — not user-editable |
| Repair | Perbaikan Transaksi (PT) only — no PTI. PT on original transfer is only allowed while no acceptances exist yet. PT on acceptance records is always allowed after acceptance. |
| Roles | All roles (cashier, manager, admin) can create transfers and accept/reject incoming transfers |

---

## 2. Data Model

### `TransferItem`
```typescript
interface TransferItem {
    itemId: string    // MasterItem.id from mock/master-items.ts
    qty: number
}
```

### `TransferDestination`
```typescript
interface TransferDestination {
    outletId: string
    items: TransferItem[]
}
```

### `TransferSnapshot`
Full immutable snapshot of a transfer record at a point in time.

```typescript
interface TransferSnapshot {
    id: string
    fromOutletId: string
    createdBy: string                   // userId from $auth
    tanggal: string                     // "YYYY-MM-DD" — effective/scheduled date
    destinations: TransferDestination[]
    keterangan: string
    returnable: boolean                 // if true, undelivered qty returns to sender on partial accept
    status: "scheduled" | "pending" | "completed"
}
```

Status transitions:
- `scheduled` — `tanggal` is in the future; receiving branches cannot act
- `pending` — `tanggal` <= today; receiving branches can accept or reject
- `completed` — all destination branches have responded (accepted or rejected)

### `TransferVersion`
```typescript
interface TransferVersion {
    index: number                       // 1, 2, 3...
    type: "original" | "approved"       // no "instant" — PTI not supported
    snapshot: TransferSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string                   // ISO timestamp
    requestId: string | null            // populated when type === "approved"
}
```

### `TransferRepairRequest`
```typescript
interface TransferRepairRequest {
    id: string
    transferId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: TransferSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}
```

### `TransferRecord`
```typescript
interface TransferRecord {
    id: string
    currentVersionIndex: number
    versions: TransferVersion[]
    pendingRequest: TransferRepairRequest | null
    isDeleted: boolean
}
```

---

### `AcceptedItem`
```typescript
interface AcceptedItem {
    itemId: string          // MasterItem.id from mock/master-items.ts
    qtySent: number         // copied from TransferRecord at time of acceptance
    qtyReceived: number     // confirmed by receiving branch
}
```

### `TransferAcceptanceSnapshot`
```typescript
interface TransferAcceptanceSnapshot {
    id: string
    transferId: string
    receivingOutletId: string
    respondedBy: string     // $auth.userId of the user who accepted/rejected
    items: AcceptedItem[]   // empty array when status is "rejected"
    status: "accepted" | "rejected"
}
```

### `TransferAcceptanceVersion`
```typescript
interface TransferAcceptanceVersion {
    index: number
    type: "original" | "approved"
    snapshot: TransferAcceptanceSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}
```

### `TransferAcceptanceRepairRequest`
```typescript
interface TransferAcceptanceRepairRequest {
    id: string
    acceptanceId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: TransferAcceptanceSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}
```

### `TransferAcceptance`
Top-level acceptance entity. The `status` field at this level is for quick filtering before any response is made.

```typescript
interface TransferAcceptance {
    id: string
    transferId: string
    receivingOutletId: string
    status: "awaiting" | "accepted" | "rejected"    // "awaiting" = not yet responded
    currentVersionIndex: number
    versions: TransferAcceptanceVersion[]
    pendingRequest: TransferAcceptanceRepairRequest | null
    isDeleted: boolean
}
```

---

## Stock Architecture

This feature uses the canonical `StockMovement` interface from `src/library/types/MasterItem.ts` and calls `logStockMovement()` from `mock/stock-movements.ts`. The local `StockMovement` type previously defined here is superseded.

| Concern | Detail |
|---|---|
| Item reference | `itemId` maps to `MasterItem.id` — source items via `getMasterItems()` from `mock/master-items.ts` |
| Stock display | Use `getDisplayStock(itemId, outletId)` from `mock/master-items.ts` — never read `OutletStock.stock` directly |
| Stock logging | Every stock change calls `logStockMovement()` from `mock/stock-movements.ts` |
| Source: transfer out | `"transfer_out"` — `delta = -qtyReceived` on **sender** outlet; `sourceId = acceptanceId` |
| Source: transfer in | `"transfer_in"` — `delta = +qtyReceived` on **receiving** outlet; `sourceId = acceptanceId` |
| Source: shortfall write-off | `"transfer_cancelled"` — `delta = -(qtySent - qtyReceived)` on **sender** when `returnable=false` and partial delivery; `sourceId = acceptanceId` |
| Correction entries | PT approval on acceptance appends additional correcting `StockMovement` entries (delta = difference) rather than modifying existing ones |

`getMovementsForTransfer(transferId)` in `useTransfer.ts` is implemented as `getStockMovements()` filtered where `sourceId` matches any acceptance belonging to that transfer.

---

### `CreateTransferPayload`
Input shape accepted by `createTransfer()`. `createdBy` and `fromOutletId` are injected from `$auth`.

```typescript
interface CreateTransferPayload {
    tanggal: string
    destinations: TransferDestination[]
    keterangan: string
    returnable: boolean
}
```

---

## 3. Routes

| Path | Purpose |
|---|---|
| `/outlet/transfer` | Main page — create transfers, view sent and incoming, movement log |
| `/outlet/transfer/repair` | Admin PT repair queue for both transfer and acceptance records |

Both routes are protected by the existing `/outlet/+layout.svelte` auth guard.

---

## 4. Page Layout

### `/outlet/transfer` — Main Page

Two tabs: **"Dikirim"** (outgoing) and **"Diterima"** (incoming).

**Dikirim tab:**
- Filter bar: date range (from `useDefault`), status toggle (All / Scheduled / Pending / Completed)
- Table columns: Tanggal | Ref ID | Tujuan (destination outlet names) | Returnable | Status | Actions
- Row actions: "Lihat Versi" (opens version history inline modal) + PT button — three states:
  - "Perbaikan" → if no pending request and no acceptances exist yet
  - "⏳ Menunggu" badge → if `pendingRequest.status === "pending"` (non-clickable)
  - "Revisi" → if `pendingRequest.status === "rejected"`
  - PT button hidden entirely once any acceptance exists
- **"+ Kirim Transfer"** button opens `TransferForm` modal

**Diterima tab:**
- Filter bar: date range, status toggle (All / Awaiting / Accepted / Rejected)
- Table columns: Tanggal | Ref ID | Dari (sender outlet) | Items | Returnable | Status | Actions
- Row actions vary by state:
  - Transfer `scheduled` → "⏳ Terjadwal" badge (non-clickable)
  - Transfer `pending`, acceptance `awaiting` → "Terima / Tolak" button opens `TransferAcceptModal`
  - Acceptance `accepted` or `rejected` → "Lihat Detail" (readonly) + PT button (same three states as above)

**Movement Log section** (below tabs): filterable table of `mockStockMovements`.
- Columns: Tanggal | Transfer Ref | Produk | Dari | Ke | Qty | Tipe (Transfer / Return)
- Filter: date range, product search, outlet filter

### `/outlet/transfer/repair` — Admin PT Queue

Two sub-tabs: **"Transfer"** and **"Penerimaan"**.
- Each lists pending PT requests with: Ref ID, type badge, submitter, submitted date, revision count
- Clicking a row shows the diff inline (current snapshot vs proposed snapshot), with action buttons:
  - **Setujui** → `approveTransferRepairRequest()` or `approveAcceptanceRepairRequest()`
  - **Tolak** → reason input → `rejectTransferRepairRequest()` or `rejectAcceptanceRepairRequest()`
  - **Hapus Permintaan** → `deleteTransferRepairRequest()` or `deleteAcceptanceRepairRequest()`
  - **Hapus Record** → confirm step → `deleteTransferRecord()` or `deleteAcceptanceRecord()`

---

## 5. File Map

### Created
```
src/library/types/Transfer.ts
src/library/mock/transfer.ts
src/library/hooks/useTransfer.ts
src/library/stores/transfer.ts
src/library/components/outlet/transfer/TransferForm.svelte
src/library/components/outlet/transfer/TransferAcceptModal.svelte
src/library/components/outlet/transfer/TransferRepairModal.svelte
src/routes/outlet/transfer/+page.svelte
src/routes/outlet/transfer/repair/+page.svelte
```

### Reused (read-only)
```
src/library/mock/outlets.ts            — destination outlet list + outlet name lookup
src/library/mock/master-items.ts       — product catalog for item picker (replaces mock/items.ts)
src/library/mock/stock-movements.ts    — logStockMovement() called by acceptTransfer() and PT approval
src/library/utils/repairDiff.ts        — getChangedFields()
src/library/stores/auth.ts             — $auth for createdBy + fromOutletId
src/library/validator/useDefault.ts    — date range defaults
```

---

## 6. Component Responsibilities

### `TransferForm.svelte`
Modal for creating a new transfer.
- Destination outlet picker: multi-select from `mockOutlets` excluding the sender's own outlet
- Per-destination item section: product picker + qty input; "Tambah Item" appends a row; rows removable (min 1 per destination)
- Keterangan text field
- Tanggal date picker — defaults to today; future dates allowed (creates `scheduled` transfer)
- Returnable toggle (default: on)
- "Simpan" calls `createTransfer()`, closes modal, refreshes table

### `TransferAcceptModal.svelte`
Modal for responding to an incoming transfer.
- Shows transfer metadata: sender outlet, tanggal, keterangan, returnable flag
- Item list: each row shows product name, `qtySent`, and an editable `qtyReceived` input (pre-filled to `qtySent`, min 0, max `qtySent`)
- "Terima" button calls `acceptTransfer()` with confirmed quantities
- "Tolak" button calls `rejectTransfer()` — rejects the entire transfer for this outlet
- Also renders version history and diff inline when opened in "Lihat Detail" mode (readonly, no action buttons)

### `TransferRepairModal.svelte`
PT repair modal shared by both record types.
- Detects record type from a `mode: "transfer" | "acceptance"` prop
- Pre-fills from current snapshot if no existing request; from `pendingRequest.proposedSnapshot` on revision
- Yellow rejection banner when revising, showing rejection reason
- "Hapus Permintaan" delete button for pending/rejected requests
- Submit label: "Submit Request" (new) or "Kirim Ulang" (revision)
- Calls the appropriate hook function based on `mode`

---

## 7. `useTransfer.ts` Hook API

All functions operate on `mockTransferRecords`, `mockTransferAcceptances`, and `mockStockMovements` in-memory arrays.

```typescript
// Transfer creation
createTransfer(payload: CreateTransferPayload): TransferRecord

// Scheduler — call on page load to activate due transfers
activateScheduledTransfers(): void

// Transfer PT actions (user)
submitTransferRepairRequest(transferId: string, proposed: TransferSnapshot): void
reviseTransferRepairRequest(transferId: string, proposed: TransferSnapshot): void
deleteTransferRepairRequest(transferId: string): void

// Transfer PT actions (admin)
approveTransferRepairRequest(transferId: string): void
rejectTransferRepairRequest(transferId: string, reason: string): void
deleteTransferRecord(transferId: string): void

// Acceptance actions
acceptTransfer(transferId: string, receivingOutletId: string, items: AcceptedItem[]): TransferAcceptance
rejectTransfer(transferId: string, receivingOutletId: string): TransferAcceptance

// Acceptance PT actions (user)
submitAcceptanceRepairRequest(acceptanceId: string, proposed: TransferAcceptanceSnapshot): void
reviseAcceptanceRepairRequest(acceptanceId: string, proposed: TransferAcceptanceSnapshot): void
deleteAcceptanceRepairRequest(acceptanceId: string): void

// Acceptance PT actions (admin)
approveAcceptanceRepairRequest(acceptanceId: string): void
rejectAcceptanceRepairRequest(acceptanceId: string, reason: string): void
deleteAcceptanceRecord(acceptanceId: string): void

// Movement log queries
getMovementsForTransfer(transferId: string): StockMovement[]
```

### Stock Effect Logic

**`acceptTransfer()`:**
1. For each item in `AcceptedItem`:
   - Update `OutletStock.stock` for sender: `stock -= qtyReceived`
   - Call `logStockMovement({ itemId, outletId: fromOutletId, delta: -qtyReceived, source: "transfer_out", sourceId: acceptanceId, ... })`
   - Update `OutletStock.stock` for receiver: `stock += qtyReceived`
   - Call `logStockMovement({ itemId, outletId: toOutletId, delta: +qtyReceived, source: "transfer_in", sourceId: acceptanceId, ... })`
2. If `!returnable && qtyReceived < qtySent`: for the shortfall `(qtySent - qtyReceived)`:
   - Update `OutletStock.stock` for sender: `stock -= shortfall`
   - Call `logStockMovement({ ..., delta: -shortfall, source: "transfer_cancelled", sourceId: acceptanceId })`
3. If `returnable && qtyReceived < qtySent`: shortfall stays at sender — no additional deduction
4. Check if all destinations for the parent `TransferRecord` have responded; if so, set `TransferRecord.status = "completed"`

**`approveAcceptanceRepairRequest()`:**
1. Compute `delta = newQtyReceived - oldQtyReceived` per item
2. Update `OutletStock.stock` for receiver and sender accordingly
3. Call `logStockMovement()` for each changed item with the correcting delta and `source: "transfer_in"` / `"transfer_out"` — corrections append new entries, never modify existing ones

**`activateScheduledTransfers()`:**
Iterates `mockTransferRecords` and sets `status = "pending"` on any record where `tanggal <= today` and `status === "scheduled"`.

---

## 8. Mock Data Seed (`mock/transfer.ts`)

Four seed records covering key states:

1. **TRF-001** — `pending`, sent from Outlet A to Outlet B only. Outlet B has accepted with partial quantities (qtyReceived < qtySent, returnable=true). Transfer status: `completed`. Acceptance has an approved PT version.
2. **TRF-002** — `pending`, sent from Outlet A to Outlet B and Outlet C. Outlet B has accepted (full qty). Outlet C is still `awaiting`. Transfer status: `pending`.
3. **TRF-003** — `scheduled` (future tanggal). No acceptances yet. Demonstrates the scheduled state.
4. **TRF-004** — `pending`, sent from Outlet B to Outlet A. Outlet A has rejected it. Acceptance has a pending PT request (rejected state, revision scenario). Transfer status: `completed`.

---

## 9. PT Flow

### On the Transfer Record (sender side)
PT is only available while no `TransferAcceptance` records exist for the transfer.

1. Sender clicks "Perbaikan" → `TransferRepairModal` opens pre-filled with current snapshot
2. Edits any field → "Submit Request" → `submitTransferRepairRequest()`
3. Row shows "⏳ Menunggu" — PT button disabled while pending
4. Admin reviews at `/outlet/transfer/repair` → Setujui / Tolak
5. On **Setujui**: new `"approved"` version, `pendingRequest` cleared
6. On **Tolak**: `pendingRequest.status = "rejected"`, reason stored; sender sees "Revisi"

### On the Acceptance Record (receiver side)
Available after any response (accepted or rejected).

Same flow as above but scoped to the `TransferAcceptance` record. Admin queue sub-tab "Penerimaan" handles these. Stock reconciliation is applied on approval per the logic in Section 7.

---

## 10. Constraints & Notes

- `tanggal` is the effective/scheduled date — future dates create `scheduled` transfers
- PT on `TransferRecord` is blocked once any acceptance exists; the transfer data is immutable after receiving branches start responding
- `returnable` applies to the whole transfer — not configurable per destination or per item
- `createdBy` on `TransferRecord` is auto-set from `$auth.userId`; `respondedBy` on `TransferAcceptanceSnapshot` is auto-set the same way
- Movement log is append-only; corrections from PT approval add new entries rather than modifying existing ones
- `activateScheduledTransfers()` is called on page load in `/outlet/transfer/+page.svelte` — no background scheduler
- `mockOutlets` from `src/library/mock/outlets.ts` is reused for destination picker and outlet name display
- `getMasterItems()` from `src/library/mock/master-items.ts` is used for the product picker in `TransferForm` — replaces the old `mock/items.ts`
