# Kasir Harian — Design Spec

**Date:** 2026-05-27
**Feature:** `/outlet/kasir/` — Shift Cash Count & Day Close
**Status:** Approved

---

## Overview

Kasir Harian is a shift-level and day-level cash reconciliation feature. At the end of each shift, a cashier counts the physical cash in their drawer and compares it against what the system recorded (from Retail transactions, Pesanan DP and checkout payments, Kas Masuk, and Kas Keluar). Each cashier operates an independent drawer — they count only their own transactions. At the end of the day, any role can close the day by selecting a date, which accumulates all submitted shifts for that date into a single day record.

Both shift closes and day closes support PT (Perbaikan Transaksi) — all repairs require admin approval, no PTI.

---

## Terminology

| Term | Meaning |
|---|---|
| Shift Close | A cashier's end-of-shift cash count for one date |
| Day Close | Accumulation of all shifts for one date into a single day record |
| Tanggal Setor | The date the shift applies to — backdatable, separate from submission date |
| Selisih | Discrepancy between physical cash counted and system expected cash |
| Cash Breakdown | Per-source breakdown of cash transactions (Retail, Pesanan DP, Pesanan Checkout, Kas Masuk, Kas Keluar) |
| E-Payment | Non-cash payment methods (GoPay, OVO, BCA Transfer, etc.) — shown for crosscheck only, not counted |

---

## Data Model

### `CashBreakdownLine`

```typescript
interface CashBreakdownLine {
    amount: number
    count: number
}
```

### `EPaymentSummary`

```typescript
interface EPaymentSummary {
    method: string
    amount: number
    count: number
}
```

### `ShiftSnapshot`

```typescript
interface ShiftSnapshot {
    outletId: string
    cashierId: string
    tanggalSetor: string                    // YYYY-MM-DD — backdatable
    cashBreakdown: {
        retail:          CashBreakdownLine  // cash from Retail transactions
        pesananDP:       CashBreakdownLine  // cash DP payments from Pesanan
        pesananCheckout: CashBreakdownLine  // cash checkout payments from Pesanan
        kasMasuk:        CashBreakdownLine  // cash from Kas Masuk entries
        kasKeluar:       CashBreakdownLine  // cash from Kas Keluar entries (negative)
    }
    ePayments: EPaymentSummary[]            // non-cash methods, read-only crosscheck
    systemExpectedCash: number              // computed: retail + pesananDP + pesananCheckout + kasMasuk - kasKeluar
    physicalCashCounted: number             // manually entered by cashier
    selisih: number                         // physicalCashCounted - systemExpectedCash
    selisihNotes: string                    // required when selisih !== 0, empty string otherwise
    submittedAt: string                     // ISO timestamp
}
```

### `ShiftVersion`

```typescript
interface ShiftVersion {
    index: number
    type: 'original' | 'approved'
    snapshot: ShiftSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}
```

### `ShiftRepairRequest`

```typescript
interface ShiftRepairRequest {
    id: string
    shiftId: string
    status: 'pending' | 'rejected' | 'deleted'
    proposedSnapshot: ShiftSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}
```

### `ShiftClose`

```typescript
type ShiftStatus = 'submitted' | 'awaiting_pt'

interface ShiftClose {
    id: string                              // SHIFT-NNNNN
    outletId: string
    status: ShiftStatus
    currentVersionIndex: number
    versions: ShiftVersion[]
    pendingRequest: ShiftRepairRequest | null
    isDeleted: boolean
}
```

### `DayShiftSummary`

```typescript
interface DayShiftSummary {
    shiftId: string
    cashierId: string
    physicalCashCounted: number
    systemExpectedCash: number
    selisih: number
}
```

### `DaySnapshot`

```typescript
interface DaySnapshot {
    outletId: string
    tanggal: string                         // YYYY-MM-DD
    closedBy: string                        // userId from $auth
    closedAt: string                        // ISO timestamp
    shifts: DayShiftSummary[]               // snapshot of shifts included at close time
    totalPhysicalCash: number               // sum of shifts[].physicalCashCounted
    totalSystemExpected: number             // sum of shifts[].systemExpectedCash
    totalSelisih: number                    // sum of shifts[].selisih
}
```

### `DayVersion`

