import { db } from '../db'
import { orders, orderItems, outletStock, stockMovements, members, auditLog } from '../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export interface OrderItemPayload {
    id:     string
    qty:    number
    price:  number
    isFree: boolean
}

export interface KuponPayload {
    kode:          string
    nilaiPotongan: number
    cartMutations: unknown
    authNip:       string | null
}

export interface NewOrderPayload {
    memberId:        string | null
    items:           OrderItemPayload[]
    subtotal:        number
    kupon:           KuponPayload | null
    additionalCosts: { packaging: number; transport: number; modification: number }
    total:           number
    deposit:         number
    remaining:       number
    notes:           string
    dueDate:         string | null
}

export type UpdateOrderPayload = NewOrderPayload

export async function saveOrder(payload: NewOrderPayload, session: JwtSession, requestId: string) {
    return db.transaction(async (databaseTransaction) => {
        const [savedOrder] = await databaseTransaction
            .insert(orders)
            .values({
                outletId:        session.outletId,
                userId:          session.userId,
                memberId:        payload.memberId,
                subtotal:        String(payload.subtotal),
                kupon:           payload.kupon,
                additionalCosts: payload.additionalCosts,
                total:           String(payload.total),
                deposit:         String(payload.deposit),
                remaining:       String(payload.remaining),
                notes:           payload.notes,
                dueDate:         payload.dueDate,
                status:          'active'
            })
            .returning()

        if (payload.items.length > 0) {
            await databaseTransaction.insert(orderItems).values(
                payload.items.map(item => ({
                    orderId: savedOrder.id,
                    itemId:  item.id,
                    qty:     item.qty,
                    price:   String(item.price),
                    isFree:  item.isFree
                }))
            )
        }

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'order',
            entityId:   savedOrder.id,
            newValue:   payload,
            requestId:  requestId
        })

        return savedOrder
    })
}

export async function getOrders(params: {
    outletId: string
    status?:  'active' | 'completed' | 'cancelled'
    page:     number
    limit:    number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        eq(orders.outletId, params.outletId),
        params.status ? eq(orders.status, params.status) : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select()
        .from(orders)
        .where(whereConditions)
        .orderBy(desc(orders.createdAt))
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getOrderById(orderId: string) {
    const [foundOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))

    if (!foundOrder) return null

    const foundItems = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))

    return { ...foundOrder, items: foundItems }
}

export async function updateOrder(orderId: string, payload: UpdateOrderPayload, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingOrder] = await databaseTransaction
            .select()
            .from(orders)
            .where(and(eq(orders.id, orderId), eq(orders.status, 'active')))

        if (!existingOrder) throw new Error('ORDER_NOT_FOUND_OR_NOT_ACTIVE')

        const existingItems = await databaseTransaction
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, orderId))

        await databaseTransaction.delete(orderItems).where(eq(orderItems.orderId, orderId))

        if (payload.items.length > 0) {
            await databaseTransaction.insert(orderItems).values(
                payload.items.map(item => ({
                    orderId: orderId,
                    itemId:  item.id,
                    qty:     item.qty,
                    price:   String(item.price),
                    isFree:  item.isFree
                }))
            )
        }

        const [updatedOrder] = await databaseTransaction
            .update(orders)
            .set({
                memberId:        payload.memberId,
                subtotal:        String(payload.subtotal),
                kupon:           payload.kupon,
                additionalCosts: payload.additionalCosts,
                total:           String(payload.total),
                deposit:         String(payload.deposit),
                remaining:       String(payload.remaining),
                notes:           payload.notes,
                dueDate:         payload.dueDate
            })
            .where(eq(orders.id, orderId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'update',
            entityType: 'order',
            entityId:   orderId,
            oldValue:   { ...existingOrder, items: existingItems },
            newValue:   payload,
            requestId:  null
        })

        return updatedOrder
    })
}

export async function completeOrder(orderId: string, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingOrder] = await databaseTransaction
            .select()
            .from(orders)
            .where(and(eq(orders.id, orderId), eq(orders.status, 'active')))

        if (!existingOrder) throw new Error('ORDER_NOT_FOUND_OR_NOT_ACTIVE')

        const existingItems = await databaseTransaction
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, orderId))

        for (const item of existingItems.filter(orderItem => !orderItem.isFree)) {
            await databaseTransaction
                .update(outletStock)
                .set({ stock: sql`${outletStock.stock} - ${item.qty}` })
                .where(and(
                    eq(outletStock.itemId,   item.itemId),
                    eq(outletStock.outletId, existingOrder.outletId)
                ))

            await databaseTransaction.insert(stockMovements).values({
                itemId:     item.itemId,
                outletId:   existingOrder.outletId,
                delta:      -item.qty,
                sourceType: 'order',
                sourceId:   orderId,
                createdBy:  session.userId
            })
        }

        if (existingOrder.memberId) {
            await databaseTransaction
                .update(members)
                .set({ lastTransactionAt: new Date() })
                .where(eq(members.id, existingOrder.memberId))
        }

        const [completedOrder] = await databaseTransaction
            .update(orders)
            .set({ status: 'completed', remaining: '0' })
            .where(eq(orders.id, orderId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'complete',
            entityType: 'order',
            entityId:   orderId,
            newValue:   { status: 'completed' },
            requestId:  null
        })

        return completedOrder
    })
}
