# Stock Pre-Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stock Pre-Adjustment system — a virtual stock overlay letting any staff member temporarily unblock sales for items that physically exist but haven't been recorded yet, with an admin Adjustment dashboard at `/outlet/adjustment/` for cross-outlet audit, force-close, and automatic reconciliation tracking against subsequent Pergerakan Stok (masuk) submissions.

**Architecture:** `StockPreAdjustment` records are a virtual overlay — they never touch the real stock ledger. `OutletStock.preAdjDelta` in `mock/master-items.ts` is the materialized sum of open pre-adjustment deltas for each item/outlet pair. Pre-adjustment create/revert/forceClose functions mutate `preAdjDelta` in place by importing `mockOutletStock` from `master-items`. `getDisplayStock(itemId, outletId)` — defined in `mock/master-items.ts` — returns `OutletStock.stock + OutletStock.preAdjDelta` and is the universal stock accessor for all cashier-facing UI. Reconciliation is triggered inside `createStokMasuk()` in `mock/pergerakan-stok.ts` after each masuk stock movement is applied.

**Tech Stack:** SvelteKit · TypeScript · TailwindCSS · DaisyUI · Vitest

> **`$lib`** resolves to `src/library/`. Ensure `svelte.config.js` has `kit: { alias: { $lib: 'src/library' } }`.
>
> **Prerequisites:** Working SvelteKit project with TailwindCSS + DaisyUI. `src/library/stores/auth.ts` exports writable `auth` store with shape `{ userId: string; outletId: string; userName: string; role: "cashier" | "manager" | "admin" }`. `src/library/mock/master-items.ts` (from Pergerakan Stok plan) exports `getMasterItems()`, `getMasterItemById()`, mutable `mockOutletStock: Record<string, OutletStock>` keyed by `"${itemId}_${outletId}"`, and `getDisplayStock(itemId: string, outletId: string): number` (returns `OutletStock.stock + OutletStock.preAdjDelta`). `src/library/mock/pergerakan-stok.ts` exports `createStokMasuk()`. `src/library/mock/transfers.ts` exports `mockTransferRecords` (empty array stub if absent). `src/library/mock/outlets.ts` exports `mockOutlets: { id: string; name: string }[]`.

---

## File Map

**Created:**
- `src/library/types/PreAdjustment.ts` — all TypeScript interfaces and label maps
- `src/library/mock/pre-adjustments.ts` — seed data, all mock functions
- `src/library/mock/pre-adjustments.test.ts` — Vitest unit tests for all mock functions
- `src/library/components/outlet/pre-adjustment/PreAdjustmentModal.svelte` — shared create form modal
- `src/routes/outlet/pre-adjustment/+page.svelte` — outlet Aktif + Riwayat page (all roles)
- `src/routes/outlet/adjustment/+page.svelte` — admin Adjustment dashboard (admin only)

**Modified:**
- `src/routes/outlet/retail/+page.svelte` — add Pre Adjustment quick button when display stock = 0
- `src/library/components/outlet/retail/CartSection.svelte` — use `getDisplayStock` for qty ceiling validation
- `src/library/components/outlet/retail/Order.svelte` — use `getDisplayStock` per outlet column with active-adjustment badge
- `src/library/mock/pergerakan-stok.ts` — call `checkReconciliation()` inside `createStokMasuk()` after `logStockMovement()`

---

## Task 1: TypeScript Types

**Files:**
- Create: `src/library/types/PreAdjustment.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/PreAdjustment.ts

export type PreAdjustmentReason =
    | "missing_item_masuk"
    | "physical_count_mismatch"
    | "transfer_input_error"
    | "system_error"
    | "other"

export type PreAdjustmentStatus = "open" | "reverted" | "force_closed"
export type ReconciliationStatus = "pending" | "reconciled" | "unresolved"

export interface StockPreAdjustment {
    id: string
    outletId: string
    itemId: string
    delta: number                              // always a positive integer
    reason: PreAdjustmentReason
    note: string                               // required free text
    transferId: string | null                  // set only when reason === "transfer_input_error"
    status: PreAdjustmentStatus
    createdBy: string
    createdAt: string                          // ISO timestamp
    revertedBy: string | null
    revertedAt: string | null
    forceClosedBy: string | null
    forceClosedAt: string | null
    forceCloseNote: string | null              // required when force-closing
    reconciledPergerakanStokId: string | null  // set by checkReconciliation
    reconciliationStatus: ReconciliationStatus
}

export interface CreatePreAdjustmentPayload {
    outletId: string
    itemId: string
    delta: number
    reason: PreAdjustmentReason
    note: string
    transferId?: string                        // only when reason === "transfer_input_error"
}

export interface ActiveTransferSummary {
    transferId: string
    qty: number
    toOutletName: string
}

export const REASON_LABELS: Record<PreAdjustmentReason, string> = {
    missing_item_masuk: "Item Masuk Belum Diinput",
    physical_count_mismatch: "Selisih Stok Fisik",
    transfer_input_error: "Kesalahan Input Transfer",
    system_error: "Kesalahan Sistem",
    other: "Lainnya"
}
```

- [ ] **Step 2: Commit**

```bash
git add src/library/types/PreAdjustment.ts
git commit -m "feat: add PreAdjustment TypeScript types"
```

---

## Task 2: Mock Seed Data & Query Functions

**Files:**
- Create: `src/library/mock/pre-adjustments.ts`
- Create: `src/library/mock/pre-adjustments.test.ts`

- [ ] **Step 1: Write failing tests for query functions**

```typescript
// src/library/mock/pre-adjustments.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import {
    getActivePreAdjustments,
    getAllPreAdjustments,
    getActiveTransfersForItem,
    resetPreAdjustments
} from './pre-adjustments'
import { getDisplayStock } from '$lib/mock/master-items'

beforeEach(() => {
    resetPreAdjustments()
})

describe('getDisplayStock via preAdjDelta', () => {
    it('returns stock + preAdjDelta for item with an open PA', () => {
        // seed PA001: open, item-001, outlet-1, delta 2
        // master-items seed: item-001 at outlet-1 has stock=5, preAdjDelta seeded to 2
        expect(getDisplayStock('item-001', 'outlet-1')).toBe(7)
    })

    it('returns base stock when no open PAs exist for item', () => {
        // item-002 at outlet-1 has no PAs in seed, preAdjDelta=0
        expect(getDisplayStock('item-002', 'outlet-1')).toBe(3)
    })

    it('returns base stock for a different outlet with no open PAs', () => {
        // item-001 at outlet-2 has no PAs in seed
        expect(getDisplayStock('item-001', 'outlet-2')).toBe(5)
    })
})

describe('getActivePreAdjustments', () => {
    it('returns only open entries for the given outlet', () => {
        const result = getActivePreAdjustments('outlet-1')
        expect(result.every(pa => pa.status === 'open')).toBe(true)
        expect(result.every(pa => pa.outletId === 'outlet-1')).toBe(true)
    })

    it('returns all open entries across outlets when no outletId given', () => {
        const result = getActivePreAdjustments()
        expect(result.every(pa => pa.status === 'open')).toBe(true)
    })
})

describe('getAllPreAdjustments', () => {
    it('returns entries of all statuses for the given outlet', () => {
        const result = getAllPreAdjustments('outlet-1')
        const statuses = new Set(result.map(pa => pa.status))
        expect(statuses.size).toBeGreaterThan(1)  // seed has open + reverted
    })

    it('returns all entries across outlets when no outletId given', () => {
        const result = getAllPreAdjustments()
        expect(result.length).toBeGreaterThanOrEqual(2)
    })
})

describe('getActiveTransfersForItem', () => {
    it('returns summaries for unaccepted transfers from the given outlet', () => {
        const result = getActiveTransfersForItem('item-001', 'outlet-1')
        if (result.length > 0) {
            expect(result[0]).toMatchObject({
                transferId: expect.any(String),
                qty: expect.any(Number),
                toOutletName: expect.any(String)
            })
        }
    })

    it('returns empty array when no active transfers exist for the item', () => {
        expect(getActiveTransfersForItem('item-999', 'outlet-1')).toEqual([])
    })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/library/mock/pre-adjustments.test.ts
```

