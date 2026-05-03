# Perbaikan Transaksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two transaction repair modes — Perbaikan Transaksi Instan (instant, limited fields, no approval) and Perbaikan Transaksi (full repair, admin approval required) — with complete version history tracking on all transactions.

**Architecture:** All transactions gain a `versions[]` array (full snapshot per version). PTI writes a new version immediately. PT creates a `RepairRequest` that enters an admin queue; a new version is only committed on approval. Both modes store full snapshots so diffs between any two versions are a simple field comparison with no reconstruction.

**Tech Stack:** SvelteKit · TypeScript · TailwindCSS · DaisyUI · Svelte Stores · Mock data layer (offline dev — all hooks hit mock arrays; swap for real API endpoints when backend is ready)

> **Note:** This project configures `$lib` to resolve to `src/library/`. Ensure `svelte.config.js` includes `kit: { alias: { $lib: 'src/library' } }`.

---

## File Map

**Created:**
- `src/library/types/Repair.ts` — all repair-domain TypeScript interfaces and constants
- `src/library/utils/repairDiff.ts` — `getChangedFields()` pure utility
- `src/library/utils/repairDiff.test.ts` — Vitest unit tests
- `src/library/mock/versions.ts` — mock versioned transactions
- `src/library/mock/repair-requests.ts` — mock repair requests (derived from mock versions)
- `src/library/hooks/useInstantRepair.ts` — PTI API hook
- `src/library/hooks/useRepair.ts` — PT API hook (submit, revise, delete, approve, reject, delete transaction)
- `src/library/stores/repair.ts` — UI state for active repair context
- `src/library/components/outlet/repair/VersionTimeline.svelte` — version history timeline
- `src/library/components/outlet/repair/VersionDiff.svelte` — two-version field comparison
- `src/library/components/outlet/repair/InstantRepairModal.svelte` — PTI edit form
- `src/library/components/outlet/repair/RepairRequestModal.svelte` — PT request form + rejection/revision flow
- `src/library/components/outlet/repair/AdminRepairQueue.svelte` — admin pending request list
- `src/library/components/outlet/repair/AdminDiffView.svelte` — admin original vs proposed diff + action buttons
- `src/routes/outlet/repair/+page.svelte` — admin repair queue page (protected by existing outlet layout)

**Modified:**
- `src/routes/outlet/history/retail/+page.svelte` — add PTI button, PT button, pending lock badge, version viewer trigger

---

## Known Limitation

If a PTI edit is made after a PT request is submitted (both affect overlapping logistical fields), approving the PT will overwrite the PTI changes in those fields because approval uses the full proposed snapshot. Workaround: make a PTI after PT is approved.

---

## Task 1: Types, Diff Utility & Mock Data

**Files:**
- Create: `src/library/types/Repair.ts`
- Create: `src/library/utils/repairDiff.ts`
- Create: `src/library/utils/repairDiff.test.ts`
- Create: `src/library/mock/versions.ts`
- Create: `src/library/mock/repair-requests.ts`

- [ ] **Step 1.1: Create Repair.ts**

```typescript
// src/library/types/Repair.ts

export interface TransactionSnapshot {
  id: string
  items: Array<{ id: string; qty: number; price: number; isFree: boolean }>
  pricing: {
    subtotal: number
    percentDiscount: number
    fixedDiscount: number
    additionalCost: { packaging: number; transport: number; modification: number }
    total: number
  }
  paymentMethods: Array<{ method: string; amount: number }>
  notes: string
  mode: "retail" | "order"
  memberId: string | null
  keterangan: string
  tanggalKirim: string        // "YYYY-MM-DD"
  jamKirimPesanan: string     // "HH:MM"
  statusPesanan: "Dikirim" | "Diambil"
  kontakWhatsApp: string
}

export interface Version {
  index: number                        // 1, 2, 3...
  type: "original" | "instant" | "approved"
  snapshot: TransactionSnapshot
  changedFields: string[]
  createdBy: string                    // userId
  createdAt: string                    // ISO timestamp
  requestId: string | null             // populated when type === "approved"
}

export interface RepairRequest {
  id: string
  transactionId: string
  status: "pending" | "rejected" | "deleted"
  proposedSnapshot: TransactionSnapshot
  submittedBy: string
  submittedAt: string
  rejectionReason: string | null
  revisions: number
}

export interface VersionedTransaction {
  id: string
  currentVersionIndex: number
  versions: Version[]
  pendingRequest: RepairRequest | null
  isDeleted: boolean
}

export type PTIField = "keterangan" | "tanggalKirim" | "jamKirimPesanan" | "statusPesanan" | "kontakWhatsApp"

export const PTI_ALLOWED_FIELDS: readonly PTIField[] = [
  "keterangan",
  "tanggalKirim",
  "jamKirimPesanan",
  "statusPesanan",
  "kontakWhatsApp"
] as const
```

- [ ] **Step 1.2: Create repairDiff utility**

```typescript
// src/library/utils/repairDiff.ts
import type { TransactionSnapshot } from "$lib/types/Repair"

function getChangedFields(original: TransactionSnapshot, proposed: TransactionSnapshot): string[] {
  return (Object.keys(proposed) as Array<keyof TransactionSnapshot>).filter(
    key => JSON.stringify(original[key]) !== JSON.stringify(proposed[key])
  )
}

export { getChangedFields }
```

- [ ] **Step 1.3: Write failing tests**

