import { db } from '../db'
import { ptRequests, transactions, transactionItems, transactionPayments, outletStock, stockMovements, auditLog } from '../db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { JwtSession } from '../types'

export interface PtSnapshotItem {
    id:     string
    qty:    number
    price:  number
    isFree: boolean
}

export interface PtSnapshot {
    items:           PtSnapshotItem[]
    subtotal:        number
    kupon:           { kode: string; nilaiPotongan: number; cartMutations: unknown; authNip: string | null } | null
    additionalCosts: { packaging: number; transport: number; modification: number }
    total:           number
    notes:           string
    paymentMethods:  Array<{ method: string; amount: number }>
}

export async function getPtRequests(params: {
    outletId?: string
    status?:   'pending' | 'approved' | 'rejected'
    page:      number
    limit:     number
}) {
    const offset = (params.page - 1) * params.limit

    const whereConditions = and(
        params.outletId ? eq(transactions.outletId, params.outletId) : undefined,
        params.status   ? eq(ptRequests.status,     params.status)   : undefined
    )

    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ptRequests)
        .innerJoin(transactions, eq(transactions.id, ptRequests.transactionId))
        .where(whereConditions)

    const total      = Number(countResult?.count ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / params.limit))

    const rows = await db
        .select({
            id:            ptRequests.id,
            transactionId: ptRequests.transactionId,
            requestedBy:   ptRequests.requestedBy,
            reviewedBy:    ptRequests.reviewedBy,
            reason:        ptRequests.reason,
            status:        ptRequests.status,
            oldSnapshot:   ptRequests.oldSnapshot,
            newSnapshot:   ptRequests.newSnapshot,
            createdAt:     ptRequests.createdAt,
            reviewedAt:    ptRequests.reviewedAt
        })
        .from(ptRequests)
        .innerJoin(transactions, eq(transactions.id, ptRequests.transactionId))
        .where(whereConditions)
        .orderBy(desc(ptRequests.createdAt))
        .limit(params.limit)
        .offset(offset)

    return { data: rows, meta: { page: params.page, limit: params.limit, total, totalPages } }
}

export async function getPtRequestById(requestId: string) {
    const [foundRequest] = await db
        .select()
        .from(ptRequests)
        .where(eq(ptRequests.id, requestId))
    return foundRequest ?? null
}

export async function createPtRequest(params: {
    transactionId: string
    reason:        string
    newSnapshot:   PtSnapshot
}, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingTransaction] = await databaseTransaction
            .select()
            .from(transactions)
            .where(eq(transactions.id, params.transactionId))

        if (!existingTransaction) {
            throw new Error('TRANSACTION_NOT_FOUND')
        }

        const txItems    = await databaseTransaction.select().from(transactionItems).where(eq(transactionItems.transactionId, params.transactionId))
        const txPayments = await databaseTransaction.select().from(transactionPayments).where(eq(transactionPayments.transactionId, params.transactionId))

        const oldSnapshot: PtSnapshot = {
            items:           txItems.map(txItem => ({ id: txItem.itemId, qty: txItem.qty, price: Number(txItem.price), isFree: txItem.isFree })),
            subtotal:        Number(existingTransaction.subtotal),
            kupon:           existingTransaction.kupon as PtSnapshot['kupon'],
            additionalCosts: existingTransaction.additionalCosts as PtSnapshot['additionalCosts'],
            total:           Number(existingTransaction.total),
            notes:           existingTransaction.notes,
            paymentMethods:  txPayments.map(txPayment => ({ method: txPayment.method, amount: Number(txPayment.amount) }))
        }

        const [savedRequest] = await databaseTransaction
            .insert(ptRequests)
            .values({
                transactionId: params.transactionId,
                requestedBy:   session.userId,
                reason:        params.reason,
                oldSnapshot:   oldSnapshot,
                newSnapshot:   params.newSnapshot,
                status:        'pending'
            })
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'create',
            entityType: 'pt_request',
            entityId:   savedRequest.id,
            newValue:   params,
            requestId:  null
        })

        return savedRequest
    })
}

export async function updatePtRequest(requestId: string, params: {
    reason:      string
    newSnapshot: PtSnapshot
}, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingRequest] = await databaseTransaction
            .select()
            .from(ptRequests)
            .where(and(eq(ptRequests.id, requestId), eq(ptRequests.status, 'pending')))

        if (!existingRequest) {
            throw new Error('PT_REQUEST_NOT_FOUND_OR_NOT_PENDING')
        }

        const [updatedRequest] = await databaseTransaction
            .update(ptRequests)
            .set({ reason: params.reason, newSnapshot: params.newSnapshot })
            .where(eq(ptRequests.id, requestId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'update',
            entityType: 'pt_request',
            entityId:   requestId,
            oldValue:   { reason: existingRequest.reason, newSnapshot: existingRequest.newSnapshot },
            newValue:   params,
            requestId:  null
        })

        return updatedRequest
    })
}

