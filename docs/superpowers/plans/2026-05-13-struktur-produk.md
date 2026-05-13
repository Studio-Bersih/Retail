# Struktur Produk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-managed bill-of-materials feature (Struktur Produk) that defines which input materials are consumed to produce one unit of an output item, to be used by Rencana Produksi for auto-filling input material carts.

**Architecture:** TypeScript interfaces live in `types/StrukturProduk.ts`. One mock module holds the in-memory structure store with CRUD functions. Two Svelte files handle the full feature: a list page with search/filter/pagination and a create/edit modal with a dynamic component row builder.

**Tech Stack:** SvelteKit, TypeScript, TailwindCSS, DaisyUI, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/library/types/StrukturProduk.ts` | Create | TypeScript interfaces: StrukturProduk, StrukturKomponen, payload types |
| `src/library/mock/master-items.ts` | Modify | Add raw_material and bakery finished_good seed items needed for meaningful visual tests |
| `src/library/mock/struktur-produk.ts` | Create | In-memory store + CRUD: getStrukturProdukList, getActiveStrukturProdukList, getStrukturByOutputItem, createStrukturProduk, updateStrukturProduk |
| `src/library/mock/struktur-produk.test.ts` | Create | Vitest unit tests for all mock functions |
| `src/library/components/struktur-produk/StrukturModal.svelte` | Create | Create/edit modal — output item search picker, dynamic component rows, live preview, notes, status toggle |
| `src/routes/factory/struktur-produk/+page.svelte` | Create | Admin list page — search, status filter, pagination, table, opens StrukturModal |

---

### Task 1: TypeScript Types

**Files:**
- Create: `src/library/types/StrukturProduk.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/StrukturProduk.ts

export interface StrukturKomponen {
    itemId: string      // MasterItem.id — input material
    qty: number         // quantity consumed per 1 unit of output
}

export interface StrukturProduk {
    id: string
    outputItemId: string            // MasterItem.id — unique, one structure per output item
    components: StrukturKomponen[]  // input materials consumed to produce 1 unit
    notes: string | null
    isActive: boolean
    createdBy: string
    createdAt: string
    updatedBy: string | null
    updatedAt: string | null
}

export interface CreateStrukturPayload {
    outputItemId: string
    components: StrukturKomponen[]
    notes: string | null
}

export type UpdateStrukturPayload = Partial<CreateStrukturPayload> & { isActive?: boolean }
```

- [ ] **Step 2: Commit**

```bash
git add src/library/types/StrukturProduk.ts
git commit -m "feat: add StrukturProduk TypeScript types"
```

---

### Task 2: Extend Master Item Seed

**Files:**
- Modify: `src/library/mock/master-items.ts`

The existing master-items.ts seed only contains `finished_good` items (Yakult, Pocari, Cookies). Struktur Produk needs at least one `raw_material` item to be a component, and a meaningful `finished_good` item as the output. Add bakery-themed items.

- [ ] **Step 1: Open `src/library/mock/master-items.ts` and find the `seedItems()` function. Append these four items to the returned array:**

```typescript
        {
            id: 'item-seed-004',
            sku: 'BKR-TPG-001',
            barcode: null,
            name: 'Tepung Terigu',
            description: null,
            imageUrl: null,
            category: 'Bahan Baku',
            satuan: 'g',
            itemType: 'raw_material',
            weight: null,
            height: null,
            priceLevel1: 0,
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
            id: 'item-seed-005',
            sku: 'BKR-GUL-001',
            barcode: null,
            name: 'Gula Pasir',
            description: null,
            imageUrl: null,
            category: 'Bahan Baku',
            satuan: 'g',
            itemType: 'raw_material',
            weight: null,
            height: null,
            priceLevel1: 0,
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
            id: 'item-seed-006',
            sku: 'BKR-BRW-001',
            barcode: null,
            name: 'Kue Brownies',
            description: null,
            imageUrl: null,
            category: 'Makanan',
            satuan: 'Pcs',
            itemType: 'finished_good',
            weight: 200,
            height: null,
            priceLevel1: 35000,
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
            id: 'item-seed-007',
            sku: 'BKR-HMP-001',
            barcode: null,
            name: 'Eid Hampers',
            description: null,
            imageUrl: null,
            category: 'Makanan',
            satuan: 'Box',
            itemType: 'finished_good',
            weight: null,
            height: null,
            priceLevel1: 150000,
            priceLevel2: 140000,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/library/mock/master-items.ts
git commit -m "feat: add bakery raw_material and finished_good seed items for Struktur Produk"
```

---

### Task 3: Mock Store + Tests

**Files:**
- Create: `src/library/mock/struktur-produk.ts`
- Create: `src/library/mock/struktur-produk.test.ts`

**Business rules enforced in this layer:**
- One structure per output item — blocked even if the existing structure is inactive
- `createStrukturProduk` throws `'Item ini sudah memiliki Struktur Produk.'` on duplicate outputItemId
- `updateStrukturProduk` throws `'Struktur not found: <id>'` when ID is missing
- No deletion — only deactivation via `isActive: false`

- [ ] **Step 1: Write failing tests**

```typescript
// src/library/mock/struktur-produk.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
    getStrukturProdukList,
    getActiveStrukturProdukList,
    getStrukturByOutputItem,
    createStrukturProduk,
    updateStrukturProduk,
    _resetStruktur,
} from './struktur-produk'
import type { StrukturProduk } from '../types/StrukturProduk'

