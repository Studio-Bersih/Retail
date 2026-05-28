import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { items, outletStock, orders, orderItems, stockMovements, auditLog } from '../db/schema'
import { eq, and } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testOutletId     = ''
let testUserId       = ''
let testItemId       = ''
let testStockRowId   = ''
let createdOrderId   = ''
let completeOrderId  = ''

const testDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

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
        sku:         'ORDER-TEST-001',
        name:        'Test Item Pesanan',
        category:    'Test',
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
        stock:       100,
        preAdjDelta: 0
    }).returning()
    testStockRowId = insertedStock.id
})

afterAll(async () => {
    if (completeOrderId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, completeOrderId))
        await db.delete(stockMovements).where(eq(stockMovements.sourceId, completeOrderId))
        await db.delete(orderItems).where(eq(orderItems.orderId, completeOrderId))
        await db.delete(orders).where(eq(orders.id, completeOrderId))
    }
    if (createdOrderId) {
        await db.delete(auditLog).where(eq(auditLog.entityId, createdOrderId))
        await db.delete(orderItems).where(eq(orderItems.orderId, createdOrderId))
        await db.delete(orders).where(eq(orders.id, createdOrderId))
    }
    await db.delete(outletStock).where(eq(outletStock.id, testStockRowId))
    await db.delete(items).where(eq(items.id, testItemId))
})

describe('POST /api/orders', () => {
    it('returns 201 and creates the order with status active', async () => {
        const idempotencyKey = crypto.randomUUID()
        const response = await app.handle(
            new Request('http://localhost/api/orders', {
                method:  'POST',
                headers: { ...authHeaders, 'X-Idempotency-Key': idempotencyKey },
                body: JSON.stringify({
                    memberId:        null,
                    items:           [{ id: testItemId, qty: 3, price: 15000, isFree: false }],
                    subtotal:        45000,
                    kupon:           null,
                    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                    total:           45000,
                    deposit:         20000,
                    remaining:       25000,
                    notes:           'Test order',
                    dueDate:         testDueDate
                })
            })
        )
        const responseData = await response.json() as { message: string; id: string }
        expect(response.status).toBe(201)
        expect(responseData.id).toBeTruthy()
        expect(responseData.message).toBe('Pesanan berhasil disimpan.')
        createdOrderId = responseData.id
    })

    it('does NOT deduct stock at order creation', async () => {
        const [stockRow] = await db.select().from(outletStock).where(eq(outletStock.id, testStockRowId))
        expect(stockRow.stock).toBe(100)
    })

    it('returns same response for a duplicate idempotency key', async () => {
        const idempotencyKey = crypto.randomUUID()
        const makeRequest = () => app.handle(
            new Request('http://localhost/api/orders', {
                method:  'POST',
                headers: { ...authHeaders, 'X-Idempotency-Key': idempotencyKey },
                body: JSON.stringify({
                    memberId:        null,
                    items:           [{ id: testItemId, qty: 1, price: 15000, isFree: false }],
                    subtotal:        15000,
                    kupon:           null,
                    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                    total:           15000,
                    deposit:         0,
                    remaining:       15000,
                    notes:           'idempotency test',
                    dueDate:         null
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

        const dupId = firstData.id
        await db.delete(auditLog).where(eq(auditLog.entityId, dupId))
        await db.delete(orderItems).where(eq(orderItems.orderId, dupId))
        await db.delete(orders).where(eq(orders.id, dupId))
    })

    it('returns 400 when X-Idempotency-Key header is missing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/orders', {
                method:  'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    memberId: null, items: [], subtotal: 0, kupon: null,
                    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                    total: 0, deposit: 0, remaining: 0, notes: '', dueDate: null
                })
            })
        )
        expect(response.status).toBe(400)
    })

    it('returns 401 without auth token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/orders', {
                method:  'POST',
                headers: { ...BASE_HEADERS, 'X-Idempotency-Key': crypto.randomUUID() },
                body: JSON.stringify({
                    memberId: null, items: [], subtotal: 0, kupon: null,
                    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                    total: 0, deposit: 0, remaining: 0, notes: '', dueDate: null
                })
            })
        )
        expect(response.status).toBe(401)
    })
})
