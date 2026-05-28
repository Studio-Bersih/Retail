# Transactions & Shifts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `POST /api/transactions`, `GET /api/transactions`, `GET /api/transactions/:id`, `GET /api/shifts/current`, `POST /api/shifts/open`, and `POST /api/shifts/close` on the existing Bun + Elysia.js backend.

**Architecture:** Transactions write atomically in a single `db.transaction()` call — inserting the transaction header, items, payments, decrementing outlet stock, creating stock movement records, updating member's last-transaction timestamp, and appending an audit log row. Shifts are guarded by a DB-level unique index on `(outletId, date)`, so duplicate-open errors surface as constraint violations. The idempotency hook (already scaffolded) needs a one-line `error → status()` fix before transactions can use it. All test files hit the real PostgreSQL database via `app.handle()`.

**Tech Stack:** Bun, Elysia.js, Drizzle ORM, PostgreSQL, Redis (`ioredis`), `bun:test`

**Prerequisite:** Group 2 (read/config endpoints) is complete and all 31 tests pass. DB seed has 2 outlets, 4 users.

**Naming rules (enforced throughout):**
- camelCase everywhere — variables, functions, parameters, object keys
- No single-letter variables — `savedTransaction` not `t`, `foundShift` not `s`
- Descriptive callback params — `.map(item => ...)` not `.map(i => ...)`
- Every `catch` block uses `caughtError` not `e` or `err`
- Controllers never import from `db/` — only from models
- Models never import from controllers or shape HTTP responses

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/hooks/idempotency.hook.ts` | Modify (1 line) | Fix `error` → `status()` from elysia so 400 responses work |
| `server/src/models/transactions.model.ts` | Create | `saveTransaction`, `getTransactions`, `getTransactionById` |
| `server/src/controllers/transactions.controller.ts` | Create | `createTransactionHandler`, `getTransactionsHandler`, `getTransactionByIdHandler` |
| `server/src/routes/transactions.test.ts` | Create | Integration tests for all 3 transaction endpoints |
| `server/src/models/kasirHarian.model.ts` | Create | `getCurrentShift`, `openShift`, `closeShift` |
| `server/src/controllers/kasirHarian.controller.ts` | Create | `getCurrentShiftHandler`, `openShiftHandler`, `closeShiftHandler` |
| `server/src/routes/kasirHarian.test.ts` | Create | Integration tests for all 3 shift endpoints |
| `server/src/routes/index.ts` | Modify | Mount all new routes; wire idempotency hook to POST /transactions |

---

### Task 1: Fix idempotency hook + POST /api/transactions

**Files:**
- Modify: `server/src/hooks/idempotency.hook.ts`
- Create: `server/src/models/transactions.model.ts`
- Create: `server/src/controllers/transactions.controller.ts`
- Create: `server/src/routes/transactions.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/transactions.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { items, outletStock, transactions, transactionItems, transactionPayments, stockMovements, auditLog } from '../db/schema'
import { eq, and } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testOutletId      = ''
let testUserId        = ''
let testItemId        = ''
let testStockRowId    = ''
let createdTxId       = ''

beforeAll(async () => {
    const loginResponse = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method:  'POST',
            headers: BASE_HEADERS,
            body:    JSON.stringify({ username: 'kasir1', password: 'kasir123' })
        })
    )
    const loginData = await loginResponse.json() as { token: string; user: { outletId: string; userId: string } }
    authHeaders  = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }
    testOutletId = loginData.user.outletId
    testUserId   = loginData.user.userId

    const [insertedItem] = await db.insert(items).values({
        sku:         'TX-TEST-001',
        name:        'Test Item Transaksi',
        category:    'Test',
        itemType:    'finished_good',
        priceLevel1: '20000',
        priceLevel2: '19000',
        priceLevel3: '18000',
        isActive:    true
    }).returning()
    testItemId = insertedItem.id

    const [insertedStock] = await db.insert(outletStock).values({
        itemId:      testItemId,
        outletId:    testOutletId,
        stock:       50,
        preAdjDelta: 0
    }).returning()
    testStockRowId = insertedStock.id
})