export async function approvePtRequest(requestId: string, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingRequest] = await databaseTransaction
            .select()
            .from(ptRequests)
            .where(and(eq(ptRequests.id, requestId), eq(ptRequests.status, 'pending')))

        if (!existingRequest) {
            throw new Error('PT_REQUEST_NOT_FOUND_OR_NOT_PENDING')
        }

        const [existingTransaction] = await databaseTransaction
            .select()
            .from(transactions)
            .where(eq(transactions.id, existingRequest.transactionId))

        const oldSnapshot = existingRequest.oldSnapshot as PtSnapshot
        const newSnapshot = existingRequest.newSnapshot as PtSnapshot

        // Compute stock adjustments: oldQty - newQty per item (non-free only)
        const oldItemMap = new Map(oldSnapshot.items.filter(snapshotItem => !snapshotItem.isFree).map(snapshotItem => [snapshotItem.id, snapshotItem.qty]))
        const newItemMap = new Map(newSnapshot.items.filter(snapshotItem => !snapshotItem.isFree).map(snapshotItem => [snapshotItem.id, snapshotItem.qty]))
        const allItemIds = new Set([...oldItemMap.keys(), ...newItemMap.keys()])

        for (const itemId of allItemIds) {
            const oldQty     = oldItemMap.get(itemId) ?? 0
            const newQty     = newItemMap.get(itemId) ?? 0
            const stockDelta = oldQty - newQty  // positive = return stock, negative = deduct more

            if (stockDelta !== 0) {
                await databaseTransaction
                    .update(outletStock)
                    .set({ stock: sql`${outletStock.stock} + ${stockDelta}` })
                    .where(and(
                        eq(outletStock.itemId,   itemId),
                        eq(outletStock.outletId, existingTransaction.outletId)
                    ))

                await databaseTransaction.insert(stockMovements).values({
                    itemId:     itemId,
                    outletId:   existingTransaction.outletId,
                    delta:      stockDelta,
                    sourceType: 'pt_approval',
                    sourceId:   requestId,
                    createdBy:  session.userId
                })
            }
        }

        // Replace transaction items
        await databaseTransaction.delete(transactionItems).where(eq(transactionItems.transactionId, existingRequest.transactionId))
        if (newSnapshot.items.length > 0) {
            await databaseTransaction.insert(transactionItems).values(
                newSnapshot.items.map(snapshotItem => ({
                    transactionId: existingRequest.transactionId,
                    itemId:        snapshotItem.id,
                    qty:           snapshotItem.qty,
                    price:         String(snapshotItem.price),
                    isFree:        snapshotItem.isFree
                }))
            )
        }

        // Replace transaction payments
        await databaseTransaction.delete(transactionPayments).where(eq(transactionPayments.transactionId, existingRequest.transactionId))
        if (newSnapshot.paymentMethods.length > 0) {
            await databaseTransaction.insert(transactionPayments).values(
                newSnapshot.paymentMethods.map(paymentMethod => ({
                    transactionId: existingRequest.transactionId,
                    method:        paymentMethod.method,
                    amount:        String(paymentMethod.amount)
                }))
            )
        }

        // Update transaction header
        await databaseTransaction
            .update(transactions)
            .set({
                subtotal:        String(newSnapshot.subtotal),
                kupon:           newSnapshot.kupon,
                additionalCosts: newSnapshot.additionalCosts,
                total:           String(newSnapshot.total),
                notes:           newSnapshot.notes
            })
            .where(eq(transactions.id, existingRequest.transactionId))

        const [approvedRequest] = await databaseTransaction
            .update(ptRequests)
            .set({ status: 'approved', reviewedBy: session.userId, reviewedAt: new Date() })
            .where(eq(ptRequests.id, requestId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'approve',
            entityType: 'pt_request',
            entityId:   requestId,
            newValue:   { status: 'approved' },
            requestId:  null
        })

        return approvedRequest
    })
}

export async function rejectPtRequest(requestId: string, session: JwtSession) {
    return db.transaction(async (databaseTransaction) => {
        const [existingRequest] = await databaseTransaction
            .select()
            .from(ptRequests)
            .where(and(eq(ptRequests.id, requestId), eq(ptRequests.status, 'pending')))

        if (!existingRequest) {
            throw new Error('PT_REQUEST_NOT_FOUND_OR_NOT_PENDING')
        }

        const [rejectedRequest] = await databaseTransaction
            .update(ptRequests)
            .set({ status: 'rejected', reviewedBy: session.userId, reviewedAt: new Date() })
            .where(eq(ptRequests.id, requestId))
            .returning()

        await databaseTransaction.insert(auditLog).values({
            userId:     session.userId,
            action:     'reject',
            entityType: 'pt_request',
            entityId:   requestId,
            newValue:   { status: 'rejected' },
            requestId:  null
        })

        return rejectedRequest
    })
}
