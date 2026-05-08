# Item Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an inter-outlet stock transfer feature where Branch A creates a transfer to one or more branches, each branch independently accepts (with confirmed quantities) or rejects it, stock moves only on acceptance, with a scheduler for future-dated transfers, a stock movement log, and PT (Perbaikan Transaksi) support on both transfer and acceptance records.

**Architecture:** Two separate versioned record types — `TransferRecord` (sender side) and `TransferAcceptance` (per receiving branch) — following the same snapshot pattern as Item Masuk/Keluar/Kas. A `mockOutletStock` map tracks per-outlet stock. Stock moves at acceptance time. PT on `TransferRecord` is blocked once any acceptance exists; PT on `TransferAcceptance` is always available post-response.

**Tech Stack:** SvelteKit · TypeScript · TailwindCSS · DaisyUI · Svelte Stores · Vitest (unit tests for all hook logic)

> **Note:** `$lib` resolves to `src/library/`. Ensure `svelte.config.js` has `kit: { alias: { $lib: 'src/library' } }`.
>
> **Prerequisites:** Working SvelteKit project with TailwindCSS + DaisyUI, and `src/library/stores/auth.ts` exporting a writable `auth` store with shape `{ userId: string; outletId: string; userName: string; role: string }`. `src/library/utils/repairDiff.ts` and `src/library/validator/useDefault.ts` must exist (created in Akuntansi plan — create them here if absent).

---

## File Map

**Created:**
- `src/library/types/Transfer.ts` — all Transfer TypeScript interfaces
- `src/library/mock/transfer.ts` — seed records + `mockOutletStock` map
- `src/library/hooks/useTransfer.ts` — all transfer operations
- `src/library/hooks/useTransfer.test.ts` — Vitest unit tests
- `src/library/stores/transfer.ts` — reactive stores + `refreshTransfer()`
- `src/library/components/outlet/transfer/TransferForm.svelte` — create transfer modal
- `src/library/components/outlet/transfer/TransferAcceptModal.svelte` — accept/reject + detail modal
- `src/library/components/outlet/transfer/TransferRepairModal.svelte` — PT repair modal (shared)
- `src/routes/outlet/transfer/+page.svelte` — main page (Dikirim/Diterima tabs + movement log)
- `src/routes/outlet/transfer/repair/+page.svelte` — admin PT queue

**Created if not already present:**
- `src/library/utils/repairDiff.ts` — generic `getChangedFields()` utility
- `src/library/validator/useDefault.ts` — date boundary singleton

---

## Task 1: Types & Mock Data

**Files:**
- Create: `src/library/types/Transfer.ts`
- Create: `src/library/mock/transfer.ts`
- Create: `src/library/utils/repairDiff.ts` *(skip if already exists)*
- Create: `src/library/validator/useDefault.ts` *(skip if already exists)*

- [ ] **Step 1.1: Create `Transfer.ts`**

```typescript
// src/library/types/Transfer.ts

export interface TransferItem {
    productId: string
    qty: number
}

export interface TransferDestination {
    outletId: string
    items: TransferItem[]
}

export interface TransferSnapshot {
    id: string
    fromOutletId: string
    createdBy: string
    tanggal: string
    destinations: TransferDestination[]
    keterangan: string
    returnable: boolean
    status: "scheduled" | "pending" | "completed"
}

export interface TransferVersion {
    index: number
    type: "original" | "approved"
    snapshot: TransferSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface TransferRepairRequest {
    id: string
    transferId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: TransferSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export interface TransferRecord {
    id: string
    currentVersionIndex: number
    versions: TransferVersion[]
    pendingRequest: TransferRepairRequest | null
    isDeleted: boolean
}

export interface AcceptedItem {
    productId: string
    qtySent: number
    qtyReceived: number
}

export interface TransferAcceptanceSnapshot {
    id: string
    transferId: string
    receivingOutletId: string
    respondedBy: string
    items: AcceptedItem[]
    status: "accepted" | "rejected"
}

export interface TransferAcceptanceVersion {
    index: number
    type: "original" | "approved"
    snapshot: TransferAcceptanceSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface TransferAcceptanceRepairRequest {
    id: string
    acceptanceId: string
    status: "pending" | "rejected" | "deleted"
    proposedSnapshot: TransferAcceptanceSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export interface TransferAcceptance {
    id: string
    transferId: string
    receivingOutletId: string
    status: "awaiting" | "accepted" | "rejected"
    currentVersionIndex: number
    versions: TransferAcceptanceVersion[]
    pendingRequest: TransferAcceptanceRepairRequest | null
    isDeleted: boolean
}

export interface StockMovement {
    id: string
    transferId: string
    acceptanceId: string
    productId: string
    fromOutletId: string
    toOutletId: string
    qty: number
    type: "transfer" | "return"
    createdAt: string
}

export interface CreateTransferPayload {
    tanggal: string
    destinations: TransferDestination[]
    keterangan: string
    returnable: boolean
}
```

- [ ] **Step 1.2: Create `repairDiff.ts` (skip if already exists)**

```typescript
// src/library/utils/repairDiff.ts
function getChangedFields(original: Record<string, unknown>, proposed: Record<string, unknown>): string[] {
    return Object.keys(proposed).filter(
        (key) => JSON.stringify(original[key]) !== JSON.stringify(proposed[key])
    )
}

export { getChangedFields }
```

- [ ] **Step 1.3: Create `useDefault.ts` (skip if already exists)**

```typescript
// src/library/validator/useDefault.ts
function toYMD(d: Date): string {
    return d.toISOString().slice(0, 10)
}

const now = new Date()
const firstDay = toYMD(new Date(now.getFullYear(), now.getMonth(), 1))
const lastDay = toYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0))
const currentDay = toYMD(now)

const useDefault = { firstDay, lastDay, currentDay }
export default useDefault
```

- [ ] **Step 1.4: Create `mock/transfer.ts` with seed data**

```typescript
// src/library/mock/transfer.ts
import type { TransferRecord, TransferAcceptance, StockMovement } from "$lib/types/Transfer"

// Mutable per-outlet stock map used by useTransfer.ts
export const mockOutletStock: Record<string, Record<string, number>> = {
    "outlet-1": { "item-001": 100, "item-002": 50, "item-003": 75 },
    "outlet-2": { "item-001": 20,  "item-002": 30, "item-003": 10 },
    "outlet-3": { "item-001": 15,  "item-002": 25, "item-003": 40 },
}

// TRF-001: completed, outlet-1 → outlet-2, partial accept (returnable=true), acceptance has approved PT
const trf001Snapshot = {
    id: "snap-trf001-v1",
    fromOutletId: "outlet-1",
    createdBy: "user-1",
    tanggal: "2026-05-01",
    destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }, { productId: "item-002", qty: 5 }] }],
    keterangan: "Restock cabang 2",
    returnable: true,
    status: "completed" as const,
}

const acc001SnapV1 = {
    id: "snap-acc001-v1",
    transferId: "TRF-001",
    receivingOutletId: "outlet-2",
    respondedBy: "user-2",
    items: [{ productId: "item-001", qtySent: 10, qtyReceived: 8 }, { productId: "item-002", qtySent: 5, qtyReceived: 5 }],
    status: "accepted" as const,
}
const acc001SnapV2 = {
    id: "snap-acc001-v2",
    transferId: "TRF-001",
    receivingOutletId: "outlet-2",
    respondedBy: "user-2",
    items: [{ productId: "item-001", qtySent: 10, qtyReceived: 9 }, { productId: "item-002", qtySent: 5, qtyReceived: 5 }],
    status: "accepted" as const,
}

export const mockTransferRecords: TransferRecord[] = [
    {
        id: "TRF-001",
        currentVersionIndex: 1,
        versions: [{ index: 1, type: "original", snapshot: trf001Snapshot, changedFields: [], createdBy: "user-1", createdAt: "2026-05-01T08:00:00.000Z", requestId: null }],
        pendingRequest: null,
        isDeleted: false,
    },
    // TRF-002: pending, outlet-1 → outlet-2 + outlet-3; outlet-2 accepted, outlet-3 awaiting
    {
        id: "TRF-002",
        currentVersionIndex: 1,
        versions: [{
            index: 1, type: "original",
            snapshot: {
                id: "snap-trf002-v1", fromOutletId: "outlet-1", createdBy: "user-1",
                tanggal: "2026-05-06",
                destinations: [
                    { outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] },
                    { outletId: "outlet-3", items: [{ productId: "item-002", qty: 8 }] },
                ],
                keterangan: "Transfer multi-cabang", returnable: false, status: "pending" as const,
            },
            changedFields: [], createdBy: "user-1", createdAt: "2026-05-06T09:00:00.000Z", requestId: null,
        }],
        pendingRequest: null,
        isDeleted: false,
    },
    // TRF-003: scheduled (future date), outlet-1 → outlet-2, no acceptances
    {
        id: "TRF-003",
        currentVersionIndex: 1,
        versions: [{
            index: 1, type: "original",
            snapshot: {
                id: "snap-trf003-v1", fromOutletId: "outlet-1", createdBy: "user-1",
                tanggal: "2099-12-31",
                destinations: [{ outletId: "outlet-2", items: [{ productId: "item-003", qty: 20 }] }],
                keterangan: "Transfer terjadwal", returnable: true, status: "scheduled" as const,
            },
            changedFields: [], createdBy: "user-1", createdAt: "2026-05-07T10:00:00.000Z", requestId: null,
        }],
        pendingRequest: null,
        isDeleted: false,
    },
    // TRF-004: completed, outlet-2 → outlet-1, outlet-1 rejected, acceptance has rejected PT request
    {
        id: "TRF-004",
        currentVersionIndex: 1,
        versions: [{
            index: 1, type: "original",
            snapshot: {
                id: "snap-trf004-v1", fromOutletId: "outlet-2", createdBy: "user-2",
                tanggal: "2026-05-05",
                destinations: [{ outletId: "outlet-1", items: [{ productId: "item-002", qty: 15 }] }],
                keterangan: "Return stok", returnable: false, status: "completed" as const,
            },
            changedFields: [], createdBy: "user-2", createdAt: "2026-05-05T11:00:00.000Z", requestId: null,
        }],
        pendingRequest: null,
        isDeleted: false,
    },
]

export const mockTransferAcceptances: TransferAcceptance[] = [
    // TRF-001 acceptance — approved PT (V2 has more qtyReceived)
    {
        id: "ACC-001",
        transferId: "TRF-001",
        receivingOutletId: "outlet-2",
        status: "accepted",
        currentVersionIndex: 2,
        versions: [
            { index: 1, type: "original", snapshot: acc001SnapV1, changedFields: [], createdBy: "user-2", createdAt: "2026-05-01T10:00:00.000Z", requestId: null },
            { index: 2, type: "approved", snapshot: acc001SnapV2, changedFields: ["items"], createdBy: "user-admin", createdAt: "2026-05-02T09:00:00.000Z", requestId: "PT-ACC-001" },
        ],
        pendingRequest: null,
        isDeleted: false,
    },
    // TRF-002 acceptance from outlet-2 — accepted full qty
    {
        id: "ACC-002",
        transferId: "TRF-002",
        receivingOutletId: "outlet-2",
        status: "accepted",
        currentVersionIndex: 1,
        versions: [{
            index: 1, type: "original",
            snapshot: { id: "snap-acc002-v1", transferId: "TRF-002", receivingOutletId: "outlet-2", respondedBy: "user-2", items: [{ productId: "item-001", qtySent: 5, qtyReceived: 5 }], status: "accepted" as const },
            changedFields: [], createdBy: "user-2", createdAt: "2026-05-06T14:00:00.000Z", requestId: null,
        }],
        pendingRequest: null,
        isDeleted: false,
    },
    // TRF-002 acceptance from outlet-3 — awaiting (no versions yet, placeholder with empty versions)
    {
        id: "ACC-003",
        transferId: "TRF-002",
        receivingOutletId: "outlet-3",
        status: "awaiting",
        currentVersionIndex: 0,
        versions: [],
        pendingRequest: null,
        isDeleted: false,
    },
    // TRF-004 acceptance — rejected, has a rejected PT request (revision scenario)
    {
        id: "ACC-004",
        transferId: "TRF-004",
        receivingOutletId: "outlet-1",
        status: "rejected",
        currentVersionIndex: 1,
        versions: [{
            index: 1, type: "original",
            snapshot: { id: "snap-acc004-v1", transferId: "TRF-004", receivingOutletId: "outlet-1", respondedBy: "user-1", items: [], status: "rejected" as const },
            changedFields: [], createdBy: "user-1", createdAt: "2026-05-05T15:00:00.000Z", requestId: null,
        }],
        pendingRequest: {
            id: "PT-ACC-004",
            acceptanceId: "ACC-004",
            status: "rejected",
            proposedSnapshot: { id: "snap-acc004-proposed", transferId: "TRF-004", receivingOutletId: "outlet-1", respondedBy: "user-1", items: [{ productId: "item-002", qtySent: 15, qtyReceived: 10 }], status: "accepted" as const },
            submittedBy: "user-1",
            submittedAt: "2026-05-06T08:00:00.000Z",
            rejectionReason: "Data penerimaan tidak sesuai bukti",
            revisions: 0,
        },
        isDeleted: false,
    },
]

export const mockStockMovements: StockMovement[] = [
    { id: "MOV-001", transferId: "TRF-001", acceptanceId: "ACC-001", productId: "item-001", fromOutletId: "outlet-1", toOutletId: "outlet-2", qty: 8, type: "transfer", createdAt: "2026-05-01T10:00:00.000Z" },
    { id: "MOV-002", transferId: "TRF-001", acceptanceId: "ACC-001", productId: "item-002", fromOutletId: "outlet-1", toOutletId: "outlet-2", qty: 5, type: "transfer", createdAt: "2026-05-01T10:00:00.000Z" },
    { id: "MOV-003", transferId: "TRF-002", acceptanceId: "ACC-002", productId: "item-001", fromOutletId: "outlet-1", toOutletId: "outlet-2", qty: 5, type: "transfer", createdAt: "2026-05-06T14:00:00.000Z" },
]
```

