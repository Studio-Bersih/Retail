import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { shifts, shiftCounts } from '../db/schema'
import { eq, and } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testOutletId  = ''
let testUserId    = ''
let openedShiftId = ''

const testDate = new Date().toISOString().slice(0, 10)

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

    // Clean up any leftover shift from a previous failed test run
    const [existingShift] = await db
        .select({ id: shifts.id })
        .from(shifts)
        .where(and(eq(shifts.outletId, testOutletId), eq(shifts.date, testDate)))
    if (existingShift) {
        await db.delete(shiftCounts).where(eq(shiftCounts.shiftId, existingShift.id))
        await db.delete(shifts).where(eq(shifts.id, existingShift.id))
    }
})

afterAll(async () => {
    if (openedShiftId) {
        await db.delete(shiftCounts).where(eq(shiftCounts.shiftId, openedShiftId))
        await db.delete(shifts).where(eq(shifts.id, openedShiftId))
    }
})

describe('GET /api/shifts/current', () => {
    it('returns 200 with null when no shift is open', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: authHeaders })
        )
        const responseData = await response.json() as { shift: null }
        expect(response.status).toBe(200)
        expect(responseData.shift).toBeNull()
    })

    it('returns 401 without token', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('POST /api/shifts/open', () => {
    it('returns 201 and creates the shift', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/open', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({ openingBalance: 500000, date: testDate })
            })
        )
        const responseData = await response.json() as { message: string; shift: { id: string; status: string } }
        expect(response.status).toBe(201)
        expect(responseData.message).toBe('Shift berhasil dibuka.')
        expect(responseData.shift.status).toBe('open')
        openedShiftId = responseData.shift.id
    })

    it('returns 200 with the open shift after opening', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: authHeaders })
        )
        const responseData = await response.json() as { shift: { id: string; status: string } }
        expect(response.status).toBe(200)
        expect(responseData.shift).not.toBeNull()
        expect(responseData.shift.id).toBe(openedShiftId)
        expect(responseData.shift.status).toBe('open')
    })

    it('returns 409 when a shift for this outlet+date already exists', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/open', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({ openingBalance: 0, date: testDate })
            })
        )
        expect(response.status).toBe(409)
    })
})

describe('POST /api/shifts/close', () => {
    it('returns 201 and closes the shift', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/close', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({
                    shiftId: openedShiftId,
                    counts:  [
                        { paymentMethod: 'Tunai',        actualAmount: 500000 },
                        { paymentMethod: 'QRIS',         actualAmount: 150000 },
                        { paymentMethod: 'Transfer Bank', actualAmount: 0 }
                    ]
                })
            })
        )
        const responseData = await response.json() as { message: string; shift: { status: string } }
        expect(response.status).toBe(201)
        expect(responseData.message).toBe('Shift berhasil ditutup.')
        expect(responseData.shift.status).toBe('closed')
    })

    it('returns 200 with null current shift after closing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/current', { headers: authHeaders })
        )
        const responseData = await response.json() as { shift: null }
        expect(response.status).toBe(200)
        expect(responseData.shift).toBeNull()
    })

    it('returns 404 when shiftId does not exist or is already closed', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/shifts/close', {
                method:  'POST',
                headers: authHeaders,
                body:    JSON.stringify({ shiftId: 'nonexistent-id', counts: [] })
            })
        )
        expect(response.status).toBe(404)
    })
})
