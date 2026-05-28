# PT Requests (Perbaikan Transaksi) API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `GET /api/pt-requests`, `POST /api/pt-requests`, `GET /api/pt-requests/:requestId`, `PUT /api/pt-requests/:requestId`, `PATCH /api/pt-requests/:requestId/approve`, and `PATCH /api/pt-requests/:requestId/reject` on the existing Bun + Elysia.js backend.

**Architecture:** A PT request captures the before/after snapshots of a transaction and stays `pending` until a manager/admin approves or rejects it. On approval, the original transaction's items, payments, and pricing are fully replaced from `newSnapshot`, and stock is adjusted: for each item, `delta = oldQty - newQty` is applied to `outletStock.stock` and logged as a `stockMovements` row with `sourceType: 'pt_approval'`. Rejection just flips status to `rejected` with no stock changes. The `ptRequests` table has no `outletId` — filter by outletId is done via an `innerJoin` with `transactions`. All writes are wrapped in `db.transaction()`.

**Tech Stack:** Bun, Elysia.js 1.4.28, Drizzle ORM, PostgreSQL, `bun:test`

**Prerequisite:** Group 6 complete — 73 tests pass.

**Seed users available:**
- `kasir1 / kasir123` — cashier (creates PT requests)
- `manager / manager123` — manager (approves/rejects)
- `admin / admin123` — admin

**Role check:** `PATCH /approve` and `PATCH /reject` require `session.role !== 'cashier'` — return 403 otherwise.

**Naming rules:** camelCase, no single-letter vars, `caughtError` in catch, controllers ← models only, models never call `status()`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/models/ptRequests.model.ts` | Create | `getPtRequests`, `getPtRequestById`, `createPtRequest`, `updatePtRequest`, `approvePtRequest`, `rejectPtRequest` |
| `server/src/controllers/ptRequests.controller.ts` | Create | 6 handlers |
| `server/src/routes/ptRequests.test.ts` | Create | Integration tests for all 6 endpoints |
| `server/src/routes/index.ts` | Modify | Mount all PT request routes |

---

### Task 1: POST /api/pt-requests — create PT request

**Files:**
- Create: `server/src/models/ptRequests.model.ts`
- Create: `server/src/controllers/ptRequests.controller.ts`
- Create: `server/src/routes/ptRequests.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/ptRequests.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { items, outletStock, transactions, transactionItems, transactionPayments, ptRequests, stockMovements, auditLog } from '../db/schema'
import { eq } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let cashierHeaders:  Record<string, string> = {}
let managerHeaders:  Record<string, string> = {}
let testOutletId     = ''
let testItemId       = ''
let testStockRowId   = ''
let testTransactionId = ''
let createdPtId      = ''   // used for list/detail/update/reject tests
let approvePtId      = ''   // created and approved in approve test

beforeAll(async () => {
    // Login as cashier
    const cashierLogin = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method: 'POST', headers: BASE_HEADERS,
            body: JSON.stringify({ username: 'kasir1', password: 'kasir123' })
        })
    )
    const cashierData = await cashierLogin.json() as { token: string; user: { outletId: string } }
    cashierHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${cashierData.token}` }
    testOutletId   = cashierData.user.outletId

    // Login as manager (for approve/reject)
    const managerLogin = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method: 'POST', headers: BASE_HEADERS,
            body: JSON.stringify({ username: 'manager', password: 'manager123' })
        })
    )
    const managerData = await managerLogin.json() as { token: string }
    managerHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${managerData.token}` }

    // Create test item
    const [insertedItem] = await db.insert(items).values({
        sku: 'PT-TEST-001', name: 'Test Item PT', category: 'Test',
        itemType: 'finished_good', priceLevel1: '20000', priceLevel2: '19000',
        priceLevel3: '18000', isActive: true
    }).returning()
    testItemId = insertedItem.id

    // Create outletStock (stock: 60)
    const [insertedStock] = await db.insert(outletStock).values({
        itemId: testItemId, outletId: testOutletId, stock: 60, preAdjDelta: 0
    }).returning()
    testStockRowId = insertedStock.id

    // Create a real transaction (qty: 5 → stock becomes 55)
    const txResponse = await app.handle(
        new Request('http://localhost/api/transactions', {
            method: 'POST',
            headers: { ...cashierHeaders, 'X-Idempotency-Key': crypto.randomUUID() },
            body: JSON.stringify({
                memberId: null, mode: 'retail',
                items: [{ id: testItemId, qty: 5, price: 20000, isFree: false }],
                subtotal: 100000, kupon: null,
                additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                total: 100000, notes: 'PT test transaction',
                paymentMethods: [{ method: 'Tunai', amount: 100000 }]
            })
        })
    )
    const txData = await txResponse.json() as { id: string }
    testTransactionId = txData.id
})

