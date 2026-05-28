import { db } from '../db'
import { outlets, paymentMethods, transactionTypes } from '../db/schema'
import { eq } from 'drizzle-orm'
import { cacheGet, cacheSet } from '../utils/cache'
import { CACHE_TTL_CONFIG } from '../utils/constants'

export async function getAllOutlets() {
    const cacheKey = 'cache:outlets'
    const cachedOutlets = await cacheGet<typeof outlets.$inferSelect[]>(cacheKey)
    if (cachedOutlets) return cachedOutlets

    const allOutlets = await db.select().from(outlets).where(eq(outlets.isActive, true))
    await cacheSet(cacheKey, allOutlets, CACHE_TTL_CONFIG).catch(() => {})
    return allOutlets
}

export async function getAllPaymentMethods() {
    const cacheKey = 'cache:payment-methods'
    const cachedMethods = await cacheGet<typeof paymentMethods.$inferSelect[]>(cacheKey)
    if (cachedMethods) return cachedMethods

    const allMethods = await db.select().from(paymentMethods).where(eq(paymentMethods.isActive, true))
    await cacheSet(cacheKey, allMethods, CACHE_TTL_CONFIG).catch(() => {})
    return allMethods
}

export async function getAllTransactionTypes() {
    const cacheKey = 'cache:transaction-types'
    const cachedTypes = await cacheGet<typeof transactionTypes.$inferSelect[]>(cacheKey)
    if (cachedTypes) return cachedTypes

    const allTypes = await db.select().from(transactionTypes)
    await cacheSet(cacheKey, allTypes, CACHE_TTL_CONFIG).catch(() => {})
    return allTypes
}
