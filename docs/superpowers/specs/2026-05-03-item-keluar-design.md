# Item Keluar — Design Spec

**Date:** 2026-05-03
**Project:** Studio Bersih - POS
**Status:** Approved

---

## Overview

Item Keluar is a stock disposal feature. When stock is thrown out (due to bugs, spoilage, display damage, etc.), a record is created that decreases stock and assigns financial accountability to one or more PICs from an employee master list.

| Aspect | Detail |
|--------|--------|
| Stock effect | Decreases immediately on submission (V1) |
| Repair | Perbaikan Transaksi (PT) only — admin approval required |
| Versioning | V1 = original, V2+ = approved repairs only (no instant type) |
| PIC source | Separate employee master list, not system user accounts |
| Categories | Fixed constant list |

---

## Stock Architecture

| Concern | Detail |
|---|---|
| Item reference | `itemId` maps to `MasterItem.id` — source items via `getMasterItems()` from `mock/master-items.ts` |
| Stock display | Use `getDisplayStock(itemId, outletId)` from `mock/master-items.ts` everywhere — never read `OutletStock.stock` directly |
| Stock logging | Every stock change calls `logStockMovement()` from `mock/stock-movements.ts` |
| Source: submission | `"item_keluar"` — one entry per line item, `delta = -qty`, `sourceId = itemKeluarId` |
| Source: PT approval | `"item_keluar_pt"` — one correcting entry per changed line item, `delta = -(new qty - old qty)`, `sourceId = repairRequestId` |

---

## Feature 1: Item Keluar Creation

### Form Fields

- **Items** — one or more products, each with:
  - `itemId` — `MasterItem.id` from `mock/master-items.ts`
  - `qty` — quantity disposed
  - `unitPrice` — entered manually by user (not auto-filled from catalog)
- **Kategori** — single selection from fixed list: `"Bugs"` | `"Afkir Terdisplay"` | `"Rotten"`
- **Keterangan** — free-text notes
- **Tanggal** — date the disposal happened (`"YYYY-MM-DD"`)
- **PIC** — multi-select from employee master list; each selected PIC gets a manually entered IDR amount assigned
- `totalLoss` is computed: sum of `qty × unitPrice` across all items

### Bill Split Rules
- Each PIC is assigned a manual IDR amount
- The sum of all PIC amounts may be **less than** `totalLoss` — remainder is absorbed (unassigned)
- No automatic equal-split; user controls every amount

### Submission Flow
1. User fills the form
2. Clicks **Simpan**
3. Stock decreases immediately for each item in the record (per outlet)
4. Record is created as V1 (`type: "original"`)

---

## Feature 2: Perbaikan Transaksi (PT)

Identical flow to the PT feature on transaction history — no PTI variant.

**User side:**
1. Opens Item Keluar history
2. Clicks **Perbaikan Transaksi** on a record
3. Edits any field (items, kategori, keterangan, tanggal, PICs, bill split, unit prices)
4. Clicks **Submit Request**
5. Record is locked — one pending PT request at a time
6. If rejected: sees rejection reason, can revise and resubmit, or delete the request

**Admin side:**
1. Sees request in a dedicated Item Keluar repair queue page (separate from the transaction PT queue, same UI pattern)
2. Opens diff view — original vs proposed, field by field
3. Takes one of four actions:
   - **Approve** → new version committed, stock delta applied if items changed
   - **Reject** → provides reason, user can revise/resubmit
   - **Delete Request** → request dismissed, record unlocked
   - **Delete Record** → full record and all versions removed

### Stock Reconciliation on Approval
When a PT is approved and items have changed, the stock delta must be applied:
- If qty decreased in the repair → stock is **restored** (partially un-disposed)
- If qty increased in the repair → stock is **further decreased**
- If a product is removed from the record → its full qty is restored
- If a new product is added → its qty is decreased

---

## Feature 3: Version History Viewer

Same behavior as the transaction version viewer.

- Timeline: V1 (original) → V2 (approved) → V3 (approved)...
- Each version shows: type badge, changed fields, who made the change, when
- Click any version to see a field-level diff against the previous version
- Color coding: Purple = original · Red = PT approved (no green — no instant type)

---

## Data Model

### ItemKeluar
```typescript
interface ItemKeluar {
  id: string
  currentVersionIndex: number
  versions: ItemKeluarVersion[]
  pendingRequest: ItemKeluarRepairRequest | null
  isDeleted: boolean
}
```

### ItemKeluarSnapshot
```typescript
interface ItemKeluarSnapshot {
  id: string
  outletId: string
  createdBy: string                  // userId
  items: Array<{
    itemId: string                   // MasterItem.id from mock/master-items.ts
    qty: number
    unitPrice: number                // manual entry
  }>
  totalLoss: number                  // computed: sum(qty * unitPrice)
  kategori: "Bugs" | "Afkir Terdisplay" | "Rotten"
  keterangan: string
  tanggal: string                    // "YYYY-MM-DD"
  pics: Array<{
    employeeId: string
    name: string
    amountAssigned: number           // IDR, manual — may not sum to totalLoss
  }>
}
```

### ItemKeluarVersion
```typescript
interface ItemKeluarVersion {
  index: number                      // 1, 2, 3...
  type: "original" | "approved"      // no "instant"
  snapshot: ItemKeluarSnapshot
  changedFields: string[]
  createdBy: string
  createdAt: string
  requestId: string | null
}
```

### ItemKeluarRepairRequest
```typescript
interface ItemKeluarRepairRequest {
  id: string
  itemKeluarId: string
  status: "pending" | "rejected" | "deleted"
  proposedSnapshot: ItemKeluarSnapshot
  submittedBy: string
  submittedAt: string
  rejectionReason: string | null
  revisions: number
}
```

### Employee (PIC master)
```typescript
interface Employee {
  id: string
  name: string
  role: string
}
```

### Constants
```typescript
const ITEM_KELUAR_CATEGORIES = ["Bugs", "Afkir Terdisplay", "Rotten"] as const
type ItemKeluarKategori = typeof ITEM_KELUAR_CATEGORIES[number]
```

---

## Task Breakdown (Parallelizable)

| # | Task | Type | Depends On |
|---|------|------|------------|
| 1 | Types, constants, mock data (ItemKeluar + Employee) | Backend | — |
| 2 | Item Keluar creation form & submission | Frontend + Backend | 1 |
| 3 | Item Keluar history page & version viewer | Frontend | 1 |
| 4 | PT — user request form & submit | Frontend + Backend | 1 |
| 5 | PT — admin queue & diff view | Frontend + Backend | 4 |
| 6 | PT — approve (with stock reconciliation) / reject / delete actions | Backend | 4 |
| 7 | PT — rejection reason display & resubmit flow | Frontend | 5, 6 |

Tasks 2 and 3 can run in parallel after Task 1. Tasks 4–7 follow the same dependency chain as the Perbaikan Transaksi feature.

---

## Out of Scope

- Admin-configurable categories (fixed list only)
- Automatic bill split between PICs
- Push notifications to admin when a PT request is submitted
- Role restrictions on who can create Item Keluar or submit PT requests
