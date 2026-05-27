# Pergerakan Stok — Design Spec

**Date:** 2026-05-27
**Feature:** `/outlet/pergerakan-stok/` — Unified Stock In & Stock Out
**Status:** Approved
**Replaces:** `2026-05-03-item-masuk-design.md` and `2026-05-03-item-keluar-design.md` (both retired)

---

## Overview

Pergerakan Stok unifies Item Masuk (stock in) and Item Keluar (stock out) under a single feature, following the same pattern as Akuntansi (Kas Masuk + Kas Keluar). Users see one list of all stock movements and create records using a single modal with a type toggle that fully swaps the form content.

| Aspect | Detail |
|---|---|
| Stock effect (Masuk) | Increases immediately on submission |
| Stock effect (Keluar) | Decreases immediately on submission |
| Repair | Perbaikan Transaksi (PT) only — admin approval required |
| Versioning | V1 = original, V2+ = approved repairs only (no PTI) |
| Ref IDs | `IM-00001` format for masuk · `IK-00001` format for keluar (5-digit padded) |
| Item reference | `itemId` maps to `MasterItem.id` — sourced via `getMasterItems()` from `mock/master-items.ts` |
| Stock display | Always use `getDisplayStock(itemId, outletId)` — never read `OutletStock.stock` directly |

---

## Data Model

### Discriminated Snapshots

```typescript
interface StokMasukSnapshot {
    type: "masuk"
    id: string
    outletId: string
    createdBy: string                   // userId from $auth
    tanggal: string                     // "YYYY-MM-DD" — backdatable
    supplierId: string
    items: Array<{
        itemId: string                  // MasterItem.id
        qty: number
        hargaBeli: number               // always stored; UI display gated by outletConfig.showHargaBeli
    }>
    totalCost: number                   // computed: sum(qty × hargaBeli); gated by same config
    keterangan: string
}

interface StokKeluarSnapshot {
    type: "keluar"
    id: string
    outletId: string
    createdBy: string
    tanggal: string
    kategori: "Bugs" | "Afkir Terdisplay" | "Rotten"
    items: Array<{
        itemId: string                  // MasterItem.id
        qty: number
        unitPrice: number               // manual entry — not from MasterItem catalog
    }>
    totalLoss: number                   // computed: sum(qty × unitPrice)
    pics: Array<{
        employeeId: string
        name: string
        amountAssigned: number          // IDR, manual — may not sum to totalLoss
    }>
    keterangan: string
}

type StokSnapshot = StokMasukSnapshot | StokKeluarSnapshot
```

### Versioned Record

```typescript
interface StokVersion {
    index: number                       // 1, 2, 3...
    type: "original" | "approved"       // no "instant" — PTI not supported
    snapshot: StokSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

interface StokRepairRequest {
    id: string
    stokId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: StokSnapshot      // must match the same type as the original record
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

interface PergerakanStok {
    id: string                          // "IM-00001" or "IK-00001"
    currentVersionIndex: number
    versions: StokVersion[]
    pendingRequest: StokRepairRequest | null
    isDeleted: boolean
}
```

### Supporting Types

```typescript
interface Supplier {
    id: string
    name: string
}

interface OutletConfig {
    outletId: string
    showHargaBeli: boolean
}

const STOK_KELUAR_CATEGORIES = ["Bugs", "Afkir Terdisplay", "Rotten"] as const
type StokKeluarKategori = typeof STOK_KELUAR_CATEGORIES[number]
```

### Payload Types

```typescript
interface CreateStokMasukPayload {
    supplierId: string
    tanggal: string
    items: Array<{ itemId: string; qty: number; hargaBeli: number }>
    keterangan: string
}

interface CreateStokKeluarPayload {
    kategori: StokKeluarKategori
    tanggal: string
    items: Array<{ itemId: string; qty: number; unitPrice: number }>
    pics: Array<{ employeeId: string; name: string; amountAssigned: number }>
    keterangan: string
}
```

`outletId` and `createdBy` are always injected from `$auth` inside the mock function — callers never supply them.

---

## Stock Architecture

| Concern | Detail |
|---|---|
| Source: Masuk submission | `"item_masuk"` — one entry per line item, `delta = +qty`, `sourceId = stokId` |
| Source: Keluar submission | `"item_keluar"` — one entry per line item, `delta = -qty`, `sourceId = stokId` |
| Source: Masuk PT approval | `"item_masuk_pt"` — one correcting entry per changed item, `delta = newQty - oldQty`, `sourceId = repairRequestId` |
| Source: Keluar PT approval | `"item_keluar_pt"` — one correcting entry per changed item, `delta = -(newQty - oldQty)`, `sourceId = repairRequestId` |

All stock changes call `logStockMovement()` from `mock/stock-movements.ts`.

---

## Routes & Pages

| Path | File | Access |
|---|---|---|
| `/outlet/pergerakan-stok/` | `src/routes/outlet/pergerakan-stok/+page.svelte` | All roles |
| `/outlet/pergerakan-stok/repair` | `src/routes/outlet/pergerakan-stok/repair/+page.svelte` | Admin only |

---

