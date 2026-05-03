# Item Masuk — Design Spec

**Date:** 2026-05-03
**Project:** Studio Bersih - POS
**Status:** Approved

---

## Overview

Item Masuk is a stock intake feature. When stock arrives from a supplier, a record is created that increases stock and optionally tracks the purchase cost per item. There is no PIC accountability or bill splitting.

| Aspect | Detail |
|--------|--------|
| Stock effect | Increases immediately on submission (V1) |
| Repair | Perbaikan Transaksi (PT) only — admin approval required |
| Versioning | V1 = original, V2+ = approved repairs only (no instant type) |
| Supplier source | Hardcoded list for now (future: fetch from server) |
| Harga Beli | Always stored in snapshot; shown in UI only if `outletConfig.showHargaBeli = true` |
| totalCost | `sum(qty × hargaBeli)` — hidden behind same config toggle as hargaBeli |

---

## Feature 1: Item Masuk Creation

### Form Fields

- **Pilih Supplier** — single selection from hardcoded supplier list
- **Items** — one or more products, each with:
  - `productId` — SKU from product catalog
  - `qty` — quantity received
  - `hargaBeli` — purchase price per unit; always stored, shown in UI only when `outletConfig.showHargaBeli = true`
- **Keterangan** — free-text notes
- **Tanggal** — date of receipt (`"YYYY-MM-DD"`)
- `totalCost` is computed: `sum(qty × hargaBeli)` — displayed only when `outletConfig.showHargaBeli = true`

### Submission Flow
1. User fills the form
2. Clicks **Simpan**
3. Stock increases immediately for each item in the record (per outlet)
4. Record is created as V1 (`type: "original"`)

---

## Feature 2: Perbaikan Transaksi (PT)

Identical flow to the PT feature on Item Keluar — no PTI variant.

**User side:**
1. Opens Item Masuk history
2. Clicks **Perbaikan Transaksi** on a record
3. Edits any field (items, supplier, keterangan, tanggal, harga beli)
4. Clicks **Submit Request**
5. Record is locked — one pending PT request at a time
6. If rejected: sees rejection reason, can revise and resubmit, or delete the request

**Admin side:**
1. Sees request in a dedicated Item Masuk repair queue page (separate from other PT queues, same UI pattern)
2. Opens diff view — original vs proposed, field by field
3. Takes one of four actions:
   - **Approve** → new version committed, stock delta applied if items changed
   - **Reject** → provides reason, user can revise/resubmit
   - **Delete Request** → request dismissed, record unlocked
   - **Delete Record** → full record and all versions removed, stock restored

### Stock Reconciliation on Approval
When a PT is approved and items have changed, the stock delta must be applied (inverse of Item Keluar):
- If qty increased in the repair → stock is **further increased** (original was under-counted)
- If qty decreased in the repair → stock is **decreased** (original was over-counted)
- If a product is removed from the record → its full qty is **decreased** (undo the intake)
- If a new product is added → its qty is **increased**

---

## Feature 3: Version History Viewer

Same behavior as Item Keluar version viewer.

- Timeline: V1 (original) → V2 (approved) → V3 (approved)...
- Each version shows: type badge, changed fields, who made the change, when
- Click any version to see a field-level diff against the previous version
- Color coding: Purple = original · Red = PT approved (no green — no instant type)

---

## Data Model

### ItemMasuk
```typescript
interface ItemMasuk {
  id: string
  currentVersionIndex: number
  versions: ItemMasukVersion[]
  pendingRequest: ItemMasukRepairRequest | null
  isDeleted: boolean
}
```

### ItemMasukSnapshot
```typescript
interface ItemMasukSnapshot {
  id: string
  outletId: string
  createdBy: string                  // userId
  items: Array<{
    productId: string
    qty: number
    hargaBeli: number                // always stored; UI display gated by outletConfig
  }>
  totalCost: number                  // computed: sum(qty * hargaBeli)
  supplierId: string
  keterangan: string
  tanggal: string                    // "YYYY-MM-DD"
}
```

### ItemMasukVersion
```typescript
interface ItemMasukVersion {
  index: number                      // 1, 2, 3...
  type: "original" | "approved"      // no "instant"
  snapshot: ItemMasukSnapshot
  changedFields: string[]
  createdBy: string
  createdAt: string
  requestId: string | null
}
```

### ItemMasukRepairRequest
```typescript
interface ItemMasukRepairRequest {
  id: string
  itemMasukId: string
  status: "pending" | "rejected" | "deleted"
  proposedSnapshot: ItemMasukSnapshot
  submittedBy: string
  submittedAt: string
  rejectionReason: string | null
  revisions: number
}
```

### Supplier
```typescript
interface Supplier {
  id: string
  name: string
}
```

### OutletConfig
```typescript
interface OutletConfig {
  outletId: string
  showHargaBeli: boolean             // per-outlet; fetched from server, mocked for now
}
```

### Constants
```typescript
const MOCK_SUPPLIERS: Supplier[] = [
  { id: "sup-1", name: "Supplier A" },
  { id: "sup-2", name: "Supplier B" },
  { id: "sup-3", name: "Supplier C" },
]
```

---

## Task Breakdown (Parallelizable)

| # | Task | Type | Depends On |
|---|------|------|------------|
| 1 | Types, constants, mock data (ItemMasuk, Supplier, OutletConfig) | Backend | — |
| 2 | Item Masuk creation form & submission | Frontend + Backend | 1 |
| 3 | Item Masuk history page & version viewer | Frontend | 1 |
| 4 | PT — user request form & submit | Frontend + Backend | 1 |
| 5 | PT — admin queue & diff view | Frontend + Backend | 4 |
| 6 | PT — approve (with stock reconciliation) / reject / delete actions | Backend | 4 |
| 7 | PT — rejection reason display & resubmit flow | Frontend | 5, 6 |

Tasks 2 and 3 can run in parallel after Task 1. Tasks 4–7 follow the same dependency chain as the Item Keluar PT feature.

---

## Out of Scope

- Dynamic supplier list (future: fetch from server)
- Cost analytics or purchase reporting
- Push notifications to admin when a PT request is submitted
- Role restrictions on who can create Item Masuk or submit PT requests
- Per-item hargaBeli toggle (config is outlet-wide, not per-record)
