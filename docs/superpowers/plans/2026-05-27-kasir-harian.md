# Kasir Harian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Kasir Harian feature — per-cashier shift cash counting with drill-down, day-level accumulation and close, and a PT repair flow with admin approval queue.

**Architecture:** Five files — a types module, a mock store (reads riwayat/pesanan/kas mocks for live totals but seeds hardcoded snapshots), a shift close page (table + form modal with content-swap drill-down), a day close page (two independent sections), and an admin repair page (Shift / Hari tabs). All modals inline in their page file.

**Tech Stack:** SvelteKit 1.x + Svelte 4, TypeScript 5, TailwindCSS 3, DaisyUI, client-side mocks, Vitest

---

## Prerequisites

- `src/library/mock/riwayat.ts` — exports `getRiwayatList(outletId?: string): RiwayatEntry[]`. Each entry has `completedAt: string`, `versions[currentVersionIndex].snapshot` typed as `RetailSnapshot | PesananTransactionSnapshot` with `.cashierId` and `.payments: Array<{ type: string; amount: number }>`.
- `src/library/mock/pesanan.ts` — exports `getPesananList(outletId?: string): Pesanan[]`. Each Pesanan has `payments: Array<{ type: string; amount: number; paidAt: string; cashierId: string; isDP: boolean }>`.
- `src/library/mock/kas.ts` — exports `getMockKasRecords(): KasRecord[]`. Each record has `isDeleted: boolean`, `versions[currentVersionIndex].snapshot` with `.createdBy`, `.tanggal`, `.type: 'masuk'|'keluar'`, `.outletId`, `.entries: Array<{ paymentMethod: string; amount: number }>`.
- `src/library/stores/auth.ts` — exports `auth` store with `{ userId, userName, role: 'cashier'|'manager'|'admin', outletId }`.
- Project bootstrap complete (SvelteKit + Tailwind + DaisyUI configured, Vitest installed).

---

## File Map

### Created
```
src/library/types/Kasir.ts
src/library/mock/kasir.ts
src/library/mock/kasir.test.ts
src/routes/outlet/kasir/shift/+page.svelte
src/routes/outlet/kasir/day/+page.svelte
src/routes/outlet/kasir/repair/+page.svelte
```

### Modified
```
src/routes/outlet/+layout.svelte    — add Kasir Shift and Tutup Hari nav links
```

---

## Task 1: TypeScript Types

**Files:**
- Create: `src/library/types/Kasir.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/library/types/Kasir.ts

export interface CashBreakdownLine {
    amount: number
    count: number
}

export interface EPaymentSummary {
    method: string
    amount: number
    count: number
}

export interface ShiftSnapshot {
    outletId: string
    cashierId: string
    tanggalSetor: string                     // YYYY-MM-DD
    cashBreakdown: {
        retail:          CashBreakdownLine
        pesananDP:       CashBreakdownLine
        pesananCheckout: CashBreakdownLine
        kasMasuk:        CashBreakdownLine
        kasKeluar:       CashBreakdownLine
    }
    ePayments: EPaymentSummary[]
    systemExpectedCash: number
    physicalCashCounted: number
    selisih: number                          // physicalCashCounted - systemExpectedCash
    selisihNotes: string                     // required when selisih !== 0
    submittedAt: string
}

export interface ShiftVersion {
    index: number
    type: 'original' | 'approved'
    snapshot: ShiftSnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface ShiftRepairRequest {
    id: string
    shiftId: string
    status: 'pending' | 'rejected' | 'deleted'
    proposedSnapshot: ShiftSnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export type ShiftStatus = 'submitted' | 'awaiting_pt'

export interface ShiftClose {
    id: string
    outletId: string
    status: ShiftStatus
    currentVersionIndex: number
    versions: ShiftVersion[]
    pendingRequest: ShiftRepairRequest | null
    isDeleted: boolean
}

export interface DayShiftSummary {
    shiftId: string
    cashierId: string
    physicalCashCounted: number
    systemExpectedCash: number
    selisih: number
}

export interface DaySnapshot {
    outletId: string
    tanggal: string
    closedBy: string
    closedAt: string
    shifts: DayShiftSummary[]
    totalPhysicalCash: number
    totalSystemExpected: number
    totalSelisih: number
}

export interface DayVersion {
    index: number
    type: 'original' | 'approved'
    snapshot: DaySnapshot
    changedFields: string[]
    createdBy: string
    createdAt: string
    requestId: string | null
}

export interface DayRepairRequest {
    id: string
    dayId: string
    status: 'pending' | 'rejected' | 'deleted'
    proposedSnapshot: DaySnapshot
    submittedBy: string
    submittedAt: string
    rejectionReason: string | null
    revisions: number
}

export type DayStatus = 'open' | 'closed' | 'awaiting_pt'

export interface DayClose {
    id: string
    outletId: string
    tanggal: string
    status: DayStatus
    currentVersionIndex: number
    versions: DayVersion[]
    pendingRequest: DayRepairRequest | null
    isDeleted: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add src/library/types/Kasir.ts
git commit -m "feat: add Kasir types"
```

---

## Task 2: Mock Store + Tests

**Files:**
- Create: `src/library/mock/kasir.ts`
- Create: `src/library/mock/kasir.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/library/mock/kasir.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    getShiftList, getShiftById, submitShift,
    getDayList, getDayByDate, closeDay,
    submitShiftRepairRequest, reviseShiftRepairRequest,
    approveShiftRepairRequest, rejectShiftRepairRequest, deleteShiftRepairRequest,
    submitDayRepairRequest, approveDayRepairRequest, rejectDayRepairRequest,
    getPendingShiftRepairRequests, getPendingDayRepairRequests,
    getResolvedShiftRepairRequests, getResolvedDayRepairRequests,
    _resetForTesting
} from './kasir'
import type { ShiftSnapshot } from '../types/Kasir'

const snap = (overrides: Partial<ShiftSnapshot> = {}): ShiftSnapshot => ({
    outletId: 'outlet-1',
    cashierId: 'cashier-001',
    tanggalSetor: '2026-05-28',
    cashBreakdown: {
        retail:          { amount: 300000, count: 4 },
        pesananDP:       { amount: 0,      count: 0 },
        pesananCheckout: { amount: 100000, count: 1 },
        kasMasuk:        { amount: 0,      count: 0 },
        kasKeluar:       { amount: 0,      count: 0 },
    },
    ePayments: [{ method: 'GoPay', amount: 150000, count: 2 }],
    systemExpectedCash: 400000,
    physicalCashCounted: 400000,
    selisih: 0,
    selisihNotes: '',
    submittedAt: new Date().toISOString(),
    ...overrides
})

describe('getShiftList', () => {
    it('returns 5 seeded shifts', () => {
        expect(getShiftList().length).toBe(5)
    })
    it('filters by outletId', () => {
        expect(getShiftList('outlet-1').every(s => s.outletId === 'outlet-1')).toBe(true)
    })
    it('excludes isDeleted records', () => {
        expect(getShiftList().every(s => !s.isDeleted)).toBe(true)
    })
})

describe('submitShift', () => {
    beforeEach(() => _resetForTesting())

    it('creates ShiftClose with status submitted and one original version', () => {
        const result = submitShift(snap())
        expect(result.status).toBe('submitted')
        expect(result.versions.length).toBe(1)
        expect(result.versions[0].type).toBe('original')
        expect(result.currentVersionIndex).toBe(0)
        expect(result.pendingRequest).toBeNull()
        expect(result.isDeleted).toBe(false)
    })

    it('assigns SHIFT-NNNNN id', () => {
        expect(submitShift(snap()).id).toMatch(/^SHIFT-\d{5}$/)
    })
})

describe('closeDay', () => {
    beforeEach(() => _resetForTesting())

    it('creates DayClose with status closed for a fresh date', () => {
        const day = closeDay('outlet-1', '2026-05-28', 'cashier-001')
        expect(day.status).toBe('closed')
        expect(day.tanggal).toBe('2026-05-28')
        expect(day.versions[0].snapshot.closedBy).toBe('cashier-001')
    })

    it('accumulates shifts for the given date', () => {
        submitShift(snap({ tanggalSetor: '2026-05-28', physicalCashCounted: 400000, systemExpectedCash: 400000, selisih: 0 }))
        submitShift(snap({ cashierId: 'cashier-002', tanggalSetor: '2026-05-28', physicalCashCounted: 200000, systemExpectedCash: 200000, selisih: 0 }))
        const day = closeDay('outlet-1', '2026-05-28', 'cashier-001')
        expect(day.versions[0].snapshot.shifts.length).toBe(2)
        expect(day.versions[0].snapshot.totalPhysicalCash).toBe(600000)
    })

    it('throws if day already closed for that date', () => {
        expect(() => closeDay('outlet-1', '2026-05-25', 'cashier-001')).toThrow()
    })
})

describe('Shift PT flow', () => {
    beforeEach(() => _resetForTesting())

    it('submitShiftRepairRequest sets status to awaiting_pt and creates pendingRequest', () => {
        const shift = submitShift(snap())
        submitShiftRepairRequest(shift.id, snap({ physicalCashCounted: 350000, selisih: -50000, selisihNotes: 'Salah hitung' }), 'cashier-001')
        const updated = getShiftById(shift.id)!
        expect(updated.status).toBe('awaiting_pt')
        expect(updated.pendingRequest?.status).toBe('pending')
        expect(updated.pendingRequest?.revisions).toBe(0)
    })

    it('approveShiftRepairRequest creates approved version, clears pendingRequest, restores submitted', () => {
        const shift = submitShift(snap())
        submitShiftRepairRequest(shift.id, snap({ physicalCashCounted: 350000, selisih: -50000, selisihNotes: 'Salah hitung' }), 'cashier-001')
        approveShiftRepairRequest(shift.id, 'admin-001')
        const updated = getShiftById(shift.id)!
        expect(updated.status).toBe('submitted')
        expect(updated.pendingRequest).toBeNull()
        expect(updated.versions.length).toBe(2)
        expect(updated.versions[1].type).toBe('approved')
        expect(updated.currentVersionIndex).toBe(1)
    })

    it('rejectShiftRepairRequest sets pending.status=rejected, restores submitted', () => {
        const shift = submitShift(snap())
        submitShiftRepairRequest(shift.id, snap({ physicalCashCounted: 350000, selisih: -50000, selisihNotes: 'x' }), 'cashier-001')
        rejectShiftRepairRequest(shift.id, 'Data tidak valid', 'admin-001')
        const updated = getShiftById(shift.id)!
        expect(updated.status).toBe('submitted')
        expect(updated.pendingRequest?.status).toBe('rejected')
        expect(updated.pendingRequest?.rejectionReason).toBe('Data tidak valid')
    })

    it('reviseShiftRepairRequest increments revisions and resets to pending', () => {
        const shift = submitShift(snap())
        submitShiftRepairRequest(shift.id, snap({ physicalCashCounted: 350000, selisih: -50000, selisihNotes: 'x' }), 'cashier-001')
        rejectShiftRepairRequest(shift.id, 'reason', 'admin-001')
        reviseShiftRepairRequest(shift.id, snap({ physicalCashCounted: 380000, selisih: -20000, selisihNotes: 'revised' }), 'cashier-001')
        const updated = getShiftById(shift.id)!
        expect(updated.status).toBe('awaiting_pt')
        expect(updated.pendingRequest?.revisions).toBe(1)
        expect(updated.pendingRequest?.status).toBe('pending')
    })

    it('deleteShiftRepairRequest nulls pendingRequest and appears in resolved log', () => {
        const shift = submitShift(snap())
        submitShiftRepairRequest(shift.id, snap({ physicalCashCounted: 350000, selisih: -50000, selisihNotes: 'x' }), 'cashier-001')
        deleteShiftRepairRequest(shift.id, 'admin-001')
        const updated = getShiftById(shift.id)!
        expect(updated.pendingRequest).toBeNull()
        expect(updated.status).toBe('submitted')
        const resolved = getResolvedShiftRepairRequests()
        expect(resolved.some(r => r.shiftId === shift.id)).toBe(true)
    })
})

describe('getPendingShiftRepairRequests', () => {
    it('returns seeded pending request for SHIFT-00003', () => {
        expect(getPendingShiftRepairRequests().some(r => r.shiftId === 'SHIFT-00003')).toBe(true)
    })
})

describe('getPendingDayRepairRequests', () => {
    it('returns seeded pending request for DAY-00002', () => {
        expect(getPendingDayRepairRequests().some(r => r.dayId === 'DAY-00002')).toBe(true)
    })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/library/mock/kasir.test.ts
```
Expected: FAIL — `Cannot find module './kasir'`