```typescript
// src/library/utils/repairDiff.test.ts
import { describe, it, expect } from "vitest"
import { getChangedFields } from "./repairDiff"
import type { TransactionSnapshot } from "$lib/types/Repair"

const base: TransactionSnapshot = {
  id: "TRX-TEST",
  items: [{ id: "SKU-001", qty: 2, price: 50000, isFree: false }],
  pricing: {
    subtotal: 100000, percentDiscount: 0, fixedDiscount: 0,
    additionalCost: { packaging: 0, transport: 0, modification: 0 },
    total: 100000
  },
  paymentMethods: [{ method: "Tunai", amount: 100000 }],
  notes: "",
  mode: "order",
  memberId: null,
  keterangan: "Pesanan awal",
  tanggalKirim: "2026-05-03",
  jamKirimPesanan: "10:00",
  statusPesanan: "Dikirim",
  kontakWhatsApp: "08123456789"
}

describe("getChangedFields", () => {
  it("returns empty array when snapshots are identical", () => {
    expect(getChangedFields(base, { ...base })).toEqual([])
  })

  it("detects a single changed scalar field", () => {
    const proposed = { ...base, statusPesanan: "Diambil" as const }
    const changed = getChangedFields(base, proposed)
    expect(changed).toContain("statusPesanan")
    expect(changed).toHaveLength(1)
  })

  it("detects multiple changed fields", () => {
    const proposed = { ...base, keterangan: "Diubah", tanggalKirim: "2026-05-10" }
    expect(getChangedFields(base, proposed)).toEqual(
      expect.arrayContaining(["keterangan", "tanggalKirim"])
    )
  })

  it("detects changes in nested arrays (items)", () => {
    const proposed = { ...base, items: [{ id: "SKU-001", qty: 3, price: 50000, isFree: false }] }
    expect(getChangedFields(base, proposed)).toContain("items")
  })
})
```

- [ ] **Step 1.4: Run tests — expect FAIL (function not defined yet)**

```bash
npx vitest run src/library/utils/repairDiff.test.ts
```
Expected: test file errors — `getChangedFields` not exported.

- [ ] **Step 1.5: Run tests after Step 1.2 — expect PASS**

```bash
npx vitest run src/library/utils/repairDiff.test.ts
```
Expected: 4 tests PASS.

- [ ] **Step 1.6: Create mock versions**

```typescript
// src/library/mock/versions.ts
import type { VersionedTransaction, TransactionSnapshot } from "$lib/types/Repair"

const base: TransactionSnapshot = {
  id: "",
  items: [{ id: "SKU-001", qty: 2, price: 50000, isFree: false }],
  pricing: {
    subtotal: 100000, percentDiscount: 0, fixedDiscount: 0,
    additionalCost: { packaging: 5000, transport: 10000, modification: 0 },
    total: 115000
  },
  paymentMethods: [{ method: "Tunai", amount: 115000 }],
  notes: "",
  mode: "order",
  memberId: null,
  keterangan: "Pesanan reguler",
  tanggalKirim: "2026-05-03",
  jamKirimPesanan: "10:00",
  statusPesanan: "Dikirim",
  kontakWhatsApp: "08123456789"
}

export const mockVersionedTransactions: VersionedTransaction[] = [
  // TRX-001: 2 versions (original + instant), no pending request
  {
    id: "TRX-001",
    currentVersionIndex: 2,
    versions: [
      {
        index: 1, type: "original",
        snapshot: { ...base, id: "TRX-001" },
        changedFields: [], createdBy: "cashier-01",
        createdAt: "2026-05-01T08:00:00Z", requestId: null
      },
      {
        index: 2, type: "instant",
        snapshot: { ...base, id: "TRX-001", statusPesanan: "Diambil" },
        changedFields: ["statusPesanan"], createdBy: "cashier-01",
        createdAt: "2026-05-02T09:00:00Z", requestId: null
      }
    ],
    pendingRequest: null,
    isDeleted: false
  },
  // TRX-002: 1 version, pending PT request
  {
    id: "TRX-002",
    currentVersionIndex: 1,
    versions: [
      {
        index: 1, type: "original",
        snapshot: {
          ...base, id: "TRX-002",
          items: [{ id: "SKU-002", qty: 1, price: 75000, isFree: false }],
          pricing: { subtotal: 75000, percentDiscount: 0, fixedDiscount: 0, additionalCost: { packaging: 0, transport: 0, modification: 0 }, total: 75000 }
        },
        changedFields: [], createdBy: "cashier-02",
        createdAt: "2026-05-01T10:00:00Z", requestId: null
      }
    ],
    pendingRequest: {
      id: "REQ-001", transactionId: "TRX-002", status: "pending",
      proposedSnapshot: {
        ...base, id: "TRX-002",
        items: [{ id: "SKU-002", qty: 2, price: 75000, isFree: false }],
        pricing: { subtotal: 150000, percentDiscount: 0, fixedDiscount: 0, additionalCost: { packaging: 0, transport: 0, modification: 0 }, total: 150000 }
      },
      submittedBy: "cashier-02", submittedAt: "2026-05-02T11:00:00Z",
      rejectionReason: null, revisions: 0
    },
    isDeleted: false
  },
  // TRX-003: 1 version, rejected PT request (revision scenario)
  {
    id: "TRX-003",
    currentVersionIndex: 1,
    versions: [
      {
        index: 1, type: "original",
        snapshot: { ...base, id: "TRX-003", keterangan: "Pesanan express" },
        changedFields: [], createdBy: "cashier-01",
        createdAt: "2026-05-01T12:00:00Z", requestId: null
      }
    ],
    pendingRequest: {
      id: "REQ-002", transactionId: "TRX-003", status: "rejected",
      proposedSnapshot: { ...base, id: "TRX-003", keterangan: "Pesanan express — direvisi" },
      submittedBy: "cashier-01", submittedAt: "2026-05-01T14:00:00Z",
      rejectionReason: "Keterangan tidak sesuai standar penulisan", revisions: 0
    },
    isDeleted: false
  }
]
```

- [ ] **Step 1.7: Create mock repair-requests**

```typescript
// src/library/mock/repair-requests.ts
import type { RepairRequest } from "$lib/types/Repair"
import { mockVersionedTransactions } from "./versions"

// Derived from mockVersionedTransactions so they stay in sync at startup.
// useRepair.ts pushes new entries here at runtime.
export const mockRepairRequests: RepairRequest[] = mockVersionedTransactions
  .filter(t => t.pendingRequest !== null)
  .map(t => t.pendingRequest!)
```

- [ ] **Step 1.8: Commit**

```bash
git add src/library/types/Repair.ts src/library/utils/repairDiff.ts src/library/utils/repairDiff.test.ts src/library/mock/versions.ts src/library/mock/repair-requests.ts
git commit -m "feat: add Perbaikan Transaksi types, diff utility, and mock data"
```

---

## Task 2: Version History Viewer

**Files:**
- Create: `src/library/components/outlet/repair/VersionTimeline.svelte`
- Create: `src/library/components/outlet/repair/VersionDiff.svelte`
- Modify: `src/routes/outlet/history/retail/+page.svelte`

