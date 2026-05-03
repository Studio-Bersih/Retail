# Perbaikan Transaksi — Design Spec

**Date:** 2026-05-03  
**Project:** Studio Bersih - POS  
**Status:** Approved

---

## Overview

Two repair modes for transaction history, separated by scope and authorization:

| Mode | Scope | Authorization | Versioned |
|------|-------|---------------|-----------|
| **Perbaikan Transaksi Instan (PTI)** | Logistical fields only | Instant, no approval | Yes |
| **Perbaikan Transaksi (PT)** | Any field | Admin approval required | Yes (on approval) |

Both modes create a new version snapshot in the transaction's version history (V1, V2, V3...). Any user can initiate either repair type on any transaction, with no time restriction.

---

## Feature 1: Perbaikan Transaksi Instan (PTI)

### Editable Fields
- Keterangan (notes)
- Tanggal Kirim (delivery date)
- Jam Kirim Pesanan (delivery time)
- Status Pesanan: `"Dikirim"` | `"Diambil"`
- Kontak yang dapat dihubungi (WhatsApp number)

### Forbidden Fields
All financial and inventory fields are locked: items, quantities, payment method, pricing, discounts, additional costs.

### Flow
1. User opens a transaction in history
2. Clicks **Perbaikan Instan**
3. Edits only the allowed fields (forbidden fields are visible but non-editable)
4. Clicks **Simpan**
5. A new version snapshot is created immediately — no approval step

### Concurrency
PTI edits are allowed even while a PT request is pending on the same transaction, since they edit non-overlapping fields.

---

## Feature 2: Perbaikan Transaksi (PT)

### Editable Fields
Everything — items, quantities, payment methods, pricing, discounts, additional costs, and all logistical fields.

### Flow

**User side:**
1. Opens a transaction in history
2. Clicks **Perbaikan Transaksi**
3. Edits any field in the full transaction form
4. Clicks **Submit Request**
5. Transaction is locked (one pending PT request at a time)
6. Waits for admin action — can see request status (pending / rejected with reason)
7. If rejected: sees rejection reason, can revise and resubmit, or delete the request

**Admin side:**
1. Sees incoming request in the admin repair queue
2. Opens the diff view — original vs proposed, field by field
3. Takes one of four actions:
   - **Approve** → new version created, transaction unlocked
   - **Reject** → provides rejection reason, user is notified and can revise/resubmit
   - **Delete Request** → request dismissed, transaction unlocked
   - **Delete Transaction** → full transaction (and all versions) removed

### Revision Tracking
Each time a user resubmits after rejection, the `revisions` counter increments on the `RepairRequest`. The rejection reason history is preserved.

---

## Feature 3: Version History Viewer

Shared by both repair types. Accessible from any transaction in history.

- Displays a timeline: V1 → V2 → V3...
- Each version is labeled by type: `original` | `instant` | `approved`
- Each version shows: who made the change, when, and which fields changed
- User can select any two versions to compare (diff view)
- Color coding: Purple = original · Green = PTI · Red = PT approved

---

## Data Model

### Transaction
```typescript
interface Transaction {
  id: string
  currentVersionIndex: number       // index of the latest version
  versions: Version[]
  pendingRequest: RepairRequest | null
  isDeleted: boolean
}
```

### Version
```typescript
interface Version {
  index: number                      // 1, 2, 3...
  type: "original" | "instant" | "approved"
  snapshot: TransactionData          // full copy of transaction state at this version
  changedFields: string[]            // field keys that differ from previous version
  createdBy: string                  // userId
  createdAt: string                  // ISO timestamp
  requestId: string | null           // populated if type === "approved"
}
```

### RepairRequest (PT only)
```typescript
interface RepairRequest {
  id: string
  transactionId: string
  status: "pending" | "rejected" | "deleted"
  proposedSnapshot: TransactionData  // full proposed state
  submittedBy: string                // userId
  submittedAt: string                // ISO timestamp
  rejectionReason: string | null
  revisions: number                  // number of resubmits after rejection
}
```

---

## Task Breakdown (Parallelizable)

Each task below is independently implementable:

| # | Task | Type | Depends On |
|---|------|------|------------|
| 1 | Version data model & storage layer | Backend | — |
| 2 | Version History Viewer UI | Frontend | 1 |
| 3 | Perbaikan Transaksi Instan — form & save flow | Frontend + Backend | 1 |
| 4 | Perbaikan Transaksi — user request form & submit | Frontend + Backend | 1 |
| 5 | Perbaikan Transaksi — admin queue & diff view | Frontend + Backend | 4 |
| 6 | Perbaikan Transaksi — approve / reject / delete actions | Backend | 4 |
| 7 | Rejection reason display & resubmit flow (user side) | Frontend | 5, 6 |

Tasks 2 and 3 can run in parallel after Task 1. Tasks 4, 5, 6, 7 are sequential within the PT feature but independent from PTI.

---

## Out of Scope

- Push notifications to admin when a new PT request arrives (deferred)
- Role restrictions on who can submit repairs (any user can submit)
- Time-based restrictions on which transactions can be repaired (none)
