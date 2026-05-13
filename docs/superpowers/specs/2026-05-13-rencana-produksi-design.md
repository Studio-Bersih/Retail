# Rencana Produksi — Design Spec

**Date:** 2026-05-13
**Status:** Approved

---

## Overview

Rencana Produksi is a production batch feature. Each batch is a single planning record that contains multiple output items to be produced. Staff create a draft batch, fill in the output items and their consumed components (optionally guided by Struktur Produk), then finalize it — at which point stock movements are written. After finalization, staff can request a Perbaikan Transaksi (PT) to correct mistakes; admin resolves PT requests by rejecting, accepting with stock adjustments, or deleting the record entirely.

| Aspect | Detail |
|---|---|
| Access | All roles — create, edit, finalize, submit PT; Admin-only to resolve PT |
| Unit | One batch (`RencanaProduksi`) → many output items (`RencanaItem`) |
| Structure | Auto-fills components as guidance when a Struktur Produk exists; fully editable by user |
| Stock effect | Happens on finalization only: `produksi_produce` per output item, `produksi_consume` per component |
| Deletion | Draft: deletable. Finalized: permanent (removable only via admin PT "delete" action) |
| Batch ID | `RP-00001` format (5-digit padded) |

---

## Data Model

```typescript
interface RencanaKomponen {
    itemId: string      // MasterItem.id — input material consumed
    qty: number         // total quantity consumed for the full run (not per unit)
}

interface RencanaItem {
    outputItemId: string                    // MasterItem.id — finished_good or both, active only
    outputQty: number                       // how many units to produce (min 1)
    components: RencanaKomponen[]           // what gets consumed — user-editable, can be empty
    strukturSnapshot: {
        itemId: string
        qty: number
    }[] | null                              // component list from Struktur at draft creation; null if no structure existed
}

interface RencanaProduksi {
    id: string                              // "RP-00001" format
    outletId: string
    items: RencanaItem[]                    // at least 1 item required
    tanggalRencana: string                  // ISO date — target production date
    notes: string | null
    status: "draft" | "selesai"
    createdBy: string                       // userId
    createdAt: string                       // ISO timestamp
    finalizedBy: string | null
    finalizedAt: string | null
}

interface RencanaPTRequest {
    id: string
    rencanaId: string
    proposedItems: RencanaItem[]            // full proposed replacement of the items array
    notes: string | null                    // requester's explanation
    requestedBy: string
    requestedAt: string
    status: "pending" | "rejected" | "accepted_adjusted" | "accepted_deleted"
    rejectionReason: string | null
    reviewedBy: string | null
    reviewedAt: string | null
}

interface CreateRencanaPayload {
    items: RencanaItem[]
    tanggalRencana: string
    notes: string | null
}

type UpdateRencanaPayload = Partial<CreateRencanaPayload>
```

---

## Struktur Produk Integration

When a user adds an output item to the batch and a Struktur Produk exists for that item:

1. Call `getStrukturByOutputItem(outputItemId)` from `mock/struktur-produk.ts`
2. If found and active: auto-fill components as `qty = strukturKomponen.qty × outputQty`. Store the raw structure components (per-unit, not scaled) as `strukturSnapshot`. Show the blue hint: *"📋 Dari Struktur Produk: [item] ×[qty]/unit · ..."*
3. If not found: `strukturSnapshot = null`. Show the grey note: *"Tidak ada Struktur Produk — isi komponen secara manual."*
4. Auto-fill happens **only at item-addition time**. If the user later changes `outputQty`, component quantities are **not** automatically rescaled — the user adjusts them manually. This avoids tracking which rows are "snapshot-derived" vs. manually edited.

---

## Stock Effects on Finalization

For each `RencanaItem` in the batch:

```
// Output produced
logStockMovement({
    itemId: item.outputItemId,
    outletId: rencana.outletId,
    delta: +item.outputQty,
    source: "produksi_produce",
    sourceId: rencana.id,
    executedBy: finalizingUserId
})

// Each component consumed
for (const comp of item.components) {
    logStockMovement({
        itemId: comp.itemId,
        outletId: rencana.outletId,
        delta: -comp.qty,
        source: "produksi_consume",
        sourceId: rencana.id,
        executedBy: finalizingUserId
    })
}
```

Items with no components (e.g., Sprinkles with no structure) still log a `produksi_produce` movement — stock is added for the output with no corresponding consumption movements.

---

## PT Flow

### Submitting a PT Request (any role)

- Only available on finalized (`selesai`) records
- Blocked if a PT request is already pending for this record
- Staff submits: `proposedItems` (full proposed replacement) + optional `notes`
- Record is locked while PT is pending: no further PT requests can be submitted

