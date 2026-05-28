# Read / Config Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all read-only GET endpoints — outlets, payment-methods, transaction-types, items (with stock), members, and promos — on top of the existing Bun + Elysia.js backend foundation.

**Architecture:** Each domain gets a model file (DB queries only) and a controller file (HTTP coordination only). Routes mount in `routes/index.ts` after `authGuard`, so every endpoint requires a valid JWT. Config endpoints (outlets, payment-methods, transaction-types) use Redis caching at `CACHE_TTL_CONFIG` (1 hour). Item stock is computed as `stock + preAdjDelta` at query time. Tests use `app.handle()` against the real DB, with `beforeAll`/`afterAll` for test data lifecycle.

**Tech Stack:** Bun, Elysia.js, Drizzle ORM, PostgreSQL, Redis (`ioredis`), `bun:test`

**Prerequisite:** Backend foundation is complete — `server/` has a running app at `http://localhost:3000`, seed data (outlets, users, payment methods, transaction types) is in the DB, and `bun run src/index.ts` starts without error.

**Naming rules (enforced throughout):**
- camelCase everywhere — variables, functions, parameters, object keys
- No single-letter variables — `foundItem` not `i`, `foundMember` not `m`
- Descriptive callback params — `.map(item => ...)` not `.map(i => ...)`
- Every `catch` block uses `caughtError` not `e` or `err`
- Controllers never import from `db/` — only from models
- Models never import from controllers or shape HTTP responses
- Routes never contain business logic

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/models/config.model.ts` | Create | DB queries for outlets, payment-methods, transaction-types; Redis cache read/write |
| `server/src/controllers/config.controller.ts` | Create | HTTP handlers for GET /outlets, GET /payment-methods, GET /transaction-types |
| `server/src/routes/config.test.ts` | Create | Integration tests for all 3 config endpoints |
| `server/src/models/items.model.ts` | Create | DB queries for items list (with stock join), item by id, item stock by outlet |
| `server/src/controllers/items.controller.ts` | Create | HTTP handlers for GET /items, GET /items/:itemId, GET /items/:itemId/stock |
| `server/src/routes/items.test.ts` | Create | Integration tests for all 3 items endpoints |
| `server/src/models/members.model.ts` | Create | DB queries for members list (with search) and member by id |
| `server/src/controllers/members.controller.ts` | Create | HTTP handlers for GET /members, GET /members/:memberId |
| `server/src/routes/members.test.ts` | Create | Integration tests for both members endpoints |
| `server/src/models/promos.model.ts` | Create | DB query for active promos filtered by today's date |
| `server/src/controllers/promos.controller.ts` | Create | HTTP handler for GET /promos |
| `server/src/routes/promos.test.ts` | Create | Integration tests for promos endpoint |
| `server/src/routes/index.ts` | Modify | Mount all new routes after authGuard |

---

### Task 1: Config endpoints — outlets, payment-methods, transaction-types

**Files:**
- Create: `server/src/models/config.model.ts`
- Create: `server/src/controllers/config.controller.ts`
- Create: `server/src/routes/config.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/config.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'bun:test'
import { app } from '../index'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}

beforeAll(async () => {
    const loginResponse = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method:  'POST',
            headers: BASE_HEADERS,
            body:    JSON.stringify({ username: 'admin', password: 'admin123' })
        })
    )
    const loginData = await loginResponse.json() as { token: string }
    authHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }
})

describe('GET /api/outlets', () => {
    it('returns 200 with an array of outlets', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/outlets', { headers: authHeaders })
        )
        const responseData = await response.json() as unknown[]
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
        expect(responseData.length).toBeGreaterThan(0)
    })

    it('returns 401 without auth token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/outlets', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('GET /api/payment-methods', () => {
    it('returns 200 with an array of payment methods', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/payment-methods', { headers: authHeaders })
        )
        const responseData = await response.json() as unknown[]
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
        expect(responseData.length).toBeGreaterThan(0)
    })
})

describe('GET /api/transaction-types', () => {
    it('returns 200 with an array of transaction types', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/transaction-types', { headers: authHeaders })
        )
        const responseData = await response.json() as unknown[]
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
        expect(responseData.length).toBeGreaterThan(0)
    })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/config.test.ts 2>&1
```

Expected: `FAIL` — routes don't exist yet, so the app returns 404 or the imports fail.

- [ ] **Step 3: Create `server/src/models/config.model.ts`**

```typescript
import { db } from '../db'
import { outlets, paymentMethods, transactionTypes } from '../db/schema'
import { eq } from 'drizzle-orm'
import { cacheGet, cacheSet } from '../utils/cache'
import { CACHE_TTL_CONFIG } from '../utils/constants'

