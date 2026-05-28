import { status } from 'elysia'
import type { JwtSession } from '../types'
import { getCurrentShift, openShift, closeShift } from '../models/kasirHarian.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function getCurrentShiftHandler(context: {
    session: JwtSession
}) {
    const foundShift = await getCurrentShift(context.session.outletId)
    return { shift: foundShift }
}

export async function openShiftHandler(context: {
    body:    { openingBalance: number; date: string }
    session: JwtSession
}) {
    try {
        const newShift = await openShift({
            outletId:       context.session.outletId,
            userId:         context.session.userId,
            date:           context.body.date,
            openingBalance: context.body.openingBalance
        })
        return status(201, { message: Messages.SHIFT_OPENED, shift: newShift })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'SHIFT_ALREADY_EXISTS') {
            return status(409, { message: 'Shift untuk tanggal ini sudah ada.' })
        }
        throw caughtError
    }
}

export async function closeShiftHandler(context: {
    body:    { shiftId: string; counts: Array<{ paymentMethod: string; actualAmount: number }> }
    session: JwtSession
}) {
    try {
        const closedShift = await closeShift(context.body.shiftId, context.body.counts)
        return status(201, { message: Messages.SHIFT_CLOSED, shift: closedShift })
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'SHIFT_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}