afterAll(async () => {
    // Clean up approve PT request
    if (approvePtId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, approvePtId))
        await db.delete(stockMovements).where(eq(stockMovements.sourceId, approvePtId))
        await db.delete(ptRequests).where(eq(ptRequests.id, approvePtId))
    }
    // Clean up main PT request
    if (createdPtId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, createdPtId))
        await db.delete(ptRequests).where(eq(ptRequests.id, createdPtId))
    }
    // Clean up the test transaction (approve may have replaced items/payments)
    if (testTransactionId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, testTransactionId))
        await db.delete(stockMovements).where(eq(stockMovements.sourceId, testTransactionId))
        await db.delete(transactionPayments).where(eq(transactionPayments.transactionId, testTransactionId))
        await db.delete(transactionItems).where(eq(transactionItems.transactionId, testTransactionId))
        await db.delete(transactions).where(eq(transactions.id, testTransactionId))
    }
    await db.delete(outletStock).where(eq(outletStock.id, testStockRowId))
    await db.delete(items).where(eq(items.id, testItemId))
})

describe('POST /api/pt-requests', () => {
    it('returns 201 and creates a pending PT request', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/pt-requests', {
                method: 'POST', headers: cashierHeaders,
                body: JSON.stringify({
                    transactionId: testTransactionId,
                    reason: 'Item qty was entered wrong',
                    newSnapshot: {
                        items: [{ id: testItemId, qty: 3, price: 20000, isFree: false }],
                        subtotal: 60000, kupon: null,
                        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                        total: 60000, notes: 'PT test transaction',
                        paymentMethods: [{ method: 'Tunai', amount: 60000 }]
                    }
                })
            })
        )
        const responseData = await response.json() as { message: string; id: string }
        expect(response.status).toBe(201)
        expect(responseData.id).toBeTruthy()
        expect(responseData.message).toBe('Permintaan perbaikan berhasil dikirim.')
        createdPtId = responseData.id
    })

    it('returns 404 when transactionId does not exist', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/pt-requests', {
                method: 'POST', headers: cashierHeaders,
                body: JSON.stringify({
                    transactionId: 'nonexistent-tx-id',
                    reason: 'Test',
                    newSnapshot: {
                        items: [], subtotal: 0, kupon: null,
                        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                        total: 0, notes: '', paymentMethods: []
                    }
                })
            })
        )
        expect(response.status).toBe(404)
    })

    it('returns 401 without auth token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/pt-requests', {
                method: 'POST', headers: BASE_HEADERS,
                body: JSON.stringify({
                    transactionId: testTransactionId, reason: 'x',
                    newSnapshot: { items: [], subtotal: 0, kupon: null,
                        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                        total: 0, notes: '', paymentMethods: [] }
                })
            })
        )
        expect(response.status).toBe(401)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/ptRequests.test.ts 2>&1
```

Expected: FAIL (routes not mounted yet).

- [ ] **Step 3: Create `server/src/models/ptRequests.model.ts`**

```typescript
import { db } from '../db'
import { ptRequests, transactions, transactionItems, transactionPayments, outletStock, stockMovements, auditLog } from '../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export interface PtSnapshotItem {
    id:     string
    qty:    number
    price:  number
    isFree: boolean
}

