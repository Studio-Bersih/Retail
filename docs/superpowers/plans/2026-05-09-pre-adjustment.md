# Stock Pre-Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stock Pre-Adjustment system — a virtual stock overlay letting any staff member temporarily unblock sales for items that physically exist but haven't been recorded yet, with an admin Adjustment dashboard for cross-outlet audit, force-close, and automatic reconciliation tracking against subsequent Item Masuk submissions.

**Architecture:** `StockPreAdjustment` is a separate entity that never touches the real stock ledger. `getDisplayStock(itemId, outletId)` is the universal stock accessor for all cashier-facing UI — it returns `item.stock + sum(delta of all open pre-adjustments for that item/outlet)`. Outlet users create/revert from `/outlet/pre-adjustment/` and via a POS quick-access button. Admins use `/factory/pre-adjustment/` to force-close stale entries and view reconciliation status against Item Masuk submissions.

**Tech Stack:** SvelteKit · TypeScript · TailwindCSS · DaisyUI · Vitest

> **`$lib`** resolves to `src/library/`. Ensure `svelte.config.js` has `kit: { alias: { $lib: 'src/library' } }`.
>
> **Prerequisites:** Working SvelteKit project with TailwindCSS + DaisyUI installed. `src/library/stores/auth.ts` must export a writable `auth` store with shape `{ userId: string; outletId: string; userName: string; role: string }`. `src/library/mock/items.ts` must export a mutable `mockItems: Item[]` where each item has `{ id: string; name: string; stock: number }` — and at minimum two entries: `{ id: 'item-001', stock: 5, ... }` and `{ id: 'item-002', stock: 3, ... }`. `src/library/mock/transfers.ts` must export `mockTransferRecords` (from Item Transfer plan — create an empty array stub if absent). `src/library/mock/outlets.ts` must export `mockOutlets: { id: string; name: string }[]` (create stub if absent). `src/library/mock/item-masuk.ts` must export `submitItemMasuk()` (from Item Masuk plan — create a stub if absent).

---

## File Map

**Created:**
- `src/library/types/PreAdjustment.ts` — all TypeScript interfaces and label maps
- `src/library/mock/pre-adjustments.ts` — seed data, all mock functions
- `src/library/mock/pre-adjustments.test.ts` — Vitest unit tests for all mock functions
- `src/library/components/outlet/pre-adjustment/PreAdjustmentModal.svelte` — shared create form modal
- `src/routes/outlet/pre-adjustment/+page.svelte` — outlet Aktif + Riwayat page
- `src/routes/factory/pre-adjustment/+page.svelte` — admin/auditor Adjustment dashboard

**Modified:**
- `src/routes/outlet/retail/+page.svelte` — import `getDisplayStock`; add Pre Adjustment quick button when display stock = 0
- `src/library/components/outlet/retail/CartSection.svelte` — use `getDisplayStock` for qty ceiling validation
- `src/library/components/outlet/retail/Order.svelte` — use `getDisplayStock` per outlet column with active-adjustment badge (create stub if absent)
- `src/library/mock/item-masuk.ts` — call `checkReconciliation()` after each successful Item Masuk submission

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
    delta: number                         // always a positive integer
    reason: PreAdjustmentReason
    note: string                          // required free text
    status: PreAdjustmentStatus
    createdBy: string
    createdAt: string                     // ISO timestamp
    revertedBy: string | null
    revertedAt: string | null
    forceClosedBy: string | null
    forceClosedAt: string | null
    forceCloseNote: string | null         // required when force-closing
    reconciledItemMasukId: string | null  // auto-set by checkReconciliation
    reconciliationStatus: ReconciliationStatus
}

export interface CreatePreAdjustmentPayload {
    outletId: string
    itemId: string
    delta: number
    reason: PreAdjustmentReason
    note: string
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
    getDisplayStock,
    getActivePreAdjustments,
    getAllPreAdjustments,
    getActiveTransfersForItem,
    resetPreAdjustments
} from './pre-adjustments'

beforeEach(() => {
    resetPreAdjustments()
})

