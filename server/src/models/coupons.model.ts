import { db } from '../db'
import { coupons, kuponLog, auditLog } from '../db/schema'
import { eq, and, ilike, or, desc, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export interface CouponEffects {
    fixedDiscount:      number
    percentageDiscount: number
    cartMutations:      Array<{
        type:          'AddItem' | 'RemoveItem' | 'ModifyQty'
        itemId:        string
        qty:           number
        isFree:        boolean
        priceOverride: number
    }>
}

export interface CouponParams {
    kode:            string
    nama:            string
    kategori:        'Public' | 'Member-only' | 'Personal' | 'Staff/Internal'
    kodeMember:      string | null
    outletIds:       string[] | null
    status:          'Active' | 'Inactive'
    tanggalMulai:    string
    tanggalBerakhir: string | null
    minTransaksi:    number
    kuotaTotal:      number
    kuotaPerMember:  number
    butuhOtorisasi:  boolean
    syaratKetentuan: string | null
    effects:         CouponEffects
    codeType:        'Standard' | 'Batch' | 'PersonalAuto'
}

export async function getCoupons(params: {
    search?:  string
    status?:  'Active' | 'Inactive'
    page:     number
    limit:    number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        params.search  ? or(ilike(coupons.kode, `%${params.search}%`), ilike(coupons.nama, `%${params.search}%`)) : undefined,
        params.status  ? eq(coupons.status, params.status) : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(coupons)
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select()
        .from(coupons)
        .where(whereConditions)
        .orderBy(desc(coupons.createdAt))
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getCouponByKode(kode: string) {
    const [foundCoupon] = await db.select().from(coupons).where(eq(coupons.kode, kode))
    return foundCoupon ?? null
}

export async function createCoupon(params: CouponParams, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [savedCoupon] = await databaseTransaction
            .insert(coupons)
            .values({
                kode:            params.kode,
                nama:            params.nama,
                kategori:        params.kategori,
                kodeMember:      params.kodeMember,
                outletIds:       params.outletIds,
                status:          params.status,
                tanggalMulai:    params.tanggalMulai,
                tanggalBerakhir: params.tanggalBerakhir,
                minTransaksi:    String(params.minTransaksi),
                kuotaTotal:      params.kuotaTotal,
                kuotaPerMember:  params.kuotaPerMember,
                butuhOtorisasi:  params.butuhOtorisasi,
                syaratKetentuan: params.syaratKetentuan,
                effects:         params.effects,
                codeType:        params.codeType
            })
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'coupon',
            entityId:   savedCoupon.kode,
            newValue:   params,
            requestId:  null
        })

        return savedCoupon
    })
}

export async function updateCoupon(kode: string, params: Omit<CouponParams, 'kode'>, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingCoupon] = await databaseTransaction
            .select()
            .from(coupons)
            .where(eq(coupons.kode, kode))

        if (!existingCoupon) throw new Error('COUPON_NOT_FOUND')

        const [updatedCoupon] = await databaseTransaction
            .update(coupons)
            .set({
                nama:            params.nama,
                kategori:        params.kategori,
                kodeMember:      params.kodeMember,
                outletIds:       params.outletIds,
                status:          params.status,
                tanggalMulai:    params.tanggalMulai,
                tanggalBerakhir: params.tanggalBerakhir,
                minTransaksi:    String(params.minTransaksi),
                kuotaTotal:      params.kuotaTotal,
                kuotaPerMember:  params.kuotaPerMember,
                butuhOtorisasi:  params.butuhOtorisasi,
                syaratKetentuan: params.syaratKetentuan,
                effects:         params.effects,
                codeType:        params.codeType
            })
            .where(eq(coupons.kode, kode))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'update',
            entityType: 'coupon',
            entityId:   kode,
            oldValue:   existingCoupon,
            newValue:   params,
            requestId:  null
        })

        return updatedCoupon
    })
}