export interface PtSnapshot {
    items:           PtSnapshotItem[]
    subtotal:        number
    kupon:           { kode: string; nilaiPotongan: number; cartMutations: unknown; authNip: string | null } | null
    additionalCosts: { packaging: number; transport: number; modification: number }
    total:           number
    notes:           string
    paymentMethods:  Array<{ method: string; amount: number }>
}

export async function getPtRequests(params: {
    outletId?: string
    status?:   'pending' | 'approved' | 'rejected'
    page:      number
    limit:     number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        params.outletId ? eq(transactions.outletId, params.outletId) : undefined,
        params.status   ? eq(ptRequests.status,     params.status)   : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ptRequests)
        .innerJoin(transactions, eq(transactions.id, ptRequests.transactionId))
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select({
            id:            ptRequests.id,
            transactionId: ptRequests.transactionId,
            requestedBy:   ptRequests.requestedBy,
            reviewedBy:    ptRequests.reviewedBy,
            reason:        ptRequests.reason,
            status:        ptRequests.status,
            oldSnapshot:   ptRequests.oldSnapshot,
            newSnapshot:   ptRequests.newSnapshot,
            createdAt:     ptRequests.createdAt,
            reviewedAt:    ptRequests.reviewedAt
        })
        .from(ptRequests)
        .innerJoin(transactions, eq(transactions.id, ptRequests.transactionId))
        .where(whereConditions)
        .orderBy(desc(ptRequests.createdAt))
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getPtRequestById(requestId: string) {
    const [foundRequest] = await db
        .select()
        .from(ptRequests)
        .where(eq(ptRequests.id, requestId))
    return foundRequest ?? null
}

export async function createPtRequest(params: {
    transactionId: string
    reason:        string
    newSnapshot:   PtSnapshot
}, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingTransaction] = await databaseTransaction
            .select()
            .from(transactions)
            .where(eq(transactions.id, params.transactionId))

        if (!existingTransaction) throw new Error('TRANSACTION_NOT_FOUND')

        const txItems    = await databaseTransaction.select().from(transactionItems).where(eq(transactionItems.transactionId, params.transactionId))
        const txPayments = await databaseTransaction.select().from(transactionPayments).where(eq(transactionPayments.transactionId, params.transactionId))

        const oldSnapshot: PtSnapshot = {
            items:           txItems.map(item => ({ id: item.itemId, qty: item.qty, price: Number(item.price), isFree: item.isFree })),
            subtotal:        Number(existingTransaction.subtotal),
            kupon:           existingTransaction.kupon as PtSnapshot['kupon'],
            additionalCosts: existingTransaction.additionalCosts as PtSnapshot['additionalCosts'],
            total:           Number(existingTransaction.total),
            notes:           existingTransaction.notes,
            paymentMethods:  txPayments.map(payment => ({ method: payment.method, amount: Number(payment.amount) }))
        }

        const [savedRequest] = await databaseTransaction
            .insert(ptRequests)
            .values({
                transactionId: params.transactionId,
                requestedBy:   session.userId,
                reason:        params.reason,
                oldSnapshot:   oldSnapshot,
                newSnapshot:   params.newSnapshot,
                status:        'pending'
            })
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'pt_request',
            entityId:   savedRequest.id,
            newValue:   params,
            requestId:  null
        })

        return savedRequest
    })
}

export async function updatePtRequest(requestId: string, params: {
    reason:      string
    newSnapshot: PtSnapshot
}, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingRequest] = await databaseTransaction
            .select()
            .from(ptRequests)
            .where(and(eq(ptRequests.id, requestId), eq(ptRequests.status, 'pending')))

        if (!existingRequest) throw new Error('PT_REQUEST_NOT_FOUND_OR_NOT_PENDING')

        const [updatedRequest] = await databaseTransaction
            .update(ptRequests)
            .set({ reason: params.reason, newSnapshot: params.newSnapshot })
            .where(eq(ptRequests.id, requestId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'update',
            entityType: 'pt_request',
            entityId:   requestId,
            oldValue:   { reason: existingRequest.reason, newSnapshot: existingRequest.newSnapshot },
            newValue:   params,
            requestId:  null
        })

        return updatedRequest
    })
}