Expected: FAIL — `Cannot find module './pre-adjustments'`

- [ ] **Step 3: Create the mock file with seed data and query functions**

```typescript
// src/library/mock/pre-adjustments.ts

import type {
    StockPreAdjustment,
    CreatePreAdjustmentPayload,
    ActiveTransferSummary
} from '$lib/types/PreAdjustment'
import { mockOutletStock } from './master-items'
import { mockTransferRecords } from './transfers'
import { mockOutlets } from './outlets'

const SEED: StockPreAdjustment[] = [
    {
        id: 'PA001',
        outletId: 'outlet-1',
        itemId: 'item-001',
        delta: 2,
        reason: 'missing_item_masuk',
        note: 'Shift kemarin lupa input Item Masuk Aqua 600ml sebanyak 2 pcs',
        transferId: null,
        status: 'open',
        createdBy: 'user-cashier-1',
        createdAt: '2026-05-09T06:00:00.000Z',
        revertedBy: null,
        revertedAt: null,
        forceClosedBy: null,
        forceClosedAt: null,
        forceCloseNote: null,
        reconciledPergerakanStokId: null,
        reconciliationStatus: 'pending'
    },
    {
        id: 'PA002',
        outletId: 'outlet-1',
        itemId: 'item-001',
        delta: 1,
        reason: 'transfer_input_error',
        note: 'Transfer salah input qty, harusnya 2 bukan 3',
        transferId: 'TRF-00009',
        status: 'reverted',
        createdBy: 'user-cashier-2',
        createdAt: '2026-05-08T10:00:00.000Z',
        revertedBy: 'user-cashier-2',
        revertedAt: '2026-05-08T14:00:00.000Z',
        forceClosedBy: null,
        forceClosedAt: null,
        forceCloseNote: null,
        reconciledPergerakanStokId: null,
        reconciliationStatus: 'pending'
    }
]

let idCounter = 100
let mockPreAdjustments: StockPreAdjustment[] = structuredClone(SEED)

// Sync preAdjDelta in mockOutletStock to match the open seed entries.
// PA001 is open (item-001, outlet-1, delta 2) → preAdjDelta = 2.
function applySeededDeltas(): void {
    const key = 'item-001_outlet-1'
    if (mockOutletStock[key]) mockOutletStock[key].preAdjDelta = 2
}
applySeededDeltas()

export function resetPreAdjustments(): void {
    mockPreAdjustments = structuredClone(SEED)
    idCounter = 100
    applySeededDeltas()
}

export function getActivePreAdjustments(outletId?: string): StockPreAdjustment[] {
    return mockPreAdjustments.filter(pa =>
        pa.status === 'open' && (outletId === undefined || pa.outletId === outletId)
    )
}

export function getAllPreAdjustments(outletId?: string): StockPreAdjustment[] {
    return mockPreAdjustments.filter(pa =>
        outletId === undefined || pa.outletId === outletId
    )
}

export function getActiveTransfersForItem(itemId: string, outletId: string): ActiveTransferSummary[] {
    const active = mockTransferRecords.filter((t: any) =>
        t.fromOutletId === outletId &&
        (t.status === 'active' || t.status === 'scheduled') &&
        t.items?.some((line: { itemId: string }) => line.itemId === itemId)
    )
    return active.map((t: any) => {
        const line = t.items.find((l: { itemId: string; qty: number }) => l.itemId === itemId)
        const toOutlet = mockOutlets.find((o: { id: string; name: string }) => o.id === t.toOutletId)
        return {
            transferId: t.id,
            qty: line?.qty ?? 0,
            toOutletName: toOutlet?.name ?? t.toOutletId
        }
    })
}

export { mockPreAdjustments }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/library/mock/pre-adjustments.test.ts
```

Expected: PASS — all query and `getDisplayStock` assertions

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/pre-adjustments.ts src/library/mock/pre-adjustments.test.ts
git commit -m "feat: add pre-adjustment mock seed data and query functions"
```

---

## Task 3: Mock Mutation & Reconciliation Functions

**Files:**
- Modify: `src/library/mock/pre-adjustments.ts`
- Modify: `src/library/mock/pre-adjustments.test.ts`

- [ ] **Step 1: Write failing tests — append to `pre-adjustments.test.ts`**

```typescript
import {
    createPreAdjustment,
    revertPreAdjustment,
    forceClosePreAdjustment,
    markStaleAsUnresolved,
    checkReconciliation
} from './pre-adjustments'
import { getDisplayStock, mockOutletStock } from '$lib/mock/master-items'

describe('createPreAdjustment', () => {
    it('increases preAdjDelta by delta — display stock rises', () => {
        const before = getDisplayStock('item-002', 'outlet-1')
        createPreAdjustment(
            { outletId: 'outlet-1', itemId: 'item-002', delta: 3, reason: 'missing_item_masuk', note: 'Test' },
            'user-cashier-1'
        )
        expect(getDisplayStock('item-002', 'outlet-1')).toBe(before + 3)
    })

    it('creates record with status open and reconciliationStatus pending', () => {
        const pa = createPreAdjustment(
            { outletId: 'outlet-1', itemId: 'item-002', delta: 1, reason: 'other', note: 'Note' },
            'user-cashier-1'
        )
        expect(pa.status).toBe('open')
        expect(pa.reconciliationStatus).toBe('pending')
        expect(pa.revertedBy).toBeNull()
        expect(pa.forceClosedBy).toBeNull()
        expect(pa.transferId).toBeNull()
    })

    it('stores transferId when reason is transfer_input_error', () => {
        const pa = createPreAdjustment(
            {
                outletId: 'outlet-1',
                itemId: 'item-002',
                delta: 1,
                reason: 'transfer_input_error',
                note: 'Transfer salah',
                transferId: 'TRF-00042'
            },
            'user-cashier-1'
        )
        expect(pa.transferId).toBe('TRF-00042')
    })
})

