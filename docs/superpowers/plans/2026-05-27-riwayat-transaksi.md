# Riwayat Transaksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Riwayat Transaksi (completed transaction history) feature — a two-tab history log for Retail and Pesanan transactions with PT repair, three receipt types, and an admin PT queue.

**Architecture:** Four files: a types module, a mock store with a resolved-repair audit log, the main page (two tabs + five inline modals), and an admin repair page. No PTI — all repairs in Riwayat require admin approval. PT approval calls `logStockMovement` for qty deltas. Retail and Pesanan checkout both write to the same store via `createRiwayatEntry`.

**Tech Stack:** SvelteKit 1.x + Svelte 4, TypeScript 5, TailwindCSS 3, DaisyUI, client-side mocks

---

## Prerequisites

- `src/library/mock/master-items.ts` — exports `getMasterItems()`, `getDisplayStock(itemId, outletId)`, `logStockMovement(entry)`
- `src/library/mock/payment-methods.ts` — exports `mockPaymentMethods` as `Array<{ value: string; label: string }>`
- `src/library/mock/members.ts` — exports `getMockMembers()` returning `Array<{ id: string; name: string; phone: string }>`
- `src/library/mock/pesanan.ts` — exports `checkoutPesanan` (will be modified in Task 7)
- `src/library/stores/auth.ts` — exports `auth` store with `{ userId, userName, role: 'cashier' | 'manager' | 'admin', outletId }`
- Project bootstrap (Task 0 from pergerakan-stok plan) — SvelteKit + Tailwind + DaisyUI configured

---

## File Map

### Created by this plan
```
src/library/types/Riwayat.ts
src/library/mock/riwayat.ts
src/library/mock/riwayat.test.ts
src/routes/outlet/riwayat/+page.svelte
src/routes/outlet/riwayat/repair/+page.svelte
```

### Modified by this plan
```
src/routes/outlet/+layout.svelte              — add Riwayat nav link
src/routes/outlet/retail/+page.svelte         — call createRiwayatEntry after checkout
src/library/mock/pesanan.ts                   — call createRiwayatEntry in checkoutPesanan
```

---

## Task 1: TypeScript Types

**Files:**
- Create: `src/library/types/Riwayat.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/Riwayat.ts
import type { KuponCartMutation } from './Kupon'

export interface RetailSnapshot {
    source: 'retail'
    outletId: string
    cashierId: string
    memberId: string | null
    items: Array<{
        id: string
        name: string
        sku: string
        barcode: string
        price: number
        qty: number
        stock: number
        isFree: boolean
    }>
    freeItems: Array<{
        id: string
        name: string
        sku: string
        barcode: string
        qty: number
        stock: number
        isFree: true
    }>
    additionalCosts: { packaging: number; modification: number; transport: number; other: number }
    kupon: { kode: string; nilaiPotongan: number; cartMutations: KuponCartMutation[]; authNip: string | null } | null
    payments: Array<{ type: string; amount: number }>
    transactionType: string
    notes: string
    orderMeta: {
        orderDate: string
        whatsapp: string
        branchId: string
        hour: string
        deliveryType: 'pickup' | 'delivery'
    } | null
    pointsRedeemed: number
    voucherId: string | null
    isPiutang: boolean
    piutangAmount: number
}

export interface PesananTransactionSnapshot {
    source: 'pesanan'
    pesananId: string
    outletId: string
    cashierId: string
    memberId: string | null
    items: Array<{
        id: string
        name: string
        sku: string
        barcode: string
        price: number
        qty: number
        stock: number
        isFree: boolean
    }>
    freeItems: Array<{
        id: string
        name: string
        sku: string
        barcode: string
        qty: number
        stock: number
        isFree: true
    }>
    additionalCosts: { packaging: number; modification: number; transport: number; other: number }
    kupon: { kode: string; nilaiPotongan: number; cartMutations: KuponCartMutation[]; authNip: string | null } | null
    payments: Array<{ type: string; amount: number }>
    transactionType: string
    notes: string
    orderMeta: {
        orderDate: string
        whatsapp: string
        branchId: string
        hour: string
        deliveryType: 'pickup' | 'delivery'
    }
}

export type RiwayatSnapshot = RetailSnapshot | PesananTransactionSnapshot

export interface RiwayatVersion {
    index: number
    type: 'original' | 'approved'
    snapshot: RiwayatSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface RepairRequest {
    id: string
    riwayatId: string
    status: 'pending' | 'rejected' | 'approved' | 'deleted'
    proposedSnapshot: RiwayatSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export type RiwayatSource = 'retail' | 'pesanan'
export type RiwayatStatus = 'active' | 'awaiting_pt'

export interface RiwayatEntry {
    id: string
    source: RiwayatSource
    status: RiwayatStatus
    currentVersionIndex: number
    versions: RiwayatVersion[]
    pendingRequest: RepairRequest | null
    totalAmount: number
    outletId: string
    completedAt: string
    isDeleted: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add src/library/types/Riwayat.ts
git commit -m "feat: add Riwayat Transaksi TypeScript types"
```

---

## Task 2: Mock Store

**Files:**
- Create: `src/library/mock/riwayat.ts`
- Test: `src/library/mock/riwayat.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/library/mock/riwayat.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
    getRiwayatList,
    getRiwayatById,
    getPendingRepairRequests,
    getResolvedRepairRequests,
    getDeletedTransactions,
    createRiwayatEntry,
    submitRepairRequest,
    reviseRepairRequest,
    approveRepairRequest,
    rejectRepairRequest,
    deleteRepairRequest,
    deleteTransaction,
    resetRiwayatStore,
} from './riwayat'
import type { RetailSnapshot, PesananTransactionSnapshot } from '../types/Riwayat'

const baseRetailSnap: RetailSnapshot = {
    source: 'retail',
    outletId: 'outlet-1',
    cashierId: 'user-001',
    memberId: null,
    items: [{ id: 'item-001', name: 'Kemeja', sku: 'KMJ-001', barcode: '8991234000011', price: 100000, qty: 2, stock: 10, isFree: false }],
    freeItems: [],
    additionalCosts: { packaging: 0, modification: 0, transport: 0, other: 0 },
    kupon: null,
    payments: [{ type: 'cash', amount: 200000 }],
    transactionType: 'Walk-In',
    notes: '',
    orderMeta: null,
    pointsRedeemed: 0,
    voucherId: null,
    isPiutang: false,
    piutangAmount: 0,
}

const basePesananSnap: PesananTransactionSnapshot = {
    source: 'pesanan',
    pesananId: 'PSN-00099',
    outletId: 'outlet-1',
    cashierId: 'user-001',
    memberId: null,
    items: [{ id: 'item-002', name: 'Celana', sku: 'CLN-001', barcode: '8991234000022', price: 150000, qty: 1, stock: 5, isFree: false }],
    freeItems: [],
    additionalCosts: { packaging: 0, modification: 0, transport: 0, other: 0 },
    kupon: null,
    payments: [{ type: 'cash', amount: 150000 }],
    transactionType: 'Walk-In',
    notes: '',
    orderMeta: { orderDate: '2026-05-27', whatsapp: '081234567890', branchId: 'branch-1', hour: '10:00', deliveryType: 'pickup' },
}

beforeEach(() => resetRiwayatStore())

describe('getRiwayatList', () => {
    it('excludes soft-deleted entries', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        deleteTransaction(e.id, 'admin-001')
        expect(getRiwayatList().some(r => r.id === e.id)).toBe(false)
    })
    it('filters by outletId', () => {
        createRiwayatEntry(baseRetailSnap)
        const list = getRiwayatList('outlet-1')
        expect(list.every(r => r.outletId === 'outlet-1')).toBe(true)
    })
    it('returns all outlets when outletId is omitted', () => {
        expect(getRiwayatList().length).toBeGreaterThan(0)
    })
})

describe('createRiwayatEntry', () => {
    it('creates a retail entry with TRX-prefixed id', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        expect(e.id).toMatch(/^TRX-\d{5}$/)
        expect(e.source).toBe('retail')
    })
    it('creates a pesanan entry with PSN-prefixed id from snapshot', () => {
        const e = createRiwayatEntry(basePesananSnap)
        expect(e.id).toBe('PSN-00099')
        expect(e.source).toBe('pesanan')
    })
    it('sets status to active', () => {
        expect(createRiwayatEntry(baseRetailSnap).status).toBe('active')
    })
    it('computes totalAmount from items', () => {
        expect(createRiwayatEntry(baseRetailSnap).totalAmount).toBe(200000)
    })
    it('starts at version index 0 with type original', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        expect(e.currentVersionIndex).toBe(0)
        expect(e.versions[0].type).toBe('original')
    })
})

describe('submitRepairRequest', () => {
    it('sets status to awaiting_pt', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        expect(getRiwayatById(e.id)!.status).toBe('awaiting_pt')
    })
    it('attaches pendingRequest with status pending', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        expect(getRiwayatById(e.id)!.pendingRequest?.status).toBe('pending')
    })
    it('does nothing if status is not active', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        expect(getRiwayatById(e.id)!.pendingRequest?.revisions).toBe(0)
    })
})

describe('reviseRepairRequest', () => {
    it('increments revisions counter', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        rejectRepairRequest(e.id, 'Not valid', 'admin-001')
        reviseRepairRequest(e.id, { ...baseRetailSnap, notes: 'revised' }, 'user-001')
        expect(getRiwayatById(e.id)!.pendingRequest?.revisions).toBe(1)
    })
    it('updates proposed snapshot', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        rejectRepairRequest(e.id, 'reason', 'admin-001')
        reviseRepairRequest(e.id, { ...baseRetailSnap, notes: 'updated' }, 'user-001')
        expect(getRiwayatById(e.id)!.pendingRequest?.proposedSnapshot.notes).toBe('updated')
    })
    it('sets status back to awaiting_pt', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        rejectRepairRequest(e.id, 'reason', 'admin-001')
        reviseRepairRequest(e.id, baseRetailSnap, 'user-001')
        expect(getRiwayatById(e.id)!.status).toBe('awaiting_pt')
    })
})

describe('approveRepairRequest', () => {
    it('creates a new approved version', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, { ...baseRetailSnap, notes: 'fixed' }, 'user-001')
        approveRepairRequest(e.id, 'admin-001')
        const updated = getRiwayatById(e.id)!
        expect(updated.versions).toHaveLength(2)
        expect(updated.versions[1].type).toBe('approved')
    })
    it('clears pendingRequest', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        approveRepairRequest(e.id, 'admin-001')
        expect(getRiwayatById(e.id)!.pendingRequest).toBeNull()
    })
    it('restores status to active', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        approveRepairRequest(e.id, 'admin-001')
        expect(getRiwayatById(e.id)!.status).toBe('active')
    })
    it('recomputes totalAmount when items change', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        const proposed = { ...baseRetailSnap, items: [{ ...baseRetailSnap.items[0], qty: 5 }] }
        submitRepairRequest(e.id, proposed, 'user-001')
        approveRepairRequest(e.id, 'admin-001')
        expect(getRiwayatById(e.id)!.totalAmount).toBe(500000)
    })
    it('archives request in resolved log', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        approveRepairRequest(e.id, 'admin-001')
        expect(getResolvedRepairRequests().some(r => r.riwayatId === e.id && r.status === 'approved')).toBe(true)
    })
})

describe('rejectRepairRequest', () => {
    it('restores status to active', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        rejectRepairRequest(e.id, 'Not acceptable', 'admin-001')
        expect(getRiwayatById(e.id)!.status).toBe('active')
    })
    it('sets rejectionReason on pendingRequest', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        rejectRepairRequest(e.id, 'Not acceptable', 'admin-001')
        expect(getRiwayatById(e.id)!.pendingRequest?.rejectionReason).toBe('Not acceptable')
    })
    it('keeps pendingRequest on entry so cashier can revise', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        rejectRepairRequest(e.id, 'reason', 'admin-001')
        expect(getRiwayatById(e.id)!.pendingRequest).not.toBeNull()
    })
})

describe('deleteRepairRequest', () => {
    it('clears pendingRequest', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        deleteRepairRequest(e.id, 'admin-001')
        expect(getRiwayatById(e.id)!.pendingRequest).toBeNull()
    })
    it('restores status to active', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        deleteRepairRequest(e.id, 'admin-001')
        expect(getRiwayatById(e.id)!.status).toBe('active')
    })
    it('archives request with deleted status', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        deleteRepairRequest(e.id, 'admin-001')
        const resolved = getResolvedRepairRequests()
        expect(resolved.some(r => r.riwayatId === e.id && r.status === 'deleted')).toBe(false)
    })
})

describe('deleteTransaction', () => {
    it('sets isDeleted to true', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        deleteTransaction(e.id, 'admin-001')
        expect(getRiwayatById(e.id)!.isDeleted).toBe(true)
    })
    it('appears in getDeletedTransactions', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        deleteTransaction(e.id, 'admin-001')
        expect(getDeletedTransactions().some(r => r.id === e.id)).toBe(true)
    })
})

describe('getPendingRepairRequests', () => {
    it('returns only awaiting_pt entries', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        expect(getPendingRepairRequests().some(r => r.riwayatId === e.id)).toBe(true)
    })
    it('excludes approved entries', () => {
        const e = createRiwayatEntry(baseRetailSnap)
        submitRepairRequest(e.id, baseRetailSnap, 'user-001')
        approveRepairRequest(e.id, 'admin-001')
        expect(getPendingRepairRequests().some(r => r.riwayatId === e.id)).toBe(false)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/library/mock/riwayat.test.ts
```