- [ ] **Step 1.5: Commit**

```bash
git add src/library/types/Transfer.ts src/library/mock/transfer.ts src/library/utils/repairDiff.ts src/library/validator/useDefault.ts
git commit -m "feat(transfer): add types, mock data, and shared utilities"
```

---

## Task 2: `useTransfer.ts` — createTransfer + activateScheduledTransfers (TDD)

**Files:**
- Create: `src/library/hooks/useTransfer.ts`
- Create: `src/library/hooks/useTransfer.test.ts`

- [ ] **Step 2.1: Write failing tests**

```typescript
// src/library/hooks/useTransfer.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { auth } from "$lib/stores/auth"
import { mockTransferRecords, mockTransferAcceptances, mockStockMovements, mockOutletStock } from "$lib/mock/transfer"
import { createTransfer, activateScheduledTransfers } from "./useTransfer"

function resetMocks() {
    mockTransferRecords.length = 0
    mockTransferAcceptances.length = 0
    mockStockMovements.length = 0
    mockOutletStock["outlet-1"] = { "item-001": 100, "item-002": 50 }
    mockOutletStock["outlet-2"] = { "item-001": 20,  "item-002": 30 }
    auth.set({ userId: "user-1", outletId: "outlet-1", userName: "Test User", role: "cashier" })
}

describe("createTransfer", () => {
    beforeEach(resetMocks)

    it("creates a pending record when tanggal is today or past", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }],
            keterangan: "Test",
            returnable: true,
        })
        expect(record.versions[0].snapshot.status).toBe("pending")
        expect(record.currentVersionIndex).toBe(1)
        expect(record.versions[0].type).toBe("original")
        expect(record.pendingRequest).toBeNull()
        expect(record.isDeleted).toBe(false)
        expect(mockTransferRecords).toContain(record)
    })

    it("creates a scheduled record when tanggal is in the future", () => {
        const record = createTransfer({
            tanggal: "2099-12-31",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 3 }] }],
            keterangan: "Future",
            returnable: false,
        })
        expect(record.versions[0].snapshot.status).toBe("scheduled")
    })

    it("injects fromOutletId and createdBy from auth store", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 1 }] }],
            keterangan: "",
            returnable: true,
        })
        const snap = record.versions[0].snapshot
        expect(snap.fromOutletId).toBe("outlet-1")
        expect(snap.createdBy).toBe("user-1")
    })

    it("does not affect stock on creation", () => {
        createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 50 }] }],
            keterangan: "",
            returnable: true,
        })
        expect(mockOutletStock["outlet-1"]["item-001"]).toBe(100)
        expect(mockOutletStock["outlet-2"]["item-001"]).toBe(20)
    })
})

describe("activateScheduledTransfers", () => {
    beforeEach(resetMocks)

    it("moves a scheduled record with past tanggal to pending", () => {
        const record = createTransfer({
            tanggal: "2099-12-31",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 1 }] }],
            keterangan: "",
            returnable: true,
        })
        // Force past date on the snapshot to simulate date passing
        record.versions[0].snapshot.tanggal = "2020-01-01"
        activateScheduledTransfers()
        expect(record.versions[0].snapshot.status).toBe("pending")
    })

    it("does not change a pending record", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 1 }] }],
            keterangan: "",
            returnable: true,
        })
        expect(record.versions[0].snapshot.status).toBe("pending")
        activateScheduledTransfers()
        expect(record.versions[0].snapshot.status).toBe("pending")
    })
})
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: FAIL — "Cannot find module './useTransfer'"

- [ ] **Step 2.3: Implement `createTransfer` and `activateScheduledTransfers`**

```typescript
// src/library/hooks/useTransfer.ts
import { get } from "svelte/store"
import { auth as authStore } from "$lib/stores/auth"
import type { TransferRecord, TransferSnapshot, TransferVersion, CreateTransferPayload, TransferAcceptance, TransferAcceptanceSnapshot, AcceptedItem, StockMovement } from "$lib/types/Transfer"
import { mockTransferRecords, mockTransferAcceptances, mockStockMovements, mockOutletStock } from "$lib/mock/transfer"
import { getChangedFields } from "$lib/utils/repairDiff"

function uuid(): string {
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`
}

function today(): string {
    return new Date().toISOString().slice(0, 10)
}

export function createTransfer(payload: CreateTransferPayload): TransferRecord {
    const auth = get(authStore)
    const status: TransferSnapshot["status"] = payload.tanggal > today() ? "scheduled" : "pending"

    const snapshot: TransferSnapshot = {
        id: uuid(),
        fromOutletId: auth.outletId,
        createdBy: auth.userId,
        tanggal: payload.tanggal,
        destinations: payload.destinations,
        keterangan: payload.keterangan,
        returnable: payload.returnable,
        status,
    }

    const version: TransferVersion = {
        index: 1,
        type: "original",
        snapshot,
        changedFields: [],
        createdBy: auth.userId,
        createdAt: new Date().toISOString(),
        requestId: null,
    }

    const record: TransferRecord = {
        id: `TRF-${Date.now()}`,
        currentVersionIndex: 1,
        versions: [version],
        pendingRequest: null,
        isDeleted: false,
    }

    mockTransferRecords.push(record)
    return record
}

export function activateScheduledTransfers(): void {
    const t = today()
    for (const record of mockTransferRecords) {
        const snap = record.versions[record.currentVersionIndex - 1].snapshot
        if (snap.status === "scheduled" && snap.tanggal <= t) {
            snap.status = "pending"
        }
    }
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: PASS (all `createTransfer` and `activateScheduledTransfers` tests)

- [ ] **Step 2.5: Commit**

```bash
git add src/library/hooks/useTransfer.ts src/library/hooks/useTransfer.test.ts
git commit -m "feat(transfer): createTransfer and activateScheduledTransfers with tests"
```

---

## Task 3: `acceptTransfer` + `rejectTransfer` (TDD)

**Files:**
- Modify: `src/library/hooks/useTransfer.ts`
- Modify: `src/library/hooks/useTransfer.test.ts`

- [ ] **Step 3.1: Add failing tests**

Append to `useTransfer.test.ts`:

```typescript
import { acceptTransfer, rejectTransfer } from "./useTransfer"

describe("acceptTransfer", () => {
    beforeEach(resetMocks)

    it("increases receiver stock and decreases sender stock by qtyReceived", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }] }],
            keterangan: "",
            returnable: true,
        })
        acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 10, qtyReceived: 8 }])
        expect(mockOutletStock["outlet-1"]["item-001"]).toBe(92) // 100 - 8
        expect(mockOutletStock["outlet-2"]["item-001"]).toBe(28) // 20 + 8
    })

    it("returnable=true: shortfall stays at sender — no extra deduction", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }] }],
            keterangan: "",
            returnable: true,
        })
        acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 10, qtyReceived: 6 }])
        // sender: 100 - 6 = 94 (shortfall 4 stays at sender)
        expect(mockOutletStock["outlet-1"]["item-001"]).toBe(94)
        expect(mockOutletStock["outlet-2"]["item-001"]).toBe(26)
    })

    it("returnable=false: shortfall is also deducted from sender (written off)", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }] }],
            keterangan: "",
            returnable: false,
        })
        acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 10, qtyReceived: 6 }])
        // sender: 100 - 6 - 4 = 90
        expect(mockOutletStock["outlet-1"]["item-001"]).toBe(90)
        expect(mockOutletStock["outlet-2"]["item-001"]).toBe(26)
    })

    it("logs a transfer StockMovement for qtyReceived", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }],
            keterangan: "",
            returnable: true,
        })
        acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 5, qtyReceived: 5 }])
        const mov = mockStockMovements.find(m => m.type === "transfer" && m.transferId === record.id)!
        expect(mov.qty).toBe(5)
        expect(mov.fromOutletId).toBe("outlet-1")
        expect(mov.toOutletId).toBe("outlet-2")
    })

    it("logs a return StockMovement when returnable=false and there is a shortfall", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }] }],
            keterangan: "",
            returnable: false,
        })
        acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 10, qtyReceived: 7 }])
        const ret = mockStockMovements.find(m => m.type === "return")!
        expect(ret.qty).toBe(3)
    })

    it("marks transfer as completed when all destinations have responded", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 3 }] }],
            keterangan: "",
            returnable: true,
        })
        acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 3, qtyReceived: 3 }])
        expect(record.versions[record.currentVersionIndex - 1].snapshot.status).toBe("completed")
    })

    it("does not mark transfer completed when some destinations are still awaiting", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [
                { outletId: "outlet-2", items: [{ productId: "item-001", qty: 3 }] },
                { outletId: "outlet-3", items: [{ productId: "item-002", qty: 2 }] },
            ],
            keterangan: "",
            returnable: true,
        })
        acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 3, qtyReceived: 3 }])
        expect(record.versions[record.currentVersionIndex - 1].snapshot.status).toBe("pending")
    })
})

