import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../index'
import { db } from '../db'
import { members } from '../db/schema'
import { eq } from 'drizzle-orm'

const BASE_HEADERS = {
	'Content-Type': 'application/json',
	'X-App-Version': '1.0.0',
	'X-Request-ID': crypto.randomUUID()
}

let authHeaders: Record<string, string> = {}
let testMemberId = ''

beforeAll(async () => {
	const loginResponse = await app.handle(
		new Request('http://localhost/api/auth/login', {
			method: 'POST',
			headers: BASE_HEADERS,
			body: JSON.stringify({ username: 'kasir1', password: 'kasir123' })
		})
	)
	const loginData = await loginResponse.json() as { token: string }
	authHeaders = { ...BASE_HEADERS, Authorization: `Bearer ${loginData.token}` }

	const [insertedMember] = await db.insert(members).values({
		name: 'Siti Rahayu Test',
		whatsapp: '081234567890',
		birthdate: '1990-05-15',
		address: 'Jl. Test No. 1',
		points: 100,
		isPremium: false
	}).returning()
	testMemberId = insertedMember.id
})

afterAll(async () => {
	await db.delete(members).where(eq(members.id, testMemberId))
})

describe('GET /api/members', () => {
	it('returns 200 with paginated data shape', async () => {
		const response = await app.handle(
			new Request('http://localhost/api/members', { headers: authHeaders })
		)
		const responseData = await response.json() as { data: unknown[]; meta: { page: number; total: number } }
		expect(response.status).toBe(200)
		expect(Array.isArray(responseData.data)).toBe(true)
		expect(typeof responseData.meta.page).toBe('number')
	})

	it('filters by name when query param is provided', async () => {
		const response = await app.handle(
			new Request('http://localhost/api/members?query=Siti+Rahayu+Test', { headers: authHeaders })
		)
		const responseData = await response.json() as { data: Array<{ name: string }> }
		expect(response.status).toBe(200)
		expect(responseData.data.some(member => member.name === 'Siti Rahayu Test')).toBe(true)
	})

	it('filters by whatsapp number', async () => {
		const response = await app.handle(
			new Request('http://localhost/api/members?query=081234567890', { headers: authHeaders })
		)
		const responseData = await response.json() as { data: Array<{ whatsapp: string }> }
		expect(response.status).toBe(200)
		expect(responseData.data.some(member => member.whatsapp === '081234567890')).toBe(true)
	})

	it('returns 401 without token', async () => {
		const response = await app.handle(
			new Request('http://localhost/api/members', { headers: BASE_HEADERS })
		)
		expect(response.status).toBe(401)
	})
})

describe('GET /api/members/:memberId', () => {
	it('returns 200 with member data for a valid id', async () => {
		const response = await app.handle(
			new Request(`http://localhost/api/members/${testMemberId}`, { headers: authHeaders })
		)
		const responseData = await response.json() as { id: string; name: string }
		expect(response.status).toBe(200)
		expect(responseData.id).toBe(testMemberId)
		expect(responseData.name).toBe('Siti Rahayu Test')
	})

	it('returns 404 for unknown member id', async () => {
		const response = await app.handle(
			new Request('http://localhost/api/members/nonexistent-id', { headers: authHeaders })
		)
		expect(response.status).toBe(404)
	})
})