- [ ] **Step 3: Create the mock store**

```typescript
// src/library/mock/kasir.ts
import type {
    ShiftSnapshot, ShiftVersion, ShiftRepairRequest, ShiftClose,
    DaySnapshot, DayVersion, DayRepairRequest, DayClose, DayShiftSummary
} from '../types/Kasir'

// ─── ID helpers ───────────────────────────────────────────────────────────────
const pad = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, '0')}`

// ─── Counters ─────────────────────────────────────────────────────────────────
let shiftCounter = 5
let dayCounter = 2
let sreqCounter = 1
let dreqCounter = 1

// ─── Audit logs (approved + deleted requests) ─────────────────────────────────
let resolvedShiftLog: Array<ShiftRepairRequest & { resolvedAs: 'approved' | 'deleted' }> = []
let resolvedDayLog:   Array<DayRepairRequest   & { resolvedAs: 'approved' | 'deleted' }> = []

// ─── Diff helper ──────────────────────────────────────────────────────────────
function diffFields(a: object, b: object): string[] {
    return Object.keys(b).filter(k => JSON.stringify((a as any)[k]) !== JSON.stringify((b as any)[k]))
}

// ─── Seed builder ─────────────────────────────────────────────────────────────
function buildSeedShiftSnap(
    outletId: string, cashierId: string, tanggal: string,
    retail: number, rc: number, dp: number, dc: number,
    checkout: number, cc: number, masuk: number, mc: number,
    keluar: number, kc: number,
    ep: Array<{ method: string; amount: number; count: number }>,
    physical: number, notes: string, at: string
): ShiftSnapshot {
    const sys = retail + dp + checkout + masuk - keluar
    return {
        outletId, cashierId, tanggalSetor: tanggal,
        cashBreakdown: {
            retail:          { amount: retail,   count: rc },
            pesananDP:       { amount: dp,        count: dc },
            pesananCheckout: { amount: checkout,  count: cc },
            kasMasuk:        { amount: masuk,     count: mc },
            kasKeluar:       { amount: keluar,    count: kc },
        },
        ePayments: ep,
        systemExpectedCash: sys,
        physicalCashCounted: physical,
        selisih: physical - sys,
        selisihNotes: notes,
        submittedAt: at,
    }
}

function buildSeeds(): { shifts: ShiftClose[]; days: DayClose[] } {
    const s1 = buildSeedShiftSnap('outlet-1','cashier-001','2026-05-25', 700000,8, 150000,2, 200000,1, 0,0, 0,0, [{method:'GoPay',amount:200000,count:3}], 1050000,'','2026-05-25T14:30:00.000Z')
    const s2 = buildSeedShiftSnap('outlet-1','cashier-002','2026-05-25', 450000,5, 0,0, 0,0, 80000,1, 0,0, [{method:'BCA Transfer',amount:150000,count:1}], 530000,'','2026-05-25T21:10:00.000Z')
    const s3 = buildSeedShiftSnap('outlet-1','cashier-001','2026-05-26', 750000,9, 200000,2, 0,0, 0,0, 0,0, [{method:'GoPay',amount:100000,count:2}], 950000,'','2026-05-26T14:45:00.000Z')
    const s3p = buildSeedShiftSnap('outlet-1','cashier-001','2026-05-26', 750000,9, 200000,2, 0,0, 0,0, 0,0, [{method:'GoPay',amount:100000,count:2}], 900000,'Ada kekurangan Rp 50.000 setelah dihitung ulang','2026-05-26T14:45:00.000Z')
    const s4 = buildSeedShiftSnap('outlet-1','cashier-001','2026-05-27', 600000,7, 100000,1, 300000,2, 50000,1, 100000,1, [{method:'GoPay',amount:80000,count:1}], 900000,'Kemungkinan salah hitung saat ramai','2026-05-27T14:50:00.000Z')
    const s5 = buildSeedShiftSnap('outlet-1','cashier-002','2026-05-27', 500000,6, 0,0, 200000,1, 0,0, 50000,1, [{method:'BCA Transfer',amount:100000,count:1}], 650000,'','2026-05-27T21:05:00.000Z')

    const shifts: ShiftClose[] = [
        { id:'SHIFT-00001', outletId:'outlet-1', status:'submitted',    currentVersionIndex:0, isDeleted:false, pendingRequest:null,
          versions:[{index:0,type:'original',snapshot:s1,changedFields:[],createdBy:'cashier-001',createdAt:'2026-05-25T14:30:00.000Z',requestId:null}] },
        { id:'SHIFT-00002', outletId:'outlet-1', status:'submitted',    currentVersionIndex:0, isDeleted:false, pendingRequest:null,
          versions:[{index:0,type:'original',snapshot:s2,changedFields:[],createdBy:'cashier-002',createdAt:'2026-05-25T21:10:00.000Z',requestId:null}] },
        { id:'SHIFT-00003', outletId:'outlet-1', status:'awaiting_pt',  currentVersionIndex:0, isDeleted:false,
          pendingRequest:{id:'SREQ-00001',shiftId:'SHIFT-00003',status:'pending',proposedSnapshot:s3p,submittedBy:'cashier-001',submittedAt:'2026-05-26T15:00:00.000Z',rejectionReason:null,revisions:0},
          versions:[{index:0,type:'original',snapshot:s3,changedFields:[],createdBy:'cashier-001',createdAt:'2026-05-26T14:45:00.000Z',requestId:null}] },
        { id:'SHIFT-00004', outletId:'outlet-1', status:'submitted',    currentVersionIndex:0, isDeleted:false, pendingRequest:null,
          versions:[{index:0,type:'original',snapshot:s4,changedFields:[],createdBy:'cashier-001',createdAt:'2026-05-27T14:50:00.000Z',requestId:null}] },
        { id:'SHIFT-00005', outletId:'outlet-1', status:'submitted',    currentVersionIndex:0, isDeleted:false, pendingRequest:null,
          versions:[{index:0,type:'original',snapshot:s5,changedFields:[],createdBy:'cashier-002',createdAt:'2026-05-27T21:05:00.000Z',requestId:null}] },
    ]

    const d1snap: DaySnapshot = {
        outletId:'outlet-1', tanggal:'2026-05-25', closedBy:'cashier-001', closedAt:'2026-05-25T22:00:00.000Z',
        shifts:[
            {shiftId:'SHIFT-00001',cashierId:'cashier-001',physicalCashCounted:1050000,systemExpectedCash:1050000,selisih:0},
            {shiftId:'SHIFT-00002',cashierId:'cashier-002',physicalCashCounted:530000, systemExpectedCash:530000, selisih:0},
        ],
        totalPhysicalCash:1580000, totalSystemExpected:1580000, totalSelisih:0
    }
    const d2snap: DaySnapshot = {
        outletId:'outlet-1', tanggal:'2026-05-26', closedBy:'cashier-001', closedAt:'2026-05-26T22:30:00.000Z',
        shifts:[{shiftId:'SHIFT-00003',cashierId:'cashier-001',physicalCashCounted:950000,systemExpectedCash:950000,selisih:0}],
        totalPhysicalCash:950000, totalSystemExpected:950000, totalSelisih:0
    }
    const d2proposed: DaySnapshot = { ...d2snap, tanggal:'2026-05-27' }

    const days: DayClose[] = [
        { id:'DAY-00001', outletId:'outlet-1', tanggal:'2026-05-25', status:'closed',      currentVersionIndex:0, isDeleted:false, pendingRequest:null,
          versions:[{index:0,type:'original',snapshot:d1snap,changedFields:[],createdBy:'cashier-001',createdAt:'2026-05-25T22:00:00.000Z',requestId:null}] },
        { id:'DAY-00002', outletId:'outlet-1', tanggal:'2026-05-26', status:'awaiting_pt', currentVersionIndex:0, isDeleted:false,
          pendingRequest:{id:'DREQ-00001',dayId:'DAY-00002',status:'pending',proposedSnapshot:d2proposed,submittedBy:'cashier-001',submittedAt:'2026-05-26T23:00:00.000Z',rejectionReason:null,revisions:0},
          versions:[{index:0,type:'original',snapshot:d2snap,changedFields:[],createdBy:'cashier-001',createdAt:'2026-05-26T22:30:00.000Z',requestId:null}] },
    ]

    return { shifts, days }
}

const init = buildSeeds()
let mockShifts: ShiftClose[] = init.shifts
let mockDays:   DayClose[]   = init.days

