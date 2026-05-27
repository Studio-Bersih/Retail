# Pergerakan Stok Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the unified Pergerakan Stok (Stock In + Stock Out) feature under `/outlet/pergerakan-stok/`, following the Akuntansi pattern with a discriminated union snapshot and full-swap form modal.

**Architecture:** A `PergerakanStok` record wraps a versioned `StokMasukSnapshot | StokKeluarSnapshot`. One main page with chip filter (Semua / Item Masuk / Item Keluar) shows both types. `StokFormModal` has a type toggle that fully resets and swaps its fields. PT queue at `/outlet/pergerakan-stok/repair` (admin only). All data lives in client-side mocks.

**Tech Stack:** SvelteKit 1.x + Svelte 4, TypeScript 5, TailwindCSS 3, DaisyUI, client-side mocks (no backend required)

---

## File Map

### Created by this plan
```
src/library/types/PergerakanStok.ts
src/library/mock/suppliers.ts
src/library/mock/employees.ts
src/library/mock/master-items.ts
src/library/mock/stock-movements.ts
src/library/mock/outlet-config.ts
src/library/mock/pergerakan-stok.ts
src/library/components/pergerakan-stok/StokFormModal.svelte
src/routes/outlet/pergerakan-stok/+page.svelte
src/routes/outlet/pergerakan-stok/repair/+page.svelte
```

### Created for project bootstrap (Task 0)
```
svelte.config.js
vite.config.ts
tailwind.config.js
postcss.config.js
tsconfig.json
src/app.html
src/app.css
src/routes/+layout.svelte
src/routes/+page.svelte          (placeholder login page)
src/library/stores/auth.ts
```

---

## Task 0: Bootstrap SvelteKit project

**Files:** Project root configuration files + `src/` skeleton

- [ ] **Step 1: Scaffold SvelteKit skeleton**

```bash
npm create svelte@4 . -- --no-install
```

Select: **Skeleton project**, **TypeScript**, no other extras. This creates `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, and `src/routes/+page.svelte`.

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install daisyui@3 svelte-sonner
npm install -D tailwindcss@3 postcss autoprefixer prettier prettier-plugin-svelte
```

- [ ] **Step 3: Init Tailwind**

```bash
npx tailwindcss init -p
```

- [ ] **Step 4: Configure `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{html,js,svelte,ts}'],
    theme: { extend: {} },
    plugins: [require('daisyui')],
    daisyui: {
        themes: ['dark'],
        darkTheme: 'dark',
    },
}
```

- [ ] **Step 5: Configure `svelte.config.js`** — add `$lib` alias pointing to `src/library`

```js
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter(),
        alias: { '$lib': 'src/library' },
    },
}

export default config
```

- [ ] **Step 6: Create `src/app.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create `src/routes/+layout.svelte`**

```svelte
<script lang="ts">
    import { Toaster } from 'svelte-sonner'
    import '../app.css'
</script>

<Toaster richColors position="top-right" />
<slot />
```

- [ ] **Step 8: Create auth store stub `src/library/stores/auth.ts`**

```typescript
import { writable } from 'svelte/store'

interface AuthState {
    userId: string
    userName: string
    role: 'cashier' | 'manager' | 'admin'
    outletId: string
}

const defaultAuth: AuthState = {
    userId: 'user-2',
    userName: 'Sari Dewi',
    role: 'manager',
    outletId: 'outlet-1',
}

export const auth = writable<AuthState>(defaultAuth)
```

- [ ] **Step 9: Verify dev server starts**

```bash
npm run dev
```

Expected: server at `http://localhost:5173` with no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: bootstrap SvelteKit project with Tailwind and DaisyUI"
```

---

## Task 1: TypeScript types

**Files:**
- Create: `src/library/types/PergerakanStok.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/PergerakanStok.ts

export const STOK_KELUAR_CATEGORIES = ['Bugs', 'Afkir Terdisplay', 'Rotten'] as const
export type StokKeluarKategori = typeof STOK_KELUAR_CATEGORIES[number]

export interface StokMasukSnapshot {
    type: 'masuk'
    id: string
    outletId: string
    createdBy: string
    tanggal: string
    supplierId: string
    items: Array<{
        itemId: string
        qty: number
        hargaBeli: number
    }>
    totalCost: number
    keterangan: string
}

export interface StokKeluarSnapshot {
    type: 'keluar'
    id: string
    outletId: string
    createdBy: string
    tanggal: string
    kategori: StokKeluarKategori
    items: Array<{
        itemId: string
        qty: number
        unitPrice: number
    }>
    totalLoss: number
    pics: Array<{
        employeeId: string
        name: string
        amountAssigned: number
    }>
    keterangan: string
}

export type StokSnapshot = StokMasukSnapshot | StokKeluarSnapshot