const seed: StrukturProduk[] = [
    {
        id: 'sp-seed-001',
        outputItemId: 'item-A',
        components: [{ itemId: 'item-raw-1', qty: 500 }, { itemId: 'item-raw-2', qty: 300 }],
        notes: null,
        isActive: true,
        createdBy: 'admin-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedBy: null,
        updatedAt: null,
    },
    {
        id: 'sp-seed-002',
        outputItemId: 'item-B',
        components: [{ itemId: 'item-raw-3', qty: 4 }],
        notes: 'legacy formula',
        isActive: false,
        createdBy: 'admin-1',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedBy: null,
        updatedAt: null,
    },
]

beforeEach(() => {
    _resetStruktur(seed.map(s => ({ ...s, components: s.components.map(c => ({ ...c })) })))
})

describe('getStrukturProdukList', () => {
    it('returns all structures including inactive', () => {
        const list = getStrukturProdukList()
        expect(list).toHaveLength(2)
    })

    it('returns a copy — mutations do not affect the store', () => {
        const list = getStrukturProdukList()
        list.push({ id: 'fake', outputItemId: 'x', components: [], notes: null, isActive: true, createdBy: 'u', createdAt: '', updatedBy: null, updatedAt: null })
        expect(getStrukturProdukList()).toHaveLength(2)
    })
})

describe('getActiveStrukturProdukList', () => {
    it('returns only active structures', () => {
        const list = getActiveStrukturProdukList()
        expect(list).toHaveLength(1)
        expect(list[0].id).toBe('sp-seed-001')
    })
})

describe('getStrukturByOutputItem', () => {
    it('returns the structure matching the output item id', () => {
        const s = getStrukturByOutputItem('item-A')
        expect(s?.id).toBe('sp-seed-001')
    })

    it('returns undefined when no structure exists for that output item', () => {
        expect(getStrukturByOutputItem('item-Z')).toBeUndefined()
    })

    it('returns inactive structures too', () => {
        const s = getStrukturByOutputItem('item-B')
        expect(s?.id).toBe('sp-seed-002')
        expect(s?.isActive).toBe(false)
    })
})