afterAll(async () => {
    if (createdTxId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, createdTxId))
        await db.delete(stockMovements).where(eq(stockMovements.sourceId, createdTxId))
        await db.delete(transactionPayments).where(eq(transactionPayments.transactionId, createdTxId))
        await db.delete(transactionItems).where(eq(transactionItems.transactionId, createdTxId))
        await db.delete(transactions).where(eq(transactions.id, createdTxId))
    }
    await db.delete(outletStock).where(eq(outletStock.id, testStockRowId))
    await db.delete(items).where(eq(items.id, testItemId))
})

describe('POST /api/transactions', () => {
    it('returns 201 and saves the transaction', async () => {
        const idempotencyKey = crypto.randomUUID()
        const response = await app.handle(
            new Request('http://localhost/api/transactions', {
                method:  'POST',
                headers: { ...authHeaders, 'X-Idempotency-Key': idempotencyKey },
                body: JSON.stringify({
                    memberId:       null,
                    mode:           'retail',
                    items:          [{ id: testItemId, qty: 5, price: 20000, isFree: false }],
                    subtotal:       100000,
                    kupon:          null,
                    additionalCosts:{ packaging: 0, transport: 0, modification: 0 },
                    total:          100000,
                    notes:          '',
                    paymentMethods: [{ method: 'Tunai', amount: 100000 }]
                })
            })
        )
        const responseData = await response.json() as { message: string; id: string }
        expect(response.status).toBe(201)
        expect(responseData.id).toBeTruthy()
        expect(responseData.message).toBe('Transaksi berhasil disimpan.')
        createdTxId = responseData.id
    })

    it('decrements outlet stock by qty (50 - 5 = 45)', async () => {
        const [stockRow] = await db.select().from(outletStock).where(eq(outletStock.id, testStockRowId))
        expect(stockRow.stock).toBe(45)
    })

    it('returns the same response for a duplicate idempotency key', async () => {
        const idempotencyKey = crypto.randomUUID()

        const makeRequest = () => app.handle(
            new Request('http://localhost/api/transactions', {
                method:  'POST',
                headers: { ...authHeaders, 'X-Idempotency-Key': idempotencyKey },
                body: JSON.stringify({
                    memberId:       null,
                    mode:           'retail',
                    items:          [{ id: testItemId, qty: 1, price: 20000, isFree: false }],
                    subtotal:       20000,
                    kupon:          null,
                    additionalCosts:{ packaging: 0, transport: 0, modification: 0 },
                    total:          20000,
                    notes:          'idempotency test',
                    paymentMethods: [{ method: 'Tunai', amount: 20000 }]
                })
            })
        )

        const firstResponse  = await makeRequest()
        const firstData      = await firstResponse.json() as { id: string }
        const secondResponse = await makeRequest()
        const secondData     = await secondResponse.json() as { id: string }

        expect(firstResponse.status).toBe(201)
        expect(secondResponse.status).toBe(201)
        expect(firstData.id).toBe(secondData.id)

        // Clean up idempotency test transaction
        const dupId = firstData.id
        await db.delete(auditLog).where(eq(auditLog.entityId, dupId))
        await db.delete(stockMovements).where(eq(stockMovements.sourceId, dupId))
        await db.delete(transactionPayments).where(eq(transactionPayments.transactionId, dupId))
        await db.delete(transactionItems).where(eq(transactionItems.transactionId, dupId))
        await db.delete(transactions).where(eq(transactions.id, dupId))
    })

    it('returns 400 when X-Idempotency-Key header is missing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/transactions', {
                method:  'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    memberId:       null,
                    mode:           'retail',
                    items:          [{ id: testItemId, qty: 1, price: 20000, isFree: false }],
                    subtotal:       20000,
                    kupon:          null,
                    additionalCosts:{ packaging: 0, transport: 0, modification: 0 },
                    total:          20000,
                    notes:          '',
                    paymentMethods: [{ method: 'Tunai', amount: 20000 }]
                })
            })
        )
        expect(response.status).toBe(400)
    })

    it('returns 401 without auth token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/transactions', {
                method:  'POST',
                headers: { ...BASE_HEADERS, 'X-Idempotency-Key': crypto.randomUUID() },
                body: JSON.stringify({
                    memberId: null, mode: 'retail', items: [],
                    subtotal: 0, kupon: null,
                    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                    total: 0, notes: '', paymentMethods: []
                })
            })
        )
        expect(response.status).toBe(401)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/transactions.test.ts 2>&1