describe('revertPreAdjustment', () => {
    it('sets status to reverted with revertedBy and revertedAt', () => {
        revertPreAdjustment('PA001', 'user-cashier-2')
        const pa = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA001')!
        expect(pa.status).toBe('reverted')
        expect(pa.revertedBy).toBe('user-cashier-2')
        expect(pa.revertedAt).toBeTruthy()
    })

    it('decreases preAdjDelta by delta — display stock drops', () => {
        const before = getDisplayStock('item-001', 'outlet-1')  // 7 (5 base + 2 preAdjDelta from PA001)
        revertPreAdjustment('PA001', 'user-cashier-1')
        expect(getDisplayStock('item-001', 'outlet-1')).toBe(before - 2)
    })

    it('does nothing when called on a non-open entry', () => {
        revertPreAdjustment('PA002', 'user-cashier-1')  // PA002 is already reverted in seed
        const pa = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!
        expect(pa.revertedBy).toBe('user-cashier-2')  // unchanged from seed
    })
})

describe('forceClosePreAdjustment', () => {
    it('sets status to force_closed with adminId and note', () => {
        forceClosePreAdjustment('PA001', 'user-admin-1', 'Shift ended without revert')
        const pa = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA001')!
        expect(pa.status).toBe('force_closed')
        expect(pa.forceClosedBy).toBe('user-admin-1')
        expect(pa.forceCloseNote).toBe('Shift ended without revert')
        expect(pa.forceClosedAt).toBeTruthy()
    })

    it('decreases preAdjDelta by delta — display stock drops', () => {
        const before = getDisplayStock('item-001', 'outlet-1')
        forceClosePreAdjustment('PA001', 'user-admin-1', 'Reason')
        expect(getDisplayStock('item-001', 'outlet-1')).toBe(before - 2)
    })
})

describe('markStaleAsUnresolved', () => {
    it('flips reconciliationStatus to unresolved for reverted entries pending > 7 days', () => {
        const pa2 = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!
        pa2.revertedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
        markStaleAsUnresolved()
        expect(getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!.reconciliationStatus).toBe('unresolved')
    })

    it('does not flip entries reverted fewer than 7 days ago', () => {
        const pa2 = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!
        pa2.revertedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
        markStaleAsUnresolved()
        expect(getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!.reconciliationStatus).toBe('pending')
    })
})

describe('checkReconciliation', () => {
    it('marks pending reverted PAs as reconciled when stock >= 0', () => {
        revertPreAdjustment('PA001', 'user-cashier-1')
        mockOutletStock['item-001_outlet-1'].stock = 0
        checkReconciliation('IM-00001', 'outlet-1', 'item-001')
        const pa = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA001')!
        expect(pa.reconciliationStatus).toBe('reconciled')
        expect(pa.reconciledPergerakanStokId).toBe('IM-00001')
    })

    it('does not mark reconciled when stock is still negative', () => {
        revertPreAdjustment('PA001', 'user-cashier-1')
        mockOutletStock['item-001_outlet-1'].stock = -1
        checkReconciliation('IM-00002', 'outlet-1', 'item-001')
        const pa = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA001')!
        expect(pa.reconciliationStatus).toBe('pending')
    })
})
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npx vitest run src/library/mock/pre-adjustments.test.ts
```

Expected: FAIL — mutation functions not exported

- [ ] **Step 3: Append mutation and reconciliation functions to `pre-adjustments.ts`**

```typescript
export function createPreAdjustment(payload: CreatePreAdjustmentPayload, userId: string): StockPreAdjustment {
    const key = `${payload.itemId}_${payload.outletId}`
    if (mockOutletStock[key]) mockOutletStock[key].preAdjDelta += payload.delta

    const pa: StockPreAdjustment = {
        id: `PA${++idCounter}`,
        outletId: payload.outletId,
        itemId: payload.itemId,
        delta: payload.delta,
        reason: payload.reason,
        note: payload.note,
        transferId: payload.transferId ?? null,
        status: 'open',
        createdBy: userId,
        createdAt: new Date().toISOString(),
        revertedBy: null,
        revertedAt: null,
        forceClosedBy: null,
        forceClosedAt: null,
        forceCloseNote: null,
        reconciledPergerakanStokId: null,
        reconciliationStatus: 'pending'
    }
    mockPreAdjustments.push(pa)
    return pa
}

export function revertPreAdjustment(id: string, userId: string): void {
    const pa = mockPreAdjustments.find(p => p.id === id)
    if (!pa || pa.status !== 'open') return
    const key = `${pa.itemId}_${pa.outletId}`
    if (mockOutletStock[key]) mockOutletStock[key].preAdjDelta -= pa.delta
    pa.status = 'reverted'
    pa.revertedBy = userId
    pa.revertedAt = new Date().toISOString()
}

export function forceClosePreAdjustment(id: string, adminId: string, note: string): void {
    const pa = mockPreAdjustments.find(p => p.id === id)
    if (!pa || pa.status !== 'open') return
    const key = `${pa.itemId}_${pa.outletId}`
    if (mockOutletStock[key]) mockOutletStock[key].preAdjDelta -= pa.delta
    pa.status = 'force_closed'
    pa.forceClosedBy = adminId
    pa.forceClosedAt = new Date().toISOString()
    pa.forceCloseNote = note
}

export function markStaleAsUnresolved(): void {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (const pa of mockPreAdjustments) {
        if (pa.reconciliationStatus !== 'pending') continue
        if (pa.status !== 'reverted' && pa.status !== 'force_closed') continue
        const closedAt = pa.revertedAt ?? pa.forceClosedAt
        if (!closedAt) continue
        if (new Date(closedAt).getTime() < sevenDaysAgo) pa.reconciliationStatus = 'unresolved'
    }
}

// Called inside createStokMasuk() in mock/pergerakan-stok.ts after logStockMovement() has updated OutletStock.stock.
// If stock >= 0, all pending reverted/force-closed PAs for this item/outlet are marked reconciled.
export function checkReconciliation(stokMasukId: string, outletId: string, itemId: string): void {
    const key = `${itemId}_${outletId}`
    const outletStock = mockOutletStock[key]
    if (!outletStock || outletStock.stock < 0) return
    const pending = mockPreAdjustments.filter(pa =>
        pa.itemId === itemId &&
        pa.outletId === outletId &&
        (pa.status === 'reverted' || pa.status === 'force_closed') &&
        pa.reconciliationStatus === 'pending'
    )
    for (const pa of pending) {
        pa.reconciliationStatus = 'reconciled'
        pa.reconciledPergerakanStokId = stokMasukId
    }
}
```

- [ ] **Step 4: Run all tests — verify they pass**

```bash
npx vitest run src/library/mock/pre-adjustments.test.ts
```

Expected: PASS — all tests including mutation and reconciliation

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/pre-adjustments.ts src/library/mock/pre-adjustments.test.ts
git commit -m "feat: add pre-adjustment mutation and reconciliation mock functions"
```

