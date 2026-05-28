import { status } from 'elysia'
import type { JwtSession } from '../types'
import { getStockMovements, createStockMovement } from '../models/stockMovements.model'
import { Errors } from '../utils/errors'

export async function getStockMovementsHandler(context: {
    query:   { itemId?: string; outletId?: string; from?: string; to?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const page  = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))

    return getStockMovements({
        itemId:   context.query.itemId,
        outletId: context.query.outletId,
        from:     context.query.from,
        to:       context.query.to,
        page,
        limit
    })
}

export async function createStockMovementHandler(context: {
    body:    { itemId: string; outletId: string; delta: number; note: string }
    session: JwtSession
}) {
    try {
        const savedMovement = await createStockMovement(context.body, context.session)
        return status(201, { message: 'Pergerakan stok berhasil dicatat.', id: savedMovement.id })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'OUTLET_STOCK_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}