describe('createStrukturProduk', () => {
    it('creates a new structure with isActive true and returns it', () => {
        const result = createStrukturProduk(
            { outputItemId: 'item-C', components: [{ itemId: 'item-raw-4', qty: 1 }], notes: null },
            'admin-2'
        )
        expect(result.outputItemId).toBe('item-C')
        expect(result.isActive).toBe(true)
        expect(result.components).toEqual([{ itemId: 'item-raw-4', qty: 1 }])
        expect(result.createdBy).toBe('admin-2')
        expect(result.id).toBeTruthy()
        expect(result.createdAt).toBeTruthy()
        expect(result.updatedBy).toBeNull()
        expect(result.updatedAt).toBeNull()
    })

    it('stores notes when provided', () => {
        const result = createStrukturProduk(
            { outputItemId: 'item-C', components: [{ itemId: 'raw-1', qty: 1 }], notes: 'batch A' },
            'admin-1'
        )
        expect(result.notes).toBe('batch A')
    })

    it('persists the new structure to the list', () => {
        createStrukturProduk(
            { outputItemId: 'item-C', components: [{ itemId: 'raw-1', qty: 1 }], notes: null },
            'admin-1'
        )
        expect(getStrukturProdukList()).toHaveLength(3)
    })

    it('throws when output item already has an active structure', () => {
        expect(() =>
            createStrukturProduk(
                { outputItemId: 'item-A', components: [{ itemId: 'raw-1', qty: 1 }], notes: null },
                'admin-1'
            )
        ).toThrow('Item ini sudah memiliki Struktur Produk.')
    })

    it('throws when output item already has an inactive structure', () => {
        // item-B has isActive: false — still blocked
        expect(() =>
            createStrukturProduk(
                { outputItemId: 'item-B', components: [{ itemId: 'raw-1', qty: 1 }], notes: null },
                'admin-1'
            )
        ).toThrow('Item ini sudah memiliki Struktur Produk.')
    })
})