- [ ] **Step 2.1: Create VersionTimeline.svelte**

```svelte
<!-- src/library/components/outlet/repair/VersionTimeline.svelte -->
<script lang="ts">
  import type { Version, RepairRequest } from "$lib/types/Repair"

  export let versions: Version[]
  export let currentVersionIndex: number
  export let pendingRequest: RepairRequest | null = null
  export let onSelectVersion: (v: Version) => void = () => {}

  const typeColor: Record<Version["type"], string> = {
    original: "badge-secondary",
    instant: "badge-success",
    approved: "badge-error"
  }

  const typeLabel: Record<Version["type"], string> = {
    original: "Original",
    instant: "Instan",
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

    {#if pendingRequest && pendingRequest.status === "pending"}
      <div class="flex items-center gap-3 p-3 rounded-lg border border-warning bg-warning/10">
        <div class="font-bold text-lg w-8 text-center opacity-50">⏳</div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="badge badge-sm badge-warning">Menunggu Persetujuan</span>
          </div>
          <div class="text-xs opacity-50 mt-0.5">{formatDate(pendingRequest.submittedAt)} · {pendingRequest.submittedBy}</div>
        </div>
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 2.2: Create VersionDiff.svelte**

```svelte
<!-- src/library/components/outlet/repair/VersionDiff.svelte -->
<script lang="ts">
  import type { Version, TransactionSnapshot } from "$lib/types/Repair"

  export let versionA: Version   // before
  export let versionB: Version   // after

  const FIELD_LABELS: Partial<Record<keyof TransactionSnapshot, string>> = {
    items: "Item / Qty",
    paymentMethods: "Metode Pembayaran",
    pricing: "Harga",
    keterangan: "Keterangan",
    tanggalKirim: "Tanggal Kirim",
    jamKirimPesanan: "Jam Kirim",
    statusPesanan: "Status Pesanan",
    kontakWhatsApp: "Kontak WhatsApp",
    notes: "Catatan",
    memberId: "Member"
  }

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return "-"
    if (typeof val === "object") return JSON.stringify(val, null, 2)
    return String(val)
  }

  $: changedFields = versionB.changedFields.length > 0
    ? versionB.changedFields
    : (Object.keys(versionB.snapshot) as Array<keyof TransactionSnapshot>).filter(
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
      {@const label = FIELD_LABELS[field as keyof TransactionSnapshot] ?? field}
      {@const oldVal = formatValue(versionA.snapshot[field as keyof TransactionSnapshot])}
      {@const newVal = formatValue(versionB.snapshot[field as keyof TransactionSnapshot])}
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

- [ ] **Step 2.3: Add version viewer to history page**

In `src/routes/outlet/history/retail/+page.svelte`, add to the `<script>` block:

```svelte
<script lang="ts">
  // Add alongside existing imports:
  import VersionTimeline from "$lib/components/outlet/repair/VersionTimeline.svelte"
  import VersionDiff from "$lib/components/outlet/repair/VersionDiff.svelte"
  import { mockVersionedTransactions } from "$lib/mock/versions"
  import type { Version, VersionedTransaction } from "$lib/types/Repair"

  let versionViewTarget: VersionedTransaction | null = null
  let selectedVersion: Version | null = null

  function openVersionHistory(transactionId: string) {
    versionViewTarget = mockVersionedTransactions.find(t => t.id === transactionId) ?? null
    selectedVersion = null
  }
</script>
```

Add "Lihat Versi" button in each transaction row:

```svelte
<button class="btn btn-xs btn-ghost" on:click={() => openVersionHistory(transaction.id)}>
  Lihat Versi
</button>
```

Add the modal after the transaction list:

```svelte
{#if versionViewTarget}
  <dialog class="modal modal-open">
    <div class="modal-box max-w-2xl">
      <h3 class="font-bold text-lg mb-4">Riwayat Versi — {versionViewTarget.id}</h3>
      <VersionTimeline
        versions={versionViewTarget.versions}
        currentVersionIndex={versionViewTarget.currentVersionIndex}
        pendingRequest={versionViewTarget.pendingRequest}
        onSelectVersion={(v) => selectedVersion = v}
      />
      {#if selectedVersion && selectedVersion.index > 1}
        <div class="divider">Perubahan pada V{selectedVersion.index}</div>
        <VersionDiff
          versionA={versionViewTarget.versions[selectedVersion.index - 2]}
          versionB={selectedVersion}
        />
      {/if}
      <div class="modal-action">
        <button class="btn" on:click={() => { versionViewTarget = null; selectedVersion = null }}>Tutup</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" on:submit={() => versionViewTarget = null}>
      <button>close</button>
    </form>
  </dialog>
{/if}
```

- [ ] **Step 2.4: Verify in dev server**

```bash
npm run dev
```
Navigate to history page. Click "Lihat Versi" on TRX-001. Expected: timeline shows V1 (Original, purple) and V2 (Instan, green). Click V2 → diff shows `statusPesanan` changed from "Dikirim" to "Diambil".

- [ ] **Step 2.5: Commit**

```bash
git add src/library/components/outlet/repair/VersionTimeline.svelte src/library/components/outlet/repair/VersionDiff.svelte src/routes/outlet/history/retail/+page.svelte
git commit -m "feat: add version history viewer with timeline and field diff"
```

---

## Task 3: Perbaikan Transaksi Instan (PTI)

**Files:**
- Create: `src/library/hooks/useInstantRepair.ts`
- Create: `src/library/components/outlet/repair/InstantRepairModal.svelte`
- Modify: `src/routes/outlet/history/retail/+page.svelte`

- [ ] **Step 3.1: Create useInstantRepair.ts**

```typescript
// src/library/hooks/useInstantRepair.ts
import { get } from "svelte/store"
import { auth } from "$lib/stores/auth"
import { getChangedFields } from "$lib/utils/repairDiff"
import { PTI_ALLOWED_FIELDS } from "$lib/types/Repair"
import type { PTIField, TransactionSnapshot, VersionedTransaction } from "$lib/types/Repair"
import { mockVersionedTransactions } from "$lib/mock/versions"

interface InstantRepairPayload {
  transactionId: string
  changes: Partial<Pick<TransactionSnapshot, PTIField>>
}

interface InstantRepairResult {
  success: boolean
  transaction?: VersionedTransaction
  error?: string
}

async function submitInstantRepair(payload: InstantRepairPayload): Promise<InstantRepairResult> {
  const $auth = get(auth)
  const txIndex = mockVersionedTransactions.findIndex(t => t.id === payload.transactionId)
  if (txIndex === -1) return { success: false, error: "Transaksi tidak ditemukan" }

  const forbiddenFields = Object.keys(payload.changes).filter(
    k => !(PTI_ALLOWED_FIELDS as readonly string[]).includes(k)
  )
  if (forbiddenFields.length > 0) {
    return { success: false, error: `Field tidak diizinkan untuk Perbaikan Instan: ${forbiddenFields.join(", ")}` }
  }

  const tx = mockVersionedTransactions[txIndex]
  const currentSnapshot = tx.versions[tx.currentVersionIndex - 1].snapshot
  const newSnapshot: TransactionSnapshot = { ...currentSnapshot, ...payload.changes }

  const newVersion = {
    index: tx.currentVersionIndex + 1,
    type: "instant" as const,
    snapshot: newSnapshot,
    changedFields: getChangedFields(currentSnapshot, newSnapshot),
    createdBy: $auth.userId,
    createdAt: new Date().toISOString(),
    requestId: null
  }

  mockVersionedTransactions[txIndex] = {
    ...tx,
    currentVersionIndex: tx.currentVersionIndex + 1,
    versions: [...tx.versions, newVersion]
  }

  return { success: true, transaction: mockVersionedTransactions[txIndex] }
}

export { submitInstantRepair }
export type { InstantRepairPayload, InstantRepairResult }
```

- [ ] **Step 3.2: Create InstantRepairModal.svelte**

```svelte
<!-- src/library/components/outlet/repair/InstantRepairModal.svelte -->
<script lang="ts">
  import type { VersionedTransaction, TransactionSnapshot, PTIField } from "$lib/types/Repair"
  import { submitInstantRepair } from "$lib/hooks/useInstantRepair"

  export let transaction: VersionedTransaction
  export let onClose: () => void
  export let onSaved: (updated: VersionedTransaction) => void

  const current = transaction.versions[transaction.currentVersionIndex - 1].snapshot

  let keterangan = current.keterangan
  let tanggalKirim = current.tanggalKirim
  let jamKirimPesanan = current.jamKirimPesanan
  let statusPesanan: "Dikirim" | "Diambil" = current.statusPesanan
  let kontakWhatsApp = current.kontakWhatsApp
  let loading = false
  let error = ""

  async function handleSave() {
    loading = true
    error = ""

    const changes: Partial<Pick<TransactionSnapshot, PTIField>> = {
      keterangan, tanggalKirim, jamKirimPesanan, statusPesanan, kontakWhatsApp
    }

    const result = await submitInstantRepair({ transactionId: transaction.id, changes })

    if (result.success && result.transaction) {
      onSaved(result.transaction)
      onClose()
    } else {
      error = result.error ?? "Terjadi kesalahan"
    }
    loading = false
  }
</script>

<dialog class="modal modal-open">
  <div class="modal-box max-w-lg">
    <h3 class="font-bold text-lg mb-1">Perbaikan Transaksi Instan</h3>
    <p class="text-sm opacity-60 mb-4">{transaction.id} · Perubahan langsung, tanpa persetujuan admin</p>

    {#if error}
      <div class="alert alert-error text-sm mb-4">{error}</div>
    {/if}

    <div class="flex flex-col gap-3">
      <label class="form-control">
        <div class="label"><span class="label-text">Keterangan</span></div>
        <textarea class="textarea textarea-bordered" rows="2" bind:value={keterangan}></textarea>
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="form-control">
          <div class="label"><span class="label-text">Tanggal Kirim</span></div>
          <input type="date" class="input input-bordered" bind:value={tanggalKirim} />
        </label>
        <label class="form-control">
          <div class="label"><span class="label-text">Jam Kirim</span></div>
          <input type="time" class="input input-bordered" bind:value={jamKirimPesanan} />
        </label>
      </div>

      <label class="form-control">
        <div class="label"><span class="label-text">Status Pesanan</span></div>
        <select class="select select-bordered" bind:value={statusPesanan}>
          <option value="Dikirim">Dikirim</option>
          <option value="Diambil">Diambil</option>
        </select>
      </label>

      <label class="form-control">
        <div class="label"><span class="label-text">Kontak WhatsApp</span></div>
        <input type="tel" class="input input-bordered" bind:value={kontakWhatsApp} placeholder="08xxxxxxxxxx" />
      </label>
    </div>

    <div class="modal-action">
      <button class="btn btn-ghost" disabled={loading} on:click={onClose}>Batal</button>
      <button class="btn btn-success" disabled={loading} on:click={handleSave}>
        {#if loading}<span class="loading loading-spinner loading-sm mr-1"></span>{/if}
        Simpan
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop" on:submit={onClose}><button>close</button></form>
</dialog>
```

- [ ] **Step 3.3: Add PTI button to history page**

In `src/routes/outlet/history/retail/+page.svelte`, add to `<script>`:

```svelte
<script lang="ts">
  // Add alongside existing imports:
  import InstantRepairModal from "$lib/components/outlet/repair/InstantRepairModal.svelte"

  let ptiTarget: VersionedTransaction | null = null

  function openInstantRepair(transactionId: string) {
    ptiTarget = mockVersionedTransactions.find(t => t.id === transactionId) ?? null
  }

  function handlePtiSaved(updated: VersionedTransaction) {
    const idx = mockVersionedTransactions.findIndex(t => t.id === updated.id)
    if (idx !== -1) mockVersionedTransactions[idx] = updated
    ptiTarget = null
  }
</script>
```

Add button in each transaction row:

```svelte
<button class="btn btn-xs btn-outline btn-success" on:click={() => openInstantRepair(transaction.id)}>
  Perbaikan Instan
</button>
```

Add modal after the list:

```svelte
{#if ptiTarget}
  <InstantRepairModal
    transaction={ptiTarget}
    onClose={() => ptiTarget = null}
    onSaved={handlePtiSaved}
  />
{/if}
```

- [ ] **Step 3.4: Verify in dev server**

```bash
npm run dev
```
Click "Perbaikan Instan" on TRX-001. Change `statusPesanan` to "Diambil". Click Simpan. Open "Lihat Versi" — expect a new V3 of type "instant" with `changedFields: ["statusPesanan"]`.

- [ ] **Step 3.5: Commit**

```bash
git add src/library/hooks/useInstantRepair.ts src/library/components/outlet/repair/InstantRepairModal.svelte src/routes/outlet/history/retail/+page.svelte
git commit -m "feat: implement Perbaikan Transaksi Instan (PTI)"
```

---

## Task 4: PT — User Request Form & Store

**Files:**
- Create: `src/library/stores/repair.ts`
- Create: `src/library/hooks/useRepair.ts`
- Create: `src/library/components/outlet/repair/RepairRequestModal.svelte`
- Modify: `src/routes/outlet/history/retail/+page.svelte`

- [ ] **Step 4.1: Create repair store**

```typescript
// src/library/stores/repair.ts
import { writable } from "svelte/store"
import type { VersionedTransaction } from "$lib/types/Repair"

// Tracks which transaction's PT modal is open
const activeRepairTransaction = writable<VersionedTransaction | null>(null)

export { activeRepairTransaction }
```

- [ ] **Step 4.2: Create useRepair.ts (user actions only)**

```typescript
// src/library/hooks/useRepair.ts
import { get } from "svelte/store"
import { auth } from "$lib/stores/auth"
import { getChangedFields } from "$lib/utils/repairDiff"
import type { RepairRequest, TransactionSnapshot, VersionedTransaction } from "$lib/types/Repair"
import { mockVersionedTransactions } from "$lib/mock/versions"
import { mockRepairRequests } from "$lib/mock/repair-requests"

async function submitRepairRequest(
  transactionId: string,
  proposedSnapshot: TransactionSnapshot
): Promise<{ success: boolean; request?: RepairRequest; error?: string }> {
  const $auth = get(auth)
  const tx = mockVersionedTransactions.find(t => t.id === transactionId)
  if (!tx) return { success: false, error: "Transaksi tidak ditemukan" }
  if (tx.pendingRequest?.status === "pending") {
    return { success: false, error: "Sudah ada permintaan perbaikan yang menunggu persetujuan" }
  }

  const request: RepairRequest = {
    id: `REQ-${Date.now()}`,
    transactionId,
    status: "pending",
    proposedSnapshot,
    submittedBy: $auth.userId,
    submittedAt: new Date().toISOString(),
    rejectionReason: null,
    revisions: 0
  }

  tx.pendingRequest = request
  mockRepairRequests.push(request)
  return { success: true, request }
}

async function reviseRepairRequest(
  requestId: string,
  proposedSnapshot: TransactionSnapshot
): Promise<{ success: boolean; error?: string }> {
  const request = mockRepairRequests.find(r => r.id === requestId)
  if (!request) return { success: false, error: "Permintaan tidak ditemukan" }

  request.proposedSnapshot = proposedSnapshot
  request.status = "pending"
  request.rejectionReason = null
  request.revisions += 1

  const tx = mockVersionedTransactions.find(t => t.id === request.transactionId)
  if (tx) tx.pendingRequest = { ...request }

  return { success: true }
}

async function deleteRepairRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const request = mockRepairRequests.find(r => r.id === requestId)
  if (!request) return { success: false, error: "Permintaan tidak ditemukan" }

  request.status = "deleted"
  const tx = mockVersionedTransactions.find(t => t.id === request.transactionId)
  if (tx) tx.pendingRequest = null

  return { success: true }
}

export { submitRepairRequest, reviseRepairRequest, deleteRepairRequest }
```

- [ ] **Step 4.3: Create RepairRequestModal.svelte**

```svelte
<!-- src/library/components/outlet/repair/RepairRequestModal.svelte -->
<script lang="ts">
  import type { VersionedTransaction, TransactionSnapshot } from "$lib/types/Repair"
  import { submitRepairRequest, reviseRepairRequest, deleteRepairRequest } from "$lib/hooks/useRepair"

  export let transaction: VersionedTransaction
  export let onClose: () => void
  export let onUpdated: (updated: VersionedTransaction) => void

  const pending = transaction.pendingRequest
  const isRevision = pending?.status === "rejected"
  // Pre-fill from proposed snapshot if revising, otherwise from current version
  const prefill: TransactionSnapshot = isRevision && pending
    ? pending.proposedSnapshot
    : transaction.versions[transaction.currentVersionIndex - 1].snapshot
  const current = transaction.versions[transaction.currentVersionIndex - 1].snapshot

  // Editable state — mirrors TransactionSnapshot fields
  let items = JSON.parse(JSON.stringify(prefill.items)) as TransactionSnapshot["items"]
  let keterangan = prefill.keterangan
  let tanggalKirim = prefill.tanggalKirim
  let jamKirimPesanan = prefill.jamKirimPesanan
  let statusPesanan: "Dikirim" | "Diambil" = prefill.statusPesanan
  let kontakWhatsApp = prefill.kontakWhatsApp
  let notes = prefill.notes
  let memberId = prefill.memberId
  let paymentMethods = JSON.parse(JSON.stringify(prefill.paymentMethods)) as TransactionSnapshot["paymentMethods"]
  let pricing = JSON.parse(JSON.stringify(prefill.pricing)) as TransactionSnapshot["pricing"]

  let loading = false
  let error = ""
  let confirmDelete = false

  function buildProposed(): TransactionSnapshot {
    return {
      ...current,
      items, keterangan, tanggalKirim, jamKirimPesanan,
      statusPesanan, kontakWhatsApp, notes, memberId, paymentMethods, pricing
    }
  }

  async function handleSubmit() {
    loading = true
    error = ""
    const proposed = buildProposed()
    const result = isRevision && pending
      ? await reviseRepairRequest(pending.id, proposed)
      : await submitRepairRequest(transaction.id, proposed)

    if (result.success) {
      onUpdated({ ...transaction })
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
      onUpdated({ ...transaction, pendingRequest: null })
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
    <h3 class="font-bold text-lg mb-1">Perbaikan Transaksi</h3>
    <p class="text-sm opacity-60 mb-4">{transaction.id} · Memerlukan persetujuan admin</p>

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

    <div class="flex flex-col gap-3">
      <!-- Items -->
      <div>
        <div class="label"><span class="label-text font-semibold">Item</span></div>
        {#each items as item, i}
          <div class="flex gap-2 mb-2">
            <input class="input input-bordered input-sm flex-1" bind:value={item.id} placeholder="SKU" />
            <input class="input input-bordered input-sm w-20" type="number" min="1" bind:value={item.qty} />
            <input class="input input-bordered input-sm w-28" type="number" min="0" bind:value={item.price} />
            <label class="flex items-center gap-1 text-xs">
              <input type="checkbox" class="checkbox checkbox-sm" bind:checked={item.isFree} /> Gratis
            </label>
          </div>
        {/each}
      </div>

      <!-- Payment -->
      <div>
        <div class="label"><span class="label-text font-semibold">Metode Pembayaran</span></div>
        {#each paymentMethods as pm}
          <div class="flex gap-2 mb-2">
            <select class="select select-bordered select-sm flex-1" bind:value={pm.method}>
              <option>Tunai</option>
              <option>QRIS</option>
            </select>
            <input class="input input-bordered input-sm w-36" type="number" min="0" bind:value={pm.amount} />
          </div>
        {/each}
      </div>

      <!-- Logistical fields -->
      <div class="grid grid-cols-2 gap-3">
        <label class="form-control">
          <div class="label"><span class="label-text">Tanggal Kirim</span></div>
          <input type="date" class="input input-bordered" bind:value={tanggalKirim} />
        </label>
        <label class="form-control">
          <div class="label"><span class="label-text">Jam Kirim</span></div>
          <input type="time" class="input input-bordered" bind:value={jamKirimPesanan} />
        </label>
      </div>

      <label class="form-control">
        <div class="label"><span class="label-text">Status Pesanan</span></div>
        <select class="select select-bordered" bind:value={statusPesanan}>
          <option value="Dikirim">Dikirim</option>
          <option value="Diambil">Diambil</option>
        </select>
      </label>

      <label class="form-control">
        <div class="label"><span class="label-text">Keterangan</span></div>
        <textarea class="textarea textarea-bordered" rows="2" bind:value={keterangan}></textarea>
      </label>

      <label class="form-control">
        <div class="label"><span class="label-text">Kontak WhatsApp</span></div>
        <input type="tel" class="input input-bordered" bind:value={kontakWhatsApp} />
      </label>

      <label class="form-control">
        <div class="label"><span class="label-text">Catatan</span></div>
        <textarea class="textarea textarea-bordered" rows="2" bind:value={notes}></textarea>
      </label>
    </div>

    <div class="modal-action flex justify-between">
      <div>
        {#if pending && (pending.status === "pending" || pending.status === "rejected")}
          {#if confirmDelete}
            <span class="text-sm opacity-60 mr-2">Yakin hapus permintaan?</span>
            <button class="btn btn-error btn-sm" disabled={loading} on:click={handleDeleteRequest}>Ya, Hapus</button>
            <button class="btn btn-ghost btn-sm" on:click={() => confirmDelete = false}>Batal</button>
          {:else}
            <button class="btn btn-ghost btn-sm text-error" on:click={() => confirmDelete = true}>
              Hapus Permintaan
            </button>
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

- [ ] **Step 4.4: Add PT button and lock badge to history page**

In `src/routes/outlet/history/retail/+page.svelte`, add to `<script>`:

```svelte
<script lang="ts">
  // Add alongside existing imports:
  import RepairRequestModal from "$lib/components/outlet/repair/RepairRequestModal.svelte"

  let ptTarget: VersionedTransaction | null = null

  function openRepairRequest(transactionId: string) {
    const tx = mockVersionedTransactions.find(t => t.id === transactionId)
    if (!tx) return
    // Open if: no request, or request is rejected (allow revision)
    if (!tx.pendingRequest || tx.pendingRequest.status === "rejected") ptTarget = tx
  }

  function handlePtUpdated(updated: VersionedTransaction) {
    const idx = mockVersionedTransactions.findIndex(t => t.id === updated.id)
    if (idx !== -1) mockVersionedTransactions[idx] = updated
    ptTarget = null
  }
</script>
```

In each transaction row, replace (or add alongside) the PT button area:

```svelte
{#if transaction.pendingRequest?.status === "pending"}
  <span class="badge badge-warning badge-sm gap-1">⏳ Menunggu Admin</span>
{:else}
  <button
    class="btn btn-xs btn-outline btn-primary"
    on:click={() => openRepairRequest(transaction.id)}
  >
    {transaction.pendingRequest?.status === "rejected" ? "Revisi" : "Perbaikan"}
  </button>
{/if}
```

Add modal:

```svelte
{#if ptTarget}
  <RepairRequestModal
    transaction={ptTarget}
    onClose={() => ptTarget = null}
    onUpdated={handlePtUpdated}
  />
{/if}
```

- [ ] **Step 4.5: Verify in dev server**

```bash
npm run dev
```
- TRX-001 (no pending): click "Perbaikan" → form opens with current snapshot → change item qty → "Submit Request" → row now shows "⏳ Menunggu Admin".
- TRX-003 (rejected): click "Revisi" → form shows yellow rejection banner pre-filled with proposed snapshot → button labelled "Kirim Ulang".

- [ ] **Step 4.6: Commit**

```bash
git add src/library/stores/repair.ts src/library/hooks/useRepair.ts src/library/components/outlet/repair/RepairRequestModal.svelte src/routes/outlet/history/retail/+page.svelte
git commit -m "feat: implement PT user request form, revision flow, and lock state"
```

---

## Task 5: PT — Admin Queue & Diff View

**Files:**
- Create: `src/library/components/outlet/repair/AdminRepairQueue.svelte`
- Create: `src/library/components/outlet/repair/AdminDiffView.svelte`
- Create: `src/routes/outlet/repair/+page.svelte`

- [ ] **Step 5.1: Create AdminRepairQueue.svelte**

```svelte
<!-- src/library/components/outlet/repair/AdminRepairQueue.svelte -->
<script lang="ts">
  import type { VersionedTransaction } from "$lib/types/Repair"
  import { mockVersionedTransactions } from "$lib/mock/versions"

  export let onSelect: (tx: VersionedTransaction) => void

  $: queue = mockVersionedTransactions.filter(
    t => t.pendingRequest?.status === "pending" && !t.isDeleted
  )

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })
  }