export async function approvePtRequest(requestId: string, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingRequest] = await databaseTransaction
            .select()
            .from(ptRequests)
            .where(and(eq(ptRequests.id, requestId), eq(ptRequests.status, 'pending')))

        if (!existingRequest) throw new Error('PT_REQUEST_NOT_FOUND_OR_NOT_PENDING')

        const [existingTransaction] = await databaseTransaction
            .select()
            .from(transactions)
            .where(eq(transactions.id, existingRequest.transactionId))

        const oldSnapshot = existingRequest.oldSnapshot as PtSnapshot
        const newSnapshot = existingRequest.newSnapshot as PtSnapshot

        // Compute stock adjustments: oldQty - newQty per item (non-free only)
        const oldItemMap = new Map(oldSnapshot.items.filter(item => !item.isFree).map(item => [item.id, item.qty]))
        const newItemMap = new Map(newSnapshot.items.filter(item => !item.isFree).map(item => [item.id, item.qty]))
        const allItemIds = new Set([...oldItemMap.keys(), ...newItemMap.keys()])

        for (const itemId of allItemIds) {
            const oldQty     = oldItemMap.get(itemId) ?? 0
            const newQty     = newItemMap.get(itemId) ?? 0
            const stockDelta = oldQty - newQty  // positive = return stock, negative = deduct more

            if (stockDelta !== 0) {
                await databaseTransaction
                    .update(outletStock)
                    .set({ stock: sql`${outletStock.stock} + ${stockDelta}` })
                    .where(and(
                        eq(outletStock.itemId,   itemId),
                        eq(outletStock.outletId, existingTransaction.outletId)
                    ))

                await databaseTransaction.insert(stockMovements).values({
                    itemId:     itemId,
                    outletId:   existingTransaction.outletId,
                    delta:      stockDelta,
                    sourceType: 'pt_approval',
                    sourceId:   requestId,
                    createdBy:  session.userId
                })
            }
        }

        // Replace transaction items
        await databaseTransaction.delete(transactionItems).where(eq(transactionItems.transactionId, existingRequest.transactionId))
        if (newSnapshot.items.length > 0) {
            await databaseTransaction.insert(transactionItems).values(
                newSnapshot.items.map(item => ({
                    transactionId: existingRequest.transactionId,
                    itemId:        item.id,
                    qty:           item.qty,
                    price:         String(item.price),
                    isFree:        item.isFree
                }))
            )
        }

        // Replace transaction payments
        await databaseTransaction.delete(transactionPayments).where(eq(transactionPayments.transactionId, existingRequest.transactionId))
        if (newSnapshot.paymentMethods.length > 0) {
            await databaseTransaction.insert(transactionPayments).values(
                newSnapshot.paymentMethods.map(payment => ({
                    transactionId: existingRequest.transactionId,
                    method:        payment.method,
                    amount:        String(payment.amount)
                }))
            )
        }

        // Update transaction header
        await databaseTransaction
            .update(transactions)
            .set({
                subtotal:        String(newSnapshot.subtotal),
                kupon:           newSnapshot.kupon,
                additionalCosts: newSnapshot.additionalCosts,
                total:           String(newSnapshot.total),
                notes:           newSnapshot.notes
            })
            .where(eq(transactions.id, existingRequest.transactionId))

        const [approvedRequest] = await databaseTransaction
            .update(ptRequests)
            .set({ status: 'approved', reviewedBy: session.userId, reviewedAt: new Date() })
            .where(eq(ptRequests.id, requestId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'approve',
            entityType: 'pt_request',
            entityId:   requestId,
            newValue:   { status: 'approved' },
            requestId:  null
        })

        return approvedRequest
    })
}