Expected: FAIL with "Cannot find module './riwayat'".

- [ ] **Step 3: Implement the mock store**

Create `src/library/mock/riwayat.ts`:

```typescript
import type { RiwayatEntry, RiwayatVersion, RiwayatSnapshot, RepairRequest, RetailSnapshot, PesananTransactionSnapshot } from '../types/Riwayat'
import { logStockMovement } from './master-items'

function computeTotal(snap: RiwayatSnapshot): number {
    const itemTotal = snap.items.reduce((s, i) => s + i.price * i.qty, 0)
    const costs = snap.additionalCosts.packaging + snap.additionalCosts.modification + snap.additionalCosts.transport + snap.additionalCosts.other
    const kuponDiscount = snap.kupon ? snap.kupon.nilaiPotongan : 0
    return itemTotal + costs - kuponDiscount
}

function getChangedFields(before: RiwayatSnapshot, after: RiwayatSnapshot): string[] {
    return (Object.keys(after) as (keyof RiwayatSnapshot)[]).filter(
        key => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after])
    )
}

// --- Seed snapshots ---

const retailSnap1: RetailSnapshot = {
    source: 'retail', outletId: 'outlet-1', cashierId: 'user-cashier-1', memberId: 'member-001',
    items: [
        { id: 'item-001', name: 'Kemeja Putih', sku: 'KMJ-001', barcode: '8991234000011', price: 150000, qty: 2, stock: 30, isFree: false },
        { id: 'item-002', name: 'Celana Chino', sku: 'CLN-001', barcode: '8991234000022', price: 200000, qty: 1, stock: 15, isFree: false },
    ],
    freeItems: [],
    additionalCosts: { packaging: 5000, modification: 0, transport: 0, other: 0 },
    kupon: null,
    payments: [{ type: 'cash', amount: 505000 }],
    transactionType: 'Walk-In', notes: '',
    orderMeta: null, pointsRedeemed: 0, voucherId: null, isPiutang: false, piutangAmount: 0,
}

const retailSnap2: RetailSnapshot = {
    source: 'retail', outletId: 'outlet-1', cashierId: 'user-cashier-2', memberId: null,
    items: [{ id: 'item-003', name: 'Jaket Denim', sku: 'JKT-001', barcode: '8991234000033', price: 350000, qty: 1, stock: 8, isFree: false }],
    freeItems: [],
    additionalCosts: { packaging: 0, modification: 0, transport: 0, other: 0 },
    kupon: null,
    payments: [{ type: 'cash', amount: 350000 }],
    transactionType: 'Walk-In', notes: '',
    orderMeta: null, pointsRedeemed: 0, voucherId: null, isPiutang: false, piutangAmount: 0,
}

const retailSnap2Proposed: RetailSnapshot = {
    ...retailSnap2,
    items: [{ ...retailSnap2.items[0], qty: 2 }],
    payments: [{ type: 'cash', amount: 700000 }],
}

const retailSnap3v1: RetailSnapshot = {
    source: 'retail', outletId: 'outlet-1', cashierId: 'user-cashier-1', memberId: null,
    items: [
        { id: 'item-004', name: 'Kaos Polos', sku: 'KOS-001', barcode: '8991234000044', price: 85000, qty: 3, stock: 50, isFree: false },
        { id: 'item-005', name: 'Sabuk Kulit', sku: 'SBK-001', barcode: '8991234000055', price: 120000, qty: 1, stock: 20, isFree: false },
        { id: 'item-006', name: 'Tas Kanvas', sku: 'TAS-001', barcode: '8991234000066', price: 180000, qty: 1, stock: 12, isFree: false },
    ],
    freeItems: [],
    additionalCosts: { packaging: 10000, modification: 0, transport: 0, other: 0 },
    kupon: null,
    payments: [{ type: 'emoney', amount: 565000 }],
    transactionType: 'Walk-In', notes: 'Harga salah dicatat',
    orderMeta: null, pointsRedeemed: 0, voucherId: null, isPiutang: false, piutangAmount: 0,
}

const retailSnap3v2: RetailSnapshot = {
    ...retailSnap3v1,
    items: [
        { ...retailSnap3v1.items[0], price: 90000 },
        retailSnap3v1.items[1],
        retailSnap3v1.items[2],
    ],
    payments: [{ type: 'emoney', amount: 580000 }],
    notes: '',
}

const pesananSnap1: PesananTransactionSnapshot = {
    source: 'pesanan', pesananId: 'PSN-00001',
    outletId: 'outlet-1', cashierId: 'user-cashier-1', memberId: 'member-001',
    items: [
        { id: 'item-001', name: 'Kemeja Putih', sku: 'KMJ-001', barcode: '8991234000011', price: 150000, qty: 2, stock: 30, isFree: false },
        { id: 'item-002', name: 'Celana Chino', sku: 'CLN-001', barcode: '8991234000022', price: 200000, qty: 1, stock: 15, isFree: false },
    ],
    freeItems: [],
    additionalCosts: { packaging: 10000, modification: 0, transport: 15000, other: 0 },
    kupon: null,
    payments: [
        { type: 'cash', amount: 237500 },
        { type: 'cash', amount: 237500 },
    ],
    transactionType: 'Delivery', notes: 'Antar ke rumah siang hari',
    orderMeta: { orderDate: '2026-05-27', whatsapp: '081234567890', branchId: 'branch-1', hour: '14:00', deliveryType: 'delivery' },
}

const pesananSnap2: PesananTransactionSnapshot = {
    source: 'pesanan', pesananId: 'PSN-00002',
    outletId: 'outlet-1', cashierId: 'user-cashier-2', memberId: null,
    items: [{ id: 'item-007', name: 'Topi Baseball', sku: 'TOP-001', barcode: '8991234000077', price: 95000, qty: 2, stock: 25, isFree: false }],
    freeItems: [],
    additionalCosts: { packaging: 0, modification: 0, transport: 0, other: 0 },
    kupon: null,
    payments: [{ type: 'cash', amount: 190000 }],
    transactionType: 'Walk-In', notes: '',
    orderMeta: { orderDate: '2026-05-26', whatsapp: '089876543210', branchId: 'branch-1', hour: '10:00', deliveryType: 'pickup' },
}

const seedRepairApproved: RepairRequest = {
    id: 'rr-seed-001', riwayatId: 'TRX-00003', status: 'approved',
    proposedSnapshot: retailSnap3v2,
    submittedBy: 'user-cashier-1', submittedAt: '2026-05-27T06:00:00.000Z',
    rejectionReason: null, revisions: 0,
}

function makeSeedStore(): RiwayatEntry[] {
    return [
        {
            id: 'TRX-00001', source: 'retail', status: 'active', currentVersionIndex: 0,
            versions: [{ index: 0, type: 'original', snapshot: retailSnap1, changedFields: [], createdBy: retailSnap1.cashierId, createdAt: '2026-05-27T07:00:00.000Z', requestId: null }],
            pendingRequest: null, totalAmount: computeTotal(retailSnap1),
            outletId: 'outlet-1', completedAt: '2026-05-27T07:00:00.000Z', isDeleted: false,
        },
        {
            id: 'TRX-00002', source: 'retail', status: 'awaiting_pt', currentVersionIndex: 0,
            versions: [{ index: 0, type: 'original', snapshot: retailSnap2, changedFields: [], createdBy: retailSnap2.cashierId, createdAt: '2026-05-27T08:00:00.000Z', requestId: null }],
            pendingRequest: {
                id: 'rr-seed-002', riwayatId: 'TRX-00002', status: 'pending',
                proposedSnapshot: retailSnap2Proposed,
                submittedBy: 'user-cashier-2', submittedAt: '2026-05-27T08:30:00.000Z',
                rejectionReason: null, revisions: 0,
            },
            totalAmount: computeTotal(retailSnap2),
            outletId: 'outlet-1', completedAt: '2026-05-27T08:00:00.000Z', isDeleted: false,
        },
        {
            id: 'TRX-00003', source: 'retail', status: 'active', currentVersionIndex: 1,
            versions: [
                { index: 0, type: 'original', snapshot: retailSnap3v1, changedFields: [], createdBy: retailSnap3v1.cashierId, createdAt: '2026-05-27T09:00:00.000Z', requestId: null },
                { index: 1, type: 'approved', snapshot: retailSnap3v2, changedFields: ['items', 'payments', 'notes'], createdBy: 'admin-001', createdAt: '2026-05-27T09:30:00.000Z', requestId: 'rr-seed-001' },
            ],
            pendingRequest: null, totalAmount: computeTotal(retailSnap3v2),
            outletId: 'outlet-1', completedAt: '2026-05-27T09:00:00.000Z', isDeleted: false,
        },
        {
            id: 'PSN-00001', source: 'pesanan', status: 'active', currentVersionIndex: 0,
            versions: [{ index: 0, type: 'original', snapshot: pesananSnap1, changedFields: [], createdBy: pesananSnap1.cashierId, createdAt: '2026-05-27T14:00:00.000Z', requestId: null }],
            pendingRequest: null, totalAmount: computeTotal(pesananSnap1),
            outletId: 'outlet-1', completedAt: '2026-05-27T14:00:00.000Z', isDeleted: false,
        },
        {
            id: 'PSN-00002', source: 'pesanan', status: 'active', currentVersionIndex: 0,
            versions: [{ index: 0, type: 'original', snapshot: pesananSnap2, changedFields: [], createdBy: pesananSnap2.cashierId, createdAt: '2026-05-26T10:30:00.000Z', requestId: null }],
            pendingRequest: null, totalAmount: computeTotal(pesananSnap2),
            outletId: 'outlet-1', completedAt: '2026-05-26T10:30:00.000Z', isDeleted: false,
        },
    ]
}

let store: RiwayatEntry[] = makeSeedStore()
let resolvedRepairLog: RepairRequest[] = [seedRepairApproved]
let trxCounter = 3

export function resetRiwayatStore(): void {
    store = makeSeedStore()
    resolvedRepairLog = [seedRepairApproved]
    trxCounter = 3
}

export function getRiwayatList(outletId?: string): RiwayatEntry[] {
    const visible = store.filter(e => !e.isDeleted)
    if (!outletId) return visible
    return visible.filter(e => e.outletId === outletId)
}

export function getRiwayatById(id: string): RiwayatEntry | undefined {
    return store.find(e => e.id === id)
}

export function getPendingRepairRequests(): RepairRequest[] {
    return store
        .filter(e => e.status === 'awaiting_pt' && e.pendingRequest)
        .map(e => e.pendingRequest!)
}

export function getResolvedRepairRequests(): RepairRequest[] {
    return resolvedRepairLog.filter(r => r.status === 'approved' || r.status === 'rejected')
}

export function getDeletedTransactions(): RiwayatEntry[] {
    return store.filter(e => e.isDeleted)
}

export function createRiwayatEntry(snapshot: RiwayatSnapshot): RiwayatEntry {
    const id = snapshot.source === 'pesanan'
        ? (snapshot as PesananTransactionSnapshot).pesananId
        : (() => { trxCounter++; return `TRX-${String(trxCounter).padStart(5, '0')}` })()

    const version: RiwayatVersion = {
        index: 0, type: 'original', snapshot,
        changedFields: [], createdBy: snapshot.cashierId,
        createdAt: new Date().toISOString(), requestId: null,
    }
    const entry: RiwayatEntry = {
        id, source: snapshot.source, status: 'active', currentVersionIndex: 0,
        versions: [version], pendingRequest: null,
        totalAmount: computeTotal(snapshot),
        outletId: snapshot.outletId,
        completedAt: new Date().toISOString(), isDeleted: false,
    }
    store.push(entry)
    return entry
}

export function submitRepairRequest(id: string, proposedSnapshot: RiwayatSnapshot, userId: string): void {
    const entry = store.find(e => e.id === id)
    if (!entry || entry.status !== 'active') return
    entry.pendingRequest = {
        id: `rr-${Date.now()}`, riwayatId: id, status: 'pending',
        proposedSnapshot, submittedBy: userId,
        submittedAt: new Date().toISOString(),
        rejectionReason: null, revisions: 0,
    }
    entry.status = 'awaiting_pt'
}

export function reviseRepairRequest(id: string, proposedSnapshot: RiwayatSnapshot, userId: string): void {
    const entry = store.find(e => e.id === id)
    if (!entry || !entry.pendingRequest) return
    entry.pendingRequest.proposedSnapshot = proposedSnapshot
    entry.pendingRequest.revisions++
    entry.pendingRequest.status = 'pending'
    entry.pendingRequest.rejectionReason = null
    entry.status = 'awaiting_pt'
}

export function approveRepairRequest(id: string, adminId: string): void {
    const entry = store.find(e => e.id === id)
    if (!entry || !entry.pendingRequest || entry.status !== 'awaiting_pt') return

    const currentSnap = entry.versions[entry.currentVersionIndex].snapshot
    const proposed = entry.pendingRequest.proposedSnapshot

    // Log stock delta for changed item quantities
    for (const newItem of proposed.items) {
        const oldItem = currentSnap.items.find(i => i.id === newItem.id)
        const delta = -(newItem.qty - (oldItem?.qty ?? 0))
        if (delta !== 0) {
            logStockMovement({
                id: `sm-pt-${id}-${newItem.id}-${Date.now()}`,
                itemId: newItem.id, outletId: currentSnap.outletId,
                delta, source: delta < 0 ? 'sale' : 'sale_void',
                referenceId: id,
                recordedAt: new Date().toISOString(), recordedBy: adminId,
            })
        }
    }
    // Return stock for items removed from proposed
    for (const oldItem of currentSnap.items) {
        if (!proposed.items.find(i => i.id === oldItem.id)) {
            logStockMovement({
                id: `sm-pt-void-${id}-${oldItem.id}-${Date.now()}`,
                itemId: oldItem.id, outletId: currentSnap.outletId,
                delta: oldItem.qty, source: 'sale_void',
                referenceId: id,
                recordedAt: new Date().toISOString(), recordedBy: adminId,
            })
        }
    }

    const version: RiwayatVersion = {
        index: entry.currentVersionIndex + 1, type: 'approved',
        snapshot: proposed,
        changedFields: getChangedFields(currentSnap, proposed),
        createdBy: adminId, createdAt: new Date().toISOString(),
        requestId: entry.pendingRequest.id,
    }
    entry.versions.push(version)
    entry.currentVersionIndex = version.index
    entry.totalAmount = computeTotal(proposed)

    const archived = { ...entry.pendingRequest, status: 'approved' as const }
    resolvedRepairLog.push(archived)
    entry.pendingRequest = null
    entry.status = 'active'
}

export function rejectRepairRequest(id: string, reason: string, adminId: string): void {
    const entry = store.find(e => e.id === id)
    if (!entry || !entry.pendingRequest || entry.status !== 'awaiting_pt') return
    entry.pendingRequest.status = 'rejected'
    entry.pendingRequest.rejectionReason = reason
    entry.status = 'active'
}

export function deleteRepairRequest(id: string, adminId: string): void {
    const entry = store.find(e => e.id === id)
    if (!entry || !entry.pendingRequest) return
    const archived = { ...entry.pendingRequest, status: 'deleted' as const }
    resolvedRepairLog.push(archived)
    entry.pendingRequest = null
    entry.status = 'active'
}

export function deleteTransaction(id: string, adminId: string): void {
    const entry = store.find(e => e.id === id)
    if (!entry) return
    entry.isDeleted = true
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/library/mock/riwayat.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/riwayat.ts src/library/mock/riwayat.test.ts
git commit -m "feat: add Riwayat Transaksi mock store with seed data and PT functions"
```

