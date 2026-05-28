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

if (isNaN(N) || N < 1)        { console.error('--concurrency must be a positive integer'); process.exit(1) }
if (isNaN(DURATION) || DURATION < 1) { console.error('--duration must be a positive integer'); process.exit(1) }

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

// ── Test data state ───────────────────────────────────────────────────────
let TEST_ITEM_ID      = ''
let TEST_OUTLET_ID    = ''   // kasir1's outletId (Outlet Utama)
let TEST_STOCK_ROW_ID = ''
const TEST_COUPON_KODE = 'RACETEST'

async function setupTestData(): Promise<void> {
    console.log(`\n${c.bold}Seeding test data...${c.reset}`)
    TEST_OUTLET_ID = tokenPool.find(t => t.username === 'kasir1')!.outletId

    // Clean up any leftover RACE-001 from a previous aborted run
    const existing = await db.select({ id: schema.items.id }).from(schema.items).where(eq(schema.items.sku, 'RACE-001'))
    if (existing.length > 0) {
        const existingId = existing[0].id
        await db.delete(schema.outletStock).where(eq(schema.outletStock.itemId, existingId))
        await db.delete(schema.items).where(eq(schema.items.id, existingId))
    }

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