export async function getAllOutlets() {
    const cacheKey = 'cache:outlets'
    const cachedOutlets = await cacheGet<typeof outlets.$inferSelect[]>(cacheKey)
    if (cachedOutlets) return cachedOutlets

    const allOutlets = await db.select().from(outlets).where(eq(outlets.isActive, true))
    await cacheSet(cacheKey, allOutlets, CACHE_TTL_CONFIG)
    return allOutlets
}

export async function getAllPaymentMethods() {
    const cacheKey = 'cache:payment-methods'
    const cachedMethods = await cacheGet<typeof paymentMethods.$inferSelect[]>(cacheKey)
    if (cachedMethods) return cachedMethods

    const allMethods = await db.select().from(paymentMethods).where(eq(paymentMethods.isActive, true))
    await cacheSet(cacheKey, allMethods, CACHE_TTL_CONFIG)
    return allMethods
}

export async function getAllTransactionTypes() {
    const cacheKey = 'cache:transaction-types'
    const cachedTypes = await cacheGet<typeof transactionTypes.$inferSelect[]>(cacheKey)
    if (cachedTypes) return cachedTypes

    const allTypes = await db.select().from(transactionTypes)
    await cacheSet(cacheKey, allTypes, CACHE_TTL_CONFIG)
    return allTypes
}
```

- [ ] **Step 4: Create `server/src/controllers/config.controller.ts`**

```typescript
import { getAllOutlets, getAllPaymentMethods, getAllTransactionTypes } from '../models/config.model'

export async function getOutlets() {
    return getAllOutlets()
}

export async function getPaymentMethods() {
    return getAllPaymentMethods()
}

export async function getTransactionTypes() {
    return getAllTransactionTypes()
}
```

- [ ] **Step 5: Mount routes in `server/src/routes/index.ts`**

Add these imports at the top of the file (after the existing imports):

```typescript
import { getOutlets, getPaymentMethods, getTransactionTypes } from '../controllers/config.controller'
```

Replace the comment `// Subsequent plans mount their routes here` with:

```typescript
    // ── Config (cached 1hr) ─────────────────────────────────────────────
    .get('/outlets',           getOutlets)
    .get('/payment-methods',   getPaymentMethods)
    .get('/transaction-types', getTransactionTypes)
    // Subsequent plans mount their routes here
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/config.test.ts 2>&1
```

Expected output:
```
✓ GET /api/outlets > returns 200 with an array of outlets
✓ GET /api/outlets > returns 401 without auth token
✓ GET /api/payment-methods > returns 200 with an array of payment methods
✓ GET /api/transaction-types > returns 200 with an array of transaction types
```

- [ ] **Step 7: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/models/config.model.ts server/src/controllers/config.controller.ts server/src/routes/config.test.ts server/src/routes/index.ts && git commit -m "feat(api): add GET /outlets, /payment-methods, /transaction-types with Redis caching"
```

---

### Task 2: Items endpoints — list with stock, detail, stock by outlet

**Files:**
- Create: `server/src/models/items.model.ts`
- Create: `server/src/controllers/items.controller.ts`
- Create: `server/src/routes/items.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/items.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { items, outletStock } from '../db/schema'
import { eq } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testOutletId      = ''
let testItemId        = ''
let testStockRowId    = ''

beforeAll(async () => {
    const loginResponse = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method:  'POST',
            headers: BASE_HEADERS,
            body:    JSON.stringify({ username: 'kasir1', password: 'kasir123' })
        })
    )
    const loginData = await loginResponse.json() as { token: string; user: { outletId: string } }
    authHeaders  = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }
    testOutletId = loginData.user.outletId

    const [insertedItem] = await db.insert(items).values({
        sku:         'TEST-ITEM-001',
        name:        'Test Sabun Mandi',
        category:    'Perawatan Tubuh',
        itemType:    'finished_good',
        priceLevel1: '15000',
        priceLevel2: '14000',
        priceLevel3: '13000',
        isActive:    true
    }).returning()
    testItemId = insertedItem.id

    const [insertedStock] = await db.insert(outletStock).values({
        itemId:      testItemId,
        outletId:    testOutletId,
        stock:       50,
        preAdjDelta: 5
    }).returning()
    testStockRowId = insertedStock.id
})

