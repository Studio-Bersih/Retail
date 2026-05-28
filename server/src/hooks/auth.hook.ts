import Elysia from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { Errors } from '../utils/errors'
import type { JwtSession } from '../types'

export const authGuard = new Elysia({ name: 'auth-guard' })
    .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }))
    .derive(async ({ headers, jwt: jwtPlugin, error }) => {
        const authorizationHeader = headers.authorization
        if (!authorizationHeader?.startsWith('Bearer ')) {
            return error(401, { message: Errors.UNAUTHORIZED })
        }

        const bearerToken     = authorizationHeader.replace('Bearer ', '')
        const verifiedPayload = await jwtPlugin.verify(bearerToken)
        if (!verifiedPayload) return error(401, { message: Errors.UNAUTHORIZED })

        return { session: verifiedPayload as JwtSession }
    })