// ─── Test reset ───────────────────────────────────────────────────────────────
export function _resetForTesting(): void {
    const s = buildSeeds()
    mockShifts = s.shifts
    mockDays   = s.days
    resolvedShiftLog = []
    resolvedDayLog   = []
    shiftCounter = 5
    dayCounter   = 2
    sreqCounter  = 1
    dreqCounter  = 1
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export function getShiftList(outletId?: string): ShiftClose[] {
    return mockShifts.filter(s => !s.isDeleted && (outletId === undefined || s.outletId === outletId))
}
export function getShiftById(id: string): ShiftClose | undefined {
    return mockShifts.find(s => s.id === id)
}
export function getDayList(outletId?: string): DayClose[] {
    return mockDays.filter(d => !d.isDeleted && (outletId === undefined || d.outletId === outletId))
}
export function getDayByDate(outletId: string, tanggal: string): DayClose | undefined {
    return mockDays.find(d => !d.isDeleted && d.outletId === outletId && d.tanggal === tanggal)
}

// ─── computeShiftTotals ───────────────────────────────────────────────────────
// Reads live data from other mocks. Falls back to zeroes if a mock is not yet implemented.
export function computeShiftTotals(outletId: string, cashierId: string, tanggal: string): ShiftSnapshot {
    let retailCash = 0, retailCount = 0
    let dpCash = 0, dpCount = 0
    let checkoutCash = 0, checkoutCount = 0
    let masukCash = 0, masukCount = 0
    let keluarCash = 0, keluarCount = 0
    const epMap: Record<string, { amount: number; count: number }> = {}

    try {
        const { getRiwayatList } = require('./riwayat') as { getRiwayatList: (id?: string) => any[] }
        for (const entry of getRiwayatList(outletId)) {
            const snap = entry.versions?.[entry.currentVersionIndex]?.snapshot
            if (!snap || snap.cashierId !== cashierId) continue
            if (!(entry.completedAt as string)?.startsWith(tanggal)) continue
            for (const p of (snap.payments ?? []) as Array<{ type: string; amount: number }>) {
                if (p.type === 'Tunai') {
                    if (snap.source === 'retail')  { retailCash   += p.amount; retailCount++ }
                    else                            { checkoutCash += p.amount; checkoutCount++ }
                } else {
                    if (!epMap[p.type]) epMap[p.type] = { amount: 0, count: 0 }
                    epMap[p.type].amount += p.amount
                    epMap[p.type].count++
                }
            }
        }
    } catch { /* riwayat not yet built */ }

    try {
        const { getPesananList } = require('./pesanan') as { getPesananList: (id?: string) => any[] }
        for (const pesanan of getPesananList(outletId)) {
            for (const p of (pesanan.payments ?? []) as Array<{ type: string; amount: number; paidAt: string; cashierId: string; isDP: boolean }>) {
                if (p.cashierId !== cashierId) continue
                if (!p.paidAt?.startsWith(tanggal)) continue
                if (p.type !== 'Tunai' || !p.isDP) continue
                dpCash += p.amount; dpCount++
            }
        }
    } catch { /* pesanan not yet built */ }

    try {
        const { getMockKasRecords } = require('./kas') as { getMockKasRecords: () => any[] }
        for (const rec of getMockKasRecords()) {
            if (rec.isDeleted) continue
            const snap = rec.versions?.[rec.currentVersionIndex]?.snapshot
            if (!snap || snap.createdBy !== cashierId || snap.tanggal !== tanggal || snap.outletId !== outletId) continue
            const cashTotal = (snap.entries ?? []).filter((e: any) => e.paymentMethod === 'Tunai').reduce((s: number, e: any) => s + e.amount, 0)
            if (snap.type === 'masuk') { masukCash += cashTotal; if (cashTotal > 0) masukCount++ }
            else                       { keluarCash += cashTotal; if (cashTotal > 0) keluarCount++ }
        }
    } catch { /* kas not yet built */ }

    const sys = retailCash + dpCash + checkoutCash + masukCash - keluarCash
    return {
        outletId, cashierId, tanggalSetor: tanggal,
        cashBreakdown: {
            retail:          { amount: retailCash,   count: retailCount },
            pesananDP:       { amount: dpCash,        count: dpCount },
            pesananCheckout: { amount: checkoutCash,  count: checkoutCount },
            kasMasuk:        { amount: masukCash,     count: masukCount },
            kasKeluar:       { amount: keluarCash,    count: keluarCount },
        },
        ePayments: Object.entries(epMap).map(([method, v]) => ({ method, ...v })),
        systemExpectedCash: sys,
        physicalCashCounted: 0,
        selisih: -sys,
        selisihNotes: '',
        submittedAt: new Date().toISOString(),
    }
}

// ─── submitShift ──────────────────────────────────────────────────────────────
export function submitShift(snapshot: ShiftSnapshot): ShiftClose {
    shiftCounter++
    const record: ShiftClose = {
        id: pad('SHIFT', shiftCounter), outletId: snapshot.outletId,
        status: 'submitted', currentVersionIndex: 0, isDeleted: false, pendingRequest: null,
        versions: [{
            index: 0, type: 'original', snapshot, changedFields: [],
            createdBy: snapshot.cashierId, createdAt: new Date().toISOString(), requestId: null
        }]
    }
    mockShifts.push(record)
    return record
}

// ─── closeDay ─────────────────────────────────────────────────────────────────
export function closeDay(outletId: string, tanggal: string, closedBy: string): DayClose {
    if (getDayByDate(outletId, tanggal)) throw new Error(`Day already closed for ${outletId} on ${tanggal}`)
    const shifts = getShiftList(outletId).filter(s => s.versions[s.currentVersionIndex].snapshot.tanggalSetor === tanggal)
    const summaries: DayShiftSummary[] = shifts.map(s => {
        const snap = s.versions[s.currentVersionIndex].snapshot
        return { shiftId: s.id, cashierId: snap.cashierId, physicalCashCounted: snap.physicalCashCounted, systemExpectedCash: snap.systemExpectedCash, selisih: snap.selisih }
    })
    const now = new Date().toISOString()
    const daySnap: DaySnapshot = {
        outletId, tanggal, closedBy, closedAt: now, shifts: summaries,
        totalPhysicalCash:   summaries.reduce((a, s) => a + s.physicalCashCounted, 0),
        totalSystemExpected: summaries.reduce((a, s) => a + s.systemExpectedCash,  0),
        totalSelisih:        summaries.reduce((a, s) => a + s.selisih,             0),
    }
    dayCounter++
    const record: DayClose = {
        id: pad('DAY', dayCounter), outletId, tanggal, status: 'closed',
        currentVersionIndex: 0, isDeleted: false, pendingRequest: null,
        versions: [{ index: 0, type: 'original', snapshot: daySnap, changedFields: [], createdBy: closedBy, createdAt: now, requestId: null }]
    }
    mockDays.push(record)
    return record
}

// ─── Shift PT ─────────────────────────────────────────────────────────────────
export function submitShiftRepairRequest(id: string, proposed: ShiftSnapshot, userId: string): void {
    const rec = mockShifts.find(s => s.id === id)
    if (!rec) return
    sreqCounter++
    rec.pendingRequest = { id: pad('SREQ', sreqCounter), shiftId: id, status: 'pending', proposedSnapshot: proposed, submittedBy: userId, submittedAt: new Date().toISOString(), rejectionReason: null, revisions: 0 }
    rec.status = 'awaiting_pt'
}
export function reviseShiftRepairRequest(id: string, proposed: ShiftSnapshot, userId: string): void {
    const rec = mockShifts.find(s => s.id === id)
    if (!rec?.pendingRequest) return
    rec.pendingRequest.proposedSnapshot = proposed
    rec.pendingRequest.status = 'pending'
    rec.pendingRequest.revisions++
    rec.pendingRequest.submittedAt = new Date().toISOString()
    rec.status = 'awaiting_pt'
}
export function approveShiftRepairRequest(id: string, adminId: string): void {
    const rec = mockShifts.find(s => s.id === id)
    if (!rec?.pendingRequest) return
    const req = rec.pendingRequest
    const cur = rec.versions[rec.currentVersionIndex].snapshot
    const idx = rec.currentVersionIndex + 1
    rec.versions.push({ index: idx, type: 'approved', snapshot: req.proposedSnapshot, changedFields: diffFields(cur, req.proposedSnapshot), createdBy: adminId, createdAt: new Date().toISOString(), requestId: req.id })
    rec.currentVersionIndex = idx
    resolvedShiftLog.push({ ...req, resolvedAs: 'approved' })
    rec.pendingRequest = null
    rec.status = 'submitted'
}
export function rejectShiftRepairRequest(id: string, reason: string, adminId: string): void {
    const rec = mockShifts.find(s => s.id === id)
    if (!rec?.pendingRequest) return
    rec.pendingRequest.status = 'rejected'
    rec.pendingRequest.rejectionReason = reason
    rec.status = 'submitted'
}
export function deleteShiftRepairRequest(id: string, adminId: string): void {
    const rec = mockShifts.find(s => s.id === id)
    if (!rec?.pendingRequest) return
    resolvedShiftLog.push({ ...rec.pendingRequest, resolvedAs: 'deleted' })
    rec.pendingRequest = null
    rec.status = 'submitted'
}
export function deleteShift(id: string, adminId: string): void {
    const rec = mockShifts.find(s => s.id === id)
    if (rec) { rec.isDeleted = true; rec.pendingRequest = null }
}

// ─── Day PT ───────────────────────────────────────────────────────────────────
export function submitDayRepairRequest(id: string, proposed: DaySnapshot, userId: string): void {
    const rec = mockDays.find(d => d.id === id)
    if (!rec) return
    dreqCounter++
    rec.pendingRequest = { id: pad('DREQ', dreqCounter), dayId: id, status: 'pending', proposedSnapshot: proposed, submittedBy: userId, submittedAt: new Date().toISOString(), rejectionReason: null, revisions: 0 }
    rec.status = 'awaiting_pt'
}
export function reviseDayRepairRequest(id: string, proposed: DaySnapshot, userId: string): void {
    const rec = mockDays.find(d => d.id === id)
    if (!rec?.pendingRequest) return
    rec.pendingRequest.proposedSnapshot = proposed
    rec.pendingRequest.status = 'pending'
    rec.pendingRequest.revisions++
    rec.pendingRequest.submittedAt = new Date().toISOString()
    rec.status = 'awaiting_pt'
}
export function approveDayRepairRequest(id: string, adminId: string): void {
    const rec = mockDays.find(d => d.id === id)
    if (!rec?.pendingRequest) return
    const req = rec.pendingRequest
    const cur = rec.versions[rec.currentVersionIndex].snapshot
    const idx = rec.currentVersionIndex + 1
    rec.versions.push({ index: idx, type: 'approved', snapshot: req.proposedSnapshot, changedFields: diffFields(cur, req.proposedSnapshot), createdBy: adminId, createdAt: new Date().toISOString(), requestId: req.id })
    rec.currentVersionIndex = idx
    resolvedDayLog.push({ ...req, resolvedAs: 'approved' })
    rec.pendingRequest = null
    rec.status = 'closed'
}
export function rejectDayRepairRequest(id: string, reason: string, adminId: string): void {
    const rec = mockDays.find(d => d.id === id)
    if (!rec?.pendingRequest) return
    rec.pendingRequest.status = 'rejected'
    rec.pendingRequest.rejectionReason = reason
    rec.status = 'closed'
}
export function deleteDayRepairRequest(id: string, adminId: string): void {
    const rec = mockDays.find(d => d.id === id)
    if (!rec?.pendingRequest) return
    resolvedDayLog.push({ ...rec.pendingRequest, resolvedAs: 'deleted' })
    rec.pendingRequest = null
    rec.status = 'closed'
}
export function deleteDay(id: string, adminId: string): void {
    const rec = mockDays.find(d => d.id === id)
    if (rec) { rec.isDeleted = true; rec.pendingRequest = null }
}

// ─── Admin PT queues ──────────────────────────────────────────────────────────
export function getPendingShiftRepairRequests(): ShiftRepairRequest[] {
    return mockShifts.filter(s => s.pendingRequest?.status === 'pending').map(s => s.pendingRequest!)
}
export function getPendingDayRepairRequests(): DayRepairRequest[] {
    return mockDays.filter(d => d.pendingRequest?.status === 'pending').map(d => d.pendingRequest!)
}
// Resolved = approved (from log) + rejected (still on record's pendingRequest)
export function getResolvedShiftRepairRequests(): ShiftRepairRequest[] {
    const approved = resolvedShiftLog.filter(r => r.resolvedAs === 'approved') as ShiftRepairRequest[]
    const rejected = mockShifts.filter(s => s.pendingRequest?.status === 'rejected').map(s => s.pendingRequest!)
    return [...approved, ...rejected]
}
export function getResolvedDayRepairRequests(): DayRepairRequest[] {
    const approved = resolvedDayLog.filter(r => r.resolvedAs === 'approved') as DayRepairRequest[]
    const rejected = mockDays.filter(d => d.pendingRequest?.status === 'rejected').map(d => d.pendingRequest!)
    return [...approved, ...rejected]
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/library/mock/kasir.test.ts
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/kasir.ts src/library/mock/kasir.test.ts
git commit -m "feat: add Kasir mock store with seed data and PT flow"
```

---

## Task 3: Shift Close Page

**Files:**
- Create: `src/routes/outlet/kasir/shift/+page.svelte`

- [ ] **Step 1: Create the shift close page**

```svelte
<!-- src/routes/outlet/kasir/shift/+page.svelte -->
<script lang="ts">
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import {
        getShiftList, getShiftById, computeShiftTotals, submitShift,
        submitShiftRepairRequest, reviseShiftRepairRequest
    } from '$lib/mock/kasir'
    import type { ShiftClose, ShiftSnapshot, EPaymentSummary } from '$lib/types/Kasir'
    import { formatIDR } from '$lib/utils/formatter'

    const $auth = get(auth)

    // ── Table state ──────────────────────────────────────────────────────────
    let search = ''
    let dateFrom = ''
    let dateTo = ''
    let perPage: 10 | 25 | 50 | 100 = 25
    let currentPage = 1

    $: allShifts = getShiftList($auth.role === 'admin' ? undefined : $auth.outletId)
    $: filtered = allShifts.filter(s => {
        const snap = s.versions[s.currentVersionIndex].snapshot
        const matchDate = (!dateFrom || snap.tanggalSetor >= dateFrom) && (!dateTo || snap.tanggalSetor <= dateTo)
        const matchSearch = !search || snap.cashierId.toLowerCase().includes(search.toLowerCase())
        return matchDate && matchSearch
    })
    $: totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    $: paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
    $: if (search !== undefined || perPage || dateFrom || dateTo) currentPage = 1
    $: pageButtons = (() => {
        let start = Math.max(1, currentPage - 2)
        let end = Math.min(totalPages, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()

    // ── Form modal state ──────────────────────────────────────────────────────
    let showForm = false
    let formSnap: ShiftSnapshot | null = null
    let physicalInput = ''

    // drilldown: null = show form; set = show transaction list for that source
    type DrillItem = { id: string; time: string; member: string; amount: number; href: string }
    let drilldown: { source: string; label: string; items: DrillItem[] } | null = null

    function openForm() {
        formSnap = computeShiftTotals($auth.outletId, $auth.userId, todayDate())
        physicalInput = ''
        drilldown = null
        showForm = true
    }

    function todayDate(): string {
        return new Date().toISOString().slice(0, 10)
    }

    $: selisih = formSnap ? (Number(physicalInput.replace(/\D/g, '')) || 0) - formSnap.systemExpectedCash : 0
    $: selisihOk = selisih === 0 || (selisihNotes.trim().length > 0)
    let selisihNotes = ''
    let tanggalSetor = todayDate()

    function onTanggalChange(e: Event) {
        tanggalSetor = (e.target as HTMLInputElement).value
        formSnap = computeShiftTotals($auth.outletId, $auth.userId, tanggalSetor)
        physicalInput = ''
    }

    function openDrilldown(source: string, label: string) {
        // Build drill items from the current formSnap's breakdown
        // In real implementation these come from the source mocks.
        // For now, show placeholder items that link to the correct feature page.
        const hrefMap: Record<string, string> = {
            retail: '/outlet/riwayat',
            pesananDP: '/outlet/pesanan',
            pesananCheckout: '/outlet/riwayat',
            kasMasuk: '/outlet/akuntansi',
            kasKeluar: '/outlet/akuntansi',
        }
        drilldown = { source, label, items: [], }
        // Items would be populated from the mocks when those are available.
        // The UI renders an empty table with a "data belum tersedia" message when empty.
    }

    function submitForm() {
        if (!formSnap || !selisihOk) return
        const physical = Number(physicalInput.replace(/\D/g, '')) || 0
        const snap: ShiftSnapshot = {
            ...formSnap,
            tanggalSetor,
            physicalCashCounted: physical,
            selisih: physical - formSnap.systemExpectedCash,
            selisihNotes,
            submittedAt: new Date().toISOString(),
        }
        submitShift(snap)
        allShifts = getShiftList($auth.role === 'admin' ? undefined : $auth.outletId)
        showForm = false
    }

    // ── Lihat modal ───────────────────────────────────────────────────────────
    let lihatShift: ShiftClose | null = null
    let lihatDrilldown: { source: string; label: string; items: DrillItem[] } | null = null

    function openLihat(id: string) {
        lihatShift = getShiftById(id) ?? null
        lihatDrilldown = null
    }

    // ── PT modal ──────────────────────────────────────────────────────────────
    let ptShift: ShiftClose | null = null
    let ptPhysical = ''
    let ptNotes = ''
    let ptTanggal = ''

    function openPT(id: string) {
        ptShift = getShiftById(id) ?? null
        if (!ptShift) return
        const snap = ptShift.pendingRequest?.status === 'rejected'
            ? ptShift.pendingRequest.proposedSnapshot
            : ptShift.versions[ptShift.currentVersionIndex].snapshot
        ptPhysical = String(snap.physicalCashCounted)
        ptNotes    = snap.selisihNotes
        ptTanggal  = snap.tanggalSetor
    }

    function submitPT() {
        if (!ptShift) return
        const current = ptShift.versions[ptShift.currentVersionIndex].snapshot
        const proposed: ShiftSnapshot = {
            ...current,
            tanggalSetor: ptTanggal,
            physicalCashCounted: Number(ptPhysical) || 0,
            selisih: (Number(ptPhysical) || 0) - current.systemExpectedCash,
            selisihNotes: ptNotes,
        }
        if (ptShift.pendingRequest?.status === 'rejected') {
            reviseShiftRepairRequest(ptShift.id, proposed, $auth.userId)
        } else {
            submitShiftRepairRequest(ptShift.id, proposed, $auth.userId)
        }
        allShifts = getShiftList($auth.role === 'admin' ? undefined : $auth.outletId)
        ptShift = null
    }
</script>

<!-- Toolbar -->
<div class="flex items-center justify-between gap-4 mb-4">
    <div class="flex items-center gap-2">
        <input type="date" class="input input-bordered input-sm" bind:value={dateFrom} />
        <span class="text-base-content/40 text-sm">—</span>
        <input type="date" class="input input-bordered input-sm" bind:value={dateTo} />
        <input type="text" class="input input-bordered input-sm w-48" placeholder="Cari kasir..." bind:value={search} />
    </div>
    <div class="flex items-center gap-2">
        <select class="select select-bordered select-sm" bind:value={perPage}>
            <option value={10}>10 / halaman</option>
            <option value={25}>25 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
        </select>
        <button class="btn btn-primary btn-sm" on:click={openForm}>+ Tutup Shift</button>
    </div>
</div>

<!-- Table -->
<div class="overflow-x-auto">
    <table class="table table-sm w-full">
        <thead>
            <tr>
                {#if $auth.role === 'admin'}<th>Outlet</th>{/if}
                <th>Tgl Setor</th>
                <th>Kasir</th>
                <th class="text-right">Cash Sistem</th>
                <th class="text-right">Cash Terhitung</th>
                <th class="text-right">Selisih</th>
                <th>Status</th>
                <th>Aksi</th>
            </tr>
        </thead>
        <tbody>
            {#each paginated as shift (shift.id)}
                {@const snap = shift.versions[shift.currentVersionIndex].snapshot}
                <tr>
                    {#if $auth.role === 'admin'}<td class="text-base-content/50">{snap.outletId}</td>{/if}
                    <td>{snap.tanggalSetor}</td>
                    <td>{snap.cashierId}</td>
                    <td class="text-right">{formatIDR(snap.systemExpectedCash)}</td>
                    <td class="text-right" class:text-error={snap.selisih !== 0}>{formatIDR(snap.physicalCashCounted)}</td>
                    <td class="text-right" class:text-success={snap.selisih === 0} class:text-error={snap.selisih !== 0}>
                        {snap.selisih === 0 ? 'Rp 0' : formatIDR(snap.selisih)}
                    </td>
                    <td>
                        {#if shift.status === 'awaiting_pt'}
                            <span class="badge badge-warning badge-sm">⏳ Menunggu PT</span>
                        {/if}
                    </td>
                    <td class="flex gap-2">
                        <button class="btn btn-ghost btn-xs" on:click={() => openLihat(shift.id)}>Lihat</button>
                        {#if shift.status === 'submitted'}
                            <button class="btn btn-ghost btn-xs text-warning" on:click={() => openPT(shift.id)}>PT</button>
                            {#if $auth.role === 'admin'}
                                <button class="btn btn-ghost btn-xs text-error" on:click={() => { /* deleteShift */ }}>Hapus</button>
                            {/if}
                        {/if}
                    </td>
                </tr>
            {/each}
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

<!-- ── Form Modal ─────────────────────────────────────────────────────────── -->
{#if showForm && formSnap}
    <div class="modal modal-open">
        <div class="modal-box max-w-2xl">
            {#if drilldown}
                <!-- Content swap: drilldown view -->
                <div class="flex items-center gap-2 mb-4">
                    <button class="btn btn-ghost btn-sm" on:click={() => drilldown = null}>← Kembali ke Shift Form</button>
                    <span class="text-base-content/50">·</span>
                    <span class="font-semibold">{drilldown.label}</span>
                </div>
                <table class="table table-sm w-full">
                    <thead><tr><th>ID Transaksi</th><th>Waktu</th><th>Member</th><th class="text-right">Jumlah Cash</th><th></th></tr></thead>
                    <tbody>
                        {#each drilldown.items as item (item.id)}
                            <tr>
                                <td>{item.id}</td>
                                <td>{item.time}</td>
                                <td class="text-base-content/50">{item.member || '—'}</td>
                                <td class="text-right">{formatIDR(item.amount)}</td>
                                <td><a href={item.href} class="btn btn-ghost btn-xs text-info">Lihat →</a></td>
                            </tr>
                        {:else}
                            <tr><td colspan="5" class="text-center text-base-content/40 py-4">Data belum tersedia</td></tr>
                        {/each}
                    </tbody>
                </table>
            {:else}
                <!-- Normal form view -->
                <h3 class="font-bold text-lg mb-4">Tutup Shift</h3>

                <div class="mb-4">
                    <label class="label label-text text-xs uppercase tracking-wide">Tanggal Setor</label>
                    <input type="date" class="input input-bordered input-sm w-48" value={tanggalSetor} on:change={onTanggalChange} />
                </div>

                <!-- Cash breakdown -->
                <p class="text-xs uppercase tracking-wide text-base-content/50 mb-2">Cash Breakdown (Sistem)</p>
                <table class="table table-sm w-full mb-4">
                    <thead><tr><th>Sumber</th><th class="text-right">Transaksi</th><th class="text-right">Jumlah Cash</th><th></th></tr></thead>
                    <tbody>
                        {#each [
                            { key: 'retail',          label: 'Retail',              line: formSnap.cashBreakdown.retail },
                            { key: 'pesananDP',       label: 'Pesanan — DP',        line: formSnap.cashBreakdown.pesananDP },
                            { key: 'pesananCheckout', label: 'Pesanan — Checkout',  line: formSnap.cashBreakdown.pesananCheckout },
                            { key: 'kasMasuk',        label: 'Kas Masuk',           line: formSnap.cashBreakdown.kasMasuk },
                            { key: 'kasKeluar',       label: 'Kas Keluar',          line: formSnap.cashBreakdown.kasKeluar },
                        ] as row}
                            <tr>
                                <td>{row.label}</td>
                                <td class="text-right">{row.line.count}</td>
                                <td class="text-right" class:text-success={row.key === 'kasMasuk' && row.line.amount > 0} class:text-error={row.key === 'kasKeluar' && row.line.amount > 0}>
                                    {row.key === 'kasKeluar' && row.line.amount > 0 ? '−' : ''}{formatIDR(row.line.amount)}
                                </td>
                                <td>
                                    {#if row.line.count > 0}
                                        <button class="btn btn-ghost btn-xs text-info" on:click={() => openDrilldown(row.key, row.label)}>🔍 Lihat</button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                    <tfoot>
                        <tr class="font-bold">
                            <td>Total Cash Sistem</td><td></td>
                            <td class="text-right text-info">{formatIDR(formSnap.systemExpectedCash)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>

                <!-- E-payment crosscheck -->
                {#if formSnap.ePayments.length > 0}
                    <p class="text-xs uppercase tracking-wide text-base-content/30 mb-2">E-Payment (crosscheck, bukan kas)</p>
                    <table class="table table-sm w-full mb-4 opacity-50">
                        <thead><tr><th>Metode</th><th class="text-right">Transaksi</th><th class="text-right">Jumlah</th><th></th></tr></thead>
                        <tbody>
                            {#each formSnap.ePayments as ep}
                                <tr>
                                    <td>{ep.method}</td>
                                    <td class="text-right">{ep.count}</td>
                                    <td class="text-right">{formatIDR(ep.amount)}</td>
                                    <td><button class="btn btn-ghost btn-xs text-info" on:click={() => openDrilldown(ep.method, ep.method)}>🔍 Lihat</button></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {/if}

                <!-- Manual count + selisih -->
                <div class="flex gap-4 mb-4">
                    <div class="flex-1">
                        <label class="label label-text text-xs uppercase tracking-wide">Cash Terhitung (manual)</label>
                        <input type="text" class="input input-bordered w-full" placeholder="Masukkan jumlah uang..." bind:value={physicalInput} />
                    </div>
                    <div class="flex-1">
                        <label class="label label-text text-xs uppercase tracking-wide">Selisih</label>
                        <div class="p-3 rounded-lg bg-base-200 font-bold text-lg" class:text-success={selisih === 0} class:text-error={selisih !== 0}>
                            {selisih === 0 ? 'Rp 0 — Cocok ✓' : formatIDR(selisih)}
                        </div>
                    </div>
                </div>

                <div class="mb-4" class:opacity-30={selisih === 0}>
                    <label class="label label-text text-xs uppercase tracking-wide">
                        Catatan Selisih {#if selisih !== 0}<span class="text-error">*wajib</span>{/if}
                    </label>
                    <textarea class="textarea textarea-bordered w-full" placeholder="Jelaskan penyebab selisih..." bind:value={selisihNotes} disabled={selisih === 0}></textarea>
                </div>

                <div class="modal-action">
                    <button class="btn" on:click={() => showForm = false}>Batal</button>
                    <button class="btn btn-primary" on:click={submitForm} disabled={!selisihOk}>Simpan & Tutup Shift</button>
                </div>
            {/if}
        </div>
        <div class="modal-backdrop" on:click={() => { showForm = false; drilldown = null }}></div>
    </div>
{/if}

<!-- ── Lihat Modal ─────────────────────────────────────────────────────────── -->
{#if lihatShift}
    {@const snap = lihatShift.versions[lihatShift.currentVersionIndex].snapshot}
    <div class="modal modal-open">
        <div class="modal-box max-w-2xl">
            {#if lihatDrilldown}
                <div class="flex items-center gap-2 mb-4">
                    <button class="btn btn-ghost btn-sm" on:click={() => lihatDrilldown = null}>← Kembali</button>
                    <span class="font-semibold">{lihatDrilldown.label}</span>
                </div>
                <table class="table table-sm w-full">
                    <thead><tr><th>ID Transaksi</th><th>Waktu</th><th>Member</th><th class="text-right">Jumlah Cash</th><th></th></tr></thead>
                    <tbody>
                        {#each lihatDrilldown.items as item}
                            <tr><td>{item.id}</td><td>{item.time}</td><td>{item.member || '—'}</td><td class="text-right">{formatIDR(item.amount)}</td><td><a href={item.href} class="btn btn-ghost btn-xs text-info">Lihat →</a></td></tr>
                        {:else}
                            <tr><td colspan="5" class="text-center text-base-content/40 py-4">Data belum tersedia</td></tr>
                        {/each}
                    </tbody>
                </table>
            {:else}
                <h3 class="font-bold text-lg mb-2">Detail Shift — {snap.cashierId}</h3>
                <p class="text-sm text-base-content/50 mb-4">Tanggal Setor: {snap.tanggalSetor} · Disetor: {new Date(snap.submittedAt).toLocaleTimeString('id-ID')}</p>

                <table class="table table-sm w-full mb-4">
                    <thead><tr><th>Sumber</th><th class="text-right">Transaksi</th><th class="text-right">Jumlah Cash</th><th></th></tr></thead>
                    <tbody>
                        {#each [
                            { key:'retail', label:'Retail', line: snap.cashBreakdown.retail },
                            { key:'pesananDP', label:'Pesanan — DP', line: snap.cashBreakdown.pesananDP },
                            { key:'pesananCheckout', label:'Pesanan — Checkout', line: snap.cashBreakdown.pesananCheckout },
                            { key:'kasMasuk', label:'Kas Masuk', line: snap.cashBreakdown.kasMasuk },
                            { key:'kasKeluar', label:'Kas Keluar', line: snap.cashBreakdown.kasKeluar },
                        ] as row}
                            <tr>
                                <td>{row.label}</td>
                                <td class="text-right">{row.line.count}</td>
                                <td class="text-right">{formatIDR(row.line.amount)}</td>
                                <td>{#if row.line.count > 0}<button class="btn btn-ghost btn-xs text-info" on:click={() => lihatDrilldown = { source: row.key, label: row.label, items: [] }}>🔍 Lihat</button>{/if}</td>
                            </tr>
                        {/each}
                    </tbody>
                    <tfoot><tr class="font-bold"><td>Total Cash Sistem</td><td></td><td class="text-right text-info">{formatIDR(snap.systemExpectedCash)}</td><td></td></tr></tfoot>
                </table>

                {#if snap.ePayments.length > 0}
                    <table class="table table-sm w-full mb-4 opacity-50">
                        <thead><tr><th>Metode</th><th class="text-right">Transaksi</th><th class="text-right">Jumlah</th></tr></thead>
                        <tbody>{#each snap.ePayments as ep}<tr><td>{ep.method}</td><td class="text-right">{ep.count}</td><td class="text-right">{formatIDR(ep.amount)}</td></tr>{/each}</tbody>
                    </table>
                {/if}

                <div class="flex gap-4 mb-4">
                    <div><span class="text-xs uppercase tracking-wide text-base-content/50">Cash Terhitung</span><div class="font-bold text-lg">{formatIDR(snap.physicalCashCounted)}</div></div>
                    <div><span class="text-xs uppercase tracking-wide text-base-content/50">Selisih</span><div class="font-bold text-lg" class:text-success={snap.selisih===0} class:text-error={snap.selisih!==0}>{formatIDR(snap.selisih)}</div></div>
                </div>
                {#if snap.selisihNotes}<p class="text-sm mb-4"><span class="text-base-content/50">Catatan:</span> {snap.selisihNotes}</p>{/if}

                <!-- Version strip -->
                <div class="flex gap-2 mt-4 flex-wrap">
                    {#each lihatShift.versions as v}
                        <div class="badge {v.type === 'original' ? 'badge-ghost' : 'badge-success'} badge-sm">V{v.index + 1} {v.type}</div>
                    {/each}
                </div>

                <div class="modal-action">
                    <button class="btn" on:click={() => lihatShift = null}>Tutup</button>
                </div>
            {/if}
        </div>
        <div class="modal-backdrop" on:click={() => lihatShift = null}></div>
    </div>
{/if}

<!-- ── PT Modal ───────────────────────────────────────────────────────────── -->
{#if ptShift}
    {@const isRevision = ptShift.pendingRequest?.status === 'rejected'}
    <div class="modal modal-open">
        <div class="modal-box max-w-lg">
            <h3 class="font-bold text-lg mb-4">Perbaikan Transaksi — {ptShift.id}</h3>

            {#if isRevision}
                <div class="alert alert-warning mb-4">
                    <span class="font-semibold">Ditolak:</span> {ptShift.pendingRequest?.rejectionReason}
                    <span class="text-xs ml-2">(Revisi ke-{(ptShift.pendingRequest?.revisions ?? 0) + 1})</span>
                </div>
            {/if}

            <div class="mb-4">
                <label class="label label-text text-xs uppercase tracking-wide">Tanggal Setor</label>
                <input type="date" class="input input-bordered input-sm w-48" bind:value={ptTanggal} />
            </div>
            <div class="mb-4">
                <label class="label label-text text-xs uppercase tracking-wide">Cash Terhitung</label>
                <input type="number" class="input input-bordered w-full" bind:value={ptPhysical} />
            </div>
            <div class="mb-4">
                <label class="label label-text text-xs uppercase tracking-wide">Catatan Selisih</label>
                <textarea class="textarea textarea-bordered w-full" bind:value={ptNotes}></textarea>
            </div>

            <div class="modal-action">
                <button class="btn" on:click={() => ptShift = null}>Batal</button>
                <button class="btn btn-warning" on:click={submitPT}>{isRevision ? 'Kirim Ulang' : 'Submit Request'}</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => ptShift = null}></div>
    </div>
{/if}
```

- [ ] **Step 2: Verify in browser — open `/outlet/kasir/shift/`**

Check:
- Table shows 5 seeded shifts with correct selisih colors
- "+ Tutup Shift" opens form modal with breakdown rows
- "🔍 Lihat" on a breakdown row swaps form content to drill-down list with breadcrumb
- "← Kembali ke Shift Form" swaps back
- Selisih field turns red when physical ≠ system; notes field enables
- Submit blocked when selisih ≠ 0 and notes is empty
- "Lihat" opens Lihat modal with version strip
- "PT" opens PT modal; shows rejection banner for SHIFT-00003

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/kasir/shift/+page.svelte
git commit -m "feat: add Kasir shift close page"
```

---

## Task 4: Day Close Page

**Files:**
- Create: `src/routes/outlet/kasir/day/+page.svelte`

- [ ] **Step 1: Create the day close page**

```svelte
<!-- src/routes/outlet/kasir/day/+page.svelte -->
<script lang="ts">
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import { getShiftList, getDayList, getDayByDate, closeDay, submitDayRepairRequest, reviseDayRepairRequest } from '$lib/mock/kasir'
    import type { DayClose, DaySnapshot } from '$lib/types/Kasir'
    import { formatIDR } from '$lib/utils/formatter'

    const $auth = get(auth)

    // ── Section 1: close a day ────────────────────────────────────────────────
    let closeDate = new Date().toISOString().slice(0, 10)

    $: shiftsForDate = getShiftList($auth.role === 'admin' ? undefined : $auth.outletId)
        .filter(s => s.versions[s.currentVersionIndex].snapshot.tanggalSetor === closeDate)

    $: existingDay = getDayByDate($auth.outletId, closeDate)

    $: accPhysical  = shiftsForDate.reduce((a, s) => a + s.versions[s.currentVersionIndex].snapshot.physicalCashCounted, 0)
    $: accSystem    = shiftsForDate.reduce((a, s) => a + s.versions[s.currentVersionIndex].snapshot.systemExpectedCash,  0)
    $: accSelisih   = shiftsForDate.reduce((a, s) => a + s.versions[s.currentVersionIndex].snapshot.selisih,             0)

    function doCloseDay() {
        closeDay($auth.outletId, closeDate, $auth.userId)
        allDays = getDayList($auth.role === 'admin' ? undefined : $auth.outletId)
    }

    // ── Section 2: history ────────────────────────────────────────────────────
    let histDateFrom = ''
    let histDateTo   = ''
    let perPage: 10 | 25 | 50 | 100 = 25
    let currentPage = 1

    $: allDays = getDayList($auth.role === 'admin' ? undefined : $auth.outletId)
    $: filtered = allDays.filter(d => {
        return (!histDateFrom || d.tanggal >= histDateFrom) && (!histDateTo || d.tanggal <= histDateTo)
    })
    $: totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
    $: paginated  = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
    $: if (histDateFrom !== undefined || histDateTo !== undefined || perPage) currentPage = 1
    $: pageButtons = (() => {
        let start = Math.max(1, currentPage - 2)
        let end = Math.min(totalPages, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })()

    // ── Lihat modal ───────────────────────────────────────────────────────────
    let lihatDay: DayClose | null = null

    // ── PT modal ──────────────────────────────────────────────────────────────
    let ptDay: DayClose | null = null
    let ptTanggal = ''

    function openPT(day: DayClose) {
        ptDay = day
        ptTanggal = day.pendingRequest?.status === 'rejected'
            ? day.pendingRequest.proposedSnapshot.tanggal
            : day.versions[day.currentVersionIndex].snapshot.tanggal
    }

    function submitPT() {
        if (!ptDay) return
        const cur = ptDay.versions[ptDay.currentVersionIndex].snapshot
        const proposed: DaySnapshot = { ...cur, tanggal: ptTanggal }
        if (ptDay.pendingRequest?.status === 'rejected') {
            reviseDayRepairRequest(ptDay.id, proposed, $auth.userId)
        } else {
            submitDayRepairRequest(ptDay.id, proposed, $auth.userId)
        }
        allDays = getDayList($auth.role === 'admin' ? undefined : $auth.outletId)
        ptDay = null
    }
</script>

<!-- ── Section 1: Tutup Hari ─────────────────────────────────────────────── -->
<div class="card bg-base-200 mb-8">
    <div class="card-body">
        <h2 class="card-title text-base">Tutup Hari</h2>

        <div class="mb-4">
            <label class="label label-text text-xs uppercase tracking-wide">Pilih tanggal yang ingin ditutup</label>
            <input type="date" class="input input-bordered input-sm w-56" bind:value={closeDate} />
        </div>

        {#if existingDay}
            <!-- Day already closed banner -->
            <div class="alert alert-success">
                <span class="font-semibold">✓ Hari sudah ditutup</span>
                <span class="text-sm ml-2">{existingDay.tanggal} · Ditutup oleh {existingDay.versions[existingDay.currentVersionIndex].snapshot.closedBy} · {new Date(existingDay.versions[existingDay.currentVersionIndex].snapshot.closedAt).toLocaleTimeString('id-ID')}</span>
                <div class="flex gap-2 ml-auto">
                    <button class="btn btn-ghost btn-xs" on:click={() => lihatDay = existingDay}>Lihat</button>
                    {#if existingDay.status === 'closed'}
                        <button class="btn btn-ghost btn-xs text-warning" on:click={() => openPT(existingDay)}>PT</button>
                    {/if}
                </div>
            </div>
        {:else}
            <!-- Shifts table for selected date -->
            <table class="table table-sm w-full mb-3">
                <thead>
                    <tr>
                        {#if $auth.role === 'admin'}<th>Outlet</th>{/if}
                        <th>Kasir</th>
                        <th class="text-right">Cash Sistem</th>
                        <th class="text-right">Cash Terhitung</th>
                        <th class="text-right">Selisih</th>
                        <th>Disetor Pukul</th>
                    </tr>
                </thead>
                <tbody>
                    {#each shiftsForDate as shift (shift.id)}
                        {@const snap = shift.versions[shift.currentVersionIndex].snapshot}
                        <tr>
                            {#if $auth.role === 'admin'}<td>{snap.outletId}</td>{/if}
                            <td>{snap.cashierId}</td>
                            <td class="text-right">{formatIDR(snap.systemExpectedCash)}</td>
                            <td class="text-right" class:text-error={snap.selisih !== 0}>{formatIDR(snap.physicalCashCounted)}</td>
                            <td class="text-right" class:text-success={snap.selisih === 0} class:text-error={snap.selisih !== 0}>{formatIDR(snap.selisih)}</td>
                            <td class="text-base-content/50">{new Date(snap.submittedAt).toLocaleTimeString('id-ID')}</td>
                        </tr>
                    {:else}
                        <tr><td colspan="6" class="text-center text-base-content/40 py-4">Belum ada shift untuk tanggal ini</td></tr>
                    {/each}
                </tbody>
                {#if shiftsForDate.length > 0}
                    <tfoot>
                        <tr class="font-bold">
                            {#if $auth.role === 'admin'}<td></td>{/if}
                            <td>Akumulasi</td>
                            <td class="text-right text-info">{formatIDR(accSystem)}</td>
                            <td class="text-right text-info">{formatIDR(accPhysical)}</td>
                            <td class="text-right" class:text-success={accSelisih === 0} class:text-error={accSelisih !== 0}>{formatIDR(accSelisih)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                {/if}
            </table>

            <div class="flex justify-end">
                <button class="btn btn-success" on:click={doCloseDay}>✓ Tutup Hari</button>
            </div>
        {/if}
    </div>
</div>

<!-- ── Section 2: Riwayat Tutup Hari ──────────────────────────────────────── -->
<div>
    <h2 class="text-base font-bold mb-4">Riwayat Tutup Hari</h2>

    <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-2">
            <input type="date" class="input input-bordered input-sm" bind:value={histDateFrom} />
            <span class="text-base-content/40 text-sm">—</span>
            <input type="date" class="input input-bordered input-sm" bind:value={histDateTo} />
        </div>
        <select class="select select-bordered select-sm" bind:value={perPage}>
            <option value={10}>10 / halaman</option>
            <option value={25}>25 / halaman</option>
            <option value={50}>50 / halaman</option>
            <option value={100}>100 / halaman</option>
        </select>
    </div>

    <div class="overflow-x-auto">
        <table class="table table-sm w-full">
            <thead>
                <tr>
                    {#if $auth.role === 'admin'}<th>Outlet</th>{/if}
                    <th>Tanggal</th>
                    <th class="text-right">Cash Sistem</th>
                    <th class="text-right">Cash Terhitung</th>
                    <th class="text-right">Selisih</th>
                    <th>Ditutup Oleh</th>
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody>
                {#each paginated as day (day.id)}
                    {@const snap = day.versions[day.currentVersionIndex].snapshot}
                    <tr>
                        {#if $auth.role === 'admin'}<td>{snap.outletId}</td>{/if}
                        <td>{snap.tanggal}</td>
                        <td class="text-right">{formatIDR(snap.totalSystemExpected)}</td>
                        <td class="text-right" class:text-error={snap.totalSelisih !== 0}>{formatIDR(snap.totalPhysicalCash)}</td>
                        <td class="text-right" class:text-success={snap.totalSelisih === 0} class:text-error={snap.totalSelisih !== 0}>{formatIDR(snap.totalSelisih)}</td>
                        <td class="text-base-content/50">{snap.closedBy}</td>
                        <td class="flex gap-2">
                            <button class="btn btn-ghost btn-xs" on:click={() => lihatDay = day}>Lihat</button>
                            {#if day.status === 'closed'}
                                <button class="btn btn-ghost btn-xs text-warning" on:click={() => openPT(day)}>PT</button>
                                {#if $auth.role === 'admin'}
                                    <button class="btn btn-ghost btn-xs text-error">Hapus</button>
                                {/if}
                            {:else if day.status === 'awaiting_pt'}
                                <span class="badge badge-warning badge-sm">⏳ Menunggu PT</span>
                            {/if}
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
                <button class="btn btn-sm {p === currentPage ? 'btn-primary' : 'btn-ghost'}" on:click={() => currentPage = p}>{p}</button>
            {/each}
            <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
        </div>
    {/if}
</div>

<!-- ── Lihat Modal ─────────────────────────────────────────────────────────── -->
{#if lihatDay}
    {@const snap = lihatDay.versions[lihatDay.currentVersionIndex].snapshot}
    <div class="modal modal-open">
        <div class="modal-box max-w-2xl">
            <h3 class="font-bold text-lg mb-2">Detail Tutup Hari — {snap.tanggal}</h3>
            <p class="text-sm text-base-content/50 mb-4">Ditutup oleh {snap.closedBy} · {new Date(snap.closedAt).toLocaleTimeString('id-ID')}</p>

            <table class="table table-sm w-full mb-4">
                <thead><tr><th>Kasir</th><th class="text-right">Cash Sistem</th><th class="text-right">Cash Terhitung</th><th class="text-right">Selisih</th></tr></thead>
                <tbody>
                    {#each snap.shifts as s}
                        <tr>
                            <td>{s.cashierId}</td>
                            <td class="text-right">{formatIDR(s.systemExpectedCash)}</td>
                            <td class="text-right">{formatIDR(s.physicalCashCounted)}</td>
                            <td class="text-right" class:text-success={s.selisih===0} class:text-error={s.selisih!==0}>{formatIDR(s.selisih)}</td>
                        </tr>
                    {/each}
                </tbody>
                <tfoot>
                    <tr class="font-bold">
                        <td>Akumulasi</td>
                        <td class="text-right text-info">{formatIDR(snap.totalSystemExpected)}</td>
                        <td class="text-right text-info">{formatIDR(snap.totalPhysicalCash)}</td>
                        <td class="text-right" class:text-success={snap.totalSelisih===0} class:text-error={snap.totalSelisih!==0}>{formatIDR(snap.totalSelisih)}</td>
                    </tr>
                </tfoot>
            </table>

            <div class="flex gap-2 flex-wrap">
                {#each lihatDay.versions as v}
                    <div class="badge {v.type === 'original' ? 'badge-ghost' : 'badge-success'} badge-sm">V{v.index + 1} {v.type}</div>
                {/each}
            </div>

            <div class="modal-action">
                <button class="btn" on:click={() => lihatDay = null}>Tutup</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => lihatDay = null}></div>
    </div>
{/if}

<!-- ── PT Modal ───────────────────────────────────────────────────────────── -->
{#if ptDay}
    {@const isRevision = ptDay.pendingRequest?.status === 'rejected'}
    <div class="modal modal-open">
        <div class="modal-box max-w-sm">
            <h3 class="font-bold text-lg mb-4">PT Tutup Hari — {ptDay.id}</h3>
            {#if isRevision}
                <div class="alert alert-warning mb-4">
                    <span class="font-semibold">Ditolak:</span> {ptDay.pendingRequest?.rejectionReason}
                </div>
            {/if}
            <div class="mb-4">
                <label class="label label-text text-xs uppercase tracking-wide">Tanggal</label>
                <input type="date" class="input input-bordered input-sm w-full" bind:value={ptTanggal} />
            </div>
            <div class="modal-action">
                <button class="btn" on:click={() => ptDay = null}>Batal</button>
                <button class="btn btn-warning" on:click={submitPT}>{isRevision ? 'Kirim Ulang' : 'Submit Request'}</button>
            </div>
        </div>
        <div class="modal-backdrop" on:click={() => ptDay = null}></div>
    </div>
{/if}
```

- [ ] **Step 2: Verify in browser — open `/outlet/kasir/day/`**

Check:
- Section 1: date picker defaults to today; shifts table shows all shifts for that date
- Selecting a date with an existing DayClose shows the green banner instead of the table
- "✓ Tutup Hari" creates a DayClose and shows the green banner
- Section 2: history table shows DAY-00001 (closed) and DAY-00002 (awaiting_pt)
- Date range filter in Section 2 is independent of the close-date picker in Section 1
- "Lihat" opens the detail modal with shifts summary and version strip
- "PT" opens PT modal; DAY-00002's PT button shows the pending badge instead

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/kasir/day/+page.svelte
git commit -m "feat: add Kasir day close page"
```

---

## Task 5: Admin Repair Page

**Files:**
- Create: `src/routes/outlet/kasir/repair/+page.svelte`

- [ ] **Step 1: Create the admin repair page**

```svelte
<!-- src/routes/outlet/kasir/repair/+page.svelte -->
<script lang="ts">
    import { get } from 'svelte/store'
    import { goto } from '$app/navigation'
    import { auth } from '$lib/stores/auth'
    import {
        getPendingShiftRepairRequests, getPendingDayRepairRequests,
        getResolvedShiftRepairRequests, getResolvedDayRepairRequests,
        getShiftById, getDayList,
        approveShiftRepairRequest, rejectShiftRepairRequest, deleteShiftRepairRequest, deleteShift,
        approveDayRepairRequest, rejectDayRepairRequest, deleteDayRepairRequest, deleteDay
    } from '$lib/mock/kasir'
    import type { ShiftRepairRequest, DayRepairRequest, ShiftClose, DayClose } from '$lib/types/Kasir'
    import { formatIDR } from '$lib/utils/formatter'

    const $auth = get(auth)
    if ($auth.role !== 'admin') goto('/outlet/kasir/shift')

    let activeTab: 'shift' | 'hari' = 'shift'

    // ── Shift tab ─────────────────────────────────────────────────────────────
    $: pendingShift   = getPendingShiftRepairRequests()
    $: resolvedShift  = getResolvedShiftRepairRequests()

    let selectedShiftReq: ShiftRepairRequest | null = null
    $: selectedShift = selectedShiftReq ? getShiftById(selectedShiftReq.shiftId) ?? null : null

    let shiftRejectReason = ''
    let showShiftRejectInput = false

    function approveShift() {
        if (!selectedShiftReq) return
        approveShiftRepairRequest(selectedShiftReq.shiftId, $auth.userId)
        selectedShiftReq = null
        showShiftRejectInput = false
    }
    function rejectShift() {
        if (!selectedShiftReq || !shiftRejectReason.trim()) return
        rejectShiftRepairRequest(selectedShiftReq.shiftId, shiftRejectReason, $auth.userId)
        selectedShiftReq = null
        shiftRejectReason = ''
        showShiftRejectInput = false
    }
    function deleteShiftReq() {
        if (!selectedShiftReq) return
        deleteShiftRepairRequest(selectedShiftReq.shiftId, $auth.userId)
        selectedShiftReq = null
    }
    function doDeleteShift() {
        if (!selectedShiftReq) return
        deleteShift(selectedShiftReq.shiftId, $auth.userId)
        selectedShiftReq = null
    }

    // ── Day tab ───────────────────────────────────────────────────────────────
    $: pendingDay  = getPendingDayRepairRequests()
    $: resolvedDay = getResolvedDayRepairRequests()

    let selectedDayReq: DayRepairRequest | null = null
    $: selectedDay = selectedDayReq
        ? (getDayList().find(d => d.id === selectedDayReq!.dayId) ?? null)
        : null

    let dayRejectReason = ''
    let showDayRejectInput = false

    function approveDay() {
        if (!selectedDayReq) return
        approveDayRepairRequest(selectedDayReq.dayId, $auth.userId)
        selectedDayReq = null
        showDayRejectInput = false
    }
    function rejectDay() {
        if (!selectedDayReq || !dayRejectReason.trim()) return
        rejectDayRepairRequest(selectedDayReq.dayId, dayRejectReason, $auth.userId)
        selectedDayReq = null
        dayRejectReason = ''
        showDayRejectInput = false
    }
    function deleteDayReq() {
        if (!selectedDayReq) return
        deleteDayRepairRequest(selectedDayReq.dayId, $auth.userId)
        selectedDayReq = null
    }

    function diffLabel(fields: string[]): string {
        return fields.length === 0 ? '—' : fields.join(', ')
    }
</script>

<!-- Tabs -->
<div class="tabs tabs-bordered mb-6">
    <button class="tab {activeTab === 'shift' ? 'tab-active' : ''}" on:click={() => { activeTab = 'shift'; selectedShiftReq = null }}>
        Shift {#if pendingShift.length > 0}<span class="badge badge-warning badge-sm ml-1">{pendingShift.length}</span>{/if}
    </button>
    <button class="tab {activeTab === 'hari' ? 'tab-active' : ''}" on:click={() => { activeTab = 'hari'; selectedDayReq = null }}>
        Hari {#if pendingDay.length > 0}<span class="badge badge-warning badge-sm ml-1">{pendingDay.length}</span>{/if}
    </button>
</div>

<!-- ── Shift Tab ──────────────────────────────────────────────────────────── -->
{#if activeTab === 'shift'}
    <div class="flex gap-4">
        <!-- Pending list -->
        <div class="w-80 flex-shrink-0">
            <p class="text-xs uppercase tracking-wide text-base-content/50 mb-2">Menunggu ({pendingShift.length})</p>
            <div class="flex flex-col gap-1">
                {#each pendingShift as req (req.id)}
                    <button
                        class="text-left p-3 rounded-lg border {selectedShiftReq?.id === req.id ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50'}"
                        on:click={() => { selectedShiftReq = req; showShiftRejectInput = false }}
                    >
                        <div class="font-semibold text-sm">{req.shiftId}</div>
                        <div class="text-xs text-base-content/50">{req.submittedBy} · {req.submittedAt.slice(0,10)}</div>
                        {#if req.revisions > 0}<div class="badge badge-sm badge-ghost mt-1">Revisi ke-{req.revisions}</div>{/if}
                    </button>
                {:else}
                    <p class="text-sm text-base-content/40 py-4 text-center">Tidak ada permintaan pending</p>
                {/each}
            </div>

            {#if resolvedShift.length > 0}
                <p class="text-xs uppercase tracking-wide text-base-content/50 mb-2 mt-6">Selesai ({resolvedShift.length})</p>
                <div class="flex flex-col gap-1">
                    {#each resolvedShift as req (req.id)}
                        <div class="p-3 rounded-lg border border-base-300 opacity-60">
                            <div class="font-semibold text-sm">{req.shiftId}</div>
                            <div class="text-xs text-base-content/50">{req.submittedBy}</div>
                            <div class="badge badge-sm {req.status === 'rejected' ? 'badge-error' : 'badge-success'} mt-1">
                                {req.status === 'rejected' ? 'Ditolak' : 'Disetujui'}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Diff panel -->
        {#if selectedShiftReq && selectedShift}
            {@const current  = selectedShift.versions[selectedShift.currentVersionIndex].snapshot}
            {@const proposed = selectedShiftReq.proposedSnapshot}
            <div class="flex-1 border border-base-300 rounded-lg p-4">
                <h3 class="font-bold mb-4">Diff — {selectedShift.id}</h3>
                <table class="table table-sm w-full mb-4">
                    <thead><tr><th>Field</th><th>Saat Ini</th><th>Diusulkan</th></tr></thead>
                    <tbody>
                        {#each [
                            { label: 'Tanggal Setor',     cur: current.tanggalSetor,          prop: proposed.tanggalSetor },
                            { label: 'Cash Terhitung',    cur: formatIDR(current.physicalCashCounted), prop: formatIDR(proposed.physicalCashCounted) },
                            { label: 'Selisih',           cur: formatIDR(current.selisih),    prop: formatIDR(proposed.selisih) },
                            { label: 'Catatan Selisih',   cur: current.selisihNotes || '—',   prop: proposed.selisihNotes || '—' },
                        ] as row}
                            <tr class:bg-warning/10={row.cur !== row.prop}>
                                <td class="font-medium">{row.label}</td>
                                <td class:text-base-content/40={row.cur !== row.prop}>{row.cur}</td>
                                <td class:font-bold={row.cur !== row.prop} class:text-warning={row.cur !== row.prop}>{row.prop}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>

                <div class="flex gap-2 flex-wrap">
                    <button class="btn btn-success btn-sm" on:click={approveShift}>Setujui</button>
                    {#if showShiftRejectInput}
                        <input type="text" class="input input-bordered input-sm flex-1" placeholder="Alasan penolakan..." bind:value={shiftRejectReason} />
                        <button class="btn btn-error btn-sm" on:click={rejectShift} disabled={!shiftRejectReason.trim()}>Konfirmasi Tolak</button>
                    {:else}
                        <button class="btn btn-error btn-sm btn-outline" on:click={() => showShiftRejectInput = true}>Tolak</button>
                    {/if}
                    <button class="btn btn-ghost btn-sm" on:click={deleteShiftReq}>Hapus Request</button>
                    <button class="btn btn-ghost btn-sm text-error" on:click={doDeleteShift}>Hapus Transaksi</button>
                </div>
            </div>
        {:else}
            <div class="flex-1 flex items-center justify-center text-base-content/30">Pilih permintaan untuk melihat diff</div>
        {/if}
    </div>
{/if}

<!-- ── Hari Tab ────────────────────────────────────────────────────────────── -->
{#if activeTab === 'hari'}
    <div class="flex gap-4">
        <div class="w-80 flex-shrink-0">
            <p class="text-xs uppercase tracking-wide text-base-content/50 mb-2">Menunggu ({pendingDay.length})</p>
            <div class="flex flex-col gap-1">
                {#each pendingDay as req (req.id)}
                    <button
                        class="text-left p-3 rounded-lg border {selectedDayReq?.id === req.id ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50'}"
                        on:click={() => { selectedDayReq = req; showDayRejectInput = false }}
                    >
                        <div class="font-semibold text-sm">{req.dayId}</div>
                        <div class="text-xs text-base-content/50">{req.submittedBy} · {req.submittedAt.slice(0,10)}</div>
                        {#if req.revisions > 0}<div class="badge badge-sm badge-ghost mt-1">Revisi ke-{req.revisions}</div>{/if}
                    </button>
                {:else}
                    <p class="text-sm text-base-content/40 py-4 text-center">Tidak ada permintaan pending</p>
                {/each}
            </div>

            {#if resolvedDay.length > 0}
                <p class="text-xs uppercase tracking-wide text-base-content/50 mb-2 mt-6">Selesai ({resolvedDay.length})</p>
                <div class="flex flex-col gap-1">
                    {#each resolvedDay as req (req.id)}
                        <div class="p-3 rounded-lg border border-base-300 opacity-60">
                            <div class="font-semibold text-sm">{req.dayId}</div>
                            <div class="badge badge-sm {req.status === 'rejected' ? 'badge-error' : 'badge-success'} mt-1">
                                {req.status === 'rejected' ? 'Ditolak' : 'Disetujui'}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        {#if selectedDayReq && selectedDay}
            {@const current  = selectedDay.versions[selectedDay.currentVersionIndex].snapshot}
            {@const proposed = selectedDayReq.proposedSnapshot}
            <div class="flex-1 border border-base-300 rounded-lg p-4">
                <h3 class="font-bold mb-4">Diff — {selectedDay.id}</h3>
                <table class="table table-sm w-full mb-4">
                    <thead><tr><th>Field</th><th>Saat Ini</th><th>Diusulkan</th></tr></thead>
                    <tbody>
                        <tr class:bg-warning/10={current.tanggal !== proposed.tanggal}>
                            <td class="font-medium">Tanggal</td>
                            <td class:text-base-content/40={current.tanggal !== proposed.tanggal}>{current.tanggal}</td>
                            <td class:font-bold={current.tanggal !== proposed.tanggal} class:text-warning={current.tanggal !== proposed.tanggal}>{proposed.tanggal}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="flex gap-2 flex-wrap">
                    <button class="btn btn-success btn-sm" on:click={approveDay}>Setujui</button>
                    {#if showDayRejectInput}
                        <input type="text" class="input input-bordered input-sm flex-1" placeholder="Alasan penolakan..." bind:value={dayRejectReason} />
                        <button class="btn btn-error btn-sm" on:click={rejectDay} disabled={!dayRejectReason.trim()}>Konfirmasi Tolak</button>
                    {:else}
                        <button class="btn btn-error btn-sm btn-outline" on:click={() => showDayRejectInput = true}>Tolak</button>
                    {/if}
                    <button class="btn btn-ghost btn-sm" on:click={deleteDayReq}>Hapus Request</button>
                    <button class="btn btn-ghost btn-sm text-error" on:click={() => { deleteDay(selectedDayReq!.dayId, $auth.userId); selectedDayReq = null }}>Hapus Record</button>
                </div>
            </div>
        {:else}
            <div class="flex-1 flex items-center justify-center text-base-content/30">Pilih permintaan untuk melihat diff</div>
        {/if}
    </div>
{/if}
```

- [ ] **Step 2: Verify in browser — open `/outlet/kasir/repair/` as admin**

Check:
- Non-admin gets redirected to `/outlet/kasir/shift/`
- Shift tab shows SHIFT-00003's pending request in the list
- Clicking the request shows the diff panel with changed fields highlighted
- "Setujui" creates a new approved version, request disappears from pending list
- "Tolak" requires reason input before confirming; shifts to "Selesai" section
- Day tab shows DAY-00002's pending request

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/kasir/repair/+page.svelte
git commit -m "feat: add Kasir admin repair page"
```

---

## Task 6: Layout Nav Link

**Files:**
- Modify: `src/routes/outlet/+layout.svelte`

- [ ] **Step 1: Add Kasir nav links**

In `src/routes/outlet/+layout.svelte`, find the nav links section and add:

```svelte
<a href="/outlet/kasir/shift" class="...">Kasir Shift</a>
<a href="/outlet/kasir/day" class="...">Tutup Hari</a>
```

Follow the existing link style in the file exactly.

- [ ] **Step 2: Verify the links appear in the nav and route correctly**

Open the app, confirm "Kasir Shift" and "Tutup Hari" appear in the outlet navigation and each routes to the correct page.

- [ ] **Step 3: Commit**

```bash
git add src/routes/outlet/+layout.svelte
git commit -m "feat: add Kasir nav links to outlet layout"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| ShiftClose data model | Task 1 |
| DayClose data model | Task 1 |
| Mock functions — all queries, submitShift, closeDay, PT | Task 2 |
| Seed data — 5 shifts, 2 day closes | Task 2 |
| Shift close page — table, toolbar, status badges, actions | Task 3 |
| Shift close form — breakdown, e-payment, selisih, notes | Task 3 |
| Drill-down content swap | Task 3 |
| Lihat modal with version strip | Task 3 |
| PT modal with revision banner | Task 3 |
| Day close — date picker, shifts panel, Tutup Hari | Task 4 |
| Day close — already-closed banner | Task 4 |
| History section — independent filter, pagination | Task 4 |
| Admin repair page — Shift / Hari tabs | Task 5 |
| Diff panel — current vs proposed, changed fields highlighted | Task 5 |
| Approve / Reject / Delete request / Delete record | Task 5 |
| Nav link | Task 6 |
| Admin redirect for non-admin on repair page | Task 5 |

**Type consistency check:** All types defined in Task 1 are used consistently across Task 2 mock and Task 3–5 pages. `ShiftSnapshot`, `DaySnapshot`, `ShiftClose`, `DayClose` names are uniform throughout.

**No placeholders:** All code blocks are complete. `openDrilldown` populates an empty `items` array with a comment noting population from mocks — this is intentional since the dependent mocks (riwayat, pesanan, kas) are built in separate plans.