---

## Task 4: PreAdjustmentModal Component

**Files:**
- Create: `src/library/components/outlet/pre-adjustment/PreAdjustmentModal.svelte`

- [ ] **Step 1: Create the modal component**

```svelte
<!-- src/library/components/outlet/pre-adjustment/PreAdjustmentModal.svelte -->
<script lang="ts">
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import { createPreAdjustment, getActiveTransfersForItem } from '$lib/mock/pre-adjustments'
    import { getMasterItems, getDisplayStock } from '$lib/mock/master-items'
    import { REASON_LABELS } from '$lib/types/PreAdjustment'
    import type { PreAdjustmentReason, ActiveTransferSummary } from '$lib/types/PreAdjustment'

    export let open = false
    export let prefilledItemId: string = ''
    export let onCreated: () => void = () => {}

    let itemId = prefilledItemId
    let delta = 1
    let reason: PreAdjustmentReason | '' = ''
    let transferRef = ''
    let note = ''
    let activeTransfers: ActiveTransferSummary[] = []
    let submitting = false
    let errors: Record<string, string> = {}

    const session = get(auth)
    const masterItems = getMasterItems()

    $: if (prefilledItemId) itemId = prefilledItemId

    $: if (itemId) {
        activeTransfers = getActiveTransfersForItem(itemId, session.outletId)
    } else {
        activeTransfers = []
    }

    $: if (reason !== 'transfer_input_error') transferRef = ''

    function validate(): boolean {
        errors = {}
        if (!itemId) errors.itemId = 'Pilih item terlebih dahulu'
        if (!delta || delta < 1) errors.delta = 'Jumlah minimal 1'
        if (!reason) errors.reason = 'Pilih alasan'
        if (!note.trim()) errors.note = 'Catatan wajib diisi'
        return Object.keys(errors).length === 0
    }

    function submit() {
        if (!validate()) return
        submitting = true
        createPreAdjustment(
            {
                outletId: session.outletId,
                itemId,
                delta,
                reason: reason as PreAdjustmentReason,
                note: note.trim(),
                ...(reason === 'transfer_input_error' && transferRef.trim()
                    ? { transferId: transferRef.trim() }
                    : {})
            },
            session.userId
        )
        submitting = false
        close()
        onCreated()
    }

    function close() {
        open = false
        itemId = prefilledItemId || ''
        delta = 1
        reason = ''
        transferRef = ''
        note = ''
        errors = {}
        activeTransfers = []
    }
</script>

{#if open}
<div class="modal modal-open">
    <div class="modal-box max-w-md backdrop-blur">
        <h3 class="font-bold text-lg mb-4">Buat Pre Adjustment</h3>

        {#if activeTransfers.length > 0}
            <div class="mb-4 space-y-1">
                {#each activeTransfers as t}
                    <div class="alert alert-warning py-2 text-sm">
                        Ada transfer aktif untuk item ini:
                        <strong>{t.qty} unit</strong> ke <strong>{t.toOutletName}</strong> (belum diterima)
                    </div>
                {/each}
            </div>
        {/if}

        <div class="form-control mb-3">
            <label class="label"><span class="label-text">Item</span></label>
            {#if prefilledItemId}
                <input
                    class="input input-bordered"
                    value={masterItems.find(i => i.id === itemId)?.name ?? itemId}
                    disabled
                />
            {:else}
                <select class="select select-bordered" bind:value={itemId}>
                    <option value="">-- Pilih item --</option>
                    {#each masterItems as item}
                        <option value={item.id}>{item.name} (Stok: {getDisplayStock(item.id, session.outletId)})</option>
                    {/each}
                </select>
            {/if}
            {#if errors.itemId}<span class="text-error text-xs mt-1">{errors.itemId}</span>{/if}
        </div>

        <div class="form-control mb-3">
            <label class="label"><span class="label-text">Jumlah</span></label>
            <input type="number" class="input input-bordered" bind:value={delta} min="1" />
            {#if errors.delta}<span class="text-error text-xs mt-1">{errors.delta}</span>{/if}
        </div>

        <div class="form-control mb-3">
            <label class="label"><span class="label-text">Alasan</span></label>
            <select class="select select-bordered" bind:value={reason}>
                <option value="">-- Pilih alasan --</option>
                {#each Object.entries(REASON_LABELS) as [key, label]}
                    <option value={key}>{label}</option>
                {/each}
            </select>
            {#if errors.reason}<span class="text-error text-xs mt-1">{errors.reason}</span>{/if}
        </div>

        {#if reason === 'transfer_input_error'}
            <div class="form-control mb-3">
                <label class="label"><span class="label-text">Transfer Ref</span></label>
                <input
                    type="text"
                    class="input input-bordered"
                    bind:value={transferRef}
                    placeholder="Contoh: TRF-00023"
                />
            </div>
        {/if}

        <div class="form-control mb-4">
            <label class="label"><span class="label-text">Catatan</span></label>
            <textarea
                class="textarea textarea-bordered"
                rows="3"
                bind:value={note}
                placeholder="Jelaskan alasan penyesuaian secara singkat..."
            />
            {#if errors.note}<span class="text-error text-xs mt-1">{errors.note}</span>{/if}
        </div>

        <div class="modal-action">
            <button class="btn btn-ghost" on:click={close}>Batal</button>
            <button class="btn btn-primary" on:click={submit} disabled={submitting}>
                {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
        </div>
    </div>
    <label class="modal-backdrop" on:click={close} />
</div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/library/components/outlet/pre-adjustment/PreAdjustmentModal.svelte
git commit -m "feat: add PreAdjustmentModal with transfer warning banner and Transfer Ref field"
```

---

## Task 5: Outlet Pre Adjustment Page

**Files:**
- Create: `src/routes/outlet/pre-adjustment/+page.svelte`

- [ ] **Step 1: Create the outlet page**