describe("rejectTransfer", () => {
    beforeEach(resetMocks)

    it("creates a rejected acceptance with empty items", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }],
            keterangan: "",
            returnable: true,
        })
        const acceptance = rejectTransfer(record.id, "outlet-2")
        expect(acceptance.status).toBe("rejected")
        expect(acceptance.versions[0].snapshot.items).toHaveLength(0)
    })

    it("does not change any stock", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }] }],
            keterangan: "",
            returnable: true,
        })
        rejectTransfer(record.id, "outlet-2")
        expect(mockOutletStock["outlet-1"]["item-001"]).toBe(100)
        expect(mockOutletStock["outlet-2"]["item-001"]).toBe(20)
    })

    it("marks transfer as completed when the only destination rejects", () => {
        const record = createTransfer({
            tanggal: "2020-01-01",
            destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }],
            keterangan: "",
            returnable: false,
        })
        rejectTransfer(record.id, "outlet-2")
        expect(record.versions[record.currentVersionIndex - 1].snapshot.status).toBe("completed")
    })
})
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: FAIL — "acceptTransfer is not a function"

- [ ] **Step 3.3: Implement `acceptTransfer`, `rejectTransfer`, and `checkAndCompleteTransfer`**

Append to `useTransfer.ts`:

```typescript
function checkAndCompleteTransfer(transferId: string): void {
    const record = mockTransferRecords.find(r => r.id === transferId)!
    const snap = record.versions[record.currentVersionIndex - 1].snapshot
    const destinationIds = snap.destinations.map(d => d.outletId)
    const respondedIds = mockTransferAcceptances
        .filter(a => a.transferId === transferId && !a.isDeleted && a.status !== "awaiting")
        .map(a => a.receivingOutletId)
    if (destinationIds.every(id => respondedIds.includes(id))) {
        snap.status = "completed"
    }
}

export function acceptTransfer(transferId: string, receivingOutletId: string, items: AcceptedItem[]): TransferAcceptance {
    const auth = get(authStore)
    const record = mockTransferRecords.find(r => r.id === transferId)!
    const transferSnap = record.versions[record.currentVersionIndex - 1].snapshot
    const { returnable, fromOutletId } = transferSnap
    const acceptanceId = `ACC-${Date.now()}`
    const now = new Date().toISOString()

    if (!mockOutletStock[fromOutletId]) mockOutletStock[fromOutletId] = {}
    if (!mockOutletStock[receivingOutletId]) mockOutletStock[receivingOutletId] = {}

    for (const item of items) {
        mockOutletStock[fromOutletId][item.productId] = (mockOutletStock[fromOutletId][item.productId] ?? 0) - item.qtyReceived
        mockOutletStock[receivingOutletId][item.productId] = (mockOutletStock[receivingOutletId][item.productId] ?? 0) + item.qtyReceived

        const shortfall = item.qtySent - item.qtyReceived
        if (!returnable && shortfall > 0) {
            mockOutletStock[fromOutletId][item.productId] -= shortfall
            mockStockMovements.push({ id: uuid(), transferId, acceptanceId, productId: item.productId, fromOutletId, toOutletId: fromOutletId, qty: shortfall, type: "return", createdAt: now })
        }

        mockStockMovements.push({ id: uuid(), transferId, acceptanceId, productId: item.productId, fromOutletId, toOutletId: receivingOutletId, qty: item.qtyReceived, type: "transfer", createdAt: now })
    }

    const snapshot: TransferAcceptanceSnapshot = { id: uuid(), transferId, receivingOutletId, respondedBy: auth.userId, items, status: "accepted" }
    const acceptance: TransferAcceptance = {
        id: acceptanceId,
        transferId,
        receivingOutletId,
        status: "accepted",
        currentVersionIndex: 1,
        versions: [{ index: 1, type: "original", snapshot, changedFields: [], createdBy: auth.userId, createdAt: now, requestId: null }],
        pendingRequest: null,
        isDeleted: false,
    }

    mockTransferAcceptances.push(acceptance)
    checkAndCompleteTransfer(transferId)
    return acceptance
}

export function rejectTransfer(transferId: string, receivingOutletId: string): TransferAcceptance {
    const auth = get(authStore)
    const acceptanceId = `ACC-${Date.now()}`
    const now = new Date().toISOString()
    const snapshot: TransferAcceptanceSnapshot = { id: uuid(), transferId, receivingOutletId, respondedBy: auth.userId, items: [], status: "rejected" }
    const acceptance: TransferAcceptance = {
        id: acceptanceId,
        transferId,
        receivingOutletId,
        status: "rejected",
        currentVersionIndex: 1,
        versions: [{ index: 1, type: "original", snapshot, changedFields: [], createdBy: auth.userId, createdAt: now, requestId: null }],
        pendingRequest: null,
        isDeleted: false,
    }
    mockTransferAcceptances.push(acceptance)
    checkAndCompleteTransfer(transferId)
    return acceptance
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: PASS (all tests so far)

- [ ] **Step 3.5: Commit**

```bash
git add src/library/hooks/useTransfer.ts src/library/hooks/useTransfer.test.ts
git commit -m "feat(transfer): acceptTransfer and rejectTransfer with stock effects"
```

---

## Task 4: PT User Actions for Both Record Types (TDD)

**Files:**
- Modify: `src/library/hooks/useTransfer.ts`
- Modify: `src/library/hooks/useTransfer.test.ts`

- [ ] **Step 4.1: Add failing tests**

Append to `useTransfer.test.ts`:

```typescript
import {
    submitTransferRepairRequest, reviseTransferRepairRequest, deleteTransferRepairRequest,
    submitAcceptanceRepairRequest, reviseAcceptanceRepairRequest, deleteAcceptanceRepairRequest,
} from "./useTransfer"

describe("Transfer PT user actions", () => {
    beforeEach(resetMocks)

    it("submitTransferRepairRequest sets pendingRequest with status pending", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        const proposed = { ...record.versions[0].snapshot, keterangan: "Updated" }
        submitTransferRepairRequest(record.id, proposed)
        expect(record.pendingRequest).not.toBeNull()
        expect(record.pendingRequest!.status).toBe("pending")
        expect(record.pendingRequest!.proposedSnapshot.keterangan).toBe("Updated")
        expect(record.pendingRequest!.revisions).toBe(0)
    })

    it("reviseTransferRepairRequest increments revisions and resets to pending", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        const proposed = { ...record.versions[0].snapshot, keterangan: "v2" }
        submitTransferRepairRequest(record.id, { ...record.versions[0].snapshot, keterangan: "v1" })
        record.pendingRequest!.status = "rejected"
        reviseTransferRepairRequest(record.id, proposed)
        expect(record.pendingRequest!.status).toBe("pending")
        expect(record.pendingRequest!.revisions).toBe(1)
        expect(record.pendingRequest!.proposedSnapshot.keterangan).toBe("v2")
    })

    it("deleteTransferRepairRequest clears pendingRequest", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        submitTransferRepairRequest(record.id, { ...record.versions[0].snapshot })
        deleteTransferRepairRequest(record.id)
        expect(record.pendingRequest).toBeNull()
    })
})

describe("Acceptance PT user actions", () => {
    beforeEach(resetMocks)

    it("submitAcceptanceRepairRequest sets pendingRequest on the acceptance", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        const acceptance = acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 5, qtyReceived: 5 }])
        const proposed = { ...acceptance.versions[0].snapshot, items: [{ productId: "item-001", qtySent: 5, qtyReceived: 4 }] }
        submitAcceptanceRepairRequest(acceptance.id, proposed)
        expect(acceptance.pendingRequest).not.toBeNull()
        expect(acceptance.pendingRequest!.status).toBe("pending")
    })

    it("reviseAcceptanceRepairRequest increments revisions", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        const acceptance = acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 5, qtyReceived: 5 }])
        submitAcceptanceRepairRequest(acceptance.id, { ...acceptance.versions[0].snapshot })
        acceptance.pendingRequest!.status = "rejected"
        reviseAcceptanceRepairRequest(acceptance.id, { ...acceptance.versions[0].snapshot })
        expect(acceptance.pendingRequest!.revisions).toBe(1)
        expect(acceptance.pendingRequest!.status).toBe("pending")
    })

    it("deleteAcceptanceRepairRequest clears pendingRequest", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        const acceptance = acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 5, qtyReceived: 5 }])
        submitAcceptanceRepairRequest(acceptance.id, { ...acceptance.versions[0].snapshot })
        deleteAcceptanceRepairRequest(acceptance.id)
        expect(acceptance.pendingRequest).toBeNull()
    })
})
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: FAIL — "submitTransferRepairRequest is not a function"

- [ ] **Step 4.3: Implement all PT user actions**

Append to `useTransfer.ts`:

```typescript
export function submitTransferRepairRequest(transferId: string, proposed: TransferSnapshot): void {
    const auth = get(authStore)
    const record = mockTransferRecords.find(r => r.id === transferId)!
    record.pendingRequest = { id: uuid(), transferId, status: "pending", proposedSnapshot: proposed, submittedBy: auth.userId, submittedAt: new Date().toISOString(), rejectionReason: null, revisions: 0 }
}

export function reviseTransferRepairRequest(transferId: string, proposed: TransferSnapshot): void {
    const auth = get(authStore)
    const req = mockTransferRecords.find(r => r.id === transferId)!.pendingRequest!
    req.status = "pending"
    req.proposedSnapshot = proposed
    req.submittedBy = auth.userId
    req.submittedAt = new Date().toISOString()
    req.rejectionReason = null
    req.revisions += 1
}

export function deleteTransferRepairRequest(transferId: string): void {
    const record = mockTransferRecords.find(r => r.id === transferId)!
    record.pendingRequest = null
}

export function submitAcceptanceRepairRequest(acceptanceId: string, proposed: TransferAcceptanceSnapshot): void {
    const auth = get(authStore)
    const acceptance = mockTransferAcceptances.find(a => a.id === acceptanceId)!
    acceptance.pendingRequest = { id: uuid(), acceptanceId, status: "pending", proposedSnapshot: proposed, submittedBy: auth.userId, submittedAt: new Date().toISOString(), rejectionReason: null, revisions: 0 }
}

export function reviseAcceptanceRepairRequest(acceptanceId: string, proposed: TransferAcceptanceSnapshot): void {
    const auth = get(authStore)
    const req = mockTransferAcceptances.find(a => a.id === acceptanceId)!.pendingRequest!
    req.status = "pending"
    req.proposedSnapshot = proposed
    req.submittedBy = auth.userId
    req.submittedAt = new Date().toISOString()
    req.rejectionReason = null
    req.revisions += 1
}

export function deleteAcceptanceRepairRequest(acceptanceId: string): void {
    mockTransferAcceptances.find(a => a.id === acceptanceId)!.pendingRequest = null
}
```

