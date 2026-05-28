import { status } from 'elysia'
import type { JwtSession } from '../types'
import { getItems, getItemById, getItemStock } from '../models/items.model'
import { Errors } from '../utils/errors'

export async function getItemsHandler(context: {
    query:   { outletId?: string; search?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const outletId = context.query.outletId ?? context.session.outletId
    const page     = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit    = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))

    return getItems({ outletId, search: context.query.search, page, limit })
}

export async function getItemByIdHandler(context: {
    params:  { itemId: string }
    session: JwtSession
}) {
    const foundItem = await getItemById(context.params.itemId)
    if (!foundItem) return status(404, { message: Errors.NOT_FOUND })
    return foundItem
}

export async function getItemStockHandler(context: {
    params:  { itemId: string }
    session: JwtSession
}) {
    return getItemStock(context.params.itemId)
}
