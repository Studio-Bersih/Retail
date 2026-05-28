# Race Condition Tester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `server/scripts/race-test.ts` — a single Bun script that proves PostgreSQL concurrency safety by firing parallel HTTP requests and verifying database state, then benchmarks peak RPS + latency percentiles.

**Architecture:** Single file, four sequential phases. The script opens its own small Postgres connection pool (3 connections) for seeding and DB verification — independent from the server's pool. HTTP requests use native `bun fetch`. Each phase probes for a 404 first and self-skips if the endpoint isn't built yet. Test data is tagged (`sku: 'RACE-001'`, `kode: 'RACETEST'`, `notes: '__RACE_TEST__'`) for easy identification and cleanup.

**Tech Stack:** Bun, `bun fetch`, `postgres` (already in server/), `drizzle-orm` (already in server/), ANSI terminal colors

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/scripts/race-test.ts` | Create | Single entry point — all phases, DB helpers, HTTP helper, output |

---

### Task 1: Scaffold — arg parsing, colors, HTTP helper, token pool

**Files:**
- Create: `server/scripts/race-test.ts`

- [ ] **Step 1: Create the file**

```typescript
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'

// ── Own DB pool (3 connections — closed explicitly at exit) ───────────────
const queryClient = postgres(process.env.DATABASE_URL!, { max: 3, idle_timeout: 10 })
const db = drizzle(queryClient, { schema })

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)

function getArg(flag: string, fallback: string): string {
    const idx = args.indexOf(flag)
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const PHASE    = getArg('--phase', 'all')
const N        = parseInt(getArg('--concurrency', '10'))
const DURATION = parseInt(getArg('--duration', '5'))
const BASE_URL = getArg('--url', 'http://localhost:3000')
const JSON_MODE = args.includes('--json')

// ── Colors ─────────────────────────────────────────────────────────────────
const c = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    red:    '\x1b[31m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    orange: '\x1b[38;5;208m'
}

function phaseHeader(num: number, title: string) {
    console.log(`\n${c.bold}${c.cyan}Phase ${num} — ${title}${c.reset}`)
}

// ── HTTP helper ───────────────────────────────────────────────────────────
async function apiFetch(
    path: string,
    opts: { method?: string; body?: unknown; token?: string; idempotencyKey?: string; timeoutMs?: number } = {}
): Promise<Response> {
    const headers: Record<string, string> = {
        'Content-Type':  'application/json',
        'X-App-Version': '1.0.0'
    }
    if (opts.token)          headers['Authorization']     = `Bearer ${opts.token}`
    if (opts.idempotencyKey) headers['X-Idempotency-Key'] = opts.idempotencyKey

    const controller = new AbortController()
    const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined

    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            method:  opts.method ?? 'GET',
            headers,
            body:    opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal:  controller.signal
        })
        if (timer) clearTimeout(timer)
        return res
    } catch (err) {
        if (timer) clearTimeout(timer)
        throw err
    }
}

// ── Token pool ─────────────────────────────────────────────────────────────
interface TokenEntry { token: string; userId: string; outletId: string; username: string }
let tokenPool: TokenEntry[] = []

async function buildTokenPool(): Promise<void> {
    console.log(`\n${c.bold}Authenticating test users...${c.reset}`)
    const credentials = [
        { username: 'admin',   password: 'admin123'   },
        { username: 'manager', password: 'manager123' },
        { username: 'kasir1',  password: 'kasir123'   },
        { username: 'kasir2',  password: 'kasir123'   }
    ]
    for (const cred of credentials) {
        const res = await apiFetch('/api/auth/login', { method: 'POST', body: cred })
        if (!res.ok) throw new Error(`Login failed for ${cred.username}: HTTP ${res.status}`)
        const data = await res.json() as { token: string; user: { userId: string; outletId: string } }
        tokenPool.push({ token: data.token, userId: data.user.userId, outletId: data.user.outletId, username: cred.username })
        console.log(`  ${c.green}✓${c.reset} ${cred.username}`)
    }
}