### Admin Resolution (admin only, at `/factory/rencana-produksi/`)

**Option 1 — Tolak (Reject):**
- PT status → `"rejected"` with `rejectionReason`
- Record unlocked — staff can submit a new PT request

**Option 2 — Terima & Sesuaikan Stok (Accept with adjustments):**
- For each item where `outputQty` changed: log `produksi_pt` movement for the delta
- For each component where `qty` changed: log `produksi_pt` movement for the delta
- For components added in the proposal: log new `produksi_pt` consume movement
- For components removed in the proposal: log reverse `produksi_pt` movement
- Update the `RencanaProduksi.items` to `proposedItems`
- PT status → `"accepted_adjusted"`

```typescript
// Example delta calculation for an item:
// Original: Kue Brownies outputQty = 20
// Proposed: Kue Brownies outputQty = 15
// → delta = 15 - 20 = -5
logStockMovement({ itemId: outputItemId, delta: -5, source: "produksi_pt", ... })

// Original: Tepung Terigu consumed 10000g
// Proposed: Tepung Terigu consumed 7500g
// → delta = -(7500 - 10000) = +2500 (stock returned)
logStockMovement({ itemId: tepungId, delta: +2500, source: "produksi_pt", ... })
```

**Option 3 — Hapus & Batalkan (Delete and nullify):**
- Reverse all original `produksi_produce` movements: `delta = -item.outputQty` per item
- Reverse all original `produksi_consume` movements: `delta = +comp.qty` per component
- Delete the `RencanaProduksi` record from the store
- PT status → `"accepted_deleted"`

---

## Routes & Pages

| Path | File | Access |
|---|---|---|
| `/outlet/rencana-produksi/` | `src/routes/outlet/rencana-produksi/+page.svelte` | All roles |
| `/factory/rencana-produksi/` | `src/routes/factory/rencana-produksi/+page.svelte` | Admin only |

---

## Outlet Page — `/outlet/rencana-produksi/`

Standard toolbar: search input (searches notes + batch ID) + status filter toggle + per-page select.

**Status filter:** Semua / Draft / Selesai

### Table Columns

| Column | Detail |
|---|---|
| Tgl Rencana | Target production date (bold) + Batch ID muted below (e.g., RP-003) |
| Produk | Count of output items in the batch, e.g., "3 produk" |
| Dibuat Oleh | `createdBy` user name |
| Status | `Draft` (yellow badge) · `Selesai` (green badge). If PT pending: show "⏳ PT Pending" below badge |
| Aksi | Context-dependent (see below) |

**Aksi column by status:**

| Status | Actions |
|---|---|
| Draft | **Buka** (opens RencanaModal in edit mode) · **Hapus** (delete with confirm) |
| Selesai, no PT pending | **Buka** (opens RencanaModal in view mode) · **Ajukan PT** (opens PT form in modal) |
| Selesai, PT pending | **Buka** (dimmed, read-only) — no further PT button |

- Pagination: 5-button sliding window per CLAUDE.md convention

---

## RencanaModal

`src/library/components/rencana-produksi/RencanaModal.svelte`

Used for create, edit (draft), view (selesai), and PT request submission.

### Modes

| Prop | Mode |
|---|---|
| `rencana = null` | Create — empty batch, no ID yet |
| `rencana` is draft | Edit — all fields editable |
| `rencana` is selesai, `ptMode = false` | View — all fields locked, shows finalizedBy + finalizedAt |
| `rencana` is selesai, `ptMode = true` | PT Request — fields editable, submit as PT proposal |

### Header Section

| Field | Required | Notes |
|---|---|---|
| Tanggal Rencana | Yes | Date picker |
| Catatan | No | Free text |

### Daftar Produksi (item cards)

Each output item renders as a card containing:

**Card header:**
- Searchable output item picker (finished_good or both, active only) — locked in view/PT mode if item already has components from finalization
- Jumlah (outputQty) number input, min 1
- Satuan label (from MasterItem)
- ✕ remove button (disabled if only 1 item in batch)

**Structure hint** (shown when `strukturSnapshot !== null`):
> *📋 Dari Struktur Produk: [item name] ×[qty]/unit · ...*

**No-structure note** (shown when `strukturSnapshot === null`):
> *Tidak ada Struktur Produk — isi komponen secara manual.*

**Component rows:**
- Item select (raw_material or both, active only, no duplicates within the same card)
- Qty number input, min 0.01
- ✕ remove button
- **+ Tambah Komponen** button

**+ Tambah Produk Output** button below all cards.

### Footer Actions

**Create/Edit mode:**
- Batal
- Simpan Draft (yellow) — saves without finalizing
- Finalisasi → (primary) — validates then finalizes, writes stock movements

