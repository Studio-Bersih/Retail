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
        const responseData = await response.json() as { data: Array<{ sku?: string; stock: number }> }
        const foundItem = responseData.data.find(item => item.sku === 'TEST-ITEM-001')
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