export async function rejectPtRequest(requestId: string, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingRequest] = await databaseTransaction
            .select()
            .from(ptRequests)
            .where(and(eq(ptRequests.id, requestId), eq(ptRequests.status, 'pending')))

        if (!existingRequest) throw new Error('PT_REQUEST_NOT_FOUND_OR_NOT_PENDING')

        const [rejectedRequest] = await databaseTransaction
            .update(ptRequests)
            .set({ status: 'rejected', reviewedBy: session.userId, reviewedAt: new Date() })
            .where(eq(ptRequests.id, requestId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'reject',
            entityType: 'pt_request',
            entityId:   requestId,
            newValue:   { status: 'rejected' },
            requestId:  null
        })

        return rejectedRequest
    })
}
```

- [ ] **Step 4: Create `server/src/controllers/ptRequests.controller.ts`**

```typescript
import { status } from 'elysia'
import type { JwtSession } from '../types'
import {
    getPtRequests, getPtRequestById, createPtRequest, updatePtRequest, approvePtRequest, rejectPtRequest,
    type PtSnapshot
} from '../models/ptRequests.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function getPtRequestsHandler(context: {
    query:   { outletId?: string; status?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const page       = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit      = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))
    const validStatus = ['pending', 'approved', 'rejected']
    const ptStatus    = context.query.status && validStatus.includes(context.query.status)
        ? context.query.status as 'pending' | 'approved' | 'rejected'
        : undefined

    return getPtRequests({ outletId: context.query.outletId, status: ptStatus, page, limit })
}

export async function getPtRequestByIdHandler(context: {
    params:  { requestId: string }
    session: JwtSession
}) {
    const foundRequest = await getPtRequestById(context.params.requestId)
    if (!foundRequest) return status(404, { message: Errors.NOT_FOUND })
    return foundRequest
}

