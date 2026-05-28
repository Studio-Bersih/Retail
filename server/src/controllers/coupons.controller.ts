import { status } from 'elysia'
import type { JwtSession } from '../types'
import {
    getCoupons, getCouponByKode, createCoupon, updateCoupon, toggleCouponStatus, validateCoupon,
    type CouponParams
} from '../models/coupons.model'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'

export async function getCouponsHandler(context: {
    query:   { search?: string; status?: string; page?: string; limit?: string }
    session: JwtSession
}) {
    const page         = Math.max(1, parseInt(context.query.page  ?? '1',  10) || 1)
    const limit        = Math.min(100, Math.max(1, parseInt(context.query.limit ?? '25', 10) || 25))
    const validStatus  = ['Active', 'Inactive']
    const couponStatus = context.query.status && validStatus.includes(context.query.status)
        ? context.query.status as 'Active' | 'Inactive'
        : undefined

    return getCoupons({ search: context.query.search, status: couponStatus, page, limit })
}

export async function getCouponByKodeHandler(context: {
    params:  { kode: string }
    session: JwtSession
}) {
    const foundCoupon = await getCouponByKode(context.params.kode)
    if (!foundCoupon) {
        return status(404, { message: Errors.NOT_FOUND })
    }
    return foundCoupon
}

export async function createCouponHandler(context: {
    body:    CouponParams
    session: JwtSession
}) {
    if (context.session.role === 'cashier') {
        return status(403, { message: Errors.FORBIDDEN })
    }
    const savedCoupon = await createCoupon(context.body, context.session)
    return status(201, { message: Messages.COUPON_CREATED, kode: savedCoupon.kode })
}

export async function updateCouponHandler(context: {
    params:  { kode: string }
    body:    Omit<CouponParams, 'kode'>
    session: JwtSession
}) {
    if (context.session.role === 'cashier') {
        return status(403, { message: Errors.FORBIDDEN })
    }
    try {
        const updatedCoupon = await updateCoupon(context.params.kode, context.body, context.session)
        return { message: Messages.COUPON_UPDATED, coupon: updatedCoupon }
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'COUPON_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function toggleCouponStatusHandler(context: {
    params:  { kode: string }
    session: JwtSession
}) {
    if (context.session.role === 'cashier') {
        return status(403, { message: Errors.FORBIDDEN })
    }
    try {
        const updatedCoupon = await toggleCouponStatus(context.params.kode, context.session)
        return { message: Messages.COUPON_STATUS_UPDATED, coupon: updatedCoupon }
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'COUPON_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}

export async function validateCouponHandler(context: {
    params:  { kode: string }
    body:    { cartTotal: number; memberId: string | null; outletId: string }
    session: JwtSession
}) {
    try {
        return await validateCoupon(context.params.kode, context.body)
    } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.message === 'COUPON_NOT_FOUND') {
            return status(404, { message: Errors.NOT_FOUND })
        }
        throw caughtError
    }
}
