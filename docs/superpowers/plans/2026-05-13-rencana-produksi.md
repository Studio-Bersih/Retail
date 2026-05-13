# Rencana Produksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production batch feature where staff plan and finalize multi-item production runs, with admin-gated PT corrections that reverse or adjust stock movements via `produksi_pt`.

**Architecture:** TypeScript interfaces in `types/RencanaProduksi.ts`. One mock module owns all CRUD, finalization, and PT resolution logic — it uses an internal `applyDelta` helper that reads `getOutletStock` (mutable reference), updates `.stock` directly, then calls `logStockMovement`. Two Svelte files handle the outlet side (list + shared `RencanaModal`); one Svelte file handles the factory PT queue.

**Tech Stack:** SvelteKit, TypeScript, TailwindCSS, DaisyUI, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/library/types/RencanaProduksi.ts` | Create | All interfaces: RencanaProduksi, RencanaItem, RencanaKomponen, RencanaPTRequest, payload types |
| `src/library/mock/rencana-produksi.ts` | Create | In-memory store + CRUD + finalization + PT resolution; internal `applyDelta` helper |
| `src/library/mock/rencana-produksi.test.ts` | Create | Vitest unit tests for all mock functions |
| `src/library/components/rencana-produksi/RencanaModal.svelte` | Create | Batch detail — create/edit/view/PT request; item cards with output picker, components, struktur hint |
| `src/routes/outlet/rencana-produksi/+page.svelte` | Create | Outlet list page — search, status filter, pagination, opens RencanaModal |
| `src/routes/factory/rencana-produksi/+page.svelte` | Create | Admin PT queue — pending/resolved tabs, per-request diff view, admin action buttons |

---

### Task 1: TypeScript Types

**Files:**
- Create: `src/library/types/RencanaProduksi.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/RencanaProduksi.ts

export interface RencanaKomponen {
    itemId: string      // MasterItem.id — consumed input material
    qty: number         // total qty consumed for the full run
}

export interface RencanaItem {
    outputItemId: string                        // MasterItem.id — finished_good or both
    outputQty: number                           // units to produce (min 1)
    components: RencanaKomponen[]               // what gets consumed — user-editable, may be empty
    strukturSnapshot: { itemId: string; qty: number }[] | null
    // per-unit structure components at draft creation time; null if no structure existed
}

export interface RencanaProduksi {
    id: string                  // "RP-00001" format
    outletId: string
    items: RencanaItem[]        // at least 1 item
    tanggalRencana: string      // ISO date — target production date
    notes: string | null
    status: 'draft' | 'selesai'
    createdBy: string
    createdAt: string
    finalizedBy: string | null
    finalizedAt: string | null
}

export type RencanaPTStatus = 'pending' | 'rejected' | 'accepted_adjusted' | 'accepted_deleted'

export interface RencanaPTRequest {
    id: string
    rencanaId: string
    proposedItems: RencanaItem[]    // full proposed replacement of the items array
    notes: string | null            // requester's explanation
    requestedBy: string
    requestedAt: string
    status: RencanaPTStatus
    rejectionReason: string | null
    reviewedBy: string | null
    reviewedAt: string | null
}

export interface CreateRencanaPayload {
    items: RencanaItem[]
    tanggalRencana: string
    notes: string | null
}

export type UpdateRencanaPayload = Partial<CreateRencanaPayload>
```

- [ ] **Step 2: Commit**

```bash
git add src/library/types/RencanaProduksi.ts
git commit -m "feat: add RencanaProduksi TypeScript types"
```

---

### Task 2: Mock Store + Tests

**Files:**
- Create: `src/library/mock/rencana-produksi.ts`
- Create: `src/library/mock/rencana-produksi.test.ts`

**Key design notes:**
- `applyDelta` is an internal helper: reads `getOutletStock` (returns a mutable reference), mutates `.stock` directly, then calls `logStockMovement` with the pre-mutation `stockBefore`.
- `finalizeRencana` calls `applyDelta` for each item's output (`produksi_produce`) and each component (`produksi_consume`).
- `acceptAndAdjust` computes the delta between original and proposed for each output item and component, then logs `produksi_pt` movements.
- `deleteAndNullify` reverses all original movements with `produksi_pt`, then deletes the record.

- [ ] **Step 1: Write failing tests**

```typescript
// src/library/mock/rencana-produksi.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
    getRencanaProduksiList,
    getRencanaById,
    getPTRequests,
    getPTRequestByRencana,
    createRencanaDraft,
    updateRencanaDraft,
    deleteRencanaDraft,
    finalizeRencana,
    submitPTRequest,
    rejectPTRequest,
    acceptAndAdjust,
    deleteAndNullify,
    _resetRencana,
} from './rencana-produksi'
import { _resetMovements, getStockMovements } from './stock-movements'
import { _resetItems } from './master-items'
import type { RencanaProduksi, RencanaPTRequest } from '../types/RencanaProduksi'
import type { MasterItem, OutletStock } from '../types/MasterItem'

// Minimal seed data — self-contained, no dependency on the real master-items seed
const outletId = 'outlet-test-001'

const mockItems: MasterItem[] = [
    {
        id: 'out-A', sku: 'OUT-A', barcode: null, name: 'Output A', description: null,
        imageUrl: null, category: 'Test', satuan: 'Pcs', itemType: 'finished_good',
        weight: null, height: null, priceLevel1: 10000, priceLevel2: 0, priceLevel3: 0,
        priceLevel4: 0, priceLevel5: 0, isActive: true, availableRegions: ['Test'],
        createdBy: 'seed', createdAt: '2026-01-01T00:00:00Z', updatedBy: null, updatedAt: null,
    },
    {
        id: 'out-B', sku: 'OUT-B', barcode: null, name: 'Output B', description: null,
        imageUrl: null, category: 'Test', satuan: 'Pcs', itemType: 'finished_good',
        weight: null, height: null, priceLevel1: 20000, priceLevel2: 0, priceLevel3: 0,
        priceLevel4: 0, priceLevel5: 0, isActive: true, availableRegions: ['Test'],
        createdBy: 'seed', createdAt: '2026-01-01T00:00:00Z', updatedBy: null, updatedAt: null,
    },
    {
        id: 'raw-X', sku: 'RAW-X', barcode: null, name: 'Raw X', description: null,
        imageUrl: null, category: 'Test', satuan: 'g', itemType: 'raw_material',
        weight: null, height: null, priceLevel1: 0, priceLevel2: 0, priceLevel3: 0,
        priceLevel4: 0, priceLevel5: 0, isActive: true, availableRegions: ['Test'],
        createdBy: 'seed', createdAt: '2026-01-01T00:00:00Z', updatedBy: null, updatedAt: null,
    },
]

const mockOutletStocks: OutletStock[] = [
    { itemId: 'out-A', outletId, region: 'Test', stock: 0, preAdjDelta: 0 },
    { itemId: 'out-B', outletId, region: 'Test', stock: 0, preAdjDelta: 0 },
    { itemId: 'raw-X', outletId, region: 'Test', stock: 1000, preAdjDelta: 0 },
]

const seedRencana: RencanaProduksi[] = [
    {
        id: 'RP-00001',
        outletId,
        items: [
            {
                outputItemId: 'out-A',
                outputQty: 5,
                components: [{ itemId: 'raw-X', qty: 500 }],
                strukturSnapshot: null,
            },
        ],
        tanggalRencana: '2026-05-10',
        notes: null,
        status: 'selesai',
        createdBy: 'user-1',
        createdAt: '2026-05-09T08:00:00Z',
        finalizedBy: 'user-1',
        finalizedAt: '2026-05-09T09:00:00Z',
    },
    {
        id: 'RP-00002',
        outletId,
        items: [
            {
                outputItemId: 'out-B',
                outputQty: 3,
                components: [],
                strukturSnapshot: null,
            },
        ],
        tanggalRencana: '2026-05-15',
        notes: 'batch kedua',
        status: 'draft',
        createdBy: 'user-2',
        createdAt: '2026-05-10T10:00:00Z',
        finalizedBy: null,
        finalizedAt: null,
    },
]

beforeEach(() => {
    _resetMovements()
    _resetItems(mockItems, mockOutletStocks.map(s => ({ ...s })))
    _resetRencana(
        seedRencana.map(r => ({ ...r, items: r.items.map(i => ({ ...i, components: i.components.map(c => ({ ...c })) })) })),
        []
    )
})

