# Akuntansi — Kas Masuk & Kas Keluar Design Spec

**Date:** 2026-05-07
**Feature:** Akuntansi (Cash Ledger)
**Status:** Approved

---

## 1. Overview

Akuntansi is a cash ledger feature for recording non-standard cash movements — money that enters or leaves the business outside of regular POS transactions. Examples of **Kas Masuk** (cash in): customer compensation for damages. Examples of **Kas Keluar** (cash out): paying monthly electricity, buying gas for the store.

All records comply with standard cash book ledger structure: sorted by date, with a running **Saldo** (balance) computed from all entries.

Only **Perbaikan Transaksi (PT)** is supported — no Perbaikan Transaksi Instan (PTI). All roles (cashier, manager, admin) can create both Kas Masuk and Kas Keluar records.

---

## 2. Data Model

### `KasEntry`
Each line item inside a journal entry. A single record can have multiple entries ("Tambah Lagi").

```typescript
interface KasEntry {
    id: string
    amount: number
    paymentMethod: KasPaymentMethod   // constrained dropdown
    keterangan: string
    receiptFile: string | null         // filename only — mock layer stores string, no upload
}
```

### `KasSnapshot`
Full immutable snapshot of a record at a point in time. Stored per version.

```typescript
interface KasSnapshot {
    id: string
    type: "masuk" | "keluar"
    outletId: string
    createdBy: string                  // userId from $auth — who wrote the record
    tanggal: string                    // "YYYY-MM-DD" — user-supplied, backdatable
    entries: KasEntry[]
    totalAmount: number                // computed: sum(entries[].amount)
    pic: { employeeId: string; name: string }  // person accountable, chosen by creator
}
```

### `KasVersion`
```typescript
interface KasVersion {
    index: number                      // 1, 2, 3...
    type: "original" | "approved"      // no "instant" — PTI not supported
    snapshot: KasSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string                  // ISO timestamp
    requestId: string | null           // populated when type === "approved"
}
```

### `KasRepairRequest`
```typescript
interface KasRepairRequest {
    id: string
    kasId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: KasSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}
```

### `KasRecord`
Top-level versioned entity stored in the mock ledger.

```typescript
interface KasRecord {
    id: string
    currentVersionIndex: number
    versions: KasVersion[]
    pendingRequest: KasRepairRequest | null
    isDeleted: boolean
}
```

### Payment Methods (mock constant)
```typescript
export const KAS_PAYMENT_METHODS = [
    "Tunai", "GoPay", "OVO", "Dana",
    "BCA Transfer", "Mandiri Transfer", "BNI Transfer"
] as const
export type KasPaymentMethod = typeof KAS_PAYMENT_METHODS[number]
```

---

## 3. Routes

| Path | Purpose |
|---|---|
| `/outlet/akuntansi` | Main ledger page — list, create, version history, PT actions |
| `/outlet/akuntansi/repair` | Admin PT repair queue |

Both routes are protected by the existing `/outlet/+layout.svelte` auth guard.

---

## 4. Ledger View

The main page renders a standard cash book table sorted by `tanggal` (ascending), then `createdAt` as tiebreaker. Saldo is a running balance computed left-to-right over the sorted list:

```
Saldo[0] = 0
Saldo[i] = Saldo[i-1] + (type === "masuk" ? +totalAmount : -totalAmount)
```

**Table columns:**

| Tanggal | Ref ID | PIC | Kas Masuk (+) | Kas Keluar (−) | Saldo |
|---|---|---|---|---|---|

Each row is expandable (or has action buttons) for:
- View version history → opens `KasVersionTimeline`
- PT action → "Perbaikan" button if no pending request, "⏳ Menunggu" badge if pending, "Revisi" if rejected

**Filter bar** (above table):
- Date range — defaults from `useDefault` (first day to current day of month)
- Type toggle: All / Kas Masuk / Kas Keluar

**"+ Tambah" button** opens `KasForm` modal.

---

## 5. File Map

### Created
```
src/library/types/Kas.ts
src/library/mock/kasPaymentMethods.ts
src/library/mock/kas.ts
src/library/hooks/useKas.ts
src/library/stores/kas.ts
src/library/components/outlet/akuntansi/KasForm.svelte
src/library/components/outlet/akuntansi/KasLedgerTable.svelte
src/library/components/outlet/akuntansi/KasVersionTimeline.svelte
src/library/components/outlet/akuntansi/KasVersionDiff.svelte
src/library/components/outlet/akuntansi/KasRepairModal.svelte
src/library/components/outlet/akuntansi/AdminKasQueue.svelte
src/library/components/outlet/akuntansi/AdminKasDiffView.svelte
src/routes/outlet/akuntansi/+page.svelte
src/routes/outlet/akuntansi/repair/+page.svelte
```

### Reused (read-only)
```
src/library/mock/employees.ts          — PIC source
src/library/utils/repairDiff.ts        — getChangedFields() utility
src/library/stores/auth.ts             — $auth for createdBy + outletId
src/library/validator/useDefault.ts    — date range defaults
```

---

## 6. Component Responsibilities

### `KasForm.svelte`
Modal form for creating a new record.
- Top toggle: **Kas Masuk / Kas Keluar** (sets `type`)
- Date picker (`tanggal`) — defaults to today, editable for backdating
- PIC picker — searchable dropdown from `mockEmployees`
- Dynamic entries list: each row has amount (number), paymentMethod (dropdown from `KAS_PAYMENT_METHODS`), keterangan (text), receiptFile (text input — user types or pastes filename)
- **"+ Tambah Lagi"** appends a new empty entry row
- Entry rows can be removed (except when only one remains)
- **Total** displayed below entries: `sum(entries[].amount)` formatted as IDR
- **"Simpan"** calls `createKas()`, closes modal, refreshes ledger

