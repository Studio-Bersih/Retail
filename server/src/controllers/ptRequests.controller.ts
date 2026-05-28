import { status } from 'elysia'
import type { JwtSession } from '../types'
import {
    getPtRequests, getPtRequestById, createPtRequest, updatePtRequest, approvePtRequest, rejectPtRequest,
    type PtSnapshot
} from '../models/ptRequests.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function getPtRequestsHandler(context: {
    query:   { outletId?: string; status?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const page       = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit      = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))
    const validStatus = ['pending', 'approved', 'rejected']
    const ptStatus    = context.query.status && validStatus.includes(context.query.status)
        ? context.query.status as 'pending' | 'approved' | 'rejected'
        : undefined

    return getPtRequests({ outletId: context.query.outletId, status: ptStatus, page, limit })
}

export async function getPtRequestByIdHandler(context: {
    params:  { requestId: string }
    session: JwtSession
}) {
    const foundRequest = await getPtRequestById(context.params.requestId)
    if (!foundRequest) {
        return status(404, { message: Errors.NOT_FOUND })
    }
    return foundRequest
}

export async function createPtRequestHandler(context: {
    body: { transactionId: string; reason: string; newSnapshot: PtSnapshot }
    session: JwtSession
}) {
    try {
        const savedRequest = await createPtRequest(context.body, context.session)
        return status(201, { message: Messages.PT_SUBMITTED, id: savedRequest.id })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'TRANSACTION_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function updatePtRequestHandler(context: {
    params:  { requestId: string }
    body:    { reason: string; newSnapshot: PtSnapshot }
    session: JwtSession
}) {
    try {
        const updatedRequest = await updatePtRequest(context.params.requestId, context.body, context.session)
        return { message: Messages.PT_SUBMITTED, request: updatedRequest }
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'PT_REQUEST_NOT_FOUND_OR_NOT_PENDING') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function approvePtRequestHandler(context: {
    params:  { requestId: string }
    session: JwtSession
}) {
    if (context.session.role === 'cashier') {
        return status(403, { message: Errors.FORBIDDEN })
    }
    try {
        const approvedRequest = await approvePtRequest(context.params.requestId, context.session)
        return status(201, { message: Messages.PT_APPROVED, request: approvedRequest })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'PT_REQUEST_NOT_FOUND_OR_NOT_PENDING') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function rejectPtRequestHandler(context: {
    params:  { requestId: string }
    session: JwtSession
}) {
    if (context.session.role === 'cashier') {
        return status(403, { message: Errors.FORBIDDEN })
    }
    try {
        const rejectedRequest = await rejectPtRequest(context.params.requestId, context.session)
        return status(201, { message: Messages.PT_REJECTED, request: rejectedRequest })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'PT_REQUEST_NOT_FOUND_OR_NOT_PENDING') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}