describe('getRencanaProduksiList', () => {
    it('returns only records for the given outlet', () => {
        const list = getRencanaProduksiList(outletId)
        expect(list).toHaveLength(2)
    })

    it('returns empty array for unknown outlet', () => {
        expect(getRencanaProduksiList('outlet-unknown')).toEqual([])
    })
})

describe('getRencanaById', () => {
    it('returns the record by id', () => {
        expect(getRencanaById('RP-00001')?.id).toBe('RP-00001')
    })

    it('returns undefined for unknown id', () => {
        expect(getRencanaById('RP-99999')).toBeUndefined()
    })
})

describe('createRencanaDraft', () => {
    it('creates a draft with correct fields', () => {
        const result = createRencanaDraft(
            {
                items: [{ outputItemId: 'out-A', outputQty: 2, components: [], strukturSnapshot: null }],
                tanggalRencana: '2026-06-01',
                notes: 'test batch',
            },
            'user-3',
            outletId
        )
        expect(result.status).toBe('draft')
        expect(result.outletId).toBe(outletId)
        expect(result.createdBy).toBe('user-3')
        expect(result.finalizedBy).toBeNull()
        expect(result.id).toMatch(/^RP-\d{5}$/)
    })

    it('persists the new draft', () => {
        createRencanaDraft(
            { items: [{ outputItemId: 'out-A', outputQty: 1, components: [], strukturSnapshot: null }], tanggalRencana: '2026-06-01', notes: null },
            'user-3', outletId
        )
        expect(getRencanaProduksiList(outletId)).toHaveLength(3)
    })
})

describe('updateRencanaDraft', () => {
    it('updates notes and tanggalRencana', () => {
        const updated = updateRencanaDraft('RP-00002', { notes: 'updated', tanggalRencana: '2026-05-20' }, 'user-2')
        expect(updated.notes).toBe('updated')
        expect(updated.tanggalRencana).toBe('2026-05-20')
    })

    it('throws when trying to update a finalized record', () => {
        expect(() => updateRencanaDraft('RP-00001', { notes: 'x' }, 'user-1')).toThrow()
    })

    it('throws when id not found', () => {
        expect(() => updateRencanaDraft('RP-99999', { notes: 'x' }, 'user-1')).toThrow('Rencana not found: RP-99999')
    })
})

describe('deleteRencanaDraft', () => {
    it('removes a draft from the store', () => {
        deleteRencanaDraft('RP-00002')
        expect(getRencanaById('RP-00002')).toBeUndefined()
        expect(getRencanaProduksiList(outletId)).toHaveLength(1)
    })

    it('throws when trying to delete a finalized record', () => {
        expect(() => deleteRencanaDraft('RP-00001')).toThrow('Cannot delete finalized rencana')
    })

    it('throws when id not found', () => {
        expect(() => deleteRencanaDraft('RP-99999')).toThrow('Rencana not found: RP-99999')
    })
})

describe('finalizeRencana', () => {
    it('sets status to selesai and records finalizedBy', () => {
        const result = finalizeRencana('RP-00002', 'user-2')
        expect(result.status).toBe('selesai')
        expect(result.finalizedBy).toBe('user-2')
        expect(result.finalizedAt).toBeTruthy()
    })

    it('logs produksi_produce movement for each output item', () => {
        finalizeRencana('RP-00002', 'user-2')
        // out-B qty 3, no components
        const movements = getStockMovements('out-B', outletId)
        expect(movements).toHaveLength(1)
        expect(movements[0].source).toBe('produksi_produce')
        expect(movements[0].delta).toBe(3)
    })

    it('logs produksi_consume movement for each component', () => {
        // Create a draft with a component and finalize it
        const draft = createRencanaDraft(
            { items: [{ outputItemId: 'out-A', outputQty: 2, components: [{ itemId: 'raw-X', qty: 200 }], strukturSnapshot: null }], tanggalRencana: '2026-06-01', notes: null },
            'user-3', outletId
        )
        finalizeRencana(draft.id, 'user-3')
        const movements = getStockMovements('raw-X', outletId)
        expect(movements).toHaveLength(1)
        expect(movements[0].source).toBe('produksi_consume')
        expect(movements[0].delta).toBe(-200)
    })

    it('throws when trying to finalize an already-finalized record', () => {
        expect(() => finalizeRencana('RP-00001', 'user-1')).toThrow('already finalized')
    })
})

describe('submitPTRequest', () => {
    it('creates a pending PT request', () => {
        const pt = submitPTRequest(
            'RP-00001',
            [{ outputItemId: 'out-A', outputQty: 3, components: [{ itemId: 'raw-X', qty: 300 }], strukturSnapshot: null }],
            'produksi terlalu banyak',
            'user-1'
        )
        expect(pt.status).toBe('pending')
        expect(pt.rencanaId).toBe('RP-00001')
        expect(pt.requestedBy).toBe('user-1')
        expect(pt.notes).toBe('produksi terlalu banyak')
    })

    it('throws when rencana is a draft', () => {
        expect(() => submitPTRequest('RP-00002', [], null, 'user-2')).toThrow('PT can only be requested for finalized rencana')
    })

    it('throws when a pending PT already exists', () => {
        submitPTRequest('RP-00001', [], null, 'user-1')
        expect(() => submitPTRequest('RP-00001', [], null, 'user-1')).toThrow('A PT request is already pending')
    })
})

describe('rejectPTRequest', () => {
    it('sets status to rejected with reason', () => {
        const pt = submitPTRequest('RP-00001', [], null, 'user-1')
        const rejected = rejectPTRequest(pt.id, 'data sudah benar', 'admin-1')
        expect(rejected.status).toBe('rejected')
        expect(rejected.rejectionReason).toBe('data sudah benar')
        expect(rejected.reviewedBy).toBe('admin-1')
    })

    it('allows a new PT request after rejection', () => {
        const pt = submitPTRequest('RP-00001', [], null, 'user-1')
        rejectPTRequest(pt.id, 'x', 'admin-1')
        expect(() => submitPTRequest('RP-00001', [], null, 'user-1')).not.toThrow()
    })
})

describe('acceptAndAdjust', () => {
    it('logs produksi_pt movements for output qty reduction', () => {
        // RP-00001: out-A × 5 (original). Propose out-A × 3.
        const pt = submitPTRequest(
            'RP-00001',
            [{ outputItemId: 'out-A', outputQty: 3, components: [{ itemId: 'raw-X', qty: 500 }], strukturSnapshot: null }],
            null, 'user-1'
        )
        acceptAndAdjust(pt.id, 'admin-1')
        const movements = getStockMovements('out-A', outletId)
        expect(movements.some(m => m.source === 'produksi_pt' && m.delta === -2)).toBe(true)
    })

    it('logs produksi_pt movements for component qty reduction', () => {
        // RP-00001: raw-X × 500 (original). Propose raw-X × 300.
        const pt = submitPTRequest(
            'RP-00001',
            [{ outputItemId: 'out-A', outputQty: 5, components: [{ itemId: 'raw-X', qty: 300 }], strukturSnapshot: null }],
            null, 'user-1'
        )
        acceptAndAdjust(pt.id, 'admin-1')
        // raw-X was over-consumed by 200: stock should be returned (+200)
        const movements = getStockMovements('raw-X', outletId)
        expect(movements.some(m => m.source === 'produksi_pt' && m.delta === 200)).toBe(true)
    })

    it('updates rencana items to proposed values', () => {
        const proposed = [{ outputItemId: 'out-A', outputQty: 3, components: [{ itemId: 'raw-X', qty: 300 }], strukturSnapshot: null }]
        const pt = submitPTRequest('RP-00001', proposed, null, 'user-1')
        acceptAndAdjust(pt.id, 'admin-1')
        const updated = getRencanaById('RP-00001')!
        expect(updated.items[0].outputQty).toBe(3)
        expect(updated.items[0].components[0].qty).toBe(300)
    })

    it('sets PT status to accepted_adjusted', () => {
        const pt = submitPTRequest('RP-00001', [{ outputItemId: 'out-A', outputQty: 5, components: [{ itemId: 'raw-X', qty: 500 }], strukturSnapshot: null }], null, 'user-1')
        const result = acceptAndAdjust(pt.id, 'admin-1')
        expect(result.status).toBe('accepted_adjusted')
        expect(result.reviewedBy).toBe('admin-1')
    })
})