```typescript
interface DayVersion {
    index: number
    type: 'original' | 'approved'
    snapshot: DaySnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}
```

### `DayRepairRequest`

```typescript
interface DayRepairRequest {
    id: string
    dayId: string
    status: 'pending' | 'rejected' | 'deleted'
    proposedSnapshot: DaySnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}
```

### `DayClose`

```typescript
type DayStatus = 'open' | 'closed' | 'awaiting_pt'

interface DayClose {
    id: string                              // DAY-NNNNN
    outletId: string
    tanggal: string
    status: DayStatus
    currentVersionIndex: number
    versions: DayVersion[]
    pendingRequest: DayRepairRequest | null
    isDeleted: boolean
}
```

---

## Routes & Pages

| Route | File | Access |
|---|---|---|
| `/outlet/kasir/shift/` | `src/routes/outlet/kasir/shift/+page.svelte` | All roles |
| `/outlet/kasir/day/` | `src/routes/outlet/kasir/day/+page.svelte` | All roles |
| `/outlet/kasir/repair/` | `src/routes/outlet/kasir/repair/+page.svelte` | Admin only |

Non-admin accessing `/outlet/kasir/repair/` is redirected to `/outlet/kasir/shift/`.

---

## Shift Close Page — `/outlet/kasir/shift/`

### Toolbar

Date-from picker + date-to picker (filter on `tanggalSetor`) + search (cashier name/ID) + per-page select (10/25/50/100). Any change resets `currentPage` to 1.

### Table Columns

| Tgl Setor | Kasir | Cash Sistem | Cash Terhitung | Selisih | Status | Aksi |
|---|---|---|---|---|---|---|

Admin view adds an **Outlet** column before Tgl Setor.

Selisih displayed in green when 0, red when non-zero.

### Status Badges

| Status | Badge |
|---|---|
| `submitted` | — (no badge) |
| `awaiting_pt` | amber "⏳ Menunggu PT" |

### Action Buttons per Status

| Status | Actions |
|---|---|
| `submitted` | Lihat · PT · Delete (admin only) |
| `awaiting_pt` | Lihat · (locked — no other actions) |

### "+ Tutup Shift" Button

Opens the shift close form modal.

---

## Shift Close Form Modal

Pre-fills `tanggalSetor` to today. Calls `computeShiftTotals()` to load system-computed breakdown.

**Fields:**

- **Tanggal Setor** — date picker, defaults to today, backdatable
- **Cash Breakdown table** — read-only, system-computed:
  - Columns: Sumber · Transaksi · Jumlah Cash · (drill-down button)
  - Rows: Retail · Pesanan DP · Pesanan Checkout · Kas Masuk · Kas Keluar
  - Footer row: **Total Cash Sistem**
- **E-Payment table** — read-only, visually dimmed:
  - Columns: Metode · Transaksi · Jumlah
  - One row per method with any transactions on that date
- **Cash Terhitung** — number input, manually entered by cashier
- **Selisih** — computed live: `physicalCashCounted - systemExpectedCash`. Green + "Cocok ✓" when 0, red when non-zero.
- **Catatan Selisih** — textarea, disabled when selisih = 0, required (non-empty) when selisih ≠ 0. Submit button blocked until filled.

**Submit:** `submitShift(snapshot)` → modal closes, table refreshes.

### Drill-Down (content swap)

Clicking "🔍 Lihat" on any breakdown row replaces the modal content with a transaction list for that source and date:

- Header: breadcrumb "← Kembali ke Shift Form" · source name · count
- Table: ID Transaksi · Waktu · Member · Jumlah Cash · "Lihat →"
- Footer: Total Cash for that source
- "Lihat →" on a row navigates to that transaction's detail depending on source:
  - Retail rows → `/outlet/riwayat/` (Riwayat Transaksi)
  - Pesanan DP rows → `/outlet/pesanan/` (Pesanan active list)
  - Pesanan Checkout rows → `/outlet/riwayat/` (Riwayat Transaksi)
  - Kas Masuk / Kas Keluar rows → `/outlet/akuntansi/` (Akuntansi ledger)
- "← Kembali ke Shift Form" swaps content back to the form

The same content-swap pattern applies to E-Payment drill-down rows.

---

## Day Close Page — `/outlet/kasir/day/`

The page has two visually separated sections.

### Section 1 — Tutup Hari