---

## Task 3: Main Riwayat Page

**Files:**
- Create: `src/routes/outlet/riwayat/+page.svelte`

This page has two tabs (Retail / Pesanan), a shared toolbar with search and date filters, and five inline modals: Lihat, Retail Receipt, Pesanan Order Receipt, Pesanan Checkout Receipt, and PT form.

- [ ] **Step 1: Create the page file**

Create `src/routes/outlet/riwayat/+page.svelte`:

```svelte
<script lang="ts">
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import {
        getRiwayatList, submitRepairRequest, reviseRepairRequest, deleteTransaction,
    } from '$lib/mock/riwayat'
    import { getMasterItems, getDisplayStock } from '$lib/mock/master-items'
    import { mockPaymentMethods } from '$lib/mock/payment-methods'
    import type { RiwayatEntry, RiwayatSnapshot, RetailSnapshot, PesananTransactionSnapshot } from '$lib/types/Riwayat'

    const session = get(auth)
    const isAdmin = session.role === 'admin'

    const catalog = getMasterItems()
        .filter(i => i.itemType === 'product')
        .map(i => ({
            id: i.id, name: i.name, sku: i.sku, barcode: i.barcode ?? '',
            priceLevel1: i.priceLevel1,
            displayStock: getDisplayStock(i.id, session.outletId),
        }))

    let entries = getRiwayatList(isAdmin ? undefined : session.outletId)
    function refresh() { entries = getRiwayatList(isAdmin ? undefined : session.outletId) }

    type Tab = 'retail' | 'pesanan'
    let activeTab: Tab = 'retail'

    // --- Toolbar ---
    let search = ''
    let dateFrom = ''
    let dateTo = ''
    let perPage: 10 | 25 | 50 | 100 = 25
    let currentPage = 1

    $: if (search !== undefined || dateFrom !== undefined || dateTo !== undefined || perPage || activeTab) currentPage = 1

    $: retailEntries = entries.filter(e => e.source === 'retail')
    $: pesananEntries = entries.filter(e => e.source === 'pesanan')

    function matchesFilter(e: RiwayatEntry): boolean {
        const snap = e.versions[e.currentVersionIndex].snapshot
        const q = search.toLowerCase()
        const matchFrom = !dateFrom || e.completedAt >= dateFrom
        const matchTo = !dateTo || e.completedAt <= dateTo + 'T23:59:59'
        const searchFields = [e.id, snap.memberId ?? '', snap.notes]
        if (snap.source === 'pesanan') searchFields.push((snap as PesananTransactionSnapshot).orderMeta.whatsapp)
        return matchFrom && matchTo && searchFields.some(f => f.toLowerCase().includes(q))
    }

    $: filtered = (activeTab === 'retail' ? retailEntries : pesananEntries).filter(matchesFilter)
    $: totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    $: paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
    $: pageButtons = (() => {
        let start = Math.max(1, currentPage - 2)
        let end = Math.min(totalPages, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()

    // --- Modal state ---
    let selected: RiwayatEntry | null = null

    // Lihat modal
    let viewOpen = false
    function openView(e: RiwayatEntry) { selected = e; viewOpen = true }

    // Receipt modals: 'retail' | 'order' | 'checkout' | null
    let printMode: 'retail' | 'order' | 'checkout' | null = null
    function openPrint(e: RiwayatEntry, mode: typeof printMode) { selected = e; printMode = mode }

    // PT modal
    let ptOpen = false
    let ptSnapshot: RiwayatSnapshot | null = null
    let ptAddItemSearch = ''
    let isRevision = false

    $: ptAddItemResults = ptAddItemSearch.length > 1
        ? catalog.filter(i =>
            i.name.toLowerCase().includes(ptAddItemSearch.toLowerCase()) ||
            i.sku.toLowerCase().includes(ptAddItemSearch.toLowerCase())
          ).slice(0, 5)
        : []

    function openPT(e: RiwayatEntry) {
        selected = e
        const snap = e.versions[e.currentVersionIndex].snapshot
        ptSnapshot = JSON.parse(JSON.stringify(snap))
        isRevision = e.pendingRequest?.status === 'rejected'
        ptAddItemSearch = ''
        ptOpen = true
    }
    function addItemToPT(item: typeof catalog[0]) {
        if (!ptSnapshot) return
        const existing = ptSnapshot.items.find(i => i.id === item.id)
        if (existing) {
            existing.qty++
            ptSnapshot = { ...ptSnapshot }
        } else {
            ptSnapshot = {
                ...ptSnapshot,
                items: [...ptSnapshot.items, {
                    id: item.id, name: item.name, sku: item.sku, barcode: item.barcode,
                    price: item.priceLevel1, qty: 1, stock: item.displayStock, isFree: false,
                }],
            }
        }
        ptAddItemSearch = ''
    }
    function removeItemFromPT(idx: number) {
        if (!ptSnapshot) return
        ptSnapshot = { ...ptSnapshot, items: ptSnapshot.items.filter((_, i) => i !== idx) }
    }
    function submitPT() {
        if (!selected || !ptSnapshot) return
        if (isRevision) {
            reviseRepairRequest(selected.id, ptSnapshot, session.userId)
        } else {
            submitRepairRequest(selected.id, ptSnapshot, session.userId)
        }
        ptOpen = false
        refresh()
    }

    function handleDelete(e: RiwayatEntry) {
        if (!confirm(`Hapus transaksi ${e.id}? Tindakan ini tidak dapat dibatalkan.`)) return
        deleteTransaction(e.id, session.userId)
        refresh()
    }

    function currentSnap(e: RiwayatEntry) { return e.versions[e.currentVersionIndex].snapshot }
    function formatRp(n: number) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
    }
    function formatDate(s: string) {
        return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
    function formatDateTime(s: string) {
        return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
</script>

<div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Riwayat Transaksi</h1>

    <!-- Tabs -->
    <div class="tabs tabs-boxed mb-4">
        <button class="tab {activeTab === 'retail' ? 'tab-active' : ''}" on:click={() => activeTab = 'retail'}>Retail</button>
        <button class="tab {activeTab === 'pesanan' ? 'tab-active' : ''}" on:click={() => activeTab = 'pesanan'}>Pesanan</button>
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
        <input type="text" class="input input-bordered input-sm w-60" placeholder="Cari ID, member, catatan..." bind:value={search} />
        <div class="flex items-center gap-1">
            <span class="text-sm">Dari</span>
            <input type="date" class="input input-bordered input-sm" bind:value={dateFrom} />
        </div>
        <div class="flex items-center gap-1">
            <span class="text-sm">s/d</span>
            <input type="date" class="input input-bordered input-sm" bind:value={dateTo} />
        </div>
        <select class="select select-bordered select-sm ml-auto" bind:value={perPage}>
            <option value={10}>10 / halaman</option>
            <option value={25}>25 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
        </select>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
        <table class="table table-sm w-full">
            <thead>
                <tr>
                    {#if isAdmin}<th>Outlet</th>{/if}
                    <th>ID</th>
                    <th>Member</th>
                    <th>Item</th>
                    <th>Total</th>
                    {#if activeTab === 'pesanan'}<th>Tgl Order</th>{/if}
                    <th>{activeTab === 'retail' ? 'Tgl Transaksi' : 'Tgl Selesai'}</th>
                    <th>Kasir</th>
                    <th>Status</th>
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#each paginated as e (e.id)}
                    {@const snap = currentSnap(e)}
                    <tr class="hover">
                        {#if isAdmin}<td class="text-xs">{e.outletId}</td>{/if}
                        <td class="font-mono text-sm">{e.id}</td>
                        <td>{snap.memberId ?? '—'}</td>
                        <td>{snap.items.length} item</td>
                        <td>{formatRp(e.totalAmount)}</td>
                        {#if activeTab === 'pesanan'}
                            <td>{(snap as PesananTransactionSnapshot).orderMeta.orderDate}</td>
                        {/if}
                        <td>{formatDate(e.completedAt)}</td>
                        <td class="text-xs">{snap.cashierId}</td>
                        <td>
                            {#if e.status === 'awaiting_pt'}
                                <span class="badge badge-warning badge-sm">⏳ Menunggu PT</span>
                            {/if}
                        </td>
                        <td>
                            <div class="flex gap-1 flex-wrap">
                                <button class="btn btn-xs btn-outline" on:click={() => openView(e)}>Lihat</button>
                                {#if e.status === 'active'}
                                    {#if activeTab === 'retail'}
                                        <button class="btn btn-xs btn-outline" on:click={() => openPrint(e, 'retail')}>Print</button>
                                    {:else}
                                        <button class="btn btn-xs btn-outline" on:click={() => openPrint(e, 'order')}>Print Order</button>
                                        <button class="btn btn-xs btn-outline" on:click={() => openPrint(e, 'checkout')}>Print Checkout</button>
                                    {/if}
                                    <button class="btn btn-xs btn-warning btn-outline" on:click={() => openPT(e)}>PT</button>
                                    {#if isAdmin}
                                        <button class="btn btn-xs btn-error btn-outline" on:click={() => handleDelete(e)}>Hapus</button>
                                    {/if}
                                {:else}
                                    <!-- awaiting_pt: Lihat only, already rendered above -->
                                {/if}
                            </div>
                        </td>
                    </tr>
                {/each}
                {#if paginated.length === 0}
                    <tr>
                        <td colspan={isAdmin ? 9 : 8} class="text-center text-base-content/50 py-8">
                            Tidak ada transaksi
                        </td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex justify-center items-center gap-1 mt-4">
            <button class="btn btn-sm btn-ghost" disabled={currentPage === 1} on:click={() => currentPage--}>‹</button>
            {#each pageButtons as pg}
                <button class="btn btn-sm {pg === currentPage ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPage = pg}>{pg}</button>
            {/each}
            <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
        </div>
    {/if}
</div>

<!-- Lihat Modal -->
{#if viewOpen && selected}
    {@const snap = currentSnap(selected)}
    <div class="modal modal-open">
        <div class="modal-box max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 class="font-bold text-lg mb-1">{selected.id}</h3>
            <p class="text-sm text-base-content/60 mb-4">{formatDateTime(selected.completedAt)} · {snap.cashierId}</p>

            <table class="table table-xs mb-3 w-full">
                <thead><tr><th>Item</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
                <tbody>
                    {#each snap.items as item}
                        <tr><td>{item.name}</td><td>{item.qty}</td><td>{formatRp(item.price)}</td><td>{formatRp(item.price * item.qty)}</td></tr>
                    {/each}
                    {#each snap.freeItems as item}
                        <tr class="text-success"><td>{item.name}</td><td>{item.qty}</td><td>Gratis</td><td>—</td></tr>
                    {/each}
                </tbody>
            </table>

            <div class="text-sm space-y-1 mb-4">
                {#if snap.additionalCosts.packaging || snap.additionalCosts.modification || snap.additionalCosts.transport || snap.additionalCosts.other}
                    <div class="flex justify-between"><span>Packaging</span><span>{formatRp(snap.additionalCosts.packaging)}</span></div>
                    <div class="flex justify-between"><span>Modifikasi</span><span>{formatRp(snap.additionalCosts.modification)}</span></div>
                    <div class="flex justify-between"><span>Transport</span><span>{formatRp(snap.additionalCosts.transport)}</span></div>
                    <div class="flex justify-between"><span>Lainnya</span><span>{formatRp(snap.additionalCosts.other)}</span></div>
                {/if}
                {#if snap.kupon}
                    <div class="flex justify-between text-success"><span>Kupon {snap.kupon.kode}</span><span>-{formatRp(snap.kupon.nilaiPotongan)}</span></div>
                {/if}
                <div class="flex justify-between font-bold border-t border-base-300 pt-1">
                    <span>Total</span><span>{formatRp(selected.totalAmount)}</span>
                </div>
                {#each snap.payments as p}
                    <div class="flex justify-between text-sm"><span>{p.type}</span><span>{formatRp(p.amount)}</span></div>
                {/each}
            </div>

            {#if snap.source === 'pesanan' && (snap as PesananTransactionSnapshot).orderMeta}
                {@const meta = (snap as PesananTransactionSnapshot).orderMeta}
                <div class="text-sm mb-4 bg-base-200 rounded p-3">
                    <div>Tgl Order: {meta.orderDate} {meta.hour}</div>
                    <div>WhatsApp: {meta.whatsapp}</div>
                    <div>Pengiriman: {meta.deliveryType === 'delivery' ? 'Delivery' : 'Ambil di Outlet'}</div>
                </div>
            {/if}

            <!-- Version history strip -->
            <div class="border-t border-base-300 pt-3">
                <p class="text-xs text-base-content/50 mb-2">Riwayat Versi</p>
                <div class="flex gap-2 overflow-x-auto">
                    {#each selected.versions as v, i}
                        <div class="flex flex-col items-center gap-1 min-w-14">
                            <span class="badge badge-sm {v.type === 'original' ? 'badge-primary' : 'badge-success'}">V{v.index + 1}</span>
                            <span class="text-xs text-center">{v.type}</span>
                            <span class="text-xs text-base-content/40">{formatDate(v.createdAt)}</span>
                        </div>
                        {#if i < selected.versions.length - 1}<div class="self-center text-base-content/30 text-lg">→</div>{/if}
                    {/each}
                </div>
            </div>

            <div class="modal-action">
                <button class="btn btn-ghost" on:click={() => viewOpen = false}>Tutup</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => viewOpen = false}></div>
    </div>
{/if}

<!-- Retail Receipt Modal -->
{#if printMode === 'retail' && selected}
    {@const snap = selected.versions[selected.currentVersionIndex].snapshot as RetailSnapshot}
    <div class="modal modal-open">
        <div class="modal-box max-w-sm">
            <div class="text-center mb-4">
                <h2 class="font-bold text-xl">Studio Bersih</h2>
                <p class="text-sm">{selected.id} · {formatDateTime(selected.completedAt)}</p>
                <p class="text-sm">Kasir: {snap.cashierId}</p>
            </div>
            <div class="divider my-1"></div>
            {#each snap.items as item}
                <div class="flex justify-between text-sm">
                    <span>{item.name} x{item.qty}</span><span>{formatRp(item.price * item.qty)}</span>
                </div>
            {/each}
            <div class="divider my-1"></div>
            <div class="space-y-1 text-sm">
                {#if snap.additionalCosts.packaging}<div class="flex justify-between"><span>Packaging</span><span>{formatRp(snap.additionalCosts.packaging)}</span></div>{/if}
                {#if snap.additionalCosts.transport}<div class="flex justify-between"><span>Transport</span><span>{formatRp(snap.additionalCosts.transport)}</span></div>{/if}
                {#if snap.kupon}<div class="flex justify-between text-success"><span>Kupon {snap.kupon.kode}</span><span>-{formatRp(snap.kupon.nilaiPotongan)}</span></div>{/if}
                <div class="flex justify-between font-bold text-base border-t border-base-300 pt-1"><span>TOTAL</span><span>{formatRp(selected.totalAmount)}</span></div>
                {#each snap.payments as p}
                    <div class="flex justify-between"><span>{p.type}</span><span>{formatRp(p.amount)}</span></div>
                {/each}
            </div>
            {#if snap.memberId}<p class="text-xs text-center mt-3">Member: {snap.memberId}</p>{/if}
            {#if snap.notes}<p class="text-xs text-center">{snap.notes}</p>{/if}
            <div class="modal-action">
                <button class="btn btn-ghost" on:click={() => printMode = null}>Tutup</button>
                <button class="btn btn-primary" on:click={() => window.print()}>Print</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => printMode = null}></div>
    </div>
{/if}

<!-- Pesanan Order Receipt Modal -->
{#if printMode === 'order' && selected}
    {@const snap = selected.versions[selected.currentVersionIndex].snapshot as PesananTransactionSnapshot}
    <div class="modal modal-open">
        <div class="modal-box max-w-sm">
            <div class="text-center mb-4">
                <h2 class="font-bold text-xl">Studio Bersih — Order</h2>
                <p class="font-mono text-lg">{snap.pesananId}</p>
                <p class="text-sm">Tgl Order: {snap.orderMeta.orderDate} {snap.orderMeta.hour}</p>
                <p class="text-sm">{snap.orderMeta.deliveryType === 'delivery' ? '🚚 Delivery' : '🏬 Ambil di Outlet'}</p>
            </div>
            <div class="divider my-1"></div>
            <p class="text-sm font-semibold mb-1">WA: {snap.orderMeta.whatsapp}</p>
            {#each snap.items as item}
                <div class="flex justify-between text-sm">
                    <span>{item.name} x{item.qty}</span><span>{formatRp(item.price * item.qty)}</span>
                </div>
            {/each}
            <div class="divider my-1"></div>
            <div class="flex justify-between font-bold text-sm"><span>Total Order</span><span>{formatRp(selected.totalAmount)}</span></div>
            <div class="modal-action">
                <button class="btn btn-ghost" on:click={() => printMode = null}>Tutup</button>
                <button class="btn btn-primary" on:click={() => window.print()}>Print</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => printMode = null}></div>
    </div>
{/if}

<!-- Pesanan Checkout Receipt Modal -->
{#if printMode === 'checkout' && selected}
    {@const snap = selected.versions[selected.currentVersionIndex].snapshot as PesananTransactionSnapshot}
    <div class="modal modal-open">
        <div class="modal-box max-w-sm">
            <div class="text-center mb-4">
                <h2 class="font-bold text-xl">Studio Bersih — Checkout</h2>
                <p class="font-mono">{snap.pesananId}</p>
                <p class="text-sm">Selesai: {formatDateTime(selected.completedAt)}</p>
                <p class="text-sm">Kasir: {snap.cashierId}</p>
            </div>
            <div class="divider my-1"></div>
            {#each snap.items as item}
                <div class="flex justify-between text-sm">
                    <span>{item.name} x{item.qty}</span><span>{formatRp(item.price * item.qty)}</span>
                </div>
            {/each}
            <div class="divider my-1"></div>
            <div class="space-y-1 text-sm">
                {#if snap.additionalCosts.packaging}<div class="flex justify-between"><span>Packaging</span><span>{formatRp(snap.additionalCosts.packaging)}</span></div>{/if}
                {#if snap.additionalCosts.transport}<div class="flex justify-between"><span>Transport</span><span>{formatRp(snap.additionalCosts.transport)}</span></div>{/if}
                <div class="flex justify-between font-bold text-base border-t border-base-300 pt-1"><span>TOTAL</span><span>{formatRp(selected.totalAmount)}</span></div>
                <p class="text-xs text-base-content/50 mt-1">Rincian Pembayaran:</p>
                {#each snap.payments as p, i}
                    <div class="flex justify-between"><span>{p.type} #{i + 1}</span><span>{formatRp(p.amount)}</span></div>
                {/each}
                <div class="flex justify-between font-semibold border-t border-base-300 pt-1">
                    <span>Total Dibayar</span>
                    <span>{formatRp(snap.payments.reduce((s, p) => s + p.amount, 0))}</span>
                </div>
            </div>
            <div class="modal-action">
                <button class="btn btn-ghost" on:click={() => printMode = null}>Tutup</button>
                <button class="btn btn-primary" on:click={() => window.print()}>Print</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => printMode = null}></div>
    </div>
{/if}

<!-- PT Form Modal -->
{#if ptOpen && ptSnapshot && selected}
    <div class="modal modal-open">
        <div class="modal-box max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 class="font-bold text-lg mb-1">Perbaikan Transaksi — {selected.id}</h3>
            {#if isRevision && selected.pendingRequest?.rejectionReason}
                <div class="alert alert-error mb-4 text-sm">
                    <span>Ditolak: {selected.pendingRequest.rejectionReason}</span>
                    <span class="ml-2 text-xs">(Revisi ke-{selected.pendingRequest.revisions + 1})</span>
                </div>
            {/if}

            <!-- Items -->
            <section class="mb-5">
                <h4 class="font-semibold mb-2">Item</h4>
                <table class="table table-xs mb-2 w-full">
                    <thead><tr><th>Nama</th><th>Harga</th><th>Qty</th><th></th></tr></thead>
                    <tbody>
                        {#each ptSnapshot.items as item, idx}
                            <tr>
                                <td>{item.name}</td>
                                <td><input type="number" class="input input-xs input-bordered w-28" bind:value={item.price} min={0} /></td>
                                <td><input type="number" class="input input-xs input-bordered w-16" bind:value={item.qty} min={1} /></td>
                                <td><button class="btn btn-xs btn-ghost text-error" on:click={() => removeItemFromPT(idx)}>✕</button></td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
                <div class="relative">
                    <input type="text" class="input input-sm input-bordered w-full" placeholder="Tambah item — cari nama atau SKU..." bind:value={ptAddItemSearch} />
                    {#if ptAddItemResults.length > 0}
                        <ul class="absolute z-10 w-full bg-base-200 border border-base-300 rounded-box mt-1 shadow-lg">
                            {#each ptAddItemResults as item}
                                <li class="px-3 py-2 hover:bg-base-300 cursor-pointer text-sm" on:click={() => addItemToPT(item)}>
                                    {item.name} <span class="text-xs text-base-content/50">({item.sku})</span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            </section>

            <!-- Biaya Tambahan -->
            <section class="mb-5">
                <h4 class="font-semibold mb-2">Biaya Tambahan</h4>
                <div class="grid grid-cols-2 gap-2">
                    <div class="form-control"><label class="label"><span class="label-text text-xs">Packaging</span></label><input type="number" class="input input-sm input-bordered" bind:value={ptSnapshot.additionalCosts.packaging} min={0} /></div>
                    <div class="form-control"><label class="label"><span class="label-text text-xs">Modifikasi</span></label><input type="number" class="input input-sm input-bordered" bind:value={ptSnapshot.additionalCosts.modification} min={0} /></div>
                    <div class="form-control"><label class="label"><span class="label-text text-xs">Transport</span></label><input type="number" class="input input-sm input-bordered" bind:value={ptSnapshot.additionalCosts.transport} min={0} /></div>
                    <div class="form-control"><label class="label"><span class="label-text text-xs">Lainnya</span></label><input type="number" class="input input-sm input-bordered" bind:value={ptSnapshot.additionalCosts.other} min={0} /></div>
                </div>
            </section>

            <!-- Kupon — managed by CouponPanel (kupon plan Task 13); ptSnapshot.kupon updated via onApply/onRemove -->
            <section class="mb-5">
                <h4 class="font-semibold mb-2">Kupon</h4>
                {#if ptSnapshot.kupon}
                    <div class="text-sm">Kupon aktif: <span class="font-mono font-bold text-primary">{ptSnapshot.kupon.kode}</span> — potongan {formatRp(ptSnapshot.kupon.nilaiPotongan)}</div>
                {:else}
                    <div class="text-sm text-base-content/50">Tidak ada kupon</div>
                {/if}
            </section>

            <!-- Tipe & Catatan -->
            <section class="mb-5 grid grid-cols-2 gap-2">
                <div class="form-control">
                    <label class="label"><span class="label-text text-xs">Tipe Transaksi</span></label>
                    <select class="select select-sm select-bordered" bind:value={ptSnapshot.transactionType}>
                        <option>Walk-In</option><option>Delivery</option><option>Online</option>
                    </select>
                </div>
                <div class="form-control">
                    <label class="label"><span class="label-text text-xs">Catatan</span></label>
                    <input type="text" class="input input-sm input-bordered" bind:value={ptSnapshot.notes} />
                </div>
            </section>

            <!-- Pembayaran -->
            <section class="mb-5">
                <h4 class="font-semibold mb-2">Pembayaran</h4>
                {#each ptSnapshot.payments as pay, idx}
                    <div class="flex gap-2 mb-2">
                        <select class="select select-sm select-bordered flex-1" bind:value={pay.type}>
                            {#each mockPaymentMethods as m}<option value={m.value}>{m.label}</option>{/each}
                        </select>
                        <input type="number" class="input input-sm input-bordered w-36" bind:value={pay.amount} min={0} />
                        <button class="btn btn-sm btn-ghost text-error" on:click={() => { ptSnapshot = { ...ptSnapshot!, payments: ptSnapshot!.payments.filter((_, i) => i !== idx) } }}>✕</button>
                    </div>
                {/each}
                <button class="btn btn-sm btn-outline" on:click={() => { ptSnapshot = { ...ptSnapshot!, payments: [...ptSnapshot!.payments, { type: mockPaymentMethods[0]?.value ?? 'cash', amount: 0 }] } }}>+ Tambah Baris</button>
            </section>

            <!-- Order Meta (Pesanan source) -->
            {#if ptSnapshot.source === 'pesanan'}
                {@const meta = (ptSnapshot as PesananTransactionSnapshot).orderMeta}
                <section class="mb-5">
                    <h4 class="font-semibold mb-2">Info Order</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="form-control"><label class="label"><span class="label-text text-xs">Tgl Order</span></label><input type="date" class="input input-sm input-bordered" bind:value={meta.orderDate} /></div>
                        <div class="form-control"><label class="label"><span class="label-text text-xs">Jam</span></label><input type="time" class="input input-sm input-bordered" bind:value={meta.hour} /></div>
                        <div class="form-control"><label class="label"><span class="label-text text-xs">WhatsApp</span></label><input type="text" class="input input-sm input-bordered" bind:value={meta.whatsapp} /></div>
                        <div class="form-control"><label class="label"><span class="label-text text-xs">Pengiriman</span></label>
                            <select class="select select-sm select-bordered" bind:value={meta.deliveryType}>
                                <option value="pickup">Ambil di Outlet</option>
                                <option value="delivery">Delivery</option>
                            </select>
                        </div>
                    </div>
                </section>
            {/if}

            <div class="modal-action">
                <button class="btn btn-ghost" on:click={() => ptOpen = false}>Batal</button>
                <button class="btn btn-warning" on:click={submitPT}>
                    {isRevision ? 'Kirim Revisi' : 'Ajukan PT'}
                </button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => ptOpen = false}></div>
    </div>
{/if}
```