describe('updateStrukturProduk', () => {
    it('updates components and sets updatedBy + updatedAt', () => {
        const updated = updateStrukturProduk(
            'sp-seed-001',
            { components: [{ itemId: 'item-raw-1', qty: 750 }] },
            'admin-2'
        )
        expect(updated.components).toEqual([{ itemId: 'item-raw-1', qty: 750 }])
        expect(updated.updatedBy).toBe('admin-2')
        expect(updated.updatedAt).toBeTruthy()
        expect(updated.outputItemId).toBe('item-A')  // unchanged
    })

    it('can deactivate an active structure', () => {
        const updated = updateStrukturProduk('sp-seed-001', { isActive: false }, 'admin-1')
        expect(updated.isActive).toBe(false)
    })

    it('can reactivate an inactive structure', () => {
        const updated = updateStrukturProduk('sp-seed-002', { isActive: true }, 'admin-1')
        expect(updated.isActive).toBe(true)
    })

    it('can update notes to null', () => {
        const updated = updateStrukturProduk('sp-seed-002', { notes: null }, 'admin-1')
        expect(updated.notes).toBeNull()
    })

    it('persists the update', () => {
        updateStrukturProduk('sp-seed-001', { isActive: false }, 'admin-1')
        const list = getStrukturProdukList()
        const found = list.find(s => s.id === 'sp-seed-001')
        expect(found?.isActive).toBe(false)
    })

    it('throws when the id does not exist', () => {
        expect(() =>
            updateStrukturProduk('sp-999', { isActive: false }, 'admin-1')
        ).toThrow('Struktur not found: sp-999')
    })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/library/mock/struktur-produk.test.ts
```

Expected: FAIL — `Cannot find module './struktur-produk'`

- [ ] **Step 3: Implement the mock store**

```typescript
// src/library/mock/struktur-produk.ts
import type { StrukturProduk, CreateStrukturPayload, UpdateStrukturPayload } from '../types/StrukturProduk'

let store: StrukturProduk[] = [
    {
        id: 'sp-seed-001',
        outputItemId: 'item-seed-006',   // Kue Brownies
        components: [
            { itemId: 'item-seed-004', qty: 500 },  // Tepung Terigu 500g
            { itemId: 'item-seed-005', qty: 300 },  // Gula Pasir 300g
        ],
        notes: null,
        isActive: true,
        createdBy: 'admin-seed',
        createdAt: '2026-01-10T09:00:00.000Z',
        updatedBy: null,
        updatedAt: null,
    },
    {
        id: 'sp-seed-002',
        outputItemId: 'item-seed-007',   // Eid Hampers
        components: [
            { itemId: 'item-seed-004', qty: 200 },  // Tepung Terigu 200g
        ],
        notes: 'Resep lama — perlu diperbarui',
        isActive: false,
        createdBy: 'admin-seed',
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedBy: null,
        updatedAt: null,
    },
]

let nextId = 3

function getStrukturProdukList(): StrukturProduk[] {
    return store.map(s => ({ ...s, components: s.components.map(c => ({ ...c })) }))
}

function getActiveStrukturProdukList(): StrukturProduk[] {
    return store.filter(s => s.isActive).map(s => ({ ...s, components: s.components.map(c => ({ ...c })) }))
}

function getStrukturByOutputItem(outputItemId: string): StrukturProduk | undefined {
    const s = store.find(s => s.outputItemId === outputItemId)
    return s ? { ...s, components: s.components.map(c => ({ ...c })) } : undefined
}

function createStrukturProduk(payload: CreateStrukturPayload, adminId: string): StrukturProduk {
    if (store.some(s => s.outputItemId === payload.outputItemId)) {
        throw new Error('Item ini sudah memiliki Struktur Produk.')
    }
    const newStruktur: StrukturProduk = {
        id: `sp-${String(nextId++).padStart(5, '0')}`,
        outputItemId: payload.outputItemId,
        components: payload.components.map(c => ({ ...c })),
        notes: payload.notes,
        isActive: true,
        createdBy: adminId,
        createdAt: new Date().toISOString(),
        updatedBy: null,
        updatedAt: null,
    }
    store.push(newStruktur)
    return { ...newStruktur, components: newStruktur.components.map(c => ({ ...c })) }
}

function updateStrukturProduk(id: string, payload: UpdateStrukturPayload, adminId: string): StrukturProduk {
    const idx = store.findIndex(s => s.id === id)
    if (idx === -1) throw new Error(`Struktur not found: ${id}`)
    store[idx] = {
        ...store[idx],
        ...payload,
        components: payload.components ? payload.components.map(c => ({ ...c })) : store[idx].components,
        updatedBy: adminId,
        updatedAt: new Date().toISOString(),
    }
    return { ...store[idx], components: store[idx].components.map(c => ({ ...c })) }
}

function _resetStruktur(seed: StrukturProduk[] = []): void {
    store = seed.map(s => ({ ...s, components: s.components.map(c => ({ ...c })) }))
    nextId = seed.length + 1
}

export {
    getStrukturProdukList,
    getActiveStrukturProdukList,
    getStrukturByOutputItem,
    createStrukturProduk,
    updateStrukturProduk,
    _resetStruktur,
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/library/mock/struktur-produk.test.ts
```

Expected: All 16 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/struktur-produk.ts src/library/mock/struktur-produk.test.ts
git commit -m "feat: add Struktur Produk mock store with CRUD and uniqueness enforcement"
```

---

### Task 4: StrukturModal Component

**Files:**
- Create: `src/library/components/struktur-produk/StrukturModal.svelte`

The modal handles both create and edit mode from a single `struktur` prop (`null` = create, populated = edit). Key behaviors:
- Output item is locked (read-only) in edit mode
- State reinitializes each time `open` becomes `true`
- `getAvailableItems(rowIndex)` filters out the output item and any item already used in another row
- The currently selected item in a row always appears in its own dropdown, even if it would be filtered by deduplication logic
- Save is blocked client-side if output item is empty, any component row has no item or qty ≤ 0, or duplicate items exist

- [ ] **Step 1: Create the component**

```svelte
<!-- src/library/components/struktur-produk/StrukturModal.svelte -->
<script lang="ts">
    import { getMasterItems } from '$library/mock/master-items'
    import { createStrukturProduk, updateStrukturProduk } from '$library/mock/struktur-produk'
    import { get } from 'svelte/store'
    import { auth } from '$library/stores/auth'
    import type { StrukturProduk, StrukturKomponen } from '$library/types/StrukturProduk'
    import type { MasterItem } from '$library/types/MasterItem'

    export let open: boolean = false
    export let struktur: StrukturProduk | null = null
    export let onClose: () => void
    export let onSuccess: (s: StrukturProduk) => void

    const allItems: MasterItem[] = getMasterItems()

    // Items eligible as output: finished_good or both, active only
    const outputItems: MasterItem[] = allItems.filter(i => i.isActive && (i.itemType === 'finished_good' || i.itemType === 'both'))

    // Local form state — reinitialized whenever open becomes true
    let selectedOutputItemId = ''
    let outputSearch = ''
    let showOutputDropdown = false
    let components: StrukturKomponen[] = [{ itemId: '', qty: 0 }]
    let notes = ''
    let isActive = true
    let submitError = ''

    $: isCreate = struktur === null

    $: if (open) {
        selectedOutputItemId = struktur?.outputItemId ?? ''
        const outputItem = allItems.find(i => i.id === selectedOutputItemId)
        outputSearch = outputItem?.name ?? ''
        components = struktur?.components.map(c => ({ ...c })) ?? [{ itemId: '', qty: 0 }]
        notes = struktur?.notes ?? ''
        isActive = struktur?.isActive ?? true
        submitError = ''
        showOutputDropdown = false
    }

    $: filteredOutputItems = outputSearch
        ? outputItems.filter(i =>
            i.name.toLowerCase().includes(outputSearch.toLowerCase()) ||
            i.sku.toLowerCase().includes(outputSearch.toLowerCase())
          )
        : outputItems

    $: selectedOutputItem = allItems.find(i => i.id === selectedOutputItemId) ?? null

    function getAvailableItems(rowIndex: number): MasterItem[] {
        const usedIds = new Set(
            components.map((c, i) => (i !== rowIndex ? c.itemId : '')).filter(Boolean)
        )
        return allItems.filter(i =>
            i.isActive &&
            (i.itemType === 'raw_material' || i.itemType === 'both') &&
            i.id !== selectedOutputItemId &&
            !usedIds.has(i.id)
        )
    }

    $: previewParts = components
        .filter(c => c.itemId && c.qty > 0)
        .map(c => {
            const item = allItems.find(i => i.id === c.itemId)
            return item ? `${item.name} ${c.qty} ${item.satuan}` : null
        })
        .filter((p): p is string => p !== null)

    $: previewText = selectedOutputItem && previewParts.length > 0
        ? `1× ${selectedOutputItem.name} ← ${previewParts.join(' + ')}`
        : '—'

    function selectOutputItem(item: MasterItem) {
        selectedOutputItemId = item.id
        outputSearch = item.name
        showOutputDropdown = false
    }

    function addComponent() {
        components = [...components, { itemId: '', qty: 0 }]
    }

    function removeComponent(index: number) {
        if (components.length === 1) return
        components = components.filter((_, i) => i !== index)
    }

    function validate(): string | null {
        if (!selectedOutputItemId) return 'Pilih item yang diproduksi.'
        if (components.length === 0) return 'Minimal 1 komponen diperlukan.'
        for (const c of components) {
            if (!c.itemId) return 'Semua baris komponen harus memiliki item yang dipilih.'
            if (c.qty <= 0) return 'Qty setiap komponen harus lebih dari 0.'
        }
        const ids = components.map(c => c.itemId)
        if (new Set(ids).size !== ids.length) return 'Item komponen tidak boleh duplikat.'
        return null
    }

    function handleSubmit() {
        submitError = ''
        const err = validate()
        if (err) { submitError = err; return }

        try {
            const payload = {
                outputItemId: selectedOutputItemId,
                components: components.map(c => ({ itemId: c.itemId, qty: c.qty })),
                notes: notes.trim() || null,
            }
            const adminId = get(auth).userId
            let result: StrukturProduk
            if (isCreate) {
                result = createStrukturProduk(payload, adminId)
            } else {
                result = updateStrukturProduk(struktur!.id, { ...payload, isActive }, adminId)
            }
            onSuccess(result)
            onClose()
        } catch (e: unknown) {
            submitError = e instanceof Error ? e.message : 'Terjadi kesalahan.'
        }
    }
</script>

{#if open}
<div class="modal modal-open">
    <div class="modal-box max-w-2xl">
        <h3 class="font-bold text-lg mb-4">
            {isCreate ? 'Buat Struktur Produk' : 'Edit Struktur Produk'}
        </h3>

        <!-- Section 1: Produk Output -->
        <div class="mb-5">
            <div class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3">Produk Output</div>
            <label class="block text-sm opacity-60 mb-1">
                Item yang diproduksi <span class="text-error">*</span>
            </label>

            {#if isCreate}
                <div class="relative">
                    <input
                        type="text"
                        class="input input-bordered input-sm w-full"
                        placeholder="Cari nama atau SKU..."
                        bind:value={outputSearch}
                        on:focus={() => showOutputDropdown = true}
                        on:blur={() => setTimeout(() => { showOutputDropdown = false }, 150)}
                    />
                    {#if showOutputDropdown && filteredOutputItems.length > 0}
                        <div class="absolute z-50 w-full bg-base-200 border border-base-300 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                            {#each filteredOutputItems as item (item.id)}
                                <button
                                    class="w-full text-left px-3 py-2 hover:bg-base-300 text-sm flex items-baseline gap-2"
                                    on:click={() => selectOutputItem(item)}
                                >
                                    <span class="font-medium">{item.name}</span>
                                    <span class="font-mono text-xs opacity-40">{item.sku}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="input input-bordered input-sm w-full flex items-center gap-2 opacity-60 cursor-not-allowed bg-base-200">
                    <span class="font-medium">{selectedOutputItem?.name ?? '—'}</span>
                    <span class="font-mono text-xs opacity-50">{selectedOutputItem?.sku ?? ''}</span>
                </div>
            {/if}

            <p class="text-xs opacity-40 mt-1">Menghasilkan 1 unit per eksekusi. Jumlah diatur saat Rencana Produksi.</p>
        </div>

        <!-- Section 2: Komponen -->
        <div class="mb-5">
            <div class="text-xs uppercase tracking-widest opacity-40 border-b border-base-300 pb-1 mb-3">Komponen — Bahan yang Dikonsumsi</div>

            <div class="flex flex-col gap-2 mb-2">
                {#each components as comp, i (i)}
                    {@const currentItem = allItems.find(x => x.id === comp.itemId)}
                    {@const available = getAvailableItems(i)}
                    {@const showCurrentInList = currentItem && !available.find(x => x.id === comp.itemId)}
                    <div class="grid gap-2 items-center" style="grid-template-columns: 1fr 100px 28px">
                        <select class="select select-bordered select-sm" bind:value={comp.itemId}>
                            <option value="">Pilih item...</option>
                            {#if showCurrentInList && currentItem}
                                <option value={currentItem.id}>{currentItem.name} ({currentItem.satuan})</option>
                            {/if}
                            {#each available as item (item.id)}
                                <option value={item.id}>{item.name} ({item.satuan})</option>
                            {/each}
                        </select>
                        <input
                            type="number"
                            class="input input-bordered input-sm text-right font-mono"
                            min="0.01"
                            step="0.01"
                            bind:value={comp.qty}
                        />
                        <button
                            class="btn btn-ghost btn-sm text-error px-1"
                            on:click={() => removeComponent(i)}
                            disabled={components.length === 1}
                            title="Hapus baris"
                        >✕</button>
                    </div>
                {/each}
            </div>

            <button
                class="btn btn-outline btn-sm w-full border-dashed"
                on:click={addComponent}
            >+ Tambah Komponen</button>

            <div class="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2 text-sm text-primary mt-2 font-mono">
                Preview: {previewText}
            </div>
        </div>

        <!-- Section 3: Catatan & Status -->
        <div class="grid gap-4 items-start mb-4" style="grid-template-columns: 1fr auto">
            <div>
                <label class="block text-sm opacity-60 mb-1">Catatan</label>
                <input
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Opsional..."
                    bind:value={notes}
                />
            </div>
            <div>
                <label class="block text-sm opacity-60 mb-2">Status</label>
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" class="toggle toggle-success toggle-sm" bind:checked={isActive} />
                    <span class="text-sm {isActive ? 'text-success' : 'opacity-40'}">
                        {isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                </label>
            </div>
        </div>

        {#if submitError}
            <div class="alert alert-error text-sm py-2 mb-3">{submitError}</div>
        {/if}

        <!-- Actions -->
        <div class="modal-action border-t border-base-300 pt-4">
            <button class="btn btn-ghost btn-sm" on:click={onClose}>Batal</button>
            <button class="btn btn-primary btn-sm" on:click={handleSubmit}>Simpan</button>
        </div>
    </div>
</div>
{/if}
```

- [ ] **Step 2: Start the dev server and verify the modal manually**

```bash
npm run dev
```

Open `http://localhost:5173`. Navigate to `/factory/struktur-produk/` (the page is not yet built, so just verify no TypeScript compile errors in the terminal).

- [ ] **Step 3: Commit**

```bash
git add src/library/components/struktur-produk/StrukturModal.svelte
git commit -m "feat: add StrukturModal create/edit component with dynamic component rows and live preview"
```

---

### Task 5: List Page

**Files:**
- Create: `src/routes/factory/struktur-produk/+page.svelte`

The page holds all list logic inline (no sub-components). It sources structure data from the mock, resolves output item display names by looking up `getMasterItems()`, and keeps `strukturList` in sync after each save by re-fetching from the mock.

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/factory/struktur-produk/+page.svelte -->
<script lang="ts">
    import { getStrukturProdukList } from '$library/mock/struktur-produk'
    import { getMasterItems } from '$library/mock/master-items'
    import StrukturModal from '$library/components/struktur-produk/StrukturModal.svelte'
    import type { StrukturProduk } from '$library/types/StrukturProduk'
    import type { MasterItem } from '$library/types/MasterItem'

    let search = ''
    let perPage: 10 | 25 | 50 | 100 = 25
    let currentPage = 1
    let statusFilter: 'all' | 'active' | 'inactive' = 'all'

    let modalOpen = false
    let editingStruktur: StrukturProduk | null = null

    let strukturList: StrukturProduk[] = getStrukturProdukList()
    const allItems: MasterItem[] = getMasterItems()

    function getOutputItem(outputItemId: string): MasterItem | undefined {
        return allItems.find(i => i.id === outputItemId)
    }

    function openCreate() {
        editingStruktur = null
        modalOpen = true
    }

    function openEdit(s: StrukturProduk) {
        editingStruktur = s
        modalOpen = true
    }

    function handleSuccess(_s: StrukturProduk) {
        strukturList = getStrukturProdukList()
    }

    $: filtered = strukturList.filter(s => {
        const item = getOutputItem(s.outputItemId)
        const name = item?.name ?? ''
        const sku = item?.sku ?? ''
        const matchesSearch = !search ||
            name.toLowerCase().includes(search.toLowerCase()) ||
            sku.toLowerCase().includes(search.toLowerCase())
        const matchesStatus =
            statusFilter === 'all' ? true :
            statusFilter === 'active' ? s.isActive :
            !s.isActive
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
        <h1 class="text-xl font-bold">Struktur Produk</h1>
        <button class="btn btn-primary btn-sm" on:click={openCreate}>+ Buat Struktur</button>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-2">
            <input
                type="text"
                class="input input-bordered input-sm w-72"
                placeholder="Cari produk output..."
                bind:value={search}
            />
            <div class="join">
                <button
                    class="btn btn-sm join-item {statusFilter === 'all' ? 'btn-primary' : 'btn-ghost'}"
                    on:click={() => statusFilter = 'all'}
                >Semua</button>
                <button
                    class="btn btn-sm join-item {statusFilter === 'active' ? 'btn-primary' : 'btn-ghost'}"
                    on:click={() => statusFilter = 'active'}
                >Aktif</button>
                <button
                    class="btn btn-sm join-item {statusFilter === 'inactive' ? 'btn-primary' : 'btn-ghost'}"
                    on:click={() => statusFilter = 'inactive'}
                >Nonaktif</button>
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
                    <th>Produk Output</th>
                    <th class="text-center">Komponen</th>
                    <th class="text-center">Status</th>
                    <th class="text-right">Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#each paginated as s (s.id)}
                    {@const item = getOutputItem(s.outputItemId)}
                    <tr class="border-b border-base-200 hover:bg-base-200/30 {!s.isActive ? 'opacity-40' : ''}">
                        <td>
                            <div class="font-medium">{item?.name ?? s.outputItemId}</div>
                            <div class="text-xs font-mono opacity-40">{item?.sku ?? '—'}</div>
                        </td>
                        <td class="text-center opacity-70">{s.components.length} item</td>
                        <td class="text-center">
                            {#if s.isActive}
                                <span class="badge badge-success badge-sm badge-outline">Aktif</span>
                            {:else}
                                <span class="badge badge-ghost badge-sm">Nonaktif</span>
                            {/if}
                        </td>
                        <td class="text-right">
                            <button class="btn btn-ghost btn-xs" on:click={() => openEdit(s)}>Edit</button>
                        </td>
                    </tr>
                {/each}
                {#if paginated.length === 0}
                    <tr>
                        <td colspan="4" class="text-center opacity-40 py-10">Tidak ada data</td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex justify-center items-center gap-1 mt-4">
            <button class="btn btn-sm btn-ghost" disabled={currentPage === 1} on:click={() => currentPage--}>‹</button>
            {#each pageButtons as p (p)}
                <button
                    class="btn btn-sm {p === currentPage ? 'btn-primary' : 'btn-ghost'}"
                    on:click={() => currentPage = p}
                >{p}</button>
            {/each}
            <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
        </div>
    {/if}
</div>

<StrukturModal
    open={modalOpen}
    struktur={editingStruktur}
    onClose={() => modalOpen = false}
    onSuccess={handleSuccess}
/>
```

- [ ] **Step 2: Start the dev server and verify the page**

```bash
npm run dev
```

Open `http://localhost:5173/factory/struktur-produk/`. Verify:
- Two seed structures appear: "Kue Brownies" (Aktif) and "Eid Hampers" (Nonaktif, dimmed)
- Komponen column shows correct counts (2 and 1)
- Status filter buttons (Semua / Aktif / Nonaktif) filter the table correctly
- Search by name or SKU filters correctly
- Nonaktif rows render at reduced opacity

- [ ] **Step 3: Verify create flow**

Click "+ Buat Struktur". In the modal:
- Type "Kue" in the output item search — only active `finished_good`/`both` items matching "Kue" appear
- Select "Kue Brownies" → the field shows the item name and locks the choice
- Attempt to save immediately → error: "Semua baris komponen harus memiliki item yang dipilih."
- Select "Tepung Terigu" in the first component row, set qty to 200
- Click "+ Tambah Komponen" → new empty row appears
- Select the same "Tepung Terigu" again → it should NOT appear in the dropdown (deduplicated)
- Select "Gula Pasir" in the second row, set qty to 100
- Preview line shows: `1× Kue Brownies ← Tepung Terigu 200 g + Gula Pasir 100 g`
- Click "Simpan" → error: "Item ini sudah memiliki Struktur Produk." (Kue Brownies already exists)
- Change output item to a new item (e.g., "Yakult Slop") → save should succeed and the new row appears in the list

- [ ] **Step 4: Verify edit flow**

Click "Edit" on the Eid Hampers row:
- Output item field is read-only (shows "Eid Hampers" in locked state)
- Component rows show existing data (Tepung Terigu 200g)
- Toggle isActive to Aktif
- Click "Simpan" → Eid Hampers becomes Aktif in the list (opacity restored)

- [ ] **Step 5: Commit**

```bash
git add src/routes/factory/struktur-produk/+page.svelte
git commit -m "feat: add Struktur Produk admin list page with search, status filter, and pagination"
```