- **Date picker** — "Pilih tanggal yang ingin ditutup" — selecting a date reloads the shifts panel
- **Shifts table** for the selected date:
  - Columns: Kasir · Cash Sistem · Cash Terhitung · Selisih · Disetor Pukul
  - Footer row: Akumulasi totals
- If the selected date already has a `DayClose` record: the shifts table is replaced by a green "✓ Hari ini sudah ditutup" banner showing who closed it and when, with Lihat and PT action buttons
- **"✓ Tutup Hari" button** — calls `closeDay(outletId, tanggal, closedBy)`. No confirmation dialog. Available to all roles.

### Section 2 — Riwayat Tutup Hari

Independent filter bar: date-from picker + date-to picker + per-page select (10/25/50/100).

**Table Columns:**

| Tanggal | Cash Sistem | Cash Terhitung | Selisih | Ditutup Oleh | Aksi |
|---|---|---|---|---|---|

Admin view adds an **Outlet** column before Tanggal.

**Actions:**

| Status | Actions |
|---|---|
| `closed` | Lihat · PT · Delete (admin only) |
| `awaiting_pt` | Lihat · (locked) |

Pagination per CLAUDE.md canonical block.

---

## Lihat (View) Modals

### ShiftClose Lihat Modal

Read-only. Shows:
- Tanggal Setor, Kasir, Disetor Pukul
- Cash Breakdown table (same as form, with drill-down)
- E-Payment crosscheck table (with drill-down)
- Cash Terhitung, Selisih, Catatan Selisih
- Version history strip: V1 → V2 → V3, each labeled `original` or `approved`

### DayClose Lihat Modal

Read-only. Shows:
- Tanggal, Ditutup Oleh, Ditutup Pukul
- Shifts summary table: Kasir · Cash Sistem · Cash Terhitung · Selisih
- Akumulasi footer
- Version history strip

---

## PT — Perbaikan Transaksi

No PTI. All repairs require admin approval.

**ShiftClose PT — editable fields:**
- `physicalCashCounted`
- `selisihNotes`
- `tanggalSetor`

The breakdown and system totals are read-only — they are computed facts. Admin will see the diff on these three fields only.

**DayClose PT — editable fields:**
- `tanggal`

The `shifts` summaries inside `DaySnapshot` are read-only — they were computed at close time and are not re-derived on PT.

**PT Flow (same for both):**
1. User clicks "PT" → full edit modal pre-filled with current snapshot
2. If previous PT was rejected: yellow banner with rejection reason + revision count
3. Submit → `submitRepairRequest()` → status `awaiting_pt`, row locked
4. After rejection: `reviseRepairRequest()` increments `revisions`

---

## Admin Repair Page — `/outlet/kasir/repair/`

Two tabs: **Shift** (default) · **Hari**

Each tab layout:
- Table of pending requests: Outlet · ID · Kasir/Tanggal · Diminta Oleh · Tgl Diminta · Revisi ke-N
- Clicking a row opens inline diff panel: current snapshot vs proposed, changed fields highlighted
- Actions: **Setujui** · **Tolak** (requires reason) · **Hapus Request** · **Hapus Record** (admin only)

---

## Mock Functions (`mock/kasir.ts`)