describe('deleteAndNullify', () => {
    it('deletes the rencana record', () => {
        const pt = submitPTRequest('RP-00001', [], null, 'user-1')
        deleteAndNullify(pt.id, 'admin-1')
        expect(getRencanaById('RP-00001')).toBeUndefined()
    })

    it('logs reversal movements with produksi_pt for output item', () => {
        const pt = submitPTRequest('RP-00001', [], null, 'user-1')
        deleteAndNullify(pt.id, 'admin-1')
        // out-A was +5 on finalization → should be reversed to -5
        const movements = getStockMovements('out-A', outletId)
        expect(movements.some(m => m.source === 'produksi_pt' && m.delta === -5)).toBe(true)
    })

    it('logs reversal movements with produksi_pt for components', () => {
        const pt = submitPTRequest('RP-00001', [], null, 'user-1')
        deleteAndNullify(pt.id, 'admin-1')
        // raw-X was -500 on finalization → should be returned +500
        const movements = getStockMovements('raw-X', outletId)
        expect(movements.some(m => m.source === 'produksi_pt' && m.delta === 500)).toBe(true)
    })

    it('sets PT status to accepted_deleted', () => {
        const pt = submitPTRequest('RP-00001', [], null, 'user-1')
        deleteAndNullify(pt.id, 'admin-1')
        const pts = getPTRequests('accepted_deleted')
        expect(pts).toHaveLength(1)
    })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/library/mock/rencana-produksi.test.ts
```

Expected: FAIL — `Cannot find module './rencana-produksi'`

> **Before implementing:** Read `src/library/mock/master-items.ts` to confirm that `_resetItems` accepts `(items: MasterItem[], stocks: OutletStock[])` and that `getOutletStock` returns a mutable reference (not a copy). Adjust the test's `_resetItems` call if the signature differs.
>
> Also read `src/library/types/MasterItem.ts` and check whether `StockMovementSource` already includes `'produksi_produce' | 'produksi_consume' | 'produksi_pt'`. If not, add them to the union before implementing the mock — the TypeScript compiler will reject the `source` argument in `applyDelta` otherwise.

- [ ] **Step 3: Implement the mock**

```typescript
// src/library/mock/rencana-produksi.ts
import type { RencanaProduksi, RencanaItem, RencanaKomponen, RencanaPTRequest, CreateRencanaPayload, UpdateRencanaPayload } from '../types/RencanaProduksi'
import type { StockMovementSource } from '../types/MasterItem'
import { getOutletStock } from './master-items'
import { logStockMovement } from './stock-movements'

let rencanaStore: RencanaProduksi[] = [
    {
        id: 'RP-00001',
        outletId: 'outlet-seed-001',
        items: [
            {
                outputItemId: 'item-seed-006',   // Kue Brownies
                outputQty: 10,
                components: [
                    { itemId: 'item-seed-004', qty: 5000 },  // Tepung Terigu 5000g
                    { itemId: 'item-seed-005', qty: 3000 },  // Gula Pasir 3000g
                ],
                strukturSnapshot: [
                    { itemId: 'item-seed-004', qty: 500 },
                    { itemId: 'item-seed-005', qty: 300 },
                ],
            },
        ],
        tanggalRencana: '2026-05-10',
        notes: null,
        status: 'selesai',
        createdBy: 'user-seed-001',
        createdAt: '2026-05-09T08:00:00.000Z',
        finalizedBy: 'user-seed-001',
        finalizedAt: '2026-05-09T09:00:00.000Z',
    },
    {
        id: 'RP-00002',
        outletId: 'outlet-seed-001',
        items: [
            {
                outputItemId: 'item-seed-007',   // Eid Hampers
                outputQty: 5,
                components: [{ itemId: 'item-seed-004', qty: 1000 }],
                strukturSnapshot: [{ itemId: 'item-seed-004', qty: 200 }],
            },
            {
                outputItemId: 'item-seed-001',   // Yakult Slop (no structure — manual)
                outputQty: 20,
                components: [],
                strukturSnapshot: null,
            },
        ],
        tanggalRencana: '2026-05-15',
        notes: 'Batch produksi minggu ini',
        status: 'draft',
        createdBy: 'user-seed-002',
        createdAt: '2026-05-10T10:00:00.000Z',
        finalizedBy: null,
        finalizedAt: null,
    },
]

let ptStore: RencanaPTRequest[] = []

let rencanaCounter = 2
let ptCounter = 0

// Internal helper: reads mutable OutletStock reference, updates .stock, then logs movement
function applyDelta(
    itemId: string,
    outletId: string,
    delta: number,
    source: StockMovementSource,
    sourceId: string,
    executedBy: string
): void {
    const stock = getOutletStock(itemId, outletId)
    const stockBefore = stock?.stock ?? 0
    if (stock) stock.stock += delta
    logStockMovement({ itemId, outletId, delta, source, sourceId, stockBefore, executedBy })
}

function deepCopyItems(items: RencanaItem[]): RencanaItem[] {
    return items.map(i => ({
        ...i,
        components: i.components.map(c => ({ ...c })),
        strukturSnapshot: i.strukturSnapshot ? i.strukturSnapshot.map(s => ({ ...s })) : null,
    }))
}

function deepCopyRencana(r: RencanaProduksi): RencanaProduksi {
    return { ...r, items: deepCopyItems(r.items) }
}

function deepCopyPT(p: RencanaPTRequest): RencanaPTRequest {
    return { ...p, proposedItems: deepCopyItems(p.proposedItems) }
}

function getRencanaProduksiList(outletId: string): RencanaProduksi[] {
    return rencanaStore.filter(r => r.outletId === outletId).map(deepCopyRencana)
}

function getRencanaById(id: string): RencanaProduksi | undefined {
    const r = rencanaStore.find(r => r.id === id)
    return r ? deepCopyRencana(r) : undefined
}

function getPTRequests(status?: RencanaPTRequest['status']): RencanaPTRequest[] {
    const list = status ? ptStore.filter(p => p.status === status) : ptStore
    return list.map(deepCopyPT)
}

function getPTRequestByRencana(rencanaId: string): RencanaPTRequest | undefined {
    const p = ptStore.find(p => p.rencanaId === rencanaId)
    return p ? deepCopyPT(p) : undefined
}

function createRencanaDraft(payload: CreateRencanaPayload, userId: string, outletId: string): RencanaProduksi {
    const id = `RP-${String(++rencanaCounter).padStart(5, '0')}`
    const newRencana: RencanaProduksi = {
        id,
        outletId,
        items: deepCopyItems(payload.items),
        tanggalRencana: payload.tanggalRencana,
        notes: payload.notes,
        status: 'draft',
        createdBy: userId,
        createdAt: new Date().toISOString(),
        finalizedBy: null,
        finalizedAt: null,
    }
    rencanaStore.push(newRencana)
    return deepCopyRencana(newRencana)
}

function updateRencanaDraft(id: string, payload: UpdateRencanaPayload, userId: string): RencanaProduksi {
    const idx = rencanaStore.findIndex(r => r.id === id)
    if (idx === -1) throw new Error(`Rencana not found: ${id}`)
    if (rencanaStore[idx].status !== 'draft') throw new Error(`Rencana ${id} is not a draft — cannot update`)
    rencanaStore[idx] = {
        ...rencanaStore[idx],
        ...(payload.items !== undefined ? { items: deepCopyItems(payload.items) } : {}),
        ...(payload.tanggalRencana !== undefined ? { tanggalRencana: payload.tanggalRencana } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    }
    return deepCopyRencana(rencanaStore[idx])
}

function deleteRencanaDraft(id: string): void {
    const idx = rencanaStore.findIndex(r => r.id === id)
    if (idx === -1) throw new Error(`Rencana not found: ${id}`)
    if (rencanaStore[idx].status !== 'draft') throw new Error(`Cannot delete finalized rencana: ${id}`)
    rencanaStore.splice(idx, 1)
}

function finalizeRencana(id: string, userId: string): RencanaProduksi {
    const idx = rencanaStore.findIndex(r => r.id === id)
    if (idx === -1) throw new Error(`Rencana not found: ${id}`)
    if (rencanaStore[idx].status !== 'draft') throw new Error(`Rencana ${id} is already finalized`)
    const rencana = rencanaStore[idx]
    for (const item of rencana.items) {
        applyDelta(item.outputItemId, rencana.outletId, item.outputQty, 'produksi_produce', id, userId)
        for (const comp of item.components) {
            applyDelta(comp.itemId, rencana.outletId, -comp.qty, 'produksi_consume', id, userId)
        }
    }
    rencanaStore[idx] = {
        ...rencana,
        status: 'selesai',
        finalizedBy: userId,
        finalizedAt: new Date().toISOString(),
    }
    return deepCopyRencana(rencanaStore[idx])
}

function submitPTRequest(
    rencanaId: string,
    proposedItems: RencanaItem[],
    notes: string | null,
    userId: string
): RencanaPTRequest {
    const rencana = rencanaStore.find(r => r.id === rencanaId)
    if (!rencana) throw new Error(`Rencana not found: ${rencanaId}`)
    if (rencana.status !== 'selesai') throw new Error('PT can only be requested for finalized rencana')
    if (ptStore.some(p => p.rencanaId === rencanaId && p.status === 'pending')) {
        throw new Error(`A PT request is already pending for rencana ${rencanaId}`)
    }
    const pt: RencanaPTRequest = {
        id: `PT-RP-${String(++ptCounter).padStart(5, '0')}`,
        rencanaId,
        proposedItems: deepCopyItems(proposedItems),
        notes,
        requestedBy: userId,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
    }
    ptStore.push(pt)
    return deepCopyPT(pt)
}

function rejectPTRequest(ptId: string, reason: string, adminId: string): RencanaPTRequest {
    const idx = ptStore.findIndex(p => p.id === ptId)
    if (idx === -1) throw new Error(`PT request not found: ${ptId}`)
    if (ptStore[idx].status !== 'pending') throw new Error(`PT request ${ptId} is not pending`)
    ptStore[idx] = {
        ...ptStore[idx],
        status: 'rejected',
        rejectionReason: reason,
        reviewedBy: adminId,
        reviewedAt: new Date().toISOString(),
    }
    return deepCopyPT(ptStore[idx])
}

function acceptAndAdjust(ptId: string, adminId: string): RencanaPTRequest {
    const ptIdx = ptStore.findIndex(p => p.id === ptId)
    if (ptIdx === -1) throw new Error(`PT request not found: ${ptId}`)
    if (ptStore[ptIdx].status !== 'pending') throw new Error(`PT request ${ptId} is not pending`)
    const pt = ptStore[ptIdx]
    const rencanaIdx = rencanaStore.findIndex(r => r.id === pt.rencanaId)
    if (rencanaIdx === -1) throw new Error(`Rencana not found: ${pt.rencanaId}`)
    const rencana = rencanaStore[rencanaIdx]
    const { outletId } = rencana

    // Items present in proposedItems (may or may not exist in original)
    for (const proposed of pt.proposedItems) {
        const original = rencana.items.find(i => i.outputItemId === proposed.outputItemId)
        const origOutputQty = original?.outputQty ?? 0
        const outputDelta = proposed.outputQty - origOutputQty
        if (outputDelta !== 0) {
            applyDelta(proposed.outputItemId, outletId, outputDelta, 'produksi_pt', rencana.id, adminId)
        }
        // Component deltas (union of original and proposed component sets)
        const allCompIds = new Set([
            ...(original?.components ?? []).map(c => c.itemId),
            ...proposed.components.map(c => c.itemId),
        ])
        for (const compItemId of allCompIds) {
            const origQty = original?.components.find(c => c.itemId === compItemId)?.qty ?? 0
            const propQty = proposed.components.find(c => c.itemId === compItemId)?.qty ?? 0
            const compDelta = -(propQty - origQty)  // consume more → negative, consume less → positive (stock returned)
            if (compDelta !== 0) {
                applyDelta(compItemId, outletId, compDelta, 'produksi_pt', rencana.id, adminId)
            }
        }
    }

    // Items in original but removed from proposed: fully reverse
    for (const original of rencana.items) {
        if (!pt.proposedItems.find(i => i.outputItemId === original.outputItemId)) {
            applyDelta(original.outputItemId, outletId, -original.outputQty, 'produksi_pt', rencana.id, adminId)
            for (const comp of original.components) {
                applyDelta(comp.itemId, outletId, comp.qty, 'produksi_pt', rencana.id, adminId)
            }
        }
    }

    rencanaStore[rencanaIdx] = { ...rencana, items: deepCopyItems(pt.proposedItems) }
    ptStore[ptIdx] = {
        ...pt,
        status: 'accepted_adjusted',
        reviewedBy: adminId,
        reviewedAt: new Date().toISOString(),
    }
    return deepCopyPT(ptStore[ptIdx])
}

function deleteAndNullify(ptId: string, adminId: string): void {
    const ptIdx = ptStore.findIndex(p => p.id === ptId)
    if (ptIdx === -1) throw new Error(`PT request not found: ${ptId}`)
    if (ptStore[ptIdx].status !== 'pending') throw new Error(`PT request ${ptId} is not pending`)
    const pt = ptStore[ptIdx]
    const rencanaIdx = rencanaStore.findIndex(r => r.id === pt.rencanaId)
    if (rencanaIdx === -1) throw new Error(`Rencana not found: ${pt.rencanaId}`)
    const rencana = rencanaStore[rencanaIdx]
    // Reverse all original stock movements
    for (const item of rencana.items) {
        applyDelta(item.outputItemId, rencana.outletId, -item.outputQty, 'produksi_pt', rencana.id, adminId)
        for (const comp of item.components) {
            applyDelta(comp.itemId, rencana.outletId, comp.qty, 'produksi_pt', rencana.id, adminId)
        }
    }
    rencanaStore.splice(rencanaIdx, 1)
    ptStore[ptIdx] = {
        ...pt,
        status: 'accepted_deleted',
        reviewedBy: adminId,
        reviewedAt: new Date().toISOString(),
    }
}

function _resetRencana(rSeed: RencanaProduksi[] = [], ptSeed: RencanaPTRequest[] = []): void {
    rencanaStore = rSeed.map(deepCopyRencana)
    ptStore = ptSeed.map(deepCopyPT)
    rencanaCounter = rSeed.length
    ptCounter = ptSeed.length
}

export {
    getRencanaProduksiList,
    getRencanaById,
    getPTRequests,
    getPTRequestByRencana,
    createRencanaDraft,
    updateRencanaDraft,
    deleteRencanaDraft,
    finalizeRencana,
    submitPTRequest,
    rejectPTRequest,
    acceptAndAdjust,
    deleteAndNullify,
    _resetRencana,
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/library/mock/rencana-produksi.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/rencana-produksi.ts src/library/mock/rencana-produksi.test.ts
git commit -m "feat: add RencanaProduksi mock store with CRUD, finalization, and PT resolution"
```

---

### Task 3: RencanaModal Component

**Files:**
- Create: `src/library/components/rencana-produksi/RencanaModal.svelte`

The modal handles four modes via two props (`rencana` and `ptMode`). State reinitializes when `open` becomes `true`. Each output item is an "item card" — a self-contained section with its own output picker, qty input, structure hint, and component rows.

When an output item is selected in a card, the modal looks up its Struktur Produk, auto-fills components scaled by `outputQty`, and stores the raw per-unit structure as `strukturSnapshot`.

- [ ] **Step 1: Create the component**

```svelte
<!-- src/library/components/rencana-produksi/RencanaModal.svelte -->
<script lang="ts">
    import { getMasterItems } from '$library/mock/master-items'
    import { getStrukturByOutputItem } from '$library/mock/struktur-produk'
    import {
        createRencanaDraft,
        updateRencanaDraft,
        finalizeRencana,
        submitPTRequest,
    } from '$library/mock/rencana-produksi'
    import { get } from 'svelte/store'
    import { auth } from '$library/stores/auth'
    import type { RencanaProduksi, RencanaItem, RencanaKomponen } from '$library/types/RencanaProduksi'
    import type { MasterItem } from '$library/types/MasterItem'

    export let open: boolean = false
    export let rencana: RencanaProduksi | null = null
    export let ptMode: boolean = false
    export let onClose: () => void
    export let onSuccess: (r: RencanaProduksi) => void

    const allItems: MasterItem[] = getMasterItems()
    const outputItems = allItems.filter(i => i.isActive && (i.itemType === 'finished_good' || i.itemType === 'both'))
    const componentItems = allItems.filter(i => i.isActive && (i.itemType === 'raw_material' || i.itemType === 'both'))

    // Form state
    let tanggalRencana = ''
    let catatan = ''
    let ptCatatan = ''
    let itemCards: RencanaItem[] = []
    let submitError = ''

    // Output item search per card
    let outputSearch: string[] = []
    let showOutputDropdown: boolean[] = []

    $: isCreate = rencana === null
    $: isViewOnly = rencana !== null && rencana.status === 'selesai' && !ptMode
    $: modalTitle = isCreate ? 'Buat Rencana Produksi'
        : ptMode ? 'Ajukan Perbaikan Transaksi'
        : rencana?.status === 'draft' ? 'Edit Rencana Produksi'
        : 'Detail Rencana Produksi'

    $: if (open) {
        tanggalRencana = rencana?.tanggalRencana ?? new Date().toISOString().slice(0, 10)
        catatan = rencana?.notes ?? ''
        ptCatatan = ''
        itemCards = rencana
            ? rencana.items.map(i => ({ ...i, components: i.components.map(c => ({ ...c })), strukturSnapshot: i.strukturSnapshot ? i.strukturSnapshot.map(s => ({ ...s })) : null }))
            : [{ outputItemId: '', outputQty: 1, components: [], strukturSnapshot: null }]
        outputSearch = itemCards.map(card => allItems.find(i => i.id === card.outputItemId)?.name ?? '')
        showOutputDropdown = itemCards.map(() => false)
        submitError = ''
    }

    function getFilteredOutputItems(cardIndex: number): MasterItem[] {
        const usedIds = new Set(itemCards.map((c, i) => i !== cardIndex ? c.outputItemId : '').filter(Boolean))
        const q = outputSearch[cardIndex]?.toLowerCase() ?? ''
        return outputItems.filter(i => !usedIds.has(i.id) && (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)))
    }

    function selectOutputItem(cardIndex: number, item: MasterItem) {
        outputSearch[cardIndex] = item.name
        showOutputDropdown[cardIndex] = false
        itemCards[cardIndex] = { ...itemCards[cardIndex], outputItemId: item.id }
        // Auto-fill components from Struktur Produk
        const struktur = getStrukturByOutputItem(item.id)
        if (struktur && struktur.isActive) {
            const qty = itemCards[cardIndex].outputQty
            itemCards[cardIndex].strukturSnapshot = struktur.components.map(c => ({ ...c }))
            itemCards[cardIndex].components = struktur.components.map(c => ({ itemId: c.itemId, qty: c.qty * qty }))
        } else {
            itemCards[cardIndex].strukturSnapshot = null
            itemCards[cardIndex].components = []
        }
        itemCards = [...itemCards]
    }

    function getAvailableComponents(cardIndex: number, rowIndex: number): MasterItem[] {
        const usedIds = new Set(itemCards[cardIndex].components.map((c, i) => i !== rowIndex ? c.itemId : '').filter(Boolean))
        return componentItems.filter(i => i.id !== itemCards[cardIndex].outputItemId && !usedIds.has(i.id))
    }

    function addComponent(cardIndex: number) {
        itemCards[cardIndex].components = [...itemCards[cardIndex].components, { itemId: '', qty: 0 }]
        itemCards = [...itemCards]
    }

    function removeComponent(cardIndex: number, rowIndex: number) {
        itemCards[cardIndex].components = itemCards[cardIndex].components.filter((_, i) => i !== rowIndex)
        itemCards = [...itemCards]
    }

    function addItemCard() {
        itemCards = [...itemCards, { outputItemId: '', outputQty: 1, components: [], strukturSnapshot: null }]
        outputSearch = [...outputSearch, '']
        showOutputDropdown = [...showOutputDropdown, false]
    }

    function removeItemCard(cardIndex: number) {
        if (itemCards.length === 1) return
        itemCards = itemCards.filter((_, i) => i !== cardIndex)
        outputSearch = outputSearch.filter((_, i) => i !== cardIndex)
        showOutputDropdown = showOutputDropdown.filter((_, i) => i !== cardIndex)
    }

    function validate(): string | null {
        if (itemCards.length === 0) return 'Minimal 1 produk output diperlukan.'
        const outputIds = itemCards.map(c => c.outputItemId).filter(Boolean)
        if (outputIds.length !== itemCards.length) return 'Semua produk output harus dipilih.'
        if (new Set(outputIds).size !== outputIds.length) return 'Produk output tidak boleh duplikat.'
        for (const card of itemCards) {
            if (card.outputQty < 1) return `Jumlah produksi harus minimal 1.`
            for (const comp of card.components) {
                if (!comp.itemId) return 'Semua baris komponen harus memiliki item yang dipilih.'
                if (comp.qty <= 0) return 'Qty komponen harus lebih dari 0.'
            }
        }
        return null
    }

    function handleSaveDraft() {
        submitError = ''
        const err = validate()
        if (err) { submitError = err; return }
        try {
            const userId = get(auth).userId
            const payload = { items: itemCards, tanggalRencana, notes: catatan.trim() || null }
            let result: RencanaProduksi
            if (isCreate) {
                result = createRencanaDraft(payload, userId, get(auth).outletId)
            } else {
                result = updateRencanaDraft(rencana!.id, payload, userId)
            }
            onSuccess(result)
            onClose()
        } catch (e: unknown) {
            submitError = e instanceof Error ? e.message : 'Terjadi kesalahan.'
        }
    }

    function handleFinalize() {
        submitError = ''
        const err = validate()
        if (err) { submitError = err; return }
        try {
            const userId = get(auth).userId
            const payload = { items: itemCards, tanggalRencana, notes: catatan.trim() || null }
            let result: RencanaProduksi
            if (isCreate) {
                const draft = createRencanaDraft(payload, userId, get(auth).outletId)
                result = finalizeRencana(draft.id, userId)
            } else {
                updateRencanaDraft(rencana!.id, payload, userId)
                result = finalizeRencana(rencana!.id, userId)
            }
            onSuccess(result)
            onClose()
        } catch (e: unknown) {
            submitError = e instanceof Error ? e.message : 'Terjadi kesalahan.'
        }
    }

    function handleSubmitPT() {
        submitError = ''
        const err = validate()
        if (err) { submitError = err; return }
        try {
            const userId = get(auth).userId
            submitPTRequest(rencana!.id, itemCards, ptCatatan.trim() || null, userId)
            onClose()
        } catch (e: unknown) {
            submitError = e instanceof Error ? e.message : 'Terjadi kesalahan.'
        }
    }
</script>

{#if open}
<div class="modal modal-open">
    <div class="modal-box max-w-3xl max-h-[90vh] overflow-y-auto">
        <h3 class="font-bold text-lg mb-4">{modalTitle}</h3>

        <!-- Header fields -->
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
                <label class="block text-sm opacity-60 mb-1">Tanggal Rencana <span class="text-error">*</span></label>
                <input
                    type="date"
                    class="input input-bordered input-sm w-full"
                    bind:value={tanggalRencana}
                    disabled={isViewOnly}
                />
            </div>
            <div>
                <label class="block text-sm opacity-60 mb-1">Catatan</label>
                <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Opsional..."
                    bind:value={catatan}
                    disabled={isViewOnly}
                />
            </div>
        </div>

        <div class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3">Daftar Produksi</div>

        <!-- Item cards -->
        <div class="flex flex-col gap-3 mb-3">
            {#each itemCards as card, ci (ci)}
                {@const currentOutputItem = allItems.find(i => i.id === card.outputItemId)}
                <div class="bg-base-200/30 border border-base-300 rounded-xl p-4">

                    <!-- Card header: output item + qty + remove -->
                    <div class="flex items-center gap-3 mb-3">
                        <div class="flex-1 relative">
                            {#if isViewOnly || ptMode}
                                <div class="input input-bordered input-sm w-full flex items-center gap-2 opacity-70 bg-base-200 cursor-not-allowed">
                                    <span class="font-medium">{currentOutputItem?.name ?? '—'}</span>
                                    <span class="font-mono text-xs opacity-40">{currentOutputItem?.sku ?? ''}</span>
                                </div>
                            {:else}
                                <input
                                    type="text"
                                    class="input input-bordered input-sm w-full"
                                    placeholder="Cari produk output..."
                                    bind:value={outputSearch[ci]}
                                    on:focus={() => { showOutputDropdown[ci] = true }}
                                    on:blur={() => setTimeout(() => { showOutputDropdown[ci] = false }, 150)}
                                />
                                {#if showOutputDropdown[ci] && getFilteredOutputItems(ci).length > 0}
                                    <div class="absolute z-50 w-full bg-base-200 border border-base-300 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                        {#each getFilteredOutputItems(ci) as item (item.id)}
                                            <button
                                                class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm flex items-baseline gap-2"
                                                on:click={() => selectOutputItem(ci, item)}
                                            >
                                                <span class="font-medium">{item.name}</span>
                                                <span class="font-mono text-xs opacity-40">{item.sku}</span>
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            {/if}
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <label class="text-sm opacity-50">Jml:</label>
                            <input
                                type="number"
                                class="input input-bordered input-sm w-20 text-right font-mono"
                                min="1"
                                bind:value={card.outputQty}
                                disabled={isViewOnly}
                            />
                            <span class="text-sm opacity-40 w-8">{currentOutputItem?.satuan ?? ''}</span>
                            {#if !isViewOnly && !ptMode}
                                <button
                                    class="btn btn-ghost btn-sm text-error px-1"
                                    on:click={() => removeItemCard(ci)}
                                    disabled={itemCards.length === 1}
                                    title="Hapus produk ini"
                                >✕</button>
                            {/if}
                        </div>
                    </div>

                    <!-- Structure hint or no-structure note -->
                    {#if card.strukturSnapshot !== null}
                        <div class="text-xs text-primary opacity-70 mb-2">
                            📋 Dari Struktur Produk:
                            {card.strukturSnapshot.map(s => { const it = allItems.find(i => i.id === s.itemId); return it ? `${it.name} ×${s.qty}${it.satuan}/unit` : s.itemId }).join(' · ')}
                        </div>
                    {:else if card.outputItemId}
                        <div class="text-xs opacity-35 italic mb-2">Tidak ada Struktur Produk — isi komponen secara manual.</div>
                    {/if}

                    <!-- Component rows -->
                    <div class="flex flex-col gap-2">
                        {#each card.components as comp, ri (ri)}
                            {@const currentComp = allItems.find(i => i.id === comp.itemId)}
                            {@const available = getAvailableComponents(ci, ri)}
                            {@const showCurrentInList = currentComp && !available.find(i => i.id === comp.itemId)}
                            <div class="grid gap-2 items-center" style="grid-template-columns: 1fr 90px 24px">
                                <select
                                    class="select select-bordered select-sm"
                                    bind:value={comp.itemId}
                                    disabled={isViewOnly}
                                >
                                    <option value="">Pilih komponen...</option>
                                    {#if showCurrentInList && currentComp}
                                        <option value={currentComp.id}>{currentComp.name} ({currentComp.satuan})</option>
                                    {/if}
                                    {#each available as it (it.id)}
                                        <option value={it.id}>{it.name} ({it.satuan})</option>
                                    {/each}
                                </select>
                                <input
                                    type="number"
                                    class="input input-bordered input-sm text-right font-mono"
                                    min="0.01"
                                    step="0.01"
                                    bind:value={comp.qty}
                                    disabled={isViewOnly}
                                />
                                {#if !isViewOnly}
                                    <button
                                        class="btn btn-ghost btn-sm text-error px-1"
                                        on:click={() => removeComponent(ci, ri)}
                                        title="Hapus baris"
                                    >✕</button>
                                {:else}
                                    <div></div>
                                {/if}
                            </div>
                        {/each}
                        {#if !isViewOnly}
                            <button
                                class="btn btn-outline btn-xs w-full border-dashed"
                                on:click={() => addComponent(ci)}
                            >+ Tambah Komponen</button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        {#if !isViewOnly && !ptMode}
            <button
                class="btn btn-outline btn-sm w-full border-dashed border-primary/30 text-primary mb-4"
                on:click={addItemCard}
            >+ Tambah Produk Output</button>
        {/if}

        <!-- View mode: finalization info -->
        {#if isViewOnly && rencana}
            <div class="text-sm opacity-50 mb-4">
                Diselesaikan oleh <strong class="opacity-100">{rencana.finalizedBy}</strong>
                pada {new Date(rencana.finalizedAt!).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
        {/if}

        <!-- PT mode: catatan PT -->
        {#if ptMode}
            <div class="mb-4">
                <label class="block text-sm opacity-60 mb-1">Catatan Permintaan PT</label>
                <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Jelaskan alasan koreksi..."
                    bind:value={ptCatatan}
                />
            </div>
        {/if}

        {#if submitError}
            <div class="alert alert-error text-sm py-2 mb-3">{submitError}</div>
        {/if}

        <!-- Actions -->
        <div class="modal-action border-t border-base-300 pt-4">
            {#if isViewOnly}
                <button class="btn btn-ghost btn-sm" on:click={onClose}>Tutup</button>
            {:else if ptMode}
                <button class="btn btn-ghost btn-sm" on:click={onClose}>Batal</button>
                <button class="btn btn-warning btn-sm" on:click={handleSubmitPT}>Kirim Permintaan PT</button>
            {:else}
                <button class="btn btn-ghost btn-sm" on:click={onClose}>Batal</button>
                <button class="btn btn-sm border-warning text-warning" on:click={handleSaveDraft}>Simpan Draft</button>
                <button class="btn btn-primary btn-sm" on:click={handleFinalize}>Finalisasi →</button>
            {/if}
        </div>
    </div>
</div>
{/if}
```

- [ ] **Step 2: Start dev server and verify the modal**

```bash
npm run dev
```

Navigate to `/outlet/rencana-produksi/` (page not yet built — just confirm no TypeScript errors in terminal).

- [ ] **Step 3: Commit**

```bash
git add src/library/components/rencana-produksi/RencanaModal.svelte
git commit -m "feat: add RencanaModal with multi-item batch, Struktur auto-fill, and PT request mode"
```

---

### Task 4: Outlet List Page

**Files:**
- Create: `src/routes/outlet/rencana-produksi/+page.svelte`

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/outlet/rencana-produksi/+page.svelte -->
<script lang="ts">
    import { getRencanaProduksiList, deleteRencanaDraft, getPTRequestByRencana } from '$library/mock/rencana-produksi'
    import RencanaModal from '$library/components/rencana-produksi/RencanaModal.svelte'
    import { get } from 'svelte/store'
    import { auth } from '$library/stores/auth'
    import type { RencanaProduksi } from '$library/types/RencanaProduksi'

    let search = ''
    let perPage: 10 | 25 | 50 | 100 = 25
    let currentPage = 1
    let statusFilter: 'all' | 'draft' | 'selesai' = 'all'

    let modalOpen = false
    let selectedRencana: RencanaProduksi | null = null
    let ptMode = false

    const outletId = get(auth).outletId
    let rencanaList: RencanaProduksi[] = getRencanaProduksiList(outletId)

    function refresh() {
        rencanaList = getRencanaProduksiList(outletId)
    }

    function openCreate() {
        selectedRencana = null
        ptMode = false
        modalOpen = true
    }

    function openEdit(r: RencanaProduksi) {
        selectedRencana = r
        ptMode = false
        modalOpen = true
    }

    function openView(r: RencanaProduksi) {
        selectedRencana = r
        ptMode = false
        modalOpen = true
    }

    function openPT(r: RencanaProduksi) {
        selectedRencana = r
        ptMode = true
        modalOpen = true
    }

    function handleDelete(r: RencanaProduksi) {
        if (!confirm(`Hapus rencana ${r.id}? Tindakan ini tidak dapat dibatalkan.`)) return
        try {
            deleteRencanaDraft(r.id)
            refresh()
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : 'Gagal menghapus rencana.')
        }
    }

    function hasPendingPT(rencanaId: string): boolean {
        const pt = getPTRequestByRencana(rencanaId)
        return pt?.status === 'pending'
    }

    $: filtered = rencanaList.filter(r => {
        const matchesSearch = !search ||
            r.id.toLowerCase().includes(search.toLowerCase()) ||
            (r.notes ?? '').toLowerCase().includes(search.toLowerCase())
        const matchesStatus =
            statusFilter === 'all' ? true :
            statusFilter === 'draft' ? r.status === 'draft' :
            r.status === 'selesai'
        return matchesSearch && matchesStatus
    })

    $: totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    $: paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
    $: if (search !== undefined || perPage || statusFilter) currentPage = 1

    $: pageButtons = (() => {
        let start = Math.max(1, currentPage - 2)
        let end = Math.min(totalPages, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()
</script>

<div class="p-6">
    <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold">Rencana Produksi</h1>
        <button class="btn btn-primary btn-sm" on:click={openCreate}>+ Buat Rencana</button>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-2">
            <input
                type="text"
                class="input input-bordered input-sm w-64"
                placeholder="Cari ID atau catatan..."
                bind:value={search}
            />
            <div class="join">
                <button class="btn btn-sm join-item {statusFilter === 'all' ? 'btn-primary' : 'btn-ghost'}" on:click={() => statusFilter = 'all'}>Semua</button>
                <button class="btn btn-sm join-item {statusFilter === 'draft' ? 'btn-primary' : 'btn-ghost'}" on:click={() => statusFilter = 'draft'}>Draft</button>
                <button class="btn btn-sm join-item {statusFilter === 'selesai' ? 'btn-primary' : 'btn-ghost'}" on:click={() => statusFilter = 'selesai'}>Selesai</button>
            </div>
        </div>
        <select class="select select-bordered select-sm" bind:value={perPage}>
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
                <tr class="text-xs uppercase tracking-wider opacity-50">
                    <th>Tgl Rencana</th>
                    <th class="text-center">Produk</th>
                    <th>Dibuat Oleh</th>
                    <th class="text-center">Status</th>
                    <th class="text-right">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#each paginated as r (r.id)}
                    {@const pending = hasPendingPT(r.id)}
                    <tr class="border-b border-base-200 hover:bg-base-200/30">
                        <td>
                            <div class="font-medium">{new Date(r.tanggalRencana).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                            <div class="text-xs font-mono opacity-40">{r.id}</div>
                        </td>
                        <td class="text-center opacity-70">{r.items.length} produk</td>
                        <td class="opacity-70">{r.createdBy}</td>
                        <td class="text-center">
                            {#if r.status === 'draft'}
                                <span class="badge badge-warning badge-sm badge-outline">Draft</span>
                            {:else}
                                <span class="badge badge-success badge-sm badge-outline">Selesai</span>
                                {#if pending}
                                    <div class="text-xs text-warning mt-1">⏳ PT Pending</div>
                                {/if}
                            {/if}
                        </td>
                        <td class="text-right">
                            <div class="flex gap-1 justify-end">
                                {#if r.status === 'draft'}
                                    <button class="btn btn-primary btn-xs" on:click={() => openEdit(r)}>Buka</button>
                                    <button class="btn btn-ghost btn-xs text-error border-error/30" on:click={() => handleDelete(r)}>Hapus</button>
                                {:else if !pending}
                                    <button class="btn btn-ghost btn-xs" on:click={() => openView(r)}>Buka</button>
                                    <button class="btn btn-ghost btn-xs text-warning border-warning/30" on:click={() => openPT(r)}>Ajukan PT</button>
                                {:else}
                                    <button class="btn btn-ghost btn-xs opacity-40 cursor-not-allowed" disabled>Buka</button>
                                {/if}
                            </div>
                        </td>
                    </tr>
                {/each}
                {#if paginated.length === 0}
                    <tr><td colspan="5" class="text-center opacity-40 py-10">Tidak ada data</td></tr>
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex justify-center items-center gap-1 mt-4">
            <button class="btn btn-sm btn-ghost" disabled={currentPage === 1} on:click={() => currentPage--}>‹</button>
            {#each pageButtons as p (p)}
                <button class="btn btn-sm {p === currentPage ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPage = p}>{p}</button>
            {/each}
            <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
        </div>
    {/if}
</div>

<RencanaModal
    open={modalOpen}
    rencana={selectedRencana}
    {ptMode}
    onClose={() => { modalOpen = false; refresh() }}
    onSuccess={refresh}
/>
```

- [ ] **Step 2: Verify the outlet page**

```bash
npm run dev
```

Open `http://localhost:5173/outlet/rencana-produksi/`. Verify:
- Two seed batches appear: RP-00001 (Selesai) and RP-00002 (Draft, 2 produk)
- Draft row shows "Buka" (primary) and "Hapus" buttons
- Selesai row shows "Buka" and "Ajukan PT" buttons
- Status filter (Semua / Draft / Selesai) works
- Clicking "Buka" on the draft opens RencanaModal in edit mode with 2 item cards (Eid Hampers with 1 component, Yakult Slop with no component and no-structure note)
- Clicking "+ Buat Rencana" opens an empty modal with 1 empty item card
- Selecting a finished_good item with a Struktur auto-fills components and shows the structure hint

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/rencana-produksi/+page.svelte
git commit -m "feat: add outlet Rencana Produksi list page with draft/finalize/PT flow"
```

---

### Task 5: Factory PT Queue Page

**Files:**
- Create: `src/routes/factory/rencana-produksi/+page.svelte`

The page shows all PT requests in two tabs. The review panel is rendered inline when a pending request is selected. Diff shows original vs proposed per item.

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/factory/rencana-produksi/+page.svelte -->
<script lang="ts">
    import {
        getPTRequests,
        getRencanaById,
        rejectPTRequest,
        acceptAndAdjust,
        deleteAndNullify,
    } from '$library/mock/rencana-produksi'
    import { getMasterItems } from '$library/mock/master-items'
    import { get } from 'svelte/store'
    import { auth } from '$library/stores/auth'
    import type { RencanaPTRequest, RencanaItem } from '$library/types/RencanaProduksi'
    import type { MasterItem } from '$library/types/MasterItem'

    const allItems: MasterItem[] = getMasterItems()

    let tab: 'pending' | 'selesai' = 'pending'
    let selectedPTId: string | null = null
    let rejectionReason = ''
    let actionError = ''

    let ptList: RencanaPTRequest[] = getPTRequests()

    function refresh() {
        ptList = getPTRequests()
        selectedPTId = null
        rejectionReason = ''
        actionError = ''
    }

    $: pendingList = ptList.filter(p => p.status === 'pending')
    $: resolvedList = ptList.filter(p => p.status !== 'pending')
    $: displayList = tab === 'pending' ? pendingList : resolvedList
    $: selectedPT = selectedPTId ? ptList.find(p => p.id === selectedPTId) ?? null : null
    $: originalRencana = selectedPT ? getRencanaById(selectedPT.rencanaId) ?? null : null

    function getItemName(itemId: string): string {
        return allItems.find(i => i.id === itemId)?.name ?? itemId
    }

    function getItemSatuan(itemId: string): string {
        return allItems.find(i => i.id === itemId)?.satuan ?? ''
    }

    // Returns all itemIds that appear in either original or proposed for a given outputItemId card
    function getComponentDiff(origItem: RencanaItem | undefined, propItem: RencanaItem | undefined): string[] {
        const ids = new Set([
            ...(origItem?.components ?? []).map(c => c.itemId),
            ...(propItem?.components ?? []).map(c => c.itemId),
        ])
        return [...ids]
    }

    function handleAcceptAdjust() {
        actionError = ''
        try {
            acceptAndAdjust(selectedPTId!, get(auth).userId)
            refresh()
        } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : 'Terjadi kesalahan.'
        }
    }

    function handleDeleteNullify() {
        if (!confirm('Ini akan membalikkan semua pergerakan stok dan menghapus rencana produksi ini. Lanjutkan?')) return
        actionError = ''
        try {
            deleteAndNullify(selectedPTId!, get(auth).userId)
            refresh()
        } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : 'Terjadi kesalahan.'
        }
    }

    function handleReject() {
        if (!rejectionReason.trim()) { actionError = 'Alasan penolakan diperlukan.'; return }
        actionError = ''
        try {
            rejectPTRequest(selectedPTId!, rejectionReason.trim(), get(auth).userId)
            refresh()
        } catch (e: unknown) {
            actionError = e instanceof Error ? e.message : 'Terjadi kesalahan.'
        }
    }

    // Collect all output item IDs appearing in original or proposed
    function getAllOutputIds(pt: RencanaPTRequest): string[] {
        const ids = new Set([
            ...(originalRencana?.items ?? []).map(i => i.outputItemId),
            ...pt.proposedItems.map(i => i.outputItemId),
        ])
        return [...ids]
    }
</script>

<div class="p-6">
    <h1 class="text-xl font-bold mb-4">Permintaan PT — Rencana Produksi</h1>

    <div class="grid grid-cols-[320px_1fr] gap-6 items-start">

        <!-- Left: PT list -->
        <div>
            <div class="tabs tabs-bordered mb-3">
                <button class="tab {tab === 'pending' ? 'tab-active' : ''}" on:click={() => { tab = 'pending'; selectedPTId = null }}>
                    Pending {#if pendingList.length > 0}<span class="badge badge-warning badge-sm ml-1">{pendingList.length}</span>{/if}
                </button>
                <button class="tab {tab === 'selesai' ? 'tab-active' : ''}" on:click={() => { tab = 'selesai'; selectedPTId = null }}>Selesai</button>
            </div>

            <div class="flex flex-col gap-2">
                {#each displayList as pt (pt.id)}
                    <button
                        class="text-left p-3 rounded-lg border transition-colors {selectedPTId === pt.id ? 'border-primary bg-primary/10' : 'border-base-300 hover:bg-base-200/50'}"
                        on:click={() => { selectedPTId = pt.id; actionError = ''; rejectionReason = '' }}
                    >
                        <div class="font-medium text-sm">{pt.rencanaId}</div>
                        <div class="text-xs opacity-50 mt-1">Diminta oleh {pt.requestedBy}</div>
                        <div class="text-xs opacity-40">{new Date(pt.requestedAt).toLocaleDateString('id-ID')}</div>
                        {#if tab === 'selesai'}
                            <div class="text-xs mt-1 {pt.status === 'accepted_adjusted' ? 'text-success' : pt.status === 'accepted_deleted' ? 'text-error' : 'text-warning'}">
                                {pt.status === 'accepted_adjusted' ? '✓ Diterima & Disesuaikan'
                                 : pt.status === 'accepted_deleted' ? '🗑 Dihapus'
                                 : '✕ Ditolak'}
                            </div>
                        {/if}
                    </button>
                {/each}
                {#if displayList.length === 0}
                    <p class="text-sm opacity-40 text-center py-8">Tidak ada permintaan {tab === 'pending' ? 'pending' : 'selesai'}</p>
                {/if}
            </div>
        </div>

        <!-- Right: Review panel -->
        <div>
            {#if selectedPT && originalRencana}
                <div class="bg-base-200/30 border border-base-300 rounded-xl p-5">
                    <div class="text-sm opacity-60 mb-1">
                        Diminta oleh <strong class="opacity-100">{selectedPT.requestedBy}</strong>
                        pada {new Date(selectedPT.requestedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>

                    {#if selectedPT.notes}
                        <div class="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 text-sm mb-4">
                            <div class="text-xs opacity-50 mb-1">Catatan dari {selectedPT.requestedBy}:</div>
                            <div>{selectedPT.notes}</div>
                        </div>
                    {/if}

                    <div class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3">Perbandingan — Original vs Usulan</div>

                    <!-- Diff per output item -->
                    <div class="flex flex-col gap-3 mb-4">
                        {#each getAllOutputIds(selectedPT) as outputId (outputId)}
                            {@const origItem = originalRencana.items.find(i => i.outputItemId === outputId)}
                            {@const propItem = selectedPT.proposedItems.find(i => i.outputItemId === outputId)}
                            {@const compIds = getComponentDiff(origItem, propItem)}
                            {@const qtyChanged = origItem?.outputQty !== propItem?.outputQty}
                            {@const anyCompChanged = compIds.some(cid => {
                                const oq = origItem?.components.find(c => c.itemId === cid)?.qty ?? 0
                                const pq = propItem?.components.find(c => c.itemId === cid)?.qty ?? 0
                                return oq !== pq
                            })}

                            <div class="border border-base-300 rounded-lg p-3 {!qtyChanged && !anyCompChanged ? 'opacity-40' : ''}">
                                <div class="font-medium text-sm mb-2">
                                    {getItemName(outputId)}
                                    {#if !origItem}<span class="badge badge-success badge-xs ml-1">Baru</span>{/if}
                                    {#if !propItem}<span class="badge badge-error badge-xs ml-1">Dihapus</span>{/if}
                                </div>

                                {#if !qtyChanged && !anyCompChanged}
                                    <div class="text-xs italic opacity-60">Tidak ada perubahan</div>
                                {:else}
                                    <div class="grid grid-cols-2 gap-3 text-sm">
                                        <!-- Original -->
                                        <div>
                                            <div class="text-xs opacity-40 uppercase tracking-wider mb-1">Original</div>
                                            <div class="bg-error/5 border border-error/15 rounded-lg p-2 text-xs">
                                                {#if origItem}
                                                    <div class="mb-1">Jumlah: <span class="font-mono">{origItem.outputQty} {getItemSatuan(outputId)}</span></div>
                                                    {#each origItem.components as comp}
                                                        <div class="opacity-70">{getItemName(comp.itemId)}: <span class="font-mono">{comp.qty}</span></div>
                                                    {/each}
                                                    {#if origItem.components.length === 0}
                                                        <div class="opacity-40 italic">Tidak ada komponen</div>
                                                    {/if}
                                                {:else}
                                                    <div class="opacity-40 italic">Tidak ada di original</div>
                                                {/if}
                                            </div>
                                        </div>
                                        <!-- Proposed -->
                                        <div>
                                            <div class="text-xs opacity-40 uppercase tracking-wider mb-1">Usulan</div>
                                            <div class="bg-success/5 border border-success/15 rounded-lg p-2 text-xs">
                                                {#if propItem}
                                                    <div class="mb-1">
                                                        Jumlah: <span class="font-mono">{propItem.outputQty} {getItemSatuan(outputId)}</span>
                                                        {#if origItem && propItem.outputQty !== origItem.outputQty}
                                                            <span class="{propItem.outputQty > (origItem?.outputQty ?? 0) ? 'text-success' : 'text-error'} text-xs ml-1">
                                                                {propItem.outputQty > (origItem?.outputQty ?? 0) ? '↑' : '↓'}{Math.abs(propItem.outputQty - (origItem?.outputQty ?? 0))}
                                                            </span>
                                                        {/if}
                                                    </div>
                                                    {#each propItem.components as comp}
                                                        {@const origQty = origItem?.components.find(c => c.itemId === comp.itemId)?.qty ?? 0}
                                                        <div class="opacity-70">
                                                            {getItemName(comp.itemId)}: <span class="font-mono">{comp.qty}</span>
                                                            {#if comp.qty !== origQty}
                                                                <span class="{comp.qty < origQty ? 'text-success' : 'text-error'} text-xs ml-1">
                                                                    {comp.qty < origQty ? '↓' : '↑'}{Math.abs(comp.qty - origQty)}
                                                                </span>
                                                            {/if}
                                                        </div>
                                                    {/each}
                                                    {#if propItem.components.length === 0}
                                                        <div class="opacity-40 italic">Tidak ada komponen</div>
                                                    {/if}
                                                {:else}
                                                    <div class="opacity-40 italic">Dihapus dari rencana</div>
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>

                    {#if selectedPT.status === 'pending'}
                        <!-- Admin actions -->
                        <div class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3">Tindakan Admin</div>

                        {#if actionError}
                            <div class="alert alert-error text-sm py-2 mb-3">{actionError}</div>
                        {/if}

                        <div class="flex flex-col gap-2">
                            <button
                                class="btn btn-success btn-sm btn-outline w-full justify-start"
                                on:click={handleAcceptAdjust}
                            >✓ Terima &amp; Sesuaikan Stok</button>

                            <button
                                class="btn btn-error btn-sm btn-outline w-full justify-start"
                                on:click={handleDeleteNullify}
                            >🗑 Hapus &amp; Batalkan — balikkan semua pergerakan stok</button>

                            <div class="flex gap-2 items-center">
                                <input
                                    type="text"
                                    class="input input-bordered input-sm flex-1"
                                    placeholder="Alasan penolakan..."
                                    bind:value={rejectionReason}
                                />
                                <button class="btn btn-ghost btn-sm" on:click={handleReject}>Tolak</button>
                            </div>
                        </div>
                    {:else}
                        <div class="text-sm opacity-50">
                            Direview oleh <strong class="opacity-100">{selectedPT.reviewedBy}</strong>
                            pada {new Date(selectedPT.reviewedAt!).toLocaleDateString('id-ID')}
                            {#if selectedPT.rejectionReason}
                                · Alasan: "{selectedPT.rejectionReason}"
                            {/if}
                        </div>
                    {/if}
                </div>
            {:else if selectedPTId && !originalRencana}
                <div class="text-sm opacity-40 text-center py-10">Rencana telah dihapus (diterima &amp; dihapus).</div>
            {:else}
                <div class="text-sm opacity-40 text-center py-20">Pilih permintaan PT untuk mereview.</div>
            {/if}
        </div>
    </div>
</div>
```

- [ ] **Step 2: Verify the factory PT queue**

```bash
npm run dev
```

Open `http://localhost:5173/factory/rencana-produksi/`. Verify:
- Page loads with "Tidak ada permintaan pending" (no seed PT requests)
- Go to `/outlet/rencana-produksi/`, finalize RP-00002, then click "Ajukan PT" and submit a request
- Return to `/factory/rencana-produksi/` — the pending request should appear in the list
- Click the request — the review panel should show the diff (items that changed vs unchanged)
- Test "Tolak": enter a reason and click Tolak — PT moves to Selesai tab with rejection status
- Submit another PT on a different record, test "Terima & Sesuaikan Stok" — verify the item moves to Selesai tab with "Diterima & Disesuaikan" status
- Test "Hapus & Batalkan" — confirm the rencana disappears from `/outlet/rencana-produksi/`

- [ ] **Step 3: Commit**

```bash
git add src/routes/factory/rencana-produksi/+page.svelte
git commit -m "feat: add factory Rencana Produksi PT queue with diff view and admin resolution actions"
```
