# Item Masuk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Item Masuk feature — a stock intake record that increases stock immediately on creation, with Perbaikan Transaksi (PT) and version history.

**Architecture:** Standalone feature mirroring Item Keluar. All business logic lives in `useItemMasuk.ts`. The `outletConfig` mock gates `hargaBeli` display. Stock reconciliation on PT approval is the inverse of Item Keluar: qty increases = further stock increase, qty decreases = stock correction.

**Tech Stack:** SvelteKit, TypeScript, TailwindCSS + DaisyUI, Svelte Stores, Vitest

---

## File Map

**Created:**
- `src/library/types/ItemMasuk.ts` — all TypeScript interfaces
- `src/library/mock/suppliers.ts` — hardcoded supplier list
- `src/library/mock/outletConfig.ts` — per-outlet config mock
- `src/library/mock/itemMasuk.ts` — seed records
- `src/library/hooks/useItemMasuk.ts` — all business logic functions
- `src/library/stores/itemMasuk.ts` — reactive store + `refreshItemMasuks()`
- `src/library/components/outlet/item-masuk/ItemMasukForm.svelte` — creation modal form
- `src/library/components/outlet/item-masuk/ItemMasukDetail.svelte` — version timeline selector + inline diff table + PT button/status
- `src/library/components/outlet/item-masuk/ItemMasukRepairModal.svelte` — user PT request form modal
- `src/routes/outlet/item-masuk/+page.svelte` — main list + detail page
- `src/routes/outlet/item-masuk/repair/+page.svelte` — admin PT queue + diff + actions (all inline, no separate components)

**Test files:**
- `src/library/mock/outletConfig.test.ts`
- `src/library/hooks/useItemMasuk.test.ts`

---

### Task 1: Types, constants & mock data

**Files:**
- Create: `src/library/types/ItemMasuk.ts`
- Create: `src/library/mock/suppliers.ts`
- Create: `src/library/mock/outletConfig.ts`
- Create: `src/library/mock/itemMasuk.ts`
- Test: `src/library/utils/repairDiff.test.ts` (already exists — no new tests needed here)
- New test file: `src/library/mock/outletConfig.test.ts`

---

- [ ] **Step 1: Create the type file**

```typescript
// src/library/types/ItemMasuk.ts

export interface ItemMasukSnapshot {
    id: string
    outletId: string
    createdBy: string
    items: Array<{
        productId: string
        qty: number
        hargaBeli: number // always stored; UI display gated by OutletConfig
    }>
    totalCost: number // computed: sum(qty * hargaBeli)
    supplierId: string
    keterangan: string
    tanggal: string // "YYYY-MM-DD"
}

export interface ItemMasukVersion {
    index: number // 1, 2, 3...
    type: "original" | "approved"
    snapshot: ItemMasukSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface ItemMasukRepairRequest {
    id: string
    itemMasukId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: ItemMasukSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export interface ItemMasuk {
    id: string
    currentVersionIndex: number
    versions: ItemMasukVersion[]
    pendingRequest: ItemMasukRepairRequest | null
    isDeleted: boolean
}

export interface Supplier {
    id: string
    name: string
}

export interface OutletConfig {
    outletId: string
    showHargaBeli: boolean
}
```

- [ ] **Step 2: Create the supplier mock**

```typescript
// src/library/mock/suppliers.ts
import type { Supplier } from "$library/types/ItemMasuk"

export const mockSuppliers: Supplier[] = [
    { id: "sup-1", name: "PT Sumber Makmur" },
    { id: "sup-2", name: "CV Berkah Jaya" },
    { id: "sup-3", name: "UD Maju Bersama" },
]
```

- [ ] **Step 3: Write the failing test for `getOutletConfig`**

```typescript
// src/library/mock/outletConfig.test.ts
import { describe, it, expect } from "vitest"
import { getOutletConfig } from "./outletConfig"

describe("getOutletConfig", () => {
    it("returns config for known outlet", () => {
        const config = getOutletConfig("outlet-1")
        expect(config.outletId).toBe("outlet-1")
        expect(typeof config.showHargaBeli).toBe("boolean")
    })

    it("returns default config (showHargaBeli: false) for unknown outlet", () => {
        const config = getOutletConfig("unknown-outlet")
        expect(config.showHargaBeli).toBe(false)
    })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/library/mock/outletConfig.test.ts`
Expected: FAIL with "Cannot find module './outletConfig'"

- [ ] **Step 5: Create the outlet config mock**

```typescript
// src/library/mock/outletConfig.ts
import type { OutletConfig } from "$library/types/ItemMasuk"

const mockOutletConfigs: OutletConfig[] = [
    { outletId: "outlet-1", showHargaBeli: true },
    { outletId: "outlet-2", showHargaBeli: false },
]

export function getOutletConfig(outletId: string): OutletConfig {
    return mockOutletConfigs.find((c) => c.outletId === outletId) ?? { outletId, showHargaBeli: false }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/library/mock/outletConfig.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Create the ItemMasuk seed data**

```typescript
// src/library/mock/itemMasuk.ts
import type { ItemMasuk } from "$library/types/ItemMasuk"