export async function createPtRequestHandler(context: {
    body: { transactionId: string; reason: string; newSnapshot: PtSnapshot }
    session: JwtSession
}) {
    try {
        const savedRequest = await createPtRequest(context.body, context.session)
        return status(201, { message: Messages.PT_SUBMITTED, id: savedRequest.id })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'TRANSACTION_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function updatePtRequestHandler(context: {
    params:  { requestId: string }
    body:    { reason: string; newSnapshot: PtSnapshot }
    session: JwtSession
}) {
    try {
        const updatedRequest = await updatePtRequest(context.params.requestId, context.body, context.session)
        return { message: Messages.PT_SUBMITTED, request: updatedRequest }
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'PT_REQUEST_NOT_FOUND_OR_NOT_PENDING') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function approvePtRequestHandler(context: {
    params:  { requestId: string }
    session: JwtSession
}) {
    if (context.session.role === 'cashier') return status(403, { message: Errors.FORBIDDEN })
    try {
        const approvedRequest = await approvePtRequest(context.params.requestId, context.session)
        return status(201, { message: Messages.PT_APPROVED, request: approvedRequest })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'PT_REQUEST_NOT_FOUND_OR_NOT_PENDING') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function rejectPtRequestHandler(context: {
    params:  { requestId: string }
    session: JwtSession
}) {
    if (context.session.role === 'cashier') return status(403, { message: Errors.FORBIDDEN })
    try {
        const rejectedRequest = await rejectPtRequest(context.params.requestId, context.session)
        return status(201, { message: Messages.PT_REJECTED, request: rejectedRequest })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'PT_REQUEST_NOT_FOUND_OR_NOT_PENDING') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}
```

- [ ] **Step 5: Mount routes in `server/src/routes/index.ts`**

Read file first. Add import:

```typescript
import {
    getPtRequestsHandler, getPtRequestByIdHandler, createPtRequestHandler,
    updatePtRequestHandler, approvePtRequestHandler, rejectPtRequestHandler
} from '../controllers/ptRequests.controller'
```

After `.post('/stock-movements', ...)`, append:

```typescript
    // ── PT Requests (Perbaikan Transaksi) ─────────────────────────────────
    .get('/pt-requests', getPtRequestsHandler, {
        query: t.Object({
            outletId: t.Optional(t.String()),
            status:   t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .post('/pt-requests', createPtRequestHandler, {
        body: t.Object({
            transactionId: t.String(),
            reason:        t.String({ minLength: 1 }),
            newSnapshot:   t.Object({
                items: t.Array(t.Object({
                    id:     t.String(),
                    qty:    t.Integer({ minimum: 1 }),
                    price:  t.Number(),
                    isFree: t.Boolean()
                })),
                subtotal:        t.Number(),
                kupon:           t.Nullable(t.Object({
                    kode:          t.String(),
                    nilaiPotongan: t.Number(),
                    cartMutations: t.Unknown(),
                    authNip:       t.Nullable(t.String())
                })),
                additionalCosts: t.Object({
                    packaging:    t.Number(),
                    transport:    t.Number(),
                    modification: t.Number()
                }),
                total:          t.Number(),
                notes:          t.String(),
                paymentMethods: t.Array(t.Object({
                    method: t.String(),
                    amount: t.Number()
                }))
            })
        })
    })
    .get('/pt-requests/:requestId', getPtRequestByIdHandler)
    .put('/pt-requests/:requestId', updatePtRequestHandler, {
        body: t.Object({
            reason:      t.String({ minLength: 1 }),
            newSnapshot: t.Object({
                items: t.Array(t.Object({
                    id:     t.String(),
                    qty:    t.Integer({ minimum: 1 }),
                    price:  t.Number(),
                    isFree: t.Boolean()
                })),
                subtotal:        t.Number(),
                kupon:           t.Nullable(t.Object({
                    kode:          t.String(),
                    nilaiPotongan: t.Number(),
                    cartMutations: t.Unknown(),
                    authNip:       t.Nullable(t.String())
                })),
                additionalCosts: t.Object({
                    packaging:    t.Number(),
                    transport:    t.Number(),
                    modification: t.Number()
                }),
                total:          t.Number(),
                notes:          t.String(),
                paymentMethods: t.Array(t.Object({
                    method: t.String(),
                    amount: t.Number()
                }))
            })
        })
    })
    .patch('/pt-requests/:requestId/approve', approvePtRequestHandler)
    .patch('/pt-requests/:requestId/reject',  rejectPtRequestHandler)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/ptRequests.test.ts 2>&1
```

Expected: 3 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/models/ptRequests.model.ts server/src/controllers/ptRequests.controller.ts server/src/routes/ptRequests.test.ts server/src/routes/index.ts && git commit -m "feat(api): add POST /pt-requests with transaction snapshot capture"
```

---

### Task 2: GET /api/pt-requests list and detail

**Files:**
- Modify: `server/src/routes/ptRequests.test.ts` — append two describe blocks

- [ ] **Step 1: Append list and detail tests**

```typescript
describe('GET /api/pt-requests', () => {
    it('returns 200 with paginated data shape', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests?outletId=${testOutletId}`, { headers: cashierHeaders })
        )
        const responseData = await response.json() as { data: unknown[]; meta: { page: number; total: number } }
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData.data)).toBe(true)
        expect(typeof responseData.meta.page).toBe('number')
        expect(typeof responseData.meta.total).toBe('number')
    })

    it('includes the created PT request when filtered by status=pending', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests?outletId=${testOutletId}&status=pending`, { headers: cashierHeaders })
        )
        const responseData = await response.json() as { data: Array<{ id: string; status: string }> }
        expect(response.status).toBe(200)
        const found = responseData.data.find(req => req.id === createdPtId)
        expect(found).toBeDefined()
        expect(found?.status).toBe('pending')
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/pt-requests', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('GET /api/pt-requests/:requestId', () => {
    it('returns 200 with PT request detail', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests/${createdPtId}`, { headers: cashierHeaders })
        )
        const responseData = await response.json() as { id: string; status: string; reason: string }
        expect(response.status).toBe(200)
        expect(responseData.id).toBe(createdPtId)
        expect(responseData.status).toBe('pending')
        expect(responseData.reason).toBe('Item qty was entered wrong')
    })

    it('returns 404 for unknown request id', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/pt-requests/nonexistent-id', { headers: cashierHeaders })
        )
        expect(response.status).toBe(404)
    })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/ptRequests.test.ts 2>&1
