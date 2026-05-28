import { db } from '../db'
import { shifts, shiftCounts, transactionPayments, transactions } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'

export async function getCurrentShift(outletId: string) {
    const [foundShift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.outletId, outletId), eq(shifts.status, 'open')))
        .limit(1)
    return foundShift ?? null
}

export async function openShift(params: {
    outletId:       string
    userId:         string
    date:           string
    openingBalance: number
}) {
    return db.transaction(async (databaseTransaction) => {
        const [existingShift] = await databaseTransaction
            .select()
            .from(shifts)
            .where(and(eq(shifts.outletId, params.outletId), eq(shifts.date, params.date)))

        if (existingShift) {
            throw new Error('SHIFT_ALREADY_EXISTS')
        }

        const [newShift] = await databaseTransaction
            .insert(shifts)
            .values({
                outletId:       params.outletId,
                userId:         params.userId,
                date:           params.date,
                openingBalance: String(params.openingBalance),
                status:         'open'
            })
            .returning()

        return newShift
    })
}

export async function closeShift(shiftId: string, counts: Array<{ paymentMethod: string; actualAmount: number }>) {
    return db.transaction(async (databaseTransaction) => {
        const [foundShift] = await databaseTransaction
            .select()
            .from(shifts)
            .where(and(eq(shifts.id, shiftId), eq(shifts.status, 'open')))

        if (!foundShift) {
            throw new Error('SHIFT_NOT_FOUND')
        }

        const expectedRows = await databaseTransaction
            .select({
                method:         transactionPayments.method,
                expectedAmount: sql<string>`SUM(${transactionPayments.amount}::numeric)::text`
            })
            .from(transactionPayments)
            .innerJoin(transactions, eq(transactions.id, transactionPayments.transactionId))
            .where(and(
                eq(transactions.outletId, foundShift.outletId),
                eq(transactions.userId,   foundShift.userId),
                sql`DATE(${transactions.createdAt}) = ${foundShift.date}::date`
            ))
            .groupBy(transactionPayments.method)

        const expectedByMethod = new Map(
            expectedRows.map(row => [row.method, Number(row.expectedAmount ?? 0)])
        )

        if (counts.length > 0) {
            await databaseTransaction.insert(shiftCounts).values(
                counts.map(countRow => ({
                    shiftId:        shiftId,
                    paymentMethod:  countRow.paymentMethod,
                    expectedAmount: String(expectedByMethod.get(countRow.paymentMethod) ?? 0),
                    actualAmount:   String(countRow.actualAmount)
                }))
            )
        }

        const [closedShift] = await databaseTransaction
            .update(shifts)
            .set({ status: 'closed', closedAt: new Date() })
            .where(eq(shifts.id, shiftId))
            .returning()

        return closedShift
    })
}