export let mockItemMasuks: ItemMasuk[] = [
    {
        id: "im-1",
        currentVersionIndex: 1,
        isDeleted: false,
        pendingRequest: null,
        versions: [
            {
                index: 1,
                type: "original",
                requestId: null,
                createdBy: "user-1",
                createdAt: "2026-05-01T08:00:00Z",
                changedFields: [],
                snapshot: {
                    id: "im-snap-1",
                    outletId: "outlet-1",
                    createdBy: "user-1",
                    items: [
                        { productId: "prod-1", qty: 10, hargaBeli: 5000 },
                        { productId: "prod-2", qty: 5, hargaBeli: 12000 },
                    ],
                    totalCost: 110000,
                    supplierId: "sup-1",
                    keterangan: "Restock mingguan",
                    tanggal: "2026-05-01",
                },
            },
        ],
    },
    {
        id: "im-2",
        currentVersionIndex: 1,
        isDeleted: false,
        pendingRequest: {
            id: "imr-1",
            itemMasukId: "im-2",
            status: "rejected",
            submittedBy: "user-1",
            submittedAt: "2026-05-02T10:00:00Z",
            rejectionReason: "Jumlah tidak sesuai nota",
            revisions: 0,
            proposedSnapshot: {
                id: "im-snap-2-proposed",
                outletId: "outlet-1",
                createdBy: "user-1",
                items: [{ productId: "prod-3", qty: 20, hargaBeli: 3000 }],
                totalCost: 60000,
                supplierId: "sup-2",
                keterangan: "Tambahan stok",
                tanggal: "2026-05-02",
            },
        },
        versions: [
            {
                index: 1,
                type: "original",
                requestId: null,
                createdBy: "user-1",
                createdAt: "2026-05-02T09:00:00Z",
                changedFields: [],
                snapshot: {
                    id: "im-snap-2",
                    outletId: "outlet-1",
                    createdBy: "user-1",
                    items: [{ productId: "prod-3", qty: 15, hargaBeli: 3000 }],
                    totalCost: 45000,
                    supplierId: "sup-2",
                    keterangan: "Tambahan stok",
                    tanggal: "2026-05-02",
                },
            },
        ],
    },
]
```

- [ ] **Step 8: Commit**

```bash
git add src/library/types/ItemMasuk.ts src/library/mock/suppliers.ts src/library/mock/outletConfig.ts src/library/mock/outletConfig.test.ts src/library/mock/itemMasuk.ts
git commit -m "feat(item-masuk): add types, supplier mock, outlet config, and seed data"
```

---

### Task 2: Creation form & submission

**Files:**
- Create: `src/library/hooks/useItemMasuk.ts`
- Create: `src/library/stores/itemMasuk.ts`
- Create: `src/library/components/outlet/item-masuk/ItemMasukForm.svelte`
- Create: `src/routes/outlet/item-masuk/+page.svelte`
- Test: `src/library/hooks/useItemMasuk.test.ts`

---

- [ ] **Step 1: Write the failing test for `computeTotalCost` and `createItemMasuk`**

```typescript
// src/library/hooks/useItemMasuk.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { computeTotalCost, createItemMasuk } from "./useItemMasuk"
import { mockItemMasuks } from "$library/mock/itemMasuk"

describe("computeTotalCost", () => {
    it("sums qty * hargaBeli across all items", () => {
        const items = [
            { productId: "p1", qty: 3, hargaBeli: 10000 },
            { productId: "p2", qty: 2, hargaBeli: 5000 },
        ]
        expect(computeTotalCost(items)).toBe(40000)
    })

    it("returns 0 for empty items", () => {
        expect(computeTotalCost([])).toBe(0)
    })
})

