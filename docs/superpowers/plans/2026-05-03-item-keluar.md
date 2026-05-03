# Item Keluar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Item Keluar feature — a stock disposal recorder with PIC accountability, manual bill splitting, and a full Perbaikan Transaksi (PT) repair flow with stock reconciliation on approval.

**Architecture:** Standalone feature (Approach A) — its own types, mock data, hooks, and components, independent of the Perbaikan Transaksi feature. Reuses `getChangedFields` from `repairDiff.ts` since it is a generic pure utility. Stock changes are applied to `mock/items.ts` at creation and reconciled on PT approval.

**Tech Stack:** SvelteKit · TypeScript · TailwindCSS · DaisyUI · Svelte Stores · Mock data layer

> **Note:** `$lib` resolves to `src/library/`. Ensure `svelte.config.js` includes `kit: { alias: { $lib: 'src/library' } }`.

---

## File Map

**Created:**
- `src/library/types/ItemKeluar.ts` — all Item Keluar TypeScript interfaces and constants
- `src/library/mock/employees.ts` — mock employee master list (PIC source)
- `src/library/mock/itemKeluar.ts` — mock Item Keluar records with versions
- `src/library/mock/stock.ts` — mock per-product stock levels (modified by Item Keluar and reconciliation)
- `src/library/hooks/useItemKeluar.ts` — all Item Keluar operations (create, PT submit/revise/delete, approve/reject/delete record)
- `src/library/stores/itemKeluar.ts` — UI state for active form/modal
- `src/library/components/outlet/item-keluar/ItemKeluarForm.svelte` — creation form (new record)
- `src/library/components/outlet/item-keluar/ItemKeluarRepairModal.svelte` — PT request form + rejection/revision flow
- `src/library/components/outlet/item-keluar/ItemKeluarVersionTimeline.svelte` — version history timeline
- `src/library/components/outlet/item-keluar/ItemKeluarVersionDiff.svelte` — two-version field comparison
- `src/library/components/outlet/item-keluar/AdminItemKeluarQueue.svelte` — admin pending request list
- `src/library/components/outlet/item-keluar/AdminItemKeluarDiffView.svelte` — admin diff + action buttons
- `src/routes/outlet/item-keluar/+page.svelte` — main page: history list + create button
- `src/routes/outlet/item-keluar/repair/+page.svelte` — admin repair queue page

**Modified:**
- `src/library/mock/items.ts` — add `stock` field per product if not present

---

## Task 1: Types, Constants & Mock Data

**Files:**
- Create: `src/library/types/ItemKeluar.ts`
- Create: `src/library/mock/employees.ts`
- Create: `src/library/mock/stock.ts`
- Create: `src/library/mock/itemKeluar.ts`
- Modify: `src/library/mock/items.ts`

- [ ] **Step 1.1: Create ItemKeluar.ts**

```typescript
// src/library/types/ItemKeluar.ts

export const ITEM_KELUAR_CATEGORIES = ["Bugs", "Afkir Terdisplay", "Rotten"] as const
export type ItemKeluarKategori = typeof ITEM_KELUAR_CATEGORIES[number]

export interface ItemKeluarItem {
  productId: string
  qty: number
  unitPrice: number   // manual entry — not pulled from catalog
}

export interface ItemKeluarPIC {
  employeeId: string
  name: string
  amountAssigned: number   // IDR, manual — may not sum to totalLoss
}

export interface ItemKeluarSnapshot {
  id: string
  outletId: string
  createdBy: string
  items: ItemKeluarItem[]
  totalLoss: number        // computed: sum(qty * unitPrice)
  kategori: ItemKeluarKategori
  keterangan: string
  tanggal: string          // "YYYY-MM-DD"
  pics: ItemKeluarPIC[]
}

export interface ItemKeluarVersion {
  index: number            // 1, 2, 3...
  type: "original" | "approved"   // no "instant"
  snapshot: ItemKeluarSnapshot
  changedFields: string[]
  createdBy: string
  createdAt: string
  requestId: string | null
}

export interface ItemKeluarRepairRequest {
  id: string
  itemKeluarId: string
  status: "pending" | "rejected" | "deleted"
  proposedSnapshot: ItemKeluarSnapshot
  submittedBy: string
  submittedAt: string
  rejectionReason: string | null
  revisions: number
}

export interface ItemKeluar {
  id: string
  currentVersionIndex: number
  versions: ItemKeluarVersion[]
  pendingRequest: ItemKeluarRepairRequest | null
  isDeleted: boolean
}

export interface Employee {
  id: string
  name: string
  role: string
}
```

- [ ] **Step 1.2: Create mock employees**

```typescript
// src/library/mock/employees.ts
import type { Employee } from "$lib/types/ItemKeluar"

export const mockEmployees: Employee[] = [
  { id: "emp-01", name: "Budi Santoso", role: "Kasir" },
  { id: "emp-02", name: "Siti Rahayu", role: "Supervisor" },
  { id: "emp-03", name: "Ahmad Fauzi", role: "Kasir" },
  { id: "emp-04", name: "Dewi Kusuma", role: "Manajer" },
  { id: "emp-05", name: "Riko Pratama", role: "Kasir" }
]
```

- [ ] **Step 1.3: Add stock field to items mock**

In `src/library/mock/items.ts`, ensure each product has a `stock` field (number). If the field already exists, skip this step. If not, add it:

```typescript
// Add stock to each product entry, e.g.:
{ id: "SKU-001", name: "Produk A", price: 50000, category: "Roti", stock: 100 },
{ id: "SKU-002", name: "Produk B", price: 75000, category: "Kue", stock: 50 },
{ id: "SKU-003", name: "Produk C", price: 30000, category: "Roti", stock: 200 },
```

- [ ] **Step 1.4: Create stock mock**

```typescript
// src/library/mock/stock.ts
// Mutable stock registry — keyed by productId, values are current stock counts.
// Item Keluar creation decreases these; PT approval reconciles them.

export const mockStock: Record<string, number> = {
  "SKU-001": 100,
  "SKU-002": 50,
  "SKU-003": 200
}

export function decreaseStock(productId: string, qty: number): void {
  if (mockStock[productId] !== undefined) {
    mockStock[productId] = Math.max(0, mockStock[productId] - qty)
  }
}

export function increaseStock(productId: string, qty: number): void {
  if (mockStock[productId] !== undefined) {
    mockStock[productId] += qty
  } else {
    mockStock[productId] = qty
  }
}
```

- [ ] **Step 1.5: Create Item Keluar mock records**

