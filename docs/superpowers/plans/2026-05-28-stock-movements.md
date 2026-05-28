# Stock Movements API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `GET /api/stock-movements` (paginated, filtered log) and `POST /api/stock-movements` (manual stock entry that updates `outletStock.stock` atomically) on the existing Bun + Elysia.js backend.

**Architecture:** Both endpoints are simple and require no idempotency hook. `POST` wraps its writes in `db.transaction()`: it verifies the `outletStock` row exists, updates `stock` by `delta`, inserts a `stockMovements` record with `sourceType: 'manual'`, and appends an `auditLog` entry. `GET` returns a paginated, filterable log with optional `itemId`, `outletId`, `from`, and `to` query params.

**Tech Stack:** Bun, Elysia.js 1.4.28, Drizzle ORM, PostgreSQL, `bun:test`

**Prerequisite:** Group 5 complete — 66 tests pass.

**Naming rules:** camelCase, no single-letter vars, `caughtError` in catch, controllers never import from `db/`, models never call `status()`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/models/stockMovements.model.ts` | Create | `getStockMovements`, `createStockMovement` |
| `server/src/controllers/stockMovements.controller.ts` | Create | `getStockMovementsHandler`, `createStockMovementHandler` |
| `server/src/routes/stockMovements.test.ts` | Create | Integration tests for both endpoints |
| `server/src/routes/index.ts` | Modify | Mount GET and POST routes |

---

### Task 1: POST /api/stock-movements

**Files:**
- Create: `server/src/models/stockMovements.model.ts`
- Create: `server/src/controllers/stockMovements.controller.ts`
- Create: `server/src/routes/stockMovements.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/stockMovements.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { items, outletStock, stockMovements, auditLog } from '../db/schema'
import { eq } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testOutletId       = ''
let testItemId         = ''
let testStockRowId     = ''
let createdMovementId  = ''

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

    const [insertedItem] = await db.insert(items).values({
        sku:         'SM-TEST-001',
        name:        'Test Item Stock Movement',
        category:    'Test',
        itemType:    'finished_good',
        priceLevel1: '10000',
        priceLevel2: '9000',
        priceLevel3: '8000',
        isActive:    true
    }).returning()
    testItemId = insertedItem.id

    const [insertedStock] = await db.insert(outletStock).values({
        itemId:      testItemId,
        outletId:    testOutletId,
        stock:       30,
        preAdjDelta: 0
    }).returning()
    testStockRowId = insertedStock.id
})

afterAll(async () => {
    if (createdMovementId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, createdMovementId))
        await db.delete(stockMovements).where(eq(stockMovements.id, createdMovementId))
    }
    await db.delete(outletStock).where(eq(outletStock.id, testStockRowId))
    await db.delete(items).where(eq(items.id, testItemId))
})

describe('POST /api/stock-movements', () => {
    it('returns 201 and creates a manual stock-in movement', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/stock-movements', {
                method:  'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    itemId:   testItemId,
                    outletId: testOutletId,
                    delta:    10,
                    note:     'Manual restock'
                })
            })
        )
        const responseData = await response.json() as { message: string; id: string }
        expect(response.status).toBe(201)
        expect(responseData.id).toBeTruthy()
        expect(responseData.message).toBe('Pergerakan stok berhasil dicatat.')
        createdMovementId = responseData.id
    })

    it('increments outletStock.stock by delta (30 + 10 = 40)', async () => {
        const [stockRow] = await db.select().from(outletStock).where(eq(outletStock.id, testStockRowId))
        expect(stockRow.stock).toBe(40)
    })

    it('returns 404 when outletStock row does not exist for the item+outlet pair', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/stock-movements', {
                method:  'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    itemId:   testItemId,
                    outletId: 'nonexistent-outlet-id',
                    delta:    5,
                    note:     'Should fail'
                })
            })
        )
        expect(response.status).toBe(404)
    })

    it('returns 401 without auth token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/stock-movements', {
                method:  'POST',
                headers: BASE_HEADERS,
                body: JSON.stringify({
                    itemId:   testItemId,
                    outletId: testOutletId,
                    delta:    1,
                    note:     ''
                })
            })
        )
        expect(response.status).toBe(401)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/stockMovements.test.ts 2>&1
```

Expected: `FAIL` — routes not mounted yet.

- [ ] **Step 3: Create `server/src/models/stockMovements.model.ts`**

```typescript
import { db } from '../db'
import { stockMovements, outletStock, auditLog } from '../db/schema'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export async function getStockMovements(params: {
    itemId?:   string
    outletId?: string
    from?:     string
    to?:       string
    page:      number
    limit:     number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        params.itemId   ? eq(stockMovements.itemId,   params.itemId)   : undefined,
        params.outletId ? eq(stockMovements.outletId, params.outletId) : undefined,
        params.from     ? gte(stockMovements.createdAt, new Date(params.from)) : undefined,
        params.to       ? lte(stockMovements.createdAt, new Date(`${params.to}T23:59:59.999Z`)) : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(stockMovements)
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select()
        .from(stockMovements)
        .where(whereConditions)
        .orderBy(desc(stockMovements.createdAt))
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function createStockMovement(params: {
    itemId:   string
    outletId: string
    delta:    number
    note:     string
}, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingStock] = await databaseTransaction
            .select()
            .from(outletStock)
            .where(and(
                eq(outletStock.itemId,   params.itemId),
                eq(outletStock.outletId, params.outletId)
            ))

        if (!existingStock) throw new Error('OUTLET_STOCK_NOT_FOUND')

        await databaseTransaction
            .update(outletStock)
            .set({ stock: sql`${outletStock.stock} + ${params.delta}` })
            .where(and(
                eq(outletStock.itemId,   params.itemId),
                eq(outletStock.outletId, params.outletId)
            ))

        const [savedMovement] = await databaseTransaction
            .insert(stockMovements)
            .values({
                itemId:     params.itemId,
                outletId:   params.outletId,
                delta:      params.delta,
                sourceType: 'manual',
                sourceId:   null,
                createdBy:  session.userId
            })
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'stock_movement',
            entityId:   savedMovement.id,
            newValue:   params,
            requestId:  null
        })

        return savedMovement
    })
}
```

- [ ] **Step 4: Create `server/src/controllers/stockMovements.controller.ts`**

```typescript
import { status } from 'elysia'
import type { JwtSession } from '../types'
import { getStockMovements, createStockMovement } from '../models/stockMovements.model'
import { Errors } from '../utils/errors'

