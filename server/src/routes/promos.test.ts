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
        name:           'Test Promo Diskon',
        code:           'TESTPROMO001',
        discountType:   'percentage',
        discountValue:  '10',
        minTransaction: '50000',
        startDate:      today,
        endDate:        tomorrow,
        isActive:       true
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
