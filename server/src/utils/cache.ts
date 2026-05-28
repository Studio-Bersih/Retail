import Redis from 'ioredis'

export const redisClient = new Redis(process.env.REDIS_URL!, {
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (retryCount) => {
        if (retryCount > 3) {
            return null
        }
        return retryCount * 200
    }
})

export async function cacheGet<CachedValue>(cacheKey: string): Promise<CachedValue | null> {
    const cachedValue = await redisClient.get(cacheKey)
    if (!cachedValue) {
        return null
    }
    return JSON.parse(cachedValue) as CachedValue
}

export async function cacheSet(cacheKey: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redisClient.setex(cacheKey, ttlSeconds, JSON.stringify(value))
}

export async function cacheInvalidate(cacheKey: string): Promise<void> {
    await redisClient.del(cacheKey)
}
