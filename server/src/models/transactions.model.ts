import { db } from '../db'
import { transactions, transactionItems, transactionPayments, outletStock, stockMovements, members, auditLog, coupons, kuponLog } from '../db/schema'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export interface NewTransactionPayload {
    memberId:        string | null
    mode:            'retail' | 'order'
    items: Array<{
        id:     string
        qty:    number
        price:  number
        isFree: boolean
    }>
    subtotal:        number
    kupon:           { kode: string; nilaiPotongan: number; cartMutations: unknown; authNip: string | null } | null
    additionalCosts: { packaging: number; transport: number; modification: number }
    total:           number
    notes:           string
    paymentMethods:  Array<{ method: string; amount: number }>
}

export async function saveTransaction(payload: NewTransactionPayload, session: JwtSession, requestId: string) {
    return db.transaction(async (databaseTransaction) => {
        const [savedTransaction] = await databaseTransaction
            .insert(transactions)
            .values({
                outletId:        session.outletId,
                userId:          session.userId,
                memberId:        payload.memberId,
                mode:            payload.mode,
                subtotal:        String(payload.subtotal),
                kupon:           payload.kupon,
                additionalCosts: payload.additionalCosts,
                total:           String(payload.total),
                notes:           payload.notes,
                status:          'completed'
            })
            .returning()

        await databaseTransaction.insert(transactionItems).values(
            payload.items.map(item => ({
                transactionId: savedTransaction.id,
                itemId:        item.id,
                qty:           item.qty,
                price:         String(item.price),
                isFree:        item.isFree
            }))
        )

        if (payload.paymentMethods.length > 0) {
            await databaseTransaction.insert(transactionPayments).values(
                payload.paymentMethods.map(payment => ({
                    transactionId: savedTransaction.id,
                    method:        payment.method,
                    amount:        String(payment.amount)
                }))
            )
        }

        // Coupon quota lock — must happen before stock deductions to fail fast
        if (payload.kupon) {
            const [couponRow] = await databaseTransaction
                .select()
                .from(coupons)
                .where(eq(coupons.kode, payload.kupon.kode))
                .for('update')

            if (couponRow && couponRow.kuotaTotal > 0) {
                const [usageResult] = await databaseTransaction
                    .select({ count: sql<number>`count(*)` })
                    .from(kuponLog)
                    .where(and(eq(kuponLog.kodeKupon, payload.kupon.kode), eq(kuponLog.logType, 'Applied')))

                if (Number(usageResult?.count ?? 0) >= couponRow.kuotaTotal) {
                    throw new Error('COUPON_EXHAUSTED')
                }
            }
        }

        for (const item of payload.items) {
            // Row-level lock prevents concurrent oversell — applies to free items too (stock still leaves the shelf)
            const [stockRow] = await databaseTransaction
                .select({ stock: outletStock.stock })
                .from(outletStock)
                .where(and(eq(outletStock.itemId, item.id), eq(outletStock.outletId, session.outletId)))
                .for('update')

            if (!stockRow || stockRow.stock < item.qty) {
                throw new Error('STOCK_INSUFFICIENT')
            }

            await databaseTransaction
                .update(outletStock)
                .set({ stock: sql`${outletStock.stock} - ${item.qty}` })
                .where(and(
                    eq(outletStock.itemId,   item.id),
                    eq(outletStock.outletId, session.outletId)
                ))

            await databaseTransaction.insert(stockMovements).values({
                itemId:     item.id,
                outletId:   session.outletId,
                delta:      -item.qty,
                sourceType: 'transaction',
                sourceId:   savedTransaction.id,
                createdBy:  session.userId
            })
        }

        if (payload.memberId) {
            await databaseTransaction
                .update(members)
                .set({ lastTransactionAt: new Date() })
                .where(eq(members.id, payload.memberId))
        }

        if (payload.kupon) {
            await databaseTransaction.insert(kuponLog).values({
                kodeKupon:     payload.kupon.kode,
                idTransaksi:   savedTransaction.id,
                kodeMember:    payload.memberId,
                nipKasir:      session.userId,
                nipOtorisasi:  payload.kupon.authNip,
                nilaiPotongan: String(payload.kupon.nilaiPotongan),
                cartMutations: (payload.kupon.cartMutations as unknown[]) ?? [],
                totalSebelum:  String(payload.subtotal),
                totalSesudah:  String(payload.total),
                outlet:        session.outletId,
                logType:       'Applied',
                timestamp:     new Date().toISOString()
            })
        }

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'transaction',
            entityId:   savedTransaction.id,
            newValue:   payload,
            requestId:  requestId
        })

        return savedTransaction
    })
}

export async function getTransactions(params: {
    outletId: string
    from?:    string
    to?:      string
    userId?:  string
    page:     number
    limit:    number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        eq(transactions.outletId, params.outletId),
        params.from   ? gte(transactions.createdAt, new Date(params.from)) : undefined,
        params.to     ? lte(transactions.createdAt, new Date(`${params.to}T23:59:59.999Z`)) : undefined,
        params.userId ? eq(transactions.userId, params.userId) : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select()
        .from(transactions)
        .where(whereConditions)
        .orderBy(desc(transactions.createdAt))
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getTransactionById(transactionId: string) {
    const [foundTransaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId))

    if (!foundTransaction) {
        return null
    }

    const foundItems    = await db.select().from(transactionItems).where(eq(transactionItems.transactionId, transactionId))
    const foundPayments = await db.select().from(transactionPayments).where(eq(transactionPayments.transactionId, transactionId))

    return { ...foundTransaction, items: foundItems, payments: foundPayments }
}
