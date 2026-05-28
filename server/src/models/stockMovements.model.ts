import { db } from '../db'
import { stockMovements, outletStock, auditLog } from '../db/schema'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export async function getStockMovements(params: {
    itemId?:   string
    outletId?: string
    from?:     string
    to?:       string
    page:      number
    limit:     number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        params.itemId   ? eq(stockMovements.itemId,   params.itemId)   : undefined,
        params.outletId ? eq(stockMovements.outletId, params.outletId) : undefined,
        params.from     ? gte(stockMovements.createdAt, new Date(params.from)) : undefined,
        params.to       ? lte(stockMovements.createdAt, new Date(`${params.to}T23:59:59.999Z`)) : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(stockMovements)
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select()
        .from(stockMovements)
        .where(whereConditions)
        .orderBy(desc(stockMovements.createdAt))
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function createStockMovement(params: {
    itemId:   string
    outletId: string
    delta:    number
    note:     string
}, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingStock] = await databaseTransaction
            .select()
            .from(outletStock)
            .where(and(
                eq(outletStock.itemId,   params.itemId),
                eq(outletStock.outletId, params.outletId)
            ))

        if (!existingStock) throw new Error('OUTLET_STOCK_NOT_FOUND')

        await databaseTransaction
            .update(outletStock)
            .set({ stock: sql`${outletStock.stock} + ${params.delta}` })
            .where(and(
                eq(outletStock.itemId,   params.itemId),
                eq(outletStock.outletId, params.outletId)
            ))

        const [savedMovement] = await databaseTransaction
            .insert(stockMovements)
            .values({
                itemId:     params.itemId,
                outletId:   params.outletId,
                delta:      params.delta,
                sourceType: 'manual',
                sourceId:   null,
                createdBy:  session.userId
            })
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'stock_movement',
            entityId:   savedMovement.id,
            newValue:   params,
            requestId:  null
        })

        return savedMovement
    })
}