```typescript
// src/library/mock/itemKeluar.ts
import type { ItemKeluar, ItemKeluarSnapshot } from "$lib/types/ItemKeluar"

const baseSnapshot: ItemKeluarSnapshot = {
  id: "IK-001",
  outletId: "outlet-01",
  createdBy: "cashier-01",
  items: [{ productId: "SKU-001", qty: 5, unitPrice: 50000 }],
  totalLoss: 250000,
  kategori: "Bugs",
  keterangan: "Ditemukan serangga di penyimpanan",
  tanggal: "2026-05-01",
  pics: [
    { employeeId: "emp-01", name: "Budi Santoso", amountAssigned: 150000 },
    { employeeId: "emp-02", name: "Siti Rahayu", amountAssigned: 100000 }
  ]
}

export const mockItemKeluar: ItemKeluar[] = [
  // IK-001: 2 versions (original + approved repair), no pending request
  {
    id: "IK-001",
    currentVersionIndex: 2,
    versions: [
      {
        index: 1, type: "original",
        snapshot: { ...baseSnapshot, id: "IK-001" },
        changedFields: [], createdBy: "cashier-01",
        createdAt: "2026-05-01T08:00:00Z", requestId: null
      },
      {
        index: 2, type: "approved",
        snapshot: { ...baseSnapshot, id: "IK-001", keterangan: "Ditemukan serangga di penyimpanan — sudah dikonfirmasi supervisor" },
        changedFields: ["keterangan"], createdBy: "admin-01",
        createdAt: "2026-05-01T10:00:00Z", requestId: "IKR-001"
      }
    ],
    pendingRequest: null,
    isDeleted: false
  },
  // IK-002: 1 version, pending PT request
  {
    id: "IK-002",
    currentVersionIndex: 1,
    versions: [
      {
        index: 1, type: "original",
        snapshot: {
          id: "IK-002", outletId: "outlet-01", createdBy: "cashier-02",
          items: [{ productId: "SKU-002", qty: 3, unitPrice: 75000 }],
          totalLoss: 225000,
          kategori: "Rotten",
          keterangan: "Produk berjamur",
          tanggal: "2026-05-02",
          pics: [{ employeeId: "emp-03", name: "Ahmad Fauzi", amountAssigned: 225000 }]
        },
        changedFields: [], createdBy: "cashier-02",
        createdAt: "2026-05-02T09:00:00Z", requestId: null
      }
    ],
    pendingRequest: {
      id: "IKR-002", itemKeluarId: "IK-002", status: "pending",
      proposedSnapshot: {
        id: "IK-002", outletId: "outlet-01", createdBy: "cashier-02",
        items: [{ productId: "SKU-002", qty: 2, unitPrice: 75000 }],
        totalLoss: 150000,
        kategori: "Rotten",
        keterangan: "Produk berjamur — koreksi jumlah",
        tanggal: "2026-05-02",
        pics: [{ employeeId: "emp-03", name: "Ahmad Fauzi", amountAssigned: 150000 }]
      },
      submittedBy: "cashier-02", submittedAt: "2026-05-02T11:00:00Z",
      rejectionReason: null, revisions: 0
    },
    isDeleted: false
  },
  // IK-003: 1 version, rejected PT request
  {
    id: "IK-003",
    currentVersionIndex: 1,
    versions: [
      {
        index: 1, type: "original",
        snapshot: {
          id: "IK-003", outletId: "outlet-01", createdBy: "cashier-01",
          items: [{ productId: "SKU-003", qty: 10, unitPrice: 30000 }],
          totalLoss: 300000,
          kategori: "Afkir Terdisplay",
          keterangan: "Produk display sudah tidak layak jual",
          tanggal: "2026-05-03",
          pics: [{ employeeId: "emp-04", name: "Dewi Kusuma", amountAssigned: 200000 }]
        },
        changedFields: [], createdBy: "cashier-01",
        createdAt: "2026-05-03T07:00:00Z", requestId: null
      }
    ],
    pendingRequest: {
      id: "IKR-003", itemKeluarId: "IK-003", status: "rejected",
      proposedSnapshot: {
        id: "IK-003", outletId: "outlet-01", createdBy: "cashier-01",
        items: [{ productId: "SKU-003", qty: 8, unitPrice: 30000 }],
        totalLoss: 240000,
        kategori: "Afkir Terdisplay",
        keterangan: "Produk display sudah tidak layak jual — direvisi qty",
        tanggal: "2026-05-03",
        pics: [{ employeeId: "emp-04", name: "Dewi Kusuma", amountAssigned: 200000 }]
      },
      submittedBy: "cashier-01", submittedAt: "2026-05-03T08:00:00Z",
      rejectionReason: "Jumlah tidak sesuai laporan fisik, harap verifikasi ulang", revisions: 0
    },
    isDeleted: false
  }
]

export const mockItemKeluarRequests = mockItemKeluar
  .filter(ik => ik.pendingRequest !== null)
  .map(ik => ik.pendingRequest!)
```

- [ ] **Step 1.6: Commit**

```bash
git add src/library/types/ItemKeluar.ts src/library/mock/employees.ts src/library/mock/stock.ts src/library/mock/itemKeluar.ts src/library/mock/items.ts
git commit -m "feat: add Item Keluar types, constants, employee master, and mock data"
```

---

## Task 2: Item Keluar Creation Form & Page

**Files:**
- Create: `src/library/stores/itemKeluar.ts`
- Create: `src/library/hooks/useItemKeluar.ts` (create function only)
- Create: `src/library/components/outlet/item-keluar/ItemKeluarForm.svelte`
- Create: `src/routes/outlet/item-keluar/+page.svelte`

- [ ] **Step 2.1: Create itemKeluar store**

```typescript
// src/library/stores/itemKeluar.ts
import { writable } from "svelte/store"
import type { ItemKeluar } from "$lib/types/ItemKeluar"

const showCreateForm = writable(false)
const activeRepairTarget = writable<ItemKeluar | null>(null)

export { showCreateForm, activeRepairTarget }
```

- [ ] **Step 2.2: Create useItemKeluar hook (create only)**

```typescript
// src/library/hooks/useItemKeluar.ts
import { get } from "svelte/store"
import { auth } from "$lib/stores/auth"
import { getChangedFields } from "$lib/utils/repairDiff"
import type {
  ItemKeluar, ItemKeluarSnapshot, ItemKeluarRepairRequest,
  ItemKeluarItem, ItemKeluarPIC
} from "$lib/types/ItemKeluar"
import { mockItemKeluar, mockItemKeluarRequests } from "$lib/mock/itemKeluar"
import { decreaseStock, increaseStock } from "$lib/mock/stock"

function computeTotalLoss(items: ItemKeluarItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
}

interface CreatePayload {
  outletId: string
  items: ItemKeluarItem[]
  kategori: ItemKeluarSnapshot["kategori"]
  keterangan: string
  tanggal: string
  pics: ItemKeluarPIC[]
}

async function createItemKeluar(payload: CreatePayload): Promise<{ success: boolean; record?: ItemKeluar; error?: string }> {
  const $auth = get(auth)

  const snapshot: ItemKeluarSnapshot = {
    id: `IK-${Date.now()}`,
    outletId: payload.outletId,
    createdBy: $auth.userId,
    items: payload.items,
    totalLoss: computeTotalLoss(payload.items),
    kategori: payload.kategori,
    keterangan: payload.keterangan,
    tanggal: payload.tanggal,
    pics: payload.pics
  }

  const record: ItemKeluar = {
    id: snapshot.id,
    currentVersionIndex: 1,
    versions: [{
      index: 1,
      type: "original",
      snapshot,
      changedFields: [],
      createdBy: $auth.userId,
      createdAt: new Date().toISOString(),
      requestId: null
    }],
    pendingRequest: null,
    isDeleted: false
  }

  // Decrease stock for each item
  for (const item of payload.items) {
    decreaseStock(item.productId, item.qty)
  }

  mockItemKeluar.unshift(record)
  return { success: true, record }
}

export { createItemKeluar, computeTotalLoss }
```

- [ ] **Step 2.3: Create ItemKeluarForm.svelte**

