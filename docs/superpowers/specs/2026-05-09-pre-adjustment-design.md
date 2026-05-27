# Pra-Penyesuaian Stok (Stock Pre-Adjustment) — Design Spec

**Date:** 2026-05-09
**Updated:** 2026-05-27
**Status:** Approved

---

## Overview

Stock Pre-Adjustment is a temporary virtual stock overlay that allows any staff member to unblock a sale when physical stock exists but hasn't yet been recorded in the system (e.g., a previous shift forgot to input Item Masuk via Pergerakan Stok). It does not write to the real stock ledger. Display stock is always computed as `OutletStock.stock + OutletStock.preAdjDelta`.

Admins have a separate **Adjustment** page at `/outlet/adjustment/` with cross-outlet visibility, force-close capability, and automatic reconciliation tracking against subsequent Pergerakan Stok (masuk) entries.

---

## Terminology

| Audience | Label used in UI |
|---|---|
| Cashier, Manager | Pre Adjustment |
| Administrator | Adjustment |

Routes are distinct: `/outlet/pre-adjustment/` for all roles, `/outlet/adjustment/` for admin only.

---

## Data Model

### `StockPreAdjustment`

```typescript
interface StockPreAdjustment {
    id: string
    outletId: string
    itemId: string
    delta: number                              // always a positive integer
    reason: "missing_item_masuk" | "physical_count_mismatch" | "transfer_input_error" | "system_error" | "other"
    note: string                               // required free text
    transferId: string | null                  // explicit ref — set only when reason === "transfer_input_error"
    status: "open" | "reverted" | "force_closed"
    createdBy: string
    createdAt: string
    revertedBy: string | null
    revertedAt: string | null
    forceClosedBy: string | null               // admin only
    forceClosedAt: string | null
    forceCloseNote: string | null              // required when force-closing
    reconciledPergerakanStokId: string | null  // ID of the PergerakanStok (masuk) that resolved the gap
    reconciliationStatus: "pending" | "reconciled" | "unresolved"
}

interface CreatePreAdjustmentPayload {
    outletId: string
    itemId: string
    delta: number
    reason: StockPreAdjustment["reason"]
    note: string
    transferId?: string                        // optional — only relevant when reason === "transfer_input_error"
}

interface ActiveTransferSummary {
    transferId: string
    qty: number
    toOutletName: string
}
```

`reconciliationStatus` defaults to `"pending"` on creation. While `status === "open"`, it is ignored in the UI. After revert/force-close, it auto-flips to `"reconciled"` when a matching Pergerakan Stok (masuk) is detected, or to `"unresolved"` after 7 days with no match.

---

## Stock Display Rule

`OutletStock.stock` must never be read directly in any cashier-facing UI. All stock figures go through:

```typescript
getDisplayStock(itemId: string, outletId: string): number
// defined in mock/master-items.ts — returns OutletStock.stock + OutletStock.preAdjDelta
```

`OutletStock.preAdjDelta` is maintained in sync by the pre-adjustment mock functions — it is **not recomputed dynamically** on each read. The functions are responsible for keeping it accurate:

- `createPreAdjustment()` → `OutletStock.preAdjDelta += delta`
- `revertPreAdjustment()` → `OutletStock.preAdjDelta -= delta`
- `forceClosePreAdjustment()` → `OutletStock.preAdjDelta -= delta`

**Pre-adjustments do not write `StockMovement` entries** — they are a virtual overlay on top of real stock, not a real stock change. Only `revertPreAdjustment()` / `forceClosePreAdjustment()` expose the real stock (potentially negative), which triggers the reconciliation flow against Pergerakan Stok masuk submissions.

---

## Feature 1: Pre Adjustment Creation (All Roles)

### Entry Points

**From `/outlet/pre-adjustment/`:**
- "+ Buat Pre Adjustment" button opens `PreAdjustmentModal.svelte`

**From POS (`/outlet/retail/`):**
- When `getDisplayStock()` returns `0` for a search result, a "Pre Adjustment" button appears below the item row
- Clicking it opens `PreAdjustmentModal.svelte` with the item pre-filled

### `PreAdjustmentModal.svelte` — Form Fields

| Field | Type | Rules |
|---|---|---|
| Item | searchable select | pre-filled when opened from POS |
| Jumlah (delta) | number input | min 1, required |
| Alasan | dropdown | required — see reason options below |
| Transfer Ref | text input | shown only when alasan = "Kesalahan Input Transfer"; optional free text that stores a `transferId` |
| Catatan | textarea | required free text |

