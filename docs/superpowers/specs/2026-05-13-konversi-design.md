# Konversi (Item Conversion) — Design Spec

**Date:** 2026-05-13
**Status:** Approved

---

## Overview

Konversi is a stock conversion feature that lets staff transform one set of items into another using pre-defined formulas. A classic use case is unpacking: 1 Slop Yakult → 5 Pcs Yakult. Formulas are bidirectional — the same formula supports both unpacking and rebundling. Only admins can create or edit formulas; all roles can execute them.

Every conversion is logged. Stock changes are immediate on confirmation.

---

## Terminology

| Concept | Label in UI |
|---|---|
| Conversion formula | **Formula** |
| The bundle/parent item | **Produk Utama** |
| The pieces/contents | **Komponen** |
| Unpack direction (Head → Parts) | **Buka** |
| Bundle direction (Parts → Head) | **Buat** |
| How many times to apply | **Jumlah Konversi** |

Every execution screen shows a plain-language preview before confirming — e.g.:

> **Buka** × 3 → Konsumsi: **Eid Hampers ×3** | Hasil: **Pocari ×3, Cookies ×9, Gift Card ×3**

---

## Data Model

```typescript
interface ConversionFormula {
    id: string
    name: string                    // e.g., "Eid Hampers", "Yakult Slop"
    headItemId: string              // the bundle / parent item
    headQty: number                 // usually 1
    components: ConversionComponent[]
    isActive: boolean               // admin can disable without deleting
    createdBy: string
    createdAt: string
    updatedBy: string | null
    updatedAt: string | null
}

interface ConversionComponent {
    itemId: string
    qty: number
}

interface ConversionLog {
    id: string
    formulaId: string
    formulaSnapshot: ConversionFormula   // locked at execution time
    direction: "buka" | "buat"           // "buka" = Head→Parts, "buat" = Parts→Head
    multiplier: number                   // how many times applied
    outletId: string
    executedBy: string
    executedAt: string
    note: string | null
    usedPreAdjustment: boolean           // true when item.stock === 0 and pre-adj covered it
}

interface CreateFormulaPayload {
    name: string
    headItemId: string
    headQty: number
    components: ConversionComponent[]
}

interface UpdateFormulaPayload extends Partial<CreateFormulaPayload> {}

interface ExecuteConversionPayload {
    formulaId: string
    direction: "buka" | "buat"
    multiplier: number
    outletId: string
    note: string | null
}

interface FormulaStockSummaryRow {
    itemId: string
    name: string
    role: "head" | "component"
    componentQty: number | null      // null for head
    realStock: number
    preAdjDelta: number
    displayStock: number             // realStock + preAdjDelta
}
```

**Formulas are never deleted — only deactivated** — to preserve log integrity. `formulaSnapshot` is stored at execution time so the log remains accurate even if the formula is later edited.

---

## Stock Effect on Execution

| Direction | Head item | Each component |
|---|---|---|
| `"buka"` (unpack) | `stock -= headQty × multiplier` | `stock += component.qty × multiplier` |
| `"buat"` (bundle) | `stock += headQty × multiplier` | `stock -= component.qty × multiplier` |

**Stock source:** All checks use `getDisplayStock(itemId, outletId)` — real stock + any open pre-adjustment deltas. If `item.stock === 0` but `getDisplayStock() > 0` for a source item, the execution modal shows an amber warning banner. The conversion still proceeds — the warning is informational only.

---

## Feature 1: Outlet Conversion Page (`/outlet/konversi/`)

Accessible to all roles.

### Konversi Tab

Displays all active formulas. Each formula row shows:

- Formula name + component count
- Stock breakdown table: **Item | Stok Fisik | Pre Adj | Bisa Dipakai**
  - "Utama" badge marks the head item row
  - `Bisa Dipakai` is green when fully from real stock; amber when pre-adjustment is involved
  - Rows with `preAdjDelta > 0` have a subtle amber background tint
- **Gunakan** button — opens `KonversiModal` with that formula pre-selected
- Rows where `displayStock === 0` for all source items in both directions: row is dimmed, button disabled, shows "Stok tidak mencukupi untuk konversi di arah mana pun."

Search bar filters formula name.

**"+ Konversi" button** — opens `KonversiModal` without a pre-selected formula. The modal shows a searchable formula select as its first step, then proceeds to direction and multiplier.

### Riwayat Tab

Table of all conversions executed at this outlet.

Columns: **Tanggal | Formula | Arah | Jumlah Konversi | Oleh | Catatan**

- Arah badge: `Buka` (indigo) · `Buat` (green)
- Standard search + per-page dropdown + pagination per CLAUDE.md convention

---

## Feature 2: KonversiModal (Execution Form)

Shared component used on both `/outlet/konversi/` and `/factory/konversi/`.

### Step 1 — Pilih Arah

Two direction buttons, each showing the actual items involved:

- **🔓 Buka** — "[Head] → [Component A ×N, Component B ×N, ...]"
- **📦 Buat** — "[Component A ×N, Component B ×N, ...] → [Head]"