function roundRobin(idx: number): TokenEntry { return tokenPool[idx % tokenPool.length] }
```

- [ ] **Step 2: Verify it compiles**

Ensure the backend server is running first:
```bash
cd server && bun run src/index.ts &
```

Run the script (exits after auth since no phase matches 'all' yet):
```bash
cd server && bun run scripts/race-test.ts
```

Expected output:
```
Authenticating test users...
  ✓ admin
  ✓ manager
  ✓ kasir1
  ✓ kasir2
```

If `DATABASE_URL` is missing: Bun auto-loads `.env` from CWD — always run from `server/`.

- [ ] **Step 3: Commit**

```bash
git add server/scripts/race-test.ts
git commit -m "feat(race-test): scaffold — arg parsing, colors, HTTP helper, token pool"
```

---

### Task 2: Test data lifecycle — seed and cleanup

**Files:**
- Modify: `server/scripts/race-test.ts`

- [ ] **Step 1: Add test data state and seed/cleanup functions**

Add after `roundRobin()`:

```typescript
// ── Test data state ───────────────────────────────────────────────────────
let TEST_ITEM_ID      = ''
let TEST_OUTLET_ID    = ''   // kasir1's outletId (Outlet Utama)
let TEST_STOCK_ROW_ID = ''
const TEST_COUPON_KODE = 'RACETEST'

async function setupTestData(): Promise<void> {
    console.log(`\n${c.bold}Seeding test data...${c.reset}`)
    TEST_OUTLET_ID = tokenPool.find(t => t.username === 'kasir1')!.outletId

    const [testItem] = await db.insert(schema.items).values({
        sku:         'RACE-001',
        name:        'Race Test Item',
        category:    'Test',
        itemType:    'finished_good',
        priceLevel1: '10000',
        priceLevel2: '10000',
        priceLevel3: '10000',
        isActive:    true
    }).returning()
    TEST_ITEM_ID = testItem.id

    const [stockRow] = await db.insert(schema.outletStock).values({
        itemId:      TEST_ITEM_ID,
        outletId:    TEST_OUTLET_ID,
        stock:       100,
        preAdjDelta: 0
    }).returning()
    TEST_STOCK_ROW_ID = stockRow.id

    console.log(`  ${c.green}✓${c.reset} Item seeded  (sku: RACE-001, id: ${TEST_ITEM_ID.slice(0, 8)}...)`)
    console.log(`  ${c.green}✓${c.reset} Stock seeded (outlet: ${TEST_OUTLET_ID.slice(0, 8)}...)`)
}

async function cleanupTestData(): Promise<void> {
    console.log(`\n${c.dim}Cleaning up test data...${c.reset}`)

    // kuponLog has no FK to coupons — safe to delete in any order
    await db.delete(schema.kuponLog).where(eq(schema.kuponLog.kodeKupon, TEST_COUPON_KODE))
    await db.delete(schema.coupons).where(eq(schema.coupons.kode,         TEST_COUPON_KODE))
    await db.delete(schema.shifts).where(eq(schema.shifts.outletId,       TEST_OUTLET_ID))

    // transactionItems.itemId → items.id FK — cannot delete item if transactions reference it
    try {
        await db.delete(schema.outletStock).where(eq(schema.outletStock.id, TEST_STOCK_ROW_ID))
        await db.delete(schema.items).where(eq(schema.items.id,             TEST_ITEM_ID))
        console.log(`  ${c.dim}✓ All test data removed.${c.reset}`)
    } catch {
        console.log(`  ${c.dim}Note: Test item kept (transactions reference it). To remove manually:`)
        console.log(`    DELETE FROM transaction_items WHERE item_id = '${TEST_ITEM_ID}';`)
        console.log(`    DELETE FROM outlet_stock WHERE id = '${TEST_STOCK_ROW_ID}';`)
        console.log(`    DELETE FROM items WHERE sku = 'RACE-001';${c.reset}`)
    }
}
```

- [ ] **Step 2: Verify seed runs**

```bash
cd server && bun run scripts/race-test.ts
```

Expected (after auth lines):
```
Seeding test data...
  ✓ Item seeded  (sku: RACE-001, id: xxxxxxxx...)
  ✓ Stock seeded (outlet: xxxxxxxx...)