**Reason dropdown options:**
- `missing_item_masuk` → "Item Masuk Belum Diinput"
- `physical_count_mismatch` → "Selisih Stok Fisik"
- `transfer_input_error` → "Kesalahan Input Transfer"
- `system_error` → "Kesalahan Sistem"
- `other` → "Lainnya"

When `transfer_input_error` is selected, a **Transfer Ref** field appears below the dropdown. The user pastes or types the Transfer ID (e.g., `TRF-00023`). This value is stored directly as `StockPreAdjustment.transferId` — no regex extraction.

### Transfer Context Warning

On item selection, the modal calls `getActiveTransfersForItem(itemId, outletId)`. If any unaccepted transfers exist where `fromOutletId` matches the current outlet, a warning banner renders inside the modal:

> "Ada transfer aktif untuk item ini: **8 unit** ke **Outlet B** (belum diterima)"

One banner line per active transfer. Informational only — does not block submission.

### On Submit

`createPreAdjustment(payload, userId)` is called. The new record has `status: "open"`, `reconciliationStatus: "pending"`. `OutletStock.preAdjDelta` is incremented by `delta`. Display stock updates immediately.

---

## Feature 2: Revert (All Roles — any open entry at their outlet)

Any authenticated user at the outlet can revert any open pre-adjustment at that outlet, regardless of who created it. From the **Aktif** tab of `/outlet/pre-adjustment/`, each open entry has a **Revert** button.

Clicking Revert shows a confirmation dialog:

> "Stok [Item Name] akan berkurang [delta] setelah Pre Adjustment ini dicabut. Lanjutkan?"

On confirm: `revertPreAdjustment(id, userId)` sets `status: "reverted"`, records `revertedBy` and `revertedAt`. `OutletStock.preAdjDelta -= delta`. `reconciliationStatus` remains `"pending"` — reconciliation tracking now begins.

Reverted entries move to the **Riwayat** tab.

---

## Feature 3: Outlet Pre Adjustment Page (`/outlet/pre-adjustment/`)

Standard dashboard per CLAUDE.md: search bar + per-page select + pagination on both tabs.

### Aktif Tab

**Toolbar:** search input (filters item name, reason label, note) + per-page select + "+ Buat Pre Adjustment" button

**Table columns:** Produk | Jumlah | Alasan | Catatan | Dibuat Oleh | Dibuat | Usia | Aksi

- Entries open > 24 hours show an amber warning badge on the Usia cell
- Aksi column: **Revert** button

**Pagination:** 5-button sliding window per CLAUDE.md canonical block.

### Riwayat Tab

**Toolbar:** search input (filters item name, reason label) + per-page select

**Table columns:** Produk | Jumlah | Alasan | Dibuat | Dicabut Oleh | Dicabut | Status Rekonsiliasi

- Status badges: `pending` (grey) · `reconciled` (green) · `unresolved` (red)
- Clicking a reconciled row shows the linked Pergerakan Stok ref (`reconciledPergerakanStokId`)

**Pagination:** 5-button sliding window per CLAUDE.md canonical block.

---

## Feature 4: Admin Adjustment Page (`/outlet/adjustment/`)

**Access:** `admin` role only. Non-admin is redirected to `/outlet/pre-adjustment/`.

Cross-outlet visibility — shows all open pre-adjustments across every outlet.

### Aktif Tab

**Toolbar:** search input (filters outlet name, item name, note) + per-page select

**Table columns:** Outlet | Produk | Jumlah | Alasan | Catatan | Dibuat Oleh | Usia | Aksi

- Entries open > 24 hours highlighted (amber row tint)
- Aksi column: **Force Close** button

**Force Close action:**
- Modal requires a non-empty `forceCloseNote`
- `forceClosePreAdjustment(id, adminId, note)` sets `status: "force_closed"`, treated as reverted for reconciliation tracking. `OutletStock.preAdjDelta -= delta`.

**Pagination:** 5-button sliding window per CLAUDE.md canonical block.

### Riwayat Tab

All reverted and force-closed entries across all outlets.

**Toolbar:** search input (filters outlet name, item name, reason label) + status filter (Semua / Reverted / Force Closed / Reconciled / Unresolved) + per-page select

