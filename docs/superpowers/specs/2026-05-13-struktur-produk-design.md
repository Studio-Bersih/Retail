# Struktur Produk — Design Spec

**Date:** 2026-05-13
**Status:** Approved

---

## Overview

Struktur Produk is the bill-of-materials feature. It defines what input items are consumed to produce one unit of an output item. Admins manage these structures; they are used by Rencana Produksi to auto-fill the input materials cart when an output item is selected.

| Aspect | Detail |
|---|---|
| Access | Admin only — create, edit, deactivate |
| Output yield | Always 1 unit per structure. Scaling is handled by Rencana Produksi's multiplier. |
| Uniqueness | One structure per output item. Creating a second structure for the same output item is blocked. |
| Deletion | Never deleted — deactivated only (`isActive = false`) to preserve production history |
| Snapshot | Rencana Produksi stores a `strukturSnapshot` at plan creation time. Edits to a structure do not affect existing plans. |
| Stock effect | None. Struktur Produk is a definition only. Stock changes happen in Rencana Produksi. |

---

## Data Model

```typescript
interface StrukturProduk {
    id: string
    outputItemId: string              // MasterItem.id — unique, one structure per output item
    components: StrukturKomponen[]    // input materials consumed to produce 1 unit of output
    notes: string | null
    isActive: boolean
    createdBy: string
    createdAt: string
    updatedBy: string | null
    updatedAt: string | null
}

interface StrukturKomponen {
    itemId: string                    // MasterItem.id — input material
    qty: number                       // quantity consumed per 1 unit of output
}

interface CreateStrukturPayload {
    outputItemId: string
    components: StrukturKomponen[]
    notes: string | null
}

type UpdateStrukturPayload = Partial<CreateStrukturPayload> & { isActive?: boolean }
```

**No name field** — the output item's name (from MasterItem) is the identifier everywhere it appears in the UI.

---

## itemType Filtering

`MasterItem.itemType` drives which items appear in which picker:

| Picker | Shows |
|---|---|
| Output item picker | `finished_good` and `both` only |
| Component picker | `raw_material` and `both` only |

This prevents admins from accidentally selecting a raw material as the output of a structure, or a finished product as an input component. Items with `itemType: "both"` appear in both pickers.

---

## Routes & Pages

One route, admin-only:

| Path | File |
|---|---|
| `/factory/struktur-produk/` | `src/routes/factory/struktur-produk/+page.svelte` |

---

## Page Layout — `/factory/struktur-produk/`

- Standard toolbar: search input (left) + per-page select (right), per CLAUDE.md convention
- Search filters across: output item name, output item SKU
- Status filter toggle: **Semua / Aktif / Nonaktif**
- **"+ Buat Struktur"** button opens `StrukturModal` in create mode

### Table Columns

| Column | Detail |
|---|---|
| Produk Output | Item name (bold) + SKU (muted monospace below) |
| Komponen | Count of component rows, e.g. "3 item" |
| Status | `Aktif` (green badge) · `Nonaktif` (grey badge) |
| Aksi | **Edit** button — opens `StrukturModal` in edit mode |

- Nonaktif rows render at reduced opacity
- Pagination: 5-button sliding window per CLAUDE.md convention

---

## StrukturModal — Create / Edit Form

`src/library/components/struktur-produk/StrukturModal.svelte`

Used for both create and edit. When `struktur` prop is `null`, it's create mode.

### Section 1: Produk Output

| Field | Required | Notes |
|---|---|---|
| Item yang diproduksi | Yes | Searchable select — shows only `finished_good` and `both` items. In edit mode, locked (cannot change output item after creation). |

Helper text below the field: *"Menghasilkan 1 unit per eksekusi. Jumlah diatur saat Rencana Produksi."*

In create mode: if the selected output item already has an active structure, show a validation error — *"Item ini sudah memiliki Struktur Produk."*

### Section 2: Komponen

Dynamic list of rows. Each row:

| Sub-field | Detail |
|---|---|
| Item picker | Searchable select — shows only `raw_material` and `both` items. Output item excluded from list. No duplicate items allowed across rows. |
| Qty | Number input, min 0.01, required |
| Remove `✕` | Removes the row. Minimum 1 component required. |

**"+ Tambah Komponen"** button appends a new empty row.

**Live preview** below the component list:
> `1× Kue Brownies ← Tepung Terigu 500g + Gula Pasir 300g + Coklat Bubuk 100g`

### Section 3: Catatan & Status

| Field | Required | Notes |
|---|---|---|
| Catatan | No | Free-text note |
| isActive toggle | — | Defaults to `true` on create. Edit mode shows current state. |

### Actions

- **Batal** — closes modal, no save
- **Simpan** — validates then calls `createStrukturProduk()` or `updateStrukturProduk()`

---

## Business Rules

1. **One structure per output item.** `outputItemId` is unique across all structures. Blocked on save if another structure (active or inactive) already exists for the same output item.
2. **Output item is immutable after creation.** The output item field is locked in edit mode to preserve the one-to-one relationship.
3. **Minimum 1 component.** A structure with zero components cannot be saved.
4. **No duplicate components.** The same item cannot appear twice in the component list.
5. **Component cannot be the output item.** The output item is excluded from the component picker.
6. **No delete.** Structures are deactivated (`isActive = false`), never removed. A deactivated structure can be reactivated via Edit.
7. **Snapshot isolation.** Once Rencana Produksi stores a `strukturSnapshot`, changes to the structure do not affect that plan. The structure is the template; the snapshot is the locked record.

---

## Mock Functions (`mock/struktur-produk.ts`)

```typescript
// Queries
getStrukturProdukList(): StrukturProduk[]
// Returns all structures (active + inactive). Admin list page.

getActiveStrukturProdukList(): StrukturProduk[]
// Returns active structures only. Used by Rencana Produksi pickers.

getStrukturByOutputItem(outputItemId: string): StrukturProduk | undefined
// Lookup by output item. Used by Rencana Produksi to auto-fill components.

// Mutations
createStrukturProduk(payload: CreateStrukturPayload, adminId: string): StrukturProduk
updateStrukturProduk(id: string, payload: UpdateStrukturPayload, adminId: string): StrukturProduk
```

---

## Svelte File Breakdown

| File | Responsibility |
|---|---|
| `src/routes/factory/struktur-produk/+page.svelte` | List page — table, search, status filter, pagination, create/edit trigger |
| `src/library/components/struktur-produk/StrukturModal.svelte` | Create/edit modal — output item picker, dynamic component rows, live preview, notes, status toggle |
| `src/library/mock/struktur-produk.ts` | In-memory store + CRUD functions |
| `src/library/types/StrukturProduk.ts` | TypeScript interfaces: StrukturProduk, StrukturKomponen, payload types |

---

## Integration with Rencana Produksi

When a user selects an output item in Rencana Produksi:
1. Call `getStrukturByOutputItem(outputItemId)`
2. If a structure exists: auto-fill the input materials cart with all components, storing a `strukturSnapshot` (deep copy of the structure at that moment)
3. If no structure exists: input materials cart remains empty — user fills it manually
4. The `strukturSnapshot` is stored on the Rencana Produksi record and never updated, even if the structure is later edited

---

## Out of Scope

- Multiple structures per output item (alternative methods/formulas)
- Output yield other than 1 unit (e.g., "this structure produces 20 units") — handled by Rencana Produksi multiplier
- Version history on structure edits
- Cost / pricing implications
- Structure duplication (clone) tool
