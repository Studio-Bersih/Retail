import { db } from '../db'
import { members } from '../db/schema'
import { eq, ilike, or, sql } from 'drizzle-orm'

export async function getMembers(params: {
	query?: string
	page: number
	limit: number
}) {
	const offset = (params.page - 1) * params.limit

	const searchCondition = params.query
		? or(
			ilike(members.name, `%${params.query}%`),
			ilike(members.whatsapp, `%${params.query}%`)
		)
		: undefined

	const [countResult] = await db
		.select({ count: sql<number>`count(*)` })
		.from(members)
		.where(searchCondition)

	const total = Number(countResult?.count ?? 0)
	const totalPages = Math.max(1, Math.ceil(total / params.limit))

	const rows = await db
		.select()
		.from(members)
		.where(searchCondition)
		.limit(params.limit)
		.offset(offset)

	return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getMemberById(memberId: string) {
	const [foundMember] = await db
		.select()
		.from(members)
		.where(eq(members.id, memberId))
	return foundMember ?? null
}