export interface StokVersion {
    index: number
    type: 'original' | 'approved'
    snapshot: StokSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface StokRepairRequest {
    id: string
    stokId: string
    status: 'pending' | 'rejected' | 'deleted'
    proposedSnapshot: StokSnapshot
    catatan: string | null
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export interface PergerakanStok {
    id: string
    currentVersionIndex: number
    versions: StokVersion[]
    pendingRequest: StokRepairRequest | null
    isDeleted: boolean
}

export interface Supplier {
    id: string
    name: string
}

export interface Employee {
    id: string
    name: string
    role: string
}

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
    priceLevel1: number
    priceLevel2: number
    priceLevel3: number
    priceLevel4: number
    priceLevel5: number
    itemType: 'raw_material' | 'finished_good' | 'both'
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

export type StockMovementSource =
    | 'item_masuk'
    | 'item_masuk_pt'
    | 'item_keluar'
    | 'item_keluar_pt'
    | 'sale'
    | 'sale_void'
    | 'transfer_out'
    | 'transfer_in'
    | 'transfer_cancelled'
    | 'konversi_consume'
    | 'konversi_produce'
    | 'produksi_consume'
    | 'produksi_produce'
    | 'produksi_pt'
    | 'initial_stock'
    | 'stock_opname'

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

export interface OutletConfig {
    outletId: string
    showHargaBeli: boolean
}

export interface CreateStokMasukPayload {
    supplierId: string
    tanggal: string
    items: Array<{ itemId: string; qty: number; hargaBeli: number }>
    keterangan: string
}

export interface CreateStokKeluarPayload {
    kategori: StokKeluarKategori
    tanggal: string
    items: Array<{ itemId: string; qty: number; unitPrice: number }>
    pics: Array<{ employeeId: string; name: string; amountAssigned: number }>
    keterangan: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/library/types/PergerakanStok.ts
git commit -m "feat: add PergerakanStok TypeScript types"
```

---

## Task 2: Shared mock stubs

**Files:**
- Create: `src/library/mock/suppliers.ts`
- Create: `src/library/mock/employees.ts`
- Create: `src/library/mock/outlet-config.ts`
- Create: `src/library/mock/stock-movements.ts`
- Create: `src/library/mock/master-items.ts`

- [ ] **Step 1: Create `src/library/mock/suppliers.ts`**

```typescript
import type { Supplier } from '$lib/types/PergerakanStok'

export const mockSuppliers: Supplier[] = [
    { id: 'sup-1', name: 'Supplier Utama' },
    { id: 'sup-2', name: 'PT Bahan Baku Nusantara' },
    { id: 'sup-3', name: 'CV Toko Grosir Jaya' },
    { id: 'sup-4', name: 'UD Sumber Makmur' },
]

export function getSupplierById(id: string): Supplier | undefined {
    return mockSuppliers.find(s => s.id === id)
}
```

- [ ] **Step 2: Create `src/library/mock/employees.ts`**

```typescript
import type { Employee } from '$lib/types/PergerakanStok'

export const mockEmployees: Employee[] = [
    { id: 'emp-1', name: 'Budi Santoso', role: 'Kasir' },
    { id: 'emp-2', name: 'Siti Rahayu', role: 'Kasir' },
    { id: 'emp-3', name: 'Dian Pratiwi', role: 'Supervisor' },
    { id: 'emp-4', name: 'Rudi Hermawan', role: 'Staf Gudang' },
]

export function getEmployeeById(id: string): Employee | undefined {
    return mockEmployees.find(e => e.id === id)
}
```

- [ ] **Step 3: Create `src/library/mock/outlet-config.ts`**

```typescript
import type { OutletConfig } from '$lib/types/PergerakanStok'

const mockOutletConfigs: OutletConfig[] = [
    { outletId: 'outlet-1', showHargaBeli: true },
]

export function getOutletConfig(outletId: string): OutletConfig {
    return mockOutletConfigs.find(c => c.outletId === outletId) ?? { outletId, showHargaBeli: false }
}
```

- [ ] **Step 4: Create `src/library/mock/stock-movements.ts`**

```typescript
import type { StockMovement, StockMovementSource } from '$lib/types/PergerakanStok'
import { mockOutletStock } from '$lib/mock/master-items'

let movementIdCounter = 100

const mockStockMovements: StockMovement[] = [
    // IM-00001 movements
    { id: 'mv-001', itemId: 'item-1', outletId: 'outlet-1', delta: 50,  source: 'item_masuk', sourceId: 'IM-00001', stockBefore: 0,   stockAfter: 50,  executedBy: 'user-2', executedAt: '2026-05-20T09:00:00.000Z', note: null },
    { id: 'mv-002', itemId: 'item-2', outletId: 'outlet-1', delta: 20,  source: 'item_masuk', sourceId: 'IM-00001', stockBefore: 0,   stockAfter: 20,  executedBy: 'user-2', executedAt: '2026-05-20T09:00:00.000Z', note: null },
    { id: 'mv-003', itemId: 'item-3', outletId: 'outlet-1', delta: 100, source: 'item_masuk', sourceId: 'IM-00001', stockBefore: 0,   stockAfter: 100, executedBy: 'user-2', executedAt: '2026-05-20T09:00:00.000Z', note: null },
    // IK-00001 movements
    { id: 'mv-004', itemId: 'item-4', outletId: 'outlet-1', delta: -5,  source: 'item_keluar', sourceId: 'IK-00001', stockBefore: 45,  stockAfter: 40,  executedBy: 'user-3', executedAt: '2026-05-22T10:30:00.000Z', note: null },
    { id: 'mv-005', itemId: 'item-2', outletId: 'outlet-1', delta: -3,  source: 'item_keluar', sourceId: 'IK-00001', stockBefore: 20,  stockAfter: 17,  executedBy: 'user-3', executedAt: '2026-05-22T10:30:00.000Z', note: null },
    // IM-00002 original
    { id: 'mv-006', itemId: 'item-5', outletId: 'outlet-1', delta: 30,  source: 'item_masuk', sourceId: 'IM-00002', stockBefore: 0,   stockAfter: 30,  executedBy: 'user-2', executedAt: '2026-05-24T11:00:00.000Z', note: null },
    // IM-00002 PT approved correction (qty was 30, approved as 25, delta = -5)
    { id: 'mv-007', itemId: 'item-5', outletId: 'outlet-1', delta: -5,  source: 'item_masuk_pt', sourceId: 'pt-im-002', stockBefore: 30,  stockAfter: 25,  executedBy: 'user-1', executedAt: '2026-05-25T09:30:00.000Z', note: null },
    // IK-00002 movements
    { id: 'mv-008', itemId: 'item-1', outletId: 'outlet-1', delta: -2,  source: 'item_keluar', sourceId: 'IK-00002', stockBefore: 50,  stockAfter: 48,  executedBy: 'user-3', executedAt: '2026-05-25T14:00:00.000Z', note: null },
]

export function getStockMovements(): StockMovement[] {
    return mockStockMovements
}

export function logStockMovement(payload: {
    itemId: string
    outletId: string
    delta: number
    source: StockMovementSource
    sourceId: string
    executedBy: string
    note?: string
}): StockMovement {
    const record = mockOutletStock.find(s => s.itemId === payload.itemId && s.outletId === payload.outletId)
    const stockBefore = record ? record.stock : 0
    const stockAfter = stockBefore + payload.delta
    if (record) record.stock = stockAfter

    const movement: StockMovement = {
        id: `mv-${++movementIdCounter}`,
        itemId: payload.itemId,
        outletId: payload.outletId,
        delta: payload.delta,
        source: payload.source,
        sourceId: payload.sourceId,
        stockBefore,
        stockAfter,
        executedBy: payload.executedBy,
        executedAt: new Date().toISOString(),
        note: payload.note ?? null,
    }
    mockStockMovements.push(movement)
    return movement
}
```

- [ ] **Step 5: Create `src/library/mock/master-items.ts`**

```typescript
import type { MasterItem, OutletStock } from '$lib/types/PergerakanStok'

const mockMasterItems: MasterItem[] = [
    { id: 'item-1', sku: 'SKU-001', barcode: null,              name: 'Tepung Terigu',   description: null, imageUrl: null, category: 'Bahan Baku',  satuan: 'kg',  weight: null, height: null, priceLevel1: 8000,  priceLevel2: 0, priceLevel3: 0, priceLevel4: 0, priceLevel5: 0, itemType: 'raw_material',   isActive: true, availableRegions: ['Jakarta'], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedBy: null, updatedAt: null },
    { id: 'item-2', sku: 'SKU-002', barcode: '8991001234567',   name: 'Gula Pasir',      description: null, imageUrl: null, category: 'Bahan Baku',  satuan: 'kg',  weight: null, height: null, priceLevel1: 12000, priceLevel2: 0, priceLevel3: 0, priceLevel4: 0, priceLevel5: 0, itemType: 'raw_material',   isActive: true, availableRegions: ['Jakarta'], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedBy: null, updatedAt: null },
    { id: 'item-3', sku: 'SKU-003', barcode: null,              name: 'Plastik Kemasan', description: null, imageUrl: null, category: 'Kemasan',     satuan: 'pcs', weight: null, height: null, priceLevel1: 3500,  priceLevel2: 0, priceLevel3: 0, priceLevel4: 0, priceLevel5: 0, itemType: 'raw_material',   isActive: true, availableRegions: ['Jakarta'], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedBy: null, updatedAt: null },
    { id: 'item-4', sku: 'SKU-004', barcode: null,              name: 'Kue Brownies',    description: null, imageUrl: null, category: 'Produk Jadi', satuan: 'pcs', weight: null, height: null, priceLevel1: 25000, priceLevel2: 0, priceLevel3: 0, priceLevel4: 0, priceLevel5: 0, itemType: 'finished_good',  isActive: true, availableRegions: ['Jakarta'], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedBy: null, updatedAt: null },
    { id: 'item-5', sku: 'SKU-005', barcode: '8991009876543',   name: 'Yakult Pcs',      description: null, imageUrl: null, category: 'Minuman',     satuan: 'pcs', weight: null, height: null, priceLevel1: 5000,  priceLevel2: 0, priceLevel3: 0, priceLevel4: 0, priceLevel5: 0, itemType: 'both',           isActive: true, availableRegions: ['Jakarta'], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedBy: null, updatedAt: null },
    { id: 'item-6', sku: 'SKU-006', barcode: null,              name: 'Mentega',         description: null, imageUrl: null, category: 'Bahan Baku',  satuan: 'kg',  weight: null, height: null, priceLevel1: 20000, priceLevel2: 0, priceLevel3: 0, priceLevel4: 0, priceLevel5: 0, itemType: 'raw_material',   isActive: true, availableRegions: ['Jakarta'], createdBy: 'user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedBy: null, updatedAt: null },
]

// Pre-seeded to match seed StockMovements in stock-movements.ts
export const mockOutletStock: OutletStock[] = [
    { itemId: 'item-1', outletId: 'outlet-1', region: 'Jakarta', stock: 48,  preAdjDelta: 0 },
    { itemId: 'item-2', outletId: 'outlet-1', region: 'Jakarta', stock: 17,  preAdjDelta: 0 },
    { itemId: 'item-3', outletId: 'outlet-1', region: 'Jakarta', stock: 100, preAdjDelta: 0 },
    { itemId: 'item-4', outletId: 'outlet-1', region: 'Jakarta', stock: 40,  preAdjDelta: 0 },
    { itemId: 'item-5', outletId: 'outlet-1', region: 'Jakarta', stock: 25,  preAdjDelta: 0 },
    { itemId: 'item-6', outletId: 'outlet-1', region: 'Jakarta', stock: 0,   preAdjDelta: 0 },
]

export function getMasterItems(outletId: string): MasterItem[] {
    const outletRegion = 'Jakarta'
    return mockMasterItems.filter(item => item.isActive && item.availableRegions.includes(outletRegion))
}

export function getMasterItemById(id: string): MasterItem | undefined {
    return mockMasterItems.find(item => item.id === id)
}

export function getDisplayStock(itemId: string, outletId: string): number {
    const record = mockOutletStock.find(s => s.itemId === itemId && s.outletId === outletId)
    if (!record) return 0
    return record.stock + record.preAdjDelta
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/library/mock/
git commit -m "feat: add shared mock stubs (suppliers, employees, master-items, stock-movements, outlet-config)"
```

---

## Task 3: Mock store — seed data + read queries

**Files:**
- Create: `src/library/mock/pergerakan-stok.ts`

- [ ] **Step 1: Create the file with seed data and read functions**

```typescript
// src/library/mock/pergerakan-stok.ts
import type { PergerakanStok, StokRepairRequest } from '$lib/types/PergerakanStok'

let masukCounter = 2
let keluarCounter = 2
let ptCounter = 10

function nextMasukId(): string { return `IM-${String(++masukCounter).padStart(5, '0')}` }
function nextKeluarId(): string { return `IK-${String(++keluarCounter).padStart(5, '0')}` }
function nextPtId(): string { return `pt-${String(++ptCounter).padStart(4, '0')}` }
function nextSnapId(): string { return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

const mockPergerakanStok: PergerakanStok[] = [
    {
        id: 'IM-00001',
        currentVersionIndex: 1,
        versions: [{
            index: 1,
            type: 'original',
            snapshot: {
                type: 'masuk',
                id: 'snap-im-001-v1',
                outletId: 'outlet-1',
                createdBy: 'user-2',
                tanggal: '2026-05-20',
                supplierId: 'sup-1',
                items: [
                    { itemId: 'item-1', qty: 50,  hargaBeli: 8000  },
                    { itemId: 'item-2', qty: 20,  hargaBeli: 12000 },
                    { itemId: 'item-3', qty: 100, hargaBeli: 3500  },
                ],
                totalCost: 50 * 8000 + 20 * 12000 + 100 * 3500,
                keterangan: 'Stok awal bulan',
            },
            changedFields: [],
            createdBy: 'user-2',
            createdAt: '2026-05-20T09:00:00.000Z',
            requestId: null,
        }],
        pendingRequest: null,
        isDeleted: false,
    },
    {
        id: 'IK-00001',
        currentVersionIndex: 1,
        versions: [{
            index: 1,
            type: 'original',
            snapshot: {
                type: 'keluar',
                id: 'snap-ik-001-v1',
                outletId: 'outlet-1',
                createdBy: 'user-3',
                tanggal: '2026-05-22',
                kategori: 'Rotten',
                items: [
                    { itemId: 'item-4', qty: 5, unitPrice: 25000 },
                    { itemId: 'item-2', qty: 3, unitPrice: 15000 },
                ],
                totalLoss: 5 * 25000 + 3 * 15000,
                pics: [{ employeeId: 'emp-1', name: 'Budi Santoso', amountAssigned: 75000 }],
                keterangan: 'Kue rusak karena freeze breakdown',
            },
            changedFields: [],
            createdBy: 'user-3',
            createdAt: '2026-05-22T10:30:00.000Z',
            requestId: null,
        }],
        pendingRequest: {
            id: 'pt-ik-001',
            stokId: 'IK-00001',
            status: 'pending',
            proposedSnapshot: {
                type: 'keluar',
                id: 'snap-ik-001-v1',
                outletId: 'outlet-1',
                createdBy: 'user-3',
                tanggal: '2026-05-22',
                kategori: 'Rotten',
                items: [
                    { itemId: 'item-4', qty: 3, unitPrice: 25000 },
                    { itemId: 'item-2', qty: 3, unitPrice: 15000 },
                ],
                totalLoss: 3 * 25000 + 3 * 15000,
                pics: [{ employeeId: 'emp-1', name: 'Budi Santoso', amountAssigned: 75000 }],
                keterangan: 'Kue rusak karena freeze breakdown (revised: 3 bukan 5)',
            },
            catatan: 'Ternyata yang rusak hanya 3 bukan 5',
            submittedBy: 'user-3',
            submittedAt: '2026-05-23T08:00:00.000Z',
            rejectionReason: null,
            revisions: 0,
        },
        isDeleted: false,
    },
    {
        id: 'IM-00002',
        currentVersionIndex: 2,
        versions: [
            {
                index: 1,
                type: 'original',
                snapshot: {
                    type: 'masuk',
                    id: 'snap-im-002-v1',
                    outletId: 'outlet-1',
                    createdBy: 'user-2',
                    tanggal: '2026-05-24',
                    supplierId: 'sup-2',
                    items: [{ itemId: 'item-5', qty: 30, hargaBeli: 5000 }],
                    totalCost: 30 * 5000,
                    keterangan: 'Restok mingguan',
                },
                changedFields: [],
                createdBy: 'user-2',
                createdAt: '2026-05-24T11:00:00.000Z',
                requestId: null,
            },
            {
                index: 2,
                type: 'approved',
                snapshot: {
                    type: 'masuk',
                    id: 'snap-im-002-v2',
                    outletId: 'outlet-1',
                    createdBy: 'user-2',
                    tanggal: '2026-05-24',
                    supplierId: 'sup-2',
                    items: [{ itemId: 'item-5', qty: 25, hargaBeli: 5000 }],
                    totalCost: 25 * 5000,
                    keterangan: 'Restok mingguan',
                },
                changedFields: ['items', 'totalCost'],
                createdBy: 'user-1',
                createdAt: '2026-05-25T09:30:00.000Z',
                requestId: 'pt-im-002',
            },
        ],
        pendingRequest: null,
        isDeleted: false,
    },
    {
        id: 'IK-00002',
        currentVersionIndex: 1,
        versions: [{
            index: 1,
            type: 'original',
            snapshot: {
                type: 'keluar',
                id: 'snap-ik-002-v1',
                outletId: 'outlet-1',
                createdBy: 'user-3',
                tanggal: '2026-05-25',
                kategori: 'Bugs',
                items: [{ itemId: 'item-1', qty: 2, unitPrice: 8000 }],
                totalLoss: 2 * 8000,
                pics: [],
                keterangan: 'Kemasan rusak saat pengiriman',
            },
            changedFields: [],
            createdBy: 'user-3',
            createdAt: '2026-05-25T14:00:00.000Z',
            requestId: null,
        }],
        pendingRequest: {
            id: 'pt-ik-002',
            stokId: 'IK-00002',
            status: 'rejected',
            proposedSnapshot: {
                type: 'keluar',
                id: 'snap-ik-002-v1',
                outletId: 'outlet-1',
                createdBy: 'user-3',
                tanggal: '2026-05-25',
                kategori: 'Afkir Terdisplay',
                items: [{ itemId: 'item-1', qty: 2, unitPrice: 8000 }],
                totalLoss: 2 * 8000,
                pics: [],
                keterangan: 'Kemasan rusak saat pengiriman',
            },
            catatan: 'Ingin ubah kategori ke Afkir Terdisplay',
            submittedBy: 'user-3',
            submittedAt: '2026-05-26T09:00:00.000Z',
            rejectionReason: 'Kategori sudah benar, jangan diubah.',
            revisions: 0,
        },
        isDeleted: false,
    },
]

export function getPergerakanStokList(outletId: string): PergerakanStok[] {
    return mockPergerakanStok.filter(r => {
        const snap = r.versions[0].snapshot
        return snap.outletId === outletId && !r.isDeleted
    })
}

export function getStokById(id: string): PergerakanStok | undefined {
    return mockPergerakanStok.find(r => r.id === id && !r.isDeleted)
}

export function getPTRequests(status?: StokRepairRequest['status']): StokRepairRequest[] {
    return mockPergerakanStok
        .filter(r => !r.isDeleted && r.pendingRequest !== null)
        .map(r => r.pendingRequest!)
        .filter(pt => !status || pt.status === status)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/library/mock/pergerakan-stok.ts
git commit -m "feat: add PergerakanStok mock seed data and read queries"
```

---

## Task 4: Mock store — mutations + PT functions

**Files:**
- Modify: `src/library/mock/pergerakan-stok.ts` (append to end of file)

- [ ] **Step 1: Add helper + stock delta functions**

Append to `src/library/mock/pergerakan-stok.ts`:

```typescript
import { logStockMovement } from '$lib/mock/stock-movements'
import type { CreateStokMasukPayload, CreateStokKeluarPayload, StokMasukSnapshot, StokKeluarSnapshot, StokSnapshot } from '$lib/types/PergerakanStok'

function getChangedFields(original: StokSnapshot, proposed: StokSnapshot): string[] {
    const fields: string[] = []
    if (original.tanggal !== proposed.tanggal) fields.push('tanggal')
    if (original.keterangan !== proposed.keterangan) fields.push('keterangan')
    if (original.type === 'masuk' && proposed.type === 'masuk') {
        if (original.supplierId !== proposed.supplierId) fields.push('supplierId')
        if (JSON.stringify(original.items) !== JSON.stringify(proposed.items)) fields.push('items')
        if (original.totalCost !== proposed.totalCost) fields.push('totalCost')
    }
    if (original.type === 'keluar' && proposed.type === 'keluar') {
        if (original.kategori !== proposed.kategori) fields.push('kategori')
        if (JSON.stringify(original.items) !== JSON.stringify(proposed.items)) fields.push('items')
        if (JSON.stringify(original.pics) !== JSON.stringify(proposed.pics)) fields.push('pics')
        if (original.totalLoss !== proposed.totalLoss) fields.push('totalLoss')
    }
    return fields
}

function applyMasukDelta(
    original: StokMasukSnapshot,
    proposed: StokMasukSnapshot,
    outletId: string,
    sourceId: string,
    executedBy: string
): void {
    const origMap = new Map(original.items.map(i => [i.itemId, i.qty]))
    const propMap = new Map(proposed.items.map(i => [i.itemId, i.qty]))
    const allIds = new Set([...origMap.keys(), ...propMap.keys()])
    for (const itemId of allIds) {
        const origQty = origMap.get(itemId) ?? 0
        const propQty = propMap.get(itemId) ?? 0
        const delta = propQty - origQty
        if (delta !== 0) logStockMovement({ itemId, outletId, delta, source: 'item_masuk_pt', sourceId, executedBy })
    }
}

function applyKeluarDelta(
    original: StokKeluarSnapshot,
    proposed: StokKeluarSnapshot,
    outletId: string,
    sourceId: string,
    executedBy: string
): void {
    const origMap = new Map(original.items.map(i => [i.itemId, i.qty]))
    const propMap = new Map(proposed.items.map(i => [i.itemId, i.qty]))
    const allIds = new Set([...origMap.keys(), ...propMap.keys()])
    for (const itemId of allIds) {
        const origQty = origMap.get(itemId) ?? 0
        const propQty = propMap.get(itemId) ?? 0
        // keluar increases stock when qty decreases, and vice versa
        const delta = -(propQty - origQty)
        if (delta !== 0) logStockMovement({ itemId, outletId, delta, source: 'item_keluar_pt', sourceId, executedBy })
    }
}
```

- [ ] **Step 2: Add create functions**

Append to `src/library/mock/pergerakan-stok.ts`:

```typescript
export function createStokMasuk(payload: CreateStokMasukPayload, userId: string, outletId: string): PergerakanStok {
    const id = nextMasukId()
    const snapId = nextSnapId()
    const totalCost = payload.items.reduce((sum, i) => sum + i.qty * i.hargaBeli, 0)
    const snapshot: StokMasukSnapshot = { type: 'masuk', id: snapId, outletId, createdBy: userId, tanggal: payload.tanggal, supplierId: payload.supplierId, items: payload.items, totalCost, keterangan: payload.keterangan }
    const record: PergerakanStok = { id, currentVersionIndex: 1, versions: [{ index: 1, type: 'original', snapshot, changedFields: [], createdBy: userId, createdAt: new Date().toISOString(), requestId: null }], pendingRequest: null, isDeleted: false }
    for (const item of payload.items) {
        logStockMovement({ itemId: item.itemId, outletId, delta: item.qty, source: 'item_masuk', sourceId: id, executedBy: userId })
    }
    mockPergerakanStok.push(record)
    return record
}

export function createStokKeluar(payload: CreateStokKeluarPayload, userId: string, outletId: string): PergerakanStok {
    const id = nextKeluarId()
    const snapId = nextSnapId()
    const totalLoss = payload.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
    const snapshot: StokKeluarSnapshot = { type: 'keluar', id: snapId, outletId, createdBy: userId, tanggal: payload.tanggal, kategori: payload.kategori, items: payload.items, totalLoss, pics: payload.pics, keterangan: payload.keterangan }
    const record: PergerakanStok = { id, currentVersionIndex: 1, versions: [{ index: 1, type: 'original', snapshot, changedFields: [], createdBy: userId, createdAt: new Date().toISOString(), requestId: null }], pendingRequest: null, isDeleted: false }
    for (const item of payload.items) {
        logStockMovement({ itemId: item.itemId, outletId, delta: -item.qty, source: 'item_keluar', sourceId: id, executedBy: userId })
    }
    mockPergerakanStok.push(record)
    return record
}
```

- [ ] **Step 3: Add PT user functions**

Append to `src/library/mock/pergerakan-stok.ts`:

```typescript
export function submitRepairRequest(stokId: string, proposedSnapshot: StokSnapshot, catatan: string | null, userId: string): StokRepairRequest {
    const record = mockPergerakanStok.find(r => r.id === stokId)
    if (!record) throw new Error(`Record ${stokId} not found`)
    if (record.pendingRequest?.status === 'pending') throw new Error('PT request already pending')
    const pt: StokRepairRequest = { id: nextPtId(), stokId, status: 'pending', proposedSnapshot, catatan, submittedBy: userId, submittedAt: new Date().toISOString(), rejectionReason: null, revisions: 0 }
    record.pendingRequest = pt
    return pt
}

export function reviseRepairRequest(stokId: string, proposedSnapshot: StokSnapshot, catatan: string | null, userId: string): StokRepairRequest {
    const record = mockPergerakanStok.find(r => r.id === stokId)
    if (!record || !record.pendingRequest) throw new Error(`No PT request for ${stokId}`)
    record.pendingRequest.proposedSnapshot = proposedSnapshot
    record.pendingRequest.catatan = catatan
    record.pendingRequest.status = 'pending'
    record.pendingRequest.rejectionReason = null
    record.pendingRequest.revisions += 1
    record.pendingRequest.submittedAt = new Date().toISOString()
    return record.pendingRequest
}

export function deleteRepairRequest(stokId: string): void {
    const record = mockPergerakanStok.find(r => r.id === stokId)
    if (!record) throw new Error(`Record ${stokId} not found`)
    record.pendingRequest = null
}
```

- [ ] **Step 4: Add PT admin functions**

Append to `src/library/mock/pergerakan-stok.ts`:

```typescript
export function approveRepairRequest(stokId: string, adminId: string): void {
    const record = mockPergerakanStok.find(r => r.id === stokId)
    if (!record?.pendingRequest) throw new Error(`No pending PT for ${stokId}`)
    const pt = record.pendingRequest
    const currentSnap = record.versions[record.currentVersionIndex - 1].snapshot
    const outletId = currentSnap.outletId

    if (currentSnap.type === 'masuk' && pt.proposedSnapshot.type === 'masuk') {
        applyMasukDelta(currentSnap, pt.proposedSnapshot, outletId, pt.id, adminId)
    } else if (currentSnap.type === 'keluar' && pt.proposedSnapshot.type === 'keluar') {
        applyKeluarDelta(currentSnap, pt.proposedSnapshot, outletId, pt.id, adminId)
    }

    const newVersion = {
        index: record.currentVersionIndex + 1,
        type: 'approved' as const,
        snapshot: pt.proposedSnapshot,
        changedFields: getChangedFields(currentSnap, pt.proposedSnapshot),
        createdBy: adminId,
        createdAt: new Date().toISOString(),
        requestId: pt.id,
    }
    record.versions.push(newVersion)
    record.currentVersionIndex += 1
    record.pendingRequest = null
}

export function rejectRepairRequest(stokId: string, reason: string, adminId: string): void {
    const record = mockPergerakanStok.find(r => r.id === stokId)
    if (!record?.pendingRequest) throw new Error(`No pending PT for ${stokId}`)
    record.pendingRequest.status = 'rejected'
    record.pendingRequest.rejectionReason = reason
}

export function dismissRepairRequest(stokId: string, adminId: string): void {
    const record = mockPergerakanStok.find(r => r.id === stokId)
    if (!record?.pendingRequest) throw new Error(`No pending PT for ${stokId}`)
    record.pendingRequest = null
}

export function deleteRecord(stokId: string, adminId: string): void {
    const record = mockPergerakanStok.find(r => r.id === stokId)
    if (!record) throw new Error(`Record ${stokId} not found`)
    const originalSnap = record.versions[0].snapshot
    const outletId = originalSnap.outletId

    if (originalSnap.type === 'masuk') {
        for (const item of originalSnap.items) {
            logStockMovement({ itemId: item.itemId, outletId, delta: -item.qty, source: 'item_masuk_pt', sourceId: stokId, executedBy: adminId, note: 'Record deleted by admin' })
        }
    } else {
        for (const item of originalSnap.items) {
            logStockMovement({ itemId: item.itemId, outletId, delta: item.qty, source: 'item_keluar_pt', sourceId: stokId, executedBy: adminId, note: 'Record deleted by admin' })
        }
    }
    record.isDeleted = true
    record.pendingRequest = null
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/library/mock/pergerakan-stok.ts
git commit -m "feat: add PergerakanStok mock mutations and PT functions"
```

---

## Task 5: StokFormModal component

**Files:**
- Create: `src/library/components/pergerakan-stok/StokFormModal.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/library/components/pergerakan-stok/StokFormModal.svelte -->
<script lang="ts">
    import { createEventDispatcher } from 'svelte'
    import { get } from 'svelte/store'
    import { toast } from 'svelte-sonner'
    import { auth } from '$lib/stores/auth'
    import { mockSuppliers } from '$lib/mock/suppliers'
    import { mockEmployees } from '$lib/mock/employees'
    import { getMasterItems, getMasterItemById, getDisplayStock } from '$lib/mock/master-items'
    import { getOutletConfig } from '$lib/mock/outlet-config'
    import { createStokMasuk, createStokKeluar, submitRepairRequest, reviseRepairRequest } from '$lib/mock/pergerakan-stok'
    import { STOK_KELUAR_CATEGORIES } from '$lib/types/PergerakanStok'
    import type { PergerakanStok, StokMasukSnapshot, StokKeluarSnapshot } from '$lib/types/PergerakanStok'

    export let open = false
    export let record: PergerakanStok | null = null  // null = create mode; non-null = PT mode

    const dispatch = createEventDispatcher<{ saved: void; close: void }>()

    const session = get(auth)
    const outletConfig = getOutletConfig(session.outletId)
    const allItems = getMasterItems(session.outletId)

    // Determine initial type from existing record; locked in PT mode
    $: isPtMode = record !== null
    $: isRevision = record?.pendingRequest?.status === 'rejected'
    $: lockedType = record ? record.versions[0].snapshot.type : null

    // Form state
    let stokType: 'masuk' | 'keluar' = lockedType ?? 'masuk'
    let tanggal = new Date().toISOString().slice(0, 10)
    let keterangan = ''
    let catatan = ''

    // Masuk fields
    let supplierId = ''
    let masukItems: Array<{ itemId: string; qty: number; hargaBeli: number }> = [{ itemId: '', qty: 1, hargaBeli: 0 }]

    // Keluar fields
    let kategori: 'Bugs' | 'Afkir Terdisplay' | 'Rotten' = 'Bugs'
    let keluarItems: Array<{ itemId: string; qty: number; unitPrice: number }> = [{ itemId: '', qty: 1, unitPrice: 0 }]
    let pics: Array<{ employeeId: string; name: string; amountAssigned: number }> = []

    // Pre-fill from PT proposal if revising
    $: if (open && record) {
        const src = isRevision ? record.pendingRequest!.proposedSnapshot : record.versions[record.currentVersionIndex - 1].snapshot
        tanggal = src.tanggal
        keterangan = src.keterangan
        catatan = isRevision ? (record.pendingRequest!.catatan ?? '') : ''
        if (src.type === 'masuk') {
            supplierId = src.supplierId
            masukItems = src.items.map(i => ({ ...i }))
        } else {
            kategori = src.kategori
            keluarItems = src.items.map(i => ({ ...i }))
            pics = src.pics.map(p => ({ ...p }))
        }
    }

    function resetForm() {
        stokType = lockedType ?? 'masuk'
        tanggal = new Date().toISOString().slice(0, 10)
        keterangan = ''
        catatan = ''
        supplierId = ''
        masukItems = [{ itemId: '', qty: 1, hargaBeli: 0 }]
        kategori = 'Bugs'
        keluarItems = [{ itemId: '', qty: 1, unitPrice: 0 }]
        pics = []
    }

    function switchType(type: 'masuk' | 'keluar') {
        if (isPtMode) return
        stokType = type
        masukItems = [{ itemId: '', qty: 1, hargaBeli: 0 }]
        keluarItems = [{ itemId: '', qty: 1, unitPrice: 0 }]
        pics = []
        supplierId = ''
        kategori = 'Bugs'
    }

    function addMasukRow() { masukItems = [...masukItems, { itemId: '', qty: 1, hargaBeli: 0 }] }
    function removeMasukRow(i: number) { if (masukItems.length > 1) masukItems = masukItems.filter((_, idx) => idx !== i) }
    function addKeluarRow() { keluarItems = [...keluarItems, { itemId: '', qty: 1, unitPrice: 0 }] }
    function removeKeluarRow(i: number) { if (keluarItems.length > 1) keluarItems = keluarItems.filter((_, idx) => idx !== i) }
    function addPic() { pics = [...pics, { employeeId: '', name: '', amountAssigned: 0 }] }
    function removePic(i: number) { pics = pics.filter((_, idx) => idx !== i) }

    function onPicSelect(i: number, employeeId: string) {
        const emp = mockEmployees.find(e => e.id === employeeId)
        if (emp) { pics[i].employeeId = emp.id; pics[i].name = emp.name }
    }

    $: masukTotal = masukItems.reduce((s, i) => s + i.qty * i.hargaBeli, 0)
    $: keluarTotal = keluarItems.reduce((s, i) => s + i.qty * i.unitPrice, 0)

    function validate(): string | null {
        if (stokType === 'masuk') {
            if (!supplierId) return 'Pilih supplier'
            for (const item of masukItems) {
                if (!item.itemId) return 'Pilih item untuk semua baris'
                if (item.qty <= 0) return 'Qty harus lebih dari 0'
            }
            const ids = masukItems.map(i => i.itemId)
            if (new Set(ids).size !== ids.length) return 'Item tidak boleh duplikat'
        } else {
            for (const item of keluarItems) {
                if (!item.itemId) return 'Pilih item untuk semua baris'
                if (item.qty <= 0) return 'Qty harus lebih dari 0'
            }
            const ids = keluarItems.map(i => i.itemId)
            if (new Set(ids).size !== ids.length) return 'Item tidak boleh duplikat'
            for (const pic of pics) {
                if (!pic.employeeId) return 'Pilih nama PIC untuk semua baris'
                if (pic.amountAssigned <= 0) return 'Jumlah PIC harus lebih dari 0'
            }
        }
        if (!tanggal) return 'Pilih tanggal'
        return null
    }

    function buildMasukSnapshot(): StokMasukSnapshot {
        return { type: 'masuk', id: '', outletId: session.outletId, createdBy: session.userId, tanggal, supplierId, items: masukItems, totalCost: masukTotal, keterangan }
    }

    function buildKeluarSnapshot(): StokKeluarSnapshot {
        return { type: 'keluar', id: '', outletId: session.outletId, createdBy: session.userId, tanggal, kategori, items: keluarItems, totalLoss: keluarTotal, pics, keterangan }
    }

    function handleSave() {
        const err = validate()
        if (err) { toast.error(err); return }

        try {
            if (isPtMode && record) {
                const proposed = stokType === 'masuk' ? buildMasukSnapshot() : buildKeluarSnapshot()
                if (isRevision) {
                    reviseRepairRequest(record.id, proposed, catatan || null, session.userId)
                    toast.success('Permintaan PT dikirim ulang')
                } else {
                    submitRepairRequest(record.id, proposed, catatan || null, session.userId)
                    toast.success('Permintaan PT dikirim')
                }
            } else {
                if (stokType === 'masuk') {
                    createStokMasuk({ supplierId, tanggal, items: masukItems, keterangan }, session.userId, session.outletId)
                    toast.success('Item Masuk berhasil disimpan')
                } else {
                    createStokKeluar({ kategori, tanggal, items: keluarItems, pics, keterangan }, session.userId, session.outletId)
                    toast.success('Item Keluar berhasil disimpan')
                }
            }
            resetForm()
            dispatch('saved')
        } catch (e: any) {
            toast.error(e.message ?? 'Terjadi kesalahan')
        }
    }

    function handleClose() {
        resetForm()
        dispatch('close')
    }

    function formatRupiah(n: number): string {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
    }
</script>

{#if open}
<div class="modal modal-open">
    <div class="modal-box max-w-2xl">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-lg">{isPtMode ? (isRevision ? 'Revisi Permintaan PT' : 'Ajukan Perbaikan Transaksi') : 'Tambah Pergerakan Stok'}</h3>
            <button class="btn btn-sm btn-ghost btn-circle" on:click={handleClose}>✕</button>
        </div>

        <!-- Revision warning banner -->
        {#if isRevision && record?.pendingRequest?.rejectionReason}
            <div class="alert alert-warning mb-4 text-sm">
                <span>Permintaan sebelumnya ditolak: <strong>{record.pendingRequest.rejectionReason}</strong></span>
            </div>
        {/if}

        <!-- Type toggle (locked in PT mode) -->
        <div class="tabs tabs-boxed mb-4 w-fit">
            <button class="tab {stokType === 'masuk' ? 'tab-active' : ''}" class:opacity-50={isPtMode && stokType !== 'masuk'} on:click={() => switchType('masuk')}>📥 Item Masuk</button>
            <button class="tab {stokType === 'keluar' ? 'tab-active' : ''}" class:opacity-50={isPtMode && stokType !== 'keluar'} on:click={() => switchType('keluar')}>📤 Item Keluar</button>
        </div>

        <!-- Shared fields -->
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="form-control">
                <label class="label label-text text-xs">Tanggal</label>
                <input type="date" class="input input-bordered input-sm" bind:value={tanggal} />
            </div>
            {#if stokType === 'masuk'}
                <div class="form-control">
                    <label class="label label-text text-xs">Supplier</label>
                    <select class="select select-bordered select-sm" bind:value={supplierId}>
                        <option value="">Pilih supplier...</option>
                        {#each mockSuppliers as s}
                            <option value={s.id}>{s.name}</option>
                        {/each}
                    </select>
                </div>
            {:else}
                <div class="form-control">
                    <label class="label label-text text-xs">Kategori</label>
                    <select class="select select-bordered select-sm" bind:value={kategori}>
                        {#each STOK_KELUAR_CATEGORIES as cat}
                            <option value={cat}>{cat}</option>
                        {/each}
                    </select>
                </div>
            {/if}
        </div>

        <!-- MASUK: item rows -->
        {#if stokType === 'masuk'}
            <p class="text-xs font-semibold uppercase text-base-content/50 mb-2">Daftar Item</p>
            <div class="grid text-xs font-semibold text-base-content/50 mb-1" style="grid-template-columns: 2fr 1fr {outletConfig.showHargaBeli ? '1fr' : ''} 1fr 24px; gap:6px">
                <span>Item</span><span>Qty</span>{#if outletConfig.showHargaBeli}<span>Harga Beli</span>{/if}<span>Stok</span><span></span>
            </div>
            {#each masukItems as row, i}
                <div class="grid items-center mb-1" style="grid-template-columns: 2fr 1fr {outletConfig.showHargaBeli ? '1fr' : ''} 1fr 24px; gap:6px">
                    <select class="select select-bordered select-xs" bind:value={row.itemId}>
                        <option value="">Pilih item...</option>
                        {#each allItems as item}
                            <option value={item.id}>{item.name} ({item.satuan})</option>
                        {/each}
                    </select>
                    <input type="number" min="0.01" step="0.01" class="input input-bordered input-xs" bind:value={row.qty} />
                    {#if outletConfig.showHargaBeli}
                        <input type="number" min="0" class="input input-bordered input-xs" bind:value={row.hargaBeli} />
                    {/if}
                    <span class="text-xs text-base-content/50">{row.itemId ? getDisplayStock(row.itemId, session.outletId) : '—'}</span>
                    <button class="btn btn-xs btn-ghost text-error" on:click={() => removeMasukRow(i)} disabled={masukItems.length === 1}>✕</button>
                </div>
            {/each}
            <button class="btn btn-xs btn-outline btn-dashed w-full mt-1 mb-3" on:click={addMasukRow}>+ Tambah Item</button>
            {#if outletConfig.showHargaBeli}
                <p class="text-sm text-right mb-4">Total: <strong>{formatRupiah(masukTotal)}</strong></p>
            {/if}
        {/if}

        <!-- KELUAR: item rows -->
        {#if stokType === 'keluar'}
            <p class="text-xs font-semibold uppercase text-base-content/50 mb-2">Daftar Item</p>
            <div class="grid text-xs font-semibold text-base-content/50 mb-1" style="grid-template-columns: 2fr 1fr 1fr 1fr 24px; gap:6px">
                <span>Item</span><span>Qty</span><span>Harga Satuan</span><span>Stok</span><span></span>
            </div>
            {#each keluarItems as row, i}
                <div class="grid items-center mb-1" style="grid-template-columns: 2fr 1fr 1fr 1fr 24px; gap:6px">
                    <select class="select select-bordered select-xs" bind:value={row.itemId}>
                        <option value="">Pilih item...</option>
                        {#each allItems as item}
                            <option value={item.id}>{item.name} ({item.satuan})</option>
                        {/each}
                    </select>
                    <input type="number" min="0.01" step="0.01" class="input input-bordered input-xs" bind:value={row.qty} />
                    <input type="number" min="0" class="input input-bordered input-xs" bind:value={row.unitPrice} />
                    <span class="text-xs text-base-content/50">{row.itemId ? getDisplayStock(row.itemId, session.outletId) : '—'}</span>
                    <button class="btn btn-xs btn-ghost text-error" on:click={() => removeKeluarRow(i)} disabled={keluarItems.length === 1}>✕</button>
                </div>
            {/each}
            <button class="btn btn-xs btn-outline btn-dashed w-full mt-1 mb-1" on:click={addKeluarRow}>+ Tambah Item</button>
            <p class="text-sm text-right mb-4">Total Kerugian: <strong>{formatRupiah(keluarTotal)}</strong></p>

            <!-- PIC section -->
            <p class="text-xs font-semibold uppercase text-base-content/50 mb-2">PIC & Tanggung Jawab <span class="normal-case font-normal">(opsional)</span></p>
            {#each pics as pic, i}
                <div class="grid items-center mb-1" style="grid-template-columns: 2fr 1fr 24px; gap:6px">
                    <select class="select select-bordered select-xs" bind:value={pic.employeeId} on:change={e => onPicSelect(i, (e.target as HTMLSelectElement).value)}>
                        <option value="">Pilih PIC...</option>
                        {#each mockEmployees as emp}
                            <option value={emp.id}>{emp.name}</option>
                        {/each}
                    </select>
                    <input type="number" min="0" class="input input-bordered input-xs" placeholder="Jumlah (Rp)" bind:value={pic.amountAssigned} />
                    <button class="btn btn-xs btn-ghost text-error" on:click={() => removePic(i)}>✕</button>
                </div>
            {/each}
            <button class="btn btn-xs btn-outline btn-dashed w-full mt-1 mb-3" on:click={addPic}>+ Tambah PIC</button>
        {/if}

        <!-- Keterangan -->
        <div class="form-control mb-3">
            <label class="label label-text text-xs">Keterangan</label>
            <input type="text" class="input input-bordered input-sm" placeholder="Catatan opsional..." bind:value={keterangan} />
        </div>

        <!-- Catatan PT (PT mode only) -->
        {#if isPtMode}
            <div class="form-control mb-3">
                <label class="label label-text text-xs">Catatan Permintaan PT</label>
                <input type="text" class="input input-bordered input-sm" placeholder="Alasan perbaikan (opsional)..." bind:value={catatan} />
            </div>
        {/if}

        <!-- Footer -->
        <div class="modal-action">
            <button class="btn btn-ghost btn-sm" on:click={handleClose}>Batal</button>
            <button class="btn btn-primary btn-sm" on:click={handleSave}>
                {#if isPtMode}{isRevision ? 'Kirim Ulang' : 'Kirim Permintaan PT'}{:else}Simpan{/if}
            </button>
        </div>
    </div>
    <div class="modal-backdrop" on:click={handleClose}></div>
</div>
{/if}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/library/components/pergerakan-stok/StokFormModal.svelte
git commit -m "feat: add StokFormModal with masuk/keluar full-swap toggle"
```

---

## Task 6: Main outlet page

**Files:**
- Create: `src/routes/outlet/pergerakan-stok/+page.svelte`

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/outlet/pergerakan-stok/+page.svelte -->
<script lang="ts">
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import { getPergerakanStokList, getStokById } from '$lib/mock/pergerakan-stok'
    import { getMasterItemById, getSupplierById } from '$lib/mock/master-items'
    import { getSupplierById as suppById } from '$lib/mock/suppliers'
    import StokFormModal from '$lib/components/pergerakan-stok/StokFormModal.svelte'
    import type { PergerakanStok } from '$lib/types/PergerakanStok'

    const session = get(auth)

    let records: PergerakanStok[] = getPergerakanStokList(session.outletId)
    let modalOpen = false
    let selectedRecord: PergerakanStok | null = null
    let ptRecord: PergerakanStok | null = null
    let versionRecord: PergerakanStok | null = null

    // Search, filter, pagination
    let search = ''
    let typeFilter: 'all' | 'masuk' | 'keluar' = 'all'
    let perPage: 10 | 25 | 50 | 100 = 25
    let currentPage = 1

    $: filtered = records.filter(r => {
        const snap = r.versions[r.currentVersionIndex - 1].snapshot
        const typeMatch = typeFilter === 'all' || snap.type === typeFilter
        if (!typeMatch) return false
        const q = search.toLowerCase()
        if (!q) return true
        if (r.id.toLowerCase().includes(q)) return true
        if (snap.keterangan.toLowerCase().includes(q)) return true
        if (snap.type === 'masuk') {
            const sup = suppById(snap.supplierId)
            if (sup?.name.toLowerCase().includes(q)) return true
        } else {
            if (snap.kategori.toLowerCase().includes(q)) return true
        }
        return false
    })
    $: totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    $: paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
    $: if (search !== undefined || perPage || typeFilter) currentPage = 1
    $: pageButtons = (() => {
        let start = Math.max(1, currentPage - 2)
        let end = Math.min(totalPages, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()

    function refresh() { records = getPergerakanStokList(session.outletId) }

    function openCreate() { selectedRecord = null; ptRecord = null; modalOpen = true }
    function openPt(r: PergerakanStok) { ptRecord = r; selectedRecord = null; modalOpen = true }
    function openVersion(r: PergerakanStok) { versionRecord = r }
    function closeModal() { modalOpen = false }
    function onSaved() { modalOpen = false; refresh() }

    function getRowInfo(r: PergerakanStok): string {
        const snap = r.versions[r.currentVersionIndex - 1].snapshot
        if (snap.type === 'masuk') return suppById(snap.supplierId)?.name ?? snap.supplierId
        return snap.kategori
    }

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    }
</script>

<div class="p-6">
    <h1 class="text-xl font-bold mb-4">Pergerakan Stok</h1>

    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-4 mb-3">
        <input type="text" class="input input-bordered input-sm w-72" placeholder="Cari ref ID, supplier, kategori..." bind:value={search} />
        <div class="flex items-center gap-2">
            <select class="select select-bordered select-sm" bind:value={perPage}>
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
            </select>
            <button class="btn btn-primary btn-sm" on:click={openCreate}>+ Tambah</button>
        </div>
    </div>

    <!-- Chip filter -->
    <div class="flex gap-2 mb-4">
        {#each [['all','Semua'],['masuk','Item Masuk'],['keluar','Item Keluar']] as [val, label]}
            <button
                class="badge badge-lg cursor-pointer border transition-colors {typeFilter === val ? (val === 'masuk' ? 'badge-info' : val === 'keluar' ? 'badge-error' : 'badge-primary') : 'badge-outline opacity-60'}"
                on:click={() => { typeFilter = val as typeof typeFilter }}
            >{label}</button>
        {/each}
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
        <table class="table table-sm w-full">
            <thead>
                <tr>
                    <th>Tanggal</th>
                    <th>Tipe</th>
                    <th>Ref ID</th>
                    <th>Item</th>
                    <th>Info</th>
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#each paginated as r}
                    {@const snap = r.versions[r.currentVersionIndex - 1].snapshot}
                    <tr>
                        <td>{formatDate(snap.tanggal)}</td>
                        <td>
                            {#if snap.type === 'masuk'}
                                <span class="badge badge-info badge-sm">Masuk</span>
                            {:else}
                                <span class="badge badge-error badge-sm">Keluar</span>
                            {/if}
                        </td>
                        <td class="text-base-content/50 font-mono text-xs">{r.id}</td>
                        <td>{snap.items.length} item</td>
                        <td class="text-base-content/50 text-sm">{getRowInfo(r)}</td>
                        <td>
                            <div class="flex gap-2 items-center">
                                <button class="btn btn-xs btn-ghost" on:click={() => openVersion(r)}>Versi</button>
                                {#if r.pendingRequest?.status === 'pending'}
                                    <span class="badge badge-warning badge-sm">⏳ Menunggu</span>
                                {:else if r.pendingRequest?.status === 'rejected'}
                                    <button class="btn btn-xs btn-warning" on:click={() => openPt(r)}>Revisi</button>
                                {:else}
                                    <button class="btn btn-xs btn-ghost" on:click={() => openPt(r)}>Perbaikan</button>
                                {/if}
                            </div>
                        </td>
                    </tr>
                {/each}
                {#if paginated.length === 0}
                    <tr><td colspan="6" class="text-center text-base-content/40 py-8">Tidak ada data</td></tr>
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
        <div class="flex justify-center items-center gap-1 mt-4">
            <button class="btn btn-sm btn-ghost" disabled={currentPage === 1} on:click={() => currentPage--}>‹</button>
            {#each pageButtons as p}
                <button class="btn btn-sm {p === currentPage ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPage = p}>{p}</button>
            {/each}
            <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
        </div>
    {/if}
</div>

<!-- Version timeline modal (inline) -->
{#if versionRecord}
    <div class="modal modal-open">
        <div class="modal-box max-w-lg">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold">Riwayat Versi — {versionRecord.id}</h3>
                <button class="btn btn-sm btn-ghost btn-circle" on:click={() => versionRecord = null}>✕</button>
            </div>
            <ul class="timeline timeline-vertical">
                {#each versionRecord.versions as v}
                    <li>
                        <div class="timeline-middle">
                            <span class="badge badge-sm {v.type === 'original' ? 'badge-secondary' : 'badge-warning'}">{v.index}</span>
                        </div>
                        <div class="timeline-end timeline-box text-sm">
                            <p class="font-semibold">{v.type === 'original' ? 'Original' : 'Approved PT'}</p>
                            {#if v.changedFields.length > 0}
                                <p class="text-xs text-base-content/50">Ubah: {v.changedFields.join(', ')}</p>
                            {/if}
                            <p class="text-xs text-base-content/40">{v.createdBy} · {formatDate(v.createdAt)}</p>
                        </div>
                        <hr />
                    </li>
                {/each}
                {#if versionRecord.pendingRequest?.status === 'pending'}
                    <li>
                        <div class="timeline-middle"><span class="badge badge-sm badge-warning">⏳</span></div>
                        <div class="timeline-end timeline-box text-sm">
                            <p class="font-semibold text-warning">PT Pending</p>
                            <p class="text-xs text-base-content/40">Diminta oleh {versionRecord.pendingRequest.submittedBy}</p>
                        </div>
                    </li>
                {/if}
            </ul>
            <div class="modal-action"><button class="btn btn-sm" on:click={() => versionRecord = null}>Tutup</button></div>
        </div>
        <div class="modal-backdrop" on:click={() => versionRecord = null}></div>
    </div>
{/if}

<!-- Form modal -->
<StokFormModal
    open={modalOpen}
    record={ptRecord}
    on:saved={onSaved}
    on:close={closeModal}
/>
```

- [ ] **Step 2: Open browser and verify**

```bash
npm run dev
```

Navigate to `http://localhost:5173/outlet/pergerakan-stok`. Expected:
- 4 seed records visible in the table
- Chip filter switches between all/masuk/keluar
- Search filters by ref ID, supplier name, or kategori
- "+ Tambah" opens form modal with Masuk/Keluar toggle
- Saving a new record adds it to the list
- "Perbaikan" opens the PT form pre-filled
- "Revisi" on IK-00002 shows the rejected banner
- "Versi" opens the version timeline modal

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/pergerakan-stok/+page.svelte
git commit -m "feat: add Pergerakan Stok main outlet page"
```

---

## Task 7: Admin PT repair page

**Files:**
- Create: `src/routes/outlet/pergerakan-stok/repair/+page.svelte`

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/outlet/pergerakan-stok/repair/+page.svelte -->
<script lang="ts">
    import { get } from 'svelte/store'
    import { toast } from 'svelte-sonner'
    import { auth } from '$lib/stores/auth'
    import { getPTRequests, getStokById, approveRepairRequest, rejectRepairRequest, dismissRepairRequest, deleteRecord } from '$lib/mock/pergerakan-stok'
    import { getMasterItemById } from '$lib/mock/master-items'
    import { suppById } from '$lib/mock/suppliers'
    import type { PergerakanStok, StokRepairRequest, StokSnapshot } from '$lib/types/PergerakanStok'

    const session = get(auth)

    let activeTab: 'pending' | 'resolved' = 'pending'
    let selectedPtId: string | null = null
    let rejectReason = ''
    let showRejectInput = false
    let confirmDelete = false

    $: pendingPTs = getPTRequests('pending')
    $: resolvedPTs = [...getPTRequests('rejected'), ...getPTRequests('deleted')]
        .filter(pt => {
            const rec = getStokById(pt.stokId)
            return rec?.pendingRequest?.id === pt.id || !rec
        })

    $: selectedPt = selectedPtId ? getPTRequests().find(pt => pt.id === selectedPtId) ?? null : null
    $: selectedRecord = selectedPt ? getStokById(selectedPt.stokId) ?? null : null
    $: currentSnap = selectedRecord ? selectedRecord.versions[selectedRecord.currentVersionIndex - 1].snapshot : null

    function refresh() {
        selectedPtId = selectedPtId  // trigger reactivity
        rejectReason = ''
        showRejectInput = false
        confirmDelete = false
    }

    function handleApprove() {
        if (!selectedRecord) return
        try {
            approveRepairRequest(selectedRecord.id, session.userId)
            toast.success('PT disetujui dan stok disesuaikan')
            selectedPtId = null
            refresh()
        } catch (e: any) { toast.error(e.message) }
    }

    function handleReject() {
        if (!selectedRecord || !rejectReason.trim()) { toast.error('Tulis alasan penolakan'); return }
        try {
            rejectRepairRequest(selectedRecord.id, rejectReason.trim(), session.userId)
            toast.success('PT ditolak')
            selectedPtId = null
            refresh()
        } catch (e: any) { toast.error(e.message) }
    }

    function handleDismiss() {
        if (!selectedRecord) return
        try {
            dismissRepairRequest(selectedRecord.id, session.userId)
            toast.success('Permintaan dihapus')
            selectedPtId = null
            refresh()
        } catch (e: any) { toast.error(e.message) }
    }

    function handleDeleteRecord() {
        if (!selectedRecord) return
        try {
            deleteRecord(selectedRecord.id, session.userId)
            toast.success('Record dihapus dan stok dikembalikan')
            selectedPtId = null
            refresh()
        } catch (e: any) { toast.error(e.message) }
    }

    function diffItems(orig: StokSnapshot, proposed: StokSnapshot): Array<{ itemId: string; origQty: number; propQty: number; changed: boolean }> {
        if (orig.type !== proposed.type) return []
        const origMap = new Map(orig.items.map(i => [i.itemId, i.qty]))
        const propMap = new Map(proposed.items.map(i => [i.itemId, i.qty]))
        const allIds = new Set([...origMap.keys(), ...propMap.keys()])
        return Array.from(allIds).map(id => ({
            itemId: id,
            origQty: origMap.get(id) ?? 0,
            propQty: propMap.get(id) ?? 0,
            changed: origMap.get(id) !== propMap.get(id),
        }))
    }

    function itemName(itemId: string): string {
        return getMasterItemById(itemId)?.name ?? itemId
    }

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    }
</script>

<div class="p-6">
    <h1 class="text-xl font-bold mb-4">PT Queue — Pergerakan Stok</h1>

    {#if session.role !== 'admin'}
        <div class="alert alert-error">Hanya admin yang dapat mengakses halaman ini.</div>
    {:else}
        <!-- Tabs -->
        <div class="tabs tabs-bordered mb-4">
            <button class="tab {activeTab === 'pending' ? 'tab-active' : ''}" on:click={() => { activeTab = 'pending'; selectedPtId = null }}>Pending ({pendingPTs.length})</button>
            <button class="tab {activeTab === 'resolved' ? 'tab-active' : ''}" on:click={() => { activeTab = 'resolved'; selectedPtId = null }}>Selesai</button>
        </div>

        <div class="grid grid-cols-2 gap-6">
            <!-- Left: PT list -->
            <div>
                {#if activeTab === 'pending'}
                    {#each pendingPTs as pt}
                        {@const rec = getStokById(pt.stokId)}
                        {@const snap = rec?.versions[rec.currentVersionIndex - 1].snapshot}
                        <div class="card card-compact bg-base-200 cursor-pointer mb-2 border {selectedPtId === pt.id ? 'border-primary' : 'border-transparent'}" on:click={() => selectedPtId = pt.id}>
                            <div class="card-body">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="font-mono font-bold text-sm">{pt.stokId}</p>
                                        <p class="text-xs text-base-content/50">Diminta: {formatDate(pt.submittedAt)} · Revisi ke-{pt.revisions + 1}</p>
                                        {#if pt.catatan}<p class="text-xs italic mt-1">"{pt.catatan}"</p>{/if}
                                    </div>
                                    {#if snap}
                                        <span class="badge badge-sm {snap.type === 'masuk' ? 'badge-info' : 'badge-error'}">{snap.type === 'masuk' ? 'Masuk' : 'Keluar'}</span>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                    {#if pendingPTs.length === 0}
                        <p class="text-base-content/40 text-center py-8">Tidak ada permintaan pending</p>
                    {/if}
                {:else}
                    {#each resolvedPTs as pt}
                        <div class="card card-compact bg-base-200 mb-2">
                            <div class="card-body">
                                <div class="flex justify-between">
                                    <p class="font-mono font-bold text-sm">{pt.stokId}</p>
                                    <span class="badge badge-sm {pt.status === 'rejected' ? 'badge-error' : 'badge-ghost'}">
                                        {pt.status === 'rejected' ? 'Ditolak' : 'Dihapus'}
                                    </span>
                                </div>
                                {#if pt.rejectionReason}<p class="text-xs text-error mt-1">{pt.rejectionReason}</p>{/if}
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>

            <!-- Right: Review panel -->
            {#if selectedPt && currentSnap && selectedRecord}
                <div class="card bg-base-200">
                    <div class="card-body">
                        <h3 class="font-bold mb-2">Review — {selectedRecord.id}</h3>

                        <!-- Item diff -->
                        <p class="text-xs font-semibold uppercase text-base-content/50 mb-2">Perubahan Item</p>
                        {#each diffItems(currentSnap, selectedPt.proposedSnapshot) as row}
                            <div class="flex justify-between text-sm mb-1 rounded px-2 py-1 {row.changed ? 'bg-warning/10' : 'bg-base-100'}">
                                <span>{itemName(row.itemId)}</span>
                                <span>
                                    {#if row.changed}
                                        <span class="text-error line-through mr-1">{row.origQty}</span>
                                        <span class="text-success">{row.propQty}</span>
                                    {:else}
                                        <span class="text-base-content/50">{row.origQty} (tidak berubah)</span>
                                    {/if}
                                </span>
                            </div>
                        {/each}

                        <!-- Field diff for non-items -->
                        {#if currentSnap.type === 'masuk' && selectedPt.proposedSnapshot.type === 'masuk'}
                            {#if currentSnap.supplierId !== selectedPt.proposedSnapshot.supplierId}
                                <div class="text-sm bg-warning/10 rounded px-2 py-1 mt-1">Supplier: <span class="line-through text-error">{currentSnap.supplierId}</span> → <span class="text-success">{selectedPt.proposedSnapshot.supplierId}</span></div>
                            {/if}
                        {/if}
                        {#if currentSnap.type === 'keluar' && selectedPt.proposedSnapshot.type === 'keluar'}
                            {#if currentSnap.kategori !== selectedPt.proposedSnapshot.kategori}
                                <div class="text-sm bg-warning/10 rounded px-2 py-1 mt-1">Kategori: <span class="line-through text-error">{currentSnap.kategori}</span> → <span class="text-success">{selectedPt.proposedSnapshot.kategori}</span></div>
                            {/if}
                        {/if}
                        {#if currentSnap.tanggal !== selectedPt.proposedSnapshot.tanggal}
                            <div class="text-sm bg-warning/10 rounded px-2 py-1 mt-1">Tanggal: <span class="line-through text-error">{currentSnap.tanggal}</span> → <span class="text-success">{selectedPt.proposedSnapshot.tanggal}</span></div>
                        {/if}
                        {#if currentSnap.keterangan !== selectedPt.proposedSnapshot.keterangan}
                            <div class="text-sm bg-warning/10 rounded px-2 py-1 mt-1">Keterangan berubah</div>
                        {/if}

                        <!-- Admin actions -->
                        <div class="divider my-3"></div>
                        <div class="flex flex-col gap-2">
                            <button class="btn btn-success btn-sm" on:click={handleApprove}>✓ Setujui & Sesuaikan Stok</button>

                            {#if showRejectInput}
                                <input type="text" class="input input-bordered input-sm" placeholder="Alasan penolakan..." bind:value={rejectReason} />
                                <div class="flex gap-2">
                                    <button class="btn btn-error btn-sm flex-1" on:click={handleReject}>Tolak</button>
                                    <button class="btn btn-ghost btn-sm" on:click={() => showRejectInput = false}>Batal</button>
                                </div>
                            {:else}
                                <button class="btn btn-error btn-outline btn-sm" on:click={() => showRejectInput = true}>✗ Tolak</button>
                            {/if}

                            <button class="btn btn-ghost btn-sm" on:click={handleDismiss}>Hapus Permintaan</button>

                            {#if confirmDelete}
                                <div class="alert alert-error text-xs">Stok akan dikembalikan dan record dihapus permanen. Yakin?</div>
                                <div class="flex gap-2">
                                    <button class="btn btn-error btn-sm flex-1" on:click={handleDeleteRecord}>Ya, Hapus Record</button>
                                    <button class="btn btn-ghost btn-sm" on:click={() => confirmDelete = false}>Batal</button>
                                </div>
                            {:else}
                                <button class="btn btn-ghost btn-sm text-error" on:click={() => confirmDelete = true}>🗑 Hapus Record</button>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else if activeTab === 'pending' && pendingPTs.length > 0}
                <div class="flex items-center justify-center text-base-content/40 text-sm">Pilih permintaan untuk review</div>
            {/if}
        </div>
    {/if}
</div>
```

- [ ] **Step 2: Fix missing import** — `suppById` is exported from `mock/suppliers.ts` as `getSupplierById`. Update the import in the repair page:

Replace the import line:
```typescript
import { suppById } from '$lib/mock/suppliers'
```
with:
```typescript
import { getSupplierById } from '$lib/mock/suppliers'
```

And replace all uses of `suppById(...)` with `getSupplierById(...)` in the file.

- [ ] **Step 3: Open browser and verify**

Navigate to `http://localhost:5173/outlet/pergerakan-stok/repair`.

Expected (with `session.role = 'admin'` in the auth stub):
- Pending tab shows IK-00001 (pending PT)
- Clicking IK-00001 shows the item diff panel (item-4: 5→3 highlighted in amber)
- "Setujui" approves, stock for item-4 increases by 2, record disappears from pending
- "Tolak" shows reason input field, submitting moves PT to rejected state
- "Hapus Record" shows confirm prompt before deleting

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/pergerakan-stok/repair/+page.svelte
git commit -m "feat: add Pergerakan Stok admin PT repair page"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections covered — data model (Task 1), stock architecture (Tasks 2+4), routes (Tasks 6+7), main page with chip filter (Task 6), StokFormModal (Task 5), PT flow user-side (Tasks 4+5), PT flow admin-side (Task 7), version timeline (Task 6 inline), mock functions (Tasks 3+4), seed data (Task 3), business rules (enforced via validate() and mock guards)
- [x] **Placeholder scan:** No TBDs or TODOs found
- [x] **Type consistency:** `StokMasukSnapshot`, `StokKeluarSnapshot`, `PergerakanStok`, `StokRepairRequest`, `StokVersion` used consistently. `createStokMasuk`/`createStokKeluar`, `submitRepairRequest`, `reviseRepairRequest`, `approveRepairRequest`, `rejectRepairRequest`, `dismissRepairRequest`, `deleteRecord` — all names match across Tasks 3/4 and Tasks 5/6/7.
