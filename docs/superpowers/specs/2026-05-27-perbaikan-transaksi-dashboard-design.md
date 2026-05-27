# Perbaikan Transaksi Dashboard — Design Spec

**Date:** 2026-05-27
**Project:** Studio Bersih - POS
**Status:** Approved

---

## Overview

A centralized dashboard for all PT (Perbaikan Transaksi) requests and PTI (Perbaikan Transaksi Instan) logs across every feature in the app. Replaces the per-feature admin repair queues (`/riwayat/repair/`, `/akuntansi/repair/`, `/kasir/repair/`) with a single page. Existing PT submission flows on each feature page are unchanged — only the admin review queue and history are consolidated here.

---

## Routes

| Path | File | Access |
|------|------|--------|
| `/outlet/perbaikan-transaksi/` | `src/routes/outlet/perbaikan-transaksi/+page.svelte` | All roles |
| `/outlet/perbaikan-transaksi/[id]/[source]/` | `src/routes/outlet/perbaikan-transaksi/[id]/[source]/+page.svelte` | All roles |

**Removed routes (replaced by this dashboard):**
- `/outlet/riwayat/repair/` → redirect to `/outlet/perbaikan-transaksi/`
- `/outlet/akuntansi/repair/` → redirect to `/outlet/perbaikan-transaksi/`
- `/outlet/kasir/repair/` → redirect to `/outlet/perbaikan-transaksi/`

Non-admin users are **not** redirected — they can access the dashboard and see their own entries only.

---

## Source Types

The `[source]` route parameter identifies where the repaired record lives:

| Source value | Feature | Record type |
|---|---|---|
| `riwayat` | Riwayat Transaksi | `RiwayatEntry` (retail or pesanan checkout) |
| `kas-masuk` | Akuntansi | `KasEntry` (type: masuk) |
| `kas-keluar` | Akuntansi | `KasEntry` (type: keluar) |
| `kasir-shift` | Kasir Harian | `ShiftClose` |
| `kasir-hari` | Kasir Harian | `DayClose` |

---

## Access Model

| Role | PT tab visibility | PTI tab visibility | Actions available |
|---|---|---|---|
| Admin | All entries, all outlets | All entries, all outlets | Setujui · Tolak · Hapus Request |
| Manager | Own submitted requests only | Own PTI entries only | Revisi · Hapus Request (own pending) |
| Cashier | Own submitted requests only | Own PTI entries only | Revisi · Hapus Request (own pending) |

---

## Main Dashboard — `/outlet/perbaikan-transaksi/`

### Tab Structure

Three tabs rendered at the top of the page:

1. **Menunggu** — pending PT requests awaiting admin action. Shows a count badge (e.g., `Menunggu (4)`) when there are pending entries. This is the default tab.
2. **Riwayat PT** — all resolved PT requests (approved, rejected, deleted).
3. **Log PTI** — append-only log of all instant edits. No actions, no detail page.

---

### Tab 1 — Menunggu

**Filters:**
- Source chip filter: Semua · Riwayat · Kas Masuk · Kas Keluar · Kasir Shift · Kasir Hari (single-select, default Semua)
- Search bar (filters ID and submitted-by name)
- Per-page dropdown (10 / 25 / 50 / 100)

**Table columns:**

| Column | Content |
|---|---|
| Sumber | Colored badge: Riwayat (indigo) · Kas Masuk (cyan) · Kas Keluar (cyan) · Kasir Shift (violet) · Kasir Hari (violet) |
| ID Transaksi | The record's ID string |
| Diajukan Oleh | User name of submitter |
| Waktu Diajukan | Formatted datetime |
| Revisi ke- | Revision number (1 = first submission, 2 = first resubmit after rejection, etc.) |
| Aksi | **Lihat** link → `/outlet/perbaikan-transaksi/[id]/[source]/` |

Rows are sorted by `submittedAt` descending (most recent first).

Non-admin users see only rows where `submittedBy === $auth.userId`.

---

### Tab 2 — Riwayat PT

**Filters:**
- Outcome chip filter: Semua · Disetujui · Ditolak · Dihapus (single-select, default Semua)
- Source chip filter: same as Tab 1
- Date range: Dari tanggal / Sampai tanggal inputs (defaults to current month via `useDefault`)
- Search bar
- Per-page dropdown

**Table columns:**

| Column | Content |
|---|---|
| Sumber | Colored badge (same scheme as Tab 1) |
| ID Transaksi | Record ID |
| Diajukan Oleh | Submitter name |
| Outcome | Badge: Disetujui (green) · Ditolak (red) · Dihapus (gray) |
| Diselesaikan Oleh | Admin name who took action |
| Waktu Selesai | Formatted datetime of resolution |
| Aksi | **Lihat** link → detail page (read-only) |

Non-admin users see only their own rows.

---

### Tab 3 — Log PTI

PTI (instant edits) are logged here. No approval flow exists for PTI — this tab is read-only audit history.