```svelte
<!-- src/routes/outlet/pre-adjustment/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte'
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import {
        getActivePreAdjustments,
        getAllPreAdjustments,
        revertPreAdjustment,
        markStaleAsUnresolved
    } from '$lib/mock/pre-adjustments'
    import { getMasterItems } from '$lib/mock/master-items'
    import { REASON_LABELS } from '$lib/types/PreAdjustment'
    import type { StockPreAdjustment } from '$lib/types/PreAdjustment'
    import PreAdjustmentModal from '$lib/components/outlet/pre-adjustment/PreAdjustmentModal.svelte'

    let activeTab: 'aktif' | 'riwayat' = 'aktif'
    let showCreateModal = false
    let revertTarget: StockPreAdjustment | null = null

    const session = get(auth)
    const masterItems = getMasterItems()

    let active: StockPreAdjustment[] = []
    let history: StockPreAdjustment[] = []

    // Aktif tab
    let searchAktif = ''
    let perPageAktif: 10 | 25 | 50 | 100 = 25
    let currentPageAktif = 1

    // Riwayat tab
    let searchRiwayat = ''
    let perPageRiwayat: 10 | 25 | 50 | 100 = 25
    let currentPageRiwayat = 1

    onMount(() => {
        markStaleAsUnresolved()
        refresh()
    })

    function refresh() {
        active = getActivePreAdjustments(session.outletId)
        history = getAllPreAdjustments(session.outletId).filter(pa => pa.status !== 'open')
    }

    function itemName(id: string): string {
        return masterItems.find(i => i.id === id)?.name ?? id
    }

    function ageLabel(createdAt: string): { label: string; stale: boolean } {
        const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000
        const stale = hours > 24
        if (hours < 1) return { label: '< 1 jam', stale }
        if (hours < 24) return { label: `${Math.floor(hours)} jam`, stale }
        return { label: `${Math.floor(hours / 24)} hari`, stale }
    }

    function doRevert() {
        if (!revertTarget) return
        revertPreAdjustment(revertTarget.id, session.userId)
        revertTarget = null
        refresh()
    }

    function reconciliationBadgeClass(status: string): string {
        if (status === 'reconciled') return 'badge-success'
        if (status === 'unresolved') return 'badge-error'
        return 'badge-ghost'
    }

    function reconciliationLabel(status: string): string {
        if (status === 'reconciled') return 'Rekonsiliasi'
        if (status === 'unresolved') return 'Belum Rekonsiliasi'
        return 'Menunggu'
    }

    function closedAt(pa: StockPreAdjustment): string {
        const raw = pa.revertedAt ?? pa.forceClosedAt
        return raw ? new Date(raw).toLocaleDateString('id-ID') : '-'
    }

    // Aktif tab reactive
    $: filteredAktif = active.filter(pa => {
        const q = searchAktif.toLowerCase()
        return (
            itemName(pa.itemId).toLowerCase().includes(q) ||
            REASON_LABELS[pa.reason].toLowerCase().includes(q) ||
            pa.note.toLowerCase().includes(q)
        )
    })
    $: totalPagesAktif = Math.max(1, Math.ceil(filteredAktif.length / perPageAktif))
    $: paginatedAktif = filteredAktif.slice((currentPageAktif - 1) * perPageAktif, currentPageAktif * perPageAktif)
    $: if (searchAktif !== undefined || perPageAktif) currentPageAktif = 1
    $: pageButtonsAktif = (() => {
        let start = Math.max(1, currentPageAktif - 2)
        let end = Math.min(totalPagesAktif, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()

    // Riwayat tab reactive
    $: filteredRiwayat = history.filter(pa => {
        const q = searchRiwayat.toLowerCase()
        return (
            itemName(pa.itemId).toLowerCase().includes(q) ||
            REASON_LABELS[pa.reason].toLowerCase().includes(q)
        )
    })
    $: totalPagesRiwayat = Math.max(1, Math.ceil(filteredRiwayat.length / perPageRiwayat))
    $: paginatedRiwayat = filteredRiwayat.slice((currentPageRiwayat - 1) * perPageRiwayat, currentPageRiwayat * perPageRiwayat)
    $: if (searchRiwayat !== undefined || perPageRiwayat) currentPageRiwayat = 1
    $: pageButtonsRiwayat = (() => {
        let start = Math.max(1, currentPageRiwayat - 2)
        let end = Math.min(totalPagesRiwayat, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()
</script>

<div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Pre Adjustment</h1>
        <button class="btn btn-primary" on:click={() => showCreateModal = true}>+ Buat Pre Adjustment</button>
    </div>

    <div class="tabs tabs-boxed mb-4">
        <button class="tab" class:tab-active={activeTab === 'aktif'} on:click={() => activeTab = 'aktif'}>
            Aktif ({active.length})
        </button>
        <button class="tab" class:tab-active={activeTab === 'riwayat'} on:click={() => activeTab = 'riwayat'}>
            Riwayat
        </button>
    </div>

    {#if activeTab === 'aktif'}
        <div class="flex items-center justify-between gap-4 mb-4">
            <input type="text" class="input input-bordered input-sm w-72" placeholder="Cari..." bind:value={searchAktif} />
            <select class="select select-bordered select-sm" bind:value={perPageAktif}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>

        {#if paginatedAktif.length === 0}
            <p class="text-base-content/50 text-sm">Tidak ada Pre Adjustment aktif.</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="table table-zebra w-full text-sm">
                    <thead>
                        <tr>
                            <th>Produk</th><th>Jumlah</th><th>Alasan</th><th>Catatan</th>
                            <th>Dibuat Oleh</th><th>Dibuat</th><th>Usia</th><th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedAktif as pa}
                            {@const age = ageLabel(pa.createdAt)}
                            <tr>
                                <td>{itemName(pa.itemId)}</td>
                                <td>+{pa.delta}</td>
                                <td>{REASON_LABELS[pa.reason]}</td>
                                <td class="max-w-xs truncate" title={pa.note}>{pa.note}</td>
                                <td>{pa.createdBy}</td>
                                <td>{new Date(pa.createdAt).toLocaleDateString('id-ID')}</td>
                                <td>
                                    <span class="badge badge-sm" class:badge-warning={age.stale} class:badge-ghost={!age.stale}>
                                        {age.label}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-xs btn-error" on:click={() => revertTarget = pa}>Revert</button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            {#if totalPagesAktif > 1}
                <div class="flex justify-center items-center gap-1 mt-4">
                    <button class="btn btn-sm btn-ghost" disabled={currentPageAktif === 1} on:click={() => currentPageAktif--}>‹</button>
                    {#each pageButtonsAktif as p}
                        <button class="btn btn-sm {p === currentPageAktif ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPageAktif = p}>{p}</button>
                    {/each}
                    <button class="btn btn-sm btn-ghost" disabled={currentPageAktif === totalPagesAktif} on:click={() => currentPageAktif++}>›</button>
                </div>
            {/if}
        {/if}

    {:else}
        <div class="flex items-center justify-between gap-4 mb-4">
            <input type="text" class="input input-bordered input-sm w-72" placeholder="Cari..." bind:value={searchRiwayat} />
            <select class="select select-bordered select-sm" bind:value={perPageRiwayat}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>

        {#if paginatedRiwayat.length === 0}
            <p class="text-base-content/50 text-sm">Belum ada riwayat Pre Adjustment.</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="table table-zebra w-full text-sm">
                    <thead>
                        <tr>
                            <th>Produk</th><th>Jumlah</th><th>Alasan</th><th>Dibuat</th>
                            <th>Dicabut Oleh</th><th>Dicabut</th><th>Status Rekonsiliasi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedRiwayat as pa}
                            <tr>
                                <td>{itemName(pa.itemId)}</td>
                                <td>+{pa.delta}</td>
                                <td>{REASON_LABELS[pa.reason]}</td>
                                <td>{new Date(pa.createdAt).toLocaleDateString('id-ID')}</td>
                                <td>{pa.revertedBy ?? pa.forceClosedBy ?? '-'}</td>
                                <td>{closedAt(pa)}</td>
                                <td>
                                    <span class="badge badge-sm {reconciliationBadgeClass(pa.reconciliationStatus)}">
                                        {reconciliationLabel(pa.reconciliationStatus)}
                                        {#if pa.reconciliationStatus === 'reconciled' && pa.reconciledPergerakanStokId}
                                            · {pa.reconciledPergerakanStokId}
                                        {/if}
                                    </span>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            {#if totalPagesRiwayat > 1}
                <div class="flex justify-center items-center gap-1 mt-4">
                    <button class="btn btn-sm btn-ghost" disabled={currentPageRiwayat === 1} on:click={() => currentPageRiwayat--}>‹</button>
                    {#each pageButtonsRiwayat as p}
                        <button class="btn btn-sm {p === currentPageRiwayat ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPageRiwayat = p}>{p}</button>
                    {/each}
                    <button class="btn btn-sm btn-ghost" disabled={currentPageRiwayat === totalPagesRiwayat} on:click={() => currentPageRiwayat++}>›</button>
                </div>
            {/if}
        {/if}
    {/if}
</div>

<PreAdjustmentModal bind:open={showCreateModal} onCreated={refresh} />

{#if revertTarget}
<div class="modal modal-open">
    <div class="modal-box max-w-sm backdrop-blur">
        <h3 class="font-bold text-lg mb-2">Konfirmasi Revert</h3>
        <p class="text-sm mb-4">
            Stok <strong>{itemName(revertTarget.itemId)}</strong> akan berkurang
            <strong>{revertTarget.delta}</strong> setelah Pre Adjustment ini dicabut. Lanjutkan?
        </p>
        <div class="modal-action">
            <button class="btn btn-ghost" on:click={() => revertTarget = null}>Batal</button>
            <button class="btn btn-error" on:click={doRevert}>Ya, Revert</button>
        </div>
    </div>
    <label class="modal-backdrop" on:click={() => revertTarget = null} />
</div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/outlet/pre-adjustment/+page.svelte
git commit -m "feat: add outlet Pre Adjustment page with search, pagination, Aktif and Riwayat tabs"
```