- [ ] **Step 4.4: Run tests to confirm they pass**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: PASS (all tests so far)

- [ ] **Step 4.5: Commit**

```bash
git add src/library/hooks/useTransfer.ts src/library/hooks/useTransfer.test.ts
git commit -m "feat(transfer): PT user actions for transfer and acceptance records"
```

---

## Task 5: Admin PT Actions + Stock Reconciliation + Store (TDD)

**Files:**
- Modify: `src/library/hooks/useTransfer.ts`
- Modify: `src/library/hooks/useTransfer.test.ts`
- Create: `src/library/stores/transfer.ts`

- [ ] **Step 5.1: Add failing tests**

Append to `useTransfer.test.ts`:

```typescript
import {
    approveTransferRepairRequest, rejectTransferRepairRequest, deleteTransferRecord,
    approveAcceptanceRepairRequest, rejectAcceptanceRepairRequest, deleteAcceptanceRecord,
    getMovementsForTransfer,
} from "./useTransfer"

describe("Transfer PT admin actions", () => {
    beforeEach(resetMocks)

    it("approveTransferRepairRequest creates a new approved version and clears pendingRequest", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "old", returnable: true })
        submitTransferRepairRequest(record.id, { ...record.versions[0].snapshot, keterangan: "new" })
        approveTransferRepairRequest(record.id)
        expect(record.currentVersionIndex).toBe(2)
        expect(record.versions[1].type).toBe("approved")
        expect(record.versions[1].snapshot.keterangan).toBe("new")
        expect(record.versions[1].changedFields).toContain("keterangan")
        expect(record.pendingRequest).toBeNull()
    })

    it("rejectTransferRepairRequest sets status rejected and stores reason", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        submitTransferRepairRequest(record.id, { ...record.versions[0].snapshot })
        rejectTransferRepairRequest(record.id, "Data tidak valid")
        expect(record.pendingRequest!.status).toBe("rejected")
        expect(record.pendingRequest!.rejectionReason).toBe("Data tidak valid")
    })

    it("deleteTransferRecord sets isDeleted and clears pendingRequest", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        submitTransferRepairRequest(record.id, { ...record.versions[0].snapshot })
        deleteTransferRecord(record.id)
        expect(record.isDeleted).toBe(true)
        expect(record.pendingRequest).toBeNull()
    })
})

describe("Acceptance PT admin actions", () => {
    beforeEach(resetMocks)

    it("approveAcceptanceRepairRequest creates a new approved version and reconciles receiver stock (returnable=true)", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }] }], keterangan: "", returnable: true })
        const acceptance = acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 10, qtyReceived: 8 }])
        // outlet-1: 100-8=92, outlet-2: 20+8=28
        const proposed = { ...acceptance.versions[0].snapshot, items: [{ productId: "item-001", qtySent: 10, qtyReceived: 9 }] }
        submitAcceptanceRepairRequest(acceptance.id, proposed)
        approveAcceptanceRepairRequest(acceptance.id)
        // delta = +1: receiver +1, sender -1
        expect(mockOutletStock["outlet-1"]["item-001"]).toBe(91) // 92 - 1
        expect(mockOutletStock["outlet-2"]["item-001"]).toBe(29) // 28 + 1
        expect(acceptance.currentVersionIndex).toBe(2)
        expect(acceptance.pendingRequest).toBeNull()
    })

    it("approveAcceptanceRepairRequest does NOT adjust sender stock when returnable=false", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 10 }] }], keterangan: "", returnable: false })
        const acceptance = acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 10, qtyReceived: 6 }])
        // sender: 100-6-4=90, receiver: 20+6=26
        const senderBefore = mockOutletStock["outlet-1"]["item-001"]
        const proposed = { ...acceptance.versions[0].snapshot, items: [{ productId: "item-001", qtySent: 10, qtyReceived: 7 }] }
        submitAcceptanceRepairRequest(acceptance.id, proposed)
        approveAcceptanceRepairRequest(acceptance.id)
        // delta = +1: receiver +1, sender unchanged
        expect(mockOutletStock["outlet-1"]["item-001"]).toBe(senderBefore) // 90 unchanged
        expect(mockOutletStock["outlet-2"]["item-001"]).toBe(27)
    })

    it("rejectAcceptanceRepairRequest sets rejected status and stores reason", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        const acceptance = acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 5, qtyReceived: 5 }])
        submitAcceptanceRepairRequest(acceptance.id, { ...acceptance.versions[0].snapshot })
        rejectAcceptanceRepairRequest(acceptance.id, "Qty salah")
        expect(acceptance.pendingRequest!.status).toBe("rejected")
        expect(acceptance.pendingRequest!.rejectionReason).toBe("Qty salah")
    })

    it("deleteAcceptanceRecord sets isDeleted and clears pendingRequest", () => {
        const record = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 5 }] }], keterangan: "", returnable: true })
        const acceptance = acceptTransfer(record.id, "outlet-2", [{ productId: "item-001", qtySent: 5, qtyReceived: 5 }])
        submitAcceptanceRepairRequest(acceptance.id, { ...acceptance.versions[0].snapshot })
        deleteAcceptanceRecord(acceptance.id)
        expect(acceptance.isDeleted).toBe(true)
        expect(acceptance.pendingRequest).toBeNull()
    })
})

describe("getMovementsForTransfer", () => {
    beforeEach(resetMocks)

    it("returns only movements for the given transferId", () => {
        const r1 = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-001", qty: 3 }] }], keterangan: "", returnable: true })
        const r2 = createTransfer({ tanggal: "2020-01-01", destinations: [{ outletId: "outlet-2", items: [{ productId: "item-002", qty: 2 }] }], keterangan: "", returnable: true })
        acceptTransfer(r1.id, "outlet-2", [{ productId: "item-001", qtySent: 3, qtyReceived: 3 }])
        acceptTransfer(r2.id, "outlet-2", [{ productId: "item-002", qtySent: 2, qtyReceived: 2 }])
        const movements = getMovementsForTransfer(r1.id)
        expect(movements.every(m => m.transferId === r1.id)).toBe(true)
        expect(movements.length).toBeGreaterThan(0)
    })
})
```

- [ ] **Step 5.2: Run tests to confirm they fail**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: FAIL — "approveTransferRepairRequest is not a function"

- [ ] **Step 5.3: Implement admin PT actions and movement query**

Append to `useTransfer.ts`:

```typescript
export function approveTransferRepairRequest(transferId: string): void {
    const auth = get(authStore)
    const record = mockTransferRecords.find(r => r.id === transferId)!
    const req = record.pendingRequest!
    const current = record.versions[record.currentVersionIndex - 1].snapshot
    const changedFields = getChangedFields(current as Record<string, unknown>, req.proposedSnapshot as Record<string, unknown>)
    record.versions.push({ index: record.currentVersionIndex + 1, type: "approved", snapshot: { ...req.proposedSnapshot }, changedFields, createdBy: auth.userId, createdAt: new Date().toISOString(), requestId: req.id })
    record.currentVersionIndex += 1
    record.pendingRequest = null
}

export function rejectTransferRepairRequest(transferId: string, reason: string): void {
    const req = mockTransferRecords.find(r => r.id === transferId)!.pendingRequest!
    req.status = "rejected"
    req.rejectionReason = reason
}

export function deleteTransferRecord(transferId: string): void {
    const record = mockTransferRecords.find(r => r.id === transferId)!
    record.isDeleted = true
    record.pendingRequest = null
}

export function approveAcceptanceRepairRequest(acceptanceId: string): void {
    const auth = get(authStore)
    const acceptance = mockTransferAcceptances.find(a => a.id === acceptanceId)!
    const req = acceptance.pendingRequest!
    const current = acceptance.versions[acceptance.currentVersionIndex - 1].snapshot
    const transferRecord = mockTransferRecords.find(r => r.id === current.transferId)!
    const transferSnap = transferRecord.versions[transferRecord.currentVersionIndex - 1].snapshot
    const { returnable, fromOutletId } = transferSnap
    const now = new Date().toISOString()

    if (!mockOutletStock[fromOutletId]) mockOutletStock[fromOutletId] = {}
    if (!mockOutletStock[current.receivingOutletId]) mockOutletStock[current.receivingOutletId] = {}

    for (const proposed of req.proposedSnapshot.items) {
        const original = current.items.find(i => i.productId === proposed.productId)
        const delta = proposed.qtyReceived - (original?.qtyReceived ?? 0)
        if (delta !== 0) {
            mockOutletStock[current.receivingOutletId][proposed.productId] = (mockOutletStock[current.receivingOutletId][proposed.productId] ?? 0) + delta
            if (returnable) {
                mockOutletStock[fromOutletId][proposed.productId] = (mockOutletStock[fromOutletId][proposed.productId] ?? 0) - delta
            }
            mockStockMovements.push({ id: uuid(), transferId: current.transferId, acceptanceId, productId: proposed.productId, fromOutletId: delta > 0 ? fromOutletId : current.receivingOutletId, toOutletId: delta > 0 ? current.receivingOutletId : fromOutletId, qty: Math.abs(delta), type: "transfer", createdAt: now })
        }
    }

    const changedFields = getChangedFields(current as Record<string, unknown>, req.proposedSnapshot as Record<string, unknown>)
    acceptance.versions.push({ index: acceptance.currentVersionIndex + 1, type: "approved", snapshot: { ...req.proposedSnapshot }, changedFields, createdBy: auth.userId, createdAt: now, requestId: req.id })
    acceptance.currentVersionIndex += 1
    acceptance.status = req.proposedSnapshot.status
    acceptance.pendingRequest = null
}

export function rejectAcceptanceRepairRequest(acceptanceId: string, reason: string): void {
    const req = mockTransferAcceptances.find(a => a.id === acceptanceId)!.pendingRequest!
    req.status = "rejected"
    req.rejectionReason = reason
}

export function deleteAcceptanceRecord(acceptanceId: string): void {
    const acceptance = mockTransferAcceptances.find(a => a.id === acceptanceId)!
    acceptance.isDeleted = true
    acceptance.pendingRequest = null
}

export function getMovementsForTransfer(transferId: string): StockMovement[] {
    return mockStockMovements.filter(m => m.transferId === transferId)
}
```

- [ ] **Step 5.4: Run all tests to confirm they pass**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5.5: Create `transfer.ts` store**

```typescript
// src/library/stores/transfer.ts
import { writable } from "svelte/store"
import type { TransferRecord, TransferAcceptance, StockMovement } from "$lib/types/Transfer"
import { mockTransferRecords, mockTransferAcceptances, mockStockMovements } from "$lib/mock/transfer"

export const transferRecords = writable<TransferRecord[]>([...mockTransferRecords])
export const transferAcceptances = writable<TransferAcceptance[]>([...mockTransferAcceptances])
export const stockMovements = writable<StockMovement[]>([...mockStockMovements])

export function refreshTransfer(): void {
    transferRecords.set([...mockTransferRecords])
    transferAcceptances.set([...mockTransferAcceptances])
    stockMovements.set([...mockStockMovements])
}
```