```

Check the DB to confirm:
```bash
psql -d studio_bersih -c "SELECT sku, name FROM items WHERE sku = 'RACE-001';"
```
Expected: one row.

- [ ] **Step 3: Commit**

```bash
git add server/scripts/race-test.ts
git commit -m "feat(race-test): add test data seed and cleanup lifecycle"
```

---

### Task 3: Phase 1 — Stock depletion race

**Files:**
- Modify: `server/scripts/race-test.ts`

- [ ] **Step 1: Add `runStockRace()` function**

Add after `cleanupTestData()`:

```typescript
// ── Phase 1: Stock depletion race ─────────────────────────────────────────
async function runStockRace(): Promise<string> {
    phaseHeader(1, 'Stock Depletion Race')
    console.log(`  Concurrency: ${N} workers | Target stock: 1 unit`)

    // Probe: skip if endpoint not built
    const probe = await apiFetch('/api/transactions', {
        method:         'POST',
        body:           {},
        token:          tokenPool[0].token,
        idempotencyKey: crypto.randomUUID()
    })
    if (probe.status === 404) {
        console.log(`  ${c.yellow}SKIPPED ⚠️${c.reset}  /api/transactions not yet built`)
        return 'SKIPPED'
    }

    // Seed: set stock = 1
    await db.update(schema.outletStock)
        .set({ stock: 1 })
        .where(eq(schema.outletStock.id, TEST_STOCK_ROW_ID))
    console.log(`  Stock reset to 1.`)

    // Fire N concurrent transactions
    const payload = {
        outletId:        TEST_OUTLET_ID,
        memberId:        null,
        mode:            'retail',
        subtotal:        10000,
        kupon:           null,
        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
        total:           10000,
        notes:           '__RACE_TEST__',
        items:           [{ itemId: TEST_ITEM_ID, qty: 1, price: 10000, isFree: false }],
        paymentMethods:  [{ method: 'Tunai', amount: 10000 }]
    }

    const start = performance.now()
    console.log(`  Firing ${N} concurrent requests...`)
    const results = await Promise.allSettled(
        Array.from({ length: N }, (_, idx) =>
            apiFetch('/api/transactions', {
                method:         'POST',
                body:           payload,
                token:          roundRobin(idx).token,
                idempotencyKey: crypto.randomUUID(),
                timeoutMs:      15000
            }).then(async res => ({ status: res.status, ms: Math.round(performance.now() - start) }))
        )
    )
    const elapsed = Math.round(performance.now() - start)

    const responses = results
        .filter((r): r is PromiseFulfilledResult<{ status: number; ms: number }> => r.status === 'fulfilled')
        .map(r => r.value)

    const successes = responses.filter(r => r.status === 201).length
    const failures  = responses.filter(r => r.status !== 201).length

    // Verify DB
    const stockRows = await db.select().from(schema.outletStock).where(eq(schema.outletStock.id, TEST_STOCK_ROW_ID))
    const finalStock = stockRows[0]?.stock ?? '?'

    console.log(`  Elapsed:   ${elapsed}ms`)
    console.log(`  Successes: ${successes} (expected: 1)`)
    console.log(`  Failures:  ${failures}  (expected: ${N - 1})`)
    console.log(`  DB stock:  ${finalStock} (expected: 0)`)

    const raceDetected = successes > 1 || Number(finalStock) < 0
    if (raceDetected) {
        console.log(`  ${c.red}${c.bold}RACE DETECTED 🔥${c.reset}  Stock went to ${finalStock} with ${successes} successes`)
        return 'RACE DETECTED 🔥'
    }
    if (successes === 1 && Number(finalStock) === 0) {
        console.log(`  ${c.green}PASS ✅${c.reset}`)
        return 'PASS ✅'
    }
    console.log(`  ${c.red}FAIL ❌${c.reset}  Unexpected result`)
    return 'FAIL ❌'
}
```

- [ ] **Step 2: Wire into main() (temporary)**

Add a temporary `main()` to test just Phase 1:

```typescript
async function main() {
    console.log(`\n${c.bold}${c.orange}Studio Bersih — Race Condition Tester${c.reset}`)
    console.log(`${c.dim}Server: ${BASE_URL}${c.reset}`)
    await buildTokenPool()
    await setupTestData()
    await runStockRace()
    await cleanupTestData()
    await queryClient.end()
}
main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Run Phase 1**

```bash
cd server && bun run scripts/race-test.ts --phase stock --concurrency 10
```