```svelte
<!-- src/library/components/outlet/item-keluar/ItemKeluarForm.svelte -->
<script lang="ts">
  import { get } from "svelte/store"
  import { auth } from "$lib/stores/auth"
  import { ITEM_KELUAR_CATEGORIES } from "$lib/types/ItemKeluar"
  import type { ItemKeluarItem, ItemKeluarPIC, ItemKeluarKategori } from "$lib/types/ItemKeluar"
  import { mockEmployees } from "$lib/mock/employees"
  import { createItemKeluar, computeTotalLoss } from "$lib/hooks/useItemKeluar"

  export let onClose: () => void
  export let onCreated: () => void

  let items: ItemKeluarItem[] = [{ productId: "", qty: 1, unitPrice: 0 }]
  let kategori: ItemKeluarKategori = "Bugs"
  let keterangan = ""
  let tanggal = new Date().toISOString().slice(0, 10)
  let selectedEmployeeIds: string[] = []
  let picAmounts: Record<string, number> = {}
  let loading = false
  let error = ""

  $: totalLoss = computeTotalLoss(items)
  $: totalAssigned = selectedEmployeeIds.reduce((s, id) => s + (picAmounts[id] ?? 0), 0)
  $: remainder = totalLoss - totalAssigned

  function addItem() {
    items = [...items, { productId: "", qty: 1, unitPrice: 0 }]
  }

  function removeItem(i: number) {
    items = items.filter((_, idx) => idx !== i)
  }

  function toggleEmployee(id: string) {
    if (selectedEmployeeIds.includes(id)) {
      selectedEmployeeIds = selectedEmployeeIds.filter(e => e !== id)
      const { [id]: _, ...rest } = picAmounts
      picAmounts = rest
    } else {
      selectedEmployeeIds = [...selectedEmployeeIds, id]
      picAmounts = { ...picAmounts, [id]: 0 }
    }
  }

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
  }

  async function handleSubmit() {
    if (items.some(i => !i.productId || i.qty <= 0)) {
      error = "Lengkapi semua item (SKU dan jumlah wajib diisi)"
      return
    }
    if (selectedEmployeeIds.length === 0) {
      error = "Pilih minimal satu PIC"
      return
    }

    loading = true
    error = ""

    const pics: ItemKeluarPIC[] = selectedEmployeeIds.map(id => ({
      employeeId: id,
      name: mockEmployees.find(e => e.id === id)?.name ?? id,
      amountAssigned: picAmounts[id] ?? 0
    }))

    const $auth = get(auth)
    const result = await createItemKeluar({
      outletId: $auth.outletId,
      items,
      kategori,
      keterangan,
      tanggal,
      pics
    })

    if (result.success) {
      onCreated()
      onClose()
    } else {
      error = result.error ?? "Terjadi kesalahan"
    }
    loading = false
  }
</script>

<dialog class="modal modal-open">
  <div class="modal-box max-w-2xl">
    <h3 class="font-bold text-lg mb-1">Tambah Item Keluar</h3>
    <p class="text-sm opacity-60 mb-4">Stok akan langsung berkurang setelah disimpan</p>

    {#if error}
      <div class="alert alert-error text-sm mb-4">{error}</div>
    {/if}

    <div class="flex flex-col gap-4">
      <!-- Items -->
      <div>
        <div class="label"><span class="label-text font-semibold">Item yang Dikeluarkan</span></div>
        {#each items as item, i}
          <div class="flex gap-2 mb-2 items-center">
            <input class="input input-bordered input-sm flex-1" bind:value={item.productId} placeholder="SKU produk" />
            <input class="input input-bordered input-sm w-20" type="number" min="1" bind:value={item.qty} placeholder="Qty" />
            <input class="input input-bordered input-sm w-32" type="number" min="0" bind:value={item.unitPrice} placeholder="Harga/unit" />
            {#if items.length > 1}
              <button class="btn btn-ghost btn-xs text-error" on:click={() => removeItem(i)}>✕</button>
            {/if}
          </div>
        {/each}
        <button class="btn btn-ghost btn-xs mt-1" on:click={addItem}>+ Tambah item</button>
        <div class="text-sm mt-2 opacity-70">Total Kerugian: <strong>{formatRupiah(totalLoss)}</strong></div>
      </div>

      <!-- Kategori & Tanggal -->
      <div class="grid grid-cols-2 gap-3">
        <label class="form-control">
          <div class="label"><span class="label-text">Kategori</span></div>
          <select class="select select-bordered" bind:value={kategori}>
            {#each ITEM_KELUAR_CATEGORIES as cat}
              <option value={cat}>{cat}</option>
            {/each}
          </select>
        </label>
        <label class="form-control">
          <div class="label"><span class="label-text">Tanggal</span></div>
          <input type="date" class="input input-bordered" bind:value={tanggal} />
        </label>
      </div>

      <!-- Keterangan -->
      <label class="form-control">
        <div class="label"><span class="label-text">Keterangan</span></div>
        <textarea class="textarea textarea-bordered" rows="2" bind:value={keterangan}></textarea>
      </label>

      <!-- PIC -->
      <div>
        <div class="label"><span class="label-text font-semibold">PIC (Penanggung Jawab)</span></div>
        <div class="flex flex-col gap-2">
          {#each mockEmployees as emp}
            <div class="flex items-center gap-3 p-2 rounded-lg border border-base-300">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                checked={selectedEmployeeIds.includes(emp.id)}
                on:change={() => toggleEmployee(emp.id)}
              />
              <div class="flex-1 text-sm">
                <span class="font-medium">{emp.name}</span>
                <span class="opacity-50 ml-2 text-xs">{emp.role}</span>
              </div>
              {#if selectedEmployeeIds.includes(emp.id)}
                <input
                  class="input input-bordered input-sm w-36"
                  type="number"
                  min="0"
                  bind:value={picAmounts[emp.id]}
                  placeholder="Nominal (IDR)"
                />
              {/if}
            </div>
          {/each}
        </div>
        {#if selectedEmployeeIds.length > 0}
          <div class="text-xs mt-2 opacity-60">
            Terkumpul: {formatRupiah(totalAssigned)} ·
            {#if remainder > 0}
              Sisa {formatRupiah(remainder)} diserap
            {:else if remainder === 0}
              Terpenuhi ✓
            {:else}
              Kelebihan {formatRupiah(Math.abs(remainder))}
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost" disabled={loading} on:click={onClose}>Batal</button>
      <button class="btn btn-primary" disabled={loading} on:click={handleSubmit}>
        {#if loading}<span class="loading loading-spinner loading-sm mr-1"></span>{/if}
        Simpan
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop" on:submit={onClose}><button>close</button></form>
</dialog>
```

- [ ] **Step 2.4: Create main Item Keluar page (list only, no repair yet)**

```svelte
<!-- src/routes/outlet/item-keluar/+page.svelte -->
<script lang="ts">
  import ItemKeluarForm from "$lib/components/outlet/item-keluar/ItemKeluarForm.svelte"
  import { mockItemKeluar } from "$lib/mock/itemKeluar"
  import { ITEM_KELUAR_CATEGORIES } from "$lib/types/ItemKeluar"

  let showForm = false

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString("id-ID", { dateStyle: "medium" })
  }

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
  }

  $: list = mockItemKeluar.filter(ik => !ik.isDeleted)
</script>

<div class="p-6 max-w-5xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">Item Keluar</h1>
    <button class="btn btn-primary" on:click={() => showForm = true}>+ Tambah Item Keluar</button>
  </div>

  {#if list.length === 0}
    <div class="py-16 text-center opacity-40 text-sm">Belum ada item keluar</div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each list as ik}
        {@const current = ik.versions[ik.currentVersionIndex - 1].snapshot}
        <div class="flex items-center gap-4 p-4 rounded-xl border border-base-300 bg-base-100">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold">{ik.id}</span>
              <span class="badge badge-sm badge-outline">{current.kategori}</span>
              {#if ik.pendingRequest?.status === "pending"}
                <span class="badge badge-sm badge-warning">⏳ Menunggu Admin</span>
              {:else if ik.pendingRequest?.status === "rejected"}
                <span class="badge badge-sm badge-error">Ditolak</span>
              {/if}
              <span class="text-xs opacity-50">V{ik.currentVersionIndex}</span>
            </div>
            <div class="text-sm opacity-60 mt-0.5">
              {formatDate(current.tanggal)} ·
              {current.items.length} item ·
              {formatRupiah(current.totalLoss)}
            </div>
            {#if current.keterangan}
              <div class="text-xs opacity-50 mt-0.5 truncate">{current.keterangan}</div>
            {/if}
          </div>
          <div class="flex gap-2 shrink-0">
            <!-- Buttons for version viewer and repair will be added in Tasks 3 & 4 -->
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showForm}
  <ItemKeluarForm
    onClose={() => showForm = false}
    onCreated={() => { showForm = false; list = mockItemKeluar.filter(ik => !ik.isDeleted) }}
  />
{/if}
```