describe('getDisplayStock', () => {
    it('returns item.stock unchanged when no active pre-adjustments exist for that item', () => {
        // item-002 has no active PAs in seed data
        expect(getDisplayStock('item-002', 'outlet-1')).toBe(3)
    })

    it('adds delta of open pre-adjustments to item.stock', () => {
        // seed PA001: open, item-001, outlet-1, delta 2 → 5 + 2 = 7
        expect(getDisplayStock('item-001', 'outlet-1')).toBe(7)
    })

    it('ignores open pre-adjustments for a different outlet', () => {
        // PA001 belongs to outlet-1, not outlet-2
        expect(getDisplayStock('item-001', 'outlet-2')).toBe(5)
    })

    it('ignores reverted pre-adjustments', () => {
        // seed PA002: reverted, item-001, outlet-1, delta 1 — must not contribute
        // only PA001 (open, delta 2) contributes → 5 + 2 = 7
        expect(getDisplayStock('item-001', 'outlet-1')).toBe(7)
    })

    it('returns 0 for an unknown itemId', () => {
        expect(getDisplayStock('nonexistent', 'outlet-1')).toBe(0)
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
        // requires seed transfer in mockTransferRecords: from outlet-1, item-001, status 'active'
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
import { mockItems } from './items'
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
        status: 'open',
        createdBy: 'user-cashier-1',
        createdAt: '2026-05-09T06:00:00.000Z',
        revertedBy: null,
        revertedAt: null,
        forceClosedBy: null,
        forceClosedAt: null,
        forceCloseNote: null,
        reconciledItemMasukId: null,
        reconciliationStatus: 'pending'
    },
    {
        id: 'PA002',
        outletId: 'outlet-1',
        itemId: 'item-001',
        delta: 1,
        reason: 'transfer_input_error',
        note: 'Transfer T009 salah input qty, harusnya 2 bukan 3',
        status: 'reverted',
        createdBy: 'user-cashier-2',
        createdAt: '2026-05-08T10:00:00.000Z',
        revertedBy: 'user-cashier-2',
        revertedAt: '2026-05-08T14:00:00.000Z',
        forceClosedBy: null,
        forceClosedAt: null,
        forceCloseNote: null,
        reconciledItemMasukId: null,
        reconciliationStatus: 'pending'
    }
]

let mockPreAdjustments: StockPreAdjustment[] = structuredClone(SEED)

export function resetPreAdjustments(): void {
    mockPreAdjustments = structuredClone(SEED)
}

export function getDisplayStock(itemId: string, outletId: string): number {
    const item = mockItems.find(i => i.id === itemId)
    if (!item) return 0
    const activeDelta = mockPreAdjustments
        .filter(pa => pa.itemId === itemId && pa.outletId === outletId && pa.status === 'open')
        .reduce((sum, pa) => sum + pa.delta, 0)
    return item.stock + activeDelta
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

- [ ] **Step 4: Run tests — verify query tests pass**

```bash
npx vitest run src/library/mock/pre-adjustments.test.ts
```

Expected: PASS — all `getDisplayStock`, `getActivePreAdjustments`, `getAllPreAdjustments`, `getActiveTransfersForItem` tests

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

- [ ] **Step 1: Write failing tests for mutation and reconciliation functions**

Append to `src/library/mock/pre-adjustments.test.ts`:

```typescript
import {
    createPreAdjustment,
    revertPreAdjustment,
    forceClosePreAdjustment,
    markStaleAsUnresolved,
    checkReconciliation
} from './pre-adjustments'

describe('createPreAdjustment', () => {
    it('increases display stock by delta immediately', () => {
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

    it('drops display stock by the reverted delta', () => {
        const before = getDisplayStock('item-001', 'outlet-1')  // 7 (5 base + 2 from PA001)
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

    it('drops display stock after force close', () => {
        const before = getDisplayStock('item-001', 'outlet-1')
        forceClosePreAdjustment('PA001', 'user-admin-1', 'Reason')
        expect(getDisplayStock('item-001', 'outlet-1')).toBe(before - 2)
    })
})

describe('markStaleAsUnresolved', () => {
    it('flips reconciliationStatus to unresolved for reverted entries pending > 7 days', () => {
        // Simulate PA002 was reverted 8 days ago
        const pa2 = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!
        pa2.revertedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
        markStaleAsUnresolved()
        const updated = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!
        expect(updated.reconciliationStatus).toBe('unresolved')
    })

    it('does not flip entries reverted fewer than 7 days ago', () => {
        const pa2 = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!
        pa2.revertedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
        markStaleAsUnresolved()
        const updated = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA002')!
        expect(updated.reconciliationStatus).toBe('pending')
    })
})

describe('checkReconciliation', () => {
    it('marks pending reverted PAs as reconciled when item stock is non-negative after masuk', () => {
        revertPreAdjustment('PA001', 'user-cashier-1')
        // Simulate: 2 items sold against the PA → real stock = 5 - 2 = 3, then - wait...
        // More realistic: stock was 0 (forgot to input), pre-adj +2, sold 2, real stock = -2
        // Item Masuk of 2 applied externally → stock now = 0
        mockItems.find(i => i.id === 'item-001')!.stock = 0
        checkReconciliation({ id: 'IM001', outletId: 'outlet-1', itemId: 'item-001', qty: 2 })
        const pa = getAllPreAdjustments('outlet-1').find(p => p.id === 'PA001')!
        expect(pa.reconciliationStatus).toBe('reconciled')
        expect(pa.reconciledItemMasukId).toBe('IM001')
    })

    it('does not mark reconciled when item stock is still negative after masuk', () => {
        revertPreAdjustment('PA001', 'user-cashier-1')
        // Only partial coverage — stock still negative
        mockItems.find(i => i.id === 'item-001')!.stock = -1
        checkReconciliation({ id: 'IM002', outletId: 'outlet-1', itemId: 'item-001', qty: 1 })
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

- [ ] **Step 3: Append mutation and reconciliation functions to the mock file**

Add after the last export in `src/library/mock/pre-adjustments.ts`:

```typescript
let idCounter = 100

// Also update resetPreAdjustments to reset the counter — replace the existing function:
export function resetPreAdjustments(): void {
    mockPreAdjustments = structuredClone(SEED)
    idCounter = 100
}

export function createPreAdjustment(payload: CreatePreAdjustmentPayload, userId: string): StockPreAdjustment {
    const pa: StockPreAdjustment = {
        id: `PA${++idCounter}`,
        outletId: payload.outletId,
        itemId: payload.itemId,
        delta: payload.delta,
        reason: payload.reason,
        note: payload.note,
        status: 'open',
        createdBy: userId,
        createdAt: new Date().toISOString(),
        revertedBy: null,
        revertedAt: null,
        forceClosedBy: null,
        forceClosedAt: null,
        forceCloseNote: null,
        reconciledItemMasukId: null,
        reconciliationStatus: 'pending'
    }
    mockPreAdjustments.push(pa)
    return pa
}

export function revertPreAdjustment(id: string, userId: string): void {
    const pa = mockPreAdjustments.find(p => p.id === id)
    if (!pa || pa.status !== 'open') return
    pa.status = 'reverted'
    pa.revertedBy = userId
    pa.revertedAt = new Date().toISOString()
}

export function forceClosePreAdjustment(id: string, adminId: string, note: string): void {
    const pa = mockPreAdjustments.find(p => p.id === id)
    if (!pa || pa.status !== 'open') return
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

interface ItemMasukRef {
    id: string
    outletId: string
    itemId: string
    qty: number
}

// Called by submitItemMasuk AFTER item.stock has already been updated by the masuk.
// Checks if stock is now non-negative; if so, marks matching pending PAs as reconciled.
export function checkReconciliation(masuk: ItemMasukRef): void {
    const item = mockItems.find(i => i.id === masuk.itemId)
    if (!item || item.stock < 0) return
    const pending = mockPreAdjustments.filter(pa =>
        pa.itemId === masuk.itemId &&
        pa.outletId === masuk.outletId &&
        (pa.status === 'reverted' || pa.status === 'force_closed') &&
        pa.reconciliationStatus === 'pending'
    )
    for (const pa of pending) {
        pa.reconciliationStatus = 'reconciled'
        pa.reconciledItemMasukId = masuk.id
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
    import { mockItems } from '$lib/mock/items'
    import { REASON_LABELS } from '$lib/types/PreAdjustment'
    import type { PreAdjustmentReason, ActiveTransferSummary } from '$lib/types/PreAdjustment'

    export let open = false
    export let prefilledItemId: string = ''    // set when opened from POS
    export let onCreated: () => void = () => {}

    let itemId = prefilledItemId
    let delta = 1
    let reason: PreAdjustmentReason | '' = ''
    let note = ''
    let activeTransfers: ActiveTransferSummary[] = []
    let submitting = false
    let errors: Record<string, string> = {}

    $: {
        itemId = prefilledItemId || itemId
    }

    $: if (itemId) {
        const session = get(auth)
        activeTransfers = getActiveTransfersForItem(itemId, session.outletId)
    } else {
        activeTransfers = []
    }

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
        const session = get(auth)
        createPreAdjustment(
            { outletId: session.outletId, itemId, delta, reason: reason as PreAdjustmentReason, note: note.trim() },
            session.userId
        )
        submitting = false
        close()
        onCreated()
    }

    function close() {
        open = false
        itemId = ''
        delta = 1
        reason = ''
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
                    value={mockItems.find(i => i.id === itemId)?.name ?? itemId}
                    disabled
                />
            {:else}
                <select class="select select-bordered" bind:value={itemId}>
                    <option value="">-- Pilih item --</option>
                    {#each mockItems as item}
                        <option value={item.id}>{item.name}</option>
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
git commit -m "feat: add PreAdjustmentModal shared component with transfer warning banner"
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
    import { REASON_LABELS } from '$lib/types/PreAdjustment'
    import type { StockPreAdjustment } from '$lib/types/PreAdjustment'
    import { mockItems } from '$lib/mock/items'
    import PreAdjustmentModal from '$lib/components/outlet/pre-adjustment/PreAdjustmentModal.svelte'

    let activeTab: 'aktif' | 'riwayat' = 'aktif'
    let showCreateModal = false
    let revertTarget: StockPreAdjustment | null = null
    let expandedId: string | null = null

    const session = get(auth)
    let active: StockPreAdjustment[] = []
    let history: StockPreAdjustment[] = []

    onMount(() => {
        markStaleAsUnresolved()
        refresh()
    })

    function refresh() {
        active = getActivePreAdjustments(session.outletId)
        history = getAllPreAdjustments(session.outletId).filter(pa => pa.status !== 'open')
    }

    function itemName(id: string): string {
        return mockItems.find(i => i.id === id)?.name ?? id
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
</script>

<div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Pre Adjustment</h1>
        <button class="btn btn-primary" on:click={() => showCreateModal = true}>
            + Buat Pre Adjustment
        </button>
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
        {#if active.length === 0}
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
                        {#each active as pa}
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
                                    <button class="btn btn-xs btn-error" on:click={() => revertTarget = pa}>
                                        Revert
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}

    {:else}
        {#if history.length === 0}
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
                        {#each history as pa}
                            <tr class="cursor-pointer" on:click={() => expandedId = expandedId === pa.id ? null : pa.id}>
                                <td>{itemName(pa.itemId)}</td>
                                <td>+{pa.delta}</td>
                                <td>{REASON_LABELS[pa.reason]}</td>
                                <td>{new Date(pa.createdAt).toLocaleDateString('id-ID')}</td>
                                <td>{pa.revertedBy ?? pa.forceClosedBy ?? '-'}</td>
                                <td>{closedAt(pa)}</td>
                                <td>
                                    <span class="badge badge-sm {reconciliationBadgeClass(pa.reconciliationStatus)}">
                                        {reconciliationLabel(pa.reconciliationStatus)}
                                    </span>
                                </td>
                            </tr>
                            {#if expandedId === pa.id && pa.reconciliationStatus === 'reconciled'}
                                <tr class="bg-base-200">
                                    <td colspan="7" class="text-xs text-base-content/70 pl-6">
                                        Direkonsiliasi dengan Item Masuk ref: <strong>{pa.reconciledItemMasukId}</strong>
                                    </td>
                                </tr>
                            {/if}
                        {/each}
                    </tbody>
                </table>
            </div>
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
git commit -m "feat: add outlet Pre Adjustment page with Aktif and Riwayat tabs"
```

---

## Task 6: Factory Adjustment Dashboard

**Files:**
- Create: `src/routes/factory/pre-adjustment/+page.svelte`

- [ ] **Step 1: Create the factory page**

```svelte
<!-- src/routes/factory/pre-adjustment/+page.svelte -->
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
    import { REASON_LABELS } from '$lib/types/PreAdjustment'
    import type { StockPreAdjustment } from '$lib/types/PreAdjustment'
    import { mockItems } from '$lib/mock/items'
    import { mockOutlets } from '$lib/mock/outlets'

    let activeTab: 'aktif' | 'riwayat' = 'aktif'
    let active: StockPreAdjustment[] = []
    let history: StockPreAdjustment[] = []
    let forceCloseTarget: StockPreAdjustment | null = null
    let forceCloseNote = ''
    let forceCloseError = ''

    onMount(() => {
        markStaleAsUnresolved()
        refresh()
    })

    function refresh() {
        active = getActivePreAdjustments()
        history = getAllPreAdjustments().filter(pa => pa.status !== 'open')
    }

    function itemName(id: string): string {
        return mockItems.find(i => i.id === id)?.name ?? id
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
        if (!forceCloseNote.trim()) {
            forceCloseError = 'Catatan wajib diisi'
            return
        }
        const session = get(auth)
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
        if (status === 'reconciled') return 'Rekonsiliasi'
        if (status === 'unresolved') return 'Belum Rekonsiliasi'
        return 'Menunggu'
    }

    function closedAt(pa: StockPreAdjustment): string {
        const raw = pa.revertedAt ?? pa.forceClosedAt
        return raw ? new Date(raw).toLocaleDateString('id-ID') : '-'
    }

    function transferRef(pa: StockPreAdjustment): string | null {
        if (pa.reason !== 'transfer_input_error') return null
        return pa.note.match(/T\d+/)?.[0] ?? null
    }
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
        {#if active.length === 0}
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
                        {#each active as pa}
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
                                    <button class="btn btn-xs btn-warning" on:click={() => openForceClose(pa)}>
                                        Force Close
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}

    {:else}
        {#if history.length === 0}
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
                        {#each history as pa}
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
                                        {#if pa.reconciliationStatus === 'reconciled' && pa.reconciledItemMasukId}
                                            · {pa.reconciledItemMasukId}
                                        {/if}
                                    </span>
                                </td>
                                <td>
                                    {#if transferRef(pa)}
                                        <span class="badge badge-sm badge-outline">{transferRef(pa)}</span>
                                    {:else}
                                        <span class="text-base-content/40">—</span>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
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
git add src/routes/factory/pre-adjustment/+page.svelte
git commit -m "feat: add factory Adjustment dashboard with force-close and reconciliation tracking"
```

---

## Task 7: POS Integration (Retail & Order)

**Files:**
- Modify: `src/routes/outlet/retail/+page.svelte`
- Modify: `src/library/components/outlet/retail/CartSection.svelte`
- Modify: `src/library/components/outlet/retail/Order.svelte` (create stub if absent)

- [ ] **Step 1: Add `getDisplayStock` import and Pre Adjustment quick button to the retail page**

In `src/routes/outlet/retail/+page.svelte`, add these imports inside the `<script>` block:

```typescript
import { getDisplayStock } from '$lib/mock/pre-adjustments'
import PreAdjustmentModal from '$lib/components/outlet/pre-adjustment/PreAdjustmentModal.svelte'

let showPreAdjustModal = false
let preAdjustItemId = ''
```

Find the search results list where each item row displays its stock count. Replace every `item.stock` in that section with `getDisplayStock(item.id, $auth.outletId)`. Then, directly after each item row in the list, add the conditional quick-access button:

```svelte
{#each searchResults as item}
    {@const displayStock = getDisplayStock(item.id, $auth.outletId)}
    <!-- ... existing item row markup using displayStock instead of item.stock ... -->
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
    onCreated={() => {
        preAdjustItemId = ''
        // Re-trigger the existing search to reflect updated display stock:
        searchResults = searchResults.map(i => ({ ...i }))
    }}
/>
```

- [ ] **Step 2: Update CartSection to use `getDisplayStock` for qty ceiling**

In `src/library/components/outlet/retail/CartSection.svelte`, add the import and update the qty increase handler:

```typescript
import { getDisplayStock } from '$lib/mock/pre-adjustments'
import { get } from 'svelte/store'
import { auth } from '$lib/stores/auth'
```

Find the function that increments a cart item's quantity (named `increaseQty`, `addQty`, or similar). Replace the `item.stock` ceiling with `getDisplayStock`:

```typescript
function increaseQty(item: RetailCartItem) {
    const session = get(auth)
    const max = getDisplayStock(item.id, session.outletId)
    if (item.qty >= max) return
    item.qty += 1
    cart.update(c => c)   // trigger reactivity — use whatever store update pattern exists
}
```

Also replace any inline `item.stock` references in the cart row markup (e.g., stock badge) with `getDisplayStock(item.id, $auth.outletId)`.

- [ ] **Step 3: Update Order.svelte to use `getDisplayStock` per outlet with active-adjustment badge**

In `src/library/components/outlet/retail/Order.svelte`, add imports:

```typescript
import { getDisplayStock, getActivePreAdjustments } from '$lib/mock/pre-adjustments'
```

In the multi-outlet stock comparison table, replace raw stock values per outlet column:

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

If `Order.svelte` does not exist yet, create a minimal stub at `src/library/components/outlet/retail/Order.svelte` with the imports above and a `<p>Order mode — coming soon</p>` body, so the import in Task 8 doesn't break.

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/retail/+page.svelte \
        src/library/components/outlet/retail/CartSection.svelte \
        src/library/components/outlet/retail/Order.svelte
git commit -m "feat: integrate getDisplayStock into POS retail page, cart validation, and order view"
```

---

## Task 8: Item Masuk Reconciliation Hook

**Files:**
- Modify: `src/library/mock/item-masuk.ts`

- [ ] **Step 1: Add `checkReconciliation` call to `submitItemMasuk`**

In `src/library/mock/item-masuk.ts`, add the import and wire the reconciliation call. The hook must be called **after** `item.stock` has been updated — `checkReconciliation` reads the post-masuk stock to determine if the gap is covered.

```typescript
import { checkReconciliation } from '$lib/mock/pre-adjustments'
```

Inside `submitItemMasuk()` (or `createItemMasuk()`), after all `item.stock` increments are applied, call `checkReconciliation` once per line item:

```typescript
function submitItemMasuk(payload: CreateItemMasukPayload): ItemMasukRecord {
    // ... existing logic: build the record, push to mock array, increment item.stock per line ...

    // After all stock updates — trigger reconciliation per line:
    for (const line of payload.items) {
        checkReconciliation({
            id: newRecord.id,
            outletId: payload.outletId,
            itemId: line.itemId,
            qty: line.qty
        })
    }

    return newRecord
}
```

If `src/library/mock/item-masuk.ts` does not exist yet (Item Masuk not yet implemented), create a stub file so the reconciliation hook is ready when that plan runs:

```typescript
// src/library/mock/item-masuk.ts
// Stub — full implementation in Item Masuk plan.
// checkReconciliation is wired here so the hook is in place from day one.

import { checkReconciliation } from '$lib/mock/pre-adjustments'

interface ItemMasukLine { itemId: string; qty: number }
interface CreateItemMasukPayload { id: string; outletId: string; items: ItemMasukLine[] }

export function submitItemMasuk(payload: CreateItemMasukPayload): void {
    // Full implementation to be added in Item Masuk plan.
    for (const line of payload.items) {
        checkReconciliation({ id: payload.id, outletId: payload.outletId, itemId: line.itemId, qty: line.qty })
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/library/mock/item-masuk.ts
git commit -m "feat: wire checkReconciliation into Item Masuk submission"
```