---

## Task 6: Admin Adjustment Page

**Files:**
- Create: `src/routes/outlet/adjustment/+page.svelte`

- [ ] **Step 1: Create the admin adjustment page**

```svelte
<!-- src/routes/outlet/adjustment/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte'
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import {
        getActivePreAdjustments,
        getAllPreAdjustments,
        forceClosePreAdjustment,
        markStaleAsUnresolved
    } from '$lib/mock/pre-adjustments'
    import { getMasterItems } from '$lib/mock/master-items'
    import { REASON_LABELS } from '$lib/types/PreAdjustment'
    import type { StockPreAdjustment } from '$lib/types/PreAdjustment'
    import { mockOutlets } from '$lib/mock/outlets'
    import { goto } from '$app/navigation'

    const session = get(auth)
    if (session.role !== 'admin') goto('/outlet/pre-adjustment')

    let activeTab: 'aktif' | 'riwayat' = 'aktif'
    let active: StockPreAdjustment[] = []
    let history: StockPreAdjustment[] = []
    let forceCloseTarget: StockPreAdjustment | null = null
    let forceCloseNote = ''
    let forceCloseError = ''

    const masterItems = getMasterItems()

    // Aktif tab
    let searchAktif = ''
    let perPageAktif: 10 | 25 | 50 | 100 = 25
    let currentPageAktif = 1

    // Riwayat tab
    let searchRiwayat = ''
    let statusFilter: 'semua' | 'reverted' | 'force_closed' | 'reconciled' | 'unresolved' = 'semua'
    let perPageRiwayat: 10 | 25 | 50 | 100 = 25
    let currentPageRiwayat = 1

    onMount(() => {
        markStaleAsUnresolved()
        refresh()
    })

    function refresh() {
        active = getActivePreAdjustments()
        history = getAllPreAdjustments().filter(pa => pa.status !== 'open')
    }

    function itemName(id: string): string {
        return masterItems.find(i => i.id === id)?.name ?? id
    }

    function outletName(id: string): string {
        return mockOutlets.find((o: { id: string; name: string }) => o.id === id)?.name ?? id
    }

    function ageLabel(createdAt: string): { label: string; stale: boolean } {
        const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000
        const stale = hours > 24
        if (hours < 1) return { label: '< 1 jam', stale }
        if (hours < 24) return { label: `${Math.floor(hours)} jam`, stale }
        return { label: `${Math.floor(hours / 24)} hari`, stale }
    }

    function openForceClose(pa: StockPreAdjustment) {
        forceCloseTarget = pa
        forceCloseNote = ''
        forceCloseError = ''
    }

    function doForceClose() {
        if (!forceCloseNote.trim()) { forceCloseError = 'Catatan wajib diisi'; return }
        forceClosePreAdjustment(forceCloseTarget!.id, session.userId, forceCloseNote.trim())
        forceCloseTarget = null
        refresh()
    }

    function closureBadgeClass(status: string): string {
        return status === 'force_closed' ? 'badge-warning' : 'badge-info'
    }

    function closureLabel(status: string): string {
        return status === 'force_closed' ? 'Force Closed' : 'Reverted'
    }

    function reconciliationBadgeClass(status: string): string {
        if (status === 'reconciled') return 'badge-success'
        if (status === 'unresolved') return 'badge-error'
        return 'badge-ghost'
    }

    function reconciliationLabel(status: string): string {
        if (status === 'reconciled') return 'Reconciled'
        if (status === 'unresolved') return 'Unresolved'
        return 'Pending'
    }

    function closedAt(pa: StockPreAdjustment): string {
        const raw = pa.revertedAt ?? pa.forceClosedAt
        return raw ? new Date(raw).toLocaleDateString('id-ID') : '-'
    }

    // Aktif tab reactive
    $: filteredAktif = active.filter(pa => {
        const q = searchAktif.toLowerCase()
        return (
            outletName(pa.outletId).toLowerCase().includes(q) ||
            itemName(pa.itemId).toLowerCase().includes(q) ||
            pa.note.toLowerCase().includes(q)
        )
    })
    $: totalPagesAktif = Math.max(1, Math.ceil(filteredAktif.length / perPageAktif))
    $: paginatedAktif = filteredAktif.slice((currentPageAktif - 1) * perPageAktif, currentPageAktif * perPageAktif)
    $: if (searchAktif !== undefined || perPageAktif) currentPageAktif = 1
    $: pageButtonsAktif = (() => {
        let start = Math.max(1, currentPageAktif - 2)
        let end = Math.min(totalPagesAktif, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()

    // Riwayat tab reactive
    $: filteredRiwayat = history.filter(pa => {
        const q = searchRiwayat.toLowerCase()
        const matchesSearch = (
            outletName(pa.outletId).toLowerCase().includes(q) ||
            itemName(pa.itemId).toLowerCase().includes(q) ||
            REASON_LABELS[pa.reason].toLowerCase().includes(q)
        )
        const matchesStatus = statusFilter === 'semua' ? true
            : statusFilter === 'reconciled' ? pa.reconciliationStatus === 'reconciled'
            : statusFilter === 'unresolved' ? pa.reconciliationStatus === 'unresolved'
            : pa.status === statusFilter
        return matchesSearch && matchesStatus
    })
    $: totalPagesRiwayat = Math.max(1, Math.ceil(filteredRiwayat.length / perPageRiwayat))
    $: paginatedRiwayat = filteredRiwayat.slice((currentPageRiwayat - 1) * perPageRiwayat, currentPageRiwayat * perPageRiwayat)
    $: if (searchRiwayat !== undefined || perPageRiwayat || statusFilter) currentPageRiwayat = 1
    $: pageButtonsRiwayat = (() => {
        let start = Math.max(1, currentPageRiwayat - 2)
        let end = Math.min(totalPagesRiwayat, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()
</script>

<div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Adjustment</h1>

    <div class="tabs tabs-boxed mb-4">
        <button class="tab" class:tab-active={activeTab === 'aktif'} on:click={() => activeTab = 'aktif'}>
            Aktif ({active.length})
        </button>
        <button class="tab" class:tab-active={activeTab === 'riwayat'} on:click={() => activeTab = 'riwayat'}>
            Riwayat
        </button>
    </div>

    {#if activeTab === 'aktif'}
        <div class="flex items-center justify-between gap-4 mb-4">
            <input type="text" class="input input-bordered input-sm w-72" placeholder="Cari outlet, produk, catatan..." bind:value={searchAktif} />
            <select class="select select-bordered select-sm" bind:value={perPageAktif}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>

        {#if paginatedAktif.length === 0}
            <p class="text-base-content/50 text-sm">Tidak ada Pre Adjustment aktif di semua outlet.</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="table table-zebra w-full text-sm">
                    <thead>
                        <tr>
                            <th>Outlet</th><th>Produk</th><th>Jumlah</th><th>Alasan</th>
                            <th>Catatan</th><th>Dibuat Oleh</th><th>Usia</th><th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedAktif as pa}
                            {@const age = ageLabel(pa.createdAt)}
                            <tr class:bg-warning={age.stale} class:bg-opacity-10={age.stale}>
                                <td>{outletName(pa.outletId)}</td>
                                <td>{itemName(pa.itemId)}</td>
                                <td>+{pa.delta}</td>
                                <td>{REASON_LABELS[pa.reason]}</td>
                                <td class="max-w-xs truncate" title={pa.note}>{pa.note}</td>
                                <td>{pa.createdBy}</td>
                                <td>
                                    <span class="badge badge-sm" class:badge-warning={age.stale} class:badge-ghost={!age.stale}>
                                        {age.label}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-xs btn-warning" on:click={() => openForceClose(pa)}>Force Close</button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            {#if totalPagesAktif > 1}
                <div class="flex justify-center items-center gap-1 mt-4">
                    <button class="btn btn-sm btn-ghost" disabled={currentPageAktif === 1} on:click={() => currentPageAktif--}>‹</button>
                    {#each pageButtonsAktif as p}
                        <button class="btn btn-sm {p === currentPageAktif ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPageAktif = p}>{p}</button>
                    {/each}
                    <button class="btn btn-sm btn-ghost" disabled={currentPageAktif === totalPagesAktif} on:click={() => currentPageAktif++}>›</button>
                </div>
            {/if}
        {/if}

    {:else}
        <div class="flex flex-wrap items-center gap-4 mb-4">
            <input type="text" class="input input-bordered input-sm w-72" placeholder="Cari outlet, produk, alasan..." bind:value={searchRiwayat} />
            <select class="select select-bordered select-sm" bind:value={statusFilter}>
                <option value="semua">Semua</option>
                <option value="reverted">Reverted</option>
                <option value="force_closed">Force Closed</option>
                <option value="reconciled">Reconciled</option>
                <option value="unresolved">Unresolved</option>
            </select>
            <select class="select select-bordered select-sm" bind:value={perPageRiwayat}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>

        {#if paginatedRiwayat.length === 0}
            <p class="text-base-content/50 text-sm">Belum ada riwayat Adjustment.</p>
        {:else}
            <div class="overflow-x-auto">
                <table class="table table-zebra w-full text-sm">
                    <thead>
                        <tr>
                            <th>Outlet</th><th>Produk</th><th>Jumlah</th><th>Alasan</th>
                            <th>Dibuat Oleh</th><th>Dicabut/Ditutup</th>
                            <th>Tipe Penutupan</th><th>Rekonsiliasi</th><th>Transfer Ref</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each paginatedRiwayat as pa}
                            <tr>
                                <td>{outletName(pa.outletId)}</td>
                                <td>{itemName(pa.itemId)}</td>
                                <td>+{pa.delta}</td>
                                <td>{REASON_LABELS[pa.reason]}</td>
                                <td>{pa.createdBy}</td>
                                <td>{closedAt(pa)}</td>
                                <td>
                                    <span class="badge badge-sm {closureBadgeClass(pa.status)}">
                                        {closureLabel(pa.status)}
                                    </span>
                                </td>
                                <td>
                                    <span class="badge badge-sm {reconciliationBadgeClass(pa.reconciliationStatus)}">
                                        {reconciliationLabel(pa.reconciliationStatus)}
                                        {#if pa.reconciliationStatus === 'reconciled' && pa.reconciledPergerakanStokId}
                                            · {pa.reconciledPergerakanStokId}
                                        {/if}
                                    </span>
                                </td>
                                <td>
                                    {#if pa.transferId}
                                        <span class="badge badge-sm badge-outline">{pa.transferId}</span>
                                    {:else}
                                        <span class="text-base-content/40">—</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            {#if totalPagesRiwayat > 1}
                <div class="flex justify-center items-center gap-1 mt-4">
                    <button class="btn btn-sm btn-ghost" disabled={currentPageRiwayat === 1} on:click={() => currentPageRiwayat--}>‹</button>
                    {#each pageButtonsRiwayat as p}
                        <button class="btn btn-sm {p === currentPageRiwayat ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPageRiwayat = p}>{p}</button>
                    {/each}
                    <button class="btn btn-sm btn-ghost" disabled={currentPageRiwayat === totalPagesRiwayat} on:click={() => currentPageRiwayat++}>›</button>
                </div>
            {/if}
        {/if}
    {/if}
</div>

{#if forceCloseTarget}
<div class="modal modal-open">
    <div class="modal-box max-w-sm backdrop-blur">
        <h3 class="font-bold text-lg mb-2">Force Close Adjustment</h3>
        <p class="text-sm mb-3">
            Menutup paksa Pre Adjustment
            <strong>{itemName(forceCloseTarget.itemId)}</strong> (+{forceCloseTarget.delta})
            dari outlet <strong>{outletName(forceCloseTarget.outletId)}</strong>.
        </p>
        <div class="form-control mb-2">
            <label class="label"><span class="label-text">Alasan Force Close</span></label>
            <textarea
                class="textarea textarea-bordered"
                rows="3"
                bind:value={forceCloseNote}
                placeholder="Jelaskan alasan menutup paksa Pre Adjustment ini..."
            />
            {#if forceCloseError}<span class="text-error text-xs mt-1">{forceCloseError}</span>{/if}
        </div>
        <div class="modal-action">
            <button class="btn btn-ghost" on:click={() => forceCloseTarget = null}>Batal</button>
            <button class="btn btn-warning" on:click={doForceClose}>Force Close</button>
        </div>
    </div>
    <label class="modal-backdrop" on:click={() => forceCloseTarget = null} />
</div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/outlet/adjustment/+page.svelte
git commit -m "feat: add admin Adjustment dashboard at /outlet/adjustment/ with force-close and reconciliation"
```

