# Akuntansi (Kas Masuk & Kas Keluar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standard cash-book ledger feature with Kas Masuk (cash-in) and Kas Keluar (cash-out) records, multi-entry per record, PIC accountability, receipt filename attachment, running Saldo, full version history, and a PT (Perbaikan Transaksi) admin approval flow.

**Architecture:** Unified `KasRecord` entity with `type: "masuk" | "keluar"` discriminator. All records live in one mock array (`mockKasRecords`). Ledger Saldo is computed on read (not stored). Only PT is supported — no PTI. Follows the same versioned-snapshot pattern as Item Keluar and Item Masuk.

**Tech Stack:** SvelteKit · TypeScript · TailwindCSS · DaisyUI · Svelte Stores · Vitest (unit tests for pure functions and hook logic)

> **Note:** `$lib` resolves to `src/library/`. Ensure `svelte.config.js` includes `kit: { alias: { $lib: 'src/library' } }`.
>
> **Prerequisites:** A working SvelteKit project with TailwindCSS + DaisyUI configured, and `src/library/stores/auth.ts` exporting a writable store `auth` with shape `{ userId: string, outletId: string, userName: string, role: string }`. If starting from scratch, initialize with `npm create svelte@latest` and install all packages listed in `CLAUDE.md`.

---

## File Map

**Created:**
- `src/library/types/Kas.ts` — all Kas TypeScript interfaces and the `CreateKasPayload` type
- `src/library/mock/kasPaymentMethods.ts` — `KAS_PAYMENT_METHODS` constant and `KasPaymentMethod` type
- `src/library/mock/kas.ts` — seed `KasRecord[]` with 3 records (approved PT, pending PT, rejected PT)
- `src/library/hooks/useKas.ts` — all Kas operations (create, PT submit/revise/delete, admin approve/reject/delete)
- `src/library/hooks/useKas.test.ts` — Vitest unit tests
- `src/library/stores/kas.ts` — reactive `kasRecords` writable store + `refreshKas()`
- `src/library/components/outlet/akuntansi/KasForm.svelte` — creation modal (multi-entry, type toggle, PIC, date)
- `src/library/components/outlet/akuntansi/KasLedgerTable.svelte` — running-balance table
- `src/library/components/outlet/akuntansi/KasVersionTimeline.svelte` — version history list
- `src/library/components/outlet/akuntansi/KasVersionDiff.svelte` — side-by-side field diff
- `src/library/components/outlet/akuntansi/KasRepairModal.svelte` — PT request form + revision flow
- `src/library/components/outlet/akuntansi/AdminKasQueue.svelte` — admin pending request list
- `src/library/components/outlet/akuntansi/AdminKasDiffView.svelte` — admin diff + action buttons
- `src/routes/outlet/akuntansi/+page.svelte` — main ledger page
- `src/routes/outlet/akuntansi/repair/+page.svelte` — admin PT repair queue

**Created if not already present:**
- `src/library/utils/repairDiff.ts` — generic `getChangedFields()` pure utility
- `src/library/validator/useDefault.ts` — date boundary singleton (firstDay, lastDay, currentDay)
- `src/library/mock/employees.ts` — mock employee list (PIC source)

---

## Task 1: Types, Constants, Utilities & Mock Data

**Files:**
- Create: `src/library/types/Kas.ts`
- Create: `src/library/mock/kasPaymentMethods.ts`
- Create: `src/library/utils/repairDiff.ts` *(skip if already exists)*
- Create: `src/library/validator/useDefault.ts` *(skip if already exists)*
- Create: `src/library/mock/employees.ts` *(skip if already exists)*
- Create: `src/library/mock/kas.ts`

- [ ] **Step 1.1: Create `Kas.ts`**

```typescript
// src/library/types/Kas.ts
import type { KasPaymentMethod } from "$lib/mock/kasPaymentMethods"

export interface KasEntry {
    id: string
    amount: number
    paymentMethod: KasPaymentMethod
    keterangan: string
    receiptFile: string | null
}

export interface KasSnapshot {
    id: string
    type: "masuk" | "keluar"
    outletId: string
    createdBy: string
    tanggal: string
    entries: KasEntry[]
    totalAmount: number
    pic: { employeeId: string; name: string }
}

export interface KasVersion {
    index: number
    type: "original" | "approved"
    snapshot: KasSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface KasRepairRequest {
    id: string
    kasId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: KasSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export interface KasRecord {
    id: string
    currentVersionIndex: number
    versions: KasVersion[]
    pendingRequest: KasRepairRequest | null
    isDeleted: boolean
}

export interface CreateKasPayload {
    type: "masuk" | "keluar"
    tanggal: string
    entries: Array<Omit<KasEntry, "id">>
    pic: { employeeId: string; name: string }
}
```

- [ ] **Step 1.2: Create `kasPaymentMethods.ts`**

```typescript
// src/library/mock/kasPaymentMethods.ts
export const KAS_PAYMENT_METHODS = [
    "Tunai",
    "GoPay",
    "OVO",
    "Dana",
    "BCA Transfer",
    "Mandiri Transfer",
    "BNI Transfer",
] as const

export type KasPaymentMethod = typeof KAS_PAYMENT_METHODS[number]
```

- [ ] **Step 1.3: Create `repairDiff.ts` (skip if file already exists)**

```typescript
// src/library/utils/repairDiff.ts
function getChangedFields(
    original: Record<string, unknown>,
    proposed: Record<string, unknown>
): string[] {
    return Object.keys(proposed).filter(
        (key) => JSON.stringify(original[key]) !== JSON.stringify(proposed[key])
    )
}

export { getChangedFields }
```

- [ ] **Step 1.4: Create `useDefault.ts` (skip if file already exists)**

```typescript
// src/library/validator/useDefault.ts
function pad(n: number): string {
    return String(n).padStart(2, "0")
}

function toYMD(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const now = new Date()
const firstDay = toYMD(new Date(now.getFullYear(), now.getMonth(), 1))
const lastDay = toYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0))
const currentDay = toYMD(now)

const useDefault = { firstDay, lastDay, currentDay }
export default useDefault
```

- [ ] **Step 1.5: Create `employees.ts` (skip if file already exists)**

```typescript
// src/library/mock/employees.ts
export interface Employee {
    id: string
    name: string
    role: string
}

export const mockEmployees: Employee[] = [
    { id: "emp-01", name: "Budi Santoso", role: "Kasir" },
    { id: "emp-02", name: "Siti Rahayu", role: "Supervisor" },
    { id: "emp-03", name: "Ahmad Fauzi", role: "Kasir" },
    { id: "emp-04", name: "Dewi Kusuma", role: "Manajer" },
    { id: "emp-05", name: "Riko Pratama", role: "Kasir" },
]
```

- [ ] **Step 1.6: Create `kas.ts` mock seed data**