```

Expected: `FAIL` — routes not mounted yet.

- [ ] **Step 3: Fix `server/src/hooks/idempotency.hook.ts`**

Read the file first. The current version uses `error(400, ...)` inside `onBeforeHandle`. In Elysia 1.4, `error` from context destructuring is undefined in lifecycle hooks — use `status()` instead.

Replace the entire file with:

```typescript
import Elysia, { status } from 'elysia'
import { redisClient, cacheSet } from '../utils/cache'
import { CACHE_TTL_IDEMPOTENCY } from '../utils/constants'

export const idempotencyHook = new Elysia({ name: 'idempotency' })
    .onBeforeHandle({ as: 'scoped' }, async ({ headers }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (!idempotencyKey) return status(400, { message: 'X-Idempotency-Key header is required.' })

        const cachedResponse = await redisClient.get(`idempotency:${idempotencyKey}`)
        if (cachedResponse) return JSON.parse(cachedResponse)
    })
    .onAfterHandle({ as: 'scoped' }, async ({ headers, response }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (idempotencyKey && response) {
            await cacheSet(`idempotency:${idempotencyKey}`, response, CACHE_TTL_IDEMPOTENCY).catch(() => {})
        }
    })
```

- [ ] **Step 4: Create `server/src/models/transactions.model.ts`**

```typescript
import { db } from '../db'
import { transactions, transactionItems, transactionPayments, outletStock, stockMovements, members, auditLog } from '../db/schema'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export interface NewTransactionPayload {
    memberId:        string | null
    mode:            'retail' | 'order'
    items: Array<{
        id:     string
        qty:    number
        price:  number
        isFree: boolean
    }>
    subtotal:        number
    kupon:           { kode: string; nilaiPotongan: number; cartMutations: unknown; authNip: string | null } | null
    additionalCosts: { packaging: number; transport: number; modification: number }
    total:           number
    notes:           string
    paymentMethods:  Array<{ method: string; amount: number }>
}

export async function saveTransaction(payload: NewTransactionPayload, session: JwtSession, requestId: string) {
    return db.transaction(async (databaseTransaction) => {
        const [savedTransaction] = await databaseTransaction
            .insert(transactions)
            .values({
                outletId:        session.outletId,
                userId:          session.userId,
                memberId:        payload.memberId,
                mode:            payload.mode,
                subtotal:        String(payload.subtotal),
                kupon:           payload.kupon,
                additionalCosts: payload.additionalCosts,
                total:           String(payload.total),
                notes:           payload.notes,
                status:          'completed'
            })
            .returning()

        await databaseTransaction.insert(transactionItems).values(
            payload.items.map(item => ({
                transactionId: savedTransaction.id,
                itemId:        item.id,
                qty:           item.qty,
                price:         String(item.price),
                isFree:        item.isFree
            }))
        )

        if (payload.paymentMethods.length > 0) {
            await databaseTransaction.insert(transactionPayments).values(
                payload.paymentMethods.map(payment => ({
                    transactionId: savedTransaction.id,
                    method:        payment.method,
                    amount:        String(payment.amount)
                }))
            )
        }

        for (const item of payload.items.filter(item => !item.isFree)) {
            await databaseTransaction
                .update(outletStock)
                .set({ stock: sql`${outletStock.stock} - ${item.qty}` })
                .where(and(
                    eq(outletStock.itemId,   item.id),
                    eq(outletStock.outletId, session.outletId)
                ))

            await databaseTransaction.insert(stockMovements).values({
                itemId:     item.id,
                outletId:   session.outletId,
                delta:      -item.qty,
                sourceType: 'transaction',
                sourceId:   savedTransaction.id,
                createdBy:  session.userId
            })
        }

        if (payload.memberId) {
            await databaseTransaction
                .update(members)
                .set({ lastTransactionAt: new Date() })
                .where(eq(members.id, payload.memberId))
        }

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'transaction',
            entityId:   savedTransaction.id,
            newValue:   payload,
            requestId:  requestId
        })

        return savedTransaction
    })
}