---

## Task 7: POS Integration (Retail & Order)

**Files:**
- Modify: `src/routes/outlet/retail/+page.svelte`
- Modify: `src/library/components/outlet/retail/CartSection.svelte`
- Modify: `src/library/components/outlet/retail/Order.svelte` (create stub if absent)

- [ ] **Step 1: Add Pre Adjustment quick button to the retail page**

In `src/routes/outlet/retail/+page.svelte`, add these imports inside the `<script>` block:

```typescript
import { getDisplayStock } from '$lib/mock/master-items'
import { getActivePreAdjustments } from '$lib/mock/pre-adjustments'
import PreAdjustmentModal from '$lib/components/outlet/pre-adjustment/PreAdjustmentModal.svelte'

let showPreAdjustModal = false
let preAdjustItemId = ''
```

Find the search results list. Replace every direct `item.stock` reference in that section with `getDisplayStock(item.id, $auth.outletId)`. After each item row in the list, add the conditional quick-access button:

```svelte
{#each searchResults as item}
    {@const displayStock = getDisplayStock(item.id, $auth.outletId)}
    <!-- existing item row markup — replace item.stock with displayStock -->
    {#if displayStock === 0}
        <div class="flex justify-end px-2 pb-2">
            <button
                class="btn btn-xs btn-outline btn-warning"
                on:click|stopPropagation={() => { preAdjustItemId = item.id; showPreAdjustModal = true }}
            >
                Pre Adjustment
            </button>
        </div>
    {/if}
{/each}

<PreAdjustmentModal
    bind:open={showPreAdjustModal}
    prefilledItemId={preAdjustItemId}
    onCreated={() => { preAdjustItemId = ''; searchResults = [...searchResults] }}
/>
```