```typescript
// src/library/mock/kas.ts
import type { KasRecord, KasSnapshot } from "$lib/types/Kas"

const snap001: KasSnapshot = {
    id: "KAS-001",
    type: "masuk",
    outletId: "outlet-01",
    createdBy: "cashier-01",
    tanggal: "2026-05-01",
    entries: [
        {
            id: "ke-001-1",
            amount: 500000,
            paymentMethod: "Tunai",
            keterangan: "Kompensasi kerusakan etalase",
            receiptFile: "nota-kerusakan.jpg",
        },
    ],
    totalAmount: 500000,
    pic: { employeeId: "emp-01", name: "Budi Santoso" },
}

const snap002: KasSnapshot = {
    id: "KAS-002",
    type: "keluar",
    outletId: "outlet-01",
    createdBy: "cashier-02",
    tanggal: "2026-05-02",
    entries: [
        {
            id: "ke-002-1",
            amount: 250000,
            paymentMethod: "Tunai",
            keterangan: "Bayar listrik bulan Mei",
            receiptFile: "nota-listrik.jpg",
        },
    ],
    totalAmount: 250000,
    pic: { employeeId: "emp-02", name: "Siti Rahayu" },
}

const snap003: KasSnapshot = {
    id: "KAS-003",
    type: "keluar",
    outletId: "outlet-01",
    createdBy: "cashier-01",
    tanggal: "2026-05-03",
    entries: [
        {
            id: "ke-003-1",
            amount: 80000,
            paymentMethod: "GoPay",
            keterangan: "Beli gas elpiji",
            receiptFile: null,
        },
    ],
    totalAmount: 80000,
    pic: { employeeId: "emp-01", name: "Budi Santoso" },
}

export const mockKasRecords: KasRecord[] = [
    // KAS-001: 2 versions (original + approved PT), no pending request
    {
        id: "KAS-001",
        currentVersionIndex: 2,
        versions: [
            {
                index: 1,
                type: "original",
                snapshot: snap001,
                changedFields: [],
                createdBy: "cashier-01",
                createdAt: "2026-05-01T08:00:00Z",
                requestId: null,
            },
            {
                index: 2,
                type: "approved",
                snapshot: {
                    ...snap001,
                    entries: [
                        {
                            ...snap001.entries[0],
                            receiptFile: "nota-kerusakan-final.jpg",
                        },
                    ],
                },
                changedFields: ["entries"],
                createdBy: "admin-01",
                createdAt: "2026-05-01T10:00:00Z",
                requestId: "KR-001",
            },
        ],
        pendingRequest: null,
        isDeleted: false,
    },
    // KAS-002: 1 version, pending PT request (proposed: amount koreksi 270.000)
    {
        id: "KAS-002",
        currentVersionIndex: 1,
        versions: [
            {
                index: 1,
                type: "original",
                snapshot: snap002,
                changedFields: [],
                createdBy: "cashier-02",
                createdAt: "2026-05-02T09:00:00Z",
                requestId: null,
            },
        ],
        pendingRequest: {
            id: "KR-002",
            kasId: "KAS-002",
            status: "pending",
            proposedSnapshot: {
                ...snap002,
                entries: [
                    {
                        ...snap002.entries[0],
                        amount: 270000,
                        keterangan: "Bayar listrik bulan Mei — koreksi jumlah",
                    },
                ],
                totalAmount: 270000,
            },
            submittedBy: "cashier-02",
            submittedAt: "2026-05-02T11:00:00Z",
            rejectionReason: null,
            revisions: 0,
        },
        isDeleted: false,
    },
    // KAS-003: 1 version, rejected PT request (revision scenario)
    {
        id: "KAS-003",
        currentVersionIndex: 1,
        versions: [
            {
                index: 1,
                type: "original",
                snapshot: snap003,
                changedFields: [],
                createdBy: "cashier-01",
                createdAt: "2026-05-03T07:00:00Z",
                requestId: null,
            },
        ],
        pendingRequest: {
            id: "KR-003",
            kasId: "KAS-003",
            status: "rejected",
            proposedSnapshot: {
                ...snap003,
                entries: [{ ...snap003.entries[0], amount: 85000 }],
                totalAmount: 85000,
            },
            submittedBy: "cashier-01",
            submittedAt: "2026-05-03T08:00:00Z",
            rejectionReason: "Jumlah tidak sesuai nota, harap periksa ulang",
            revisions: 0,
        },
        isDeleted: false,
    },
]
```

- [ ] **Step 1.7: Commit**

```bash
git add src/library/types/Kas.ts src/library/mock/kasPaymentMethods.ts src/library/mock/kas.ts
git add src/library/utils/repairDiff.ts src/library/validator/useDefault.ts src/library/mock/employees.ts
git commit -m "feat(akuntansi): add types, payment method constants, utilities, and mock seed data"
```

---

## Task 2: `useKas.ts` — `computeTotalAmount` & `createKas` (TDD)

**Files:**
- Create: `src/library/hooks/useKas.ts`
- Create: `src/library/hooks/useKas.test.ts`

- [ ] **Step 2.1: Install Vitest (skip if already installed)**

```bash
npm install -D vitest @vitest/ui
```

Add to `package.json` scripts if not present:
```json
"test": "vitest run",
"test:ui": "vitest --ui"
```

Add `vite.config.ts` (or merge into existing):
```typescript
// vite.config.ts
import { defineConfig } from "vitest/config"
import { sveltekit } from "@sveltejs/kit/vite"

export default defineConfig({
    plugins: [sveltekit()],
    test: {
        include: ["src/**/*.test.ts"],
        alias: {
            $lib: new URL("./src/library", import.meta.url).pathname,
        },
    },
})
```

- [ ] **Step 2.2: Write failing tests for `computeTotalAmount` and `createKas`**

```typescript
// src/library/hooks/useKas.test.ts
import { describe, it, expect } from "vitest"
import { computeTotalAmount, createKas } from "./useKas"
import { mockKasRecords } from "$lib/mock/kas"

describe("computeTotalAmount", () => {
    it("sums amount across all entries", () => {
        const entries = [
            { amount: 200000, paymentMethod: "Tunai" as const, keterangan: "A", receiptFile: null },
            { amount: 50000, paymentMethod: "GoPay" as const, keterangan: "B", receiptFile: null },
        ]
        expect(computeTotalAmount(entries)).toBe(250000)
    })

    it("returns 0 for empty entries", () => {
        expect(computeTotalAmount([])).toBe(0)
    })
})

describe("createKas", () => {
    const initialCount = mockKasRecords.length

    it("adds a new record to the mock store", () => {
        createKas({
            type: "masuk",
            tanggal: "2026-05-07",
            entries: [{ amount: 100000, paymentMethod: "Tunai", keterangan: "Test masuk", receiptFile: null }],
            pic: { employeeId: "emp-01", name: "Budi Santoso" },
        })
        expect(mockKasRecords.length).toBe(initialCount + 1)
    })

    it("creates V1 of type original", () => {
        const record = mockKasRecords[0]
        expect(record.versions[0].type).toBe("original")
        expect(record.currentVersionIndex).toBe(1)
    })

    it("computes totalAmount correctly from entries", () => {
        const record = mockKasRecords[0]
        expect(record.versions[0].snapshot.totalAmount).toBe(100000)
    })

    it("assigns an id to each entry", () => {
        const record = mockKasRecords[0]
        expect(record.versions[0].snapshot.entries[0].id).toBeTruthy()
    })

    it("sets type, tanggal, and pic from payload", () => {
        const snap = mockKasRecords[0].versions[0].snapshot
        expect(snap.type).toBe("masuk")
        expect(snap.tanggal).toBe("2026-05-07")
        expect(snap.pic.employeeId).toBe("emp-01")
    })
})
```

- [ ] **Step 2.3: Run tests — expect FAIL**

```bash
npx vitest run src/library/hooks/useKas.test.ts
```

Expected: FAIL with "Cannot find module './useKas'"

- [ ] **Step 2.4: Create `useKas.ts` with `computeTotalAmount` and `createKas`**

```typescript
// src/library/hooks/useKas.ts
import { get } from "svelte/store"
import { auth } from "$lib/stores/auth"
import { getChangedFields } from "$lib/utils/repairDiff"
import type { KasRecord, KasSnapshot, KasRepairRequest, KasEntry, CreateKasPayload } from "$lib/types/Kas"
import { mockKasRecords } from "$lib/mock/kas"

export function computeTotalAmount(entries: Array<{ amount: number }>): number {
    return entries.reduce((sum, e) => sum + e.amount, 0)
}

export function createKas(payload: CreateKasPayload): KasRecord {
    const $auth = get(auth)
    const id = `KAS-${Date.now()}`

    const entries: KasEntry[] = payload.entries.map((e, i) => ({
        ...e,
        id: `${id}-e${i}`,
    }))

    const snapshot: KasSnapshot = {
        id,
        type: payload.type,
        outletId: $auth.outletId,
        createdBy: $auth.userId,
        tanggal: payload.tanggal,
        entries,
        totalAmount: computeTotalAmount(entries),
        pic: payload.pic,
    }

    const record: KasRecord = {
        id,
        currentVersionIndex: 1,
        versions: [
            {
                index: 1,
                type: "original",
                snapshot,
                changedFields: [],
                createdBy: $auth.userId,
                createdAt: new Date().toISOString(),
                requestId: null,
            },
        ],
        pendingRequest: null,
        isDeleted: false,
    }

    mockKasRecords.unshift(record)
    return record
}
```

- [ ] **Step 2.5: Run tests — expect PASS**

```bash
npx vitest run src/library/hooks/useKas.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 2.6: Commit**

```bash
git add src/library/hooks/useKas.ts src/library/hooks/useKas.test.ts vite.config.ts package.json
git commit -m "feat(akuntansi): add computeTotalAmount and createKas with tests"
```

---

## Task 3: Kas Store & `KasForm.svelte`

**Files:**
- Create: `src/library/stores/kas.ts`
- Create: `src/library/components/outlet/akuntansi/KasForm.svelte`

- [ ] **Step 3.1: Create `kas.ts` store**

```typescript
// src/library/stores/kas.ts
import { writable } from "svelte/store"
import type { KasRecord } from "$lib/types/Kas"
import { mockKasRecords } from "$lib/mock/kas"

export const kasRecords = writable<KasRecord[]>([...mockKasRecords])

