import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { coupons, auditLog } from '../db/schema'
import { eq } from 'drizzle-orm'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let cashierHeaders:  Record<string, string> = {}
let managerHeaders:  Record<string, string> = {}
let testOutletId     = ''
let createdKode      = 'TEST-KUPON-001'

const testCouponBody = {
    kode:            createdKode,
    nama:            'Test Kupon Satu',
    kategori:        'Public',
    kodeMember:      null,
    outletIds:       null,
    status:          'Active',
    tanggalMulai:    '2026-01-01',
    tanggalBerakhir: null,
    minTransaksi:    0,
    kuotaTotal:      0,
    kuotaPerMember:  0,
    butuhOtorisasi:  false,
    syaratKetentuan: null,
    effects: {
        fixedDiscount:      10000,
        percentageDiscount: 0,
        cartMutations:      []
    },
    codeType: 'Standard'
}

beforeAll(async () => {
    const cashierLogin = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method: 'POST', headers: BASE_HEADERS,
            body: JSON.stringify({ username: 'kasir1', password: 'kasir123' })
        })
    )
    const cashierData = await cashierLogin.json() as { token: string; user: { outletId: string } }
    cashierHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${cashierData.token}` }
    testOutletId   = cashierData.user.outletId

    const managerLogin = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method: 'POST', headers: BASE_HEADERS,
            body: JSON.stringify({ username: 'manager', password: 'manager123' })
        })
    )
    const managerData = await managerLogin.json() as { token: string }
    managerHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${managerData.token}` }
})

afterAll(async () => {
    await db.delete(auditLog).where(eq(auditLog.entityId, createdKode))
    await db.delete(coupons).where(eq(coupons.kode, createdKode))
})

describe('POST /api/coupons', () => {
    it('returns 201 and creates a coupon', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons', {
                method: 'POST', headers: managerHeaders,
                body: JSON.stringify(testCouponBody)
            })
        )
        const responseData = await response.json() as { message: string; kode: string }
        expect(response.status).toBe(201)
        expect(responseData.kode).toBe(createdKode)
        expect(responseData.message).toBe('Kupon berhasil dibuat.')
    })

    it('returns 403 for cashier', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons', {
                method: 'POST', headers: cashierHeaders,
                body: JSON.stringify({ ...testCouponBody, kode: 'TEST-KUPON-002' })
            })
        )
        expect(response.status).toBe(403)
    })

    it('returns 401 without auth', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons', {
                method: 'POST', headers: BASE_HEADERS,
                body: JSON.stringify(testCouponBody)
            })
        )
        expect(response.status).toBe(401)
    })
})

describe('GET /api/coupons', () => {
    it('returns 200 with paginated data shape', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons', { headers: cashierHeaders })
        )
        const responseData = await response.json() as { data: unknown[]; meta: { page: number; total: number } }
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData.data)).toBe(true)
        expect(typeof responseData.meta.page).toBe('number')
        expect(typeof responseData.meta.total).toBe('number')
    })

    it('filters by search term', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons?search=TEST-KUPON`, { headers: cashierHeaders })
        )
        const responseData = await response.json() as { data: Array<{ kode: string }> }
        expect(response.status).toBe(200)
        const found = responseData.data.find(coupon => coupon.kode === createdKode)
        expect(found).toBeDefined()
    })

    it('returns 401 without auth', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons', { headers: BASE_HEADERS })
        )
        expect(response.status).toBe(401)
    })
})

describe('GET /api/coupons/:kode', () => {
    it('returns 200 with coupon detail', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}`, { headers: cashierHeaders })
        )
        const responseData = await response.json() as { kode: string; nama: string; status: string }
        expect(response.status).toBe(200)
        expect(responseData.kode).toBe(createdKode)
        expect(responseData.nama).toBe('Test Kupon Satu')
        expect(responseData.status).toBe('Active')
    })

    it('returns 404 for unknown kode', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons/NONEXISTENT-KODE', { headers: cashierHeaders })
        )
        expect(response.status).toBe(404)
    })
})