- [ ] **Step 2.5: Verify in dev server**

```bash
npm run dev
```
Navigate to `/outlet/item-keluar`. Click "+ Tambah Item Keluar". Fill: SKU-001, qty 3, unit price 50000. Select Budi Santoso as PIC, assign 150000. Click Simpan. Expected: new record IK-xxx appears in list. Check `mockStock["SKU-001"]` in browser console — should be 97 (100 - 3).

- [ ] **Step 2.6: Commit**

```bash
git add src/library/stores/itemKeluar.ts src/library/hooks/useItemKeluar.ts src/library/components/outlet/item-keluar/ItemKeluarForm.svelte src/routes/outlet/item-keluar/+page.svelte
git commit -m "feat: implement Item Keluar creation form with stock decrease and PIC bill split"
```

---

## Task 3: History Page & Version Viewer

**Files:**
- Create: `src/library/components/outlet/item-keluar/ItemKeluarVersionTimeline.svelte`
- Create: `src/library/components/outlet/item-keluar/ItemKeluarVersionDiff.svelte`
- Modify: `src/routes/outlet/item-keluar/+page.svelte`

- [ ] **Step 3.1: Create ItemKeluarVersionTimeline.svelte**

```svelte
<!-- src/library/components/outlet/item-keluar/ItemKeluarVersionTimeline.svelte -->
<script lang="ts">
  import type { ItemKeluarVersion, ItemKeluarRepairRequest } from "$lib/types/ItemKeluar"

  export let versions: ItemKeluarVersion[]
  export let currentVersionIndex: number
  export let pendingRequest: ItemKeluarRepairRequest | null = null
  export let onSelectVersion: (v: ItemKeluarVersion) => void = () => {}

  const typeColor: Record<ItemKeluarVersion["type"], string> = {
    original: "badge-secondary",
    approved: "badge-error"
  }

  const typeLabel: Record<ItemKeluarVersion["type"], string> = {
    original: "Original",
    approved: "Disetujui"
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })
  }
</script>

<div class="flex flex-col gap-2 p-2">
  <h3 class="text-sm font-semibold opacity-70 uppercase tracking-wide">Riwayat Versi</h3>
  <div class="flex flex-col gap-1">
    {#each versions as version}
      <button
        class="flex items-center gap-3 p-3 rounded-lg border text-left transition-colors
          {version.index === currentVersionIndex ? 'border-primary bg-base-200' : 'border-base-300 hover:bg-base-200'}"
        on:click={() => onSelectVersion(version)}
      >
        <div class="font-bold text-lg w-8 text-center opacity-70">V{version.index}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="badge badge-sm {typeColor[version.type]}">{typeLabel[version.type]}</span>
            {#if version.changedFields.length > 0}
              <span class="text-xs opacity-50 truncate">{version.changedFields.join(", ")}</span>
            {/if}
          </div>
          <div class="text-xs opacity-50 mt-0.5">{formatDate(version.createdAt)} · {version.createdBy}</div>
        </div>
      </button>
    {/each}

    {#if pendingRequest?.status === "pending"}
      <div class="flex items-center gap-3 p-3 rounded-lg border border-warning bg-warning/10">
        <div class="font-bold text-lg w-8 text-center opacity-50">⏳</div>
        <div class="flex-1">
          <span class="badge badge-sm badge-warning">Menunggu Persetujuan</span>
          <div class="text-xs opacity-50 mt-0.5">{formatDate(pendingRequest.submittedAt)} · {pendingRequest.submittedBy}</div>
        </div>
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 3.2: Create ItemKeluarVersionDiff.svelte**

```svelte
<!-- src/library/components/outlet/item-keluar/ItemKeluarVersionDiff.svelte -->
<script lang="ts">
  import type { ItemKeluarVersion, ItemKeluarSnapshot } from "$lib/types/ItemKeluar"

  export let versionA: ItemKeluarVersion
  export let versionB: ItemKeluarVersion

  const FIELD_LABELS: Partial<Record<keyof ItemKeluarSnapshot, string>> = {
    items: "Item / Qty / Harga",
    totalLoss: "Total Kerugian",
    kategori: "Kategori",
    keterangan: "Keterangan",
    tanggal: "Tanggal",
    pics: "PIC & Tanggungan"
  }

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return "-"
    if (typeof val === "number") return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val)
    if (typeof val === "object") return JSON.stringify(val, null, 2)
    return String(val)
  }

  $: changedFields = versionB.changedFields.length > 0
    ? versionB.changedFields
    : (Object.keys(versionB.snapshot) as Array<keyof ItemKeluarSnapshot>).filter(
        k => JSON.stringify(versionA.snapshot[k]) !== JSON.stringify(versionB.snapshot[k])
      )
</script>