export async function toggleCouponStatus(kode: string, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingCoupon] = await databaseTransaction
            .select()
            .from(coupons)
            .where(eq(coupons.kode, kode))

        if (!existingCoupon) throw new Error('COUPON_NOT_FOUND')

        const newStatus = existingCoupon.status === 'Active' ? 'Inactive' : 'Active'

        const [updatedCoupon] = await databaseTransaction
            .update(coupons)
            .set({ status: newStatus })
            .where(eq(coupons.kode, kode))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'update',
            entityType: 'coupon',
            entityId:   kode,
            oldValue:   { status: existingCoupon.status },
            newValue:   { status: newStatus },
            requestId:  null
        })

        return updatedCoupon
    })
}

export async function validateCoupon(kode: string, params: {
    cartTotal: number
    memberId:  string | null
    outletId:  string
}) {
    const [foundCoupon] = await db.select().from(coupons).where(eq(coupons.kode, kode))
    if (!foundCoupon) throw new Error('COUPON_NOT_FOUND')

    const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(kuponLog)
        .where(and(eq(kuponLog.kodeKupon, kode), eq(kuponLog.logType, 'Applied')))
    const totalUses = Number(totalResult?.count ?? 0)

    let memberUses = 0
    if (params.memberId) {
        const [memberResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(kuponLog)
            .where(and(
                eq(kuponLog.kodeKupon,  kode),
                eq(kuponLog.kodeMember, params.memberId),
                eq(kuponLog.logType,    'Applied')
            ))
        memberUses = Number(memberResult?.count ?? 0)
    }

    const usageHistory = { totalUses, memberUses }
    const now          = new Date()

    if (foundCoupon.status !== 'Active') {
        return { coupon: foundCoupon, eligible: false as const, reason: 'INACTIVE', usageHistory }
    }

    if (now < new Date(foundCoupon.tanggalMulai)) {
        return { coupon: foundCoupon, eligible: false as const, reason: 'NOT_STARTED', usageHistory }
    }
    if (foundCoupon.tanggalBerakhir && now > new Date(`${foundCoupon.tanggalBerakhir}T23:59:59.999Z`)) {
        return { coupon: foundCoupon, eligible: false as const, reason: 'EXPIRED', usageHistory }
    }

    if (foundCoupon.kuotaTotal > 0 && totalUses >= foundCoupon.kuotaTotal) {
        return { coupon: foundCoupon, eligible: false as const, reason: 'QUOTA_EXHAUSTED', usageHistory }
    }

    if (foundCoupon.outletIds !== null) {
        const allowedOutlets = foundCoupon.outletIds as string[]
        if (!allowedOutlets.includes(params.outletId)) {
            return { coupon: foundCoupon, eligible: false as const, reason: 'OUTLET_RESTRICTED', usageHistory }
        }
    }

    if ((foundCoupon.kategori === 'Member-only' || foundCoupon.kategori === 'Personal') && !params.memberId) {
        return { coupon: foundCoupon, eligible: false as const, reason: 'MEMBER_REQUIRED', usageHistory }
    }

    if (foundCoupon.kategori === 'Personal' && params.memberId !== foundCoupon.kodeMember) {
        return { coupon: foundCoupon, eligible: false as const, reason: 'MEMBER_MISMATCH', usageHistory }
    }

    if (foundCoupon.kuotaPerMember > 0 && memberUses >= foundCoupon.kuotaPerMember) {
        return { coupon: foundCoupon, eligible: false as const, reason: 'PER_MEMBER_QUOTA_EXHAUSTED', usageHistory }
    }

    const minTransaksi = Number(foundCoupon.minTransaksi)
    if (minTransaksi > 0 && params.cartTotal < minTransaksi) {
        return { coupon: foundCoupon, eligible: false as const, reason: 'MIN_TRANSAKSI_NOT_MET', delta: minTransaksi - params.cartTotal, usageHistory }
    }

    return { coupon: foundCoupon, eligible: true as const, usageHistory }
}