describe("createItemMasuk", () => {
    const initialCount = mockItemMasuks.length

    it("adds a new record to the mock store", () => {
        createItemMasuk({
            outletId: "outlet-1",
            createdBy: "user-1",
            supplierId: "sup-1",
            keterangan: "Test masuk",
            tanggal: "2026-05-03",
            items: [{ productId: "prod-1", qty: 5, hargaBeli: 8000 }],
        })
        expect(mockItemMasuks.length).toBe(initialCount + 1)
    })

    it("creates V1 with type original", () => {
        const last = mockItemMasuks[mockItemMasuks.length - 1]
        expect(last.versions[0].type).toBe("original")
        expect(last.currentVersionIndex).toBe(1)
    })

    it("computes totalCost correctly", () => {
        const last = mockItemMasuks[mockItemMasuks.length - 1]
        expect(last.versions[0].snapshot.totalCost).toBe(40000)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/library/hooks/useItemMasuk.test.ts`
Expected: FAIL with "Cannot find module './useItemMasuk'"

- [ ] **Step 3: Create `useItemMasuk.ts` with create logic**

```typescript
// src/library/hooks/useItemMasuk.ts
import { get } from "svelte/store"
import { auth } from "$library/stores/auth"
import { mockItemMasuks } from "$library/mock/itemMasuk"
import { increaseStock, decreaseStock } from "$library/mock/stock"
import { getChangedFields } from "$library/utils/repairDiff"
import type { ItemMasuk, ItemMasukSnapshot, ItemMasukRepairRequest } from "$library/types/ItemMasuk"

export function computeTotalCost(items: Array<{ qty: number; hargaBeli: number }>): number {
    return items.reduce((sum, item) => sum + item.qty * item.hargaBeli, 0)
}

export function createItemMasuk(
    data: Omit<ItemMasukSnapshot, "id" | "totalCost">
): ItemMasuk {
    const id = `im-${Date.now()}`
    const snapId = `im-snap-${Date.now()}`

    const snapshot: ItemMasukSnapshot = {
        ...data,
        id: snapId,
        totalCost: computeTotalCost(data.items),
    }

    for (const item of data.items) {
        increaseStock(data.outletId, item.productId, item.qty)
    }

    const record: ItemMasuk = {
        id,
        currentVersionIndex: 1,
        isDeleted: false,
        pendingRequest: null,
        versions: [
            {
                index: 1,
                type: "original",
                snapshot,
                changedFields: [],
                createdBy: data.createdBy,
                createdAt: new Date().toISOString(),
                requestId: null,
            },
        ],
    }

    mockItemMasuks.push(record)
    return record
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/library/hooks/useItemMasuk.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Create the Svelte store**

```typescript
// src/library/stores/itemMasuk.ts
import { writable } from "svelte/store"
import type { ItemMasuk } from "$library/types/ItemMasuk"
import { mockItemMasuks } from "$library/mock/itemMasuk"

export const itemMasuks = writable<ItemMasuk[]>([...mockItemMasuks])

export function refreshItemMasuks(): void {
    itemMasuks.set([...mockItemMasuks])
}
```

- [ ] **Step 6: Create the creation form component**

```svelte
<!-- src/library/components/outlet/item-masuk/ItemMasukForm.svelte -->
<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import { mockSuppliers } from "$library/mock/suppliers"
    import { getOutletConfig } from "$library/mock/outletConfig"
    import { createItemMasuk } from "$library/hooks/useItemMasuk"
    import { refreshItemMasuks } from "$library/stores/itemMasuk"
    import { get } from "svelte/store"
    import { auth } from "$library/stores/auth"

    const dispatch = createEventDispatcher<{ close: void }>()

    $: outletId = $auth.outletId
    $: config = getOutletConfig(outletId)

    let supplierId = ""
    let keterangan = ""
    let tanggal = new Date().toISOString().slice(0, 10)
    let items: Array<{ productId: string; qty: number; hargaBeli: number }> = [
        { productId: "", qty: 1, hargaBeli: 0 },
    ]

    function addItem() {
        items = [...items, { productId: "", qty: 1, hargaBeli: 0 }]
    }

    function removeItem(index: number) {
        items = items.filter((_, i) => i !== index)
    }

    function handleSubmit() {
        if (!supplierId || items.some((i) => !i.productId || i.qty < 1)) return

        createItemMasuk({
            outletId,
            createdBy: $auth.userId,
            supplierId,
            keterangan,
            tanggal,
            items,
        })

        refreshItemMasuks()
        dispatch("close")
    }
</script>

<div class="flex flex-col gap-4 p-4">
    <h2 class="text-lg font-bold">Tambah Item Masuk</h2>

    <div class="form-control">
        <label class="label"><span class="label-text">Supplier</span></label>
        <select class="select select-bordered" bind:value={supplierId}>
            <option value="" disabled>Pilih Supplier</option>
            {#each mockSuppliers as supplier}
                <option value={supplier.id}>{supplier.name}</option>
            {/each}
        </select>
    </div>

    <div class="form-control">
        <label class="label"><span class="label-text">Tanggal</span></label>
        <input class="input input-bordered" type="date" bind:value={tanggal} />
    </div>

    <div class="flex flex-col gap-2">
        <label class="label"><span class="label-text">Items</span></label>
        {#each items as item, i}
            <div class="flex gap-2 items-center">
                <input class="input input-bordered flex-1" placeholder="Product ID (SKU)" bind:value={item.productId} />
                <input class="input input-bordered w-24" type="number" min="1" placeholder="Qty" bind:value={item.qty} />
                {#if config.showHargaBeli}
                    <input class="input input-bordered w-32" type="number" min="0" placeholder="Harga Beli" bind:value={item.hargaBeli} />
                {/if}
                <button class="btn btn-ghost btn-sm text-error" on:click={() => removeItem(i)} disabled={items.length === 1}>✕</button>
            </div>
        {/each}
        <button class="btn btn-ghost btn-sm self-start" on:click={addItem}>+ Tambah Item</button>
    </div>

    {#if config.showHargaBeli}
        <div class="text-sm opacity-70">
            Total Cost: Rp {items.reduce((s, i) => s + i.qty * i.hargaBeli, 0).toLocaleString("id-ID")}
        </div>
    {/if}

    <div class="form-control">
        <label class="label"><span class="label-text">Keterangan</span></label>
        <textarea class="textarea textarea-bordered" bind:value={keterangan}></textarea>
    </div>

    <div class="flex gap-2 justify-end">
        <button class="btn btn-ghost" on:click={() => dispatch("close")}>Batal</button>
        <button class="btn btn-primary" on:click={handleSubmit}>Simpan</button>
    </div>
</div>
```

- [ ] **Step 7: Create the main route page**

```svelte
<!-- src/routes/outlet/item-masuk/+page.svelte -->
<script lang="ts">
    import { itemMasuks, refreshItemMasuks } from "$library/stores/itemMasuk"
    import { mockSuppliers } from "$library/mock/suppliers"
    import { getOutletConfig } from "$library/mock/outletConfig"
    import { auth } from "$library/stores/auth"
    import ItemMasukForm from "$library/components/outlet/item-masuk/ItemMasukForm.svelte"
    import ItemMasukDetail from "$library/components/outlet/item-masuk/ItemMasukDetail.svelte"

    $: config = getOutletConfig($auth.outletId)
    $: active = $itemMasuks.filter((r) => !r.isDeleted)

    let showForm = false
    let selectedId: string | null = null
    $: selected = active.find((r) => r.id === selectedId) ?? null

    function supplierName(id: string) {
        return mockSuppliers.find((s) => s.id === id)?.name ?? "-"
    }
</script>

<div class="flex gap-4 p-4 h-full">
    <!-- List -->
    <div class="flex flex-col gap-2 w-80 shrink-0">
        <div class="flex justify-between items-center mb-2">
            <h2 class="text-lg font-bold">Item Masuk</h2>
            <button class="btn btn-primary btn-sm" on:click={() => (showForm = true)}>+ Tambah</button>
        </div>

        {#each active as record}
            {@const snap = record.versions[record.currentVersionIndex - 1].snapshot}
            <button
                class="card bg-base-200 p-3 text-left hover:bg-base-300 transition"
                class:ring-2={selectedId === record.id}
                class:ring-primary={selectedId === record.id}
                on:click={() => (selectedId = record.id)}
            >
                <div class="font-semibold text-sm">{supplierName(snap.supplierId)}</div>
                <div class="text-xs opacity-60">{snap.tanggal} · {snap.items.length} item(s)</div>
                {#if config.showHargaBeli}
                    <div class="text-xs opacity-60">Rp {snap.totalCost.toLocaleString("id-ID")}</div>
                {/if}
                {#if record.pendingRequest?.status === "pending"}
                    <span class="badge badge-warning badge-sm mt-1">PT Pending</span>
                {:else if record.pendingRequest?.status === "rejected"}
                    <span class="badge badge-error badge-sm mt-1">PT Rejected</span>
                {/if}
            </button>
        {/each}
    </div>

    <!-- Detail / Timeline -->
    <div class="flex-1">
        {#if selected}
            <ItemMasukDetail record={selected} on:refresh={refreshItemMasuks} />
        {:else}
            <div class="flex items-center justify-center h-full opacity-40">Pilih record untuk melihat detail</div>
        {/if}
    </div>
</div>

{#if showForm}
    <div class="modal modal-open">
        <div class="modal-box max-w-2xl">
            <ItemMasukForm on:close={() => { showForm = false; refreshItemMasuks() }} />
        </div>
        <div class="modal-backdrop" on:click={() => (showForm = false)}></div>
    </div>
{/if}
```

- [ ] **Step 8: Commit**

```bash
git add src/library/hooks/useItemMasuk.ts src/library/hooks/useItemMasuk.test.ts src/library/stores/itemMasuk.ts src/library/components/outlet/item-masuk/ItemMasukForm.svelte src/routes/outlet/item-masuk/+page.svelte
git commit -m "feat(item-masuk): creation form, submission, and stock increase"
```

---

### Task 3: Detail panel — version timeline + inline diff

**Files:**
- Create: `src/library/components/outlet/item-masuk/ItemMasukDetail.svelte`

The diff table is inlined directly — no separate `ItemMasukVersionDiff` component. Per CLAUDE.md: diff views belong in the enclosing file unless shared across pages.

---

- [ ] **Step 1: Create `ItemMasukDetail.svelte`**

```svelte
<!-- src/library/components/outlet/item-masuk/ItemMasukDetail.svelte -->
<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import type { ItemMasuk, ItemMasukVersion } from "$library/types/ItemMasuk"
    import { getOutletConfig } from "$library/mock/outletConfig"
    import { mockSuppliers } from "$library/mock/suppliers"
    import { auth } from "$library/stores/auth"
    import ItemMasukRepairModal from "./ItemMasukRepairModal.svelte"

    export let record: ItemMasuk

    const dispatch = createEventDispatcher<{ refresh: void }>()

    $: config = getOutletConfig($auth.outletId)

    let selectedIndex = record.currentVersionIndex
    $: selectedVersion = record.versions.find((v) => v.index === selectedIndex) ?? record.versions[record.currentVersionIndex - 1]
    $: prevVersion = selectedVersion.index > 1
        ? record.versions.find((v) => v.index === selectedVersion.index - 1) ?? null
        : null

    let showRepairModal = false

    function changed(field: string): boolean {
        return selectedVersion.changedFields.includes(field)
    }

    function rowClass(field: string): string {
        return changed(field) ? "bg-warning/10 font-semibold" : ""
    }

    function supplierName(id: string): string {
        return mockSuppliers.find((s) => s.id === id)?.name ?? id
    }
</script>

<div class="flex flex-col gap-4">
    <!-- Header: PT button / status -->
    <div class="flex justify-between items-center">
        <h3 class="font-bold">Riwayat Versi</h3>
        {#if !record.pendingRequest}
            <button class="btn btn-sm btn-outline" on:click={() => (showRepairModal = true)}>Perbaikan Transaksi</button>
        {:else if record.pendingRequest.status === "pending"}
            <span class="badge badge-warning">PT Pending</span>
        {:else if record.pendingRequest.status === "rejected"}
            <button class="btn btn-sm btn-outline btn-warning" on:click={() => (showRepairModal = true)}>Lihat Penolakan</button>
        {/if}
    </div>

    <!-- Version selector -->
    <div class="flex gap-2 flex-wrap">
        {#each record.versions as version}
            <button
                class="badge cursor-pointer"
                class:badge-secondary={version.type === "original"}
                class:badge-error={version.type === "approved"}
                class:ring-2={selectedIndex === version.index}
                on:click={() => (selectedIndex = version.index)}
            >
                V{version.index}
            </button>
        {/each}
    </div>

    <!-- Version meta -->
    <div class="flex items-center gap-2 text-sm">
        <span class="badge" class:badge-secondary={selectedVersion.type === "original"} class:badge-error={selectedVersion.type === "approved"}>
            V{selectedVersion.index} {selectedVersion.type}
        </span>
        <span class="opacity-50 text-xs">{selectedVersion.createdAt.slice(0, 10)} · {selectedVersion.createdBy}</span>
    </div>

    <!-- Inline diff table -->
    {#if prevVersion}
        <div class="overflow-x-auto text-sm">
            <table class="table table-xs">
                <thead>
                    <tr><th>Field</th><th>Before</th><th>After</th></tr>
                </thead>
                <tbody>
                    <tr class={rowClass("supplierId")}>
                        <td>Supplier</td>
                        <td>{supplierName(prevVersion.snapshot.supplierId)}</td>
                        <td>{supplierName(selectedVersion.snapshot.supplierId)}</td>
                    </tr>
                    <tr class={rowClass("tanggal")}>
                        <td>Tanggal</td>
                        <td>{prevVersion.snapshot.tanggal}</td>
                        <td>{selectedVersion.snapshot.tanggal}</td>
                    </tr>
                    <tr class={rowClass("keterangan")}>
                        <td>Keterangan</td>
                        <td>{prevVersion.snapshot.keterangan}</td>
                        <td>{selectedVersion.snapshot.keterangan}</td>
                    </tr>
                    <tr class={rowClass("items")}>
                        <td>Items</td>
                        <td class="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(prevVersion.snapshot.items, null, 2)}</td>
                        <td class="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(selectedVersion.snapshot.items, null, 2)}</td>
                    </tr>
                    {#if config.showHargaBeli}
                        <tr class={rowClass("totalCost")}>
                            <td>Total Cost</td>
                            <td>Rp {prevVersion.snapshot.totalCost.toLocaleString("id-ID")}</td>
                            <td>Rp {selectedVersion.snapshot.totalCost.toLocaleString("id-ID")}</td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    {:else}
        <!-- Original version — no previous to compare against -->
        <div class="flex flex-col gap-1 text-sm">
            <div class="opacity-50 text-xs mb-1">Versi asli — tidak ada perbandingan</div>
            <div><span class="opacity-60">Supplier:</span> {supplierName(selectedVersion.snapshot.supplierId)}</div>
            <div><span class="opacity-60">Tanggal:</span> {selectedVersion.snapshot.tanggal}</div>
            <div><span class="opacity-60">Keterangan:</span> {selectedVersion.snapshot.keterangan}</div>
            {#if config.showHargaBeli}
                <div><span class="opacity-60">Total Cost:</span> Rp {selectedVersion.snapshot.totalCost.toLocaleString("id-ID")}</div>
            {/if}
            <div class="mt-2 opacity-60">Items:</div>
            {#each selectedVersion.snapshot.items as item}
                <div class="ml-2 text-xs">
                    {item.productId} · qty {item.qty}
                    {#if config.showHargaBeli} · Rp {item.hargaBeli.toLocaleString("id-ID")}{/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

{#if showRepairModal}
    <div class="modal modal-open">
        <div class="modal-box max-w-2xl">
            <ItemMasukRepairModal
                {record}
                on:close={() => { showRepairModal = false; dispatch("refresh") }}
            />
        </div>
        <div class="modal-backdrop" on:click={() => (showRepairModal = false)}></div>
    </div>
{/if}
```

- [ ] **Step 2: Start dev server and verify detail panel renders**

Run: `npm run dev`
Navigate to `/outlet/item-masuk`
Expected: List on the left; clicking a record shows version selector + diff table on the right

- [ ] **Step 3: Commit**

```bash
git add src/library/components/outlet/item-masuk/ItemMasukDetail.svelte
git commit -m "feat(item-masuk): version timeline and inline diff in ItemMasukDetail"
```

---

### Task 4: PT — user request form & submit

**Files:**
- Create: `src/library/components/outlet/item-masuk/ItemMasukRepairModal.svelte`
- Modify: `src/library/hooks/useItemMasuk.ts` (add PT CRUD functions)
- Test: `src/library/hooks/useItemMasuk.test.ts` (add PT tests)

---

- [ ] **Step 1: Write the failing tests for PT user actions**

Add to `src/library/hooks/useItemMasuk.test.ts`:

```typescript
import { submitRepairRequest, reviseRepairRequest, deleteRepairRequest } from "./useItemMasuk"

describe("submitRepairRequest", () => {
    it("sets pendingRequest on the record", () => {
        const record = mockItemMasuks.find((r) => r.id === "im-1")!
        const proposed = { ...record.versions[0].snapshot, qty: 99 }
        submitRepairRequest("im-1", proposed as any)
        expect(record.pendingRequest).not.toBeNull()
        expect(record.pendingRequest?.status).toBe("pending")
    })

    it("does nothing if record already has pending request", () => {
        const record = mockItemMasuks.find((r) => r.id === "im-1")!
        const before = record.pendingRequest
        submitRepairRequest("im-1", record.versions[0].snapshot)
        expect(record.pendingRequest).toBe(before) // unchanged
    })
})

describe("deleteRepairRequest", () => {
    it("clears pendingRequest", () => {
        deleteRepairRequest("im-1")
        const record = mockItemMasuks.find((r) => r.id === "im-1")!
        expect(record.pendingRequest).toBeNull()
    })
})

describe("reviseRepairRequest", () => {
    it("increments revisions and clears rejection reason", () => {
        // im-2 has a rejected request
        const record = mockItemMasuks.find((r) => r.id === "im-2")!
        expect(record.pendingRequest?.status).toBe("rejected")
        reviseRepairRequest("im-2", record.versions[0].snapshot)
        expect(record.pendingRequest?.status).toBe("pending")
        expect(record.pendingRequest?.revisions).toBe(1)
        expect(record.pendingRequest?.rejectionReason).toBeNull()
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/library/hooks/useItemMasuk.test.ts`
Expected: FAIL with "submitRepairRequest is not a function"

- [ ] **Step 3: Add PT CRUD functions to `useItemMasuk.ts`**

Append to `src/library/hooks/useItemMasuk.ts`:

```typescript
export function submitRepairRequest(
    itemMasukId: string,
    proposedSnapshot: ItemMasukSnapshot
): void {
    const record = mockItemMasuks.find((r) => r.id === itemMasukId)
    if (!record || record.pendingRequest?.status === "pending") return

    const requestId = `imr-${Date.now()}`
    record.pendingRequest = {
        id: requestId,
        itemMasukId,
        status: "pending",
        proposedSnapshot: {
            ...proposedSnapshot,
            totalCost: computeTotalCost(proposedSnapshot.items),
        },
        submittedBy: get(auth).userId,
        submittedAt: new Date().toISOString(),
        rejectionReason: null,
        revisions: 0,
    }
}

export function reviseRepairRequest(
    itemMasukId: string,
    proposedSnapshot: ItemMasukSnapshot
): void {
    const record = mockItemMasuks.find((r) => r.id === itemMasukId)
    if (!record?.pendingRequest) return

    record.pendingRequest.proposedSnapshot = {
        ...proposedSnapshot,
        totalCost: computeTotalCost(proposedSnapshot.items),
    }
    record.pendingRequest.status = "pending"
    record.pendingRequest.revisions += 1
    record.pendingRequest.rejectionReason = null
}

export function deleteRepairRequest(itemMasukId: string): void {
    const record = mockItemMasuks.find((r) => r.id === itemMasukId)
    if (!record) return
    record.pendingRequest = null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/library/hooks/useItemMasuk.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Create the repair modal component**

```svelte
<!-- src/library/components/outlet/item-masuk/ItemMasukRepairModal.svelte -->
<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import type { ItemMasuk, ItemMasukSnapshot } from "$library/types/ItemMasuk"
    import { mockSuppliers } from "$library/mock/suppliers"
    import { getOutletConfig } from "$library/mock/outletConfig"
    import { submitRepairRequest, reviseRepairRequest, deleteRepairRequest } from "$library/hooks/useItemMasuk"
    import { auth } from "$library/stores/auth"

    export let record: ItemMasuk

    const dispatch = createEventDispatcher<{ close: void }>()

    $: config = getOutletConfig($auth.outletId)
    $: currentSnap = record.versions[record.currentVersionIndex - 1].snapshot
    $: isRejected = record.pendingRequest?.status === "rejected"
    $: isRevise = isRejected

    // Initialise form from pending proposed snapshot (if revising) or current
    $: base = record.pendingRequest?.proposedSnapshot ?? currentSnap

    let supplierId = base.supplierId
    let keterangan = base.keterangan
    let tanggal = base.tanggal
    let items = base.items.map((i) => ({ ...i }))

    function addItem() {
        items = [...items, { productId: "", qty: 1, hargaBeli: 0 }]
    }

    function removeItem(idx: number) {
        items = items.filter((_, i) => i !== idx)
    }

    function buildProposed(): ItemMasukSnapshot {
        return { ...currentSnap, supplierId, keterangan, tanggal, items, totalCost: 0 }
    }

    function handleSubmit() {
        const proposed = buildProposed()
        if (isRevise) {
            reviseRepairRequest(record.id, proposed)
        } else {
            submitRepairRequest(record.id, proposed)
        }
        dispatch("close")
    }

    function handleDelete() {
        deleteRepairRequest(record.id)
        dispatch("close")
    }
</script>

<div class="flex flex-col gap-4 p-4">
    <h2 class="text-lg font-bold">{isRevise ? "Revisi Perbaikan Transaksi" : "Perbaikan Transaksi"}</h2>

    {#if isRejected && record.pendingRequest?.rejectionReason}
        <div class="alert alert-error text-sm">
            <span>Ditolak: {record.pendingRequest.rejectionReason}</span>
        </div>
    {/if}

    <div class="form-control">
        <label class="label"><span class="label-text">Supplier</span></label>
        <select class="select select-bordered" bind:value={supplierId}>
            {#each mockSuppliers as s}
                <option value={s.id}>{s.name}</option>
            {/each}
        </select>
    </div>

    <div class="form-control">
        <label class="label"><span class="label-text">Tanggal</span></label>
        <input class="input input-bordered" type="date" bind:value={tanggal} />
    </div>

    <div class="flex flex-col gap-2">
        <label class="label"><span class="label-text">Items</span></label>
        {#each items as item, i}
            <div class="flex gap-2 items-center">
                <input class="input input-bordered flex-1" placeholder="Product ID" bind:value={item.productId} />
                <input class="input input-bordered w-24" type="number" min="1" bind:value={item.qty} />
                {#if config.showHargaBeli}
                    <input class="input input-bordered w-32" type="number" min="0" bind:value={item.hargaBeli} />
                {/if}
                <button class="btn btn-ghost btn-sm text-error" on:click={() => removeItem(i)} disabled={items.length === 1}>✕</button>
            </div>
        {/each}
        <button class="btn btn-ghost btn-sm self-start" on:click={addItem}>+ Tambah Item</button>
    </div>

    <div class="form-control">
        <label class="label"><span class="label-text">Keterangan</span></label>
        <textarea class="textarea textarea-bordered" bind:value={keterangan}></textarea>
    </div>

    <div class="flex gap-2 justify-between">
        <button class="btn btn-ghost btn-sm text-error" on:click={handleDelete}>Hapus Request</button>
        <div class="flex gap-2">
            <button class="btn btn-ghost" on:click={() => dispatch("close")}>Batal</button>
            <button class="btn btn-primary" on:click={handleSubmit}>Submit Request</button>
        </div>
    </div>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add src/library/hooks/useItemMasuk.ts src/library/hooks/useItemMasuk.test.ts src/library/components/outlet/item-masuk/ItemMasukRepairModal.svelte
git commit -m "feat(item-masuk): PT user request form and submit/revise/delete"
```

---

### Task 5: PT — admin queue & diff view (inline in repair page)

**Files:**
- Create: `src/routes/outlet/item-masuk/repair/+page.svelte`

The admin queue list and diff table are inlined directly in the route page — no separate component files. Per CLAUDE.md: admin panels, lists, and diff views belong in the page file unless genuinely shared.

---

- [ ] **Step 1: Create the admin repair queue route with inline queue and diff**

```svelte
<!-- src/routes/outlet/item-masuk/repair/+page.svelte -->
<script lang="ts">
    import { itemMasuks, refreshItemMasuks } from "$library/stores/itemMasuk"
    import { getOutletConfig } from "$library/mock/outletConfig"
    import { mockSuppliers } from "$library/mock/suppliers"
    import { approveRepairRequest, rejectRepairRequest, deleteRepairRequest, deleteRecord } from "$library/hooks/useItemMasuk"
    import { auth } from "$library/stores/auth"
    import type { ItemMasuk } from "$library/types/ItemMasuk"

    $: config = getOutletConfig($auth.outletId)
    $: pending = $itemMasuks.filter((r) => !r.isDeleted && r.pendingRequest?.status === "pending")

    let selectedId: string | null = null
    $: selected = pending.find((r) => r.id === selectedId) ?? null
    $: current = selected ? selected.versions[selected.currentVersionIndex - 1].snapshot : null
    $: proposed = selected?.pendingRequest?.proposedSnapshot ?? null

    let rejectReason = ""
    let showRejectInput = false

    function supplierName(id: string): string {
        return mockSuppliers.find((s) => s.id === id)?.name ?? id
    }

    function selectRecord(id: string) {
        selectedId = id
        rejectReason = ""
        showRejectInput = false
    }

    function handleApprove() {
        if (!selected) return
        approveRepairRequest(selected.id)
        selectedId = null
        refreshItemMasuks()
    }

    function handleReject() {
        if (!selected || !rejectReason.trim()) return
        rejectRepairRequest(selected.id, rejectReason.trim())
        selectedId = null
        refreshItemMasuks()
    }

    function handleDeleteRequest() {
        if (!selected) return
        deleteRepairRequest(selected.id)
        selectedId = null
        refreshItemMasuks()
    }

    function handleDeleteRecord() {
        if (!selected) return
        deleteRecord(selected.id)
        selectedId = null
        refreshItemMasuks()
    }

    function diffClass(a: unknown, b: unknown): string {
        return JSON.stringify(a) !== JSON.stringify(b) ? "bg-warning/10 font-semibold" : ""
    }
</script>

<div class="flex gap-4 p-4 h-full">
    <!-- Left: pending request list -->
    <div class="flex flex-col gap-2 w-72 shrink-0">
        <h3 class="font-bold mb-2">Antrian PT Item Masuk</h3>
        {#if pending.length === 0}
            <div class="opacity-40 text-sm">Tidak ada request pending</div>
        {/if}
        {#each pending as record}
            {@const snap = record.versions[record.currentVersionIndex - 1].snapshot}
            <button
                class="card bg-base-200 p-3 text-left hover:bg-base-300 transition"
                class:ring-2={selectedId === record.id}
                class:ring-primary={selectedId === record.id}
                on:click={() => selectRecord(record.id)}
            >
                <div class="font-semibold text-sm">{supplierName(snap.supplierId)}</div>
                <div class="text-xs opacity-60">{snap.tanggal}</div>
                <span class="badge badge-warning badge-sm mt-1">Pending</span>
            </button>
        {/each}
    </div>

    <!-- Right: inline diff + action buttons -->
    <div class="flex-1">
        {#if selected && current && proposed}
            <div class="flex flex-col gap-4 text-sm">
                <h3 class="font-bold">Tinjauan Perbaikan</h3>

                <div class="overflow-x-auto">
                    <table class="table table-sm">
                        <thead>
                            <tr><th>Field</th><th>Original</th><th>Proposed</th></tr>
                        </thead>
                        <tbody>
                            <tr class={diffClass(current.supplierId, proposed.supplierId)}>
                                <td>Supplier</td>
                                <td>{supplierName(current.supplierId)}</td>
                                <td>{supplierName(proposed.supplierId)}</td>
                            </tr>
                            <tr class={diffClass(current.tanggal, proposed.tanggal)}>
                                <td>Tanggal</td>
                                <td>{current.tanggal}</td>
                                <td>{proposed.tanggal}</td>
                            </tr>
                            <tr class={diffClass(current.keterangan, proposed.keterangan)}>
                                <td>Keterangan</td>
                                <td>{current.keterangan}</td>
                                <td>{proposed.keterangan}</td>
                            </tr>
                            <tr class={diffClass(current.items, proposed.items)}>
                                <td>Items</td>
                                <td class="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(current.items, null, 2)}</td>
                                <td class="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(proposed.items, null, 2)}</td>
                            </tr>
                            {#if config.showHargaBeli}
                                <tr class={diffClass(current.totalCost, proposed.totalCost)}>
                                    <td>Total Cost</td>
                                    <td>Rp {current.totalCost.toLocaleString("id-ID")}</td>
                                    <td>Rp {proposed.totalCost.toLocaleString("id-ID")}</td>
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </div>

                <div class="flex flex-col gap-2">
                    <button class="btn btn-success btn-sm" on:click={handleApprove}>✓ Approve</button>

                    {#if showRejectInput}
                        <div class="flex gap-2">
                            <input class="input input-bordered flex-1 input-sm" placeholder="Alasan penolakan..." bind:value={rejectReason} />
                            <button class="btn btn-error btn-sm" on:click={handleReject} disabled={!rejectReason.trim()}>Kirim</button>
                            <button class="btn btn-ghost btn-sm" on:click={() => (showRejectInput = false)}>Batal</button>
                        </div>
                    {:else}
                        <button class="btn btn-error btn-outline btn-sm" on:click={() => (showRejectInput = true)}>✗ Reject</button>
                    {/if}

                    <button class="btn btn-ghost btn-sm" on:click={handleDeleteRequest}>Hapus Request</button>
                    <button class="btn btn-ghost btn-sm text-error" on:click={handleDeleteRecord}>Hapus Record</button>
                </div>
            </div>
        {:else}
            <div class="flex items-center justify-center h-full opacity-40">Pilih request untuk ditinjau</div>
        {/if}
    </div>
</div>
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`
Navigate to `/outlet/item-masuk/repair`
Expected: Left column lists pending PT requests; clicking "im-2" shows the diff table with approve/reject/delete buttons on the right

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/item-masuk/repair/+page.svelte
git commit -m "feat(item-masuk): admin repair queue and inline diff view"
```

---

### Task 6: PT — approve (stock reconciliation) / reject / delete

**Files:**
- Modify: `src/library/hooks/useItemMasuk.ts` (add approve, reject, deleteRecord)
- Test: `src/library/hooks/useItemMasuk.test.ts` (add approval + stock tests)

---

- [ ] **Step 1: Write the failing tests for admin actions**

Add to `src/library/hooks/useItemMasuk.test.ts`:

```typescript
import { approveRepairRequest, rejectRepairRequest, deleteRecord } from "./useItemMasuk"
import { mockStock } from "$library/mock/stock"

describe("approveRepairRequest", () => {
    it("creates a new version with type approved", () => {
        // im-2 has a pending request (after reviseRepairRequest resubmitted it in Task 4 test)
        // Re-set it to pending for this test
        const record = mockItemMasuks.find((r) => r.id === "im-2")!
        record.pendingRequest!.status = "pending"

        const beforeCount = record.versions.length
        approveRepairRequest("im-2")
        expect(record.versions.length).toBe(beforeCount + 1)
        expect(record.versions[record.versions.length - 1].type).toBe("approved")
    })

    it("clears pendingRequest after approval", () => {
        const record = mockItemMasuks.find((r) => r.id === "im-2")!
        expect(record.pendingRequest).toBeNull()
    })
})

describe("rejectRepairRequest", () => {
    it("sets status to rejected with reason", () => {
        // submit a fresh request on im-1
        const record = mockItemMasuks.find((r) => r.id === "im-1")!
        submitRepairRequest("im-1", record.versions[0].snapshot)
        rejectRepairRequest("im-1", "Data tidak valid")
        expect(record.pendingRequest?.status).toBe("rejected")
        expect(record.pendingRequest?.rejectionReason).toBe("Data tidak valid")
    })
})

describe("deleteRecord", () => {
    it("marks record as deleted", () => {
        // create a fresh record to delete
        const before = mockItemMasuks.length
        createItemMasuk({
            outletId: "outlet-1",
            createdBy: "user-1",
            supplierId: "sup-1",
            keterangan: "to delete",
            tanggal: "2026-05-03",
            items: [{ productId: "prod-delete", qty: 3, hargaBeli: 1000 }],
        })
        const created = mockItemMasuks[mockItemMasuks.length - 1]
        deleteRecord(created.id)
        expect(created.isDeleted).toBe(true)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/library/hooks/useItemMasuk.test.ts`
Expected: FAIL with "approveRepairRequest is not a function"

- [ ] **Step 3: Add approve, reject, and deleteRecord to `useItemMasuk.ts`**

Append to `src/library/hooks/useItemMasuk.ts`:

```typescript
export function approveRepairRequest(itemMasukId: string): void {
    const record = mockItemMasuks.find((r) => r.id === itemMasukId)
    if (!record?.pendingRequest) return

    const current = record.versions[record.currentVersionIndex - 1].snapshot
    const proposed = record.pendingRequest.proposedSnapshot
    const outletId = current.outletId

    // Stock reconciliation — inverse of Item Keluar
    const currentMap = new Map(current.items.map((i) => [i.productId, i.qty]))
    const proposedMap = new Map(proposed.items.map((i) => [i.productId, i.qty]))

    // Products removed from record → undo intake (decrease stock)
    for (const [productId, qty] of currentMap) {
        if (!proposedMap.has(productId)) {
            decreaseStock(outletId, productId, qty)
        }
    }

    // Products in proposed
    for (const [productId, proposedQty] of proposedMap) {
        const currentQty = currentMap.get(productId) ?? 0
        const delta = proposedQty - currentQty
        if (delta > 0) {
            // qty increased → increase stock further (under-counted)
            increaseStock(outletId, productId, delta)
        } else if (delta < 0) {
            // qty decreased → decrease stock (over-counted)
            decreaseStock(outletId, productId, Math.abs(delta))
        }
        // delta === 0 → no change
        // new product (currentQty === 0) → handled by delta > 0 branch
    }

    const changedFields = getChangedFields(current as any, proposed as any)

    record.versions.push({
        index: record.currentVersionIndex + 1,
        type: "approved",
        snapshot: proposed,
        changedFields,
        createdBy: get(auth).userId,
        createdAt: new Date().toISOString(),
        requestId: record.pendingRequest.id,
    })
    record.currentVersionIndex += 1
    record.pendingRequest = null
}

export function rejectRepairRequest(itemMasukId: string, reason: string): void {
    const record = mockItemMasuks.find((r) => r.id === itemMasukId)
    if (!record?.pendingRequest) return
    record.pendingRequest.status = "rejected"
    record.pendingRequest.rejectionReason = reason
}

export function deleteRecord(itemMasukId: string): void {
    const record = mockItemMasuks.find((r) => r.id === itemMasukId)
    if (!record) return

    // Undo intake: decrease stock for current version's items
    const current = record.versions[record.currentVersionIndex - 1].snapshot
    for (const item of current.items) {
        decreaseStock(current.outletId, item.productId, item.qty)
    }

    record.isDeleted = true
    record.pendingRequest = null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/library/hooks/useItemMasuk.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/library/hooks/useItemMasuk.ts src/library/hooks/useItemMasuk.test.ts
git commit -m "feat(item-masuk): PT approve with stock reconciliation, reject, and delete record"
```

---

### Task 7: PT — rejection reason display & resubmit flow (end-to-end verification)

**Files:** No new files — wire everything together and verify the full user journey.

---

- [ ] **Step 1: Verify user-side rejection flow**

Run: `npm run dev`

1. Navigate to `/outlet/item-masuk`
2. Click the "im-2" record (has a rejected PT in seed data)
3. Expected: "Lihat Penolakan" button visible
4. Click it → modal opens showing rejection reason "Jumlah tidak sesuai nota"
5. Edit any field → click **Submit Request** (triggers `reviseRepairRequest`)
6. Expected: modal closes, record shows "PT Pending" badge

- [ ] **Step 2: Verify admin approval flow**

1. Navigate to `/outlet/item-masuk/repair`
2. Expected: the resubmitted "im-2" record appears in the queue
3. Click it → diff view shows original vs proposed
4. Click **Approve**
5. Expected: record disappears from queue
6. Navigate back to `/outlet/item-masuk` → "im-2" now shows V2 in timeline

- [ ] **Step 3: Verify stock reconciliation correctness**

In the browser console or a quick Vitest test, verify:

```typescript
// Manually verify stock delta after approve
import { mockStock } from "$library/mock/stock"
console.log(mockStock) // confirm product quantities updated correctly
```

Expected: if proposed qty for a product was higher than current, stock increased; if lower, stock decreased.

- [ ] **Step 4: Verify `hargaBeli` config toggle**

1. In `src/library/mock/outletConfig.ts`, set `outlet-1` to `showHargaBeli: false`
2. Reload — expected: harga beli column hidden in form and diff view, totalCost not shown
3. Set back to `true` — expected: fields reappear

- [ ] **Step 5: Verify delete record restores stock**

1. Create a new Item Masuk record via the form
2. Navigate to admin repair queue — submit a PT request from user side first
3. In admin view click **Hapus Record**
4. Expected: record no longer appears in the list, stock for that record's items is restored

- [ ] **Step 6: Run all Item Masuk tests**

Run: `npx vitest run src/library/hooks/useItemMasuk.test.ts src/library/mock/outletConfig.test.ts`
Expected: PASS (all tests)

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat(item-masuk): complete PT rejection display, resubmit, and end-to-end verification"
```

---

## Self-Review

**Spec coverage:**
- ✓ Stock increases immediately on creation (`createItemMasuk` calls `increaseStock`)
- ✓ Form fields: Pilih Supplier, Items (productId + qty + hargaBeli), Keterangan, Tanggal
- ✓ `hargaBeli` always stored, displayed only when `outletConfig.showHargaBeli = true`
- ✓ `totalCost` computed as `sum(qty × hargaBeli)`, hidden behind same config
- ✓ PT: one pending request at a time, record locked while pending
- ✓ PT admin actions: approve, reject + reason, delete request, delete record
- ✓ PT stock reconciliation: inverse of Item Keluar (qty increase → more stock, qty decrease → less stock, product removed → decrease stock, product added → increase stock)
- ✓ Version history: V1 original (purple), V2+ approved (red), no instant type
- ✓ Supplier is hardcoded (`mockSuppliers`)
- ✓ OutletConfig per-outlet mock with `getOutletConfig(outletId)`
- ✓ No PTI variant
- ✓ No PIC / bill split

**Type consistency:** All functions reference `ItemMasukSnapshot`, `ItemMasuk`, `ItemMasukRepairRequest` as defined in Task 1. `computeTotalCost` signature is `Array<{ qty: number; hargaBeli: number }>` and used consistently in Task 2, 4, and 6. `getChangedFields` import from `$library/utils/repairDiff` is consistent with Item Keluar usage.