### `KasLedgerTable.svelte`
Pure display component. Accepts sorted `KasRecord[]` and renders the running-balance table. Emits `openHistory(id)` and `openRepair(id)` events for parent page to handle.

### `KasVersionTimeline.svelte`
Same pattern as `ItemKeluarVersionTimeline`. Shows V1 (Original), V2+ (Approved), and a ⏳ pending indicator row if a PT request is open. Emits `selectVersion` for diff display.

### `KasVersionDiff.svelte`
Side-by-side diff of two `KasVersion` snapshots. Uses `getChangedFields()` from `repairDiff.ts`. Highlights changed fields: entries array (rendered as formatted list), totalAmount (IDR), tanggal, type, pic.

### `KasRepairModal.svelte`
PT request form. Pre-fills from:
- Current snapshot if no existing request
- `pendingRequest.proposedSnapshot` if status is `"rejected"` (revision flow)

Shows yellow rejection banner when revising. Has "Hapus Permintaan" delete button for pending/rejected requests. Submit button label: "Submit Request" or "Kirim Ulang" on revision.

### `AdminKasQueue.svelte`
Lists all non-deleted `KasRecord`s with `pendingRequest.status === "pending"`. Each row shows: Ref ID, type badge (Masuk/Keluar), PIC name, submitted date, revision count. Clicking a row selects it for `AdminKasDiffView`.

### `AdminKasDiffView.svelte`
Admin review panel. Shows current vs proposed snapshot diff. Action buttons:
- **Setujui** → `approveRepairRequest()`
- **Tolak** → shows reason input → `rejectRepairRequest()`
- **Hapus Permintaan** → `deleteRepairRequest()`
- **Hapus Record** → confirm step → `deleteRecord()`

---

## 7. `useKas.ts` Hook API

All functions operate on `mockKasRecords` (in-memory mock array). No side effects outside the mock layer.

```typescript
// Creation
createKas(payload: CreateKasPayload): KasRecord

// Pure utility
computeTotalAmount(entries: KasEntry[]): number

// User PT actions
submitRepairRequest(kasId: string, proposedSnapshot: KasSnapshot): void
reviseRepairRequest(kasId: string, proposedSnapshot: KasSnapshot): void
deleteRepairRequest(kasId: string): void

// Admin PT actions
approveRepairRequest(kasId: string): void
rejectRepairRequest(kasId: string, reason: string): void
deleteRecord(kasId: string): void
```

`createKas` builds the `KasSnapshot` from the payload, sets `totalAmount = computeTotalAmount(entries)`, wraps it in a V1 `"original"` `KasVersion`, pushes to `mockKasRecords`.

`approveRepairRequest` pushes a new `"approved"` version using `getChangedFields(currentSnapshot, proposedSnapshot)`, increments `currentVersionIndex`, clears `pendingRequest`.

`rejectRepairRequest` sets `pendingRequest.status = "rejected"` and stores the reason.

`deleteRecord` sets `isDeleted = true` and clears `pendingRequest`. No stock or balance side effects (ledger balance is computed on read, not stored).

---

## 8. Mock Data Seed (`mock/kas.ts`)

Three seed records:
1. **KAS-001** — Kas Masuk, 2 versions (original + approved PT), no pending request. Entry: Tunai 500.000, keterangan "Kompensasi kerusakan etalase"
2. **KAS-002** — Kas Keluar, 1 version, pending PT request. Entry: Tunai 250.000, keterangan "Bayar listrik bulan Mei"
3. **KAS-003** — Kas Keluar, 1 version, rejected PT request (revision scenario). Entry: GoPay 80.000, keterangan "Beli gas elpiji"

Seed running balance with KAS-001 then KAS-002/KAS-003 by date gives a verifiable starting Saldo.

---

## 9. PT Flow (No PTI)

Kas Masuk and Kas Keluar only support full **Perbaikan Transaksi**:

1. User clicks "Perbaikan" → `KasRepairModal` opens pre-filled with current snapshot
2. User edits any field → clicks "Submit Request" → `submitRepairRequest()` sets `pendingRequest`
3. Record row shows "⏳ Menunggu Admin" — PT button disabled while pending
4. Admin visits `/outlet/akuntansi/repair` → selects record → reviews diff → Setujui / Tolak
5. On **Setujui**: new `"approved"` version created, `pendingRequest` cleared
6. On **Tolak**: `pendingRequest.status = "rejected"`, reason stored; user sees "Revisi" button
7. On **Revisi**: `KasRepairModal` re-opens with rejected snapshot + yellow banner → "Kirim Ulang" → increments `revisions`, resets to `"pending"`

---

## 10. Constraints & Notes

- `tanggal` is user-supplied and backdatable — no validation against today's date
- `receiptFile` stores filename string only; no actual file I/O in the mock layer
- Ledger Saldo is computed on read (not stored) — no denormalized balance field
- `createdBy` is always auto-set from `$auth.userId` — not user-editable
- PIC is a separate chosen person — can be the same as `createdBy` or different
- Both Kas Masuk and Kas Keluar share the same PT repair queue at `/outlet/akuntansi/repair`
- `mockEmployees` from `src/library/mock/employees.ts` is reused for PIC selection — no new employee mock needed