```

Expected: 8 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/routes/ptRequests.test.ts && git commit -m "feat(api): add GET /pt-requests list and detail tests"
```

---

### Task 3: PUT /api/pt-requests/:requestId — update

**Files:**
- Modify: `server/src/routes/ptRequests.test.ts` — append one describe block

- [ ] **Step 1: Append update tests**

```typescript
describe('PUT /api/pt-requests/:requestId', () => {
    it('returns 200 and updates reason and newSnapshot', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests/${createdPtId}`, {
                method: 'PUT', headers: cashierHeaders,
                body: JSON.stringify({
                    reason: 'Updated reason',
                    newSnapshot: {
                        items: [{ id: testItemId, qty: 2, price: 20000, isFree: false }],
                        subtotal: 40000, kupon: null,
                        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                        total: 40000, notes: 'Updated snapshot',
                        paymentMethods: [{ method: 'Tunai', amount: 40000 }]
                    }
                })
            })
        )
        const responseData = await response.json() as { message: string; request: { id: string; reason: string } }
        expect(response.status).toBe(200)
        expect(responseData.message).toBe('Permintaan perbaikan berhasil dikirim.')
        expect(responseData.request.id).toBe(createdPtId)
        expect(responseData.request.reason).toBe('Updated reason')
    })

    it('returns 404 for a nonexistent or non-pending request id', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/pt-requests/nonexistent-id', {
                method: 'PUT', headers: cashierHeaders,
                body: JSON.stringify({
                    reason: 'x',
                    newSnapshot: {
                        items: [], subtotal: 0, kupon: null,
                        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                        total: 0, notes: '', paymentMethods: []
                    }
                })
            })
        )
        expect(response.status).toBe(404)
    })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/ptRequests.test.ts 2>&1
```

Expected: 10 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/routes/ptRequests.test.ts && git commit -m "feat(api): add PUT /pt-requests/:requestId update tests"
```

---

### Task 4: PATCH approve + reject + full suite

**Files:**
- Modify: `server/src/routes/ptRequests.test.ts` — append two describe blocks

- [ ] **Step 1: Append approve and reject tests**

```typescript
describe('PATCH /api/pt-requests/:requestId/approve', () => {
    it('returns 201, approves the PT request, and adjusts stock', async () => {
        // Create a fresh PT request for the approve test
        // Original transaction had qty 5 (stock went 60→55). newSnapshot has qty 3 → stock returns +2 → 57
        const createResponse = await app.handle(
            new Request('http://localhost/api/pt-requests', {
                method: 'POST', headers: cashierHeaders,
                body: JSON.stringify({
                    transactionId: testTransactionId,
                    reason: 'Approve test',
                    newSnapshot: {
                        items: [{ id: testItemId, qty: 3, price: 20000, isFree: false }],
                        subtotal: 60000, kupon: null,
                        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                        total: 60000, notes: 'PT test transaction',
                        paymentMethods: [{ method: 'Tunai', amount: 60000 }]
                    }
                })
            })
        )
        const createData = await createResponse.json() as { id: string }
        expect(createResponse.status).toBe(201)
        approvePtId = createData.id

        const approveResponse = await app.handle(
            new Request(`http://localhost/api/pt-requests/${approvePtId}/approve`, {
                method: 'PATCH', headers: managerHeaders
            })
        )
        const approveData = await approveResponse.json() as { message: string; request: { status: string } }
        expect(approveResponse.status).toBe(201)
        expect(approveData.message).toBe('Perbaikan transaksi disetujui.')
        expect(approveData.request.status).toBe('approved')
    })

    it('stock returns +2 after approval (55 + 2 = 57)', async () => {
        const [stockRow] = await db.select().from(outletStock).where(eq(outletStock.id, testStockRowId))
        expect(stockRow.stock).toBe(57)
    })

    it('returns 403 when a cashier tries to approve', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests/${createdPtId}/approve`, {
                method: 'PATCH', headers: cashierHeaders
            })
        )
        expect(response.status).toBe(403)
    })

    it('returns 404 for a nonexistent or already-reviewed request', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests/${approvePtId}/approve`, {
                method: 'PATCH', headers: managerHeaders
            })
        )
        expect(response.status).toBe(404)
    })
})

