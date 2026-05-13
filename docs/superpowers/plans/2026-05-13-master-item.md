# Master Item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-managed Master Item catalog with region-based outlet distribution, a shared `getDisplayStock()` helper, and an append-only StockMovement log that every future stock-changing feature calls.

**Architecture:** TypeScript interfaces live in `types/MasterItem.ts`. Two mock modules hold in-memory state — `stock-movements.ts` (pure log, no dependencies) and `master-items.ts` (item + OutletStock store, calls logStockMovement). Two Svelte files render the admin list page and the shared create/edit modal.

**Tech Stack:** SvelteKit, TypeScript, TailwindCSS, DaisyUI, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/library/types/MasterItem.ts` | Create | All shared interfaces: MasterItem, OutletStock, StockMovement, payload types |
| `src/library/mock/stock-movements.ts` | Create | Append-only StockMovement log — `logStockMovement`, `getStockMovements` |
| `src/library/mock/stock-movements.test.ts` | Create | Tests for movement log |
| `src/library/mock/master-items.ts` | Create | MasterItem + OutletStock in-memory store + CRUD |
| `src/library/mock/master-items.test.ts` | Create | Tests for CRUD and region distribution logic |
| `src/library/components/master-item/ItemModal.svelte` | Create | Create/edit modal — 4 sections including image, 5 price levels, region checkboxes |
| `src/routes/factory/master-item/+page.svelte` | Create | Admin list page — search, status filter, pagination, opens ItemModal |

---

### Task 1: TypeScript Types

**Files:**
- Create: `src/library/types/MasterItem.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/MasterItem.ts

export type StockMovementSource =
    | "item_masuk"          // stock received from supplier
    | "item_masuk_pt"       // supplier receipt correction (PT approved)
    | "item_keluar"         // stock removed (damaged, lost, etc.)
    | "item_keluar_pt"      // removal correction (PT approved)
    | "sale"                // POS retail/order transaction
    | "sale_void"           // voided transaction (stock returned)
    | "transfer_out"        // stock sent to another outlet
    | "transfer_in"         // stock received from another outlet
    | "transfer_cancelled"  // transfer cancelled (stock reversed)
    | "konversi_consume"    // items consumed as input to conversion formula
    | "konversi_produce"    // items produced as output of conversion formula
    | "produksi_consume"    // raw materials consumed on production finalization
    | "produksi_produce"    // produced items added to stock
    | "produksi_pt"         // production correction (PT approved)
    | "initial_stock"       // stock established when item is first distributed to outlet
    | "stock_opname"        // physical stock correction (future: Kartu Stok)

export interface MasterItem {
    id: string
    sku: string
    barcode: string | null
    name: string
    description: string | null
    imageUrl: string | null
    category: string
    satuan: string
    weight: number | null
    height: number | null
    priceLevel1: number       // required — default POS retail price
    priceLevel2: number       // 0 = not configured
    priceLevel3: number       // 0 = not configured
    priceLevel4: number       // 0 = not configured
    priceLevel5: number       // 0 = not configured
    itemType: "raw_material" | "finished_good" | "both"
    isActive: boolean
    availableRegions: string[]
    createdBy: string
    createdAt: string
    updatedBy: string | null
    updatedAt: string | null
}

export interface OutletStock {
    itemId: string
    outletId: string
    region: string
    stock: number
    preAdjDelta: number
}

export interface StockMovement {
    id: string
    itemId: string
    outletId: string
    delta: number
    source: StockMovementSource
    sourceId: string
    stockBefore: number
    stockAfter: number
    executedBy: string
    executedAt: string
    note: string | null
}

export interface CreateMasterItemPayload {
    sku: string
    barcode: string | null
    name: string
    description: string | null
    imageUrl: string | null
    category: string
    satuan: string
    weight: number | null
    height: number | null
    priceLevel1: number
    priceLevel2: number
    priceLevel3: number
    priceLevel4: number
    priceLevel5: number
    itemType: "raw_material" | "finished_good" | "both"
    isActive: boolean
    availableRegions: string[]
}

export type UpdateMasterItemPayload = Partial<CreateMasterItemPayload>

