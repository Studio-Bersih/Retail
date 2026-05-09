# Pra-Penyesuaian Stok (Stock Pre-Adjustment) — Design Spec

**Date:** 2026-05-09
**Status:** Approved

---

## Overview

Stock Pre-Adjustment is a temporary virtual stock overlay that allows any staff member to unblock a sale when physical stock exists but hasn't yet been recorded in the system (e.g., a previous shift forgot to input Item Masuk). It does not write to the real stock ledger. Display stock is always computed as `item.stock + sum(delta of all open pre-adjustments for that item/outlet)`.

Admins and Internal Auditors have a separate **Adjustment** dashboard with cross-outlet visibility, force-close capability, and automatic reconciliation tracking against subsequent Item Masuk entries.

---

## Terminology

| Audience | Label used in UI |
|---|---|
| Cashier, Manager | Pre Adjustment |
| Administrator, Internal Auditor | Adjustment |

Routes use `/pre-adjustment/` throughout regardless of role.

---

## Data Model

### `StockPreAdjustment`

```typescript
interface StockPreAdjustment {
    id: string
    outletId: string
    itemId: string
    delta: number                         // always a positive integer
    reason: "missing_item_masuk" | "physical_count_mismatch" | "transfer_input_error" | "system_error" | "other"
    note: string                          // required free text
    status: "open" | "reverted" | "force_closed"
    createdBy: string
    createdAt: string
    revertedBy: string | null
    revertedAt: string | null
    forceClosedBy: string | null          // admin/auditor only
    forceClosedAt: string | null
    forceCloseNote: string | null         // required when force-closing
    reconciledItemMasukId: string | null  // auto-set when matching Item Masuk detected
    reconciliationStatus: "pending" | "reconciled" | "unresolved"
}

interface CreatePreAdjustmentPayload {
    outletId: string
    itemId: string
    delta: number
    reason: StockPreAdjustment["reason"]
    note: string
}

interface ActiveTransferSummary {
    transferId: string
    qty: number
    toOutletName: string
}
```

`reconciliationStatus` defaults to `"pending"` on creation but is only surfaced in the UI after the entry is reverted or force-closed. While `status === "open"`, it is ignored. After revert/force-close it auto-flips to `"reconciled"` when a matching Item Masuk is detected, or to `"unresolved"` after 7 days with no match.

### Stock Display Rule

`item.stock` must never be read directly in any cashier-facing UI. All stock figures go through:

```typescript
getDisplayStock(itemId: string, outletId: string): number
// → item.stock + sum(delta) where status === "open" for that item/outlet
```

---

## Feature 1: Pre Adjustment Creation (All Roles)

### Entry Points

**From `/outlet/pre-adjustment/`:**
- "Buat Pre Adjustment" button opens `PreAdjustmentModal.svelte`

**From POS (`/outlet/retail/`):**
- When `getDisplayStock()` returns `0` for a search result, a "Pre Adjustment" button appears below the item row
- Clicking it opens `PreAdjustmentModal.svelte` with the item pre-filled

### `PreAdjustmentModal.svelte` — Form Fields

| Field | Type | Rules |
|---|---|---|
| Item | searchable select | pre-filled when opened from POS |
| Jumlah (delta) | number input | min 1, required |
| Alasan | dropdown | required — see reason options below |
| Catatan | textarea | required free text |

**Reason dropdown options:**
- `missing_item_masuk` → "Item Masuk Belum Diinput"
- `physical_count_mismatch` → "Selisih Stok Fisik"
- `transfer_input_error` → "Kesalahan Input Transfer"
- `system_error` → "Kesalahan Sistem"
- `other` → "Lainnya"

### Transfer Context Warning

On item selection, the modal calls `getActiveTransfersForItem(itemId, outletId)`. If any unaccepted transfers exist where `fromOutletId` matches the current outlet, a warning banner renders inside the modal:

> "Ada transfer aktif untuk item ini: **8 unit** ke **Outlet B** (belum diterima)"

One banner line per active transfer. This is informational only — it does not block submission.

### On Submit

`createPreAdjustment(payload, userId)` is called. The new record has `status: "open"`, `reconciliationStatus: "pending"` (not yet meaningful until reverted). Display stock updates immediately.

---

## Feature 2: Revert (All Roles — any open entry at their outlet)

Any authenticated user at the outlet can revert any open pre-adjustment at that outlet, regardless of who created it. This is intentional: if a cashier ends their shift without reverting, the next shift can revert it without waiting for an admin force-close. From the factory dashboard, admins use **Force Close** instead (same effect, with a required note for accountability).

From the **Aktif** tab of `/outlet/pre-adjustment/`, each open entry has a **Revert** button.

Clicking Revert shows a confirmation dialog:

> "Stok [Item Name] akan berkurang [delta] setelah Pre Adjustment ini dicabut. Lanjutkan?"

On confirm: `revertPreAdjustment(id, userId)` sets `status: "reverted"`, records `revertedBy` and `revertedAt`. `reconciliationStatus` remains `"pending"` — reconciliation tracking now begins. Display stock drops immediately — real stock is now exposed (potentially negative).

