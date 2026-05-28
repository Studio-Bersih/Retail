import Elysia from 'elysia'
import { Errors } from '../utils/errors'
import type { JwtSession } from '../types'

export const authGuard = new Elysia({ name: 'auth-guard' })
    .onBeforeHandle(({ headers, error }) => {
        const authorizationHeader = headers.authorization
        if (!authorizationHeader?.startsWith('Bearer ')) {
            return error(401, { message: Errors.UNAUTHORIZED })
        }
    })
    .derive(async ({ headers, jwt: jwtPlugin }) => {
        const authorizationHeader = headers.authorization!
        const bearerToken        = authorizationHeader.replace('Bearer ', '')
        const verifiedPayload    = await jwtPlugin.verify(bearerToken)

        if (!verifiedPayload) {
            throw new Error(Errors.UNAUTHORIZED)
        }

        return { session: verifiedPayload as JwtSession }
    })
