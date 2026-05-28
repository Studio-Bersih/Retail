import Elysia, { status, ElysiaCustomStatusResponse } from 'elysia'
import { redisClient, cacheSet } from '../utils/cache'
import { CACHE_TTL_IDEMPOTENCY } from '../utils/constants'

interface CachedIdempotencyEntry {
    statusCode: number
    body:       unknown
}

export const idempotencyHook = new Elysia({ name: 'idempotency' })
    .onBeforeHandle({ as: 'scoped' }, async ({ headers }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (!idempotencyKey) return status(400, { message: 'X-Idempotency-Key header is required.' })

        const cachedEntry = await redisClient.get(`idempotency:${idempotencyKey}`)
        if (cachedEntry) {
            const parsed = JSON.parse(cachedEntry) as CachedIdempotencyEntry
            return status(parsed.statusCode as Parameters<typeof status>[0], parsed.body)
        }
    })
    .onAfterHandle({ as: 'scoped' }, async ({ headers, response }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (!idempotencyKey || !response) return

        let statusCode = 200
        let body: unknown = response

        if (response instanceof ElysiaCustomStatusResponse) {
            statusCode = response.code as number
            body       = response.response
        }

        const entry: CachedIdempotencyEntry = { statusCode, body }
        await cacheSet(`idempotency:${idempotencyKey}`, entry, CACHE_TTL_IDEMPOTENCY).catch(() => {})
    })
