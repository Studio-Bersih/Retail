# Perbaikan Transaksi Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centralized `/outlet/perbaikan-transaksi/` dashboard that consolidates all PT request queues and PTI logs from Riwayat, Kas, and Kasir Harian into one page, replacing the per-feature `/repair/` routes.

**Architecture:** A thin aggregator mock (`mock/perbaikan-transaksi.ts`) reads from source mocks using lazy `require()` inside `try/catch` — if a source mock isn't built yet, it gracefully returns empty arrays. The main dashboard is a single 3-tab Svelte page; the detail page uses a `[id]/[source]` dynamic route and dispatches actions back to the originating source mock.

**Tech Stack:** SvelteKit 1.x, Svelte 4, TypeScript 5, TailwindCSS 3, DaisyUI, Vitest

> **Note:** The Kasir Harian plan (Task 5) includes a `src/routes/outlet/kasir/repair/+page.svelte`. When this dashboard plan is executed first, that route becomes a redirect stub — skip Kasir plan Task 5. If Kasir plan was executed first, replace its repair page with the redirect from Task 5 of this plan.

---

## File Structure

| File | Role |
|---|---|
| `src/library/types/PerbaikanTransaksi.ts` | `SourceType`, `AggregatedPTRequest`, `AggregatedPTILog`, `PTRequestDetail` |
| `src/library/mock/perbaikan-transaksi.ts` | Aggregator: reads all source mocks, dispatches actions |
| `src/library/mock/perbaikan-transaksi.test.ts` | Unit tests for aggregator |
| `src/routes/outlet/perbaikan-transaksi/+page.svelte` | 3-tab main dashboard |
| `src/routes/outlet/perbaikan-transaksi/[id]/[source]/+page.svelte` | Detail + action panel |
| `src/routes/outlet/riwayat/repair/+page.ts` | Redirect → `/outlet/perbaikan-transaksi/` |
| `src/routes/outlet/akuntansi/repair/+page.ts` | Redirect |
| `src/routes/outlet/kasir/repair/+page.ts` | Redirect |
| `src/routes/outlet/+layout.svelte` | Add PT nav link + badge |

---

## Source Mock Contracts

The aggregator assumes these functions exist in source mocks (all wrapped in `try/catch`):

**`mock/riwayat.ts`:** `getPendingRepairRequests()`, `getResolvedRepairRequests()`, `getRepairRequestById(id)`, `getRiwayatById(id)`, `getAllRiwayat()`, `approveRepairRequest(id, adminId)`, `rejectRepairRequest(id, reason, adminId)`, `deleteRepairRequest(id, userId)`

**`mock/kas.ts`:** `getPendingKasRepairRequests()`, `getResolvedKasRepairRequests()`, `getKasRepairRequestById(id)`, `getKasById(id)`, `approveKasRepairRequest(id, adminId)`, `rejectKasRepairRequest(id, reason, adminId)`, `deleteKasRepairRequest(id, userId)`

**`mock/kasir.ts`:** `getPendingShiftRepairRequests()`, `getResolvedShiftRepairRequests()`, `getShiftRepairRequestById(id)`, `getShiftById(id)`, `approveShiftRepairRequest(id, adminId)`, `rejectShiftRepairRequest(id, reason, adminId)`, `deleteShiftRepairRequest(id, userId)`, `getPendingDayRepairRequests()`, `getResolvedDayRepairRequests()`, `getDayRepairRequestById(id)`, `getDayById(id)`, `approveDayRepairRequest(id, adminId)`, `rejectDayRepairRequest(id, reason, adminId)`, `deleteDayRepairRequest(id, userId)`

---

## Task 1: Types

**Files:**
- Create: `src/library/types/PerbaikanTransaksi.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/PerbaikanTransaksi.ts

export type SourceType = 'riwayat' | 'kas-masuk' | 'kas-keluar' | 'kasir-shift' | 'kasir-hari'

export interface AggregatedPTRequest {
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
    outletId: string
}

export interface AggregatedPTILog {
    source: SourceType
    recordId: string
    editedBy: string
    editedAt: string
    changedFields: string[]
    outletId: string
}

export interface PTRequestDetail extends AggregatedPTRequest {
    currentSnapshot: unknown
    proposedSnapshot: unknown
}
```

- [ ] **Step 2: Commit**

```bash
git add src/library/types/PerbaikanTransaksi.ts
git commit -m "feat: add PerbaikanTransaksi aggregated types"
```

---

## Task 2: Aggregator Mock

**Files:**
- Create: `src/library/mock/perbaikan-transaksi.ts`
- Create: `src/library/mock/perbaikan-transaksi.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/library/mock/perbaikan-transaksi.test.ts

import { describe, it, expect, vi } from 'vitest'
import { getAllPendingRequests, getAllResolvedRequests, getAllPTILogs, getPendingCount } from './perbaikan-transaksi'

vi.mock('./riwayat', () => ({
    getPendingRepairRequests: () => [
        { id: 'REQ-001', riwayatId: 'TRX-001', status: 'pending', submittedBy: 'user-1', submittedAt: '2026-05-27T10:00:00Z', revisions: 0, rejectionReason: null }
    ],
    getResolvedRepairRequests: () => [
        { id: 'REQ-002', riwayatId: 'TRX-002', status: 'approved', resolvedAs: 'approved', submittedBy: 'user-2', submittedAt: '2026-05-26T10:00:00Z', revisions: 1, rejectionReason: null, resolvedBy: 'admin-1', resolvedAt: '2026-05-26T12:00:00Z' }
    ],
    getRiwayatById: (id: string) => ({ id, outletId: 'outlet-1' }),
    getRepairRequestById: (id: string) => ({ id, riwayatId: 'TRX-001', status: 'pending', submittedBy: 'user-1', submittedAt: '2026-05-27T10:00:00Z', revisions: 0, rejectionReason: null, proposedSnapshot: { notes: 'baru' } }),
    getAllRiwayat: () => [
        {
            id: 'TRX-003', outletId: 'outlet-1',
            currentVersionIndex: 1,
            versions: [
                { type: 'original', createdBy: 'user-1', createdAt: '2026-05-25T08:00:00Z', changedFields: [], snapshot: {} },
                { type: 'instant', createdBy: 'user-1', createdAt: '2026-05-25T09:00:00Z', changedFields: ['notes'], snapshot: {} }
            ]
        }
    ]
}))

vi.mock('./kas', () => ({
    getPendingKasRepairRequests: () => [],
    getResolvedKasRepairRequests: () => [],
    getKasById: () => null,
    getKasRepairRequestById: () => null
}))

vi.mock('./kasir', () => ({
    getPendingShiftRepairRequests: () => [],
    getResolvedShiftRepairRequests: () => [],
    getPendingDayRepairRequests: () => [],
    getResolvedDayRepairRequests: () => [],
    getShiftById: () => null,
    getDayById: () => null,
    getShiftRepairRequestById: () => null,
    getDayRepairRequestById: () => null
}))

describe('getAllPendingRequests', () => {
    it('returns riwayat pending request mapped to AggregatedPTRequest', () => {
        const result = getAllPendingRequests()
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            source: 'riwayat',
            id: 'REQ-001',
            recordId: 'TRX-001',
            status: 'pending',
            submittedBy: 'user-1',
            outletId: 'outlet-1',
            revisions: 0,
            resolvedBy: null
        })
    })
})

describe('getAllResolvedRequests', () => {
    it('returns riwayat resolved request with approved status', () => {
        const result = getAllResolvedRequests()
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            source: 'riwayat',
            id: 'REQ-002',
            status: 'approved',
            resolvedBy: 'admin-1'
        })
    })
})

describe('getAllPTILogs', () => {
    it('returns instant version entries from riwayat as PTI logs', () => {
        const result = getAllPTILogs()
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            source: 'riwayat',
            recordId: 'TRX-003',
            editedBy: 'user-1',
            changedFields: ['notes'],
            outletId: 'outlet-1'
        })
    })
})

describe('getPendingCount', () => {
    it('returns total pending count when no userId given', () => {
        expect(getPendingCount()).toBe(1)
    })
    it('returns user-scoped count when userId given', () => {
        expect(getPendingCount('user-1')).toBe(1)
        expect(getPendingCount('user-99')).toBe(0)
    })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/library/mock/perbaikan-transaksi.test.ts
```