describe('PATCH /api/pt-requests/:requestId/reject', () => {
    it('returns 201 and rejects the PT request', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests/${createdPtId}/reject`, {
                method: 'PATCH', headers: managerHeaders
            })
        )
        const responseData = await response.json() as { message: string; request: { status: string } }
        expect(response.status).toBe(201)
        expect(responseData.message).toBe('Perbaikan transaksi ditolak.')
        expect(responseData.request.status).toBe('rejected')
    })

    it('stock is unchanged after rejection (still 57)', async () => {
        const [stockRow] = await db.select().from(outletStock).where(eq(outletStock.id, testStockRowId))
        expect(stockRow.stock).toBe(57)
    })

    it('returns 403 when a cashier tries to reject', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests/any-id/reject`, {
                method: 'PATCH', headers: cashierHeaders
            })
        )
        expect(response.status).toBe(403)
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/pt-requests/any-id/reject`, {
                method: 'PATCH', headers: BASE_HEADERS
            })
        )
        expect(response.status).toBe(401)
    })
})
```

- [ ] **Step 2: Run PT requests tests**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/ptRequests.test.ts 2>&1
```

Expected: 18 pass, 0 fail.

- [ ] **Step 3: Run full test suite**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test 2>&1
```

Expected: approximately 91 pass (73 existing + 18 PT requests), 0 fail.

- [ ] **Step 4: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/routes/ptRequests.test.ts && git commit -m "feat(api): add PATCH approve/reject tests; complete Group 7 PT requests endpoints"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `GET /api/pt-requests` paginated, filtered by outletId + status | Task 1 (route) + Task 2 (tests) |
| `GET /api/pt-requests/:requestId` detail | Task 1 (route) + Task 2 (tests) |
| `POST /api/pt-requests` captures oldSnapshot from current transaction | Task 1 model — reads txItems + txPayments |
| `POST` returns 404 if transactionId not found | Task 1 — `TRANSACTION_NOT_FOUND` check |
| `PUT /api/pt-requests/:requestId` updates reason + newSnapshot | Task 1 (route) + Task 3 (tests) |
| `PUT` returns 404 for non-pending requests | Task 3 — `PT_REQUEST_NOT_FOUND_OR_NOT_PENDING` |
| `PATCH /approve` computes per-item stock delta (oldQty - newQty) | Task 1 model — `allItemIds` loop |
| `PATCH /approve` replaces transactionItems and transactionPayments | Task 1 model — delete + reinsert |
| `PATCH /approve` updates transaction header | Task 1 model — updates subtotal/total/notes/kupon |
| `PATCH /approve` inserts stockMovements with `sourceType: 'pt_approval'` | Task 1 model |
| `PATCH /approve` returns 403 for cashiers | Task 1 controller — role check |
| `PATCH /reject` no stock changes | Task 4 test verifies stock unchanged |
| `PATCH /reject` returns 403 for cashiers | Task 1 controller — role check |
| auditLog on create, update, approve, reject | Task 1 model — all 4 functions insert auditLog |
| Full suite passes 0 failures | Task 4 Step 3 |

**Placeholder scan:** No TBDs. All code blocks complete.

**Type consistency:**
- `PtSnapshot` defined once in model, imported by controller ✓
- `approvePtRequest(requestId, session)` — controller passes `context.params.requestId`, `context.session` ✓
- `PT_REQUEST_NOT_FOUND_OR_NOT_PENDING` thrown in model, caught in controller (updatePtRequest, approvePtRequest, rejectPtRequest) ✓
- `Messages.PT_SUBMITTED` = `'Permintaan perbaikan berhasil dikirim.'` matches test assertion ✓
- `Messages.PT_APPROVED` = `'Perbaikan transaksi disetujui.'` matches test assertion ✓
- `Messages.PT_REJECTED` = `'Perbaikan transaksi ditolak.'` matches test assertion ✓
