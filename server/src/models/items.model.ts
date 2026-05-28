import { db } from '../db'
import { items, outletStock, outlets } from '../db/schema'
import { eq, and, ilike, or, sql } from 'drizzle-orm'

export async function getItems(params: {
    outletId: string
    search?:  string
    page:     number
    limit:    number
}) {
    const offset = (params.page - 1) * params.limit

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(items)
        .where(
            and(
                eq(items.isActive, true),
                params.search
                    ? or(ilike(items.name, `%${params.search}%`), ilike(items.sku, `%${params.search}%`))
                    : undefined
            )
        )

    const total = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select({
            id:          items.id,
            sku:         items.sku,
            name:        items.name,
            category:    items.category,
            itemType:    items.itemType,
            priceLevel1: items.priceLevel1,
            priceLevel2: items.priceLevel2,
            priceLevel3: items.priceLevel3,
            isActive:    items.isActive,
            stock:       sql<number>`COALESCE(${outletStock.stock} + ${outletStock.preAdjDelta}, 0)`
        })
        .from(items)
        .leftJoin(
            outletStock,
            and(
                eq(outletStock.itemId,   items.id),
                eq(outletStock.outletId, params.outletId)
            )
        )
        .where(
            and(
                eq(items.isActive, true),
                params.search
                    ? or(ilike(items.name, `%${params.search}%`), ilike(items.sku, `%${params.search}%`))
                    : undefined
            )
        )
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getItemById(itemId: string) {
    const [foundItem] = await db
        .select()
        .from(items)
        .where(eq(items.id, itemId))
    return foundItem ?? null
}

export async function getItemStock(itemId: string) {
    return db
        .select({
            outletId:   outletStock.outletId,
            outletName: outlets.name,
            stock:      sql<number>`${outletStock.stock} + ${outletStock.preAdjDelta}`
        })
        .from(outletStock)
        .innerJoin(outlets, eq(outlets.id, outletStock.outletId))
        .where(eq(outletStock.itemId, itemId))
}