- [ ] **Step 2: Update CartSection to use `getDisplayStock` for qty ceiling**

In `src/library/components/outlet/retail/CartSection.svelte`, add imports:

```typescript
import { getDisplayStock } from '$lib/mock/master-items'
import { get } from 'svelte/store'
import { auth } from '$lib/stores/auth'
```

Find the qty increment handler and replace the `item.stock` ceiling:

```typescript
function increaseQty(item: RetailCartItem) {
    const session = get(auth)
    const max = getDisplayStock(item.id, session.outletId)
    if (item.qty >= max) return
    item.qty += 1
    cart.update(c => c)
}
```

Also replace any inline `item.stock` references in cart row markup with `getDisplayStock(item.id, $auth.outletId)`.

- [ ] **Step 3: Update Order.svelte to show `getDisplayStock` per outlet with active-adjustment badge**

In `src/library/components/outlet/retail/Order.svelte`, add imports:

```typescript
import { getDisplayStock } from '$lib/mock/master-items'
import { getActivePreAdjustments } from '$lib/mock/pre-adjustments'
```

In the multi-outlet stock comparison table, replace raw stock values:

```svelte
{#each outlets as outlet}
    {@const displayStock = getDisplayStock(selectedItem.id, outlet.id)}
    {@const hasActiveAdj = getActivePreAdjustments(outlet.id).some(pa => pa.itemId === selectedItem.id)}
    <td class="text-center">
        {displayStock}
        {#if hasActiveAdj}
            <span class="badge badge-xs badge-warning ml-1" title="Termasuk Pre Adjustment aktif">PA</span>
        {/if}
    </td>
{/each}
```

If `Order.svelte` does not exist yet, create a stub with the imports above and `<p>Order mode — coming soon</p>` body.

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/retail/+page.svelte \
        src/library/components/outlet/retail/CartSection.svelte \
        src/library/components/outlet/retail/Order.svelte
git commit -m "feat: integrate getDisplayStock into POS retail page, cart validation, and order view"
```

---

## Task 8: Pergerakan Stok Reconciliation Hook

**Files:**
- Modify: `src/library/mock/pergerakan-stok.ts`

- [ ] **Step 1: Add `checkReconciliation` call inside `createStokMasuk`**

In `src/library/mock/pergerakan-stok.ts`, add the import at the top:

```typescript
import { checkReconciliation } from '$lib/mock/pre-adjustments'
```

Inside `createStokMasuk()`, after all `logStockMovement()` calls have applied the masuk deltas to `OutletStock.stock`, call `checkReconciliation` once per line item:

```typescript
export function createStokMasuk(payload: CreateStokMasukPayload, userId: string, outletId: string): PergerakanStok {
    // ... existing: build PergerakanStok record with IM-XXXXX id ...
    // ... existing: for each item in payload.items, call logStockMovement() which updates OutletStock.stock ...

    // After all logStockMovement() calls, trigger reconciliation per line item:
    for (const line of payload.items) {
        checkReconciliation(newRecord.id, outletId, line.itemId)
    }

    return newRecord
}
```

`checkReconciliation(stokMasukId, outletId, itemId)` reads `OutletStock.stock` (post-masuk value already updated by `logStockMovement()`). If `stock >= 0`, it marks all pending reverted/force-closed pre-adjustments for that item/outlet as `reconciled` and sets `reconciledPergerakanStokId = stokMasukId`.

- [ ] **Step 2: Commit**

```bash
git add src/library/mock/pergerakan-stok.ts
git commit -m "feat: wire checkReconciliation into createStokMasuk in pergerakan-stok mock"
```