afterAll(async () => {
    await db.delete(outletStock).where(eq(outletStock.id, testStockRowId))
    await db.delete(items).where(eq(items.id, testItemId))
})

describe('GET /api/items', () => {
    it('returns 200 with paginated data shape', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/items?outletId=${testOutletId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { data: unknown[]; meta: { page: number; total: number } }
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData.data)).toBe(true)
        expect(typeof responseData.meta.page).toBe('number')
        expect(typeof responseData.meta.total).toBe('number')
    })

    it('includes computed stock (stock + preAdjDelta = 55) for the test item', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/items?outletId=${testOutletId}&search=TEST-ITEM-001`, { headers: authHeaders })
        )
        const responseData = await response.json() as { data: Array<{ sku: string; stock: number }> }
        expect(response.status).toBe(200)
        const foundItem = responseData.data.find(item => item.sku === 'TEST-ITEM-001')
        expect(foundItem).toBeDefined()
        expect(foundItem!.stock).toBe(55)
    })

    it('returns 0 stock when outletId has no stock row', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/items?outletId=nonexistent-outlet&search=TEST-ITEM-001`, { headers: authHeaders })
        )
        const responseData = await response.json() as { data: Array<{ stock: number }> }
        const foundItem = responseData.data.find((item: { sku?: string }) => item.sku === 'TEST-ITEM-001')
        if (foundItem) expect(foundItem.stock).toBe(0)
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/items', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('GET /api/items/:itemId', () => {
    it('returns 200 with item data for a valid id', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/items/${testItemId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { id: string; sku: string }
        expect(response.status).toBe(200)
        expect(responseData.id).toBe(testItemId)
        expect(responseData.sku).toBe('TEST-ITEM-001')
    })

    it('returns 404 for unknown item id', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/items/nonexistent-id', { headers: authHeaders })
        )
        expect(response.status).toBe(404)
    })
})

