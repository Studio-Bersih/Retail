# Master Item Feature Design

## Goal

Provide a central admin-managed product catalog (Master Item) where every item that can be stocked, sold, converted, or produced is defined once and then distributed to outlets via a region model. Every stock-changing operation across all features reads from this catalog and writes stock movements to an append-only log that forms the foundation for future Kartu Stok.

---

## Architecture

Admin-only CRUD under `/factory/master-item/`. Items are defined globally; per-outlet stock records (`OutletStock`) are auto-generated when an item is assigned to a region. An append-only `StockMovement` log is written by every feature that changes stock — it is the authoritative event source for future Kartu Stok queries.

Two Svelte files total (within the 3-file limit):
- `src/routes/factory/master-item/+page.svelte` — list page
- `src/library/components/master-item/ItemModal.svelte` — create/edit modal

---

## Data Model

### MasterItem

```typescript
interface MasterItem {
    id: string
    sku: string
    barcode: string | null
    name: string
    description: string | null
    imageUrl: string | null          // optional product image
    category: string
    satuan: string
    weight: number | null            // grams, optional
    height: number | null            // cm, optional
    priceLevel1: number              // default POS retail price (required)
    priceLevel2: number              // e.g. corporate/B2B (0 = not set)
    priceLevel3: number              // e.g. food delivery apps (0 = not set)
    priceLevel4: number              // e.g. e-commerce (0 = not set)
    priceLevel5: number              // custom (0 = not set)
    isActive: boolean                // false = hidden from POS search and all features
    availableRegions: string[]       // e.g. ["Jakarta", "Bandung"]
    createdBy: string
    createdAt: string
    updatedBy: string | null
    updatedAt: string | null
}
```

**Price level rules:**
- `priceLevel1` is mandatory — it is the default price used in POS retail transactions.
- Levels 2–5 default to `0` (meaning not configured). Features that need a specific price level read from the appropriate field; `0` means fall back to level 1.
- Price labels (e.g. "Perusahaan", "Food Hailing") are display-only conventions — not stored on the item.

### OutletStock

One record per `(itemId, outletId)` pair. Created automatically when an item is saved with a region; never deleted — stock is preserved even if a region is later removed from an item.

```typescript
interface OutletStock {
    itemId: string
    outletId: string
    region: string       // snapshot of the outlet's region at record creation
    stock: number        // real physical stock count
    preAdjDelta: number  // sum of open pre-adjustment deltas for this item/outlet
}
```

**Display stock rule (applies everywhere in the app):**
```typescript
function getDisplayStock(itemId: string, outletId: string): number {
    // real stock + open pre-adjustment deltas
    return outletStock.stock + outletStock.preAdjDelta
}
```

`getDisplayStock()` must be used anywhere stock is shown to a user. Never use `outletStock.stock` directly.

### StockMovement

Append-only event log. Every feature that changes stock calls `logStockMovement()` — no exceptions. This log is the single source of truth for Kartu Stok.

```typescript
type StockMovementSource =
    | "item_masuk"          // stock received from supplier
    | "item_masuk_pt"       // supplier receipt correction (PT approved)
    | "item_keluar"         // stock removed (damaged, lost, etc.)
    | "item_keluar_pt"      // removal correction (PT approved)
    | "sale"                // POS retail/order transaction
    | "sale_void"           // voided transaction (stock returned)
    | "transfer_out"        // stock sent to another outlet
    | "transfer_in"         // stock received from another outlet
    | "transfer_cancelled"  // transfer cancelled (stock reversed)
    | "konversi_consume"    // items consumed as input to conversion formula
    | "konversi_produce"    // items produced as output of conversion formula
    | "produksi_consume"    // raw materials consumed on production finalization
    | "produksi_produce"    // produced items added to stock on finalization
    | "produksi_pt"         // production correction (PT approved)
    | "initial_stock"       // stock set when item is first distributed to an outlet
    | "stock_opname"        // physical stock correction (future: Kartu Stok)

interface StockMovement {
    id: string
    itemId: string
    outletId: string
    delta: number           // positive = stock in, negative = stock out
    source: StockMovementSource
    sourceId: string        // ID of the originating record (e.g. item masuk ID, sale ID)
    stockBefore: number     // real stock before this movement
    stockAfter: number      // real stock after this movement
    executedBy: string      // userId
    executedAt: string      // ISO timestamp
    note: string | null
}
```

**logStockMovement contract:**
```typescript
function logStockMovement(payload: {
    itemId: string
    outletId: string
    delta: number
    source: StockMovementSource
    sourceId: string
    executedBy: string
    note?: string
}): StockMovement
```

The function reads current `OutletStock.stock` to compute `stockBefore`, applies delta to get `stockAfter`, updates `OutletStock.stock`, appends the movement record, and returns it.

---

## Region Distribution Model

- Each `Outlet` has a single `region: string` property.
- Each `MasterItem` has `availableRegions: string[]`.
- An outlet can stock and sell an item if `outlet.region` is in `item.availableRegions`.

**On item create:** For every outlet whose `region` is in `availableRegions`, create an `OutletStock` record with `stock: 0`, `preAdjDelta: 0`. Log one `initial_stock` movement (delta: 0) per outlet to establish the event chain.

**On item edit (region change):**
- Region added → create `OutletStock` records for new outlets (if not already existing).
- Region removed → do **not** delete existing `OutletStock` records. Stock data is preserved. The item simply becomes unavailable in those outlets for new transactions.

---

## Routes & Pages

### `/factory/master-item/` → `src/routes/factory/master-item/+page.svelte`