Reverted entries move to the **Riwayat** tab.

---

## Feature 3: Outlet Pre Adjustment Page (`/outlet/pre-adjustment/`)

### Aktif Tab

Table columns: Produk | Jumlah | Alasan | Catatan | Dibuat Oleh | Dibuat | Usia | Aksi

- Entries open > 24 hours show an amber warning badge on the Usia cell
- Aksi column: **Revert** button

### Riwayat Tab

Table columns: Produk | Jumlah | Alasan | Dibuat | Dicabut Oleh | Dicabut | Status Rekonsiliasi

- Status badges: `pending` (grey) · `reconciled` (green) · `unresolved` (red)
- Clicking a reconciled row shows the linked Item Masuk reference

---

## Feature 4: Admin/Auditor Adjustment Dashboard (`/factory/pre-adjustment/`)

Accessible to roles: `admin`, `internal_auditor`.

### Aktif Tab

All open pre-adjustments across all outlets.

Table columns: Outlet | Produk | Jumlah | Alasan | Catatan | Dibuat Oleh | Usia | Aksi

- Entries open > 24 hours highlighted (amber row tint)
- Aksi column: **Force Close** button

**Force Close action:**
- Modal requires a non-empty `forceCloseNote`
- `forceClosePreAdjustment(id, adminId, note)` sets `status: "force_closed"`, treated as reverted for reconciliation tracking

### Riwayat Tab

All reverted and force-closed entries across all outlets.

Table columns: Outlet | Produk | Jumlah | Alasan | Dibuat Oleh | Dicabut/Ditutup | Tipe Penutupan | Rekonsiliasi | Transfer Ref

- **Tipe Penutupan** badge: `Reverted` (blue) · `Force Closed` (orange)
- **Rekonsiliasi** badge: `Pending` (grey) · `Reconciled` (green, shows Item Masuk ref) · `Unresolved` (red)
- **Transfer Ref** badge: shown if `reason === "transfer_input_error"`, links to the transfer record

---

## Feature 5: Reconciliation (Automatic)

`checkReconciliation(itemMasukId)` is called automatically after any Item Masuk is successfully submitted.

Logic:
1. Find all `StockPreAdjustment` records where `outletId` matches, `itemId` matches, `status` is `"reverted"` or `"force_closed"`, and `reconciliationStatus === "pending"`
2. If the Item Masuk `qty` covers the stock gap (i.e., after applying the masuk, `item.stock >= 0`), mark all matching pending records as `reconciled` and set `reconciledItemMasukId`
3. Entries that remain `pending` after 7 days since `revertedAt` / `forceClosedAt` are flipped to `"unresolved"` on page load of either pre-adjustment page

---

## Retail & Order Integration

### `getDisplayStock()` — Universal Rule

Every component that shows a stock quantity to a cashier must call `getDisplayStock(itemId, outletId)` — never read `item.stock` directly.

### Retail Mode (`Retail.svelte`, `ProductSearchField.svelte`, `CartSection.svelte`)

- Search results display `getDisplayStock()`
- The "Pre Adjustment" quick-access button appears when `getDisplayStock() === 0`
- Cart qty validation checks against `getDisplayStock()` — exceeding it triggers an out-of-stock warning
- Free-product tracking and qty limits use display stock

### Order Mode (`Order.svelte`)

- Multi-outlet stock comparison table calls `getDisplayStock(itemId, outletId)` per outlet column
- If an outlet has an open pre-adjustment for the item, its stock cell shows a tinted badge indicating the figure includes a temporary adjustment

---

## Svelte Files

| Route | Files | Count |
|---|---|---|
| `/outlet/pre-adjustment/` | `+page.svelte`, `PreAdjustmentModal.svelte` | 2 |
| `/factory/pre-adjustment/` | `+page.svelte` | 1 |

`PreAdjustmentModal.svelte` is a shared component imported by both `/outlet/pre-adjustment/+page.svelte` and `Retail.svelte`.

---

## Mock Functions (`mock/pre-adjustments.ts`)

```typescript
// Stock display — replaces all direct item.stock reads in cashier UI
getDisplayStock(itemId: string, outletId: string): number

// Context for modal warning banner
getActiveTransfersForItem(itemId: string, outletId: string): ActiveTransferSummary[]

// Cashier
createPreAdjustment(payload: CreatePreAdjustmentPayload, userId: string): StockPreAdjustment
revertPreAdjustment(id: string, userId: string): void

// Admin/Auditor
forceClosePreAdjustment(id: string, adminId: string, note: string): void

// Queries
getActivePreAdjustments(outletId?: string): StockPreAdjustment[]   // no arg = all outlets
getAllPreAdjustments(outletId?: string): StockPreAdjustment[]

// Reconciliation — called after every ItemMasuk submission
checkReconciliation(itemMasukId: string): void
```

---

## Out of Scope

- Delta can only be positive (additions only) — negative pre-adjustments (temporary stock reduction) are not supported
- Pre-adjustments cannot be edited after creation — only reverted or force-closed
- No push notifications or alerts for stale entries — staleness is surfaced passively in the UI
- Receipt printing does not reference pre-adjustments