<div class="flex flex-col gap-2">
  <div class="grid grid-cols-2 gap-4 text-sm font-semibold text-center opacity-60 mb-1">
    <div>V{versionA.index} — Sebelum</div>
    <div>V{versionB.index} — Sesudah</div>
  </div>

  {#if changedFields.length === 0}
    <p class="text-center opacity-40 text-sm py-6">Tidak ada perubahan</p>
  {:else}
    {#each changedFields as field}
      {@const label = FIELD_LABELS[field as keyof ItemKeluarSnapshot] ?? field}
      {@const oldVal = formatValue(versionA.snapshot[field as keyof ItemKeluarSnapshot])}
      {@const newVal = formatValue(versionB.snapshot[field as keyof ItemKeluarSnapshot])}
      <div class="rounded-lg border border-base-300 overflow-hidden">
        <div class="px-3 py-1.5 bg-base-200 text-xs font-semibold uppercase tracking-wide">{label}</div>
        <div class="grid grid-cols-2">
          <div class="px-3 py-2 text-sm bg-error/10 text-error border-r border-base-300 whitespace-pre-wrap font-mono">{oldVal}</div>
          <div class="px-3 py-2 text-sm bg-success/10 text-success whitespace-pre-wrap font-mono">{newVal}</div>
        </div>
      </div>
    {/each}
  {/if}
</div>
```

- [ ] **Step 3.3: Add version viewer to the main page**

In `src/routes/outlet/item-keluar/+page.svelte`, add to `<script>`:

```svelte
<script lang="ts">
  // Add to existing imports:
  import ItemKeluarVersionTimeline from "$lib/components/outlet/item-keluar/ItemKeluarVersionTimeline.svelte"
  import ItemKeluarVersionDiff from "$lib/components/outlet/item-keluar/ItemKeluarVersionDiff.svelte"
  import type { ItemKeluarVersion, ItemKeluar } from "$lib/types/ItemKeluar"

  let versionTarget: ItemKeluar | null = null
  let selectedVersion: ItemKeluarVersion | null = null

  function openVersionHistory(id: string) {
    versionTarget = mockItemKeluar.find(ik => ik.id === id) ?? null
    selectedVersion = null
  }
</script>
```

In each list row's button area:

```svelte
<button class="btn btn-xs btn-ghost" on:click={() => openVersionHistory(ik.id)}>
  Lihat Versi
</button>
```

Add the modal after the list:

```svelte
{#if versionTarget}
  <dialog class="modal modal-open">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-4">Riwayat Versi — {versionTarget.id}</h3>
      <ItemKeluarVersionTimeline
        versions={versionTarget.versions}
        currentVersionIndex={versionTarget.currentVersionIndex}
        pendingRequest={versionTarget.pendingRequest}
        onSelectVersion={(v) => selectedVersion = v}
      />
      {#if selectedVersion && selectedVersion.index > 1}
        <div class="divider">Perubahan pada V{selectedVersion.index}</div>
        <ItemKeluarVersionDiff
          versionA={versionTarget.versions[selectedVersion.index - 2]}
          versionB={selectedVersion}
        />
      {/if}
      <div class="modal-action">
        <button class="btn" on:click={() => { versionTarget = null; selectedVersion = null }}>Tutup</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" on:submit={() => versionTarget = null}><button>close</button></form>
  </dialog>
{/if}
```

- [ ] **Step 3.4: Verify in dev server**

```bash
npm run dev
```
Click "Lihat Versi" on IK-001. Expected: timeline shows V1 (Original, purple) and V2 (Disetujui, red). Click V2 → diff shows `keterangan` changed.

- [ ] **Step 3.5: Commit**

```bash
git add src/library/components/outlet/item-keluar/ItemKeluarVersionTimeline.svelte src/library/components/outlet/item-keluar/ItemKeluarVersionDiff.svelte src/routes/outlet/item-keluar/+page.svelte
git commit -m "feat: add Item Keluar version history viewer"
```

---

## Task 4: PT — User Request Form & Submit

**Files:**
- Modify: `src/library/hooks/useItemKeluar.ts` (append PT user actions)
- Create: `src/library/components/outlet/item-keluar/ItemKeluarRepairModal.svelte`
- Modify: `src/routes/outlet/item-keluar/+page.svelte`

- [ ] **Step 4.1: Append PT user actions to useItemKeluar.ts**

Add after `createItemKeluar` in `src/library/hooks/useItemKeluar.ts`:

```typescript
async function submitRepairRequest(
  itemKeluarId: string,
  proposedSnapshot: ItemKeluarSnapshot
): Promise<{ success: boolean; request?: ItemKeluarRepairRequest; error?: string }> {
  const $auth = get(auth)
  const record = mockItemKeluar.find(ik => ik.id === itemKeluarId)
  if (!record) return { success: false, error: "Record tidak ditemukan" }
  if (record.pendingRequest?.status === "pending") {
    return { success: false, error: "Sudah ada permintaan perbaikan yang menunggu persetujuan" }
  }

  const request: ItemKeluarRepairRequest = {
    id: `IKR-${Date.now()}`,
    itemKeluarId,
    status: "pending",
    proposedSnapshot: { ...proposedSnapshot, totalLoss: computeTotalLoss(proposedSnapshot.items) },
    submittedBy: $auth.userId,
    submittedAt: new Date().toISOString(),
    rejectionReason: null,
    revisions: 0
  }

  record.pendingRequest = request
  mockItemKeluarRequests.push(request)
  return { success: true, request }
}

async function reviseRepairRequest(
  requestId: string,
  proposedSnapshot: ItemKeluarSnapshot
): Promise<{ success: boolean; error?: string }> {
  const request = mockItemKeluarRequests.find(r => r.id === requestId)
  if (!request) return { success: false, error: "Permintaan tidak ditemukan" }

  request.proposedSnapshot = { ...proposedSnapshot, totalLoss: computeTotalLoss(proposedSnapshot.items) }
  request.status = "pending"
  request.rejectionReason = null
  request.revisions += 1

  const record = mockItemKeluar.find(ik => ik.id === request.itemKeluarId)
  if (record) record.pendingRequest = { ...request }

  return { success: true }
}

async function deleteRepairRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const request = mockItemKeluarRequests.find(r => r.id === requestId)
  if (!request) return { success: false, error: "Permintaan tidak ditemukan" }

  request.status = "deleted"
  const record = mockItemKeluar.find(ik => ik.id === request.itemKeluarId)
  if (record) record.pendingRequest = null

  return { success: true }
}

export { createItemKeluar, computeTotalLoss, submitRepairRequest, reviseRepairRequest, deleteRepairRequest }
```

- [ ] **Step 4.2: Create ItemKeluarRepairModal.svelte**

```svelte
<!-- src/library/components/outlet/item-keluar/ItemKeluarRepairModal.svelte -->
<script lang="ts">
  import { ITEM_KELUAR_CATEGORIES } from "$lib/types/ItemKeluar"
  import type { ItemKeluar, ItemKeluarSnapshot, ItemKeluarItem, ItemKeluarPIC, ItemKeluarKategori } from "$lib/types/ItemKeluar"
  import { mockEmployees } from "$lib/mock/employees"
  import { submitRepairRequest, reviseRepairRequest, deleteRepairRequest, computeTotalLoss } from "$lib/hooks/useItemKeluar"

  export let record: ItemKeluar
  export let onClose: () => void
  export let onUpdated: (updated: ItemKeluar) => void

  const pending = record.pendingRequest
  const isRevision = pending?.status === "rejected"
  const prefill: ItemKeluarSnapshot = isRevision && pending
    ? pending.proposedSnapshot
    : record.versions[record.currentVersionIndex - 1].snapshot

  let items: ItemKeluarItem[] = JSON.parse(JSON.stringify(prefill.items))
  let kategori: ItemKeluarKategori = prefill.kategori
  let keterangan = prefill.keterangan
  let tanggal = prefill.tanggal
  let selectedEmployeeIds: string[] = prefill.pics.map(p => p.employeeId)
  let picAmounts: Record<string, number> = Object.fromEntries(prefill.pics.map(p => [p.employeeId, p.amountAssigned]))

  let loading = false
  let error = ""
  let confirmDelete = false

  $: totalLoss = computeTotalLoss(items)
  $: totalAssigned = selectedEmployeeIds.reduce((s, id) => s + (picAmounts[id] ?? 0), 0)

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
  }

  function addItem() { items = [...items, { productId: "", qty: 1, unitPrice: 0 }] }
  function removeItem(i: number) { items = items.filter((_, idx) => idx !== i) }

  function toggleEmployee(id: string) {
    if (selectedEmployeeIds.includes(id)) {
      selectedEmployeeIds = selectedEmployeeIds.filter(e => e !== id)
      const { [id]: _, ...rest } = picAmounts
      picAmounts = rest
    } else {
      selectedEmployeeIds = [...selectedEmployeeIds, id]
      picAmounts = { ...picAmounts, [id]: 0 }
    }
  }

  function buildProposed(): ItemKeluarSnapshot {
    const pics: ItemKeluarPIC[] = selectedEmployeeIds.map(id => ({
      employeeId: id,
      name: mockEmployees.find(e => e.id === id)?.name ?? id,
      amountAssigned: picAmounts[id] ?? 0
    }))
    return { ...prefill, items, kategori, keterangan, tanggal, pics, totalLoss }
  }

  async function handleSubmit() {
    loading = true
    error = ""
    const proposed = buildProposed()
    const result = isRevision && pending
      ? await reviseRepairRequest(pending.id, proposed)
      : await submitRepairRequest(record.id, proposed)

    if (result.success) {
      onUpdated({ ...record })
      onClose()
    } else {
      error = result.error ?? "Terjadi kesalahan"
    }
    loading = false
  }

  async function handleDeleteRequest() {
    if (!pending) return
    loading = true
    const result = await deleteRepairRequest(pending.id)
    if (result.success) {
      onUpdated({ ...record, pendingRequest: null })
      onClose()
    } else {
      error = result.error ?? "Gagal menghapus permintaan"
    }
    loading = false
    confirmDelete = false
  }
</script>

<dialog class="modal modal-open">
  <div class="modal-box max-w-2xl">
    <h3 class="font-bold text-lg mb-1">Perbaikan Transaksi — Item Keluar</h3>
    <p class="text-sm opacity-60 mb-4">{record.id} · Memerlukan persetujuan admin</p>

    {#if isRevision && pending}
      <div class="alert alert-warning text-sm mb-4">
        <div>
          <p class="font-semibold">Permintaan ditolak — Revisi ke-{pending.revisions + 1}</p>
          <p class="opacity-80 mt-1">{pending.rejectionReason}</p>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="alert alert-error text-sm mb-4">{error}</div>
    {/if}

    <div class="flex flex-col gap-4">
      <!-- Items -->
      <div>
        <div class="label"><span class="label-text font-semibold">Item</span></div>
        {#each items as item, i}
          <div class="flex gap-2 mb-2 items-center">
            <input class="input input-bordered input-sm flex-1" bind:value={item.productId} placeholder="SKU" />
            <input class="input input-bordered input-sm w-20" type="number" min="1" bind:value={item.qty} />
            <input class="input input-bordered input-sm w-32" type="number" min="0" bind:value={item.unitPrice} placeholder="Harga/unit" />
            {#if items.length > 1}
              <button class="btn btn-ghost btn-xs text-error" on:click={() => removeItem(i)}>✕</button>
            {/if}
          </div>
        {/each}
        <button class="btn btn-ghost btn-xs mt-1" on:click={addItem}>+ Tambah item</button>
        <div class="text-sm mt-1 opacity-70">Total Kerugian: <strong>{formatRupiah(totalLoss)}</strong></div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="form-control">
          <div class="label"><span class="label-text">Kategori</span></div>
          <select class="select select-bordered" bind:value={kategori}>
            {#each ITEM_KELUAR_CATEGORIES as cat}
              <option value={cat}>{cat}</option>
            {/each}
          </select>
        </label>
        <label class="form-control">
          <div class="label"><span class="label-text">Tanggal</span></div>
          <input type="date" class="input input-bordered" bind:value={tanggal} />
        </label>
      </div>

      <label class="form-control">
        <div class="label"><span class="label-text">Keterangan</span></div>
        <textarea class="textarea textarea-bordered" rows="2" bind:value={keterangan}></textarea>
      </label>

      <!-- PIC -->
      <div>
        <div class="label"><span class="label-text font-semibold">PIC</span></div>
        {#each mockEmployees as emp}
          <div class="flex items-center gap-3 p-2 rounded-lg border border-base-300 mb-1">
            <input type="checkbox" class="checkbox checkbox-sm"
              checked={selectedEmployeeIds.includes(emp.id)}
              on:change={() => toggleEmployee(emp.id)} />
            <div class="flex-1 text-sm"><span class="font-medium">{emp.name}</span> <span class="opacity-50 text-xs">{emp.role}</span></div>
            {#if selectedEmployeeIds.includes(emp.id)}
              <input class="input input-bordered input-sm w-36" type="number" min="0" bind:value={picAmounts[emp.id]} placeholder="Nominal (IDR)" />
            {/if}
          </div>
        {/each}
        <div class="text-xs mt-1 opacity-60">Terkumpul: {formatRupiah(totalAssigned)}</div>
      </div>
    </div>

    <div class="modal-action flex justify-between">
      <div>
        {#if pending && (pending.status === "pending" || pending.status === "rejected")}
          {#if confirmDelete}
            <span class="text-sm opacity-60 mr-2">Yakin hapus?</span>
            <button class="btn btn-error btn-sm" disabled={loading} on:click={handleDeleteRequest}>Hapus</button>
            <button class="btn btn-ghost btn-sm" on:click={() => confirmDelete = false}>Batal</button>
          {:else}
            <button class="btn btn-ghost btn-sm text-error" on:click={() => confirmDelete = true}>Hapus Permintaan</button>
          {/if}
        {/if}
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost" disabled={loading} on:click={onClose}>Batal</button>
        <button class="btn btn-primary" disabled={loading} on:click={handleSubmit}>
          {#if loading}<span class="loading loading-spinner loading-sm mr-1"></span>{/if}
          {isRevision ? "Kirim Ulang" : "Submit Request"}
        </button>
      </div>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop" on:submit={onClose}><button>close</button></form>
</dialog>
```

- [ ] **Step 4.3: Add PT button and lock badge to main page**

In `src/routes/outlet/item-keluar/+page.svelte`, add to `<script>`:

```svelte
<script lang="ts">
  import ItemKeluarRepairModal from "$lib/components/outlet/item-keluar/ItemKeluarRepairModal.svelte"

  let ptTarget: ItemKeluar | null = null

  function openRepair(id: string) {
    const ik = mockItemKeluar.find(r => r.id === id)
    if (!ik) return
    if (!ik.pendingRequest || ik.pendingRequest.status === "rejected") ptTarget = ik
  }

  function handlePtUpdated(updated: ItemKeluar) {
    const idx = mockItemKeluar.findIndex(r => r.id === updated.id)
    if (idx !== -1) mockItemKeluar[idx] = updated
    ptTarget = null
  }
</script>
```

In each row's button area (replace the empty comment):

```svelte
<button class="btn btn-xs btn-ghost" on:click={() => openVersionHistory(ik.id)}>
  Lihat Versi
</button>
{#if ik.pendingRequest?.status === "pending"}
  <span class="badge badge-warning badge-sm">⏳ Menunggu</span>
{:else}
  <button class="btn btn-xs btn-outline btn-primary" on:click={() => openRepair(ik.id)}>
    {ik.pendingRequest?.status === "rejected" ? "Revisi" : "Perbaikan"}
  </button>
{/if}
```

Add modal:

```svelte
{#if ptTarget}
  <ItemKeluarRepairModal
    record={ptTarget}
    onClose={() => ptTarget = null}
    onUpdated={handlePtUpdated}
  />
{/if}
```

- [ ] **Step 4.4: Verify in dev server**

```bash
npm run dev
```
- IK-003 (rejected): "Revisi" button → modal shows rejection reason banner + "Kirim Ulang" button.
- IK-001 (no pending): "Perbaikan" button → form pre-filled with current snapshot → Submit Request → row shows ⏳.

- [ ] **Step 4.5: Commit**

```bash
git add src/library/hooks/useItemKeluar.ts src/library/components/outlet/item-keluar/ItemKeluarRepairModal.svelte src/routes/outlet/item-keluar/+page.svelte
git commit -m "feat: implement Item Keluar PT user request form and revision flow"
```

---

## Task 5: PT — Admin Queue & Diff View

**Files:**
- Create: `src/library/components/outlet/item-keluar/AdminItemKeluarQueue.svelte`
- Create: `src/library/components/outlet/item-keluar/AdminItemKeluarDiffView.svelte`
- Create: `src/routes/outlet/item-keluar/repair/+page.svelte`

- [ ] **Step 5.1: Create AdminItemKeluarQueue.svelte**

```svelte
<!-- src/library/components/outlet/item-keluar/AdminItemKeluarQueue.svelte -->
<script lang="ts">
  import type { ItemKeluar } from "$lib/types/ItemKeluar"
  import { mockItemKeluar } from "$lib/mock/itemKeluar"

  export let onSelect: (record: ItemKeluar) => void

  $: queue = mockItemKeluar.filter(ik => ik.pendingRequest?.status === "pending" && !ik.isDeleted)

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })
  }

  function formatRupiah(n: number): string {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
  }
</script>

<div class="flex flex-col gap-3">
  <h2 class="text-xl font-bold">Antrian Perbaikan — Item Keluar</h2>

  {#if queue.length === 0}
    <div class="py-16 text-center opacity-40 text-sm">Tidak ada permintaan yang menunggu persetujuan</div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each queue as ik}
        {@const req = ik.pendingRequest!}
        <button
          class="flex items-center gap-4 p-4 rounded-xl border border-base-300 hover:bg-base-200 text-left transition-colors w-full"
          on:click={() => onSelect(ik)}
        >
          <div class="flex-1 min-w-0">
            <div class="font-semibold">{ik.id}</div>
            <div class="text-sm opacity-60 mt-0.5">
              Diajukan: {req.submittedBy} · {formatDate(req.submittedAt)}
            </div>
            <div class="text-sm opacity-60">
              Kerugian diusulkan: {formatRupiah(req.proposedSnapshot.totalLoss)}
            </div>
            {#if req.revisions > 0}
              <div class="text-xs text-warning mt-0.5">Revisi ke-{req.revisions}</div>
            {/if}
          </div>
          <span class="badge badge-warning shrink-0">Menunggu</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 5.2: Create AdminItemKeluarDiffView.svelte**

```svelte
<!-- src/library/components/outlet/item-keluar/AdminItemKeluarDiffView.svelte -->
<script lang="ts">
  import type { ItemKeluar, ItemKeluarVersion } from "$lib/types/ItemKeluar"
  import ItemKeluarVersionDiff from "./ItemKeluarVersionDiff.svelte"

  export let record: ItemKeluar
  export let loading = false
  export let onAction: (
    action: "approve" | "reject" | "delete-request" | "delete-record",
    reason?: string
  ) => void

  const currentVersion = record.versions[record.currentVersionIndex - 1]
  const req = record.pendingRequest!

  const proposedVersion: ItemKeluarVersion = {
    index: record.currentVersionIndex + 1,
    type: "approved",
    snapshot: req.proposedSnapshot,
    changedFields: [],
    createdBy: req.submittedBy,
    createdAt: req.submittedAt,
    requestId: req.id
  }

  let showRejectInput = false
  let rejectionReason = ""
  let confirmDeleteRecord = false

  function submitReject() {
    if (!rejectionReason.trim()) return
    onAction("reject", rejectionReason.trim())
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h3 class="font-bold text-lg">{record.id}</h3>
      <p class="text-sm opacity-60">
        Diajukan: {req.submittedBy} ·
        V{record.currentVersionIndex} → V{record.currentVersionIndex + 1}
        {#if req.revisions > 0}· Revisi ke-{req.revisions}{/if}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-success btn-sm" disabled={loading} on:click={() => onAction("approve")}>✓ Setujui</button>
      <button class="btn btn-warning btn-sm" disabled={loading} on:click={() => showRejectInput = !showRejectInput}>✗ Tolak</button>
      <button class="btn btn-ghost btn-sm" disabled={loading} on:click={() => onAction("delete-request")}>Hapus Permintaan</button>
      {#if confirmDeleteRecord}
        <button class="btn btn-error btn-sm" disabled={loading} on:click={() => onAction("delete-record")}>Yakin Hapus Record?</button>
        <button class="btn btn-ghost btn-sm" on:click={() => confirmDeleteRecord = false}>Batal</button>
      {:else}
        <button class="btn btn-ghost btn-sm text-error" disabled={loading} on:click={() => confirmDeleteRecord = true}>Hapus Record</button>
      {/if}
    </div>
  </div>

  {#if showRejectInput}
    <div class="flex gap-2 items-end">
      <label class="form-control flex-1">
        <div class="label"><span class="label-text">Alasan penolakan</span></div>
        <input class="input input-bordered" bind:value={rejectionReason} placeholder="Jelaskan alasan penolakan..." />
      </label>
      <button class="btn btn-error" disabled={!rejectionReason.trim() || loading} on:click={submitReject}>
        Kirim Penolakan
      </button>
    </div>
  {/if}

  <div class="divider">Perbandingan Perubahan</div>
  <ItemKeluarVersionDiff versionA={currentVersion} versionB={proposedVersion} />
</div>
```

- [ ] **Step 5.3: Create admin repair page (queue only, no actions yet)**

```svelte
<!-- src/routes/outlet/item-keluar/repair/+page.svelte -->
<script lang="ts">
  import AdminItemKeluarQueue from "$lib/components/outlet/item-keluar/AdminItemKeluarQueue.svelte"
  import AdminItemKeluarDiffView from "$lib/components/outlet/item-keluar/AdminItemKeluarDiffView.svelte"
  import type { ItemKeluar } from "$lib/types/ItemKeluar"

  let selected: ItemKeluar | null = null
</script>

<div class="p-6 max-w-5xl mx-auto">
  {#if selected}
    <button class="btn btn-ghost btn-sm mb-4" on:click={() => selected = null}>← Kembali</button>
    <AdminItemKeluarDiffView record={selected} onAction={() => {}} />
  {:else}
    <AdminItemKeluarQueue onSelect={(r) => selected = r} />
  {/if}
</div>
```

- [ ] **Step 5.4: Verify in dev server**

```bash
npm run dev
```
Navigate to `/outlet/item-keluar/repair`. IK-002 appears in queue. Click it → diff view shows qty 3 → 2, keterangan change, totalLoss 225000 → 150000. Action buttons visible but not wired yet.

- [ ] **Step 5.5: Commit**

```bash
git add src/library/components/outlet/item-keluar/AdminItemKeluarQueue.svelte src/library/components/outlet/item-keluar/AdminItemKeluarDiffView.svelte src/routes/outlet/item-keluar/repair/+page.svelte
git commit -m "feat: add Item Keluar admin repair queue and diff view"
```

---

## Task 6: PT — Approve (with Stock Reconciliation) / Reject / Delete

**Files:**
- Modify: `src/library/hooks/useItemKeluar.ts` (append admin actions + update export)
- Modify: `src/routes/outlet/item-keluar/repair/+page.svelte` (wire up onAction)

- [ ] **Step 6.1: Append admin actions to useItemKeluar.ts**

Add after `deleteRepairRequest` in `src/library/hooks/useItemKeluar.ts`:

```typescript
async function approveRepairRequest(itemKeluarId: string): Promise<{ success: boolean; error?: string }> {
  const $auth = get(auth)
  const record = mockItemKeluar.find(ik => ik.id === itemKeluarId)
  if (!record || !record.pendingRequest) return { success: false, error: "Permintaan tidak ditemukan" }

  const req = record.pendingRequest
  const currentSnapshot = record.versions[record.currentVersionIndex - 1].snapshot

  // Stock reconciliation: apply delta between current and proposed items
  const currentItemMap = new Map(currentSnapshot.items.map(i => [i.productId, i.qty]))
  const proposedItemMap = new Map(req.proposedSnapshot.items.map(i => [i.productId, i.qty]))

  // Products in current but not in proposed — restore full qty
  for (const [productId, qty] of currentItemMap) {
    if (!proposedItemMap.has(productId)) increaseStock(productId, qty)
  }
  // Products in proposed — apply delta vs current
  for (const [productId, proposedQty] of proposedItemMap) {
    const currentQty = currentItemMap.get(productId) ?? 0
    const delta = proposedQty - currentQty
    if (delta > 0) decreaseStock(productId, delta)      // more disposed
    else if (delta < 0) increaseStock(productId, -delta) // fewer disposed — restore
    // delta === 0: no stock change needed
  }

  const newVersion = {
    index: record.currentVersionIndex + 1,
    type: "approved" as const,
    snapshot: req.proposedSnapshot,
    changedFields: getChangedFields(currentSnapshot as any, req.proposedSnapshot as any),
    createdBy: $auth.userId,
    createdAt: new Date().toISOString(),
    requestId: req.id
  }

  record.versions.push(newVersion)
  record.currentVersionIndex += 1
  record.pendingRequest = null
  req.status = "deleted"

  return { success: true }
}

async function rejectRepairRequest(
  itemKeluarId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const record = mockItemKeluar.find(ik => ik.id === itemKeluarId)
  if (!record || !record.pendingRequest) return { success: false, error: "Permintaan tidak ditemukan" }

  record.pendingRequest.status = "rejected"
  record.pendingRequest.rejectionReason = reason

  const req = mockItemKeluarRequests.find(r => r.id === record.pendingRequest!.id)
  if (req) { req.status = "rejected"; req.rejectionReason = reason }

  return { success: true }
}

async function deleteRecord(itemKeluarId: string): Promise<{ success: boolean; error?: string }> {
  const record = mockItemKeluar.find(ik => ik.id === itemKeluarId)
  if (!record) return { success: false, error: "Record tidak ditemukan" }

  // Restore stock from the current (latest) version
  const currentSnapshot = record.versions[record.currentVersionIndex - 1].snapshot
  for (const item of currentSnapshot.items) {
    increaseStock(item.productId, item.qty)
  }

  record.isDeleted = true
  record.pendingRequest = null

  return { success: true }
}
```

Replace the export line at the bottom of `useItemKeluar.ts`:

```typescript
export {
  createItemKeluar, computeTotalLoss,
  submitRepairRequest, reviseRepairRequest, deleteRepairRequest,
  approveRepairRequest, rejectRepairRequest, deleteRecord
}
```

- [ ] **Step 6.2: Wire admin actions into repair page**

Replace `src/routes/outlet/item-keluar/repair/+page.svelte` with:

```svelte
<script lang="ts">
  import AdminItemKeluarQueue from "$lib/components/outlet/item-keluar/AdminItemKeluarQueue.svelte"
  import AdminItemKeluarDiffView from "$lib/components/outlet/item-keluar/AdminItemKeluarDiffView.svelte"
  import type { ItemKeluar } from "$lib/types/ItemKeluar"
  import { approveRepairRequest, rejectRepairRequest, deleteRepairRequest, deleteRecord } from "$lib/hooks/useItemKeluar"

  let selected: ItemKeluar | null = null
  let actionLoading = false
  let actionError = ""

  async function handleAction(
    action: "approve" | "reject" | "delete-request" | "delete-record",
    reason?: string
  ) {
    if (!selected) return
    actionLoading = true
    actionError = ""

    let result: { success: boolean; error?: string }

    if (action === "approve") {
      result = await approveRepairRequest(selected.id)
    } else if (action === "reject" && reason) {
      result = await rejectRepairRequest(selected.id, reason)
    } else if (action === "delete-request" && selected.pendingRequest) {
      result = await deleteRepairRequest(selected.pendingRequest.id)
    } else if (action === "delete-record") {
      result = await deleteRecord(selected.id)
    } else {
      result = { success: false, error: "Aksi tidak dikenal" }
    }

    if (result.success) {
      selected = null
    } else {
      actionError = result.error ?? "Terjadi kesalahan"
    }
    actionLoading = false
  }
</script>

<div class="p-6 max-w-5xl mx-auto">
  {#if actionError}
    <div class="alert alert-error text-sm mb-4">{actionError}</div>
  {/if}
  {#if selected}
    <button class="btn btn-ghost btn-sm mb-4" on:click={() => { selected = null; actionError = "" }}>← Kembali</button>
    <AdminItemKeluarDiffView record={selected} loading={actionLoading} onAction={handleAction} />
  {:else}
    <AdminItemKeluarQueue onSelect={(r) => { selected = r; actionError = "" }} />
  {/if}
</div>
```

- [ ] **Step 6.3: Verify approve with stock reconciliation**

```bash
npm run dev
```
1. Check `mockStock["SKU-002"]` in console — should be 47 (50 - 3 from IK-002 creation).
2. Go to `/outlet/item-keluar/repair` → select IK-002 (proposed qty 2, down from 3).
3. Click "Setujui" → queue empties.
4. Check `mockStock["SKU-002"]` — should be 48 (47 + 1 restored, since qty went from 3 to 2).
5. Open IK-002 version history → V2 of type "approved" with `items` in changedFields.

- [ ] **Step 6.4: Verify delete record restores stock**

1. Go to `/outlet/item-keluar/repair` → submit a PT on IK-001 first.
2. Select IK-001 in queue → click "Hapus Record".
3. IK-001 disappears from main list.
4. Check `mockStock["SKU-001"]` — should have increased by 5 (IK-001's current qty restored).

- [ ] **Step 6.5: Commit**

```bash
git add src/library/hooks/useItemKeluar.ts src/routes/outlet/item-keluar/repair/+page.svelte
git commit -m "feat: implement admin approve (with stock reconciliation), reject, and delete for Item Keluar PT"
```

---

## Task 7: End-to-End Rejection & Revision Verification

No new files. Validates the complete loop using code from Tasks 4 and 6.

- [ ] **Step 7.1: Full rejection → revision → approval loop**

1. Main page → IK-001 → "Perbaikan" → change qty SKU-001 from 5 to 8, adjust PIC amount → Submit Request → row shows ⏳.
2. `/outlet/item-keluar/repair` → select IK-001 → "Tolak" → "Jumlah tidak sesuai bukti fisik" → Kirim Penolakan.
3. Main page → IK-001 → "Revisi" → yellow banner shows reason → form pre-filled with qty 8 → change to 6 → Kirim Ulang.
4. Admin queue → IK-001 shows "Revisi ke-1" → Setujui.
5. Version history → IK-001 shows V3 (approved) with `items` in changedFields.
6. Check stock: SKU-001 should reflect delta of approved qty 6 vs original qty 5 → 1 additional unit decreased.

- [ ] **Step 7.2: Delete request flow**

1. Submit PT on IK-001 from main page.
2. Main page → IK-001 → row shows ⏳ → form shows "Hapus Permintaan" button → click → confirm.
3. Row returns to "Perbaikan" button, no ⏳.
4. Stock unchanged (no version committed).

- [ ] **Step 7.3: Final commit**

```bash
git add src/library/components/outlet/item-keluar/ItemKeluarRepairModal.svelte
git commit -m "feat: complete Item Keluar — rejection, revision, and stock reconciliation verified"
```
