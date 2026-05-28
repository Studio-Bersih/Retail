import { status } from 'elysia'
import type { JwtSession } from '../types'
import {
    saveOrder, getOrders, getOrderById, updateOrder, completeOrder,
    type NewOrderPayload, type UpdateOrderPayload
} from '../models/orders.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function createOrderHandler(context: {
    body:    NewOrderPayload
    session: JwtSession
    headers: Record<string, string | undefined>
}) {
    const requestId  = context.headers['x-request-id'] ?? ''
    const savedOrder = await saveOrder(context.body, context.session, requestId)
    return status(201, { message: Messages.ORDER_SAVED, id: savedOrder.id })
}

export async function getOrdersHandler(context: {
    query:   { outletId?: string; status?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const outletId    = context.query.outletId ?? context.session.outletId
    const page        = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit       = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))
    const validStatus = ['active', 'completed', 'cancelled']
    const orderStatus = context.query.status && validStatus.includes(context.query.status)
        ? context.query.status as 'active' | 'completed' | 'cancelled'
        : undefined

    return getOrders({ outletId, status: orderStatus, page, limit })
}

export async function getOrderByIdHandler(context: {
    params:  { orderId: string }
    session: JwtSession
}) {
    const foundOrder = await getOrderById(context.params.orderId)
    if (!foundOrder) return status(404, { message: Errors.NOT_FOUND })
    return foundOrder
}

export async function updateOrderHandler(context: {
    params:  { orderId: string }
    body:    UpdateOrderPayload
    session: JwtSession
}) {
    try {
        const updatedOrder = await updateOrder(context.params.orderId, context.body, context.session)
        return { message: Messages.ORDER_SAVED, order: updatedOrder }
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'ORDER_NOT_FOUND_OR_NOT_ACTIVE') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function completeOrderHandler(context: {
    params:  { orderId: string }
    session: JwtSession
}) {
    try {
        const completedOrder = await completeOrder(context.params.orderId, context.session)
        return status(201, { message: Messages.ORDER_COMPLETED, order: completedOrder })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'ORDER_NOT_FOUND_OR_NOT_ACTIVE') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        if (caughtError instanceof Error && caughtError.message === 'STOCK_INSUFFICIENT') {
            return status(409, { message: Errors.STOCK_INSUFFICIENT })
        }
        throw caughtError
    }
}