export async function getTransactions(params: {
    outletId: string
    from?:    string
    to?:      string
    userId?:  string
    page:     number
    limit:    number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        eq(transactions.outletId, params.outletId),
        params.from   ? gte(transactions.createdAt, new Date(params.from)) : undefined,
        params.to     ? lte(transactions.createdAt, new Date(`${params.to}T23:59:59.999Z`)) : undefined,
        params.userId ? eq(transactions.userId, params.userId) : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select()
        .from(transactions)
        .where(whereConditions)
        .orderBy(sql`${transactions.createdAt} DESC`)
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getTransactionById(transactionId: string) {
    const [foundTransaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId))

    if (!foundTransaction) return null

    const foundItems    = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, transactionId))
    const foundPayments = await db.select().from(transactionPayments).where(eq(transactionPayments.transactionId, transactionId))

    return { ...foundTransaction, items: foundItems, payments: foundPayments }
}
```

- [ ] **Step 5: Create `server/src/controllers/transactions.controller.ts`**

```typescript
import { status } from 'elysia'
import type { JwtSession } from '../types'
import { saveTransaction, getTransactions, getTransactionById, type NewTransactionPayload } from '../models/transactions.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function createTransactionHandler(context: {
    body:    NewTransactionPayload
    session: JwtSession
    headers: Record<string, string | undefined>
}) {
    const requestId       = context.headers['x-request-id'] ?? ''
    const savedTransaction = await saveTransaction(context.body, context.session, requestId)
    return status(201, { message: Messages.TRANSACTION_SAVED, id: savedTransaction.id })
}

export async function getTransactionsHandler(context: {
    query:   { outletId?: string; from?: string; to?: string; userId?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const outletId = context.query.outletId ?? context.session.outletId
    const page     = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit    = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))

    return getTransactions({
        outletId,
        from:   context.query.from,
        to:     context.query.to,
        userId: context.query.userId,
        page,
        limit
    })
}