export function refreshKas(): void {
    kasRecords.set([...mockKasRecords])
}
```

- [ ] **Step 3.2: Create `KasForm.svelte`**

```svelte
<!-- src/library/components/outlet/akuntansi/KasForm.svelte -->
<script lang="ts">
    import { KAS_PAYMENT_METHODS } from "$lib/mock/kasPaymentMethods"
    import type { KasPaymentMethod } from "$lib/mock/kasPaymentMethods"
    import { mockEmployees } from "$lib/mock/employees"
    import { createKas, computeTotalAmount } from "$lib/hooks/useKas"
    import { refreshKas } from "$lib/stores/kas"

    export let onClose: () => void

    let type: "masuk" | "keluar" = "masuk"
    let tanggal = new Date().toISOString().slice(0, 10)
    let selectedEmployeeId = ""
    let entries: Array<{ amount: number; paymentMethod: KasPaymentMethod; keterangan: string; receiptFile: string | null }> = [
        { amount: 0, paymentMethod: "Tunai", keterangan: "", receiptFile: null },
    ]
    let loading = false
    let error = ""

    $: totalAmount = computeTotalAmount(entries)
    $: selectedEmployee = mockEmployees.find((e) => e.id === selectedEmployeeId)

    function formatRupiah(n: number): string {
        return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
    }

    function addEntry() {
        entries = [...entries, { amount: 0, paymentMethod: "Tunai", keterangan: "", receiptFile: null }]
    }

    function removeEntry(i: number) {
        entries = entries.filter((_, idx) => idx !== i)
    }

    function handleReceiptFile(i: number, event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0]
        entries[i].receiptFile = file?.name ?? null
        entries = entries
    }

    function handleSubmit() {
        if (!selectedEmployeeId) { error = "Pilih PIC terlebih dahulu"; return }
        if (entries.some((e) => !e.keterangan.trim() || e.amount <= 0)) {
            error = "Lengkapi semua entri — jumlah dan keterangan wajib diisi"
            return
        }
        loading = true
        error = ""

        createKas({
            type,
            tanggal,
            entries,
            pic: { employeeId: selectedEmployeeId, name: selectedEmployee?.name ?? selectedEmployeeId },
        })

        refreshKas()
        onClose()
        loading = false
    }
</script>

