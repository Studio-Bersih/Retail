import { status } from 'elysia'
import type { JwtSession } from '../types'
import { getMembers, getMemberById } from '../models/members.model'
import { Errors } from '../utils/errors'

export async function getMembersHandler(context: {
	query: { query?: string; page?: string; limit?: string }
	session: JwtSession
}) {
	const page = Math.max(1, parseInt(context.query.page ?? '1', 10) || 1)
	const limit = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))
	return getMembers({ query: context.query.query, page, limit })
}

export async function getMemberByIdHandler(context: {
	params: { memberId: string }
	session: JwtSession
}) {
	const foundMember = await getMemberById(context.params.memberId)
	if (!foundMember) return status(404, { message: Errors.NOT_FOUND })
	return foundMember
}