- [ ] **Step 5.6: Commit**

```bash
git add src/library/hooks/useTransfer.ts src/library/hooks/useTransfer.test.ts src/library/stores/transfer.ts
git commit -m "feat(transfer): admin PT actions, stock reconciliation, movement query, and store"
```

---

## Task 6: `TransferForm.svelte` + Main Page Dikirim Tab

**Files:**
- Create: `src/library/components/outlet/transfer/TransferForm.svelte`
- Create: `src/routes/outlet/transfer/+page.svelte` (Dikirim tab only — Diterima and movement log added in Task 7)

- [ ] **Step 6.1: Create `TransferForm.svelte`**

```svelte
<!-- src/library/components/outlet/transfer/TransferForm.svelte -->
<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import { auth } from "$lib/stores/auth"
    import { createTransfer } from "$lib/hooks/useTransfer"
    import type { TransferDestination, TransferItem } from "$lib/types/Transfer"

    // mockOutlets must be imported from the outlets mock
    // Shape: Array<{ id: string; name: string }>
    import { mockOutlets } from "$lib/mock/outlets"

    const dispatch = createEventDispatcher<{ saved: void }>()

    let tanggal = new Date().toISOString().slice(0, 10)
    let keterangan = ""
    let returnable = true

    type DestinationDraft = { outletId: string; items: Array<{ productId: string; qty: number }> }
    let destinations: DestinationDraft[] = [{ outletId: "", items: [{ productId: "", qty: 1 }] }]

    $: otherOutlets = mockOutlets.filter(o => o.id !== $auth.outletId)

    function addDestination() {
        destinations = [...destinations, { outletId: "", items: [{ productId: "", qty: 1 }] }]
    }

    function removeDestination(i: number) {
        if (destinations.length > 1) destinations = destinations.filter((_, idx) => idx !== i)
    }

    function addItem(destIdx: number) {
        destinations[destIdx].items = [...destinations[destIdx].items, { productId: "", qty: 1 }]
        destinations = [...destinations]
    }

    function removeItem(destIdx: number, itemIdx: number) {
        if (destinations[destIdx].items.length > 1) {
            destinations[destIdx].items = destinations[destIdx].items.filter((_, idx) => idx !== itemIdx)
            destinations = [...destinations]
        }
    }

    function save() {
        createTransfer({
            tanggal,
            destinations: destinations.map(d => ({ outletId: d.outletId, items: d.items.map(i => ({ productId: i.productId, qty: i.qty })) })),
            keterangan,
            returnable,
        })
        dispatch("saved")
    }
</script>

<dialog id="transfer-form-modal" class="modal modal-open">
    <div class="modal-box w-11/12 max-w-3xl">
        <h3 class="font-bold text-lg mb-4">Kirim Transfer</h3>

        <div class="form-control mb-3">
            <label class="label"><span class="label-text">Tanggal</span></label>
            <input type="date" class="input input-bordered" bind:value={tanggal} />
        </div>

        <div class="form-control mb-3">
            <label class="label"><span class="label-text">Keterangan</span></label>
            <textarea class="textarea textarea-bordered" bind:value={keterangan} rows="2"></textarea>
        </div>

        <div class="form-control mb-4">
            <label class="label cursor-pointer">
                <span class="label-text">Returnable (barang tidak terkirim dikembalikan ke pengirim)</span>
                <input type="checkbox" class="toggle toggle-primary" bind:checked={returnable} />
            </label>
        </div>

        {#each destinations as dest, di}
            <div class="border border-base-300 rounded-lg p-3 mb-3">
                <div class="flex items-center gap-2 mb-2">
                    <div class="form-control flex-1">
                        <label class="label"><span class="label-text">Tujuan Cabang</span></label>
                        <select class="select select-bordered" bind:value={dest.outletId}>
                            <option value="">-- Pilih Cabang --</option>
                            {#each otherOutlets as outlet}
                                <option value={outlet.id}>{outlet.name}</option>
                            {/each}
                        </select>
                    </div>
                    {#if destinations.length > 1}
                        <button class="btn btn-sm btn-error mt-6" on:click={() => removeDestination(di)}>Hapus</button>
                    {/if}
                </div>

                {#each dest.items as item, ii}
                    <div class="flex gap-2 mb-2 items-end">
                        <div class="form-control flex-1">
                            <label class="label"><span class="label-text">Produk (SKU)</span></label>
                            <input type="text" class="input input-bordered" placeholder="ID produk" bind:value={item.productId} />
                        </div>
                        <div class="form-control w-24">
                            <label class="label"><span class="label-text">Qty</span></label>
                            <input type="number" class="input input-bordered" min="1" bind:value={item.qty} />
                        </div>
                        {#if dest.items.length > 1}
                            <button class="btn btn-sm btn-ghost" on:click={() => removeItem(di, ii)}>✕</button>
                        {/if}
                    </div>
                {/each}
                <button class="btn btn-sm btn-ghost" on:click={() => addItem(di)}>+ Tambah Item</button>
            </div>
        {/each}

        <button class="btn btn-ghost btn-sm mb-4" on:click={addDestination}>+ Tambah Cabang Tujuan</button>

        <div class="modal-action">
            <button class="btn" on:click={() => dispatch("saved")}>Batal</button>
            <button class="btn btn-primary" on:click={save}>Simpan</button>
        </div>
    </div>
</dialog>
```

- [ ] **Step 6.2: Create `/outlet/transfer/+page.svelte` with Dikirim tab**

```svelte
<!-- src/routes/outlet/transfer/+page.svelte -->
<script lang="ts">
    import { onMount } from "svelte"
    import { auth } from "$lib/stores/auth"
    import { transferRecords, transferAcceptances, refreshTransfer } from "$lib/stores/transfer"
    import { activateScheduledTransfers } from "$lib/hooks/useTransfer"
    import TransferForm from "$lib/components/outlet/transfer/TransferForm.svelte"
    import TransferAcceptModal from "$lib/components/outlet/transfer/TransferAcceptModal.svelte"
    import TransferRepairModal from "$lib/components/outlet/transfer/TransferRepairModal.svelte"
    import { mockOutlets } from "$lib/mock/outlets"
    import useDefault from "$lib/validator/useDefault"
    import type { TransferRecord, TransferAcceptance } from "$lib/types/Transfer"

    onMount(() => {
        activateScheduledTransfers()
        refreshTransfer()
    })

    let activeTab: "dikirim" | "diterima" | "log" = "dikirim"
    let showForm = false

    // --- Dikirim filters ---
    let dikirimFrom = useDefault.firstDay
    let dikirimTo = useDefault.currentDay
    let dikirimStatus: "all" | "scheduled" | "pending" | "completed" = "all"

    $: sentRecords = $transferRecords.filter(r => {
        if (r.isDeleted) return false
        const snap = r.versions[r.currentVersionIndex - 1].snapshot
        if (snap.fromOutletId !== $auth.outletId) return false
        if (snap.tanggal < dikirimFrom || snap.tanggal > dikirimTo) return false
        if (dikirimStatus !== "all" && snap.status !== dikirimStatus) return false
        return true
    })

    function outletName(id: string) {
        return mockOutlets.find(o => o.id === id)?.name ?? id
    }

    function getAcceptancesForTransfer(transferId: string) {
        return $transferAcceptances.filter(a => a.transferId === transferId && !a.isDeleted)
    }

    function hasAnyAcceptance(transferId: string) {
        return getAcceptancesForTransfer(transferId).some(a => a.status !== "awaiting")
    }

    // Version history modal
    let historyRecord: TransferRecord | null = null
    let historyVersionIdx: number | null = null

    // Repair modal
    let repairRecord: TransferRecord | null = null
    let repairAcceptance: TransferAcceptance | null = null

    // Accept modal
    let acceptTransferRecord: TransferRecord | null = null
    let acceptAcceptance: TransferAcceptance | null = null
    let acceptDetailMode = false
</script>

<div class="p-4">
    <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-bold">Item Transfer</h1>
    </div>

    <!-- Tabs -->
    <div class="tabs tabs-boxed mb-4">
        <button class="tab" class:tab-active={activeTab === "dikirim"} on:click={() => activeTab = "dikirim"}>Dikirim</button>
        <button class="tab" class:tab-active={activeTab === "diterima"} on:click={() => activeTab = "diterima"}>Diterima</button>
        <button class="tab" class:tab-active={activeTab === "log"} on:click={() => activeTab = "log"}>Log Pergerakan</button>
    </div>

    <!-- Dikirim Tab -->
    {#if activeTab === "dikirim"}
        <div class="flex gap-2 items-end mb-4 flex-wrap">
            <div>
                <label class="label"><span class="label-text text-xs">Dari</span></label>
                <input type="date" class="input input-bordered input-sm" bind:value={dikirimFrom} />
            </div>
            <div>
                <label class="label"><span class="label-text text-xs">Sampai</span></label>
                <input type="date" class="input input-bordered input-sm" bind:value={dikirimTo} />
            </div>
            <select class="select select-bordered select-sm" bind:value={dikirimStatus}>
                <option value="all">Semua Status</option>
                <option value="scheduled">Terjadwal</option>
                <option value="pending">Menunggu</option>
                <option value="completed">Selesai</option>
            </select>
            <button class="btn btn-primary btn-sm ml-auto" on:click={() => showForm = true}>+ Kirim Transfer</button>
        </div>

        <div class="overflow-x-auto">
            <table class="table table-zebra w-full">
                <thead>
                    <tr>
                        <th>Tanggal</th>
                        <th>Ref ID</th>
                        <th>Tujuan</th>
                        <th>Returnable</th>
                        <th>Status</th>
                        <th>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {#each sentRecords as record}
                        {@const snap = record.versions[record.currentVersionIndex - 1].snapshot}
                        <tr>
                            <td>{snap.tanggal}</td>
                            <td class="font-mono text-sm">{record.id}</td>
                            <td>{snap.destinations.map(d => outletName(d.outletId)).join(", ")}</td>
                            <td>
                                {#if snap.returnable}
                                    <span class="badge badge-success badge-sm">Ya</span>
                                {:else}
                                    <span class="badge badge-ghost badge-sm">Tidak</span>
                                {/if}
                            </td>
                            <td>
                                {#if snap.status === "scheduled"}
                                    <span class="badge badge-warning">Terjadwal</span>
                                {:else if snap.status === "pending"}
                                    <span class="badge badge-info">Menunggu</span>
                                {:else}
                                    <span class="badge badge-success">Selesai</span>
                                {/if}
                            </td>
                            <td class="flex gap-1">
                                <button class="btn btn-xs btn-ghost" on:click={() => { historyRecord = record; historyVersionIdx = record.currentVersionIndex }}>Lihat Versi</button>
                                {#if !hasAnyAcceptance(record.id)}
                                    {#if !record.pendingRequest}
                                        <button class="btn btn-xs btn-outline" on:click={() => { repairRecord = record; repairAcceptance = null }}>Perbaikan</button>
                                    {:else if record.pendingRequest.status === "pending"}
                                        <span class="badge badge-warning">⏳ Menunggu</span>
                                    {:else if record.pendingRequest.status === "rejected"}
                                        <button class="btn btn-xs btn-warning" on:click={() => { repairRecord = record; repairAcceptance = null }}>Revisi</button>
                                    {/if}
                                {/if}
                            </td>
                        </tr>
                    {:else}
                        <tr><td colspan="6" class="text-center text-base-content/50">Tidak ada transfer dikirim</td></tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}

    <!-- Diterima and Log tabs: added in Task 7 -->
    {#if activeTab === "diterima"}
        <p class="text-base-content/50">Tab Diterima — akan diimplementasikan di Task 7</p>
    {/if}
    {#if activeTab === "log"}
        <p class="text-base-content/50">Log Pergerakan — akan diimplementasikan di Task 7</p>
    {/if}
</div>

<!-- Version History Modal -->
{#if historyRecord}
    <dialog class="modal modal-open">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-3">Riwayat Versi — {historyRecord.id}</h3>
            <ul class="steps steps-vertical w-full">
                {#each historyRecord.versions as v}
                    <li class="step" class:step-primary={v.index === historyRecord.currentVersionIndex}>
                        <div class="text-left ml-2">
                            <div class="font-semibold">V{v.index} — {v.type === "original" ? "Original" : "Disetujui"}</div>
                            <div class="text-xs text-base-content/60">{new Date(v.createdAt).toLocaleString("id-ID")}</div>
                            {#if v.changedFields.length > 0}
                                <div class="text-xs">Perubahan: {v.changedFields.join(", ")}</div>
                            {/if}
                        </div>
                    </li>
                {/each}
            </ul>
            {#if historyRecord.pendingRequest && historyRecord.pendingRequest.status === "pending"}
                <div class="mt-2 p-2 rounded bg-warning/20 text-sm">⏳ Ada permintaan perbaikan menunggu persetujuan</div>
            {/if}
            <div class="modal-action"><button class="btn" on:click={() => historyRecord = null}>Tutup</button></div>
        </div>
    </dialog>
{/if}

<!-- TransferForm Modal -->
{#if showForm}
    <TransferForm on:saved={() => { showForm = false; refreshTransfer() }} />
{/if}

<!-- Repair Modal -->
{#if repairRecord}
    <TransferRepairModal
        mode="transfer"
        record={repairRecord}
        on:saved={() => { repairRecord = null; refreshTransfer() }}
        on:close={() => repairRecord = null}
    />
{/if}
```

