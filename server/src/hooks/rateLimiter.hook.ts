import Elysia from 'elysia'
import { redisClient } from '../utils/cache'

const RATE_LIMIT_MAX       = 10
const RATE_LIMIT_WINDOW_MS = 60_000

export const rateLimiterHook = new Elysia({ name: 'rate-limiter' })
    .onBeforeHandle(async ({ request, error }) => {
        const clientIp     = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'local'
        const rateLimitKey = `ratelimit:${clientIp}`
        const requestCount = await redisClient.incr(rateLimitKey)

        if (requestCount === 1) {
            await redisClient.pexpire(rateLimitKey, RATE_LIMIT_WINDOW_MS)
        }

        if (requestCount > RATE_LIMIT_MAX) {
            return error(429, { message: 'Terlalu banyak percobaan. Tunggu satu menit.' })
        }
    })