Expected (endpoints not built yet):
```
Phase 1 — Stock Depletion Race
  Concurrency: 10 workers | Target stock: 1 unit
  SKIPPED ⚠️  /api/transactions not yet built
```

Once `/api/transactions` is live, expected passing output:
```
  Firing 10 concurrent requests...
  Elapsed:   312ms
  Successes: 1 (expected: 1)
  Failures:  9 (expected: 9)
  DB stock:  0 (expected: 0)
  PASS ✅
```

- [ ] **Step 4: Commit**

```bash
git add server/scripts/race-test.ts
git commit -m "feat(race-test): add Phase 1 — stock depletion race"
```

---

### Task 4: Phase 2 — Coupon double-redemption race

**Files:**
- Modify: `server/scripts/race-test.ts`

- [ ] **Step 1: Add `runCouponRace()` function**

Add after `runStockRace()`:

```typescript
// ── Phase 2: Coupon double-redemption race ────────────────────────────────
async function runCouponRace(): Promise<string> {
    phaseHeader(2, 'Coupon Double-Redemption Race')
    console.log(`  Concurrency: ${N} workers | Kupon: ${TEST_COUPON_KODE} (kuotaTotal = 1)`)

    // Probe
    const probe = await apiFetch('/api/transactions', {
        method: 'POST', body: {}, token: tokenPool[0].token, idempotencyKey: crypto.randomUUID()
    })
    if (probe.status === 404) {
        console.log(`  ${c.yellow}SKIPPED ⚠️${c.reset}  /api/transactions not yet built`)
        return 'SKIPPED'
    }

    // Cleanup any prior RACETEST coupon and its logs
    await db.delete(schema.kuponLog).where(eq(schema.kuponLog.kodeKupon, TEST_COUPON_KODE))
    await db.delete(schema.coupons).where(eq(schema.coupons.kode, TEST_COUPON_KODE))

    // Seed: reset stock to 100 (don't let stock be the constraint — test coupon quota)
    await db.update(schema.outletStock).set({ stock: 100 }).where(eq(schema.outletStock.id, TEST_STOCK_ROW_ID))

    // Seed: insert single-use coupon
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(schema.coupons).values({
        kode:            TEST_COUPON_KODE,
        nama:            'Race Test Coupon',
        kategori:        'Public',
        status:          'Active',
        tanggalMulai:    today,
        tanggalBerakhir: null,
        minTransaksi:    '0',
        kuotaTotal:      1,
        kuotaPerMember:  0,
        butuhOtorisasi:  false,
        codeType:        'Standard',
        effects:         JSON.stringify([{ type: 'fixed_discount', value: 5000 }])
    })
    console.log(`  Kupon '${TEST_COUPON_KODE}' seeded (kuotaTotal = 1).`)

    // Fire N concurrent transactions all using the same kupon code
    const payload = {
        outletId:        TEST_OUTLET_ID,
        memberId:        null,
        mode:            'retail',
        subtotal:        10000,
        kupon:           { kode: TEST_COUPON_KODE, nilaiPotongan: 5000, cartMutations: [], authNip: null },
        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
        total:           5000,
        notes:           '__RACE_TEST__',
        items:           [{ itemId: TEST_ITEM_ID, qty: 1, price: 10000, isFree: false }],
        paymentMethods:  [{ method: 'Tunai', amount: 5000 }]
    }

    console.log(`  Firing ${N} concurrent requests...`)
    const start = performance.now()
    const results = await Promise.allSettled(
        Array.from({ length: N }, (_, idx) =>
            apiFetch('/api/transactions', {
                method: 'POST', body: payload,
                token: roundRobin(idx).token, idempotencyKey: crypto.randomUUID(), timeoutMs: 15000
            }).then(async res => ({ status: res.status, ms: Math.round(performance.now() - start) }))
        )
    )
    const elapsed = Math.round(performance.now() - start)

    const responses = results
        .filter((r): r is PromiseFulfilledResult<{ status: number; ms: number }> => r.status === 'fulfilled')
        .map(r => r.value)

    const successes = responses.filter(r => r.status === 201).length

    // Verify: count kuponLog Applied rows
    const logRows = await db.select().from(schema.kuponLog)
        .where(eq(schema.kuponLog.kodeKupon, TEST_COUPON_KODE))
    const appliedCount = logRows.filter(row => row.logType === 'Applied').length

    console.log(`  Elapsed:    ${elapsed}ms`)
    console.log(`  Successes:  ${successes} (expected: 1)`)
    console.log(`  kuponLog Applied rows: ${appliedCount} (expected: 1)`)

    if (successes > 1 || appliedCount > 1) {
        console.log(`  ${c.red}${c.bold}RACE DETECTED 🔥${c.reset}  Coupon redeemed ${appliedCount}× (successes: ${successes})`)
        return 'RACE DETECTED 🔥'
    }
    if (successes === 1 && appliedCount === 1) {
        console.log(`  ${c.green}PASS ✅${c.reset}`)
        return 'PASS ✅'
    }
    console.log(`  ${c.red}FAIL ❌${c.reset}  Unexpected result`)
    return 'FAIL ❌'
}
```

