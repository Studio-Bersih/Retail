import { describe, it, expect } from 'bun:test'
import { app } from '../index'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

describe('POST /api/auth/login', () => {
    it('returns 200 and token for valid credentials', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: BASE_HEADERS,
                body:    JSON.stringify({ username: 'admin', password: 'admin123' })
            })
        )
        const responseData = await response.json() as { token: string; user: { role: string } }

        expect(response.status).toBe(200)
        expect(responseData.token).toBeTruthy()
        expect(responseData.user.role).toBe('admin')
    })

    it('returns 401 for wrong password', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: BASE_HEADERS,
                body:    JSON.stringify({ username: 'admin', password: 'wrongpassword' })
            })
        )
        expect(response.status).toBe(401)
    })

    it('returns 426 when X-App-Version header is missing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ username: 'admin', password: 'admin123' })
            })
        )
        expect(response.status).toBe(426)
    })

    it('returns 422 when password field is missing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: BASE_HEADERS,
                body:    JSON.stringify({ username: 'admin' })
            })
        )
        expect(response.status).toBe(422)
    })

    it('returns 200 from health check', async () => {
        const response = await app.handle(
            new Request('http://localhost/health')
        )
        const responseData = await response.json() as { status: string }
        expect(response.status).toBe(200)
        expect(responseData.status).toBe('ok')
    })
})