```typescript
// Queries — Shift
getShiftList(outletId?: string): ShiftClose[]           // excludes isDeleted
getShiftById(id: string): ShiftClose | undefined

// Queries — Day
getDayList(outletId?: string): DayClose[]               // excludes isDeleted
getDayByDate(outletId: string, tanggal: string): DayClose | undefined

// Computation — called when shift form opens
computeShiftTotals(outletId: string, cashierId: string, tanggal: string): ShiftSnapshot
// Reads from mock/riwayat.ts, mock/pesanan.ts, mock/kas.ts
// Returns a ShiftSnapshot with all system fields populated; physicalCashCounted = 0, selisihNotes = ''

// Creation
submitShift(snapshot: ShiftSnapshot): ShiftClose

// Day close
closeDay(outletId: string, tanggal: string, closedBy: string): DayClose
// Reads all ShiftClose records for outletId + tanggal, builds DaySnapshot, creates DayClose record
// Throws if a non-deleted DayClose already exists for this outletId + tanggal (UI prevents this via banner)

// PT — Shift
submitShiftRepairRequest(id: string, proposed: ShiftSnapshot, userId: string): void
reviseShiftRepairRequest(id: string, proposed: ShiftSnapshot, userId: string): void
approveShiftRepairRequest(id: string, adminId: string): void
rejectShiftRepairRequest(id: string, reason: string, adminId: string): void
deleteShiftRepairRequest(id: string, adminId: string): void

// PT — Day
submitDayRepairRequest(id: string, proposed: DaySnapshot, userId: string): void
reviseDayRepairRequest(id: string, proposed: DaySnapshot, userId: string): void
approveDayRepairRequest(id: string, adminId: string): void
rejectDayRepairRequest(id: string, reason: string, adminId: string): void
deleteDayRepairRequest(id: string, adminId: string): void

// Admin hard delete
deleteShift(id: string, adminId: string): void
deleteDay(id: string, adminId: string): void

// Admin PT queue
getPendingShiftRepairRequests(): ShiftRepairRequest[]
getPendingDayRepairRequests(): DayRepairRequest[]
getResolvedShiftRepairRequests(): ShiftRepairRequest[]  // approved + rejected only
getResolvedDayRepairRequests(): DayRepairRequest[]      // approved + rejected only
```

ID format: `SHIFT-` prefix, 5-digit zero-padded counter. `DAY-` prefix, 5-digit zero-padded counter.

---

## Mock Seed Data

### ShiftClose (5 records)

1. **SHIFT-00001** — Siti, 25 Mei, `submitted`, selisih = 0. Breakdown: 8 retail cash, 2 pesanan DP, 1 pesanan checkout.
2. **SHIFT-00002** — Rina, 25 Mei, `submitted`, selisih = 0. Breakdown: 5 retail cash, 1 kas masuk.
3. **SHIFT-00003** — Siti, 26 Mei, `awaiting_pt`. Pending PT request: proposed `physicalCashCounted` changed from Rp 950.000 to Rp 900.000.
4. **SHIFT-00004** — Siti, 27 Mei, `submitted`, selisih = −50.000 (physicalCashCounted undercounts by 50k). `selisihNotes` filled: "Kemungkinan salah hitung saat ramai".
5. **SHIFT-00005** — Rina, 27 Mei, `submitted`, selisih = 0.

### DayClose (2 records)

1. **DAY-00001** — 25 Mei, `closed`. Covers SHIFT-00001 + SHIFT-00002. totalSelisih = 0.
2. **DAY-00002** — 26 Mei, `awaiting_pt`. Covers SHIFT-00003. Pending PT request.

27 Mei remains open — allows testing the close flow.

---

## Integration

`computeShiftTotals` reads from three existing mocks:
- `mock/riwayat.ts` → `getRiwayatList(outletId)` — filters by `cashierId` and `completedAt` date, extracts cash payment amounts
- `mock/pesanan.ts` → `getPesananList(outletId)` — filters by `cashierId` and DP/checkout date, extracts cash payment amounts
- `mock/kas.ts` — filters by `createdBy` (cashierId) and `tanggal`, sums Kas Masuk and Kas Keluar cash entries

`closeDay` reads from `getShiftList(outletId)` filtered by `tanggalSetor === tanggal`.

No side effects on other mocks — Kasir Harian is read-only with respect to Riwayat, Pesanan, and Kas.

---

## Svelte Files

| File | Responsibility |
|---|---|
| `src/routes/outlet/kasir/shift/+page.svelte` | Shift list, toolbar, shift close form modal (with content-swap drill-down), Lihat modal, PT form modal |
| `src/routes/outlet/kasir/day/+page.svelte` | Day close section (date picker + shifts panel + Tutup Hari button), history section with independent filter, Lihat modal, PT form modal |
| `src/routes/outlet/kasir/repair/+page.svelte` | Admin PT queue: Shift / Hari tabs, inline diff panel |
| `src/library/types/Kasir.ts` | All TypeScript interfaces |
| `src/library/mock/kasir.ts` | In-memory store + all CRUD and query functions |

All modals inline in their respective `+page.svelte` files.

---

## Out of Scope

- Opening float / modal awal (shift starts from zero, not from previous shift's cash)
- Automatic shift detection based on login time
- Push notifications for pending PT
- Export to PDF or CSV
- Reconciliation against bank statements
