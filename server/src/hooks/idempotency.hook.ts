import Elysia from 'elysia'
import { redisClient, cacheSet } from '../utils/cache'
import { CACHE_TTL_IDEMPOTENCY } from '../utils/constants'

export const idempotencyHook = new Elysia({ name: 'idempotency' })
    .onBeforeHandle(async ({ headers, error }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (!idempotencyKey) return error(400, { message: 'X-Idempotency-Key header is required.' })

        const cachedResponse = await redisClient.get(`idempotency:${idempotencyKey}`)
        if (cachedResponse) return JSON.parse(cachedResponse)
    })
    .onAfterHandle(async ({ headers, response }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (idempotencyKey && response) {
            await cacheSet(`idempotency:${idempotencyKey}`, response, CACHE_TTL_IDEMPOTENCY)
        }
    })