- [ ] **Step 6.3: Start dev server and verify Dikirim tab renders seed data**

```bash
npm run dev
```

Open `http://localhost:5173/outlet/transfer`. Confirm:
- Dikirim tab shows TRF-001 (completed), TRF-002 (pending), TRF-003 (scheduled)
- TRF-003 shows "Terjadwal" badge
- TRF-001 and TRF-002 show no PT button (have acceptances)
- "+ Kirim Transfer" opens the form modal

- [ ] **Step 6.4: Commit**

```bash
git add src/library/components/outlet/transfer/TransferForm.svelte src/routes/outlet/transfer/+page.svelte
git commit -m "feat(transfer): TransferForm and main page Dikirim tab"
```

---

## Task 7: `TransferAcceptModal.svelte` + Diterima Tab + Movement Log

**Files:**
- Create: `src/library/components/outlet/transfer/TransferAcceptModal.svelte`
- Modify: `src/routes/outlet/transfer/+page.svelte`

- [ ] **Step 7.1: Create `TransferAcceptModal.svelte`**

```svelte
<!-- src/library/components/outlet/transfer/TransferAcceptModal.svelte -->
<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import { acceptTransfer, rejectTransfer } from "$lib/hooks/useTransfer"
    import type { TransferRecord, TransferAcceptance, AcceptedItem } from "$lib/types/Transfer"
    import { mockOutlets } from "$lib/mock/outlets"

    export let transferRecord: TransferRecord
    export let acceptance: TransferAcceptance | null = null  // null = awaiting, non-null = view detail
    export let readonly = false  // true when viewing accepted/rejected detail

    const dispatch = createEventDispatcher<{ saved: void; close: void }>()

    $: snap = transferRecord.versions[transferRecord.currentVersionIndex - 1].snapshot
    $: destination = snap.destinations.find(d => acceptance ? d.outletId === acceptance.receivingOutletId : true)
    $: outletName = (id: string) => mockOutlets.find(o => o.id === id)?.name ?? id

    // Build editable items list from destination
    let items: AcceptedItem[] = (destination?.items ?? []).map(i => ({ productId: i.productId, qtySent: i.qty, qtyReceived: i.qty }))

    // If viewing existing acceptance, use its snapshot items
    $: if (acceptance && acceptance.currentVersionIndex > 0) {
        items = acceptance.versions[acceptance.currentVersionIndex - 1].snapshot.items
    }

    function terima(receivingOutletId: string) {
        acceptTransfer(transferRecord.id, receivingOutletId, items)
        dispatch("saved")
    }

    function tolak(receivingOutletId: string) {
        rejectTransfer(transferRecord.id, receivingOutletId)
        dispatch("saved")
    }
</script>

<dialog class="modal modal-open">
    <div class="modal-box w-11/12 max-w-2xl">
        <h3 class="font-bold text-lg mb-3">
            {readonly ? "Detail Penerimaan" : "Konfirmasi Penerimaan"} — {transferRecord.id}
        </h3>

        <div class="grid grid-cols-2 gap-2 mb-4 text-sm">
            <div><span class="font-semibold">Dari:</span> {outletName(snap.fromOutletId)}</div>
            <div><span class="font-semibold">Tanggal:</span> {snap.tanggal}</div>
            <div><span class="font-semibold">Returnable:</span> {snap.returnable ? "Ya" : "Tidak"}</div>
            <div class="col-span-2"><span class="font-semibold">Keterangan:</span> {snap.keterangan || "-"}</div>
        </div>

        {#if acceptance && acceptance.versions[0]?.snapshot.status === "rejected"}
            <div class="alert alert-error mb-4"><span>Transfer ini telah ditolak.</span></div>
        {/if}

        <!-- Item table -->
        <table class="table table-sm w-full mb-4">
            <thead>
                <tr>
                    <th>Produk</th>
                    <th>Dikirim</th>
                    <th>Diterima</th>
                </tr>
            </thead>
            <tbody>
                {#each items as item}
                    <tr>
                        <td class="font-mono text-sm">{item.productId}</td>
                        <td>{item.qtySent}</td>
                        <td>
                            {#if readonly}
                                {item.qtyReceived}
                            {:else}
                                <input type="number" class="input input-bordered input-xs w-20" min="0" max={item.qtySent} bind:value={item.qtyReceived} />
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>

        <!-- Version history (shown in detail mode) -->
        {#if acceptance && acceptance.versions.length > 0}
            <div class="collapse collapse-arrow border border-base-300 rounded mb-4">
                <input type="checkbox" />
                <div class="collapse-title font-semibold text-sm">Riwayat Versi Penerimaan</div>
                <div class="collapse-content">
                    {#each acceptance.versions as v}
                        <div class="py-1 border-b border-base-200 text-sm">
                            <span class="font-semibold">V{v.index}</span> — {v.type === "original" ? "Original" : "Disetujui"}
                            <span class="text-xs text-base-content/60 ml-2">{new Date(v.createdAt).toLocaleString("id-ID")}</span>
                            {#if v.changedFields.length > 0}
                                <div class="text-xs">Perubahan: {v.changedFields.join(", ")}</div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <div class="modal-action">
            <button class="btn" on:click={() => dispatch("close")}>
                {readonly ? "Tutup" : "Batal"}
            </button>
            {#if !readonly && destination}
                <button class="btn btn-error btn-outline" on:click={() => tolak(destination!.outletId)}>Tolak</button>
                <button class="btn btn-success" on:click={() => terima(destination!.outletId)}>Terima</button>
            {/if}
        </div>
    </div>
</dialog>
```

- [ ] **Step 7.2: Add Diterima tab and Movement Log to `+page.svelte`**

In `src/routes/outlet/transfer/+page.svelte`, replace the placeholder blocks for `diterima` and `log` with:

```svelte
<!-- Add to <script> block -->
import { stockMovements } from "$lib/stores/transfer"

// Diterima filters
let diterimaFrom = useDefault.firstDay
let diterimaTo = useDefault.currentDay
let diterimaStatus: "all" | "awaiting" | "accepted" | "rejected" = "all"

$: incomingTransfers = $transferRecords.filter(r => {
    if (r.isDeleted) return false
    const snap = r.versions[r.currentVersionIndex - 1].snapshot
    return snap.destinations.some(d => d.outletId === $auth.outletId)
}).filter(r => {
    const snap = r.versions[r.currentVersionIndex - 1].snapshot
    return snap.tanggal >= diterimaFrom && snap.tanggal <= diterimaTo
})

function getAcceptanceForOutlet(transferId: string, outletId: string) {
    return $transferAcceptances.find(a => a.transferId === transferId && a.receivingOutletId === outletId && !a.isDeleted)
}

// Log filters
let logFrom = useDefault.firstDay
let logTo = useDefault.currentDay
let logProductFilter = ""

$: filteredMovements = $stockMovements.filter(m => {
    if (m.createdAt.slice(0, 10) < logFrom || m.createdAt.slice(0, 10) > logTo) return false
    if (logProductFilter && !m.productId.includes(logProductFilter)) return false
    return true
})
```

Replace the Diterima placeholder:

