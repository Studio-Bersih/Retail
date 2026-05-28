import { describe, it, expect, beforeAll } from 'bun:test'
import { app } from '../index'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}

beforeAll(async () => {
    const loginResponse = await app.handle(
        new Request('http://localhost/api/auth/login', {
            method:  'POST',
            headers: BASE_HEADERS,
            body:    JSON.stringify({ username: 'admin', password: 'admin123' })
        })
    )
    const loginData = await loginResponse.json() as { token: string }
    authHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }
})

describe('GET /api/outlets', () => {
    it('returns 200 with an array of outlets', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/outlets', { headers: authHeaders })
        )
        const responseData = await response.json() as unknown[]
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
        expect(responseData.length).toBeGreaterThan(0)
    })
})

describe('GET /api/payment-methods', () => {
    it('returns 200 with an array of payment methods', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/payment-methods', { headers: authHeaders })
        )
        const responseData = await response.json() as unknown[]
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
        expect(responseData.length).toBeGreaterThan(0)
    })
})

describe('GET /api/transaction-types', () => {
    it('returns 200 with an array of transaction types', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/transaction-types', { headers: authHeaders })
        )
        const responseData = await response.json() as unknown[]
        expect(response.status).toBe(200)
        expect(Array.isArray(responseData)).toBe(true)
        expect(responseData.length).toBeGreaterThan(0)
    })
})
