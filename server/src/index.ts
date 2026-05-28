import Elysia from 'elysia'
import { cors } from '@elysiajs/cors'
import { validateEnv } from './utils/env'
import { correlationHook } from './hooks/correlation.hook'
import { loggerHook } from './hooks/logger.hook'
import { routes } from './routes'
import { DEV_PORT, PROD_PORT, APP_VERSION } from './utils/constants'

validateEnv()

export const app = new Elysia()
    .use(cors())
    .use(correlationHook)
    .use(loggerHook)
    .get('/health', () => ({
        status:  'ok',
        version: APP_VERSION,
        env:     process.env.NODE_ENV ?? 'development'
    }))
    .use(routes)

const serverPort = process.env.NODE_ENV === 'production' ? PROD_PORT : DEV_PORT

app.listen(serverPort, () => {
    console.log(`🚀 Studio Bersih API → http://localhost:${serverPort}  [${process.env.NODE_ENV ?? 'development'}]`)
})