```svelte
{#if activeTab === "diterima"}
    <div class="flex gap-2 items-end mb-4 flex-wrap">
        <div>
            <label class="label"><span class="label-text text-xs">Dari</span></label>
            <input type="date" class="input input-bordered input-sm" bind:value={diterimaFrom} />
        </div>
        <div>
            <label class="label"><span class="label-text text-xs">Sampai</span></label>
            <input type="date" class="input input-bordered input-sm" bind:value={diterimaTo} />
        </div>
        <select class="select select-bordered select-sm" bind:value={diterimaStatus}>
            <option value="all">Semua Status</option>
            <option value="awaiting">Menunggu</option>
            <option value="accepted">Diterima</option>
            <option value="rejected">Ditolak</option>
        </select>
    </div>

    <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
            <thead>
                <tr><th>Tanggal</th><th>Ref ID</th><th>Dari</th><th>Returnable</th><th>Status</th><th>Aksi</th></tr>
            </thead>
            <tbody>
                {#each incomingTransfers as record}
                    {@const snap = record.versions[record.currentVersionIndex - 1].snapshot}
                    {@const acc = getAcceptanceForOutlet(record.id, $auth.outletId)}
                    {@const accStatus = acc?.status ?? "awaiting"}
                    {#if diterimaStatus === "all" || accStatus === diterimaStatus}
                        <tr>
                            <td>{snap.tanggal}</td>
                            <td class="font-mono text-sm">{record.id}</td>
                            <td>{outletName(snap.fromOutletId)}</td>
                            <td>
                                {#if snap.returnable}
                                    <span class="badge badge-success badge-sm">Ya</span>
                                {:else}
                                    <span class="badge badge-ghost badge-sm">Tidak</span>
                                {/if}
                            </td>
                            <td>
                                {#if snap.status === "scheduled"}
                                    <span class="badge badge-warning">⏳ Terjadwal</span>
                                {:else if accStatus === "awaiting"}
                                    <span class="badge badge-info">Menunggu Respons</span>
                                {:else if accStatus === "accepted"}
                                    <span class="badge badge-success">Diterima</span>
                                {:else}
                                    <span class="badge badge-error">Ditolak</span>
                                {/if}
                            </td>
                            <td class="flex gap-1 flex-wrap">
                                {#if snap.status === "scheduled"}
                                    <span class="badge badge-warning badge-sm">⏳ Terjadwal</span>
                                {:else if accStatus === "awaiting"}
                                    <button class="btn btn-xs btn-primary" on:click={() => { acceptTransferRecord = record; acceptAcceptance = null; acceptDetailMode = false }}>Terima / Tolak</button>
                                {:else}
                                    <button class="btn btn-xs btn-ghost" on:click={() => { acceptTransferRecord = record; acceptAcceptance = acc ?? null; acceptDetailMode = true }}>Lihat Detail</button>
                                    {#if acc && !acc.pendingRequest}
                                        <button class="btn btn-xs btn-outline" on:click={() => { repairAcceptance = acc; repairRecord = null }}>Perbaikan</button>
                                    {:else if acc?.pendingRequest?.status === "pending"}
                                        <span class="badge badge-warning">⏳ Menunggu</span>
                                    {:else if acc?.pendingRequest?.status === "rejected"}
                                        <button class="btn btn-xs btn-warning" on:click={() => { repairAcceptance = acc ?? null; repairRecord = null }}>Revisi</button>
                                    {/if}
                                {/if}
                            </td>
                        </tr>
                    {/if}
                {:else}
                    <tr><td colspan="6" class="text-center text-base-content/50">Tidak ada transfer masuk</td></tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
```

Replace the Log placeholder:

```svelte
{#if activeTab === "log"}
    <div class="flex gap-2 items-end mb-4 flex-wrap">
        <div>
            <label class="label"><span class="label-text text-xs">Dari</span></label>
            <input type="date" class="input input-bordered input-sm" bind:value={logFrom} />
        </div>
        <div>
            <label class="label"><span class="label-text text-xs">Sampai</span></label>
            <input type="date" class="input input-bordered input-sm" bind:value={logTo} />
        </div>
        <input type="text" class="input input-bordered input-sm" placeholder="Cari produk..." bind:value={logProductFilter} />
    </div>

    <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
            <thead>
                <tr><th>Tanggal</th><th>Transfer Ref</th><th>Produk</th><th>Dari</th><th>Ke</th><th>Qty</th><th>Tipe</th></tr>
            </thead>
            <tbody>
                {#each filteredMovements as mov}
                    <tr>
                        <td>{mov.createdAt.slice(0, 10)}</td>
                        <td class="font-mono text-sm">{mov.transferId}</td>
                        <td class="font-mono text-sm">{mov.productId}</td>
                        <td>{outletName(mov.fromOutletId)}</td>
                        <td>{outletName(mov.toOutletId)}</td>
                        <td>{mov.qty}</td>
                        <td>
                            {#if mov.type === "transfer"}
                                <span class="badge badge-primary badge-sm">Transfer</span>
                            {:else}
                                <span class="badge badge-warning badge-sm">Return</span>
                            {/if}
                        </td>
                    </tr>
                {:else}
                    <tr><td colspan="7" class="text-center text-base-content/50">Tidak ada pergerakan stok</td></tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
```

Also add the `TransferAcceptModal` usage at the bottom of the template (above `</div>`):

```svelte
{#if acceptTransferRecord}
    <TransferAcceptModal
        transferRecord={acceptTransferRecord}
        acceptance={acceptAcceptance}
        readonly={acceptDetailMode}
        on:saved={() => { acceptTransferRecord = null; refreshTransfer() }}
        on:close={() => acceptTransferRecord = null}
    />
{/if}

{#if repairAcceptance}
    <TransferRepairModal
        mode="acceptance"
        acceptance={repairAcceptance}
        on:saved={() => { repairAcceptance = null; refreshTransfer() }}
        on:close={() => repairAcceptance = null}
    />
{/if}
```

- [ ] **Step 7.3: Verify Diterima tab and movement log in browser**

Open `http://localhost:5173/outlet/transfer`.

- Switch to Diterima tab: TRF-002 (outlet-3 awaiting), TRF-004 (outlet-1 rejected) should appear for the correct outlets
- Switch to Log: 3 seed movements from TRF-001 and TRF-002 should appear
- Test accepting an awaiting transfer: click "Terima / Tolak", adjust qty, click "Terima" — table updates and movement log gets new entries

- [ ] **Step 7.4: Commit**

```bash
git add src/library/components/outlet/transfer/TransferAcceptModal.svelte src/routes/outlet/transfer/+page.svelte
git commit -m "feat(transfer): TransferAcceptModal, Diterima tab, and movement log"
```

---

## Task 8: `TransferRepairModal.svelte` + Repair Page

**Files:**
- Create: `src/library/components/outlet/transfer/TransferRepairModal.svelte`
- Create: `src/routes/outlet/transfer/repair/+page.svelte`

- [ ] **Step 8.1: Create `TransferRepairModal.svelte`**

```svelte
<!-- src/library/components/outlet/transfer/TransferRepairModal.svelte -->
<script lang="ts">
    import { createEventDispatcher } from "svelte"
    import {
        submitTransferRepairRequest, reviseTransferRepairRequest, deleteTransferRepairRequest,
        submitAcceptanceRepairRequest, reviseAcceptanceRepairRequest, deleteAcceptanceRepairRequest,
    } from "$lib/hooks/useTransfer"
    import type { TransferRecord, TransferAcceptance, TransferSnapshot, TransferAcceptanceSnapshot } from "$lib/types/Transfer"
    import { mockOutlets } from "$lib/mock/outlets"

    export let mode: "transfer" | "acceptance"
    export let record: TransferRecord | null = null
    export let acceptance: TransferAcceptance | null = null

    const dispatch = createEventDispatcher<{ saved: void; close: void }>()

    $: isRevision = mode === "transfer"
        ? record?.pendingRequest?.status === "rejected"
        : acceptance?.pendingRequest?.status === "rejected"

    $: rejectionReason = mode === "transfer"
        ? record?.pendingRequest?.rejectionReason
        : acceptance?.pendingRequest?.rejectionReason

    // For transfer mode: clone current/proposed snapshot as form state
    let transferDraft: TransferSnapshot | null = null
    $: if (mode === "transfer" && record) {
        const base = record.pendingRequest?.status === "rejected"
            ? record.pendingRequest.proposedSnapshot
            : record.versions[record.currentVersionIndex - 1].snapshot
        transferDraft = { ...base, destinations: base.destinations.map(d => ({ ...d, items: d.items.map(i => ({ ...i })) })) }
    }

    let acceptanceDraft: TransferAcceptanceSnapshot | null = null
    $: if (mode === "acceptance" && acceptance) {
        const base = acceptance.pendingRequest?.status === "rejected"
            ? acceptance.pendingRequest.proposedSnapshot
            : acceptance.versions[acceptance.currentVersionIndex - 1].snapshot
        acceptanceDraft = { ...base, items: base.items.map(i => ({ ...i })) }
    }

    function outletName(id: string) {
        return mockOutlets.find(o => o.id === id)?.name ?? id
    }

    function submit() {
        if (mode === "transfer" && record && transferDraft) {
            if (isRevision) {
                reviseTransferRepairRequest(record.id, transferDraft)
            } else {
                submitTransferRepairRequest(record.id, transferDraft)
            }
        } else if (mode === "acceptance" && acceptance && acceptanceDraft) {
            if (isRevision) {
                reviseAcceptanceRepairRequest(acceptance.id, acceptanceDraft)
            } else {
                submitAcceptanceRepairRequest(acceptance.id, acceptanceDraft)
            }
        }
        dispatch("saved")
    }

    function deleteRequest() {
        if (mode === "transfer" && record) deleteTransferRepairRequest(record.id)
        if (mode === "acceptance" && acceptance) deleteAcceptanceRepairRequest(acceptance.id)
        dispatch("saved")
    }
</script>

<dialog class="modal modal-open">
    <div class="modal-box w-11/12 max-w-2xl">
        <h3 class="font-bold text-lg mb-3">
            {isRevision ? "Revisi" : "Perbaikan Transaksi"} —
            {mode === "transfer" ? record?.id : acceptance?.id}
        </h3>

        {#if isRevision && rejectionReason}
            <div class="alert alert-warning mb-4">
                <span>Alasan penolakan: {rejectionReason}</span>
            </div>
        {/if}

        {#if mode === "transfer" && transferDraft}
            <div class="form-control mb-3">
                <label class="label"><span class="label-text">Tanggal</span></label>
                <input type="date" class="input input-bordered" bind:value={transferDraft.tanggal} />
            </div>
            <div class="form-control mb-3">
                <label class="label"><span class="label-text">Keterangan</span></label>
                <textarea class="textarea textarea-bordered" bind:value={transferDraft.keterangan} rows="2"></textarea>
            </div>
            <div class="form-control mb-4">
                <label class="label cursor-pointer">
                    <span class="label-text">Returnable</span>
                    <input type="checkbox" class="toggle toggle-primary" bind:checked={transferDraft.returnable} />
                </label>
            </div>
            {#each transferDraft.destinations as dest, di}
                <div class="border border-base-300 rounded p-2 mb-2">
                    <div class="text-sm font-semibold mb-1">Tujuan: {outletName(dest.outletId)}</div>
                    {#each dest.items as item}
                        <div class="flex gap-2 items-center mb-1 text-sm">
                            <span class="font-mono">{item.productId}</span>
                            <input type="number" class="input input-bordered input-xs w-20" min="1" bind:value={item.qty} />
                        </div>
                    {/each}
                </div>
            {/each}
        {/if}

        {#if mode === "acceptance" && acceptanceDraft}
            <table class="table table-sm w-full mb-4">
                <thead><tr><th>Produk</th><th>Dikirim</th><th>Diterima</th></tr></thead>
                <tbody>
                    {#each acceptanceDraft.items as item}
                        <tr>
                            <td class="font-mono text-sm">{item.productId}</td>
                            <td>{item.qtySent}</td>
                            <td><input type="number" class="input input-bordered input-xs w-20" min="0" max={item.qtySent} bind:value={item.qtyReceived} /></td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        {/if}

        <div class="modal-action">
            {#if record?.pendingRequest || acceptance?.pendingRequest}
                <button class="btn btn-error btn-outline btn-sm mr-auto" on:click={deleteRequest}>Hapus Permintaan</button>
            {/if}
            <button class="btn" on:click={() => dispatch("close")}>Batal</button>
            <button class="btn btn-primary" on:click={submit}>
                {isRevision ? "Kirim Ulang" : "Submit Request"}
            </button>
        </div>
    </div>
</dialog>
```

- [ ] **Step 8.2: Create `/outlet/transfer/repair/+page.svelte`**