When opened via a formula row's **Gunakan** button, the formula is pre-selected and both direction buttons are immediately visible.

### Step 2 — Jumlah & Konfirmasi

After selecting a direction:

| Field | Detail |
|---|---|
| Jumlah Konversi | Number input, min 1, default 1 |
| Preview | Live-updating: lists consumed items (red −) and produced items (green +), quantities scaled by multiplier |
| Pre-adjustment warning | Amber banner: "Stok fisik **[Item]** habis. Konversi ini akan menggunakan Pre Adjustment yang sedang aktif." — shown when `item.stock === 0` and pre-adj covers the source. Non-blocking. |
| Catatan | Optional free-text note |
| Konfirmasi Konversi | Submits `executeConversion(payload, userId)` |

---

## Feature 3: Admin Formula Management (`/factory/konversi/`)

Accessible to role: `admin`.

### Formula Tab

Table of all formulas (active and inactive).

Columns: **Formula | Produk Utama | Status | Aksi**

- Status badge: `Aktif` (green) · `Nonaktif` (grey)
- Aksi: **Gunakan** button (opens `KonversiModal`) · **Edit** button · **Nonaktifkan / Aktifkan** toggle
- **+ Buat Formula** button opens `FormulaModal` in create mode
- Nonaktif formula rows show Gunakan as disabled — admin cannot execute an inactive formula

Standard search + per-page dropdown + pagination per CLAUDE.md convention.

### Riwayat Konversi Tab

All conversions across all outlets.

Columns: **Tanggal | Outlet | Formula | Arah | Jumlah | Oleh | Catatan**

Standard search + per-page dropdown + pagination per CLAUDE.md convention.

---

## Feature 4: FormulaModal (Admin Create / Edit)

### Form Fields

| Field | Detail |
|---|---|
| Nama Formula | Text input, required — e.g., "Eid Hampers", "Yakult Slop" |
| Produk Utama | Searchable item select + qty input (default 1). Helper text: "Ini adalah produk bundel — yang dibuka saat Buka, yang dibuat saat Buat." |
| Komponen | Dynamic list of rows, each with searchable item select + qty. "+ Tambah Komponen" button adds a row. ✕ removes a row. Minimum 1 component. |
| Live Preview | Always visible: shows "🔓 Buka: [Head ×N] → [Parts...]" and "📦 Buat: [Parts...] → [Head ×N]" updating as admin types. |
| Status (edit mode only) | Aktif/Nonaktifkan toggle |

### Validation

- Formula name: required, non-empty
- Produk Utama: required, qty ≥ 1
- Components: at least 1 row, each qty ≥ 1, no duplicate items
- Head item must not appear in the component list

### On Save

- Create: `createConversionFormula(payload, adminId)` — formula is `isActive: true` by default
- Edit: `updateConversionFormula(id, payload, adminId)` — updates fields, bumps `updatedBy` / `updatedAt`
- Deactivate: `deactivateConversionFormula(id, adminId)` — sets `isActive: false`, formula hidden from outlet users

---

## Svelte Files

| Route | Files | Count |
|---|---|---|
| `/outlet/konversi/` | `+page.svelte`, `KonversiModal.svelte` | 2 |
| `/factory/konversi/` | `+page.svelte`, `FormulaModal.svelte` | 2 |

`KonversiModal.svelte` is imported by both `/outlet/konversi/+page.svelte` and `/factory/konversi/+page.svelte` (admins can also execute conversions from the factory dashboard).

---

## Mock Functions (`mock/konversi.ts`)

```typescript
// Queries
getConversionFormulas(outletId: string): ConversionFormula[]
// Active formulas only. Used on /outlet/konversi/ page.

getAllConversionFormulas(): ConversionFormula[]
// Active + inactive. Admin only — /factory/konversi/.

getFormulaStockSummary(formulaId: string, outletId: string): FormulaStockSummaryRow[]
// Powers the stock breakdown table on each formula row.
// Calls getDisplayStock() internally for each item.

getConversionLogs(outletId?: string): ConversionLog[]
// No arg = all outlets (admin). With outletId = that outlet's log only.

// Mutations
createConversionFormula(payload: CreateFormulaPayload, adminId: string): ConversionFormula
updateConversionFormula(id: string, payload: UpdateFormulaPayload, adminId: string): ConversionFormula
deactivateConversionFormula(id: string, adminId: string): void

executeConversion(payload: ExecuteConversionPayload, userId: string): ConversionLog
// Applies stock changes to all involved items and writes the log entry.
// Sets usedPreAdjustment: true if any source item had item.stock === 0.
```

`getDisplayStock(itemId, outletId)` from `mock/pre-adjustments.ts` is reused directly — no duplicate.

---

## Out of Scope

- Partial conversions (e.g., half a formula) — multiplier must be a whole number ≥ 1
- Many-to-many formulas where both sides have multiple items — all formulas have exactly one head item
- Formula versioning / history of formula edits
- Cost/pricing implications of conversion (no financial impact recorded)
- Push notifications when a formula becomes unavailable due to zero stock
