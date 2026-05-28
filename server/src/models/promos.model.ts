import { db } from '../db'
import { promos } from '../db/schema'
import { and, eq, lte, or, isNull, sql } from 'drizzle-orm'

export async function getActivePromos() {
    const today = new Date().toISOString().slice(0, 10)

    return db
        .select()
        .from(promos)
        .where(
            and(
                eq(promos.isActive, true),
                lte(promos.startDate, today),
                or(isNull(promos.endDate), sql`${promos.endDate} >= ${today}`)
            )
        )
}