Expected: FAIL — `Cannot find module './perbaikan-transaksi'`

- [ ] **Step 3: Implement the aggregator mock**

```typescript
// src/library/mock/perbaikan-transaksi.ts

import type { AggregatedPTRequest, AggregatedPTILog, SourceType, PTRequestDetail } from '../types/PerbaikanTransaksi'

// ── Riwayat ──────────────────────────────────────────────────────────────────

function tryRiwayatPending(): AggregatedPTRequest[] {
    try {
        const mod = require('./riwayat')
        return (mod.getPendingRepairRequests?.() ?? []).map((r: any) => ({
            source: 'riwayat' as SourceType,
            id: r.id,
            recordId: r.riwayatId,
            status: r.status,
            submittedBy: r.submittedBy,
            submittedAt: r.submittedAt,
            revisions: r.revisions ?? 0,
            resolvedBy: null,
            resolvedAt: null,
            rejectionReason: r.rejectionReason ?? null,
            outletId: mod.getRiwayatById?.(r.riwayatId)?.outletId ?? ''
        }))
    } catch { return [] }
}

function tryRiwayatResolved(): AggregatedPTRequest[] {
    try {
        const mod = require('./riwayat')
        return (mod.getResolvedRepairRequests?.() ?? []).map((r: any) => ({
            source: 'riwayat' as SourceType,
            id: r.id,
            recordId: r.riwayatId,
            status: (r.resolvedAs ?? r.status) as AggregatedPTRequest['status'],
            submittedBy: r.submittedBy,
            submittedAt: r.submittedAt,
            revisions: r.revisions ?? 0,
            resolvedBy: r.resolvedBy ?? null,
            resolvedAt: r.resolvedAt ?? null,
            rejectionReason: r.rejectionReason ?? null,
            outletId: mod.getRiwayatById?.(r.riwayatId)?.outletId ?? ''
        }))
    } catch { return [] }
}

// ── Kas ───────────────────────────────────────────────────────────────────────

function tryKasPending(): AggregatedPTRequest[] {
    try {
        const mod = require('./kas')
        return (mod.getPendingKasRepairRequests?.() ?? []).map((r: any) => {
            const record = mod.getKasById?.(r.kasId)
            const source: SourceType = record?.type === 'keluar' ? 'kas-keluar' : 'kas-masuk'
            return {
                source,
                id: r.id,
                recordId: r.kasId,
                status: r.status,
                submittedBy: r.submittedBy,
                submittedAt: r.submittedAt,
                revisions: r.revisions ?? 0,
                resolvedBy: null,
                resolvedAt: null,
                rejectionReason: r.rejectionReason ?? null,
                outletId: record?.outletId ?? ''
            }
        })
    } catch { return [] }
}

function tryKasResolved(): AggregatedPTRequest[] {
    try {
        const mod = require('./kas')
        return (mod.getResolvedKasRepairRequests?.() ?? []).map((r: any) => {
            const record = mod.getKasById?.(r.kasId)
            const source: SourceType = record?.type === 'keluar' ? 'kas-keluar' : 'kas-masuk'
            return {
                source,
                id: r.id,
                recordId: r.kasId,
                status: (r.resolvedAs ?? r.status) as AggregatedPTRequest['status'],
                submittedBy: r.submittedBy,
                submittedAt: r.submittedAt,
                revisions: r.revisions ?? 0,
                resolvedBy: r.resolvedBy ?? null,
                resolvedAt: r.resolvedAt ?? null,
                rejectionReason: r.rejectionReason ?? null,
                outletId: record?.outletId ?? ''
            }
        })
    } catch { return [] }
}

// ── Kasir Shift ───────────────────────────────────────────────────────────────

function tryKasirShiftPending(): AggregatedPTRequest[] {
    try {
        const mod = require('./kasir')
        return (mod.getPendingShiftRepairRequests?.() ?? []).map((r: any) => ({
            source: 'kasir-shift' as SourceType,
            id: r.id,
            recordId: r.shiftId,
            status: r.status,
            submittedBy: r.submittedBy,
            submittedAt: r.submittedAt,
            revisions: r.revisions ?? 0,
            resolvedBy: null,
            resolvedAt: null,
            rejectionReason: r.rejectionReason ?? null,
            outletId: mod.getShiftById?.(r.shiftId)?.outletId ?? ''
        }))
    } catch { return [] }
}

function tryKasirShiftResolved(): AggregatedPTRequest[] {
    try {
        const mod = require('./kasir')
        return (mod.getResolvedShiftRepairRequests?.() ?? []).map((r: any) => ({
            source: 'kasir-shift' as SourceType,
            id: r.id,
            recordId: r.shiftId,
            status: (r.resolvedAs ?? r.status) as AggregatedPTRequest['status'],
            submittedBy: r.submittedBy,
            submittedAt: r.submittedAt,
            revisions: r.revisions ?? 0,
            resolvedBy: r.resolvedBy ?? null,
            resolvedAt: r.resolvedAt ?? null,
            rejectionReason: r.rejectionReason ?? null,
            outletId: mod.getShiftById?.(r.shiftId)?.outletId ?? ''
        }))
    } catch { return [] }
}

// ── Kasir Hari ────────────────────────────────────────────────────────────────

function tryKasirHariPending(): AggregatedPTRequest[] {
    try {
        const mod = require('./kasir')
        return (mod.getPendingDayRepairRequests?.() ?? []).map((r: any) => ({
            source: 'kasir-hari' as SourceType,
            id: r.id,
            recordId: r.dayId,
            status: r.status,
            submittedBy: r.submittedBy,
            submittedAt: r.submittedAt,
            revisions: r.revisions ?? 0,
            resolvedBy: null,
            resolvedAt: null,
            rejectionReason: r.rejectionReason ?? null,
            outletId: mod.getDayById?.(r.dayId)?.outletId ?? ''
        }))
    } catch { return [] }
}

function tryKasirHariResolved(): AggregatedPTRequest[] {
    try {
        const mod = require('./kasir')
        return (mod.getResolvedDayRepairRequests?.() ?? []).map((r: any) => ({
            source: 'kasir-hari' as SourceType,
            id: r.id,
            recordId: r.dayId,
            status: (r.resolvedAs ?? r.status) as AggregatedPTRequest['status'],
            submittedBy: r.submittedBy,
            submittedAt: r.submittedAt,
            revisions: r.revisions ?? 0,
            resolvedBy: r.resolvedBy ?? null,
            resolvedAt: r.resolvedAt ?? null,
            rejectionReason: r.rejectionReason ?? null,
            outletId: mod.getDayById?.(r.dayId)?.outletId ?? ''
        }))
    } catch { return [] }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getAllPendingRequests(): AggregatedPTRequest[] {
    return [
        ...tryRiwayatPending(),
        ...tryKasPending(),
        ...tryKasirShiftPending(),
        ...tryKasirHariPending()
    ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}

export function getAllResolvedRequests(): AggregatedPTRequest[] {
    return [
        ...tryRiwayatResolved(),
        ...tryKasResolved(),
        ...tryKasirShiftResolved(),
        ...tryKasirHariResolved()
    ].sort((a, b) => (b.resolvedAt ?? b.submittedAt).localeCompare(a.resolvedAt ?? a.submittedAt))
}

export function getAllPTILogs(): AggregatedPTILog[] {
    try {
        const mod = require('./riwayat')
        const all: any[] = mod.getAllRiwayat?.() ?? []
        const logs: AggregatedPTILog[] = []
        for (const entry of all) {
            for (const v of entry.versions ?? []) {
                if (v.type === 'instant') {
                    logs.push({
                        source: 'riwayat',
                        recordId: entry.id,
                        editedBy: v.createdBy,
                        editedAt: v.createdAt,
                        changedFields: v.changedFields ?? [],
                        outletId: entry.outletId ?? ''
                    })
                }
            }
        }
        return logs.sort((a, b) => b.editedAt.localeCompare(a.editedAt))
    } catch { return [] }
}

export function getPendingCount(userId?: string): number {
    const all = getAllPendingRequests()
    return userId ? all.filter(r => r.submittedBy === userId).length : all.length
}

export function getRequestDetail(id: string, source: SourceType): PTRequestDetail | null {
    try {
        if (source === 'riwayat') {
            const mod = require('./riwayat')
            const req: any = mod.getRepairRequestById?.(id)
            if (!req) return null
            const record: any = mod.getRiwayatById?.(req.riwayatId)
            return {
                source, id: req.id, recordId: req.riwayatId, status: req.status,
                submittedBy: req.submittedBy, submittedAt: req.submittedAt,
                revisions: req.revisions ?? 0, resolvedBy: req.resolvedBy ?? null,
                resolvedAt: req.resolvedAt ?? null, rejectionReason: req.rejectionReason ?? null,
                outletId: record?.outletId ?? '',
                currentSnapshot: record?.versions?.[record?.currentVersionIndex ?? 0]?.snapshot ?? null,
                proposedSnapshot: req.proposedSnapshot ?? null
            }
        }
        if (source === 'kas-masuk' || source === 'kas-keluar') {
            const mod = require('./kas')
            const req: any = mod.getKasRepairRequestById?.(id)
            if (!req) return null
            const record: any = mod.getKasById?.(req.kasId)
            return {
                source, id: req.id, recordId: req.kasId, status: req.status,
                submittedBy: req.submittedBy, submittedAt: req.submittedAt,
                revisions: req.revisions ?? 0, resolvedBy: req.resolvedBy ?? null,
                resolvedAt: req.resolvedAt ?? null, rejectionReason: req.rejectionReason ?? null,
                outletId: record?.outletId ?? '',
                currentSnapshot: record?.versions?.[record?.currentVersionIndex ?? 0]?.snapshot ?? null,
                proposedSnapshot: req.proposedSnapshot ?? null
            }
        }
        if (source === 'kasir-shift') {
            const mod = require('./kasir')
            const req: any = mod.getShiftRepairRequestById?.(id)
            if (!req) return null
            const record: any = mod.getShiftById?.(req.shiftId)
            return {
                source, id: req.id, recordId: req.shiftId, status: req.status,
                submittedBy: req.submittedBy, submittedAt: req.submittedAt,
                revisions: req.revisions ?? 0, resolvedBy: req.resolvedBy ?? null,
                resolvedAt: req.resolvedAt ?? null, rejectionReason: req.rejectionReason ?? null,
                outletId: record?.outletId ?? '',
                currentSnapshot: record?.versions?.[record?.currentVersionIndex ?? 0]?.snapshot ?? null,
                proposedSnapshot: req.proposedSnapshot ?? null
            }
        }
        if (source === 'kasir-hari') {
            const mod = require('./kasir')
            const req: any = mod.getDayRepairRequestById?.(id)
            if (!req) return null
            const record: any = mod.getDayById?.(req.dayId)
            return {
                source, id: req.id, recordId: req.dayId, status: req.status,
                submittedBy: req.submittedBy, submittedAt: req.submittedAt,
                revisions: req.revisions ?? 0, resolvedBy: req.resolvedBy ?? null,
                resolvedAt: req.resolvedAt ?? null, rejectionReason: req.rejectionReason ?? null,
                outletId: record?.outletId ?? '',
                currentSnapshot: record?.versions?.[record?.currentVersionIndex ?? 0]?.snapshot ?? null,
                proposedSnapshot: req.proposedSnapshot ?? null
            }
        }
        return null
    } catch { return null }
}

export function approveRepairRequest(id: string, source: SourceType, adminId: string): void {
    try {
        if (source === 'riwayat') require('./riwayat').approveRepairRequest?.(id, adminId)
        else if (source === 'kas-masuk' || source === 'kas-keluar') require('./kas').approveKasRepairRequest?.(id, adminId)
        else if (source === 'kasir-shift') require('./kasir').approveShiftRepairRequest?.(id, adminId)
        else if (source === 'kasir-hari') require('./kasir').approveDayRepairRequest?.(id, adminId)
    } catch { /* source mock not implemented */ }
}

export function rejectRepairRequest(id: string, source: SourceType, reason: string, adminId: string): void {
    try {
        if (source === 'riwayat') require('./riwayat').rejectRepairRequest?.(id, reason, adminId)
        else if (source === 'kas-masuk' || source === 'kas-keluar') require('./kas').rejectKasRepairRequest?.(id, reason, adminId)
        else if (source === 'kasir-shift') require('./kasir').rejectShiftRepairRequest?.(id, reason, adminId)
        else if (source === 'kasir-hari') require('./kasir').rejectDayRepairRequest?.(id, reason, adminId)
    } catch { /* source mock not implemented */ }
}

export function deleteRepairRequest(id: string, source: SourceType, userId: string): void {
    try {
        if (source === 'riwayat') require('./riwayat').deleteRepairRequest?.(id, userId)
        else if (source === 'kas-masuk' || source === 'kas-keluar') require('./kas').deleteKasRepairRequest?.(id, userId)
        else if (source === 'kasir-shift') require('./kasir').deleteShiftRepairRequest?.(id, userId)
        else if (source === 'kasir-hari') require('./kasir').deleteDayRepairRequest?.(id, userId)
    } catch { /* source mock not implemented */ }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/library/mock/perbaikan-transaksi.test.ts
```