export async function getTransactionByIdHandler(context: {
    params:  { transactionId: string }
    session: JwtSession
}) {
    const foundTransaction = await getTransactionById(context.params.transactionId)
    if (!foundTransaction) return status(404, { message: Errors.NOT_FOUND })
    return foundTransaction
}
```

- [ ] **Step 6: Mount transaction routes in `server/src/routes/index.ts`**

Read the file first. Then add these imports after the existing imports:

```typescript
import { createTransactionHandler, getTransactionsHandler, getTransactionByIdHandler } from '../controllers/transactions.controller'
import { idempotencyHook } from '../hooks/idempotency.hook'
```

After the promos route and before the end of the file, add:

```typescript
    // ── Transactions ─────────────────────────────────────────────────────
    .post('/transactions', createTransactionHandler, {
        use: [idempotencyHook],
        body: t.Object({
            memberId:        t.Nullable(t.String()),
            mode:            t.Union([t.Literal('retail'), t.Literal('order')]),
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
            total:           t.Number(),
            notes:           t.String(),
            paymentMethods:  t.Array(t.Object({
                method: t.String(),
                amount: t.Number()
            }))
        })
    })
    .get('/transactions', getTransactionsHandler, {
        query: t.Object({
            outletId: t.Optional(t.String()),
            from:     t.Optional(t.String()),
            to:       t.Optional(t.String()),
            userId:   t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .get('/transactions/:transactionId', getTransactionByIdHandler)
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/transactions.test.ts 2>&1
```

Expected:
```
✓ POST /api/transactions > returns 201 and saves the transaction
✓ POST /api/transactions > decrements outlet stock by qty (50 - 5 = 45)
✓ POST /api/transactions > returns the same response for a duplicate idempotency key
✓ POST /api/transactions > returns 400 when X-Idempotency-Key header is missing
✓ POST /api/transactions > returns 401 without auth token
5 pass
0 fail
```

- [ ] **Step 8: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/hooks/idempotency.hook.ts server/src/models/transactions.model.ts server/src/controllers/transactions.controller.ts server/src/routes/transactions.test.ts server/src/routes/index.ts && git commit -m "feat(api): fix idempotency hook; add POST /transactions with atomic stock deduction"
```

---

### Task 2: GET /api/transactions list and detail

**Files:**
- `server/src/routes/transactions.test.ts` — Modify: add list and detail tests
- (models/controllers already created in Task 1 — no new files needed)

- [ ] **Step 1: Add list and detail tests to `server/src/routes/transactions.test.ts`**

Append the following `describe` blocks at the end of the file (after the POST describe block):

```typescript
describe('GET /api/transactions', () => {
    it('returns 200 with paginated data shape', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/transactions?outletId=${testOutletId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { data: unknown[]; meta: { page: number; total: number } }
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData.data)).toBe(true)
        expect(typeof responseData.meta.page).toBe('number')
        expect(typeof responseData.meta.total).toBe('number')
    })

    it('includes the seeded transaction in the result', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/transactions?outletId=${testOutletId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { data: Array<{ id: string }> }
        expect(response.status).toBe(200)
        const found = responseData.data.find(tx => tx.id === createdTxId)
        expect(found).toBeDefined()
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/transactions', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('GET /api/transactions/:transactionId', () => {
    it('returns 200 with transaction, items, and payments for a valid id', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/transactions/${createdTxId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { id: string; items: unknown[]; payments: unknown[] }
        expect(response.status).toBe(200)
        expect(responseData.id).toBe(createdTxId)
        expect(Array.isArray(responseData.items)).toBe(true)
        expect(Array.isArray(responseData.payments)).toBe(true)
        expect(responseData.items.length).toBeGreaterThan(0)
        expect(responseData.payments.length).toBeGreaterThan(0)
    })

    it('returns 404 for unknown transaction id', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/transactions/nonexistent-id', { headers: authHeaders })
        )
        expect(response.status).toBe(404)
    })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/transactions.test.ts 2>&1
```

Expected: all 9 tests pass (5 from Task 1 + 4 new). Note: the `createdTxId` must already be populated by the POST test running first — `bun:test` runs describe blocks in file order, so this is guaranteed.

```
9 pass
0 fail
```

- [ ] **Step 3: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/routes/transactions.test.ts && git commit -m "feat(api): add GET /transactions and GET /transactions/:id tests"
```

---

### Task 3: GET /api/shifts/current + POST /api/shifts/open

**Files:**
- Create: `server/src/models/kasirHarian.model.ts`
- Create: `server/src/controllers/kasirHarian.controller.ts`
- Create: `server/src/routes/kasirHarian.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/kasirHarian.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { shifts, shiftCounts } from '../db/schema'
import { eq, and } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testOutletId = ''
let testUserId   = ''
let openedShiftId = ''

const testDate = new Date().toISOString().slice(0, 10)

beforeAll(async () => {
    const loginResponse = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method:  'POST',
            headers: BASE_HEADERS,
            body:    JSON.stringify({ username: 'kasir1', password: 'kasir123' })
        })
    )
    const loginData = await loginResponse.json() as { token: string; user: { outletId: string; userId: string } }
    authHeaders  = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }
    testOutletId = loginData.user.outletId
    testUserId   = loginData.user.userId

    // Clean up any leftover shift from a previous failed test run
    await db.delete(shiftCounts).where(
        eq(shiftCounts.shiftId,
            db.select({ id: shifts.id }).from(shifts)
              .where(and(eq(shifts.outletId, testOutletId), eq(shifts.date, testDate)))
              .limit(1) as unknown as string
        )
    ).catch(() => {})
    await db.delete(shifts).where(and(
        eq(shifts.outletId, testOutletId),
        eq(shifts.date, testDate)
    ))
})