</script>

<div class="flex flex-col gap-3">
  <h2 class="text-xl font-bold">Antrian Perbaikan Transaksi</h2>

  {#if queue.length === 0}
    <div class="py-16 text-center opacity-40 text-sm">Tidak ada permintaan yang menunggu persetujuan</div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each queue as tx}
        {@const req = tx.pendingRequest!}
        <button
          class="flex items-center gap-4 p-4 rounded-xl border border-base-300 hover:bg-base-200 text-left transition-colors w-full"
          on:click={() => onSelect(tx)}
        >
          <div class="flex-1 min-w-0">
            <div class="font-semibold">{tx.id}</div>
            <div class="text-sm opacity-60 mt-0.5">Diajukan oleh {req.submittedBy} · {formatDate(req.submittedAt)}</div>
            {#if req.revisions > 0}
              <div class="text-xs text-warning mt-1">Revisi ke-{req.revisions}</div>
            {/if}
          </div>
          <span class="badge badge-warning">Menunggu</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 5.2: Create AdminDiffView.svelte**

```svelte
<!-- src/library/components/outlet/repair/AdminDiffView.svelte -->
<script lang="ts">
  import type { VersionedTransaction, Version } from "$lib/types/Repair"
  import VersionDiff from "./VersionDiff.svelte"

  export let transaction: VersionedTransaction
  export let loading = false
  export let onAction: (
    action: "approve" | "reject" | "delete-request" | "delete-transaction",
    reason?: string
  ) => void

  const currentVersion = transaction.versions[transaction.currentVersionIndex - 1]
  const req = transaction.pendingRequest!

  // Synthetic version for the diff — represents the proposed state
  const proposedVersion: Version = {
    index: transaction.currentVersionIndex + 1,
    type: "approved",
    snapshot: req.proposedSnapshot,
    changedFields: [],
    createdBy: req.submittedBy,
    createdAt: req.submittedAt,
    requestId: req.id
  }

  let showRejectInput = false
  let rejectionReason = ""
  let confirmDeleteTx = false

  function submitReject() {
    if (!rejectionReason.trim()) return
    onAction("reject", rejectionReason.trim())
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h3 class="font-bold text-lg">{transaction.id}</h3>
      <p class="text-sm opacity-60">
        Diajukan: {req.submittedBy} ·
        V{transaction.currentVersionIndex} → V{transaction.currentVersionIndex + 1}
        {#if req.revisions > 0}· Revisi ke-{req.revisions}{/if}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-success btn-sm" disabled={loading} on:click={() => onAction("approve")}>
        ✓ Setujui
      </button>
      <button class="btn btn-warning btn-sm" disabled={loading} on:click={() => showRejectInput = !showRejectInput}>
        ✗ Tolak
      </button>
      <button class="btn btn-ghost btn-sm" disabled={loading} on:click={() => onAction("delete-request")}>
        Hapus Permintaan
      </button>
      {#if confirmDeleteTx}
        <button class="btn btn-error btn-sm" disabled={loading} on:click={() => onAction("delete-transaction")}>
          Yakin Hapus Transaksi?
        </button>
        <button class="btn btn-ghost btn-sm" on:click={() => confirmDeleteTx = false}>Batal</button>
      {:else}
        <button class="btn btn-ghost btn-sm text-error" disabled={loading} on:click={() => confirmDeleteTx = true}>
          Hapus Transaksi
        </button>
      {/if}
    </div>
  </div>

  {#if showRejectInput}
    <div class="flex gap-2 items-end">
      <label class="form-control flex-1">
        <div class="label"><span class="label-text">Alasan penolakan</span></div>
        <input
          class="input input-bordered"
          bind:value={rejectionReason}
          placeholder="Jelaskan alasan penolakan kepada pengaju..."
        />
      </label>
      <button class="btn btn-error" disabled={!rejectionReason.trim() || loading} on:click={submitReject}>
        Kirim Penolakan
      </button>
    </div>
  {/if}

  <div class="divider">Perbandingan Perubahan</div>
  <VersionDiff versionA={currentVersion} versionB={proposedVersion} />
</div>
```

- [ ] **Step 5.3: Create admin repair page**

```svelte
<!-- src/routes/outlet/repair/+page.svelte -->
<script lang="ts">
  import AdminRepairQueue from "$lib/components/outlet/repair/AdminRepairQueue.svelte"
  import AdminDiffView from "$lib/components/outlet/repair/AdminDiffView.svelte"
  import type { VersionedTransaction } from "$lib/types/Repair"

  let selected: VersionedTransaction | null = null
</script>

<div class="p-6 max-w-5xl mx-auto">
  {#if selected}
    <button class="btn btn-ghost btn-sm mb-4" on:click={() => selected = null}>
      ← Kembali ke Antrian
    </button>
    <AdminDiffView transaction={selected} onAction={() => {}} />
  {:else}
    <AdminRepairQueue onSelect={(tx) => selected = tx} />
  {/if}
</div>
```

- [ ] **Step 5.4: Verify in dev server**

```bash
npm run dev
```
Navigate to `/outlet/repair`. TRX-002 (pending) appears in queue. Click it → AdminDiffView shows side-by-side diff: original qty 1 vs proposed qty 2. All action buttons are visible (Setujui, Tolak, Hapus Permintaan, Hapus Transaksi).

- [ ] **Step 5.5: Commit**

```bash
git add src/library/components/outlet/repair/AdminRepairQueue.svelte src/library/components/outlet/repair/AdminDiffView.svelte src/routes/outlet/repair/+page.svelte
git commit -m "feat: add admin repair queue page and diff view"
```

---

## Task 6: PT — Admin Approve / Reject / Delete Actions

**Files:**
- Modify: `src/library/hooks/useRepair.ts` (append admin functions + update export)
- Modify: `src/routes/outlet/repair/+page.svelte` (wire up `onAction`)

- [ ] **Step 6.1: Append admin functions to useRepair.ts**

Add these functions after `deleteRepairRequest` in `src/library/hooks/useRepair.ts`. All imports are already present from Task 4.2.

```typescript
async function approveRepairRequest(transactionId: string): Promise<{ success: boolean; error?: string }> {
  const $auth = get(auth)
  const tx = mockVersionedTransactions.find(t => t.id === transactionId)
  if (!tx || !tx.pendingRequest) return { success: false, error: "Permintaan tidak ditemukan" }

  const req = tx.pendingRequest
  const currentSnapshot = tx.versions[tx.currentVersionIndex - 1].snapshot

  const newVersion = {
    index: tx.currentVersionIndex + 1,
    type: "approved" as const,
    snapshot: req.proposedSnapshot,
    changedFields: getChangedFields(currentSnapshot, req.proposedSnapshot),
    createdBy: $auth.userId,
    createdAt: new Date().toISOString(),
    requestId: req.id
  }

  tx.versions.push(newVersion)
  tx.currentVersionIndex += 1
  tx.pendingRequest = null
  req.status = "deleted"

  return { success: true }
}

async function rejectRepairRequest(
  transactionId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const tx = mockVersionedTransactions.find(t => t.id === transactionId)
  if (!tx || !tx.pendingRequest) return { success: false, error: "Permintaan tidak ditemukan" }

  tx.pendingRequest.status = "rejected"
  tx.pendingRequest.rejectionReason = reason

  const req = mockRepairRequests.find(r => r.id === tx.pendingRequest!.id)
  if (req) { req.status = "rejected"; req.rejectionReason = reason }

  return { success: true }
}

async function deleteTransaction(transactionId: string): Promise<{ success: boolean; error?: string }> {
  const tx = mockVersionedTransactions.find(t => t.id === transactionId)
  if (!tx) return { success: false, error: "Transaksi tidak ditemukan" }

  tx.isDeleted = true
  tx.pendingRequest = null

  return { success: true }
}
```

Replace the export line at the bottom of `useRepair.ts`:

```typescript
export { submitRepairRequest, reviseRepairRequest, deleteRepairRequest, approveRepairRequest, rejectRepairRequest, deleteTransaction }
```

- [ ] **Step 6.2: Wire admin actions into repair page**

Replace `src/routes/outlet/repair/+page.svelte` with:

```svelte
<script lang="ts">
  import AdminRepairQueue from "$lib/components/outlet/repair/AdminRepairQueue.svelte"
  import AdminDiffView from "$lib/components/outlet/repair/AdminDiffView.svelte"
  import type { VersionedTransaction } from "$lib/types/Repair"
  import { approveRepairRequest, rejectRepairRequest, deleteRepairRequest, deleteTransaction } from "$lib/hooks/useRepair"

  let selected: VersionedTransaction | null = null
  let actionLoading = false
  let actionError = ""

  async function handleAction(
    action: "approve" | "reject" | "delete-request" | "delete-transaction",
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
    } else if (action === "delete-transaction") {
      result = await deleteTransaction(selected.id)
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
    <button class="btn btn-ghost btn-sm mb-4" on:click={() => selected = null}>← Kembali</button>
    <AdminDiffView transaction={selected} loading={actionLoading} onAction={handleAction} />
  {:else}
    <AdminRepairQueue onSelect={(tx) => { selected = tx; actionError = "" }} />
  {/if}
</div>
```

- [ ] **Step 6.3: Verify approve flow**

```bash
npm run dev
```
1. Go to `/outlet/repair` → select TRX-002 → click "Setujui" → returns to queue, TRX-002 is gone.
2. Go to history → open "Lihat Versi" on TRX-002 → expect V2 of type "approved" with `items` in `changedFields`.

- [ ] **Step 6.4: Verify reject flow**

1. Submit a new PT request on TRX-001 from history page.
2. Go to `/outlet/repair` → select TRX-001 → click "Tolak" → enter reason → "Kirim Penolakan".
3. Go to history → TRX-001 row shows "Revisi" button (not ⏳).

- [ ] **Step 6.5: Verify delete flows**

- Delete request: admin clicks "Hapus Permintaan" on a pending request → queue removes it, history row returns to "Perbaikan" button.
- Delete transaction: admin clicks "Hapus Transaksi" → confirms → transaction disappears from history (filtered by `isDeleted`).

- [ ] **Step 6.6: Commit**

```bash
git add src/library/hooks/useRepair.ts src/routes/outlet/repair/+page.svelte
git commit -m "feat: implement admin approve/reject/delete actions for PT"
```

---

## Task 7: End-to-End Rejection & Revision Verification

This task has no new files. It validates the complete rejection-revision loop using the code from Tasks 4 and 6, and ensures `RepairRequestModal.svelte` handles all states correctly.

- [ ] **Step 7.1: Verify full rejection → revision → approval loop**

Manual test sequence:
1. History → TRX-001 → "Perbaikan" → change item qty from 2 to 5 → "Submit Request" → row shows ⏳.
2. `/outlet/repair` → select TRX-001 → "Tolak" → enter "Jumlah melebihi stok tersedia" → "Kirim Penolakan" → back to queue.
3. History → TRX-001 → "Revisi" → modal shows yellow banner with reason "Jumlah melebihi stok tersedia" + form pre-filled with qty 5 + button labelled "Kirim Ulang".
4. Change qty to 3 → "Kirim Ulang" → row shows ⏳ again.
5. `/outlet/repair` → TRX-001 shows "Revisi ke-1" label → "Setujui" → queue empty.
6. History → "Lihat Versi" on TRX-001 → expect V3 of type "approved" with `items` in `changedFields`.

- [ ] **Step 7.2: Verify PTI during pending PT**

1. Submit a PT request on TRX-001 (row shows ⏳).
2. Click "Perbaikan Instan" on TRX-001 — modal opens normally (PTI is NOT blocked by pending PT).
3. Change `tanggalKirim` → "Simpan" → success.
4. "Lihat Versi" → new version of type "instant" added while PT is still pending.

- [ ] **Step 7.3: Final commit**

```bash
git add src/library/components/outlet/repair/RepairRequestModal.svelte
git commit -m "feat: complete Perbaikan Transaksi — full revision and PTI concurrency verified"
```