export async function getStockMovementsHandler(context: {
    query:   { itemId?: string; outletId?: string; from?: string; to?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const page  = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))

    return getStockMovements({
        itemId:   context.query.itemId,
        outletId: context.query.outletId,
        from:     context.query.from,
        to:       context.query.to,
        page,
        limit
    })
}

export async function createStockMovementHandler(context: {
    body:    { itemId: string; outletId: string; delta: number; note: string }
    session: JwtSession
}) {
    try {
        const savedMovement = await createStockMovement(context.body, context.session)
        return status(201, { message: 'Pergerakan stok berhasil dicatat.', id: savedMovement.id })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'OUTLET_STOCK_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}
```

- [ ] **Step 5: Mount routes in `server/src/routes/index.ts`**

Read the file first. Add import:

```typescript
import { getStockMovementsHandler, createStockMovementHandler } from '../controllers/stockMovements.controller'
```

After the orders routes block (`.patch('/orders/:orderId/complete', completeOrderHandler)`), append:

```typescript
    // ── Stock Movements ───────────────────────────────────────────────────
    .get('/stock-movements', getStockMovementsHandler, {
        query: t.Object({
            itemId:   t.Optional(t.String()),
            outletId: t.Optional(t.String()),
            from:     t.Optional(t.String()),
            to:       t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .post('/stock-movements', createStockMovementHandler, {
        body: t.Object({
            itemId:   t.String(),
            outletId: t.String(),
            delta:    t.Integer(),
            note:     t.String()
        })
    })
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/stockMovements.test.ts 2>&1
```

Expected: 4 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/models/stockMovements.model.ts server/src/controllers/stockMovements.controller.ts server/src/routes/stockMovements.test.ts server/src/routes/index.ts && git commit -m "feat(api): add POST /stock-movements with atomic stock update"
```

---

### Task 2: GET /api/stock-movements + full suite

**Files:**
- Modify: `server/src/routes/stockMovements.test.ts` — append describe block

- [ ] **Step 1: Append GET tests**

Append to the end of `server/src/routes/stockMovements.test.ts`:

```typescript
describe('GET /api/stock-movements', () => {
    it('returns 200 with paginated data shape', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/stock-movements?itemId=${testItemId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { data: unknown[]; meta: { page: number; total: number } }
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData.data)).toBe(true)
        expect(typeof responseData.meta.page).toBe('number')
        expect(typeof responseData.meta.total).toBe('number')
    })

    it('includes the created movement in the result', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/stock-movements?itemId=${testItemId}&outletId=${testOutletId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { data: Array<{ id: string; delta: number; sourceType: string }> }
        expect(response.status).toBe(200)
        const found = responseData.data.find(movement => movement.id === createdMovementId)
        expect(found).toBeDefined()
        expect(found?.delta).toBe(10)
        expect(found?.sourceType).toBe('manual')
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/stock-movements', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})
```

- [ ] **Step 2: Run stock-movements tests**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/stockMovements.test.ts 2>&1
```

Expected: 7 pass, 0 fail.

- [ ] **Step 3: Run the full test suite**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test 2>&1
```

Expected: approximately 73 pass (66 existing + 7 stock-movements), 0 fail.

- [ ] **Step 4: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/routes/stockMovements.test.ts && git commit -m "feat(api): add GET /stock-movements tests; complete Group 6 stock movements endpoints"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `GET /api/stock-movements` paginated + filtered by itemId, outletId, from, to | Task 1 (route) + Task 2 (tests) |
| `POST /api/stock-movements` updates `outletStock.stock` by delta | Task 1 — `UPDATE outletStock SET stock = stock + delta` |
| `POST` inserts `stockMovements` with `sourceType: 'manual'` | Task 1 model |
| `POST` returns 404 when `outletStock` row not found | Task 1 — `OUTLET_STOCK_NOT_FOUND` check |
| `POST` appends `auditLog` entry | Task 1 model |
| All routes behind authGuard | Task 1 — routes added after `.use(authGuard)` |
| 401 tests for both endpoints | Tasks 1 + 2 |
| Full suite passes 0 failures | Task 2 Step 3 |

**Placeholder scan:** No TBDs. All code is complete.

**Type consistency:**
- `createStockMovement(params, session)` — controller passes `context.body` and `context.session` ✓
- `OUTLET_STOCK_NOT_FOUND` thrown in model, caught in controller ✓
- `delta: t.Integer()` in route schema matches `delta: number` in body type ✓