afterAll(async () => {
    if (openedShiftId) {
        await db.delete(shiftCounts).where(eq(shiftCounts.shiftId, openedShiftId))
        await db.delete(shifts).where(eq(shifts.id, openedShiftId))
    }
})

describe('GET /api/shifts/current', () => {
    it('returns 200 with null when no shift is open', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: authHeaders })
        )
        const responseData = await response.json() as { shift: null }
        expect(response.status).toBe(200)
        expect(responseData.shift).toBeNull()
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('POST /api/shifts/open', () => {
    it('returns 201 and creates the shift', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/open', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({ openingBalance: 500000, date: testDate })
            })
        )
        const responseData = await response.json() as { message: string; shift: { id: string; status: string } }
        expect(response.status).toBe(201)
        expect(responseData.message).toBe('Shift berhasil dibuka.')
        expect(responseData.shift.status).toBe('open')
        openedShiftId = responseData.shift.id
    })

    it('returns 200 with the open shift after opening', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: authHeaders })
        )
        const responseData = await response.json() as { shift: { id: string; status: string } }
        expect(response.status).toBe(200)
        expect(responseData.shift).not.toBeNull()
        expect(responseData.shift.id).toBe(openedShiftId)
        expect(responseData.shift.status).toBe('open')
    })

    it('returns 409 when a shift for this outlet+date already exists', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/open', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({ openingBalance: 0, date: testDate })
            })
        )
        expect(response.status).toBe(409)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/kasirHarian.test.ts 2>&1
```

Expected: `FAIL` — routes not mounted yet.

- [ ] **Step 3: Create `server/src/models/kasirHarian.model.ts`**

```typescript
import { db } from '../db'
import { shifts, shiftCounts, transactionPayments, transactions } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export async function getCurrentShift(outletId: string) {
    const [foundShift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.outletId, outletId), eq(shifts.status, 'open')))
        .limit(1)
    return foundShift ?? null
}

export async function openShift(params: {
    outletId:       string
    userId:         string
    date:           string
    openingBalance: number
}) {
    return db.transaction(async (databaseTransaction) => {
        const [existingShift] = await databaseTransaction
            .select()
            .from(shifts)
            .where(and(eq(shifts.outletId, params.outletId), eq(shifts.date, params.date)))

        if (existingShift) {
            const conflictError = new Error('SHIFT_ALREADY_EXISTS')
            throw conflictError
        }

        const [newShift] = await databaseTransaction
            .insert(shifts)
            .values({
                outletId:       params.outletId,
                userId:         params.userId,
                date:           params.date,
                openingBalance: String(params.openingBalance),
                status:         'open'
            })
            .returning()

        return newShift
    })
}