**Table columns:** Outlet | Produk | Jumlah | Alasan | Dibuat Oleh | Dicabut/Ditutup | Tipe Penutupan | Rekonsiliasi | Transfer Ref

- **Tipe Penutupan** badge: `Reverted` (blue) · `Force Closed` (orange)
- **Rekonsiliasi** badge: `Pending` (grey) · `Reconciled` (green, shows `reconciledPergerakanStokId`) · `Unresolved` (red)
- **Transfer Ref** badge: shown if `transferId !== null`, displays the stored `transferId` value directly

**Pagination:** 5-button sliding window per CLAUDE.md canonical block.

---

## Feature 5: Reconciliation (Automatic)

`checkReconciliation(stokMasukId, outletId, itemId)` is called automatically inside `createStokMasuk()` in `mock/pergerakan-stok.ts`, **after** `logStockMovement()` has applied the masuk delta to `OutletStock.stock`.

Logic:
1. Read current `OutletStock.stock` for the item/outlet (post-masuk value)
2. If `stock >= 0`: find all `StockPreAdjustment` records where `outletId` matches, `itemId` matches, `status` is `"reverted"` or `"force_closed"`, and `reconciliationStatus === "pending"`
3. Mark all found records as `reconciled` and set `reconciledPergerakanStokId = stokMasukId`
4. Entries that remain `"pending"` after 7 days since `revertedAt` / `forceClosedAt` are flipped to `"unresolved"` on page load of either pre-adjustment page (via `markStaleAsUnresolved()`)

---

## Retail & Order Integration

### `getDisplayStock()` — Universal Rule

Every component that shows a stock quantity must call `getDisplayStock(itemId, outletId)` from `mock/master-items.ts` — never read `OutletStock.stock` directly.

### Retail Mode (`Retail.svelte`, `ProductSearchField.svelte`, `CartSection.svelte`)

- Search results display `getDisplayStock()`
- The "Pre Adjustment" quick-access button appears when `getDisplayStock() === 0`
- Cart qty validation checks against `getDisplayStock()`

### Order Mode (`Order.svelte`)

- Multi-outlet stock comparison table calls `getDisplayStock(itemId, outletId)` per outlet column
- If an outlet has an open pre-adjustment for the item, its stock cell shows a tinted badge indicating the figure includes a temporary adjustment

---

## Svelte Files

| Route | File | Access |
|---|---|---|
| `/outlet/pre-adjustment/` | `src/routes/outlet/pre-adjustment/+page.svelte` | All roles |
| `/outlet/adjustment/` | `src/routes/outlet/adjustment/+page.svelte` | Admin only |
| (shared modal) | `src/library/components/outlet/pre-adjustment/PreAdjustmentModal.svelte` | All roles |

`PreAdjustmentModal.svelte` is imported by both the outlet pre-adjustment page and `Retail.svelte`.

---

## Mock Functions (`mock/pre-adjustments.ts`)

> `getDisplayStock()` is defined in `mock/master-items.ts`. Import it from there — do not redefine it here.
> `mockOutletStock` must be imported from `mock/master-items.ts` so that `preAdjDelta` can be updated in place.

```typescript
// Context for modal warning banner
getActiveTransfersForItem(itemId: string, outletId: string): ActiveTransferSummary[]

// Cashier/Manager — updates OutletStock.preAdjDelta in master-items
createPreAdjustment(payload: CreatePreAdjustmentPayload, userId: string): StockPreAdjustment
revertPreAdjustment(id: string, userId: string): void

// Admin — updates OutletStock.preAdjDelta in master-items
forceClosePreAdjustment(id: string, adminId: string, note: string): void

// Queries
getActivePreAdjustments(outletId?: string): StockPreAdjustment[]   // no arg = all outlets
getAllPreAdjustments(outletId?: string): StockPreAdjustment[]

// Called on page load of either pre-adjustment page
markStaleAsUnresolved(): void

// Called inside createStokMasuk() in mock/pergerakan-stok.ts after logStockMovement
checkReconciliation(stokMasukId: string, outletId: string, itemId: string): void
```

---

## Out of Scope

- Delta can only be positive (additions only) — negative pre-adjustments are not supported
- Pre-adjustments cannot be edited after creation — only reverted or force-closed
- No push notifications or alerts for stale entries — staleness is surfaced passively in the UI
- Receipt printing does not reference pre-adjustments
