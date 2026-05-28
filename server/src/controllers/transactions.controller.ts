import { status } from 'elysia'
import type { JwtSession } from '../types'
import { saveTransaction, getTransactions, getTransactionById, type NewTransactionPayload } from '../models/transactions.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function createTransactionHandler(context: {
    body:    NewTransactionPayload
    session: JwtSession
    headers: Record<string, string | undefined>
}) {
    try {
        const requestId        = context.headers['x-request-id'] ?? ''
        const savedTransaction = await saveTransaction(context.body, context.session, requestId)
        return status(201, { message: Messages.TRANSACTION_SAVED, id: savedTransaction.id })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'STOCK_INSUFFICIENT') {
            return status(409, { message: Errors.STOCK_INSUFFICIENT })
        }
        if (caughtError instanceof Error && caughtError.message === 'COUPON_EXHAUSTED') {
            return status(409, { message: Errors.COUPON_EXHAUSTED })
        }
        throw caughtError
    }
}

export async function getTransactionsHandler(context: {
    query:   { outletId?: string; from?: string; to?: string; userId?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const outletId = context.query.outletId ?? context.session.outletId
    const page     = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit    = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))

    return getTransactions({
        outletId,
        from:   context.query.from,
        to:     context.query.to,
        userId: context.query.userId,
        page,
        limit
    })
}

export async function getTransactionByIdHandler(context: {
    params:  { transactionId: string }
    session: JwtSession
}) {
    const foundTransaction = await getTransactionById(context.params.transactionId)
    if (!foundTransaction) {
        return status(404, { message: Errors.NOT_FOUND })
    }
    return foundTransaction
}