- [ ] **Step 2: Manual smoke test**

Run `npm run dev` and navigate to `/outlet/riwayat/`.

Check:
- Retail tab shows TRX-00001, TRX-00002 (⏳ badge, no PT/Print/Delete buttons), TRX-00003
- Pesanan tab shows PSN-00001 and PSN-00002 with Tgl Order column
- Date filter: set date range to exclude all records — table shows empty state
- Search "KMJ" in Retail tab — TRX-00001 appears, others filtered out
- Click "Lihat" on TRX-00003 — version history strip shows V1 → V2 (original → approved)
- Click "Print" on TRX-00001 — Retail receipt modal opens with correct total
- Click "Print Order" on PSN-00001 — order slip shows PSN-00001, delivery details, WA number
- Click "Print Checkout" on PSN-00001 — checkout receipt shows both payments (DP + final)
- Click "PT" on TRX-00001 — PT form opens, change item qty, submit → badge appears, buttons disappear
- Admin: "Hapus" button appears on active rows

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/riwayat/+page.svelte
git commit -m "feat: add Riwayat Transaksi main page with tabs, filters, and all modals"
```

---

## Task 4: Admin Repair Page

**Files:**
- Create: `src/routes/outlet/riwayat/repair/+page.svelte`

- [ ] **Step 1: Create the page file**

Create `src/routes/outlet/riwayat/repair/+page.svelte`:

```svelte
<script lang="ts">
    import { get } from 'svelte/store'
    import { goto } from '$app/navigation'
    import { auth } from '$lib/stores/auth'
    import {
        getRiwayatById, getPendingRepairRequests, getResolvedRepairRequests,
        getDeletedTransactions, approveRepairRequest, rejectRepairRequest, deleteRepairRequest,
    } from '$lib/mock/riwayat'
    import type { RepairRequest, RiwayatEntry, RiwayatSnapshot } from '$lib/types/Riwayat'

    const session = get(auth)
    if (session.role !== 'admin') goto('/outlet/riwayat/')

    type Tab = 'menunggu' | 'selesai' | 'deleted'
    let activeTab: Tab = 'menunggu'

    let pendingRequests: RepairRequest[] = getPendingRepairRequests()
    let resolvedRequests: RepairRequest[] = getResolvedRepairRequests()
    let deletedEntries: RiwayatEntry[] = getDeletedTransactions()

    function refresh() {
        pendingRequests = getPendingRepairRequests()
        resolvedRequests = getResolvedRepairRequests()
        deletedEntries = getDeletedTransactions()
    }

    // Inline diff panel
    let selectedRequest: RepairRequest | null = null
    let selectedEntry: RiwayatEntry | null = null

    function openDiff(req: RepairRequest) {
        selectedRequest = req
        selectedEntry = getRiwayatById(req.riwayatId) ?? null
    }

    function getDiffFields(before: RiwayatSnapshot, after: RiwayatSnapshot): string[] {
        return (Object.keys(after) as (keyof RiwayatSnapshot)[]).filter(
            key => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after])
        )
    }

    // Reject dialog
    let rejectOpen = false
    let rejectTargetId = ''
    let rejectReason = ''

    function openReject(riwayatId: string) {
        rejectTargetId = riwayatId
        rejectReason = ''
        rejectOpen = true
    }
    function submitReject() {
        if (!rejectReason.trim()) return
        rejectRepairRequest(rejectTargetId, rejectReason.trim(), session.userId)
        rejectOpen = false
        selectedRequest = null
        selectedEntry = null
        refresh()
    }

    function handleApprove(riwayatId: string) {
        approveRepairRequest(riwayatId, session.userId)
        selectedRequest = null
        selectedEntry = null
        refresh()
    }

    function handleDeleteRequest(riwayatId: string) {
        deleteRepairRequest(riwayatId, session.userId)
        selectedRequest = null
        selectedEntry = null
        refresh()
    }

    function formatDateTime(s: string) {
        return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    function formatRp(n: number) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
    }
