import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { CONNECTION_POOL_SIZE } from '../utils/constants'

const queryClient = postgres(process.env.DATABASE_URL!, {
    max:             CONNECTION_POOL_SIZE,
    idle_timeout:    30,
    connect_timeout: 10
})

export const db = drizzle(queryClient, { schema })
