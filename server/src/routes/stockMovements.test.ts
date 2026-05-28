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
let testOutletId      = ''
let testItemId        = ''
let testStockRowId    = ''
let createdMovementId = ''

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
