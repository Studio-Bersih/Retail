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

describe('PUT /api/coupons/:kode', () => {
    it('returns 200 and updates coupon fields', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}`, {
                method: 'PUT', headers: managerHeaders,
                body: JSON.stringify({
                    nama:            'Test Kupon Updated',
                    kategori:        'Public',
                    kodeMember:      null,
                    outletIds:       null,
                    status:          'Active',
                    tanggalMulai:    '2026-01-01',
                    tanggalBerakhir: null,
                    minTransaksi:    50000,
                    kuotaTotal:      100,
                    kuotaPerMember:  1,
                    butuhOtorisasi:  false,
                    syaratKetentuan: 'Min Rp50.000',
                    effects: {
                        fixedDiscount:      15000,
                        percentageDiscount: 0,
                        cartMutations:      []
                    },
                    codeType: 'Standard'
                })
            })
        )
        const responseData = await response.json() as { message: string; coupon: { nama: string } }
        expect(response.status).toBe(200)
        expect(responseData.message).toBe('Kupon berhasil diperbarui.')
        expect(responseData.coupon.nama).toBe('Test Kupon Updated')
    })

    it('returns 403 for cashier', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}`, {
                method: 'PUT', headers: cashierHeaders,
                body: JSON.stringify({
                    nama: 'x', kategori: 'Public', kodeMember: null, outletIds: null,
                    status: 'Active', tanggalMulai: '2026-01-01', tanggalBerakhir: null,
                    minTransaksi: 0, kuotaTotal: 0, kuotaPerMember: 0, butuhOtorisasi: false,
                    syaratKetentuan: null,
                    effects: { fixedDiscount: 0, percentageDiscount: 0, cartMutations: [] },
                    codeType: 'Standard'
                })
            })
        )
        expect(response.status).toBe(403)
    })

    it('returns 404 for unknown kode', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons/NONEXISTENT/status', {
                method: 'PATCH', headers: managerHeaders
            })
        )
        expect(response.status).toBe(404)
    })
})

describe('PATCH /api/coupons/:kode/status', () => {
    it('returns 200 and toggles status from Active to Inactive', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}/status`, {
                method: 'PATCH', headers: managerHeaders
            })
        )
        const responseData = await response.json() as { message: string; coupon: { status: string } }
        expect(response.status).toBe(200)
        expect(responseData.message).toBe('Status kupon berhasil diubah.')
        expect(responseData.coupon.status).toBe('Inactive')
    })

    it('toggles back to Active on second call', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}/status`, {
                method: 'PATCH', headers: managerHeaders
            })
        )
        const responseData = await response.json() as { coupon: { status: string } }
        expect(response.status).toBe(200)
        expect(responseData.coupon.status).toBe('Active')
    })

    it('returns 403 for cashier', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}/status`, {
                method: 'PATCH', headers: cashierHeaders
            })
        )
        expect(response.status).toBe(403)
    })
})

describe('POST /api/coupons/:kode/validate', () => {
    it('returns 200 with eligible=true for a valid coupon and sufficient cart total', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}/validate`, {
                method: 'POST', headers: cashierHeaders,
                body: JSON.stringify({
                    cartTotal: 100000,
                    memberId:  null,
                    outletId:  testOutletId
                })
            })
        )
        const responseData = await response.json() as { eligible: boolean; coupon: { kode: string }; usageHistory: { totalUses: number } }
        expect(response.status).toBe(200)
        expect(responseData.eligible).toBe(true)
        expect(responseData.coupon.kode).toBe(createdKode)
        expect(typeof responseData.usageHistory.totalUses).toBe('number')
    })

    it('returns eligible=false with reason=MIN_TRANSAKSI_NOT_MET when cart is too small', async () => {
        const response = await app.handle(
            new Request(`http://localhost/api/coupons/${createdKode}/validate`, {
                method: 'POST', headers: cashierHeaders,
                body: JSON.stringify({
                    cartTotal: 10000,
                    memberId:  null,
                    outletId:  testOutletId
                })
            })
        )
        const responseData = await response.json() as { eligible: boolean; reason: string; delta: number }
        expect(response.status).toBe(200)
        expect(responseData.eligible).toBe(false)
        expect(responseData.reason).toBe('MIN_TRANSAKSI_NOT_MET')
        expect(responseData.delta).toBe(40000)
    })

    it('returns 404 for unknown kode', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/coupons/NONEXISTENT-KODE/validate', {
                method: 'POST', headers: cashierHeaders,
                body: JSON.stringify({ cartTotal: 100000, memberId: null, outletId: testOutletId })
            })
        )
        expect(response.status).toBe(404)
    })
})