## Main Page — `/outlet/pergerakan-stok/`

### Toolbar

```
[🔍 Cari...          ]   [25 / halaman ▾]   [+ Tambah]
[Semua] [Item Masuk] [Item Keluar]            ← chip filter
```

- Search filters across: Ref ID, keterangan, supplier name (masuk), kategori (keluar)
- Changing search or chip filter resets `currentPage` to 1
- Per-page: 10 / 25 / 50 / 100 (per CLAUDE.md canonical block)
- Chip filter: **Semua** (default) · **Item Masuk** · **Item Keluar**

### Table Columns

| Tanggal | Tipe | Ref ID | Item | Info | Aksi |
|---|---|---|---|---|---|
| Target date | `Masuk` (blue badge) / `Keluar` (red badge) | e.g. IM-00023 | count e.g. "3 item" | Supplier name (masuk) · Kategori (keluar) | Lihat Versi + PT button |

### Aksi Column

Each row has two actions:
1. **Lihat Versi** — always visible; opens version timeline modal
2. PT button — state-dependent (see below)

### PT Button States

| State | Display |
|---|---|
| No pending request | "Perbaikan" button |
| `pendingRequest.status === "pending"` | "⏳ Menunggu" badge (non-clickable) |
| `pendingRequest.status === "rejected"` | "Revisi" button |

Pagination: 5-button sliding window per CLAUDE.md canonical block.

---

## StokFormModal — `src/library/components/pergerakan-stok/StokFormModal.svelte`

Used for create (new record) and PT request submission/revision. Records are immutable after creation — there is no direct edit mode.

### Type Toggle

Top toggle inside the modal fully swaps the form content:

```
[📥 Item Masuk]  [📤 Item Keluar]
```

Switching type resets all form fields. The toggle is locked once the record is saved (PT edits preserve the original type — masuk stays masuk, keluar stays keluar).

### Item Masuk Form Fields

| Section | Fields |
|---|---|
| Info Umum | Supplier (dropdown from `mockSuppliers`) · Tanggal (date, defaults to today, backdatable) |
| Daftar Item | Rows: Item picker (`MasterItem`, active only) · Qty · Harga Beli (hidden if `!outletConfig.showHargaBeli`) |
| Footer | Keterangan (free text) |

- **Item picker** uses `getMasterItems()` — searchable by name or SKU, shows current stock (`getDisplayStock`)
- **+ Tambah Item** appends a new empty row
- Rows can be removed (minimum 1 row required)
- `totalCost` displayed below items if `outletConfig.showHargaBeli = true`

### Item Keluar Form Fields

| Section | Fields |
|---|---|
| Info Umum | Kategori (dropdown: Bugs / Afkir Terdisplay / Rotten) · Tanggal |
| Daftar Item | Rows: Item picker (`MasterItem`, active only) · Qty · Harga Satuan |
| PIC & Tanggung Jawab | Rows: PIC name (dropdown from `mockEmployees`) · Jumlah (IDR, manual) |
| Footer | Keterangan (free text) |

- `totalLoss = sum(qty × unitPrice)` displayed below items
- PIC amounts may not sum to `totalLoss` — remainder is absorbed (unassigned)
- Minimum 1 item row; PIC rows are optional

### Validation (on submit)

- At least 1 item row with `itemId` selected and `qty > 0`
- No duplicate `itemId` within the same record
- Masuk: `hargaBeli >= 0` (zero allowed)
- Keluar: `unitPrice >= 0`; if any PIC row exists, `employeeId` must be selected and `amountAssigned > 0`

### Footer Actions

**Create mode:**
- Batal · Simpan

