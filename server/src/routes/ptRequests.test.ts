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