- [ ] **Step 2: Add Phase 2 to temporary main()**

```typescript
async function main() {
    console.log(`\n${c.bold}${c.orange}Studio Bersih — Race Condition Tester${c.reset}`)
    console.log(`${c.dim}Server: ${BASE_URL}${c.reset}`)
    await buildTokenPool()
    await setupTestData()
    if (PHASE === 'all' || PHASE === 'stock')  await runStockRace()
    if (PHASE === 'all' || PHASE === 'coupon') await runCouponRace()
    await cleanupTestData()
    await queryClient.end()
}
main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Run Phase 2**

```bash
cd server && bun run scripts/race-test.ts --phase coupon
```

Expected (before endpoint exists):
```
Phase 2 — Coupon Double-Redemption Race
  SKIPPED ⚠️  /api/transactions not yet built
```

Once endpoint is live, expected:
```
  Kupon 'RACETEST' seeded (kuotaTotal = 1).
  Firing 10 concurrent requests...
  Elapsed:   289ms
  Successes: 1 (expected: 1)
  kuponLog Applied rows: 1 (expected: 1)
  PASS ✅
```

- [ ] **Step 4: Commit**

```bash
git add server/scripts/race-test.ts
git commit -m "feat(race-test): add Phase 2 — coupon double-redemption race"
```

---

### Task 5: Phase 3 — Kasir shift collision

**Files:**
- Modify: `server/scripts/race-test.ts`

- [ ] **Step 1: Add `runShiftRace()` function**

Add after `runCouponRace()`:

```typescript
// ── Phase 3: Kasir shift collision ────────────────────────────────────────
async function runShiftRace(): Promise<string> {
    phaseHeader(3, 'Kasir Shift Collision')
    console.log(`  Concurrency: ${N} workers | Outlet: kasir1 | Date: today`)

    // Probe
    const probe = await apiFetch('/api/kasir/open', {
        method: 'POST', body: {}, token: tokenPool[0].token
    })
    if (probe.status === 404) {
        console.log(`  ${c.yellow}SKIPPED ⚠️${c.reset}  /api/kasir/open not yet built`)
        return 'SKIPPED'
    }

    // Seed: delete any existing shift for kasir1's outlet + today
    const today = new Date().toISOString().slice(0, 10)
    await db.delete(schema.shifts).where(eq(schema.shifts.outletId, TEST_OUTLET_ID))

    // Fire N concurrent open-shift requests
    const payload = { outletId: TEST_OUTLET_ID, date: today, openingBalance: 0 }

    console.log(`  Firing ${N} concurrent requests...`)
    const start = performance.now()
    const results = await Promise.allSettled(
        Array.from({ length: N }, (_, idx) =>
            apiFetch('/api/kasir/open', {
                method: 'POST', body: payload,
                token: roundRobin(idx).token, timeoutMs: 15000
            }).then(async res => ({ status: res.status, ms: Math.round(performance.now() - start) }))
        )
    )
    const elapsed = Math.round(performance.now() - start)

    const responses = results
        .filter((r): r is PromiseFulfilledResult<{ status: number; ms: number }> => r.status === 'fulfilled')
        .map(r => r.value)

    const successes = responses.filter(r => r.status === 201).length

    // Verify: count shift rows for outlet + today
    const shiftRows = await db.select().from(schema.shifts)
        .where(eq(schema.shifts.outletId, TEST_OUTLET_ID))
    const shiftCount = shiftRows.length

    console.log(`  Elapsed:     ${elapsed}ms`)
    console.log(`  Successes:   ${successes} (expected: 1)`)
    console.log(`  Shifts in DB: ${shiftCount} (expected: 1)`)

    if (shiftCount > 1 || successes > 1) {
        console.log(`  ${c.red}${c.bold}RACE DETECTED 🔥${c.reset}  ${shiftCount} duplicate shifts created`)
        return 'RACE DETECTED 🔥'
    }
    if (successes === 1 && shiftCount === 1) {
        console.log(`  ${c.green}PASS ✅${c.reset}`)
        return 'PASS ✅'
    }
    console.log(`  ${c.red}FAIL ❌${c.reset}  Unexpected result`)
    return 'FAIL ❌'
}
```

- [ ] **Step 2: Add Phase 3 to temporary main()**

```typescript
async function main() {
    console.log(`\n${c.bold}${c.orange}Studio Bersih — Race Condition Tester${c.reset}`)
    console.log(`${c.dim}Server: ${BASE_URL}${c.reset}`)
    await buildTokenPool()
    await setupTestData()
    if (PHASE === 'all' || PHASE === 'stock')  await runStockRace()
    if (PHASE === 'all' || PHASE === 'coupon') await runCouponRace()
    if (PHASE === 'all' || PHASE === 'shift')  await runShiftRace()
    await cleanupTestData()
    await queryClient.end()
}
main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Run Phase 3**