export interface LogStockMovementPayload {
    itemId: string
    outletId: string
    delta: number
    source: StockMovementSource
    sourceId: string
    stockBefore: number    // caller computes this — logStockMovement does not read OutletStock
    executedBy: string
    note?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/library/types/MasterItem.ts
git commit -m "feat: add MasterItem, OutletStock, StockMovement TypeScript types"
```

---

### Task 2: StockMovement Mock

**Files:**
- Create: `src/library/mock/stock-movements.ts`
- Create: `src/library/mock/stock-movements.test.ts`

`logStockMovement` is a pure log appender — it does not read or write `OutletStock`. The caller is responsible for computing `stockBefore` and updating `OutletStock.stock` before calling this function.

- [ ] **Step 1: Write failing tests**

```typescript
// src/library/mock/stock-movements.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { logStockMovement, getStockMovements, _resetMovements } from './stock-movements'

beforeEach(() => {
    _resetMovements()
})

describe('logStockMovement', () => {
    it('returns a record with correct stockBefore and stockAfter', () => {
        const m = logStockMovement({
            itemId: 'item-1',
            outletId: 'outlet-1',
            delta: 10,
            source: 'item_masuk',
            sourceId: 'IM-001',
            stockBefore: 0,
            executedBy: 'user-1'
        })

        expect(m.itemId).toBe('item-1')
        expect(m.outletId).toBe('outlet-1')
        expect(m.delta).toBe(10)
        expect(m.stockBefore).toBe(0)
        expect(m.stockAfter).toBe(10)
        expect(m.source).toBe('item_masuk')
        expect(m.sourceId).toBe('IM-001')
        expect(m.executedBy).toBe('user-1')
        expect(m.note).toBeNull()
        expect(m.id).toBeTruthy()
        expect(m.executedAt).toBeTruthy()
    })

    it('computes stockAfter correctly for negative delta', () => {
        const m = logStockMovement({
            itemId: 'i1', outletId: 'o1', delta: -3,
            source: 'sale', sourceId: 'TRX-001', stockBefore: 10, executedBy: 'u1'
        })
        expect(m.stockAfter).toBe(7)
    })

    it('stores note when provided', () => {
        const m = logStockMovement({
            itemId: 'i1', outletId: 'o1', delta: -2,
            source: 'item_keluar', sourceId: 'IK-001', stockBefore: 5,
            executedBy: 'u1', note: 'barang rusak'
        })
        expect(m.note).toBe('barang rusak')
    })

    it('assigns unique IDs across multiple calls', () => {
        const m1 = logStockMovement({ itemId: 'i1', outletId: 'o1', delta: 5, source: 'initial_stock', sourceId: 's1', stockBefore: 0, executedBy: 'u1' })
        const m2 = logStockMovement({ itemId: 'i1', outletId: 'o1', delta: 3, source: 'item_masuk', sourceId: 's2', stockBefore: 5, executedBy: 'u1' })
        expect(m1.id).not.toBe(m2.id)
    })
})

describe('getStockMovements', () => {
    it('returns only movements for the specified item and outlet', () => {
        logStockMovement({ itemId: 'item-1', outletId: 'outlet-1', delta: 10, source: 'item_masuk', sourceId: 'IM-001', stockBefore: 0, executedBy: 'u1' })
        logStockMovement({ itemId: 'item-2', outletId: 'outlet-1', delta: 5, source: 'item_masuk', sourceId: 'IM-002', stockBefore: 0, executedBy: 'u1' })
        logStockMovement({ itemId: 'item-1', outletId: 'outlet-2', delta: 3, source: 'item_masuk', sourceId: 'IM-003', stockBefore: 0, executedBy: 'u1' })

        const result = getStockMovements('item-1', 'outlet-1')
        expect(result).toHaveLength(1)
        expect(result[0].itemId).toBe('item-1')
        expect(result[0].outletId).toBe('outlet-1')
    })

    it('returns movements in insertion order', () => {
        logStockMovement({ itemId: 'i1', outletId: 'o1', delta: 10, source: 'item_masuk', sourceId: 'IM-001', stockBefore: 0, executedBy: 'u1' })
        logStockMovement({ itemId: 'i1', outletId: 'o1', delta: -3, source: 'sale', sourceId: 'TRX-001', stockBefore: 10, executedBy: 'u1' })

        const result = getStockMovements('i1', 'o1')
        expect(result[0].delta).toBe(10)
        expect(result[1].delta).toBe(-3)
    })

    it('returns empty array when no movements exist', () => {
        expect(getStockMovements('unknown', 'unknown')).toEqual([])
    })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/library/mock/stock-movements.test.ts
```

Expected: FAIL — `Cannot find module './stock-movements'`

- [ ] **Step 3: Implement stock-movements.ts**

```typescript
// src/library/mock/stock-movements.ts
import type { StockMovement, LogStockMovementPayload } from '$lib/types/MasterItem'

let movements: StockMovement[] = []
let nextId = 1

export function logStockMovement(payload: LogStockMovementPayload): StockMovement {
    const movement: StockMovement = {
        id: `SM-${String(nextId++).padStart(5, '0')}`,
        itemId: payload.itemId,
        outletId: payload.outletId,
        delta: payload.delta,
        source: payload.source,
        sourceId: payload.sourceId,
        stockBefore: payload.stockBefore,
        stockAfter: payload.stockBefore + payload.delta,
        executedBy: payload.executedBy,
        executedAt: new Date().toISOString(),
        note: payload.note ?? null
    }
    movements.push(movement)
    return movement
}

export function getStockMovements(itemId: string, outletId: string): StockMovement[] {
    return movements.filter(m => m.itemId === itemId && m.outletId === outletId)
}

export function _resetMovements(): void {
    movements = []
    nextId = 1
}

export { movements }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/library/mock/stock-movements.test.ts
```

Expected: PASS — all 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/stock-movements.ts src/library/mock/stock-movements.test.ts
git commit -m "feat: add StockMovement append-only log mock with logStockMovement and getStockMovements"
```

---

### Task 3: MasterItem Mock

**Files:**
- Create: `src/library/mock/master-items.ts`
- Create: `src/library/mock/master-items.test.ts`

> **Before writing tests:** Open `src/library/mock/outlets.ts` and check the shape of `mockOutlets`. It should export an array where each outlet has at least `id: string` and `region: string`. The tests below assume at least one outlet with `region === 'Jakarta'` and at least one with `region === 'Bandung'` exist. Adjust the `jakartaOutlets` / `bandungOutlets` filter logic if the region names differ.

- [ ] **Step 1: Write failing tests**

```typescript
// src/library/mock/master-items.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
    getMasterItems,
    getMasterItemById,
    createMasterItem,
    updateMasterItem,
    getOutletStock,
    getDisplayStock,
    _resetMasterItems
} from './master-items'
import { getStockMovements, _resetMovements } from './stock-movements'
import { mockOutlets } from './outlets'

const jakartaOutlets = mockOutlets.filter(o => o.region === 'Jakarta')
const bandungOutlets = mockOutlets.filter(o => o.region === 'Bandung')

const basePayload = {
    sku: 'TEST-001',
    barcode: null,
    name: 'Test Item',
    description: null,
    imageUrl: null,
    category: 'Minuman',
    satuan: 'Pcs',
    itemType: 'finished_good' as const,
    weight: null,
    height: null,
    priceLevel1: 10000,
    priceLevel2: 0,
    priceLevel3: 0,
    priceLevel4: 0,
    priceLevel5: 0,
    isActive: true,
    availableRegions: ['Jakarta']
}

beforeEach(() => {
    _resetMasterItems()
    _resetMovements()
})

describe('createMasterItem', () => {
    it('creates an item with all provided fields', () => {
        const item = createMasterItem(basePayload)

        expect(item.sku).toBe('TEST-001')
        expect(item.name).toBe('Test Item')
        expect(item.priceLevel1).toBe(10000)
        expect(item.isActive).toBe(true)
        expect(item.availableRegions).toEqual(['Jakarta'])
        expect(item.id).toBeTruthy()
        expect(item.createdAt).toBeTruthy()
        expect(item.updatedBy).toBeNull()
        expect(item.updatedAt).toBeNull()
    })

    it('creates OutletStock records for every outlet in selected regions', () => {
        const item = createMasterItem({ ...basePayload, availableRegions: ['Jakarta'] })

        for (const outlet of jakartaOutlets) {
            const stock = getOutletStock(item.id, outlet.id)
            expect(stock).toBeDefined()
            expect(stock!.stock).toBe(0)
            expect(stock!.preAdjDelta).toBe(0)
            expect(stock!.region).toBe('Jakarta')
        }
    })

    it('creates OutletStock for multiple regions at once', () => {
        const item = createMasterItem({ ...basePayload, availableRegions: ['Jakarta', 'Bandung'] })

        for (const outlet of [...jakartaOutlets, ...bandungOutlets]) {
            expect(getOutletStock(item.id, outlet.id)).toBeDefined()
        }
    })

    it('logs an initial_stock movement (delta 0) for each outlet', () => {
        const item = createMasterItem({ ...basePayload, availableRegions: ['Jakarta'] })

        for (const outlet of jakartaOutlets) {
            const movements = getStockMovements(item.id, outlet.id)
            expect(movements).toHaveLength(1)
            expect(movements[0].source).toBe('initial_stock')
            expect(movements[0].delta).toBe(0)
            expect(movements[0].stockBefore).toBe(0)
            expect(movements[0].stockAfter).toBe(0)
        }
    })
})

describe('getMasterItems', () => {
    it('includes newly created items in the list', () => {
        const before = getMasterItems().length
        createMasterItem(basePayload)
        expect(getMasterItems()).toHaveLength(before + 1)
    })
})

describe('getMasterItemById', () => {
    it('returns the correct item by ID', () => {
        const item = createMasterItem(basePayload)
        expect(getMasterItemById(item.id)?.sku).toBe('TEST-001')
    })

    it('returns undefined for an unknown ID', () => {
        expect(getMasterItemById('nonexistent')).toBeUndefined()
    })
})

describe('updateMasterItem', () => {
    it('updates specified fields while preserving others', () => {
        const item = createMasterItem(basePayload)
        const updated = updateMasterItem(item.id, { name: 'Renamed', priceLevel1: 15000 })

        expect(updated.name).toBe('Renamed')
        expect(updated.priceLevel1).toBe(15000)
        expect(updated.sku).toBe('TEST-001')
    })

    it('sets updatedAt on every update', () => {
        const item = createMasterItem(basePayload)
        const updated = updateMasterItem(item.id, { name: 'New Name' })
        expect(updated.updatedAt).toBeTruthy()
    })

    it('creates OutletStock for newly added regions', () => {
        const item = createMasterItem({ ...basePayload, availableRegions: ['Jakarta'] })

        for (const outlet of bandungOutlets) {
            expect(getOutletStock(item.id, outlet.id)).toBeUndefined()
        }

        updateMasterItem(item.id, { availableRegions: ['Jakarta', 'Bandung'] })

        for (const outlet of bandungOutlets) {
            expect(getOutletStock(item.id, outlet.id)).toBeDefined()
        }
    })

    it('does NOT remove OutletStock when a region is removed', () => {
        const item = createMasterItem({ ...basePayload, availableRegions: ['Jakarta', 'Bandung'] })

        updateMasterItem(item.id, { availableRegions: ['Jakarta'] })

        // Bandung OutletStock records must be preserved — stock data is never destroyed
        for (const outlet of bandungOutlets) {
            expect(getOutletStock(item.id, outlet.id)).toBeDefined()
        }
    })

    it('does not create duplicate OutletStock if region is re-added', () => {
        const item = createMasterItem({ ...basePayload, availableRegions: ['Jakarta'] })
        const outlet = jakartaOutlets[0]

        // Manually set stock so we can verify it isn't reset
        getOutletStock(item.id, outlet.id)!.stock = 50

        updateMasterItem(item.id, { availableRegions: ['Jakarta'] })

        expect(getOutletStock(item.id, outlet.id)!.stock).toBe(50)
    })
})

describe('getDisplayStock', () => {
    it('returns stock + preAdjDelta', () => {
        const item = createMasterItem({ ...basePayload, availableRegions: ['Jakarta'] })
        const outlet = jakartaOutlets[0]

        const record = getOutletStock(item.id, outlet.id)!
        record.stock = 10
        record.preAdjDelta = 3

        expect(getDisplayStock(item.id, outlet.id)).toBe(13)
    })

    it('returns 0 when no OutletStock exists for the combination', () => {
        expect(getDisplayStock('nonexistent', 'nonexistent')).toBe(0)
    })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/library/mock/master-items.test.ts
```

Expected: FAIL — `Cannot find module './master-items'`

- [ ] **Step 3: Implement master-items.ts**

```typescript
// src/library/mock/master-items.ts
import type { MasterItem, OutletStock, CreateMasterItemPayload, UpdateMasterItemPayload } from '$lib/types/MasterItem'
import { logStockMovement } from './stock-movements'
import { mockOutlets } from './outlets'

let masterItems: MasterItem[] = seedItems()
let outletStocks: OutletStock[] = []
let nextId = 1

function seedItems(): MasterItem[] {
    return [
        {
            id: 'item-seed-001',
            sku: 'YKL-SLOP-001',
            barcode: '8990000123456',
            name: 'Yakult Slop',
            description: '1 slop berisi 10 botol Yakult 65ml',
            imageUrl: null,
            category: 'Minuman',
            satuan: 'Slop',
            itemType: 'finished_good',
            weight: null,
            height: null,
            priceLevel1: 45000,
            priceLevel2: 42000,
            priceLevel3: 40000,
            priceLevel4: 0,
            priceLevel5: 0,
            isActive: true,
            availableRegions: ['Jakarta', 'Bandung'],
            createdBy: 'admin-seed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedBy: null,
            updatedAt: null
        },
        {
            id: 'item-seed-002',
            sku: 'PCS-500-001',
            barcode: null,
            name: 'Pocari Sweat 500ml',
            description: null,
            imageUrl: null,
            category: 'Minuman',
            satuan: 'Pcs',
            itemType: 'finished_good',
            weight: 500,
            height: null,
            priceLevel1: 8000,
            priceLevel2: 0,
            priceLevel3: 0,
            priceLevel4: 0,
            priceLevel5: 0,
            isActive: true,
            availableRegions: ['Jakarta'],
            createdBy: 'admin-seed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedBy: null,
            updatedAt: null
        },
        {
            id: 'item-seed-003',
            sku: 'CKR-REG-001',
            barcode: null,
            name: 'Cookies Regal',
            description: null,
            imageUrl: null,
            category: 'Makanan',
            satuan: 'Pcs',
            itemType: 'finished_good',
            weight: 120,
            height: null,
            priceLevel1: 12000,
            priceLevel2: 0,
            priceLevel3: 0,
            priceLevel4: 0,
            priceLevel5: 0,
            isActive: false,
            availableRegions: ['Surabaya'],
            createdBy: 'admin-seed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedBy: null,
            updatedAt: null
        }
    ]
}

function generateOutletStocksForRegions(itemId: string, regions: string[]): void {
    for (const outlet of mockOutlets) {
        if (!regions.includes(outlet.region)) continue

        const already = outletStocks.find(s => s.itemId === itemId && s.outletId === outlet.id)
        if (already) continue

        const record: OutletStock = {
            itemId,
            outletId: outlet.id,
            region: outlet.region,
            stock: 0,
            preAdjDelta: 0
        }
        outletStocks.push(record)

        logStockMovement({
            itemId,
            outletId: outlet.id,
            delta: 0,
            source: 'initial_stock',
            sourceId: itemId,
            stockBefore: 0,
            executedBy: 'system'
        })
    }
}

export function getMasterItems(): MasterItem[] {
    return masterItems
}

export function getMasterItemById(id: string): MasterItem | undefined {
    return masterItems.find(i => i.id === id)
}

export function getOutletStock(itemId: string, outletId: string): OutletStock | undefined {
    return outletStocks.find(s => s.itemId === itemId && s.outletId === outletId)
}

export function getDisplayStock(itemId: string, outletId: string): number {
    const s = getOutletStock(itemId, outletId)
    if (!s) return 0
    return s.stock + s.preAdjDelta
}

export function createMasterItem(payload: CreateMasterItemPayload): MasterItem {
    const id = `item-${String(nextId++).padStart(5, '0')}`
    const item: MasterItem = {
        id,
        ...payload,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
        updatedBy: null,
        updatedAt: null
    }
    masterItems.push(item)
    generateOutletStocksForRegions(id, payload.availableRegions)
    return item
}

export function updateMasterItem(id: string, payload: UpdateMasterItemPayload): MasterItem {
    const item = masterItems.find(i => i.id === id)
    if (!item) throw new Error(`MasterItem not found: ${id}`)

    Object.assign(item, payload, {
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin'
    })

    if (payload.availableRegions) {
        generateOutletStocksForRegions(id, payload.availableRegions)
    }

    return item
}

export function _resetMasterItems(): void {
    masterItems = seedItems()
    outletStocks = []
    nextId = 1
}

export { outletStocks }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/library/mock/master-items.test.ts
```

Expected: PASS — all 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/master-items.ts src/library/mock/master-items.test.ts
git commit -m "feat: add MasterItem mock with CRUD, region-based OutletStock generation, and getDisplayStock"
```

---

### Task 4: ItemModal Component

**Files:**
- Create: `src/library/components/master-item/ItemModal.svelte`

Handles both create (`item` prop is `null`) and edit (`item` prop is a `MasterItem`). Derives available regions from `mockOutlets` — no separate regions master needed.

- [ ] **Step 1: Create the component**

```svelte
<!-- src/library/components/master-item/ItemModal.svelte -->
<script lang="ts">
    import type { MasterItem, CreateMasterItemPayload } from '$lib/types/MasterItem'
    import { createMasterItem, updateMasterItem } from '$lib/mock/master-items'
    import { mockOutlets } from '$lib/mock/outlets'

    export let item: MasterItem | null = null
    export let onClose: () => void
    export let onSave: (saved: MasterItem) => void

    const isEdit = item !== null
    const allRegions = [...new Set(mockOutlets.map(o => o.region))].sort()

    let sku = item?.sku ?? ''
    let barcode = item?.barcode ?? ''
    let name = item?.name ?? ''
    let description = item?.description ?? ''
    let imageUrl = item?.imageUrl ?? ''
    let category = item?.category ?? ''
    let satuan = item?.satuan ?? ''
    let weight = item?.weight != null ? String(item.weight) : ''
    let height = item?.height != null ? String(item.height) : ''
    let priceLevel1 = item?.priceLevel1 ? String(item.priceLevel1) : ''
    let priceLevel2 = item?.priceLevel2 ? String(item.priceLevel2) : ''
    let priceLevel3 = item?.priceLevel3 ? String(item.priceLevel3) : ''
    let priceLevel4 = item?.priceLevel4 ? String(item.priceLevel4) : ''
    let priceLevel5 = item?.priceLevel5 ? String(item.priceLevel5) : ''
    let itemType: "raw_material" | "finished_good" | "both" = item?.itemType ?? 'finished_good'
    let isActive = item?.isActive ?? true
    let selectedRegions: string[] = item?.availableRegions ? [...item.availableRegions] : []

    let error = ''
    let loading = false

    function outletCount(region: string): number {
        return mockOutlets.filter(o => o.region === region).length
    }

    function totalOutletCount(): number {
        return mockOutlets.filter(o => selectedRegions.includes(o.region)).length
    }

    function toggleRegion(region: string) {
        selectedRegions = selectedRegions.includes(region)
            ? selectedRegions.filter(r => r !== region)
            : [...selectedRegions, region]
    }

    function handleSubmit() {
        error = ''
        if (!sku.trim()) { error = 'SKU wajib diisi'; return }
        if (!name.trim()) { error = 'Nama item wajib diisi'; return }
        if (!category.trim()) { error = 'Kategori wajib diisi'; return }
        if (!satuan.trim()) { error = 'Satuan wajib diisi'; return }
        if (!priceLevel1 || Number(priceLevel1) <= 0) { error = 'Harga Level 1 wajib diisi'; return }
        if (selectedRegions.length === 0) { error = 'Pilih minimal satu wilayah distribusi'; return }

        const payload: CreateMasterItemPayload = {
            sku: sku.trim(),
            barcode: barcode.trim() || null,
            name: name.trim(),
            description: description.trim() || null,
            imageUrl: imageUrl.trim() || null,
            category: category.trim(),
            satuan: satuan.trim(),
            itemType,
            weight: weight ? Number(weight) : null,
            height: height ? Number(height) : null,
            priceLevel1: Number(priceLevel1),
            priceLevel2: priceLevel2 ? Number(priceLevel2) : 0,
            priceLevel3: priceLevel3 ? Number(priceLevel3) : 0,
            priceLevel4: priceLevel4 ? Number(priceLevel4) : 0,
            priceLevel5: priceLevel5 ? Number(priceLevel5) : 0,
            isActive,
            availableRegions: selectedRegions
        }

        loading = true
        try {
            const saved = isEdit ? updateMasterItem(item!.id, payload) : createMasterItem(payload)
            onSave(saved)
        } finally {
            loading = false
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') onClose()
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal modal-open">
    <div class="modal-box max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 class="font-bold text-lg mb-4">{isEdit ? 'Edit Item' : 'Tambah Item Baru'}</h3>

        {#if error}
            <div class="alert alert-error mb-4 py-2 text-sm">{error}</div>
        {/if}

        <!-- Identitas Item -->
        <p class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3">Identitas Item</p>

        <div class="form-control mb-3">
            <label class="label py-1"><span class="label-text text-xs opacity-60">Foto Item <span class="opacity-40">(opsional)</span></span></label>
            <input type="text" class="input input-bordered input-sm" placeholder="URL gambar (opsional)" bind:value={imageUrl} />
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="form-control col-span-2">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Nama Item <span class="text-error">*</span></span></label>
                <input type="text" class="input input-bordered input-sm" placeholder="Nama item" bind:value={name} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">SKU <span class="text-error">*</span></span></label>
                <input type="text" class="input input-bordered input-sm font-mono" placeholder="YKL-SLOP-001" bind:value={sku} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Barcode</span></label>
                <input type="text" class="input input-bordered input-sm font-mono" placeholder="8990000..." bind:value={barcode} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Kategori <span class="text-error">*</span></span></label>
                <input type="text" class="input input-bordered input-sm" placeholder="Minuman" bind:value={category} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Satuan <span class="text-error">*</span></span></label>
                <input type="text" class="input input-bordered input-sm" placeholder="Pcs, Slop, Kg..." bind:value={satuan} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Tipe Item <span class="text-error">*</span></span></label>
                <select class="select select-bordered select-sm" bind:value={itemType}>
                    <option value="finished_good">Finished Good — dijual via POS</option>
                    <option value="raw_material">Raw Material — bahan baku / komponen</option>
                    <option value="both">Both — dijual dan dipakai sebagai bahan</option>
                </select>
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Berat (gram)</span></label>
                <input type="number" class="input input-bordered input-sm" placeholder="0" min="0" bind:value={weight} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Tinggi (cm)</span></label>
                <input type="number" class="input input-bordered input-sm" placeholder="0" min="0" bind:value={height} />
            </div>
            <div class="form-control col-span-2">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Deskripsi</span></label>
                <textarea class="textarea textarea-bordered textarea-sm" rows="2" placeholder="Deskripsi item..." bind:value={description}></textarea>
            </div>
        </div>

        <!-- Harga -->
        <p class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3 mt-5">Harga</p>

        <div class="rounded-lg border border-success/20 bg-success/5 p-3 mb-3">
            <label class="label py-1 pt-0"><span class="label-text text-xs font-semibold text-success">Level 1 — Harga Default POS <span class="text-error">*</span></span></label>
            <input type="number" class="input input-bordered input-sm w-full font-mono" placeholder="0" min="0" bind:value={priceLevel1} />
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Level 2 <span class="opacity-40">(mis. Perusahaan)</span></span></label>
                <input type="number" class="input input-bordered input-sm font-mono" placeholder="0" min="0" bind:value={priceLevel2} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Level 3 <span class="opacity-40">(mis. Food Hailing)</span></span></label>
                <input type="number" class="input input-bordered input-sm font-mono" placeholder="0" min="0" bind:value={priceLevel3} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Level 4 <span class="opacity-40">(mis. E-Commerce)</span></span></label>
                <input type="number" class="input input-bordered input-sm font-mono" placeholder="0" min="0" bind:value={priceLevel4} />
            </div>
            <div class="form-control">
                <label class="label py-1"><span class="label-text text-xs opacity-60">Level 5</span></label>
                <input type="number" class="input input-bordered input-sm font-mono" placeholder="0" min="0" bind:value={priceLevel5} />
            </div>
        </div>

        <!-- Wilayah Distribusi -->
        <p class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3 mt-5">Wilayah Distribusi</p>

        <div class="flex flex-col gap-2 mb-2">
            {#each allRegions as region}
                {@const checked = selectedRegions.includes(region)}
                <label class="flex items-center gap-3 cursor-pointer rounded-lg border px-3 py-2 transition-colors {checked ? 'border-primary/40 bg-primary/5' : 'border-base-300'}">
                    <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" checked={checked} on:change={() => toggleRegion(region)} />
                    <div class="flex-1">
                        <span class="font-medium text-sm">{region}</span>
                        <span class="text-xs opacity-40 ml-2">{outletCount(region)} outlet</span>
                    </div>
                    {#if checked}
                        <span class="text-xs text-primary opacity-70">OutletStock akan dibuat</span>
                    {/if}
                </label>
            {/each}
        </div>

        {#if selectedRegions.length > 0}
            <p class="text-xs text-primary mb-3">
                ✓ Item akan tersedia di <strong>{totalOutletCount()} outlet</strong> ({selectedRegions.join(' + ')})
            </p>
        {/if}

        <!-- Status -->
        <p class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3 mt-5">Status</p>

        <label class="flex items-center gap-3 cursor-pointer mb-5">
            <input type="checkbox" class="toggle toggle-success" bind:checked={isActive} />
            <div>
                <span class="font-medium text-sm {isActive ? 'text-success' : 'opacity-50'}">
                    {isActive ? 'Aktif' : 'Nonaktif'}
                </span>
                <span class="text-xs opacity-40 ml-2">
                    {isActive ? '— item muncul di pencarian dan POS' : '— item tersembunyi dari semua fitur'}
                </span>
            </div>
        </label>

        <!-- Actions -->
        <div class="modal-action">
            <button class="btn btn-ghost btn-sm" on:click={onClose} disabled={loading}>Batal</button>
            <button class="btn btn-primary btn-sm" on:click={handleSubmit} disabled={loading}>
                {#if loading}<span class="loading loading-spinner loading-xs mr-1"></span>{/if}
                Simpan Item
            </button>
        </div>
    </div>
    <div class="modal-backdrop" on:click={onClose}></div>
</div>
```

- [ ] **Step 2: Verify manually**

Run `npm run dev` and navigate to any factory page that you can temporarily import ItemModal into. Verify:
- All 4 sections render with correct fields
- Region checkboxes populate from `mockOutlets` regions
- Summary line updates as regions are checked/unchecked
- Status toggle updates label text
- Submitting with empty required fields shows the error banner
- Escape closes the modal

- [ ] **Step 3: Commit**

```bash
git add src/library/components/master-item/ItemModal.svelte
git commit -m "feat: add ItemModal for MasterItem create/edit with 4-section form"
```

---

### Task 5: Master Item List Page

**Files:**
- Create: `src/routes/factory/master-item/+page.svelte`

Admin-only. Follows CLAUDE.md dashboard convention: search + per-page (10/25/50/100) + 5-button sliding pagination, all inline with no sub-components.

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/factory/master-item/+page.svelte -->
<script lang="ts">
    import { get } from 'svelte/store'
    import { goto } from '$app/navigation'
    import { auth } from '$lib/stores/auth'
    import type { MasterItem } from '$lib/types/MasterItem'
    import { getMasterItems } from '$lib/mock/master-items'
    import ItemModal from '$lib/components/master-item/ItemModal.svelte'

    const user = get(auth)
    if (user.role !== 'admin') goto('/outlet/dashboard')

    type StatusFilter = 'all' | 'active' | 'inactive'

    let items: MasterItem[] = getMasterItems()
    let search = ''
    let perPage: 10 | 25 | 50 | 100 = 25
    let currentPage = 1
    let statusFilter: StatusFilter = 'all'

    // undefined = modal closed, null = create mode, MasterItem = edit mode
    let modalItem: MasterItem | null | undefined = undefined

    function openCreate() { modalItem = null }
    function openEdit(item: MasterItem) { modalItem = item }
    function closeModal() { modalItem = undefined }

    function handleSave() {
        items = getMasterItems()
        closeModal()
    }

    function formatPrice(n: number): string {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
    }

    $: statusFiltered = items.filter(item => {
        if (statusFilter === 'active') return item.isActive
        if (statusFilter === 'inactive') return !item.isActive
        return true
    })

    $: filtered = statusFiltered.filter(item =>
        [item.name, item.sku, item.barcode ?? '', item.category, item.satuan]
            .some(v => v.toLowerCase().includes(search.toLowerCase()))
    )

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
    <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-bold">Master Item</h1>
        <button class="btn btn-primary btn-sm" on:click={openCreate}>+ Tambah Item</button>
    </div>

    <div class="flex items-center justify-between gap-4 mb-4">
        <input
            type="text"
            class="input input-bordered input-sm w-72"
            placeholder="Cari nama, SKU, barcode, kategori..."
            bind:value={search}
        />
        <div class="flex items-center gap-2">
            <div class="join">
                <button class="join-item btn btn-sm {statusFilter === 'all' ? 'btn-primary' : 'btn-ghost'}" on:click={() => statusFilter = 'all'}>Semua</button>
                <button class="join-item btn btn-sm {statusFilter === 'active' ? 'btn-primary' : 'btn-ghost'}" on:click={() => statusFilter = 'active'}>Aktif</button>
                <button class="join-item btn btn-sm {statusFilter === 'inactive' ? 'btn-primary' : 'btn-ghost'}" on:click={() => statusFilter = 'inactive'}>Nonaktif</button>
            </div>
            <select class="select select-bordered select-sm" bind:value={perPage}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
        </div>
    </div>

    <div class="overflow-x-auto">
        <table class="table table-sm w-full">
            <thead>
                <tr class="opacity-50 text-xs uppercase tracking-wider">
                    <th>Nama / SKU</th>
                    <th>Kategori</th>
                    <th>Satuan</th>
                    <th>Wilayah</th>
                    <th class="text-right">Harga L1</th>
                    <th class="text-center">Status</th>
                    <th class="text-right">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#if paginated.length === 0}
                    <tr><td colspan="7" class="text-center opacity-40 py-8">Tidak ada item ditemukan</td></tr>
                {/if}
                {#each paginated as item (item.id)}
                    <tr class="{!item.isActive ? 'opacity-50' : ''}">
                        <td>
                            <div class="font-medium text-sm">{item.name}</div>
                            <div class="text-xs opacity-40 font-mono">{item.sku}</div>
                        </td>
                        <td class="text-sm">{item.category}</td>
                        <td class="text-sm">{item.satuan}</td>
                        <td>
                            <div class="flex flex-wrap gap-1">
                                {#each item.availableRegions as region}
                                    <span class="badge badge-ghost badge-sm text-xs">{region}</span>
                                {/each}
                            </div>
                        </td>
                        <td class="text-right font-mono text-sm text-success">{formatPrice(item.priceLevel1)}</td>
                        <td class="text-center">
                            {#if item.isActive}
                                <span class="badge badge-success badge-sm">Aktif</span>
                            {:else}
                                <span class="badge badge-ghost badge-sm">Nonaktif</span>
                            {/if}
                        </td>
                        <td class="text-right">
                            <button class="btn btn-ghost btn-xs" on:click={() => openEdit(item)}>Edit</button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

    {#if totalPages > 1}
        <div class="flex justify-center items-center gap-1 mt-4">
            <button class="btn btn-sm btn-ghost" disabled={currentPage === 1} on:click={() => currentPage--}>‹</button>
            {#each pageButtons as p}
                <button
                    class="btn btn-sm {p === currentPage ? 'btn-primary' : 'btn-ghost'}"
                    on:click={() => currentPage = p}
                >{p}</button>
            {/each}
            <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
        </div>
    {/if}
</div>

{#if modalItem !== undefined}
    <ItemModal item={modalItem} onClose={closeModal} onSave={handleSave} />
{/if}
```

- [ ] **Step 2: Verify manually**

Run `npm run dev` and navigate to `/factory/master-item/`. Verify each of the following:

- [ ] Seed items appear (Yakult Slop, Pocari Sweat 500ml, Cookies Regal)
- [ ] Search filters across name, SKU, barcode, category, satuan simultaneously
- [ ] Nonaktif items render at reduced opacity
- [ ] Status filter buttons (Semua/Aktif/Nonaktif) work independently and in combination with search
- [ ] Per-page dropdown changes the visible row count (test with value 1 to force pagination)
- [ ] Pagination renders when filtered results exceed per-page limit
- [ ] "+ Tambah Item" opens the modal with title "Tambah Item Baru" and empty fields
- [ ] "Edit" opens the modal with title "Edit Item" and pre-filled values
- [ ] Saving a new item adds it to the table without full reload
- [ ] Saving an edited item updates the row in place
- [ ] Escape and backdrop click both close the modal
- [ ] Non-admin users are redirected to `/outlet/dashboard`

- [ ] **Step 3: Commit**

```bash
git add src/routes/factory/master-item/+page.svelte
git commit -m "feat: add Master Item admin list page with search, status filter, pagination, and create/edit modal"
```

---

## Final Check

Run the full test suite after all tasks:

```bash
npx vitest run
```

Expected: all tests pass with no failures.