**View mode (selesai):**
- Shows: *Diselesaikan oleh [name] pada [date]*
- Tutup button only

**PT Request mode:**
- Catatan PT field (requester's explanation, optional)
- Batal
- Kirim Permintaan PT

### Validation (for Finalisasi and Simpan Draft)

- At least 1 output item
- Each item: `outputQty > 0`, `outputItemId` selected
- No duplicate output items across cards (same item cannot appear twice as output)
- Component rows: if any row exists, `itemId` must be selected and `qty > 0`
- No duplicate components within the same card

---

## Factory Page — `/factory/rencana-produksi/`

Admin-only PT queue.

### Layout

Two tabs: **Pending** (default) · **Selesai**

**Pending tab columns:** Rencana ID + date, Produk count, Diminta oleh, Tgl Diminta, Review button

**Selesai tab columns:** Same + Status (Diterima / Diterima & Dihapus / Ditolak)

### Review Panel

Opened inline (or as an expanded section) when admin clicks **Review →**:

- Requester info line: "Diminta oleh [name] pada [date]"
- Requester notes (amber box, if any)
- **Per-item diff:** for each item — original (red tint) vs proposed (green tint), side by side
  - Unchanged items collapsed with "Tidak ada perubahan"
  - Changed fields show delta indicator (e.g., `↓5`, `↑2500`)
- **Admin action buttons:**
  - **✓ Terima & Sesuaikan Stok** — applies deltas via `produksi_pt`, updates record
  - **🗑 Hapus & Batalkan** — reverses all original movements, deletes record
  - **Tolak** — inline rejection reason input + Tolak button

---

## Business Rules

1. A batch must contain at least 1 output item to be saved or finalized.
2. The same output item cannot appear twice in the same batch.
3. Each output item's `outputQty` must be ≥ 1.
4. Component rows are optional — items without a Struktur may have zero components.
5. Within a single item card, the same component item cannot appear twice.
6. Draft batches are freely editable and deletable.
7. Finalized batches are immutable except via PT resolution.
8. Only one PT request may be pending per batch at a time.
9. A rejected PT request unlocks the batch — staff may submit a new PT request.
10. PT resolution (accept or delete) is irreversible.
11. The `strukturSnapshot` is stored at draft creation time and never updated, even if the Struktur Produk is later edited.

---

## Mock Functions (`mock/rencana-produksi.ts`)

```typescript
// Queries
getRencanaProduksiList(outletId: string): RencanaProduksi[]
getRencanaById(id: string): RencanaProduksi | undefined
getPTRequests(status?: RencanaPTRequest["status"]): RencanaPTRequest[]
getPTRequestByRencana(rencanaId: string): RencanaPTRequest | undefined

// Draft mutations
createRencanaDraft(payload: CreateRencanaPayload, userId: string, outletId: string): RencanaProduksi
updateRencanaDraft(id: string, payload: UpdateRencanaPayload, userId: string): RencanaProduksi
deleteRencanaDraft(id: string): void                    // throws if status !== "draft"

// Finalization
finalizeRencana(id: string, userId: string): RencanaProduksi   // writes stock movements, status → "selesai"

// PT mutations
submitPTRequest(rencanaId: string, proposedItems: RencanaItem[], notes: string | null, userId: string): RencanaPTRequest
rejectPTRequest(ptId: string, reason: string, adminId: string): RencanaPTRequest
acceptAndAdjust(ptId: string, adminId: string): RencanaPTRequest    // applies produksi_pt deltas
deleteAndNullify(ptId: string, adminId: string): void               // reverses all movements, deletes rencana
```

---

## Svelte File Breakdown

| File | Responsibility |
|---|---|
| `src/routes/outlet/rencana-produksi/+page.svelte` | Batch list — search, status filter, pagination, opens RencanaModal |
| `src/library/components/rencana-produksi/RencanaModal.svelte` | Batch detail — create/edit/view/PT request, all item cards, component rows, finalization |
| `src/routes/factory/rencana-produksi/+page.svelte` | Admin PT queue — pending/resolved tabs, review panel, admin action buttons |
| `src/library/mock/rencana-produksi.ts` | In-memory store + all CRUD and PT functions |
| `src/library/types/RencanaProduksi.ts` | TypeScript interfaces: RencanaProduksi, RencanaItem, RencanaKomponen, RencanaPTRequest, payload types |

---

## Out of Scope

- Multiple PT requests in parallel on the same batch
- Partial PT (correcting only some items while others remain unchanged in the request)
- Production scheduling / calendar view
- Cost calculation (material cost vs. produced item value)
- Batch duplication (clone)