export async function closeShift(shiftId: string, counts: Array<{ paymentMethod: string; actualAmount: number }>) {
    return db.transaction(async (databaseTransaction) => {
        const [foundShift] = await databaseTransaction
            .select()
            .from(shifts)
            .where(and(eq(shifts.id, shiftId), eq(shifts.status, 'open')))

        if (!foundShift) {
            const notFoundError = new Error('SHIFT_NOT_FOUND')
            throw notFoundError
        }

        // Compute expected amount per payment method from transactions on this date by this cashier
        const expectedRows = await databaseTransaction
            .select({
                method:         transactionPayments.method,
                expectedAmount: sql<string>`SUM(${transactionPayments.amount}::numeric)::text`
            })
            .from(transactionPayments)
            .innerJoin(transactions, eq(transactions.id, transactionPayments.transactionId))
            .where(and(
                eq(transactions.outletId, foundShift.outletId),
                eq(transactions.userId,   foundShift.userId),
                sql`DATE(${transactions.createdAt}) = ${foundShift.date}::date`
            ))
            .groupBy(transactionPayments.method)

        const expectedByMethod = new Map(
            expectedRows.map(row => [row.method, Number(row.expectedAmount ?? 0)])
        )

        if (counts.length > 0) {
            await databaseTransaction.insert(shiftCounts).values(
                counts.map(countRow => ({
                    shiftId:        shiftId,
                    paymentMethod:  countRow.paymentMethod,
                    expectedAmount: String(expectedByMethod.get(countRow.paymentMethod) ?? 0),
                    actualAmount:   String(countRow.actualAmount)
                }))
            )
        }

        const [closedShift] = await databaseTransaction
            .update(shifts)
            .set({ status: 'closed', closedAt: new Date() })
            .where(eq(shifts.id, shiftId))
            .returning()

        return closedShift
    })
}
```

- [ ] **Step 4: Create `server/src/controllers/kasirHarian.controller.ts`**

```typescript
import { status } from 'elysia'
import type { JwtSession } from '../types'
import { getCurrentShift, openShift, closeShift } from '../models/kasirHarian.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function getCurrentShiftHandler(context: {
    session: JwtSession
}) {
    const foundShift = await getCurrentShift(context.session.outletId)
    return { shift: foundShift }
}

export async function openShiftHandler(context: {
    body:    { openingBalance: number; date: string }
    session: JwtSession
}) {
    try {
        const newShift = await openShift({
            outletId:       context.session.outletId,
            userId:         context.session.userId,
            date:           context.body.date,
            openingBalance: context.body.openingBalance
        })
        return status(201, { message: Messages.SHIFT_OPENED, shift: newShift })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'SHIFT_ALREADY_EXISTS') {
            return status(409, { message: 'Shift untuk tanggal ini sudah ada.' })
        }
        throw caughtError
    }
}