```svelte
<!-- src/routes/outlet/transfer/repair/+page.svelte -->
<script lang="ts">
    import { transferRecords, transferAcceptances, refreshTransfer } from "$lib/stores/transfer"
    import {
        approveTransferRepairRequest, rejectTransferRepairRequest, deleteTransferRecord,
        approveAcceptanceRepairRequest, rejectAcceptanceRepairRequest, deleteAcceptanceRecord,
    } from "$lib/hooks/useTransfer"
    import type { TransferRecord, TransferAcceptance } from "$lib/types/Transfer"
    import { mockOutlets } from "$lib/mock/outlets"

    let activeTab: "transfer" | "penerimaan" = "transfer"
    let selectedTransfer: TransferRecord | null = null
    let selectedAcceptance: TransferAcceptance | null = null
    let rejectReason = ""
    let showRejectInput = false
    let showDeleteConfirm = false

    function outletName(id: string) {
        return mockOutlets.find(o => o.id === id)?.name ?? id
    }

    $: pendingTransfers = $transferRecords.filter(r => !r.isDeleted && r.pendingRequest?.status === "pending")
    $: pendingAcceptances = $transferAcceptances.filter(a => !a.isDeleted && a.pendingRequest?.status === "pending")

    function selectTransfer(r: TransferRecord) {
        selectedTransfer = r
        selectedAcceptance = null
        rejectReason = ""
        showRejectInput = false
        showDeleteConfirm = false
    }

    function selectAcceptance(a: TransferAcceptance) {
        selectedAcceptance = a
        selectedTransfer = null
        rejectReason = ""
        showRejectInput = false
        showDeleteConfirm = false
    }

    function approve() {
        if (selectedTransfer) { approveTransferRepairRequest(selectedTransfer.id); selectedTransfer = null }
        if (selectedAcceptance) { approveAcceptanceRepairRequest(selectedAcceptance.id); selectedAcceptance = null }
        refreshTransfer()
    }

    function reject() {
        if (!rejectReason.trim()) return
        if (selectedTransfer) rejectTransferRepairRequest(selectedTransfer.id, rejectReason)
        if (selectedAcceptance) rejectAcceptanceRepairRequest(selectedAcceptance.id, rejectReason)
        selectedTransfer = null; selectedAcceptance = null; showRejectInput = false; rejectReason = ""
        refreshTransfer()
    }

    function deleteRequest() {
        // Handled inline in each card
    }

    function confirmDeleteRecord() {
        if (selectedTransfer) deleteTransferRecord(selectedTransfer.id)
        if (selectedAcceptance) deleteAcceptanceRecord(selectedAcceptance.id)
        selectedTransfer = null; selectedAcceptance = null; showDeleteConfirm = false
        refreshTransfer()
    }
</script>

<div class="p-4">
    <h1 class="text-2xl font-bold mb-4">Antrian Perbaikan Transfer</h1>

    <div class="tabs tabs-boxed mb-4">
        <button class="tab" class:tab-active={activeTab === "transfer"} on:click={() => activeTab = "transfer"}>
            Transfer <span class="badge badge-sm ml-1">{pendingTransfers.length}</span>
        </button>
        <button class="tab" class:tab-active={activeTab === "penerimaan"} on:click={() => activeTab = "penerimaan"}>
            Penerimaan <span class="badge badge-sm ml-1">{pendingAcceptances.length}</span>
        </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Left: queue list -->
        <div>
            {#if activeTab === "transfer"}
                {#each pendingTransfers as r}
                    <div class="card card-compact bg-base-200 mb-2 cursor-pointer hover:bg-base-300" class:ring={selectedTransfer?.id === r.id} on:click={() => selectTransfer(r)}>
                        <div class="card-body">
                            <div class="font-mono font-bold">{r.id}</div>
                            <div class="text-sm">Dari: {outletName(r.versions[r.currentVersionIndex-1].snapshot.fromOutletId)}</div>
                            <div class="text-xs text-base-content/60">Diajukan: {new Date(r.pendingRequest!.submittedAt).toLocaleString("id-ID")}</div>
                            {#if r.pendingRequest!.revisions > 0}
                                <span class="badge badge-warning badge-sm">Revisi #{r.pendingRequest!.revisions}</span>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <p class="text-base-content/50 text-sm">Tidak ada permintaan perbaikan transfer</p>
                {/each}
            {/if}
            {#if activeTab === "penerimaan"}
                {#each pendingAcceptances as a}
                    <div class="card card-compact bg-base-200 mb-2 cursor-pointer hover:bg-base-300" class:ring={selectedAcceptance?.id === a.id} on:click={() => selectAcceptance(a)}>
                        <div class="card-body">
                            <div class="font-mono font-bold">{a.id}</div>
                            <div class="text-sm">Transfer: {a.transferId} · Cabang: {outletName(a.receivingOutletId)}</div>
                            <div class="text-xs text-base-content/60">Diajukan: {new Date(a.pendingRequest!.submittedAt).toLocaleString("id-ID")}</div>
                            {#if a.pendingRequest!.revisions > 0}
                                <span class="badge badge-warning badge-sm">Revisi #{a.pendingRequest!.revisions}</span>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <p class="text-base-content/50 text-sm">Tidak ada permintaan perbaikan penerimaan</p>
                {/each}
            {/if}
        </div>

        <!-- Right: diff + actions -->
        <div>
            {#if selectedTransfer || selectedAcceptance}
                {@const req = selectedTransfer ? selectedTransfer.pendingRequest! : selectedAcceptance!.pendingRequest!}
                {@const currentSnap = selectedTransfer
                    ? selectedTransfer.versions[selectedTransfer.currentVersionIndex - 1].snapshot
                    : selectedAcceptance!.versions[selectedAcceptance!.currentVersionIndex - 1].snapshot}

                <div class="card bg-base-200">
                    <div class="card-body">
                        <h3 class="font-bold mb-2">Perbandingan Snapshot</h3>
                        <div class="grid grid-cols-2 gap-2 text-sm mb-4">
                            <div>
                                <div class="font-semibold mb-1">Saat Ini</div>
                                <pre class="bg-base-300 rounded p-2 text-xs overflow-auto max-h-60">{JSON.stringify(currentSnap, null, 2)}</pre>
                            </div>
                            <div>
                                <div class="font-semibold mb-1">Diusulkan</div>
                                <pre class="bg-base-300 rounded p-2 text-xs overflow-auto max-h-60">{JSON.stringify(req.proposedSnapshot, null, 2)}</pre>
                            </div>
                        </div>

                        {#if req.proposedSnapshot && currentSnap}
                            {@const changed = Object.keys(req.proposedSnapshot).filter(k => JSON.stringify((req.proposedSnapshot as Record<string,unknown>)[k]) !== JSON.stringify((currentSnap as Record<string,unknown>)[k]))}
                            {#if changed.length > 0}
                                <div class="text-xs mb-3">Perubahan: {changed.join(", ")}</div>
                            {/if}
                        {/if}

                        {#if showRejectInput}
                            <textarea class="textarea textarea-bordered w-full mb-2" placeholder="Alasan penolakan..." bind:value={rejectReason} rows="2"></textarea>
                        {/if}

                        {#if showDeleteConfirm}
                            <div class="alert alert-error mb-2 text-sm">
                                <span>Yakin hapus record ini? Tindakan ini tidak dapat dibatalkan.</span>
                            </div>
                        {/if}

                        <div class="flex gap-2 flex-wrap">
                            <button class="btn btn-success btn-sm" on:click={approve}>Setujui</button>
                            {#if !showRejectInput}
                                <button class="btn btn-warning btn-sm" on:click={() => showRejectInput = true}>Tolak</button>
                            {:else}
                                <button class="btn btn-warning btn-sm" on:click={reject} disabled={!rejectReason.trim()}>Kirim Tolak</button>
                                <button class="btn btn-ghost btn-sm" on:click={() => { showRejectInput = false; rejectReason = "" }}>Batal</button>
                            {/if}
                            {#if !showDeleteConfirm}
                                <button class="btn btn-error btn-outline btn-sm ml-auto" on:click={() => showDeleteConfirm = true}>Hapus Record</button>
                            {:else}
                                <button class="btn btn-error btn-sm ml-auto" on:click={confirmDeleteRecord}>Konfirmasi Hapus</button>
                                <button class="btn btn-ghost btn-sm" on:click={() => showDeleteConfirm = false}>Batal</button>
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="text-base-content/50 text-sm mt-4">Pilih permintaan dari daftar untuk melihat detail</div>
            {/if}
        </div>
    </div>
</div>
```

- [ ] **Step 8.3: Verify repair page in browser**

Open `http://localhost:5173/outlet/transfer/repair`.

Confirm:
- "Penerimaan" tab shows ACC-004 (rejected PT, revision scenario) — click it and the right panel shows current vs proposed snapshot
- "Setujui" approves and removes from queue; `refreshTransfer()` updates the store
- "Tolak" shows reason input before submitting
- "Hapus Record" shows confirmation step before deleting

- [ ] **Step 8.4: Verify PT flow end-to-end**

1. Go to `/outlet/transfer`, Dikirim tab
2. Create a new transfer to outlet-2 with item-001 qty 5, returnable=on, today's date
3. Click "Perbaikan" on the new record → modal opens pre-filled
4. Change keterangan → "Submit Request"
5. Row shows "⏳ Menunggu"
6. Go to `/outlet/transfer/repair` → new record appears in Transfer tab
7. Click "Setujui" → V2 created, PT cleared
8. Go back to main page → row now shows V2 in version history

- [ ] **Step 8.5: Commit**

```bash
git add src/library/components/outlet/transfer/TransferRepairModal.svelte src/routes/outlet/transfer/repair/+page.svelte
git commit -m "feat(transfer): TransferRepairModal and admin repair queue page"
```

---

## Task 9: End-to-End Verification

**Files:** No new files — manual verification only.

- [ ] **Step 9.1: Run all tests one final time**

```bash
npx vitest run src/library/hooks/useTransfer.test.ts
```

Expected: All tests PASS.

- [ ] **Step 9.2: Verify scheduled transfer flow**

1. Create a transfer with tomorrow's date → status shows "Terjadwal"
2. Diterima tab: the incoming transfer shows "⏳ Terjadwal" badge, no action button
3. Manually set `tanggal` to yesterday in the seed or via the form, then reload → `activateScheduledTransfers()` fires on mount → status becomes "Menunggu"

- [ ] **Step 9.3: Verify multi-branch transfer**

1. Create a transfer to outlet-2 AND outlet-3 with different items
2. Diterima tab (as outlet-2): shows the transfer with "Terima / Tolak"
3. Accept from outlet-2 → transfer status stays "Menunggu" (outlet-3 still awaiting)
4. Accept from outlet-3 → transfer status becomes "Selesai"
5. Movement log shows entries for both acceptances

- [ ] **Step 9.4: Verify returnable vs non-returnable**

1. Create returnable=true transfer, accept with partial qty → movement log shows only "Transfer" entries
2. Create returnable=false transfer, accept with partial qty → movement log shows "Transfer" + "Return" (write-off) entries

- [ ] **Step 9.5: Final commit**

```bash
git add .
git commit -m "feat(transfer): complete Item Transfer feature — all tasks done"
```
