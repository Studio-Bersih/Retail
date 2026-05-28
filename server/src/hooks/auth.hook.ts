import Elysia, { status } from 'elysia'
import { jwt } from '@elysiajs/jwt'

export const authGuard = new Elysia({ name: 'auth-guard' })
    .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }))
    .derive({ as: 'scoped' }, async ({ jwt, request }) => {
        const authHeader = request.headers.get('Authorization')
        if (!authHeader?.startsWith('Bearer ')) return { session: null }

        const token = authHeader.slice(7)
        const session = await jwt.verify(token)
        return { session: session || null }
    })
    .onBeforeHandle({ as: 'scoped' }, ({ session }) => {
        if (!session) return status(401, { message: 'useNotice.connection.unauthorized' })
    })