describe('GET /api/items/:itemId/stock', () => {
    it('returns 200 with stock per outlet array', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/items/${testItemId}/stock`, { headers: authHeaders })
        )
        const responseData = await response.json() as Array<{ outletId: string; stock: number }>
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
        const stockEntry = responseData.find(row => row.outletId === testOutletId)
        expect(stockEntry).toBeDefined()
        expect(stockEntry!.stock).toBe(55)
    })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/items.test.ts 2>&1
```

Expected: `FAIL` — routes not mounted yet.

- [ ] **Step 3: Create `server/src/models/items.model.ts`**

```typescript
import { db } from '../db'
import { items, outletStock, outlets } from '../db/schema'
import { eq, and, ilike, or, sql } from 'drizzle-orm'
import { Errors } from '../utils/errors'

export async function getItems(params: {
    outletId: string
    search?:  string
    page:     number
    limit:    number
}) {
    const offset = (params.page - 1) * params.limit

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(items)
        .where(
            and(
                eq(items.isActive, true),
                params.search
                    ? or(ilike(items.name, `%${params.search}%`), ilike(items.sku, `%${params.search}%`))
                    : undefined
            )
        )

    const total = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select({
            id:          items.id,
            sku:         items.sku,
            name:        items.name,
            category:    items.category,
            itemType:    items.itemType,
            priceLevel1: items.priceLevel1,
            priceLevel2: items.priceLevel2,
            priceLevel3: items.priceLevel3,
            isActive:    items.isActive,
            stock:       sql<number>`COALESCE(${outletStock.stock} + ${outletStock.preAdjDelta}, 0)`
        })
        .from(items)
        .leftJoin(
            outletStock,
            and(
                eq(outletStock.itemId,   items.id),
                eq(outletStock.outletId, params.outletId)
            )
        )
        .where(
            and(
                eq(items.isActive, true),
                params.search
                    ? or(ilike(items.name, `%${params.search}%`), ilike(items.sku, `%${params.search}%`))
                    : undefined
            )
        )
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getItemById(itemId: string) {
    const [foundItem] = await db
        .select()
        .from(items)
        .where(eq(items.id, itemId))
    return foundItem ?? null
}

export async function getItemStock(itemId: string) {
    return db
        .select({
            outletId:   outletStock.outletId,
            outletName: outlets.name,
            stock:      sql<number>`${outletStock.stock} + ${outletStock.preAdjDelta}`
        })
        .from(outletStock)
        .innerJoin(outlets, eq(outlets.id, outletStock.outletId))
        .where(eq(outletStock.itemId, itemId))
}
```

- [ ] **Step 4: Create `server/src/controllers/items.controller.ts`**

```typescript
import type { JwtSession } from '../types'
import { getItems, getItemById, getItemStock } from '../models/items.model'
import { Errors } from '../utils/errors'

export async function getItemsHandler(context: {
    query:   { outletId?: string; search?: string; page?: string; limit?: string }
    session: JwtSession
    error:   (statusCode: number, body: unknown) => unknown
}) {
    const outletId = context.query.outletId ?? context.session.outletId
    const page     = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit    = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))

    return getItems({ outletId, search: context.query.search, page, limit })
}

export async function getItemByIdHandler(context: {
    params:  { itemId: string }
    session: JwtSession
    error:   (statusCode: number, body: unknown) => unknown
}) {
    const foundItem = await getItemById(context.params.itemId)
    if (!foundItem) return context.error(404, { message: Errors.NOT_FOUND })
    return foundItem
}

export async function getItemStockHandler(context: {
    params:  { itemId: string }
    session: JwtSession
    error:   (statusCode: number, body: unknown) => unknown
}) {
    return getItemStock(context.params.itemId)
}
```

- [ ] **Step 5: Mount items routes in `server/src/routes/index.ts`**

Add import:
```typescript
import { getItemsHandler, getItemByIdHandler, getItemStockHandler } from '../controllers/items.controller'
```

After the config routes block, before the `// Subsequent plans` comment:
```typescript
    // ── Items ───────────────────────────────────────────────────────────
    .get('/items', getItemsHandler, {
        query: t.Object({
            outletId: t.Optional(t.String()),
            search:   t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .get('/items/:itemId',       getItemByIdHandler)
    .get('/items/:itemId/stock', getItemStockHandler)
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/items.test.ts 2>&1
```

Expected:
```
✓ GET /api/items > returns 200 with paginated data shape
✓ GET /api/items > includes computed stock (stock + preAdjDelta = 55) for the test item
✓ GET /api/items > returns 0 stock when outletId has no stock row
✓ GET /api/items > returns 401 without token
✓ GET /api/items/:itemId > returns 200 with item data for a valid id
✓ GET /api/items/:itemId > returns 404 for unknown item id
✓ GET /api/items/:itemId/stock > returns 200 with stock per outlet array
```

- [ ] **Step 7: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/models/items.model.ts server/src/controllers/items.controller.ts server/src/routes/items.test.ts server/src/routes/index.ts && git commit -m "feat(api): add GET /items, /items/:id, /items/:id/stock with pagination and stock join"
```

---

### Task 3: Members endpoints — list with search, detail

**Files:**
- Create: `server/src/models/members.model.ts`
- Create: `server/src/controllers/members.controller.ts`
- Create: `server/src/routes/members.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/members.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { members } from '../db/schema'
import { eq } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testMemberId = ''

beforeAll(async () => {
    const loginResponse = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method:  'POST',
            headers: BASE_HEADERS,
            body:    JSON.stringify({ username: 'kasir1', password: 'kasir123' })
        })
    )
    const loginData = await loginResponse.json() as { token: string }
    authHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }

    const [insertedMember] = await db.insert(members).values({
        name:      'Siti Rahayu Test',
        whatsapp:  '081234567890',
        birthdate: '1990-05-15',
        address:   'Jl. Test No. 1',
        points:    100,
        isPremium: false
    }).returning()
    testMemberId = insertedMember.id
})

afterAll(async () => {
    await db.delete(members).where(eq(members.id, testMemberId))
})