**PTI-capable sources** (based on 2026-05-03 PT spec): `riwayat` (version type `"instant"`). Other sources explicitly do not support PTI (Kas, Kasir Harian all specify `type: "original" | "approved"` only).

**Filters:**
- Source chip filter: Semua · Riwayat (expandable as future features add PTI)
- Date range inputs
- Search bar
- Per-page dropdown

**Table columns:**

| Column | Content |
|---|---|
| Sumber | Colored badge |
| ID Transaksi | Record ID |
| Diedit Oleh | User name |
| Waktu Edit | Formatted datetime |
| Fields yang Diubah | Comma-separated list of changed field names (from `changedFields[]` on the version) |

No Aksi column. No detail page for PTI — the log entry is self-contained.

Non-admin users see only their own PTI entries.

---

## Detail Page — `/outlet/perbaikan-transaksi/[id]/[source]/`

### Layout

Two-column layout:

**Left column — Diff view:**
- Metadata header: ID · Sumber badge · Diajukan Oleh · Waktu Diajukan · Revisi ke- · Status badge
- Diff table with columns: Field · Nilai Lama · Nilai Baru
- Rows where old ≠ new are highlighted (`bg-warning/10`)
- Unchanged rows shown in muted color for context

Field labels and row set are determined by `[source]`:
- `riwayat`: items, qty, pricing, payment methods, notes, orderMeta, memberId
- `kas-masuk` / `kas-keluar`: entries array, totalAmount, tanggal, type, pic
- `kasir-shift`: physicalCashCounted, selisihNotes, tanggalSetor
- `kasir-hari`: tanggal

**Right column — Action panel:**

Rendered based on `$auth.role` and `pendingRequest.status`.

**Admin — status `pending`:**
- Green **Setujui** button → calls `approveRepairRequest(id, source, $auth.userId)`
- **Tolak** button → expands a textarea for rejection reason (required, non-empty) → calls `rejectRepairRequest(id, source, reason, $auth.userId)`
- Ghost **Hapus Request** button → calls `deleteRepairRequest(id, source, $auth.userId)`

**Admin — status `approved` / `rejected` / `deleted`:**
- Read-only outcome banner showing: outcome label · who actioned it · timestamp
- If `approved`: link back to the source feature's list page (e.g., `/outlet/riwayat/` for a Riwayat approval)

**Non-admin — status `pending`:**
- Read-only amber banner: "Menunggu persetujuan admin"

**Non-admin — status `rejected`:**
- Red banner showing rejection reason + revision count
- **Revisi** button → navigates back to the source feature's edit form for that record (deep link)
- **Hapus Request** ghost button → calls `deleteRepairRequest(id, source, $auth.userId)` (user withdraws own request)

**Non-admin — status `approved` / `deleted`:**
- Read-only outcome banner

**Back navigation:** `← Kembali ke Perbaikan Transaksi` — always returns to `/outlet/perbaikan-transaksi/` (Tab 1 Menunggu by default).

---

## Mock Data Interface

A new `src/library/mock/perbaikan-transaksi.ts` aggregates repair data from all source mocks. It does not own any records — it reads from:

- `mock/riwayat.ts` — `getPendingRepairRequests()`, `getResolvedRepairRequests()`
- `mock/kas.ts` — `getPendingKasRepairRequests()`, `getResolvedKasRepairRequests()`
- `mock/kasir.ts` — `getPendingShiftRepairRequests()`, `getResolvedShiftRepairRequests()`, `getPendingDayRepairRequests()`, `getResolvedDayRepairRequests()`

Each source function is wrapped in a `try/catch` so the aggregator gracefully returns empty arrays when a source mock is not yet implemented.

Aggregated types add a `source` discriminant field:

```typescript
type SourceType = 'riwayat' | 'kas-masuk' | 'kas-keluar' | 'kasir-shift' | 'kasir-hari'

interface AggregatedPTRequest {
    source: SourceType
    id: string
    recordId: string
    status: 'pending' | 'rejected' | 'deleted' | 'approved'
    submittedBy: string
    submittedAt: string
    revisions: number
    resolvedBy: string | null
    resolvedAt: string | null
    rejectionReason: string | null
}

interface AggregatedPTILog {
    source: SourceType
    recordId: string
    editedBy: string
    editedAt: string
    changedFields: string[]
}
```

Approval, rejection, deletion, and deletion of own request are delegated back to the originating source mock — `perbaikan-transaksi.ts` dispatches the action to the correct mock based on `source`.

---

## Navigation

Add **Perbaikan Transaksi** nav link in `/outlet/+layout.svelte`. Visible to all roles. For non-admin, the link shows a count badge of their own pending requests.

---

## Out of Scope

- Push notifications when a PT request is submitted or resolved
- Bulk approve/reject actions
- Admin creating PT requests on behalf of a user
- PTI log detail page (the log row is self-contained)
