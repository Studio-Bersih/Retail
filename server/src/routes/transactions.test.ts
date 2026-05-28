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

    it('decrements stock for free items and saves isFree flag — total stays 0', async () => {
        const [before] = await db.select({ stock: outletStock.stock }).from(outletStock).where(eq(outletStock.id, testStockRowId))

        const idempotencyKey = crypto.randomUUID()
        const response = await app.handle(
            new Request('http://localhost/api/transactions', {
                method:  'POST',
                headers: { ...authHeaders, 'X-Idempotency-Key': idempotencyKey },
                body: JSON.stringify({
                    memberId:        null,
                    mode:            'retail',
                    items:           [{ id: testItemId, qty: 2, price: 0, isFree: true }],
                    subtotal:        0,
                    kupon:           null,
                    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                    total:           0,
                    notes:           'free item stock test',
                    paymentMethods:  [{ method: 'Tunai', amount: 0 }]
                })
            })
        )
        const data = await response.json() as { id: string }
        expect(response.status).toBe(201)

        const [after] = await db.select({ stock: outletStock.stock }).from(outletStock).where(eq(outletStock.id, testStockRowId))
        expect(after.stock).toBe(before.stock - 2)

        const [savedItem] = await db.select().from(transactionItems).where(and(eq(transactionItems.transactionId, data.id), eq(transactionItems.itemId, testItemId)))
        expect(savedItem.isFree).toBe(true)
        expect(Number(savedItem.price)).toBe(0)

        await db.delete(auditLog).where(eq(auditLog.entityId, data.id))
        await db.delete(stockMovements).where(eq(stockMovements.sourceId, data.id))
        await db.delete(transactionPayments).where(eq(transactionPayments.transactionId, data.id))
        await db.delete(transactionItems).where(eq(transactionItems.transactionId, data.id))
        await db.delete(transactions).where(eq(transactions.id, data.id))
        await db.update(outletStock).set({ stock: before.stock }).where(eq(outletStock.id, testStockRowId))
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