<dialog class="modal modal-open">
    <div class="modal-box max-w-2xl">
        <h3 class="font-bold text-lg mb-1">Tambah Kas</h3>

        <!-- Type toggle -->
        <div class="join mb-4">
            <button class="join-item btn btn-sm {type === 'masuk' ? 'btn-success' : 'btn-ghost'}" on:click={() => (type = "masuk")}>Kas Masuk</button>
            <button class="join-item btn btn-sm {type === 'keluar' ? 'btn-error' : 'btn-ghost'}" on:click={() => (type = "keluar")}>Kas Keluar</button>
        </div>

        {#if error}
            <div class="alert alert-error text-sm mb-4">{error}</div>
        {/if}

        <div class="flex flex-col gap-4">
            <!-- Tanggal & PIC -->
            <div class="grid grid-cols-2 gap-3">
                <label class="form-control">
                    <div class="label"><span class="label-text">Tanggal</span></div>
                    <input type="date" class="input input-bordered" bind:value={tanggal} />
                </label>
                <label class="form-control">
                    <div class="label"><span class="label-text">PIC</span></div>
                    <select class="select select-bordered" bind:value={selectedEmployeeId}>
                        <option value="" disabled>Pilih PIC</option>
                        {#each mockEmployees as emp}
                            <option value={emp.id}>{emp.name} — {emp.role}</option>
                        {/each}
                    </select>
                </label>
            </div>

            <!-- Entries -->
            <div>
                <div class="label"><span class="label-text font-semibold">Entri</span></div>
                {#each entries as entry, i}
                    <div class="flex gap-2 mb-3 items-start">
                        <div class="flex flex-col gap-1 flex-1">
                            <div class="flex gap-2">
                                <input class="input input-bordered input-sm w-40" type="number" min="0" bind:value={entry.amount} placeholder="Jumlah (IDR)" />
                                <select class="select select-bordered select-sm flex-1" bind:value={entry.paymentMethod}>
                                    {#each KAS_PAYMENT_METHODS as method}
                                        <option value={method}>{method}</option>
                                    {/each}
                                </select>
                            </div>
                            <input class="input input-bordered input-sm w-full" bind:value={entry.keterangan} placeholder="Keterangan" />
                            <div class="flex items-center gap-2">
                                <input type="file" accept="image/*" class="file-input file-input-bordered file-input-sm flex-1" on:change={(e) => handleReceiptFile(i, e)} />
                                {#if entry.receiptFile}
                                    <span class="text-xs opacity-60 truncate max-w-32">{entry.receiptFile}</span>
                                {/if}
                            </div>
                        </div>
                        {#if entries.length > 1}
                            <button class="btn btn-ghost btn-xs text-error mt-1" on:click={() => removeEntry(i)}>✕</button>
                        {/if}
                    </div>
                {/each}
                <button class="btn btn-ghost btn-xs mt-1" on:click={addEntry}>+ Tambah Lagi</button>
                <div class="text-sm mt-2 opacity-70">Total: <strong>{formatRupiah(totalAmount)}</strong></div>
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

- [ ] **Step 3.3: Commit**

```bash
git add src/library/stores/kas.ts src/library/components/outlet/akuntansi/KasForm.svelte
git commit -m "feat(akuntansi): add kas store and creation form"
```

---

## Task 4: `KasLedgerTable.svelte` & Main Page

**Files:**
- Create: `src/library/components/outlet/akuntansi/KasLedgerTable.svelte`
- Create: `src/routes/outlet/akuntansi/+page.svelte`

- [ ] **Step 4.1: Create `KasLedgerTable.svelte`**

```svelte
<!-- src/library/components/outlet/akuntansi/KasLedgerTable.svelte -->
<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import type { KasRecord } from "$lib/types/Kas"

    export let records: KasRecord[]

    const dispatch = createEventDispatcher<{ openHistory: string; openRepair: string }>()

    type LedgerRow = { record: KasRecord; saldo: number }

    $: rows = (() => {
        let saldo = 0
        return records.map((r): LedgerRow => {
            const snap = r.versions[r.currentVersionIndex - 1].snapshot
            saldo += snap.type === "masuk" ? snap.totalAmount : -snap.totalAmount
            return { record: r, saldo }
        })
    })()

    function formatRupiah(n: number): string {
        return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.abs(n))
    }

    function formatDate(d: string): string {
        return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { dateStyle: "medium" })
    }
</script>

<div class="overflow-x-auto">
    <table class="table table-sm w-full">
        <thead>
            <tr>
                <th>Tanggal</th>
                <th>Ref ID</th>
                <th>PIC</th>
                <th class="text-right text-success">Kas Masuk (+)</th>
                <th class="text-right text-error">Kas Keluar (−)</th>
                <th class="text-right">Saldo</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            {#if rows.length === 0}
                <tr>
                    <td colspan="7" class="text-center opacity-40 py-12 text-sm">Belum ada data kas</td>
                </tr>
            {:else}
                {#each rows as { record, saldo }}
                    {@const snap = record.versions[record.currentVersionIndex - 1].snapshot}
                    <tr class="hover">
                        <td class="whitespace-nowrap">{formatDate(snap.tanggal)}</td>
                        <td class="font-mono text-xs">{record.id}</td>
                        <td class="text-sm">{snap.pic.name}</td>
                        <td class="text-right text-success font-medium">
                            {snap.type === "masuk" ? formatRupiah(snap.totalAmount) : "—"}
                        </td>
                        <td class="text-right text-error font-medium">
                            {snap.type === "keluar" ? formatRupiah(snap.totalAmount) : "—"}
                        </td>
                        <td class="text-right font-semibold {saldo >= 0 ? 'text-success' : 'text-error'}">
                            {saldo < 0 ? "−" : ""}{formatRupiah(saldo)}
                        </td>
                        <td>
                            <div class="flex gap-1 items-center justify-end">
                                <button class="btn btn-xs btn-ghost" on:click={() => dispatch("openHistory", record.id)}>
                                    Lihat Versi
                                </button>
                                {#if record.pendingRequest?.status === "pending"}
                                    <span class="badge badge-warning badge-sm">⏳ Menunggu</span>
                                {:else}
                                    <button class="btn btn-xs btn-outline btn-primary" on:click={() => dispatch("openRepair", record.id)}>
                                        {record.pendingRequest?.status === "rejected" ? "Revisi" : "Perbaikan"}
                                    </button>
                                {/if}
                            </div>
                        </td>
                    </tr>
                {/each}
            {/if}
        </tbody>
    </table>
</div>
```

- [ ] **Step 4.2: Create main page (ledger + filter bar + form trigger)**

```svelte
<!-- src/routes/outlet/akuntansi/+page.svelte -->
<script lang="ts">
    import { kasRecords, refreshKas } from "$lib/stores/kas"
    import { mockKasRecords } from "$lib/mock/kas"
    import useDefault from "$lib/validator/useDefault"
    import KasForm from "$lib/components/outlet/akuntansi/KasForm.svelte"
    import KasLedgerTable from "$lib/components/outlet/akuntansi/KasLedgerTable.svelte"
    import type { KasRecord } from "$lib/types/Kas"

    let filterType: "all" | "masuk" | "keluar" = "all"
    let filterFrom = useDefault.firstDay
    let filterTo = useDefault.currentDay
    let showForm = false

    // Placeholders — wired in later tasks
    let historyTargetId: string | null = null
    let repairTargetId: string | null = null

    $: displayRecords = $kasRecords
        .filter((r) => !r.isDeleted)
        .filter((r) => filterType === "all" || r.versions[r.currentVersionIndex - 1].snapshot.type === filterType)
        .filter((r) => {
            const t = r.versions[r.currentVersionIndex - 1].snapshot.tanggal
            if (filterFrom && t < filterFrom) return false
            if (filterTo && t > filterTo) return false
            return true
        })
        .sort((a, b) => {
            const tA = a.versions[a.currentVersionIndex - 1].snapshot.tanggal
            const tB = b.versions[b.currentVersionIndex - 1].snapshot.tanggal
            if (tA !== tB) return tA.localeCompare(tB)
            return a.versions[0].createdAt.localeCompare(b.versions[0].createdAt)
        })
</script>

<div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Akuntansi — Buku Kas</h1>
        <button class="btn btn-primary" on:click={() => (showForm = true)}>+ Tambah</button>
    </div>

    <!-- Filter bar -->
    <div class="flex gap-3 items-center mb-4 flex-wrap">
        <div class="join">
            <button class="join-item btn btn-sm {filterType === 'all' ? 'btn-active' : ''}" on:click={() => (filterType = "all")}>Semua</button>
            <button class="join-item btn btn-sm {filterType === 'masuk' ? 'btn-success' : ''}" on:click={() => (filterType = "masuk")}>Kas Masuk</button>
            <button class="join-item btn btn-sm {filterType === 'keluar' ? 'btn-error' : ''}" on:click={() => (filterType = "keluar")}>Kas Keluar</button>
        </div>
        <input type="date" class="input input-bordered input-sm" bind:value={filterFrom} />
        <span class="opacity-50 text-sm">s/d</span>
        <input type="date" class="input input-bordered input-sm" bind:value={filterTo} />
    </div>

    <KasLedgerTable
        records={displayRecords}
        on:openHistory={(e) => (historyTargetId = e.detail)}
        on:openRepair={(e) => (repairTargetId = e.detail)}
    />
</div>

{#if showForm}
    <KasForm onClose={() => (showForm = false)} />
{/if}
```

- [ ] **Step 4.3: Start dev server and verify**

```bash
npm run dev
```

Navigate to `/outlet/akuntansi`. Expected:
- Table shows 3 seed rows sorted by tanggal (KAS-001 → KAS-002 → KAS-003)
- Saldo column: KAS-001 = Rp 500.000, KAS-002 = Rp 250.000, KAS-003 = Rp 170.000
- "+ Tambah" opens `KasForm` modal
- Fill a new Kas Masuk entry, click "Simpan" → table gains a new row at the correct date position

- [ ] **Step 4.4: Commit**

```bash
git add src/library/components/outlet/akuntansi/KasLedgerTable.svelte src/routes/outlet/akuntansi/+page.svelte
git commit -m "feat(akuntansi): add ledger table with running Saldo and main page"
```

---

## Task 5: Version History — `KasVersionTimeline.svelte` & `KasVersionDiff.svelte`

**Files:**
- Create: `src/library/components/outlet/akuntansi/KasVersionTimeline.svelte`
- Create: `src/library/components/outlet/akuntansi/KasVersionDiff.svelte`
- Modify: `src/routes/outlet/akuntansi/+page.svelte`

- [ ] **Step 5.1: Create `KasVersionTimeline.svelte`**

```svelte
<!-- src/library/components/outlet/akuntansi/KasVersionTimeline.svelte -->
<script lang="ts">
    import type { KasVersion, KasRepairRequest } from "$lib/types/Kas"

    export let versions: KasVersion[]
    export let currentVersionIndex: number
    export let pendingRequest: KasRepairRequest | null = null
    export let onSelectVersion: (v: KasVersion) => void = () => {}

    const typeColor: Record<KasVersion["type"], string> = {
        original: "badge-secondary",
        approved: "badge-error",
    }

    const typeLabel: Record<KasVersion["type"], string> = {
        original: "Original",
        approved: "Disetujui",
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

- [ ] **Step 5.2: Create `KasVersionDiff.svelte`**

```svelte
<!-- src/library/components/outlet/akuntansi/KasVersionDiff.svelte -->
<script lang="ts">
    import type { KasVersion, KasSnapshot } from "$lib/types/Kas"

    export let versionA: KasVersion
    export let versionB: KasVersion

    const FIELD_LABELS: Partial<Record<keyof KasSnapshot, string>> = {
        type: "Jenis",
        tanggal: "Tanggal",
        entries: "Entri / Jumlah",
        totalAmount: "Total",
        pic: "PIC",
        keterangan: "Keterangan",
    }

    function formatValue(val: unknown): string {
        if (val === null || val === undefined) return "-"
        if (typeof val === "number") {
            return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val)
        }
        if (typeof val === "object") return JSON.stringify(val, null, 2)
        return String(val)
    }

    $: changedFields =
        versionB.changedFields.length > 0
            ? versionB.changedFields
            : (Object.keys(versionB.snapshot) as Array<keyof KasSnapshot>).filter(
                  (k) => JSON.stringify(versionA.snapshot[k]) !== JSON.stringify(versionB.snapshot[k])
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
            {@const label = FIELD_LABELS[field as keyof KasSnapshot] ?? field}
            {@const oldVal = formatValue(versionA.snapshot[field as keyof KasSnapshot])}
            {@const newVal = formatValue(versionB.snapshot[field as keyof KasSnapshot])}
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

- [ ] **Step 5.3: Wire version history modal into `+page.svelte`**

Replace the `<script>` block imports/variables section and add the version modal. Replace the existing `+page.svelte` with:

```svelte
<!-- src/routes/outlet/akuntansi/+page.svelte -->
<script lang="ts">
    import { kasRecords, refreshKas } from "$lib/stores/kas"
    import { mockKasRecords } from "$lib/mock/kas"
    import useDefault from "$lib/validator/useDefault"
    import KasForm from "$lib/components/outlet/akuntansi/KasForm.svelte"
    import KasLedgerTable from "$lib/components/outlet/akuntansi/KasLedgerTable.svelte"
    import KasVersionTimeline from "$lib/components/outlet/akuntansi/KasVersionTimeline.svelte"
    import KasVersionDiff from "$lib/components/outlet/akuntansi/KasVersionDiff.svelte"
    import type { KasRecord, KasVersion } from "$lib/types/Kas"

    let filterType: "all" | "masuk" | "keluar" = "all"
    let filterFrom = useDefault.firstDay
    let filterTo = useDefault.currentDay
    let showForm = false

    let historyTarget: KasRecord | null = null
    let selectedVersion: KasVersion | null = null
    let repairTargetId: string | null = null  // wired in Task 6

    $: displayRecords = $kasRecords
        .filter((r) => !r.isDeleted)
        .filter((r) => filterType === "all" || r.versions[r.currentVersionIndex - 1].snapshot.type === filterType)
        .filter((r) => {
            const t = r.versions[r.currentVersionIndex - 1].snapshot.tanggal
            if (filterFrom && t < filterFrom) return false
            if (filterTo && t > filterTo) return false
            return true
        })
        .sort((a, b) => {
            const tA = a.versions[a.currentVersionIndex - 1].snapshot.tanggal
            const tB = b.versions[b.currentVersionIndex - 1].snapshot.tanggal
            if (tA !== tB) return tA.localeCompare(tB)
            return a.versions[0].createdAt.localeCompare(b.versions[0].createdAt)
        })

    function openHistory(id: string) {
        historyTarget = mockKasRecords.find((r) => r.id === id) ?? null
        selectedVersion = null
    }
</script>

<div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Akuntansi — Buku Kas</h1>
        <button class="btn btn-primary" on:click={() => (showForm = true)}>+ Tambah</button>
    </div>

    <div class="flex gap-3 items-center mb-4 flex-wrap">
        <div class="join">
            <button class="join-item btn btn-sm {filterType === 'all' ? 'btn-active' : ''}" on:click={() => (filterType = "all")}>Semua</button>
            <button class="join-item btn btn-sm {filterType === 'masuk' ? 'btn-success' : ''}" on:click={() => (filterType = "masuk")}>Kas Masuk</button>
            <button class="join-item btn btn-sm {filterType === 'keluar' ? 'btn-error' : ''}" on:click={() => (filterType = "keluar")}>Kas Keluar</button>
        </div>
        <input type="date" class="input input-bordered input-sm" bind:value={filterFrom} />
        <span class="opacity-50 text-sm">s/d</span>
        <input type="date" class="input input-bordered input-sm" bind:value={filterTo} />
    </div>

    <KasLedgerTable
        records={displayRecords}
        on:openHistory={(e) => openHistory(e.detail)}
        on:openRepair={(e) => (repairTargetId = e.detail)}
    />
</div>

{#if showForm}
    <KasForm onClose={() => (showForm = false)} />
{/if}

{#if historyTarget}
    <dialog class="modal modal-open">
        <div class="modal-box max-w-2xl">
            <h3 class="font-bold text-lg mb-4">Riwayat Versi — {historyTarget.id}</h3>
            <KasVersionTimeline
                versions={historyTarget.versions}
                currentVersionIndex={historyTarget.currentVersionIndex}
                pendingRequest={historyTarget.pendingRequest}
                onSelectVersion={(v) => (selectedVersion = v)}
            />
            {#if selectedVersion && selectedVersion.index > 1}
                <div class="divider">Perubahan pada V{selectedVersion.index}</div>
                <KasVersionDiff
                    versionA={historyTarget.versions[selectedVersion.index - 2]}
                    versionB={selectedVersion}
                />
            {/if}
            <div class="modal-action">
                <button class="btn" on:click={() => { historyTarget = null; selectedVersion = null }}>Tutup</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop" on:submit={() => (historyTarget = null)}><button>close</button></form>
    </dialog>
{/if}
```

- [ ] **Step 5.4: Verify in dev server**

Navigate to `/outlet/akuntansi`. Click "Lihat Versi" on KAS-001. Expected:
- Timeline shows V1 (Original, purple) and V2 (Disetujui, red)
- Click V2 → diff shows `entries` field changed (receiptFile updated)

- [ ] **Step 5.5: Commit**

```bash
git add src/library/components/outlet/akuntansi/KasVersionTimeline.svelte src/library/components/outlet/akuntansi/KasVersionDiff.svelte src/routes/outlet/akuntansi/+page.svelte
git commit -m "feat(akuntansi): add version history timeline and field diff viewer"
```

---

## Task 6: PT User Actions (TDD) & `KasRepairModal.svelte`

**Files:**
- Modify: `src/library/hooks/useKas.ts` (append PT user functions)
- Modify: `src/library/hooks/useKas.test.ts` (append PT tests)
- Create: `src/library/components/outlet/akuntansi/KasRepairModal.svelte`
- Modify: `src/routes/outlet/akuntansi/+page.svelte`

- [ ] **Step 6.1: Write failing tests for PT user actions**

Append to `src/library/hooks/useKas.test.ts`:

```typescript
import { submitRepairRequest, reviseRepairRequest, deleteRepairRequest } from "./useKas"

describe("submitRepairRequest", () => {
    it("sets pendingRequest to pending on a record with no request", () => {
        const record = mockKasRecords.find((r) => r.id === "KAS-001")!
        const proposed = { ...record.versions[record.currentVersionIndex - 1].snapshot }
        submitRepairRequest("KAS-001", proposed)
        expect(record.pendingRequest).not.toBeNull()
        expect(record.pendingRequest?.status).toBe("pending")
    })

    it("does not overwrite an already-pending request", () => {
        const record = mockKasRecords.find((r) => r.id === "KAS-001")!
        const before = record.pendingRequest
        submitRepairRequest("KAS-001", record.versions[0].snapshot)
        expect(record.pendingRequest).toBe(before)
    })
})

describe("reviseRepairRequest", () => {
    it("resets rejected request to pending and increments revisions", () => {
        const record = mockKasRecords.find((r) => r.id === "KAS-003")!
        expect(record.pendingRequest?.status).toBe("rejected")
        reviseRepairRequest("KAS-003", record.versions[0].snapshot)
        expect(record.pendingRequest?.status).toBe("pending")
        expect(record.pendingRequest?.revisions).toBe(1)
        expect(record.pendingRequest?.rejectionReason).toBeNull()
    })
})

describe("deleteRepairRequest", () => {
    it("clears pendingRequest to null", () => {
        const record = mockKasRecords.find((r) => r.id === "KAS-002")!
        expect(record.pendingRequest).not.toBeNull()
        deleteRepairRequest("KAS-002")
        expect(record.pendingRequest).toBeNull()
    })
})
```

- [ ] **Step 6.2: Run tests — expect FAIL**

```bash
npx vitest run src/library/hooks/useKas.test.ts
```

Expected: FAIL with "submitRepairRequest is not a function"

- [ ] **Step 6.3: Append PT user functions to `useKas.ts`**

Append after `createKas` in `src/library/hooks/useKas.ts`:

```typescript
export function submitRepairRequest(kasId: string, proposedSnapshot: KasSnapshot): void {
    const record = mockKasRecords.find((r) => r.id === kasId)
    if (!record || record.pendingRequest?.status === "pending") return

    const $auth = get(auth)
    record.pendingRequest = {
        id: `KR-${Date.now()}`,
        kasId,
        status: "pending",
        proposedSnapshot: { ...proposedSnapshot, totalAmount: computeTotalAmount(proposedSnapshot.entries) },
        submittedBy: $auth.userId,
        submittedAt: new Date().toISOString(),
        rejectionReason: null,
        revisions: 0,
    }
}

export function reviseRepairRequest(kasId: string, proposedSnapshot: KasSnapshot): void {
    const record = mockKasRecords.find((r) => r.id === kasId)
    if (!record?.pendingRequest) return

    record.pendingRequest.proposedSnapshot = { ...proposedSnapshot, totalAmount: computeTotalAmount(proposedSnapshot.entries) }
    record.pendingRequest.status = "pending"
    record.pendingRequest.rejectionReason = null
    record.pendingRequest.revisions += 1
}

export function deleteRepairRequest(kasId: string): void {
    const record = mockKasRecords.find((r) => r.id === kasId)
    if (!record) return
    record.pendingRequest = null
}
```

- [ ] **Step 6.4: Run tests — expect PASS**

```bash
npx vitest run src/library/hooks/useKas.test.ts
```

Expected: PASS (all tests including Task 2 tests)

- [ ] **Step 6.5: Create `KasRepairModal.svelte`**

```svelte
<!-- src/library/components/outlet/akuntansi/KasRepairModal.svelte -->
<script lang="ts">
    import { KAS_PAYMENT_METHODS } from "$lib/mock/kasPaymentMethods"
    import type { KasPaymentMethod } from "$lib/mock/kasPaymentMethods"
    import { mockEmployees } from "$lib/mock/employees"
    import type { KasRecord, KasSnapshot } from "$lib/types/Kas"
    import { submitRepairRequest, reviseRepairRequest, deleteRepairRequest, computeTotalAmount } from "$lib/hooks/useKas"
    import { refreshKas } from "$lib/stores/kas"

    export let record: KasRecord
    export let onClose: () => void

    const pending = record.pendingRequest
    const isRevision = pending?.status === "rejected"
    const prefill: KasSnapshot = isRevision && pending
        ? pending.proposedSnapshot
        : record.versions[record.currentVersionIndex - 1].snapshot

    let type = prefill.type
    let tanggal = prefill.tanggal
    let selectedEmployeeId = prefill.pic.employeeId
    let entries = JSON.parse(JSON.stringify(prefill.entries)) as typeof prefill.entries
    let loading = false
    let error = ""
    let confirmDelete = false

    $: totalAmount = computeTotalAmount(entries)
    $: selectedEmployee = mockEmployees.find((e) => e.id === selectedEmployeeId)

    function formatRupiah(n: number): string {
        return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
    }

    function addEntry() {
        entries = [...entries, { id: "", amount: 0, paymentMethod: "Tunai" as KasPaymentMethod, keterangan: "", receiptFile: null }]
    }

    function removeEntry(i: number) {
        entries = entries.filter((_, idx) => idx !== i)
    }

    function handleReceiptFile(i: number, event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0]
        entries[i].receiptFile = file?.name ?? null
        entries = entries
    }

    function buildProposed(): KasSnapshot {
        return {
            ...prefill,
            type,
            tanggal,
            entries,
            totalAmount,
            pic: { employeeId: selectedEmployeeId, name: selectedEmployee?.name ?? selectedEmployeeId },
        }
    }

    function handleSubmit() {
        if (entries.some((e) => !e.keterangan.trim() || e.amount <= 0)) {
            error = "Lengkapi semua entri"
            return
        }
        loading = true
        error = ""

        const proposed = buildProposed()
        if (isRevision && pending) {
            reviseRepairRequest(record.id, proposed)
        } else {
            submitRepairRequest(record.id, proposed)
        }

        refreshKas()
        onClose()
        loading = false
    }

    function handleDeleteRequest() {
        loading = true
        deleteRepairRequest(record.id)
        refreshKas()
        onClose()
        loading = false
        confirmDelete = false
    }
</script>

<dialog class="modal modal-open">
    <div class="modal-box max-w-2xl">
        <h3 class="font-bold text-lg mb-1">Perbaikan Transaksi — Kas</h3>
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
            <div class="join">
                <button class="join-item btn btn-sm {type === 'masuk' ? 'btn-success' : 'btn-ghost'}" on:click={() => (type = "masuk")}>Kas Masuk</button>
                <button class="join-item btn btn-sm {type === 'keluar' ? 'btn-error' : 'btn-ghost'}" on:click={() => (type = "keluar")}>Kas Keluar</button>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <label class="form-control">
                    <div class="label"><span class="label-text">Tanggal</span></div>
                    <input type="date" class="input input-bordered" bind:value={tanggal} />
                </label>
                <label class="form-control">
                    <div class="label"><span class="label-text">PIC</span></div>
                    <select class="select select-bordered" bind:value={selectedEmployeeId}>
                        {#each mockEmployees as emp}
                            <option value={emp.id}>{emp.name} — {emp.role}</option>
                        {/each}
                    </select>
                </label>
            </div>

            <div>
                <div class="label"><span class="label-text font-semibold">Entri</span></div>
                {#each entries as entry, i}
                    <div class="flex gap-2 mb-3 items-start">
                        <div class="flex flex-col gap-1 flex-1">
                            <div class="flex gap-2">
                                <input class="input input-bordered input-sm w-40" type="number" min="0" bind:value={entry.amount} />
                                <select class="select select-bordered select-sm flex-1" bind:value={entry.paymentMethod}>
                                    {#each KAS_PAYMENT_METHODS as method}
                                        <option value={method}>{method}</option>
                                    {/each}
                                </select>
                            </div>
                            <input class="input input-bordered input-sm w-full" bind:value={entry.keterangan} placeholder="Keterangan" />
                            <div class="flex items-center gap-2">
                                <input type="file" accept="image/*" class="file-input file-input-bordered file-input-sm flex-1" on:change={(e) => handleReceiptFile(i, e)} />
                                {#if entry.receiptFile}
                                    <span class="text-xs opacity-60 truncate max-w-32">{entry.receiptFile}</span>
                                {/if}
                            </div>
                        </div>
                        {#if entries.length > 1}
                            <button class="btn btn-ghost btn-xs text-error mt-1" on:click={() => removeEntry(i)}>✕</button>
                        {/if}
                    </div>
                {/each}
                <button class="btn btn-ghost btn-xs mt-1" on:click={addEntry}>+ Tambah Lagi</button>
                <div class="text-sm mt-1 opacity-70">Total: <strong>{formatRupiah(totalAmount)}</strong></div>
            </div>
        </div>

        <div class="modal-action flex justify-between">
            <div>
                {#if pending && (pending.status === "pending" || pending.status === "rejected")}
                    {#if confirmDelete}
                        <span class="text-sm opacity-60 mr-2">Yakin hapus?</span>
                        <button class="btn btn-error btn-sm" disabled={loading} on:click={handleDeleteRequest}>Hapus</button>
                        <button class="btn btn-ghost btn-sm" on:click={() => (confirmDelete = false)}>Batal</button>
                    {:else}
                        <button class="btn btn-ghost btn-sm text-error" on:click={() => (confirmDelete = true)}>Hapus Permintaan</button>
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

- [ ] **Step 6.6: Wire `KasRepairModal` into `+page.svelte`**

Replace `src/routes/outlet/akuntansi/+page.svelte` with the complete version below (adds `KasRepairModal` import, `repairTarget` state, `openRepair` function, and modal markup):

```svelte
<!-- src/routes/outlet/akuntansi/+page.svelte -->
<script lang="ts">
    import { kasRecords, refreshKas } from "$lib/stores/kas"
    import { mockKasRecords } from "$lib/mock/kas"
    import useDefault from "$lib/validator/useDefault"
    import KasForm from "$lib/components/outlet/akuntansi/KasForm.svelte"
    import KasLedgerTable from "$lib/components/outlet/akuntansi/KasLedgerTable.svelte"
    import KasVersionTimeline from "$lib/components/outlet/akuntansi/KasVersionTimeline.svelte"
    import KasVersionDiff from "$lib/components/outlet/akuntansi/KasVersionDiff.svelte"
    import KasRepairModal from "$lib/components/outlet/akuntansi/KasRepairModal.svelte"
    import type { KasRecord, KasVersion } from "$lib/types/Kas"

    let filterType: "all" | "masuk" | "keluar" = "all"
    let filterFrom = useDefault.firstDay
    let filterTo = useDefault.currentDay
    let showForm = false

    let historyTarget: KasRecord | null = null
    let selectedVersion: KasVersion | null = null
    let repairTarget: KasRecord | null = null

    $: displayRecords = $kasRecords
        .filter((r) => !r.isDeleted)
        .filter((r) => filterType === "all" || r.versions[r.currentVersionIndex - 1].snapshot.type === filterType)
        .filter((r) => {
            const t = r.versions[r.currentVersionIndex - 1].snapshot.tanggal
            if (filterFrom && t < filterFrom) return false
            if (filterTo && t > filterTo) return false
            return true
        })
        .sort((a, b) => {
            const tA = a.versions[a.currentVersionIndex - 1].snapshot.tanggal
            const tB = b.versions[b.currentVersionIndex - 1].snapshot.tanggal
            if (tA !== tB) return tA.localeCompare(tB)
            return a.versions[0].createdAt.localeCompare(b.versions[0].createdAt)
        })

    function openHistory(id: string) {
        historyTarget = mockKasRecords.find((r) => r.id === id) ?? null
        selectedVersion = null
    }

    function openRepair(id: string) {
        const record = mockKasRecords.find((r) => r.id === id)
        if (!record) return
        if (!record.pendingRequest || record.pendingRequest.status === "rejected") {
            repairTarget = record
        }
    }
</script>

<div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Akuntansi — Buku Kas</h1>
        <button class="btn btn-primary" on:click={() => (showForm = true)}>+ Tambah</button>
    </div>

    <div class="flex gap-3 items-center mb-4 flex-wrap">
        <div class="join">
            <button class="join-item btn btn-sm {filterType === 'all' ? 'btn-active' : ''}" on:click={() => (filterType = "all")}>Semua</button>
            <button class="join-item btn btn-sm {filterType === 'masuk' ? 'btn-success' : ''}" on:click={() => (filterType = "masuk")}>Kas Masuk</button>
            <button class="join-item btn btn-sm {filterType === 'keluar' ? 'btn-error' : ''}" on:click={() => (filterType = "keluar")}>Kas Keluar</button>
        </div>
        <input type="date" class="input input-bordered input-sm" bind:value={filterFrom} />
        <span class="opacity-50 text-sm">s/d</span>
        <input type="date" class="input input-bordered input-sm" bind:value={filterTo} />
    </div>

    <KasLedgerTable
        records={displayRecords}
        on:openHistory={(e) => openHistory(e.detail)}
        on:openRepair={(e) => openRepair(e.detail)}
    />
</div>

{#if showForm}
    <KasForm onClose={() => (showForm = false)} />
{/if}

{#if historyTarget}
    <dialog class="modal modal-open">
        <div class="modal-box max-w-2xl">
            <h3 class="font-bold text-lg mb-4">Riwayat Versi — {historyTarget.id}</h3>
            <KasVersionTimeline
                versions={historyTarget.versions}
                currentVersionIndex={historyTarget.currentVersionIndex}
                pendingRequest={historyTarget.pendingRequest}
                onSelectVersion={(v) => (selectedVersion = v)}
            />
            {#if selectedVersion && selectedVersion.index > 1}
                <div class="divider">Perubahan pada V{selectedVersion.index}</div>
                <KasVersionDiff
                    versionA={historyTarget.versions[selectedVersion.index - 2]}
                    versionB={selectedVersion}
                />
            {/if}
            <div class="modal-action">
                <button class="btn" on:click={() => { historyTarget = null; selectedVersion = null }}>Tutup</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop" on:submit={() => (historyTarget = null)}><button>close</button></form>
    </dialog>
{/if}

{#if repairTarget}
    <KasRepairModal
        record={repairTarget}
        onClose={() => { repairTarget = null; refreshKas() }}
    />
{/if}
```

- [ ] **Step 6.7: Verify in dev server**

```bash
npm run dev
```

- KAS-001 (no pending): click "Perbaikan" → form opens, pre-filled with current snapshot → change amount → "Submit Request" → row shows "⏳ Menunggu"
- KAS-003 (rejected): click "Revisi" → yellow banner shows rejection reason → form pre-filled with proposed snapshot → button labelled "Kirim Ulang"

- [ ] **Step 6.8: Commit**

```bash
git add src/library/hooks/useKas.ts src/library/hooks/useKas.test.ts src/library/components/outlet/akuntansi/KasRepairModal.svelte src/routes/outlet/akuntansi/+page.svelte
git commit -m "feat(akuntansi): implement PT user request, revision, and delete flow"
```

---

## Task 7: Admin PT Queue & Diff View (no actions yet)

**Files:**
- Create: `src/library/components/outlet/akuntansi/AdminKasQueue.svelte`
- Create: `src/library/components/outlet/akuntansi/AdminKasDiffView.svelte`
- Create: `src/routes/outlet/akuntansi/repair/+page.svelte`

- [ ] **Step 7.1: Create `AdminKasQueue.svelte`**

```svelte
<!-- src/library/components/outlet/akuntansi/AdminKasQueue.svelte -->
<script lang="ts">
    import type { KasRecord } from "$lib/types/Kas"
    import { mockKasRecords } from "$lib/mock/kas"

    export let onSelect: (record: KasRecord) => void

    $: queue = mockKasRecords.filter((r) => r.pendingRequest?.status === "pending" && !r.isDeleted)

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })
    }

    function formatRupiah(n: number): string {
        return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
    }
</script>

<div class="flex flex-col gap-3">
    <h2 class="text-xl font-bold">Antrian Perbaikan — Kas</h2>

    {#if queue.length === 0}
        <div class="py-16 text-center opacity-40 text-sm">Tidak ada permintaan yang menunggu persetujuan</div>
    {:else}
        <div class="flex flex-col gap-2">
            {#each queue as record}
                {@const req = record.pendingRequest!}
                {@const snap = record.versions[record.currentVersionIndex - 1].snapshot}
                <button
                    class="flex items-center gap-4 p-4 rounded-xl border border-base-300 hover:bg-base-200 text-left transition-colors w-full"
                    on:click={() => onSelect(record)}
                >
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-semibold">{record.id}</span>
                            <span class="badge badge-sm {snap.type === 'masuk' ? 'badge-success' : 'badge-error'}">
                                {snap.type === "masuk" ? "Kas Masuk" : "Kas Keluar"}
                            </span>
                        </div>
                        <div class="text-sm opacity-60 mt-0.5">PIC: {snap.pic.name} · Diajukan: {formatDate(req.submittedAt)}</div>
                        <div class="text-sm opacity-60">Total diusulkan: {formatRupiah(req.proposedSnapshot.totalAmount)}</div>
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

- [ ] **Step 7.2: Create `AdminKasDiffView.svelte`**

```svelte
<!-- src/library/components/outlet/akuntansi/AdminKasDiffView.svelte -->
<script lang="ts">
    import type { KasRecord, KasVersion } from "$lib/types/Kas"
    import KasVersionDiff from "./KasVersionDiff.svelte"

    export let record: KasRecord
    export let loading = false
    export let onAction: (action: "approve" | "reject" | "delete-request" | "delete-record", reason?: string) => void

    const currentVersion = record.versions[record.currentVersionIndex - 1]
    const req = record.pendingRequest!

    const proposedVersion: KasVersion = {
        index: record.currentVersionIndex + 1,
        type: "approved",
        snapshot: req.proposedSnapshot,
        changedFields: [],
        createdBy: req.submittedBy,
        createdAt: req.submittedAt,
        requestId: req.id,
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
                Diajukan: {req.submittedBy} · V{record.currentVersionIndex} → V{record.currentVersionIndex + 1}
                {#if req.revisions > 0} · Revisi ke-{req.revisions}{/if}
            </p>
        </div>
        <div class="flex flex-wrap gap-2">
            <button class="btn btn-success btn-sm" disabled={loading} on:click={() => onAction("approve")}>✓ Setujui</button>
            <button class="btn btn-warning btn-sm" disabled={loading} on:click={() => (showRejectInput = !showRejectInput)}>✗ Tolak</button>
            <button class="btn btn-ghost btn-sm" disabled={loading} on:click={() => onAction("delete-request")}>Hapus Permintaan</button>
            {#if confirmDeleteRecord}
                <button class="btn btn-error btn-sm" disabled={loading} on:click={() => onAction("delete-record")}>Yakin Hapus Record?</button>
                <button class="btn btn-ghost btn-sm" on:click={() => (confirmDeleteRecord = false)}>Batal</button>
            {:else}
                <button class="btn btn-ghost btn-sm text-error" disabled={loading} on:click={() => (confirmDeleteRecord = true)}>Hapus Record</button>
            {/if}
        </div>
    </div>

    {#if showRejectInput}
        <div class="flex gap-2 items-end">
            <label class="form-control flex-1">
                <div class="label"><span class="label-text">Alasan penolakan</span></div>
                <input class="input input-bordered" bind:value={rejectionReason} placeholder="Jelaskan alasan penolakan..." />
            </label>
            <button class="btn btn-error" disabled={!rejectionReason.trim() || loading} on:click={submitReject}>Kirim Penolakan</button>
        </div>
    {/if}

    <div class="divider">Perbandingan Perubahan</div>
    <KasVersionDiff versionA={currentVersion} versionB={proposedVersion} />
</div>
```

- [ ] **Step 7.3: Create admin repair page (queue only — actions wired in Task 8)**

```svelte
<!-- src/routes/outlet/akuntansi/repair/+page.svelte -->
<script lang="ts">
    import AdminKasQueue from "$lib/components/outlet/akuntansi/AdminKasQueue.svelte"
    import AdminKasDiffView from "$lib/components/outlet/akuntansi/AdminKasDiffView.svelte"
    import type { KasRecord } from "$lib/types/Kas"

    let selected: KasRecord | null = null
</script>

<div class="p-6 max-w-5xl mx-auto">
    {#if selected}
        <button class="btn btn-ghost btn-sm mb-4" on:click={() => (selected = null)}>← Kembali</button>
        <AdminKasDiffView record={selected} onAction={() => {}} />
    {:else}
        <AdminKasQueue onSelect={(r) => (selected = r)} />
    {/if}
</div>
```

- [ ] **Step 7.4: Verify in dev server**

Navigate to `/outlet/akuntansi/repair`. Expected:
- KAS-002 appears in queue (pending PT) with "Kas Keluar" badge
- Click KAS-002 → diff view shows amount 250.000 → 270.000 and keterangan change
- All action buttons visible (Setujui, Tolak, Hapus Permintaan, Hapus Record) — not yet functional

- [ ] **Step 7.5: Commit**

```bash
git add src/library/components/outlet/akuntansi/AdminKasQueue.svelte src/library/components/outlet/akuntansi/AdminKasDiffView.svelte src/routes/outlet/akuntansi/repair/+page.svelte
git commit -m "feat(akuntansi): add admin repair queue and diff view"
```

---

## Task 8: Admin PT Actions (TDD) & Wire Repair Page

**Files:**
- Modify: `src/library/hooks/useKas.ts` (append admin functions)
- Modify: `src/library/hooks/useKas.test.ts` (append admin tests)
- Modify: `src/routes/outlet/akuntansi/repair/+page.svelte`

- [ ] **Step 8.1: Write failing tests for admin actions**

Append to `src/library/hooks/useKas.test.ts`:

```typescript
import { approveRepairRequest, rejectRepairRequest, deleteRecord } from "./useKas"

describe("approveRepairRequest", () => {
    it("creates a new approved version and increments currentVersionIndex", () => {
        // re-submit KAS-002 request (was deleted in deleteRepairRequest test above)
        const record = mockKasRecords.find((r) => r.id === "KAS-002")!
        submitRepairRequest("KAS-002", record.versions[0].snapshot)

        const beforeVersionCount = record.versions.length
        approveRepairRequest("KAS-002")
        expect(record.versions.length).toBe(beforeVersionCount + 1)
        expect(record.versions[record.versions.length - 1].type).toBe("approved")
        expect(record.currentVersionIndex).toBe(beforeVersionCount + 1)
    })

    it("clears pendingRequest after approval", () => {
        const record = mockKasRecords.find((r) => r.id === "KAS-002")!
        expect(record.pendingRequest).toBeNull()
    })
})

describe("rejectRepairRequest", () => {
    it("sets status to rejected with the provided reason", () => {
        const record = mockKasRecords.find((r) => r.id === "KAS-001")!
        submitRepairRequest("KAS-001", record.versions[0].snapshot)
        rejectRepairRequest("KAS-001", "Data tidak valid")
        expect(record.pendingRequest?.status).toBe("rejected")
        expect(record.pendingRequest?.rejectionReason).toBe("Data tidak valid")
    })
})

describe("deleteRecord", () => {
    it("marks record as isDeleted and clears pendingRequest", () => {
        const record = mockKasRecords.find((r) => r.id === "KAS-001")!
        deleteRecord("KAS-001")
        expect(record.isDeleted).toBe(true)
        expect(record.pendingRequest).toBeNull()
    })
})
```

- [ ] **Step 8.2: Run tests — expect FAIL**

```bash
npx vitest run src/library/hooks/useKas.test.ts
```

Expected: FAIL with "approveRepairRequest is not a function"

- [ ] **Step 8.3: Append admin functions to `useKas.ts`**

Append after `deleteRepairRequest` in `src/library/hooks/useKas.ts`:

```typescript
export function approveRepairRequest(kasId: string): void {
    const $auth = get(auth)
    const record = mockKasRecords.find((r) => r.id === kasId)
    if (!record?.pendingRequest) return

    const req = record.pendingRequest
    const currentSnapshot = record.versions[record.currentVersionIndex - 1].snapshot

    record.versions.push({
        index: record.currentVersionIndex + 1,
        type: "approved",
        snapshot: req.proposedSnapshot,
        changedFields: getChangedFields(
            currentSnapshot as unknown as Record<string, unknown>,
            req.proposedSnapshot as unknown as Record<string, unknown>
        ),
        createdBy: $auth.userId,
        createdAt: new Date().toISOString(),
        requestId: req.id,
    })
    record.currentVersionIndex += 1
    record.pendingRequest = null
    req.status = "deleted"
}

export function rejectRepairRequest(kasId: string, reason: string): void {
    const record = mockKasRecords.find((r) => r.id === kasId)
    if (!record?.pendingRequest) return
    record.pendingRequest.status = "rejected"
    record.pendingRequest.rejectionReason = reason
}

export function deleteRecord(kasId: string): void {
    const record = mockKasRecords.find((r) => r.id === kasId)
    if (!record) return
    record.isDeleted = true
    record.pendingRequest = null
}
```

- [ ] **Step 8.4: Run tests — expect PASS**

```bash
npx vitest run src/library/hooks/useKas.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 8.5: Replace repair page with fully-wired version**

```svelte
<!-- src/routes/outlet/akuntansi/repair/+page.svelte -->
<script lang="ts">
    import AdminKasQueue from "$lib/components/outlet/akuntansi/AdminKasQueue.svelte"
    import AdminKasDiffView from "$lib/components/outlet/akuntansi/AdminKasDiffView.svelte"
    import { approveRepairRequest, rejectRepairRequest, deleteRepairRequest, deleteRecord } from "$lib/hooks/useKas"
    import { refreshKas } from "$lib/stores/kas"
    import type { KasRecord } from "$lib/types/Kas"

    let selected: KasRecord | null = null
    let actionLoading = false
    let actionError = ""

    function handleAction(action: "approve" | "reject" | "delete-request" | "delete-record", reason?: string) {
        if (!selected) return
        actionLoading = true
        actionError = ""

        if (action === "approve") {
            approveRepairRequest(selected.id)
        } else if (action === "reject" && reason) {
            rejectRepairRequest(selected.id, reason)
        } else if (action === "delete-request") {
            deleteRepairRequest(selected.id)
        } else if (action === "delete-record") {
            deleteRecord(selected.id)
        }

        refreshKas()
        selected = null
        actionLoading = false
    }
</script>

<div class="p-6 max-w-5xl mx-auto">
    {#if actionError}
        <div class="alert alert-error text-sm mb-4">{actionError}</div>
    {/if}
    {#if selected}
        <button class="btn btn-ghost btn-sm mb-4" on:click={() => { selected = null; actionError = "" }}>← Kembali</button>
        <AdminKasDiffView record={selected} loading={actionLoading} onAction={handleAction} />
    {:else}
        <AdminKasQueue onSelect={(r) => { selected = r; actionError = "" }} />
    {/if}
</div>
```

- [ ] **Step 8.6: Commit**

```bash
git add src/library/hooks/useKas.ts src/library/hooks/useKas.test.ts src/routes/outlet/akuntansi/repair/+page.svelte
git commit -m "feat(akuntansi): implement admin approve, reject, and delete for PT"
```

---

## Task 9: End-to-End Verification & Final Commit

No new files. Validates the complete feature flow.

- [ ] **Step 9.1: Run all tests**

```bash
npx vitest run src/library/hooks/useKas.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 9.2: Verify creation flow**

```bash
npm run dev
```

1. Navigate to `/outlet/akuntansi`
2. Click "+ Tambah" → toggle to "Kas Keluar"
3. Set tanggal to yesterday (backdating test)
4. Select "Dewi Kusuma" as PIC
5. Fill entry: 120.000 / BCA Transfer / "Beli sabun cuci piring" → click "Tambah Lagi"
6. Fill second entry: 35.000 / Tunai / "Beli kantong plastik" → upload a test image file
7. Click "Simpan"
8. Expected: new row appears at correct date position, Saldo recalculates, receipt filename shown in table row data

- [ ] **Step 9.3: Verify PT rejection → revision → approval loop**

1. On the new record, click "Perbaikan" → change first entry amount to 130.000 → "Submit Request" → row shows "⏳ Menunggu"
2. "Lihat Versi" on the same record → timeline shows ⏳ pending indicator
3. Navigate to `/outlet/akuntansi/repair` → new record appears in queue
4. Click it → diff shows 120.000 → 130.000 in entries
5. Click "Tolak" → enter "Jumlah tidak sesuai struk" → "Kirim Penolakan"
6. Back to main page → record shows "Revisi" button
7. Click "Revisi" → yellow banner "Jumlah tidak sesuai struk" → form pre-filled with 130.000 → change to 125.000 → "Kirim Ulang"
8. Repair queue → record shows "Revisi ke-1" → "Setujui"
9. Main page → "Lihat Versi" → V2 Disetujui with `entries` in changedFields, Saldo updated

- [ ] **Step 9.4: Verify delete flows**

1. Submit a PT on KAS-001 from main page
2. In repair queue → select KAS-001 → "Hapus Permintaan" → queue removes it, main page shows "Perbaikan" button again
3. Submit another PT on KAS-001 → in repair queue → "Hapus Record" → confirm → KAS-001 disappears from main ledger (`isDeleted: true`)

- [ ] **Step 9.5: Verify filter bar**

1. Toggle "Kas Masuk" → only masuk records shown, Saldo starts from 0 and only counts masuk amounts
2. Toggle "Kas Keluar" → only keluar records
3. Set date range to narrow window → records outside range hidden

- [ ] **Step 9.6: Final commit**

```bash
git add .
git commit -m "feat(akuntansi): complete Kas Masuk/Keluar — PT approval loop and end-to-end verified"
```

---

## Self-Review

**Spec coverage:**
- ✓ `KasEntry` with amount, paymentMethod dropdown, keterangan, receiptFile (filename) — Task 1, 3
- ✓ `KAS_PAYMENT_METHODS` constant with 7 methods — Task 1
- ✓ `KasSnapshot` with type discriminator, pic, tanggal (backdatable), totalAmount — Task 1
- ✓ Multi-entry per record via "Tambah Lagi" — Task 3 (`KasForm`)
- ✓ PIC chooser from `mockEmployees` dropdown — Task 3
- ✓ `createdBy` auto-set from `$auth` — Task 2 (`createKas`)
- ✓ Standard cash book ledger: Saldo running balance, sorted by tanggal — Task 4 (`KasLedgerTable`)
- ✓ Filter by type (All/Masuk/Keluar) and date range — Task 4 (`+page.svelte`)
- ✓ Version history timeline (Original/Approved) — Task 5
- ✓ Side-by-side field diff — Task 5
- ✓ PT only (no PTI): `KasVersion.type` = `"original" | "approved"` only — Task 1
- ✓ PT submit → pending lock ("⏳ Menunggu") — Task 6
- ✓ PT reject with reason → "Revisi" button + yellow banner — Task 6, 8
- ✓ PT revision increments `revisions`, resets to pending — Task 6
- ✓ PT "Hapus Permintaan" (user and admin sides) — Task 6, 8
- ✓ PT admin approve → new `"approved"` version + `getChangedFields` — Task 8
- ✓ PT admin delete record → `isDeleted: true` — Task 8
- ✓ All roles can create (no role gating on form) — Task 3
- ✓ receipt file stored as filename string only — Task 3 (file input → `.name` only)
- ✓ Saldo computed on read, not stored — Task 4 (`KasLedgerTable` reactive `rows` block)
- ✓ Seed data: 3 records covering approved PT, pending PT, rejected PT scenarios — Task 1