```bash
cd server && bun run scripts/race-test.ts --phase shift
```

Expected (before endpoint exists):
```
Phase 3 — Kasir Shift Collision
  SKIPPED ⚠️  /api/kasir/open not yet built
```

- [ ] **Step 4: Commit**

```bash
git add server/scripts/race-test.ts
git commit -m "feat(race-test): add Phase 3 — kasir shift collision"
```

---

### Task 6: Phase 4 — Throughput benchmark

**Files:**
- Modify: `server/scripts/race-test.ts`

- [ ] **Step 1: Add latency percentile helper and `runBenchmark()` function**

Add after `runShiftRace()`:

```typescript
// ── Latency helpers ───────────────────────────────────────────────────────
function percentile(sorted: number[], p: number): number {
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0
}

function fmtMs(ms: number): string {
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`
}

interface BenchLevel { concurrency: number; rps: number; p50: number; p95: number; p99: number; errorRate: number }

// ── Phase 4: Throughput benchmark ─────────────────────────────────────────
async function runBenchmark(): Promise<string> {
    phaseHeader(4, 'Throughput Benchmark')

    // Probe
    const probe = await apiFetch('/api/transactions', {
        method: 'POST', body: {}, token: tokenPool[0].token, idempotencyKey: crypto.randomUUID()
    })
    if (probe.status === 404) {
        console.log(`  ${c.yellow}SKIPPED ⚠️${c.reset}  /api/transactions not yet built`)
        return 'SKIPPED'
    }

    // Ensure ample stock for the benchmark (won't be the bottleneck)
    await db.update(schema.outletStock).set({ stock: 999999 }).where(eq(schema.outletStock.id, TEST_STOCK_ROW_ID))

    const RAMP_LEVELS = [10, 50, 100, 200, 500]
    const STOP_ERROR_RATE = 0.05   // stop ramp at 5% errors
    const STOP_P99_MS     = 5000   // stop ramp at p99 > 5s

    const payload = {
        outletId: TEST_OUTLET_ID, memberId: null, mode: 'retail',
        subtotal: 10000, kupon: null,
        additionalCosts: { packaging: 0, transport: 0, modification: 0 },
        total: 10000, notes: '__RACE_TEST__',
        items: [{ itemId: TEST_ITEM_ID, qty: 1, price: 10000, isFree: false }],
        paymentMethods: [{ method: 'Tunai', amount: 10000 }]
    }

    const levels: BenchLevel[] = []
    let saturated = false

    console.log(`  Duration per level: ${DURATION}s`)
    console.log(`  Stop condition: error rate > 5% or p99 > 5s`)
    console.log(`\n  ${'Concurrency'.padEnd(14)}${'RPS'.padEnd(8)}${'p50'.padEnd(8)}${'p95'.padEnd(8)}${'p99'.padEnd(10)}Errors`)
    console.log(`  ${'─'.repeat(52)}`)

    for (const concurrency of RAMP_LEVELS) {
        if (saturated) break

        const latencies: number[] = []
        let errors = 0
        const deadline = Date.now() + DURATION * 1000
        const token    = tokenPool[0].token

        await Promise.all(
            Array.from({ length: concurrency }, async () => {
                while (Date.now() < deadline) {
                    const t0 = performance.now()
                    try {
                        const res = await apiFetch('/api/transactions', {
                            method: 'POST', body: payload,
                            token, idempotencyKey: crypto.randomUUID(), timeoutMs: 10000
                        })
                        if (!res.ok) errors++
                        // drain body to free connection
                        await res.text()
                    } catch { errors++ }
                    latencies.push(Math.round(performance.now() - t0))
                }
            })
        )

        latencies.sort((a, b) => a - b)
        const total = latencies.length
        const rps   = Math.round(total / DURATION)
        const p50   = percentile(latencies, 50)
        const p95   = percentile(latencies, 95)
        const p99   = percentile(latencies, 99)
        const errorRate = errors / total

        const satFlag = (errorRate > STOP_ERROR_RATE || p99 > STOP_P99_MS) ? `  ${c.yellow}← saturation${c.reset}` : ''
        console.log(`  ${String(concurrency).padEnd(14)}${String(rps).padEnd(8)}${fmtMs(p50).padEnd(8)}${fmtMs(p95).padEnd(8)}${fmtMs(p99).padEnd(10)}${(errorRate * 100).toFixed(1)}%${satFlag}`)

        levels.push({ concurrency, rps, p50, p95, p99, errorRate })

        if (errorRate > STOP_ERROR_RATE || p99 > STOP_P99_MS) saturated = true
    }

    const peak = levels.reduce((best, lvl) => lvl.rps > best.rps ? lvl : best, levels[0])
    const summary = `Peak ${peak.rps} RPS @ concurrency ${peak.concurrency}`
    console.log(`\n  ${c.bold}${c.green}${summary}${c.reset}`)

    return summary
}
```

- [ ] **Step 2: Verify Phase 4 compiles**

```bash
cd server && bun run scripts/race-test.ts --phase bench --duration 3
```

Expected (endpoint not yet built):
```
Phase 4 — Throughput Benchmark
  SKIPPED ⚠️  /api/transactions not yet built