describe('GET /api/members', () => {
    it('returns 200 with paginated data shape', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/members', { headers: authHeaders })
        )
        const responseData = await response.json() as { data: unknown[]; meta: { page: number; total: number } }
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData.data)).toBe(true)
        expect(typeof responseData.meta.page).toBe('number')
    })

    it('filters by name when query param is provided', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/members?query=Siti+Rahayu+Test', { headers: authHeaders })
        )
        const responseData = await response.json() as { data: Array<{ name: string }> }
        expect(response.status).toBe(200)
        expect(responseData.data.some(member => member.name === 'Siti Rahayu Test')).toBe(true)
    })

    it('filters by whatsapp number', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/members?query=081234567890', { headers: authHeaders })
        )
        const responseData = await response.json() as { data: Array<{ whatsapp: string }> }
        expect(response.status).toBe(200)
        expect(responseData.data.some(member => member.whatsapp === '081234567890')).toBe(true)
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/members', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('GET /api/members/:memberId', () => {
    it('returns 200 with member data for a valid id', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/members/${testMemberId}`, { headers: authHeaders })
        )
        const responseData = await response.json() as { id: string; name: string }
        expect(response.status).toBe(200)
        expect(responseData.id).toBe(testMemberId)
        expect(responseData.name).toBe('Siti Rahayu Test')
    })

    it('returns 404 for unknown member id', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/members/nonexistent-id', { headers: authHeaders })
        )
        expect(response.status).toBe(404)
    })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/members.test.ts 2>&1
```

Expected: `FAIL` — routes not mounted yet.

- [ ] **Step 3: Create `server/src/models/members.model.ts`**

```typescript
import { db } from '../db'
import { members } from '../db/schema'
import { eq, ilike, or, and, sql } from 'drizzle-orm'

export async function getMembers(params: {
    query?: string
    page:   number
    limit:  number
}) {
    const offset = (params.page - 1) * params.limit

    const searchCondition = params.query
        ? or(
            ilike(members.name,     `%${params.query}%`),
            ilike(members.whatsapp, `%${params.query}%`)
          )
        : undefined

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(members)
        .where(searchCondition)

    const total = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select()
        .from(members)
        .where(searchCondition)
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getMemberById(memberId: string) {
    const [foundMember] = await db
        .select()
        .from(members)
        .where(eq(members.id, memberId))
    return foundMember ?? null
}
```

- [ ] **Step 4: Create `server/src/controllers/members.controller.ts`**

```typescript
import type { JwtSession } from '../types'
import { getMembers, getMemberById } from '../models/members.model'
import { Errors } from '../utils/errors'

export async function getMembersHandler(context: {
    query:   { query?: string; page?: string; limit?: string }
    session: JwtSession
    error:   (statusCode: number, body: unknown) => unknown
}) {
    const page  = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))
    return getMembers({ query: context.query.query, page, limit })
}

export async function getMemberByIdHandler(context: {
    params:  { memberId: string }
    session: JwtSession
    error:   (statusCode: number, body: unknown) => unknown
}) {
    const foundMember = await getMemberById(context.params.memberId)
    if (!foundMember) return context.error(404, { message: Errors.NOT_FOUND })
    return foundMember
}
```

- [ ] **Step 5: Mount members routes in `server/src/routes/index.ts`**

Add import:
```typescript
import { getMembersHandler, getMemberByIdHandler } from '../controllers/members.controller'
```

After the items routes block:
```typescript
    // ── Members ─────────────────────────────────────────────────────────
    .get('/members', getMembersHandler, {
        query: t.Object({
            query: t.Optional(t.String()),
            page:  t.Optional(t.String()),
            limit: t.Optional(t.String())
        })
    })
    .get('/members/:memberId', getMemberByIdHandler)
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/members.test.ts 2>&1
```

Expected:
```
✓ GET /api/members > returns 200 with paginated data shape
✓ GET /api/members > filters by name when query param is provided
✓ GET /api/members > filters by whatsapp number
✓ GET /api/members > returns 401 without token
✓ GET /api/members/:memberId > returns 200 with member data for a valid id
✓ GET /api/members/:memberId > returns 404 for unknown member id
```

- [ ] **Step 7: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/models/members.model.ts server/src/controllers/members.controller.ts server/src/routes/members.test.ts server/src/routes/index.ts && git commit -m "feat(api): add GET /members and /members/:id with name and whatsapp search"
```

---

### Task 4: Promos endpoint + run full test suite

**Files:**
- Create: `server/src/models/promos.model.ts`
- Create: `server/src/controllers/promos.controller.ts`
- Create: `server/src/routes/promos.test.ts`
- Modify: `server/src/routes/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/src/routes/promos.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { promos } from '../db/schema'
import { eq } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testPromoId = ''

beforeAll(async () => {
    const loginResponse = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method:  'POST',
            headers: BASE_HEADERS,
            body:    JSON.stringify({ username: 'kasir1', password: 'kasir123' })
        })
    )
    const loginData = await loginResponse.json() as { token: string }
    authHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }

    const today    = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

    const [insertedPromo] = await db.insert(promos).values({
        name:          'Test Promo Diskon',
        code:          'TESTPROMO001',
        discountType:  'percentage',
        discountValue: '10',
        minTransaction:'50000',
        startDate:     today,
        endDate:       tomorrow,
        isActive:      true
    }).returning()
    testPromoId = insertedPromo.id
})