Expected: PASS (4 suites, 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/perbaikan-transaksi.ts src/library/mock/perbaikan-transaksi.test.ts
git commit -m "feat: add perbaikan-transaksi aggregator mock"
```

---

## Task 3: Main Dashboard Page

**Files:**
- Create: `src/routes/outlet/perbaikan-transaksi/+page.svelte`

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/outlet/perbaikan-transaksi/+page.svelte -->
<script lang="ts">
    import { auth } from '../../../library/stores/auth'
    import { goto } from '$app/navigation'
    import { formatDate } from '../../../library/utils/formatter'
    import { useDefault } from '../../../library/validator/useDefault'
    import {
        getAllPendingRequests,
        getAllResolvedRequests,
        getAllPTILogs
    } from '../../../library/mock/perbaikan-transaksi'
    import type { AggregatedPTRequest, AggregatedPTILog, SourceType } from '../../../library/types/PerbaikanTransaksi'

    type Tab = 'menunggu' | 'riwayat' | 'pti'
    let activeTab: Tab = 'menunggu'

    const isAdmin = $auth.role === 'admin'
    const defaults = useDefault()

    // Shared source filter options
    const SOURCES: Array<{ value: SourceType | 'semua'; label: string }> = [
        { value: 'semua', label: 'Semua' },
        { value: 'riwayat', label: 'Riwayat' },
        { value: 'kas-masuk', label: 'Kas Masuk' },
        { value: 'kas-keluar', label: 'Kas Keluar' },
        { value: 'kasir-shift', label: 'Kasir Shift' },
        { value: 'kasir-hari', label: 'Kasir Hari' }
    ]

    const SOURCE_LABEL: Record<SourceType, string> = {
        'riwayat': 'Riwayat', 'kas-masuk': 'Kas Masuk', 'kas-keluar': 'Kas Keluar',
        'kasir-shift': 'Kasir Shift', 'kasir-hari': 'Kasir Hari'
    }

    const SOURCE_BADGE: Record<SourceType, string> = {
        'riwayat': 'badge-primary', 'kas-masuk': 'badge-info', 'kas-keluar': 'badge-info',
        'kasir-shift': 'badge-secondary', 'kasir-hari': 'badge-secondary'
    }

    function matchesScope(r: AggregatedPTRequest | AggregatedPTILog): boolean {
        if (isAdmin) return true
        return 'submittedBy' in r ? r.submittedBy === $auth.userId : r.editedBy === $auth.userId
    }

    // ── Tab 1 — Menunggu ─────────────────────────────────────────────────────
    let searchM = ''
    let sourceM: SourceType | 'semua' = 'semua'
    let perPageM: 10 | 25 | 50 | 100 = 25
    let currentPageM = 1

    $: allPending = getAllPendingRequests()
    $: filteredM = allPending
        .filter(r => matchesScope(r))
        .filter(r => sourceM === 'semua' || r.source === sourceM)
        .filter(r => !searchM || r.id.toLowerCase().includes(searchM.toLowerCase()) || r.submittedBy.toLowerCase().includes(searchM.toLowerCase()))
    $: totalPagesM = Math.max(1, Math.ceil(filteredM.length / perPageM))
    $: paginatedM = filteredM.slice((currentPageM - 1) * perPageM, currentPageM * perPageM)
    $: pageButtonsM = makePageButtons(currentPageM, totalPagesM)
    $: if (searchM !== undefined || perPageM || sourceM) currentPageM = 1

    // ── Tab 2 — Riwayat PT ───────────────────────────────────────────────────
    let searchR = ''
    let sourceR: SourceType | 'semua' = 'semua'
    let outcomeR: 'semua' | 'approved' | 'rejected' | 'deleted' = 'semua'
    let dateFromR = defaults.firstDay
    let dateToR = defaults.lastDay
    let perPageR: 10 | 25 | 50 | 100 = 25
    let currentPageR = 1

    $: allResolved = getAllResolvedRequests()
    $: filteredR = allResolved
        .filter(r => matchesScope(r))
        .filter(r => sourceR === 'semua' || r.source === sourceR)
        .filter(r => outcomeR === 'semua' || r.status === outcomeR)
        .filter(r => !dateFromR || r.submittedAt >= dateFromR)
        .filter(r => !dateToR || r.submittedAt <= dateToR + 'T23:59:59Z')
        .filter(r => !searchR || r.id.toLowerCase().includes(searchR.toLowerCase()) || r.submittedBy.toLowerCase().includes(searchR.toLowerCase()))
    $: totalPagesR = Math.max(1, Math.ceil(filteredR.length / perPageR))
    $: paginatedR = filteredR.slice((currentPageR - 1) * perPageR, currentPageR * perPageR)
    $: pageButtonsR = makePageButtons(currentPageR, totalPagesR)
    $: if (searchR !== undefined || perPageR || sourceR || outcomeR || dateFromR || dateToR) currentPageR = 1

    // ── Tab 3 — Log PTI ──────────────────────────────────────────────────────
    let searchP = ''
    let sourcePTI: SourceType | 'semua' = 'semua'
    let dateFromP = defaults.firstDay
    let dateToP = defaults.lastDay
    let perPageP: 10 | 25 | 50 | 100 = 25
    let currentPageP = 1

    $: allPTI = getAllPTILogs()
    $: filteredP = allPTI
        .filter(r => matchesScope(r))
        .filter(r => sourcePTI === 'semua' || r.source === sourcePTI)
        .filter(r => !dateFromP || r.editedAt >= dateFromP)
        .filter(r => !dateToP || r.editedAt <= dateToP + 'T23:59:59Z')
        .filter(r => !searchP || r.recordId.toLowerCase().includes(searchP.toLowerCase()) || r.editedBy.toLowerCase().includes(searchP.toLowerCase()))
    $: totalPagesP = Math.max(1, Math.ceil(filteredP.length / perPageP))
    $: paginatedP = filteredP.slice((currentPageP - 1) * perPageP, currentPageP * perPageP)
    $: pageButtonsP = makePageButtons(currentPageP, totalPagesP)
    $: if (searchP !== undefined || perPageP || sourcePTI || dateFromP || dateToP) currentPageP = 1

    function makePageButtons(current: number, total: number): number[] {
        let start = Math.max(1, current - 2)
        let end = Math.min(total, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    }

    const OUTCOME_LABEL: Record<string, string> = {
        approved: 'Disetujui', rejected: 'Ditolak', deleted: 'Dihapus', pending: 'Menunggu'
    }

    const OUTCOME_BADGE: Record<string, string> = {
        approved: 'badge-success', rejected: 'badge-error', deleted: 'badge-ghost', pending: 'badge-warning'
    }
</script>

<div class="p-6">
    <h1 class="text-2xl font-bold mb-6">Perbaikan Transaksi</h1>

    <!-- Tabs -->
    <div class="tabs tabs-boxed mb-6">
        <button class="tab {activeTab === 'menunggu' ? 'tab-active' : ''}" on:click={() => activeTab = 'menunggu'}>
            Menunggu {#if filteredM.length > 0}<span class="badge badge-warning badge-sm ml-1">{filteredM.length}</span>{/if}
        </button>
        <button class="tab {activeTab === 'riwayat' ? 'tab-active' : ''}" on:click={() => activeTab = 'riwayat'}>Riwayat PT</button>
        <button class="tab {activeTab === 'pti' ? 'tab-active' : ''}" on:click={() => activeTab = 'pti'}>Log PTI</button>
    </div>

    <!-- ── Tab 1: Menunggu ─────────────────────────────────────────── -->
    {#if activeTab === 'menunggu'}
        <!-- Source chips -->
        <div class="flex flex-wrap gap-2 mb-4">
            {#each SOURCES as s}
                <button class="btn btn-xs {sourceM === s.value ? 'btn-primary' : 'btn-ghost'}" on:click={() => sourceM = s.value}>{s.label}</button>
            {/each}
        </div>

        <div class="flex items-center justify-between gap-4 mb-4">
            <input type="text" class="input input-bordered input-sm w-72" placeholder="Cari ID atau nama..." bind:value={searchM} />
            <select class="select select-bordered select-sm" bind:value={perPageM}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>

        <div class="overflow-x-auto">
            <table class="table table-sm w-full">
                <thead>
                    <tr><th>Sumber</th><th>ID</th><th>Diajukan Oleh</th><th>Waktu</th><th>Revisi ke-</th><th>Aksi</th></tr>
                </thead>
                <tbody>
                    {#each paginatedM as r}
                        <tr>
                            <td><span class="badge badge-sm {SOURCE_BADGE[r.source]}">{SOURCE_LABEL[r.source]}</span></td>
                            <td class="font-mono text-xs">{r.id}</td>
                            <td>{r.submittedBy}</td>
                            <td>{formatDate(r.submittedAt)}</td>
                            <td>{r.revisions + 1}</td>
                            <td>
                                <button class="btn btn-xs btn-ghost text-info" on:click={() => goto(`/outlet/perbaikan-transaksi/${r.id}/${r.source}`)}>Lihat</button>
                            </td>
                        </tr>
                    {:else}
                        <tr><td colspan="6" class="text-center text-base-content/50 py-8">Tidak ada request yang menunggu</td></tr>
                    {/each}
                </tbody>
            </table>
        </div>

        {#if totalPagesM > 1}
            <div class="flex justify-center items-center gap-1 mt-4">
                <button class="btn btn-sm btn-ghost" disabled={currentPageM === 1} on:click={() => currentPageM--}>‹</button>
                {#each pageButtonsM as p}
                    <button class="btn btn-sm {p === currentPageM ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPageM = p}>{p}</button>
                {/each}
                <button class="btn btn-sm btn-ghost" disabled={currentPageM === totalPagesM} on:click={() => currentPageM++}>›</button>
            </div>
        {/if}
    {/if}

    <!-- ── Tab 2: Riwayat PT ───────────────────────────────────────── -->
    {#if activeTab === 'riwayat'}
        <!-- Outcome chips -->
        <div class="flex flex-wrap gap-2 mb-2">
            {#each ['semua','approved','rejected','deleted'] as o}
                <button class="btn btn-xs {outcomeR === o ? 'btn-primary' : 'btn-ghost'}" on:click={() => outcomeR = o as typeof outcomeR}>
                    {o === 'semua' ? 'Semua' : OUTCOME_LABEL[o]}
                </button>
            {/each}
        </div>
        <!-- Source chips -->
        <div class="flex flex-wrap gap-2 mb-4">
            {#each SOURCES as s}
                <button class="btn btn-xs {sourceR === s.value ? 'btn-primary' : 'btn-ghost'}" on:click={() => sourceR = s.value}>{s.label}</button>
            {/each}
        </div>

        <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div class="flex gap-2">
                <input type="date" class="input input-bordered input-sm" bind:value={dateFromR} />
                <input type="date" class="input input-bordered input-sm" bind:value={dateToR} />
                <input type="text" class="input input-bordered input-sm w-48" placeholder="Cari..." bind:value={searchR} />
            </div>
            <select class="select select-bordered select-sm" bind:value={perPageR}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>

        <div class="overflow-x-auto">
            <table class="table table-sm w-full">
                <thead>
                    <tr><th>Sumber</th><th>ID</th><th>Diajukan Oleh</th><th>Outcome</th><th>Diselesaikan Oleh</th><th>Waktu</th><th>Aksi</th></tr>
                </thead>
                <tbody>
                    {#each paginatedR as r}
                        <tr>
                            <td><span class="badge badge-sm {SOURCE_BADGE[r.source]}">{SOURCE_LABEL[r.source]}</span></td>
                            <td class="font-mono text-xs">{r.id}</td>
                            <td>{r.submittedBy}</td>
                            <td><span class="badge badge-sm {OUTCOME_BADGE[r.status]}">{OUTCOME_LABEL[r.status]}</span></td>
                            <td>{r.resolvedBy ?? '-'}</td>
                            <td>{r.resolvedAt ? formatDate(r.resolvedAt) : '-'}</td>
                            <td>
                                <button class="btn btn-xs btn-ghost text-info" on:click={() => goto(`/outlet/perbaikan-transaksi/${r.id}/${r.source}`)}>Lihat</button>
                            </td>
                        </tr>
                    {:else}
                        <tr><td colspan="7" class="text-center text-base-content/50 py-8">Tidak ada riwayat</td></tr>
                    {/each}
                </tbody>
            </table>
        </div>

        {#if totalPagesR > 1}
            <div class="flex justify-center items-center gap-1 mt-4">
                <button class="btn btn-sm btn-ghost" disabled={currentPageR === 1} on:click={() => currentPageR--}>‹</button>
                {#each pageButtonsR as p}
                    <button class="btn btn-sm {p === currentPageR ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPageR = p}>{p}</button>
                {/each}
                <button class="btn btn-sm btn-ghost" disabled={currentPageR === totalPagesR} on:click={() => currentPageR++}>›</button>
            </div>
        {/if}
    {/if}

    <!-- ── Tab 3: Log PTI ──────────────────────────────────────────── -->
    {#if activeTab === 'pti'}
        <div class="flex flex-wrap gap-2 mb-4">
            {#each [{ value: 'semua', label: 'Semua' }, { value: 'riwayat', label: 'Riwayat' }] as s}
                <button class="btn btn-xs {sourcePTI === s.value ? 'btn-primary' : 'btn-ghost'}" on:click={() => sourcePTI = s.value as typeof sourcePTI}>{s.label}</button>
            {/each}
        </div>

        <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div class="flex gap-2">
                <input type="date" class="input input-bordered input-sm" bind:value={dateFromP} />
                <input type="date" class="input input-bordered input-sm" bind:value={dateToP} />
                <input type="text" class="input input-bordered input-sm w-48" placeholder="Cari ID atau nama..." bind:value={searchP} />
            </div>
            <select class="select select-bordered select-sm" bind:value={perPageP}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>

        <div class="overflow-x-auto">
            <table class="table table-sm w-full">
                <thead>
                    <tr><th>Sumber</th><th>ID Transaksi</th><th>Diedit Oleh</th><th>Waktu Edit</th><th>Fields yang Diubah</th></tr>
                </thead>
                <tbody>
                    {#each paginatedP as r}
                        <tr>
                            <td><span class="badge badge-sm {SOURCE_BADGE[r.source]}">{SOURCE_LABEL[r.source]}</span></td>
                            <td class="font-mono text-xs">{r.recordId}</td>
                            <td>{r.editedBy}</td>
                            <td>{formatDate(r.editedAt)}</td>
                            <td class="text-xs text-base-content/70">{r.changedFields.join(', ')}</td>
                        </tr>
                    {:else}
                        <tr><td colspan="5" class="text-center text-base-content/50 py-8">Tidak ada log PTI</td></tr>
                    {/each}
                </tbody>
            </table>
        </div>

        {#if totalPagesP > 1}
            <div class="flex justify-center items-center gap-1 mt-4">
                <button class="btn btn-sm btn-ghost" disabled={currentPageP === 1} on:click={() => currentPageP--}>‹</button>
                {#each pageButtonsP as p}
                    <button class="btn btn-sm {p === currentPageP ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPageP = p}>{p}</button>
                {/each}
                <button class="btn btn-sm btn-ghost" disabled={currentPageP === totalPagesP} on:click={() => currentPageP++}>›</button>
            </div>
        {/if}
    {/if}
</div>
```

- [ ] **Step 2: Verify dev server renders the page**

```bash
npm run dev
```

Navigate to `http://localhost:5173/outlet/perbaikan-transaksi/`. Expected: 3-tab page with empty tables (source mocks not yet built).

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/perbaikan-transaksi/+page.svelte
git commit -m "feat: add perbaikan-transaksi main dashboard page"
```

---

## Task 4: Detail Page

**Files:**
- Create: `src/routes/outlet/perbaikan-transaksi/[id]/[source]/+page.svelte`

- [ ] **Step 1: Create the detail page**

```svelte
<!-- src/routes/outlet/perbaikan-transaksi/[id]/[source]/+page.svelte -->
<script lang="ts">
    import { page } from '$app/stores'
    import { goto } from '$app/navigation'
    import { auth } from '../../../../library/stores/auth'
    import { formatDate, formatCurrency } from '../../../../library/utils/formatter'
    import {
        getRequestDetail,
        approveRepairRequest,
        rejectRepairRequest,
        deleteRepairRequest
    } from '../../../../library/mock/perbaikan-transaksi'
    import type { SourceType, PTRequestDetail } from '../../../../library/types/PerbaikanTransaksi'

    $: id = $page.params.id
    $: source = $page.params.source as SourceType
    $: detail = getRequestDetail(id, source)

    const isAdmin = $auth.role === 'admin'

    const SOURCE_LABEL: Record<SourceType, string> = {
        'riwayat': 'Riwayat', 'kas-masuk': 'Kas Masuk', 'kas-keluar': 'Kas Keluar',
        'kasir-shift': 'Kasir Shift', 'kasir-hari': 'Kasir Hari'
    }

    const SOURCE_BADGE: Record<SourceType, string> = {
        'riwayat': 'badge-primary', 'kas-masuk': 'badge-info', 'kas-keluar': 'badge-info',
        'kasir-shift': 'badge-secondary', 'kasir-hari': 'badge-secondary'
    }

    const SOURCE_ROUTE: Record<SourceType, string> = {
        'riwayat': '/outlet/riwayat/',
        'kas-masuk': '/outlet/akuntansi/',
        'kas-keluar': '/outlet/akuntansi/',
        'kasir-shift': '/outlet/kasir/shift/',
        'kasir-hari': '/outlet/kasir/day/'
    }

    type DiffField = { key: string; label: string; format?: (v: unknown) => string }

    const DIFF_FIELDS: Record<SourceType, DiffField[]> = {
        'riwayat': [
            { key: 'memberId', label: 'Member' },
            { key: 'notes', label: 'Keterangan' },
            { key: 'items', label: 'Items', format: v => JSON.stringify(v, null, 2) },
            { key: 'pricing', label: 'Pricing', format: v => JSON.stringify(v, null, 2) },
            { key: 'paymentMethods', label: 'Metode Pembayaran', format: v => JSON.stringify(v, null, 2) },
            { key: 'orderMeta', label: 'Info Pesanan', format: v => JSON.stringify(v, null, 2) }
        ],
        'kas-masuk': [
            { key: 'tanggal', label: 'Tanggal' },
            { key: 'totalAmount', label: 'Total', format: v => formatCurrency(v as number) },
            { key: 'entries', label: 'Entri', format: v => JSON.stringify(v, null, 2) },
            { key: 'pic', label: 'PIC' }
        ],
        'kas-keluar': [
            { key: 'tanggal', label: 'Tanggal' },
            { key: 'totalAmount', label: 'Total', format: v => formatCurrency(v as number) },
            { key: 'entries', label: 'Entri', format: v => JSON.stringify(v, null, 2) },
            { key: 'pic', label: 'PIC' }
        ],
        'kasir-shift': [
            { key: 'physicalCashCounted', label: 'Cash Terhitung', format: v => formatCurrency(v as number) },
            { key: 'selisihNotes', label: 'Catatan Selisih' },
            { key: 'tanggalSetor', label: 'Tanggal Setor' }
        ],
        'kasir-hari': [
            { key: 'tanggal', label: 'Tanggal' }
        ]
    }

    function displayVal(field: DiffField, snap: unknown): string {
        const v = (snap as Record<string, unknown>)?.[field.key]
        if (v === null || v === undefined) return '-'
        if (field.format) return field.format(v)
        return String(v)
    }

    // Tolak form state
    let showTolakForm = false
    let tolakReason = ''

    const OUTCOME_LABEL: Record<string, string> = {
        approved: 'Disetujui', rejected: 'Ditolak', deleted: 'Dihapus', pending: 'Menunggu'
    }

    function doApprove() {
        if (!detail) return
        approveRepairRequest(detail.id, detail.source, $auth.userId)
        goto('/outlet/perbaikan-transaksi/')
    }

    function doTolak() {
        if (!detail || !tolakReason.trim()) return
        rejectRepairRequest(detail.id, detail.source, tolakReason.trim(), $auth.userId)
        goto('/outlet/perbaikan-transaksi/')
    }

    function doHapusRequest() {
        if (!detail) return
        deleteRepairRequest(detail.id, detail.source, $auth.userId)
        goto('/outlet/perbaikan-transaksi/')
    }
</script>

<div class="p-6 max-w-5xl">
    <button class="btn btn-ghost btn-sm mb-6" on:click={() => goto('/outlet/perbaikan-transaksi/')}>← Kembali ke Perbaikan Transaksi</button>

    {#if !detail}
        <div class="alert alert-error">Request tidak ditemukan.</div>
    {:else}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- Left: metadata + diff -->
            <div class="lg:col-span-2 space-y-4">
                <!-- Metadata header -->
                <div class="card bg-base-200 p-4 space-y-2">
                    <div class="flex items-center gap-3 flex-wrap">
                        <span class="font-mono font-bold">{detail.id}</span>
                        <span class="badge badge-sm {SOURCE_BADGE[detail.source]}">{SOURCE_LABEL[detail.source]}</span>
                        <span class="badge badge-sm {detail.status === 'pending' ? 'badge-warning' : detail.status === 'approved' ? 'badge-success' : detail.status === 'rejected' ? 'badge-error' : 'badge-ghost'}">{OUTCOME_LABEL[detail.status]}</span>
                    </div>
                    <div class="text-sm text-base-content/70 space-y-1">
                        <div>Diajukan oleh: <span class="text-base-content">{detail.submittedBy}</span></div>
                        <div>Waktu diajukan: <span class="text-base-content">{formatDate(detail.submittedAt)}</span></div>
                        <div>Revisi ke-: <span class="text-base-content">{detail.revisions + 1}</span></div>
                        {#if detail.resolvedBy}
                            <div>Diselesaikan oleh: <span class="text-base-content">{detail.resolvedBy}</span> · {detail.resolvedAt ? formatDate(detail.resolvedAt) : ''}</div>
                        {/if}
                    </div>
                </div>

                <!-- Diff table -->
                <div class="overflow-x-auto">
                    <table class="table table-sm w-full">
                        <thead><tr><th>Field</th><th>Nilai Lama</th><th>Nilai Baru</th></tr></thead>
                        <tbody>
                            {#each DIFF_FIELDS[detail.source] as field}
                                {@const oldVal = displayVal(field, detail.currentSnapshot)}
                                {@const newVal = displayVal(field, detail.proposedSnapshot)}
                                {@const changed = oldVal !== newVal}
                                <tr class:bg-warning/10={changed}>
                                    <td class="font-medium text-sm">{field.label}</td>
                                    <td class="text-sm {changed ? '' : 'text-base-content/50'} whitespace-pre-wrap break-all">{oldVal}</td>
                                    <td class="text-sm {changed ? 'text-warning font-medium' : 'text-base-content/50'} whitespace-pre-wrap break-all">{newVal}</td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Right: action panel -->
            <div class="space-y-3">

                {#if isAdmin}
                    {#if detail.status === 'pending'}
                        <button class="btn btn-success btn-block" on:click={doApprove}>✓ Setujui</button>

                        {#if showTolakForm}
                            <textarea class="textarea textarea-bordered w-full" rows="3" placeholder="Alasan penolakan (wajib)" bind:value={tolakReason}></textarea>
                            <button class="btn btn-error btn-block" disabled={!tolakReason.trim()} on:click={doTolak}>Konfirmasi Tolak</button>
                            <button class="btn btn-ghost btn-block btn-sm" on:click={() => { showTolakForm = false; tolakReason = '' }}>Batal</button>
                        {:else}
                            <button class="btn btn-error btn-outline btn-block" on:click={() => showTolakForm = true}>✗ Tolak</button>
                        {/if}

                        <button class="btn btn-ghost btn-block btn-sm" on:click={doHapusRequest}>Hapus Request</button>
                    {:else}
                        <div class="alert {detail.status === 'approved' ? 'alert-success' : detail.status === 'rejected' ? 'alert-error' : 'alert-info'} text-sm">
                            <div>
                                <div class="font-semibold">{OUTCOME_LABEL[detail.status]}</div>
                                {#if detail.resolvedBy}<div>oleh {detail.resolvedBy}</div>{/if}
                                {#if detail.rejectionReason}<div class="mt-1">Alasan: {detail.rejectionReason}</div>{/if}
                            </div>
                        </div>
                        {#if detail.status === 'approved'}
                            <a class="btn btn-ghost btn-block btn-sm" href={SOURCE_ROUTE[detail.source]}>→ Lihat di {SOURCE_LABEL[detail.source]}</a>
                        {/if}
                    {/if}

                {:else}
                    {#if detail.status === 'pending'}
                        <div class="alert alert-warning text-sm">Menunggu persetujuan admin</div>
                    {:else if detail.status === 'rejected'}
                        <div class="alert alert-error text-sm">
                            <div>
                                <div class="font-semibold">Ditolak</div>
                                {#if detail.rejectionReason}<div class="mt-1">Alasan: {detail.rejectionReason}</div>{/if}
                                <div class="mt-1 text-xs">Revisi ke-{detail.revisions + 1}</div>
                            </div>
                        </div>
                        <a class="btn btn-primary btn-block" href={SOURCE_ROUTE[detail.source]}>Revisi di {SOURCE_LABEL[detail.source]}</a>
                        <button class="btn btn-ghost btn-block btn-sm" on:click={doHapusRequest}>Tarik Request</button>
                    {:else}
                        <div class="alert text-sm">
                            <div class="font-semibold">{OUTCOME_LABEL[detail.status]}</div>
                        </div>
                    {/if}
                {/if}

            </div>
        </div>
    {/if}
</div>
```

- [ ] **Step 2: Verify detail page renders**

In the dev server, navigate to `/outlet/perbaikan-transaksi/REQ-001/riwayat`. Expected: "Request tidak ditemukan" (no live data yet — riwayat mock not built). No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/outlet/perbaikan-transaksi/[id]/[source]/+page.svelte"
git commit -m "feat: add perbaikan-transaksi detail page with diff and action panel"
```

---

## Task 5: Redirect Stubs + Layout Nav

**Files:**
- Create: `src/routes/outlet/riwayat/repair/+page.ts`
- Create: `src/routes/outlet/akuntansi/repair/+page.ts`
- Create: `src/routes/outlet/kasir/repair/+page.ts`
- Modify: `src/routes/outlet/+layout.svelte`

- [ ] **Step 1: Create the three redirect stubs**

```typescript
// src/routes/outlet/riwayat/repair/+page.ts
import { redirect } from '@sveltejs/kit'
export const load = () => { throw redirect(307, '/outlet/perbaikan-transaksi/') }
```

```typescript
// src/routes/outlet/akuntansi/repair/+page.ts
import { redirect } from '@sveltejs/kit'
export const load = () => { throw redirect(307, '/outlet/perbaikan-transaksi/') }
```

```typescript
// src/routes/outlet/kasir/repair/+page.ts
import { redirect } from '@sveltejs/kit'
export const load = () => { throw redirect(307, '/outlet/perbaikan-transaksi/') }
```

- [ ] **Step 2: Verify redirects work**

Navigate to `/outlet/riwayat/repair/` in the dev server. Expected: redirects to `/outlet/perbaikan-transaksi/`.

- [ ] **Step 3: Add PT nav link to layout**

Find the nav links section in `src/routes/outlet/+layout.svelte` and add the Perbaikan Transaksi link. The exact insertion point depends on what's already in the file — add it after the existing nav items. The badge count uses `getPendingCount` filtered to `$auth.userId` for non-admin.

```svelte
<!-- Add to the nav section inside src/routes/outlet/+layout.svelte -->
<!-- Import at top of <script>: -->
import { getPendingCount } from '../../library/mock/perbaikan-transaksi'

<!-- Add this nav item alongside existing ones: -->
<a href="/outlet/perbaikan-transaksi/" class="...existing nav link classes...">
    Perbaikan Transaksi
    {#if $auth.role !== 'admin'}
        {@const count = getPendingCount($auth.userId)}
        {#if count > 0}<span class="badge badge-warning badge-xs ml-1">{count}</span>{/if}
    {:else}
        {@const count = getPendingCount()}
        {#if count > 0}<span class="badge badge-warning badge-xs ml-1">{count}</span>{/if}
    {/if}
</a>
```

> Since `+layout.svelte` doesn't exist yet (documentation-first project), create it with auth guard and nav. If it already exists from a prior plan execution, add only the import and nav link.

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/riwayat/repair/+page.ts src/routes/outlet/akuntansi/repair/+page.ts src/routes/outlet/kasir/repair/+page.ts src/routes/outlet/+layout.svelte
git commit -m "feat: add PT dashboard nav link and redirect stubs for legacy repair routes"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `/outlet/perbaikan-transaksi/` route | Task 3 |
| `/outlet/perbaikan-transaksi/[id]/[source]/` route | Task 4 |
| Remove `/riwayat/repair/`, `/akuntansi/repair/`, `/kasir/repair/` → redirect | Task 5 |
| Tab 1: Menunggu — source chips, search, per-page, table, Lihat link | Task 3 |
| Tab 2: Riwayat PT — outcome + source chips, date range, table | Task 3 |
| Tab 3: Log PTI — source chips, date range, table, no actions | Task 3 |
| Admin sees all; non-admin sees own rows only | Task 3 (matchesScope) |
| Detail: metadata header + diff table | Task 4 |
| Detail: admin actions (Setujui/Tolak/Hapus) | Task 4 |
| Detail: non-admin pending/rejected/approved states | Task 4 |
| Back navigation to dashboard | Task 4 |
| Nav link with badge | Task 5 |
| Aggregator reads from source mocks with try/catch | Task 2 |
| `SourceType` discriminant on all aggregated types | Task 1 |

**Placeholder scan:** Clean.

**Type consistency:** `SourceType` defined in Task 1, used in Tasks 2, 3, 4 consistently. `PTRequestDetail` extends `AggregatedPTRequest` — `getRequestDetail` returns it; detail page uses it. `approveRepairRequest(id, source, adminId)` signature consistent between Tasks 2 and 4. `DIFF_FIELDS` keyed by `SourceType` — all 5 sources covered.