```

Once endpoint is live, the table will print with real latency values.

- [ ] **Step 3: Commit**

```bash
git add server/scripts/race-test.ts
git commit -m "feat(race-test): add Phase 4 — throughput benchmark with RPS ramp"
```

---

### Task 7: Wire final main(), JSON output, full run, commit

**Files:**
- Modify: `server/scripts/race-test.ts`

- [ ] **Step 1: Replace temporary main() with the final version**

Replace the existing `main()` and its `main().catch(...)` call with:

```typescript
// ── Summary types ─────────────────────────────────────────────────────────
interface RunResults {
    server:    string
    timestamp: string
    phases: {
        stock?:  string
        coupon?: string
        shift?:  string
        bench?:  string
    }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${c.bold}${c.orange}┌─────────────────────────────────────────┐${c.reset}`)
    console.log(`${c.bold}${c.orange}│  Studio Bersih — Race Condition Tester  │${c.reset}`)
    console.log(`${c.bold}${c.orange}│  Server: ${BASE_URL.padEnd(31)}│${c.reset}`)
    console.log(`${c.bold}${c.orange}└─────────────────────────────────────────┘${c.reset}`)

    try {
        await buildTokenPool()
    } catch (err) {
        console.error(`\n${c.red}Auth failed: ${err}${c.reset}`)
        await queryClient.end()
        process.exit(1)
    }

    await setupTestData()

    const phases: RunResults['phases'] = {}

    if (PHASE === 'all' || PHASE === 'stock')  phases.stock  = await runStockRace()
    if (PHASE === 'all' || PHASE === 'coupon') phases.coupon = await runCouponRace()
    if (PHASE === 'all' || PHASE === 'shift')  phases.shift  = await runShiftRace()
    if (PHASE === 'all' || PHASE === 'bench')  phases.bench  = await runBenchmark()

    await cleanupTestData()

    // Summary
    console.log(`\n${c.bold}${'━'.repeat(45)}${c.reset}`)
    console.log(`${c.bold}  Studio Bersih — Race Test Summary${c.reset}`)
    for (const [key, value] of Object.entries(phases)) {
        console.log(`  ${key.padEnd(8)} ${value}`)
    }
    console.log(`${c.bold}${'━'.repeat(45)}${c.reset}\n`)

    if (JSON_MODE) {
        const report: RunResults = {
            server:    BASE_URL,
            timestamp: new Date().toISOString(),
            phases
        }
        process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    }

    await queryClient.end()
}

main().catch(async err => {
    console.error(`\n${c.red}Fatal: ${err}${c.reset}`)
    await queryClient.end()
    process.exit(1)
})
```

- [ ] **Step 2: Run all phases**

```bash
cd server && bun run scripts/race-test.ts
```

Expected (all endpoints not built yet):
```
┌─────────────────────────────────────────┐
│  Studio Bersih — Race Condition Tester  │
│  Server: http://localhost:3000           │
└─────────────────────────────────────────┘

Authenticating test users...
  ✓ admin
  ✓ manager
  ✓ kasir1
  ✓ kasir2

Seeding test data...
  ✓ Item seeded  (sku: RACE-001, id: xxxxxxxx...)
  ✓ Stock seeded (outlet: xxxxxxxx...)

Phase 1 — Stock Depletion Race
  SKIPPED ⚠️  /api/transactions not yet built

Phase 2 — Coupon Double-Redemption Race
  SKIPPED ⚠️  /api/transactions not yet built

Phase 3 — Kasir Shift Collision
  SKIPPED ⚠️  /api/kasir/open not yet built

Phase 4 — Throughput Benchmark
  SKIPPED ⚠️  /api/transactions not yet built

  Note: Test item kept (referenced by transactions)...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Studio Bersih — Race Test Summary
  stock    SKIPPED
  coupon   SKIPPED
  shift    SKIPPED
  bench    SKIPPED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- [ ] **Step 3: Test JSON output flag**

```bash
cd server && bun run scripts/race-test.ts --json 2>/dev/null | tail -20
```

Expected: valid JSON with `{ "server": "...", "timestamp": "...", "phases": { ... } }`

- [ ] **Step 4: Verify single-phase flags work**

```bash
cd server && bun run scripts/race-test.ts --phase stock --concurrency 20
cd server && bun run scripts/race-test.ts --phase bench --duration 3 --url http://localhost:3000
```

- [ ] **Step 5: Final commit**

```bash
git add server/scripts/race-test.ts
git commit -m "feat(race-test): wire all phases, JSON output, and final main()"
git push origin main
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task covering it |
|---|---|
| CLI flags: `--phase`, `--concurrency`, `--duration`, `--url`, `--json` | Task 1, Task 7 |
| Token pool — all 4 mock users | Task 1 |
| Unique `X-Idempotency-Key` per concurrent request | Task 3, 4, 6 |
| Phase 1: stock = 1, N concurrent, DB verify | Task 3 |
| Phase 2: kuotaTotal = 1, kuponLog count verify | Task 4 |
| Phase 3: shift collision, shifts table count verify | Task 5 |
| Phase 4: ramp levels, p50/p95/p99, stop on saturation | Task 6 |
| 404 probe → SKIPPED notice per phase | Tasks 3, 4, 5, 6 |
| `RACE DETECTED 🔥` verdict | Tasks 3, 4, 5 |
| JSON report output | Task 7 |
| Test data cleanup (coupon, shifts, item/stock best-effort) | Task 2 |
| Request timeout (10s per request in benchmark) | Task 1 (`apiFetch` `timeoutMs`) |

**Placeholder scan:** No TBDs. All code is complete and runnable.

**Type consistency:**
- `TokenEntry` defined in Task 1, used in Tasks 3–6 via `roundRobin()` ✓
- `BenchLevel` defined and used only in Task 6 ✓
- `RunResults` defined and used only in Task 7 ✓
- `TEST_ITEM_ID`, `TEST_OUTLET_ID`, `TEST_STOCK_ROW_ID`, `TEST_COUPON_KODE` defined in Task 2, used in Tasks 3–6 ✓