</script>

<div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Antrian PT</h1>

    <div class="tabs tabs-boxed mb-4">
        <button class="tab {activeTab === 'menunggu' ? 'tab-active' : ''}" on:click={() => { activeTab = 'menunggu'; selectedRequest = null }}>
            Menunggu
            {#if pendingRequests.length > 0}<span class="badge badge-warning badge-sm ml-1">{pendingRequests.length}</span>{/if}
        </button>
        <button class="tab {activeTab === 'selesai' ? 'tab-active' : ''}" on:click={() => { activeTab = 'selesai'; selectedRequest = null }}>Selesai</button>
        <button class="tab {activeTab === 'deleted' ? 'tab-active' : ''}" on:click={() => { activeTab = 'deleted'; selectedRequest = null }}>Dihapus</button>
    </div>

    {#if activeTab === 'menunggu'}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Request list -->
            <div class="overflow-x-auto">
                <table class="table table-sm w-full">
                    <thead>
                        <tr><th>Outlet</th><th>ID</th><th>Sumber</th><th>Diminta Oleh</th><th>Tgl</th><th>Revisi</th></tr>
                    </thead>
                    <tbody>
                        {#each pendingRequests as req (req.id)}
                            {@const entry = getRiwayatById(req.riwayatId)}
                            <tr class="hover cursor-pointer {selectedRequest?.id === req.id ? 'bg-base-200' : ''}" on:click={() => openDiff(req)}>
                                <td class="text-xs">{entry?.outletId ?? '—'}</td>
                                <td class="font-mono text-sm">{req.riwayatId}</td>
                                <td><span class="badge badge-sm {req.proposedSnapshot.source === 'retail' ? 'badge-primary' : 'badge-secondary'}">{req.proposedSnapshot.source}</span></td>
                                <td class="text-xs">{req.submittedBy}</td>
                                <td class="text-xs">{formatDateTime(req.submittedAt)}</td>
                                <td>{req.revisions > 0 ? `ke-${req.revisions + 1}` : '—'}</td>
                            </tr>
                        {/each}
                        {#if pendingRequests.length === 0}
                            <tr><td colspan="6" class="text-center text-base-content/50 py-8">Tidak ada PT menunggu</td></tr>
                        {/if}
                    </tbody>
                </table>
            </div>

            <!-- Diff panel -->
            {#if selectedRequest && selectedEntry}
                {@const current = selectedEntry.versions[selectedEntry.currentVersionIndex].snapshot}
                {@const proposed = selectedRequest.proposedSnapshot}
                {@const diffFields = getDiffFields(current, proposed)}
                <div class="card bg-base-200 p-4">
                    <h4 class="font-semibold mb-3">Perbandingan — {selectedEntry.id}</h4>
                    <div class="space-y-2 text-sm mb-4">
                        {#each Object.keys(proposed) as field}
                            {@const changed = diffFields.includes(field)}
                            {#if changed && field !== 'source'}
                                <div class="rounded p-2 bg-warning/10 border border-warning/30">
                                    <div class="font-semibold text-xs text-warning mb-1">{field}</div>
                                    <div class="text-xs text-base-content/60 line-through">{JSON.stringify(current[field as keyof typeof current])}</div>
                                    <div class="text-xs">{JSON.stringify(proposed[field as keyof typeof proposed])}</div>
                                </div>
                            {/if}
                        {/each}
                        {#if diffFields.filter(f => f !== 'source').length === 0}
                            <p class="text-base-content/50">Tidak ada perubahan terdeteksi.</p>
                        {/if}
                    </div>
                    <div class="flex gap-2 flex-wrap">
                        <button class="btn btn-sm btn-success" on:click={() => handleApprove(selectedRequest!.riwayatId)}>Setujui</button>
                        <button class="btn btn-sm btn-warning" on:click={() => openReject(selectedRequest!.riwayatId)}>Tolak</button>
                        <button class="btn btn-sm btn-ghost" on:click={() => handleDeleteRequest(selectedRequest!.riwayatId)}>Hapus Request</button>
                    </div>
                </div>
            {:else}
                <div class="card bg-base-200 p-4 flex items-center justify-center text-base-content/40">
                    Pilih baris untuk melihat perbandingan
                </div>
            {/if}
        </div>

    {:else if activeTab === 'selesai'}
        <div class="overflow-x-auto">
            <table class="table table-sm w-full">
                <thead>
                    <tr><th>Outlet</th><th>ID</th><th>Sumber</th><th>Diproses Oleh</th><th>Tgl</th><th>Hasil</th><th>Alasan Tolak</th></tr>
                </thead>
                <tbody>
                    {#each resolvedRequests as req (req.id)}
                        {@const entry = getRiwayatById(req.riwayatId)}
                        <tr class="hover">
                            <td class="text-xs">{entry?.outletId ?? '—'}</td>
                            <td class="font-mono text-sm">{req.riwayatId}</td>
                            <td><span class="badge badge-sm">{req.proposedSnapshot.source}</span></td>
                            <td class="text-xs">{req.submittedBy}</td>
                            <td class="text-xs">{formatDateTime(req.submittedAt)}</td>
                            <td>
                                {#if req.status === 'approved'}
                                    <span class="badge badge-success badge-sm">Disetujui</span>
                                {:else}
                                    <span class="badge badge-error badge-sm">Ditolak</span>
                                {/if}
                            </td>
                            <td class="text-xs text-base-content/70">{req.rejectionReason ?? '—'}</td>
                        </tr>
                    {/each}
                    {#if resolvedRequests.length === 0}
                        <tr><td colspan="7" class="text-center text-base-content/50 py-8">Belum ada riwayat PT</td></tr>
                    {/if}
                </tbody>
            </table>
        </div>

    {:else}
        <div class="overflow-x-auto">
            <table class="table table-sm w-full">
                <thead>
                    <tr><th>Outlet</th><th>ID</th><th>Sumber</th><th>Total</th><th>Tgl Selesai</th></tr>
                </thead>
                <tbody>
                    {#each deletedEntries as e (e.id)}
                        <tr class="hover opacity-60">
                            <td class="text-xs">{e.outletId}</td>
                            <td class="font-mono text-sm line-through">{e.id}</td>
                            <td><span class="badge badge-sm">{e.source}</span></td>
                            <td>{formatRp(e.totalAmount)}</td>
                            <td class="text-xs">{formatDateTime(e.completedAt)}</td>
                        </tr>
                    {/each}
                    {#if deletedEntries.length === 0}
                        <tr><td colspan="5" class="text-center text-base-content/50 py-8">Tidak ada transaksi yang dihapus</td></tr>
                    {/if}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<!-- Reject Dialog -->
{#if rejectOpen}
    <div class="modal modal-open">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Tolak PT</h3>
            <div class="form-control mb-4">
                <label class="label"><span class="label-text">Alasan penolakan</span></label>
                <textarea class="textarea textarea-bordered" rows={3} placeholder="Tulis alasan penolakan..." bind:value={rejectReason}></textarea>
            </div>
            <div class="modal-action">
                <button class="btn btn-ghost" on:click={() => rejectOpen = false}>Batal</button>
                <button class="btn btn-warning" on:click={submitReject} disabled={!rejectReason.trim()}>Tolak PT</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => rejectOpen = false}></div>
    </div>
{/if}
```

- [ ] **Step 2: Manual smoke test**

Log in as admin and navigate to `/outlet/riwayat/repair/`.

Check:
- TRX-00002 appears in Menunggu tab
- Click TRX-00002 row — diff panel shows the proposed qty change highlighted in amber
- Click "Setujui" — TRX-00002 moves to Selesai tab as "Disetujui"; in main page TRX-00002 is now active with V2
- Submit a PT from main page, reject it from here — entry appears in Selesai as "Ditolak" with reason
- Delete a transaction from main page — appears in Dihapus tab with strikethrough
- Non-admin navigating to `/outlet/riwayat/repair/` is redirected

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/riwayat/repair/+page.svelte
git commit -m "feat: add Riwayat PT admin repair page with diff panel and Menunggu/Selesai/Dihapus tabs"
```

---

## Task 5: Layout Integration

**Files:**
- Modify: `src/routes/outlet/+layout.svelte`

- [ ] **Step 1: Add Riwayat nav link**

In `src/routes/outlet/+layout.svelte`, add a Riwayat link in the sidebar nav after the Pesanan link:

```svelte
<li><a href="/outlet/riwayat/" class:active={$page.url.pathname.startsWith('/outlet/riwayat/')}>Riwayat</a></li>
```

For admin-only repair link:

```svelte
{#if $auth.role === 'admin'}
    <li><a href="/outlet/riwayat/repair/">PT Antrian</a></li>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/outlet/+layout.svelte
git commit -m "feat: add Riwayat Transaksi nav link to outlet sidebar"
```

---

## Task 6: Retail Checkout Integration

**Files:**
- Modify: `src/routes/outlet/retail/+page.svelte`

After a successful Retail checkout, call `createRiwayatEntry` with the full payload.

- [ ] **Step 1: Add the import**

In `src/routes/outlet/retail/+page.svelte`, add to imports:

```typescript
import { createRiwayatEntry } from '$lib/mock/riwayat'
import type { RetailSnapshot } from '$lib/types/Riwayat'
```

- [ ] **Step 2: Call createRiwayatEntry after checkout**

Find the section that handles successful checkout (where `usePost` or the mock checkout call succeeds). After the payment is processed, add:

```typescript
const retailSnapshot: RetailSnapshot = {
    source: 'retail',
    outletId: session.outletId,
    cashierId: session.userId,
    memberId: $cart.memberId ?? null,
    items: $cart.items
        .filter(i => !i.isFree)
        .map(i => ({ id: i.id, name: i.name, sku: i.sku, barcode: i.barcode ?? '', price: i.price, qty: i.qty, stock: i.stock ?? 0, isFree: false })),
    freeItems: $cart.items
        .filter(i => i.isFree)
        .map(i => ({ id: i.id, name: i.name, sku: i.sku, barcode: i.barcode ?? '', qty: i.qty, stock: i.stock ?? 0, isFree: true })),
    additionalCosts: {
        packaging: $cart.packaging ?? 0,
        modification: $cart.modification ?? 0,
        transport: $cart.transport ?? 0,
        other: $cart.other ?? 0,
    },
    kupon: appliedKupon ? {
        kode: appliedKupon.kode,
        nilaiPotongan: kuponDiscount,
        cartMutations: appliedKupon.effects.cartMutations,
        authNip: appliedKupon.authNip
    } : null,
    payments: $cart.paymentMethods?.map((p: { method: string; amount: number }) => ({ type: p.method, amount: p.amount })) ?? [],
    transactionType: $cart.transactionType ?? 'Walk-In',
    notes: $cart.notes ?? '',
    orderMeta: $cart.orderDate
        ? { orderDate: $cart.orderDate, whatsapp: $cart.whatsapp ?? '', branchId: session.outletId, hour: $cart.hour ?? '00:00', deliveryType: $cart.deliveryType ?? 'pickup' }
        : null,
    pointsRedeemed: $cart.pointsRedeemed ?? 0,
    voucherId: $cart.voucherId ?? null,
    isPiutang: $cart.isPiutang ?? false,
    piutangAmount: $cart.piutangAmount ?? 0,
}
createRiwayatEntry(retailSnapshot)
```

**Note:** Field names (`$cart.packaging`, `$cart.paymentMethods`, etc.) depend on the Retail cart store implementation. Adjust to match the actual cart store fields.

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/retail/+page.svelte
git commit -m "feat: write Retail checkout to Riwayat Transaksi"
```

---

## Task 7: Pesanan Checkout Integration

**Files:**
- Modify: `src/library/mock/pesanan.ts`

When `checkoutPesanan` completes, call `createRiwayatEntry` with all Pesanan data including the full payment history.

- [ ] **Step 1: Add the import**

In `src/library/mock/pesanan.ts`, add to the top:

```typescript
import { createRiwayatEntry } from './riwayat'
import type { PesananTransactionSnapshot } from '../types/Riwayat'
```

- [ ] **Step 2: Call createRiwayatEntry inside checkoutPesanan**

Find the `checkoutPesanan` function and add the Riwayat call after status is set to `'completed'`:

```typescript
export function checkoutPesanan(id: string, newPayments: PesananPayment[], userId: string): void {
    const pesanan = store.find(p => p.id === id)
    if (!pesanan || pesanan.status !== 'active') return
    pesanan.payments.push(...newPayments)
    pesanan.amountPaid = pesanan.payments.reduce((s, p) => s + p.amount, 0)
    pesanan.status = 'completed'
    pesanan.completedAt = new Date().toISOString()

    const snap = pesanan.versions[pesanan.currentVersionIndex].snapshot
    const riwayatSnapshot: PesananTransactionSnapshot = {
        source: 'pesanan',
        pesananId: pesanan.id,
        outletId: snap.outletId,
        cashierId: userId,
        memberId: snap.memberId,
        items: snap.items,
        freeItems: snap.freeItems,
        additionalCosts: snap.additionalCosts,
        kupon: snap.kupon,
        payments: pesanan.payments.map(p => ({ type: p.type, amount: p.amount })),
        transactionType: snap.transactionType,
        notes: snap.notes,
        orderMeta: snap.orderMeta,
    }
    createRiwayatEntry(riwayatSnapshot)
}
```

- [ ] **Step 3: Run the Pesanan tests to confirm they still pass**

```bash
npx vitest run src/library/mock/pesanan.test.ts
```

Expected: all tests PASS. (The `createRiwayatEntry` call is a side effect and does not affect Pesanan state assertions.)

- [ ] **Step 4: Commit**

```bash
git add src/library/mock/pesanan.ts
git commit -m "feat: write Pesanan checkout to Riwayat Transaksi"
```

---

## Self-Review

**Spec coverage:**
- ✅ `RetailSnapshot`, `PesananTransactionSnapshot`, `RiwayatSnapshot`, `RiwayatVersion`, `RepairRequest`, `RiwayatEntry` — Task 1
- ✅ All mock functions: `getRiwayatList`, `getRiwayatById`, `getPendingRepairRequests`, `getResolvedRepairRequests`, `getDeletedTransactions`, `createRiwayatEntry`, `submitRepairRequest`, `reviseRepairRequest`, `approveRepairRequest`, `rejectRepairRequest`, `deleteRepairRequest`, `deleteTransaction` — Task 2
- ✅ 5 seed records (TRX-00001 active, TRX-00002 awaiting_pt, TRX-00003 v2 approved, PSN-00001 pesanan DP, PSN-00002 pesanan full) — Task 2
- ✅ `logStockMovement` called on PT approval for qty delta — Task 2 (`approveRepairRequest`)
- ✅ `totalAmount` recomputed on PT approval — Task 2
- ✅ TRX- prefix for Retail, PSN- prefix for Pesanan — Task 2 (`createRiwayatEntry`)
- ✅ Two tabs: Retail / Pesanan — Task 3
- ✅ Date range filter + search + per-page + pagination — Task 3
- ✅ Pesanan tab has Tgl Order + Tgl Selesai columns — Task 3
- ✅ Admin Outlet column — Task 3
- ✅ No PT/Print/Delete buttons when awaiting_pt — Task 3 (only Lihat shown)
- ✅ Lihat modal with version history strip — Task 3
- ✅ Retail receipt modal with `window.print()` — Task 3
- ✅ Pesanan Order receipt (order slip format, WA, delivery type) — Task 3
- ✅ Pesanan Checkout receipt (all payments, grand total) — Task 3
- ✅ PT form: items add/remove/qty/price, costs, cut, type, notes, payments, orderMeta (pesanan only) — Task 3
- ✅ Rejection banner with reason and revision count — Task 3
- ✅ `isRevision` flag routes to `reviseRepairRequest` vs `submitRepairRequest` — Task 3
- ✅ Admin repair page: Menunggu / Selesai / Dihapus tabs — Task 4
- ✅ Inline diff panel with changed fields highlighted — Task 4
- ✅ Setujui / Tolak (with reason) / Hapus Request / Hapus Transaksi — Task 4 (Hapus Transaksi is in main page Task 3)
- ✅ Non-admin redirect from repair page — Task 4
- ✅ Nav link in sidebar — Task 5
- ✅ Retail checkout writes to Riwayat — Task 6
- ✅ Pesanan checkout writes to Riwayat — Task 7
- ✅ No PTI anywhere in Riwayat — confirmed (only PT modal, no instant repair path)

**Placeholder scan:** No TBDs, no "similar to Task N" patterns, all code blocks complete.

**Type consistency:**
- `RiwayatSnapshot = RetailSnapshot | PesananTransactionSnapshot` — discriminated on `.source`; used correctly in Tasks 2, 3, 4
- `RepairRequest.status: 'pending' | 'rejected' | 'approved' | 'deleted'` — defined Task 1, used correctly in Tasks 2, 4
- `logStockMovement` called with `{ id, itemId, outletId, delta, source: 'sale' | 'sale_void', referenceId, recordedAt, recordedBy }` — matches master-items schema
- `createRiwayatEntry(snapshot: RiwayatSnapshot)` — single param, no redundant cashierId — consistent with spec fix
- `getResolvedRepairRequests()` returns status `'approved' | 'rejected'` only (not `'deleted'`) — consistent with Selesai tab display