**PT Request mode (opened from Perbaikan / Revisi button):**
- Shows yellow banner if revising a rejected request: *"Permintaan sebelumnya ditolak: [reason]"*
- Catatan PT field (requester's explanation, optional)
- Batal · Kirim Permintaan PT (or "Kirim Ulang" on revision)

---

## Admin PT Page — `/outlet/pergerakan-stok/repair`

Access: Admin role only. Redirects non-admin to `/outlet/pergerakan-stok/`.

### Layout

Two tabs: **Pending** (default) · **Selesai**

**Pending tab columns:** Ref ID · Tipe badge · Diminta oleh · Tgl Diminta · Revisi ke-N · Review button

**Selesai tab columns:** Same + Status (Disetujui / Ditolak / Dihapus)

### Review Panel (inline, expanded on row click)

- Current snapshot vs proposed snapshot — field-level diff
  - Changed fields highlighted with before/after values
  - Item rows: show added (green tint), removed (red tint), modified (amber tint)
  - Unchanged items collapsed
- Requester's catatan (amber box, if any)

### Admin Actions

| Action | Effect |
|---|---|
| **Setujui** | New `"approved"` version committed; stock delta applied; `pendingRequest` cleared |
| **Tolak** | Inline reason input → `pendingRequest.status = "rejected"`, reason stored |
| **Hapus Permintaan** | `dismissRepairRequest()` — removes request, record unlocked, no stock change |
| **Hapus Record** | `isDeleted = true`; stock reversed for all original items; `pendingRequest` cleared |

### Stock Reconciliation on Setujui

**Masuk record approved:**
- Qty increased → `delta = +difference` (more stock received than originally logged)
- Qty decreased → `delta = -difference`
- Item removed → `delta = -originalQty`
- Item added → `delta = +newQty`

**Keluar record approved:**
- Qty decreased → `delta = +difference` (stock partially restored)
- Qty increased → `delta = -difference`
- Item removed → `delta = +originalQty`
- Item added → `delta = -newQty`

All deltas logged with `source: "item_masuk_pt"` or `"item_keluar_pt"`.

---

## Version History

Accessible from a "Lihat Versi" button on each row (or inline in the review panel).

- Timeline: V1 (Original) → V2 (Approved) → … → ⏳ (Pending, if any)
- Each version: type badge, changed fields summary, author, timestamp
- Click any version for field-level diff vs previous version
- Color coding: Purple = original · Amber = approved via PT

---

## Mock Functions (`mock/pergerakan-stok.ts`)

```typescript
// Queries
getPergerakanStokList(outletId: string): PergerakanStok[]
getStokById(id: string): PergerakanStok | undefined
getPTRequests(status?: StokRepairRequest["status"]): StokRepairRequest[]

// Creation
createStokMasuk(payload: CreateStokMasukPayload, userId: string, outletId: string): PergerakanStok
createStokKeluar(payload: CreateStokKeluarPayload, userId: string, outletId: string): PergerakanStok

// PT — user actions
submitRepairRequest(stokId: string, proposedSnapshot: StokSnapshot, catatan: string | null, userId: string): StokRepairRequest
reviseRepairRequest(stokId: string, proposedSnapshot: StokSnapshot, catatan: string | null, userId: string): StokRepairRequest
deleteRepairRequest(stokId: string): void

// PT — admin actions
approveRepairRequest(stokId: string, adminId: string): void   // applies stock delta
rejectRepairRequest(stokId: string, reason: string, adminId: string): void
dismissRepairRequest(stokId: string, adminId: string): void       // removes request, unlocks record, no stock change
deleteRecord(stokId: string, adminId: string): void              // reverses all stock, isDeleted = true
```

ID generation: `IM-` prefix for masuk, `IK-` prefix for keluar, 5-digit zero-padded counter per type.

---

## Mock Data Seed

Four seed records:

1. **IM-00001** — Masuk, V1 original, no PT. Supplier A, 3 items. Stock increased.
2. **IK-00001** — Keluar, V1 original, pending PT request. Kategori: Rotten, 2 items, 1 PIC.
3. **IM-00002** — Masuk, V2 (original + approved PT), no pending request. Revised qty on 1 item.
4. **IK-00002** — Keluar, V1 original, rejected PT request (revision scenario). Kategori: Bugs.

---

## Svelte File Breakdown

| File | Responsibility |
|---|---|
| `src/routes/outlet/pergerakan-stok/+page.svelte` | List, chip filter, search, pagination, opens StokFormModal and PT form |
| `src/library/components/pergerakan-stok/StokFormModal.svelte` | Create form (masuk/keluar toggle + full swap), PT request/revision form |
| `src/routes/outlet/pergerakan-stok/repair/+page.svelte` | Admin PT queue — pending/resolved tabs, diff view, admin actions |
| `src/library/types/PergerakanStok.ts` | All TypeScript interfaces and payload types |
| `src/library/mock/pergerakan-stok.ts` | In-memory store + all CRUD and PT functions |
| `src/library/mock/suppliers.ts` | Supplier list (3–5 seed suppliers) |

3 Svelte component files — within CLAUDE.md limit.

---

## Business Rules

1. A record must contain at least 1 item to be saved.
2. The same `itemId` cannot appear twice in the same record.
3. `qty` must be > 0 for all item rows.
4. PT requests preserve the original record type — masuk stays masuk, keluar stays keluar. The type toggle is locked in PT mode.
5. Only one PT request may be pending per record at a time.
6. A rejected PT request unlocks the record — user may revise and resubmit.
7. Admin "Hapus Record" reverses all stock movements from the original submission.
8. `hargaBeli` is always stored in the snapshot; UI visibility is gated by `outletConfig.showHargaBeli`.
9. PIC bill-split amounts may be less than `totalLoss` — the unassigned remainder is absorbed.
10. `createdBy` is auto-set from `$auth.userId` — never user-editable.

---

## Retired Specs

The following specs are superseded by this document and should not be implemented:
- `docs/superpowers/specs/2026-05-03-item-masuk-design.md`
- `docs/superpowers/specs/2026-05-03-item-keluar-design.md`
- `docs/superpowers/plans/2026-05-03-item-masuk.md`
- `docs/superpowers/plans/2026-05-03-item-keluar.md`

---

## Out of Scope

- Dynamic supplier list from server (hardcoded mock only)
- Cost analytics or purchase reporting
- Per-item `hargaBeli` toggle (config is outlet-wide)
- Admin-configurable disposal categories (fixed list)
- Automatic PIC bill split
- Push notifications to admin on PT submission
- Role restrictions on who can create records or submit PT requests