afterAll(async () => {
    await db.delete(promos).where(eq(promos.id, testPromoId))
})

describe('GET /api/promos', () => {
    it('returns 200 with an array of active promos', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/promos', { headers: authHeaders })
        )
        const responseData = await response.json() as unknown[]
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
    })

    it('includes the seeded active promo in the result', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/promos', { headers: authHeaders })
        )
        const responseData = await response.json() as Array<{ code: string }>
        expect(responseData.some(promo => promo.code === 'TESTPROMO001')).toBe(true)
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/promos', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/promos.test.ts 2>&1
```

Expected: `FAIL`.

- [ ] **Step 3: Create `server/src/models/promos.model.ts`**

```typescript
import { db } from '../db'
import { promos } from '../db/schema'
import { and, eq, lte, or, isNull, sql } from 'drizzle-orm'

export async function getActivePromos() {
    const today = new Date().toISOString().slice(0, 10)

    return db
        .select()
        .from(promos)
        .where(
            and(
                eq(promos.isActive, true),
                lte(promos.startDate, today),
                or(isNull(promos.endDate), sql`${promos.endDate} >= ${today}`)
            )
        )
}
```

- [ ] **Step 4: Create `server/src/controllers/promos.controller.ts`**

```typescript
import { getActivePromos } from '../models/promos.model'

export async function getPromosHandler() {
    return getActivePromos()
}
```

- [ ] **Step 5: Mount promos routes in `server/src/routes/index.ts`**

Add import:
```typescript
import { getPromosHandler } from '../controllers/promos.controller'
```

After the members routes block:
```typescript
    // ── Promos ──────────────────────────────────────────────────────────
    .get('/promos', getPromosHandler)
```

The final `// Subsequent plans mount their routes here` comment can now be removed or kept for the next plan.

- [ ] **Step 6: Run promos tests**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test src/routes/promos.test.ts 2>&1
```

Expected:
```
✓ GET /api/promos > returns 200 with an array of active promos
✓ GET /api/promos > includes the seeded active promo in the result
✓ GET /api/promos > returns 401 without token
```

- [ ] **Step 7: Run the full test suite**

```bash
cd /home/richie/Documents/Sandbox/Retail/server && bun test 2>&1
```

Expected: all tests in `src/routes/auth.test.ts`, `config.test.ts`, `items.test.ts`, `members.test.ts`, `promos.test.ts` pass. Zero failures.

- [ ] **Step 8: Commit**

```bash
cd /home/richie/Documents/Sandbox/Retail && git add server/src/models/promos.model.ts server/src/controllers/promos.controller.ts server/src/routes/promos.test.ts server/src/routes/index.ts && git commit -m "feat(api): add GET /promos; complete Group 2 read/config endpoints"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `GET /api/outlets` — cached 1hr | Task 1 |
| `GET /api/payment-methods` — cached 1hr | Task 1 |
| `GET /api/transaction-types` — cached 1hr | Task 1 |
| `GET /api/items?outletId=&search=` — paginated | Task 2 |
| `GET /api/items/:itemId` — 404 if not found | Task 2 |
| `GET /api/items/:itemId/stock` — per-outlet stock | Task 2 |
| stock = `stock + preAdjDelta` (never read stock directly) | Task 2 — `COALESCE(stock + preAdjDelta, 0)` |
| `GET /api/members?query=` — paginated, search name+whatsapp | Task 3 |
| `GET /api/members/:memberId` — 404 if not found | Task 3 |
| `GET /api/promos` — active only, date-filtered | Task 4 |
| All endpoints require JWT (authGuard) | All tasks — routes mounted after `.use(authGuard)` |
| Pagination envelope: `{ data, meta: { page, limit, total, totalPages } }` | Tasks 2, 3 |
| `page` clamped to ≥1, `limit` clamped to 1–100 | Tasks 2, 3 controllers |
| Controllers never import from `db/` | ✓ — all controllers import from models only |
| Models never shape HTTP responses | ✓ — models return raw data, controllers return it directly |

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to above". Every step has complete code.

**Type consistency:**
- `getItemsHandler` / `getItemByIdHandler` / `getItemStockHandler` defined in controller, matches what routes/index.ts calls ✓
- `getMembersHandler` / `getMemberByIdHandler` matches ✓
- `getPromosHandler` matches ✓
- `JwtSession` imported from `'../types'` in all controllers ✓
- `Errors.NOT_FOUND` used for 404s ✓