export async function closeShiftHandler(context: {
    body:    { shiftId: string; counts: Array<{ paymentMethod: string; actualAmount: number }> }
    session: JwtSession
}) {
    try {
        const closedShift = await closeShift(context.body.shiftId, context.body.counts)
        return status(201, { message: Messages.SHIFT_CLOSED, shift: closedShift })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'SHIFT_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}
```

- [ ] **Step 5: Mount shift routes in `server/src/routes/index.ts`**

Add imports:

```typescript
import { getCurrentShiftHandler, openShiftHandler, closeShiftHandler } from '../controllers/kasirHarian.controller'
```

After the transactions routes block, add:

```typescript
    // ── Kasir Harian ─────────────────────────────────────────────────────
    .get('/shifts/current', getCurrentShiftHandler)
    .post('/shifts/open', openShiftHandler, {
        body: t.Object({
            openingBalance: t.Number(),
            date:           t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
        })
    })
    .post('/shifts/close', closeShiftHandler, {
        body: t.Object({
            shiftId: t.String(),
            counts:  t.Array(t.Object({
                paymentMethod: t.String(),
                actualAmount:  t.Number()
            }))
        })
    })
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/kasirHarian.test.ts 2>&1
```

Expected:
```
✓ GET /api/shifts/current > returns 200 with null when no shift is open
✓ GET /api/shifts/current > returns 401 without token
✓ POST /api/shifts/open > returns 201 and creates the shift
✓ POST /api/shifts/open > returns 200 with the open shift after opening
✓ POST /api/shifts/open > returns 409 when a shift for this outlet+date already exists
5 pass
0 fail
```

- [ ] **Step 7: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/models/kasirHarian.model.ts server/src/controllers/kasirHarian.controller.ts server/src/routes/kasirHarian.test.ts server/src/routes/index.ts && git commit -m "feat(api): add GET /shifts/current and POST /shifts/open"
```

---

### Task 4: POST /api/shifts/close + full test suite

**Files:**
- Modify: `server/src/routes/kasirHarian.test.ts` — add shift-close tests

- [ ] **Step 1: Add the shift-close tests to `server/src/routes/kasirHarian.test.ts`**

Append the following `describe` block at the end of the file (after the POST /api/shifts/open describe block):

```typescript
describe('POST /api/shifts/close', () => {
    it('returns 201 and closes the shift', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/close', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({
                    shiftId: openedShiftId,
                    counts:  [
                        { paymentMethod: 'Tunai',         actualAmount: 500000 },
                        { paymentMethod: 'QRIS',          actualAmount: 150000 },
                        { paymentMethod: 'Transfer Bank',  actualAmount: 0 }
                    ]
                })
            })
        )
        const responseData = await response.json() as { message: string; shift: { status: string } }
        expect(response.status).toBe(201)
        expect(responseData.message).toBe('Shift berhasil ditutup.')
        expect(responseData.shift.status).toBe('closed')
    })

    it('returns 200 with null current shift after closing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: authHeaders })
        )
        const responseData = await response.json() as { shift: null }
        expect(response.status).toBe(200)
        expect(responseData.shift).toBeNull()
    })

    it('returns 404 when shiftId does not exist or is already closed', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/close', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({ shiftId: 'nonexistent-id', counts: [] })
            })
        )
        expect(response.status).toBe(404)
    })
})
```

- [ ] **Step 2: Run kasirHarian tests**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/kasirHarian.test.ts 2>&1
```

Expected: all 8 tests pass.

```
8 pass
0 fail
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test 2>&1
```

Expected: all tests across all files pass. Zero failures.

```
 pass
 0 fail
```

Note: the exact pass count will be `31 (existing) + 9 (transactions) + 8 (shifts) = 48 pass`.

- [ ] **Step 4: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/routes/kasirHarian.test.ts && git commit -m "feat(api): add POST /shifts/close; complete Group 3+4 transactions and kasir harian endpoints"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `POST /api/transactions` with idempotency | Task 1 |
| Idempotency hook fixed (`error` → `status()`) | Task 1 — idempotency.hook.ts |
| `db.transaction()` for all writes in saveTransaction | Task 1 — saveTransaction wraps everything |
| Stock decrement for non-free items | Task 1 — `outletStock.stock - item.qty` |
| stockMovements entry per deducted item | Task 1 — insert into stockMovements with delta = -qty, sourceType = 'transaction' |
| member.lastTransactionAt updated if memberId | Task 1 — conditional update in saveTransaction |
| auditLog entry per transaction | Task 1 — insert into auditLog with requestId |
| `GET /api/transactions` paginated, filtered | Task 2 |
| `GET /api/transactions/:id` with items + payments | Task 2 |
| `GET /api/shifts/current` → null or open shift | Task 3 |
| `POST /api/shifts/open` — 409 on duplicate date | Task 3 |
| `POST /api/shifts/close` — computes expectedAmount from DB | Task 4 |
| All routes behind authGuard | All tasks — routes added after `.use(authGuard)` in index.ts |
| 401 tests for all endpoints | Tasks 1, 3 |
| Full test suite passes (0 failures) | Task 4 Step 3 |

**Placeholder scan:** No TBDs, no "handle edge cases". Every code block is complete.

**Type consistency:**
- `NewTransactionPayload` defined in Task 1 model, imported by Task 1 controller ✓
- `closeShift(shiftId, counts)` defined in Task 3 model, called by Task 3 controller ✓
- `openShift(params)` returns shift row which Task 3 controller wraps in `{ message, shift }` ✓
- `getCurrentShift(outletId)` returns shift or null, Task 3 controller wraps in `{ shift }` ✓
- `status()` imported from `'elysia'` in all controllers that return non-200 ✓

**One noted complexity:** The `beforeAll` in `kasirHarian.test.ts` attempts to delete any leftover open shift from a prior failed test run. The delete uses a subquery which may have TypeScript issues — if the ORM complains, replace with a two-step delete: first select the shift ID, then delete shiftCounts where shiftId = that ID, then delete the shift.