- **Access:** `admin` role only.
- **List columns:** Nama/SKU, Kategori, Satuan, Wilayah (region badges), Harga L1, Status (Aktif/Nonaktif), Aksi (Edit button).
- **Toolbar:** search input (filters name, SKU, barcode, category, satuan) + Active/Inactive/All filter toggle + per-page select (10/25/50/100).
- **Pagination:** 5-button sliding window per CLAUDE.md convention.
- **Actions:** "+ Tambah Item" button opens `ItemModal` in create mode. Edit button opens `ItemModal` in edit mode with pre-filled values.
- **No hard delete.** Items are deactivated (`isActive = false`) only. The deactivation state is controlled via the `isActive` toggle inside `ItemModal`.

---

## ItemModal Form

`src/library/components/master-item/ItemModal.svelte` — used for both create and edit.

### Section 1: Identitas Item

| Field | Type | Required | Notes |
|---|---|---|---|
| Foto Item | image upload | No | JPG/PNG, max 2 MB. Stored as `imageUrl`. |
| Nama Item | text | Yes | |
| SKU | text | Yes | Unique identifier |
| Barcode | text | No | EAN/UPC etc. |
| Kategori | text | Yes | Free text (no master list yet) |
| Satuan | text | Yes | e.g. Pcs, Slop, Kg |
| Berat (gram) | number | No | Maps to `weight` |
| Tinggi (cm) | number | No | Maps to `height` |
| Deskripsi | textarea | No | |

### Section 2: Harga

| Field | Required | Notes |
|---|---|---|
| Level 1 | Yes | Highlighted. Default POS retail price. |
| Level 2 | No | 0 if blank |
| Level 3 | No | 0 if blank |
| Level 4 | No | 0 if blank |
| Level 5 | No | 0 if blank |

### Section 3: Wilayah Distribusi

- One checkbox per region (derived from all known outlets' distinct regions).
- Checked region shows outlet count and "OutletStock akan dibuat" label.
- Summary line below: "Item akan tersedia di N outlet (Region A + Region B)".
- At least one region must be selected to save.

### Section 4: Status

- Toggle: Aktif / Nonaktif.
- When Nonaktif: item is hidden from POS search, item masuk, item keluar, transfer, konversi, and all other features. Only visible in the Master Item list (with Nonaktif filter).

---

## Business Rules

1. **SKU is unique** across all master items. Validate on save.
2. **isActive = false** hides the item from all feature searches. It does not affect existing stock records or movement history.
3. **priceLevel1 is always required.** Levels 2–5 may be 0 (not configured).
4. **Regions removed on edit** do not trigger deletion of `OutletStock`. Historical stock data is never destroyed.
5. **imageUrl** is stored as a URL string. In mock, any file selection stores a placeholder URL. Real implementation would upload to object storage.
6. **`getDisplayStock()` everywhere.** No feature may read `OutletStock.stock` directly without adding `preAdjDelta`.

---

## Mock Functions

`src/library/mock/master-items.ts` replaces the old `src/library/mock/items.ts`.

```typescript
// Query
getMasterItems(): MasterItem[]
getMasterItemById(id: string): MasterItem | undefined
getOutletStock(itemId: string, outletId: string): OutletStock | undefined
getDisplayStock(itemId: string, outletId: string): number

// Mutations
createMasterItem(payload: CreateMasterItemPayload): MasterItem
updateMasterItem(id: string, payload: UpdateMasterItemPayload): MasterItem
```

`src/library/mock/stock-movements.ts` — shared across all features:

```typescript
logStockMovement(payload: LogStockMovementPayload): StockMovement
getStockMovements(itemId: string, outletId: string): StockMovement[]  // for future Kartu Stok
```

### Payload types

```typescript
interface CreateMasterItemPayload {
    sku: string
    barcode: string | null
    name: string
    description: string | null
    imageUrl: string | null
    category: string
    satuan: string
    weight: number | null
    height: number | null
    priceLevel1: number
    priceLevel2: number
    priceLevel3: number
    priceLevel4: number
    priceLevel5: number
    isActive: boolean
    availableRegions: string[]
}

type UpdateMasterItemPayload = Partial<CreateMasterItemPayload>
```

---

## Kartu Stok Foundation

Kartu Stok is not implemented in this feature but is enabled by it. Once `StockMovement` is being written by all features, Kartu Stok is a single query:

```typescript
getStockMovements(itemId, outletId)
// filter by source, date range, delta direction
// compute running balance per row
// zero new infrastructure needed
```

The `StockMovementSource` enum covers all current and planned features. Any future feature that touches stock must add its source type here and call `logStockMovement()`.

---

## Role-Based Access

| Role | Access |
|---|---|
| `admin` | Full CRUD on Master Item. Read all OutletStock. |
| `manager` | Read-only (no create/edit). |
| `cashier` | No access to Master Item page. Items visible only through POS search. |

---

## Svelte File Breakdown

| File | Responsibility |
|---|---|
| `src/routes/factory/master-item/+page.svelte` | List page — table, search, filter, pagination, create/edit trigger |
| `src/library/components/master-item/ItemModal.svelte` | Create/edit form — all 4 sections, region checkbox logic, submit handler |
| `src/library/mock/master-items.ts` | Mock data + CRUD functions for MasterItem and OutletStock |
| `src/library/mock/stock-movements.ts` | Append-only movement log — `logStockMovement()` + `getStockMovements()` |
| `src/library/types/MasterItem.ts` | TypeScript interfaces: MasterItem, OutletStock, StockMovement, StockMovementSource, payload types |
