import { status } from 'elysia'
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'
import { findUserByCredentials } from '../models/auth.model'

export async function login(context: {
    body: { username: string; password: string }
    jwt: { sign: (payload: object) => Promise<string> }
}) {
    const foundUser = await findUserByCredentials(context.body.username, context.body.password)
    if (!foundUser) return status(401, { message: Errors.UNAUTHORIZED })

    const signedToken = await context.jwt.sign({
        userId:   foundUser.id,
        userName: foundUser.name,
        role:     foundUser.role,
        outletId: foundUser.outletId
    })

    return {
        message: Messages.LOGIN_SUCCESS,
        token:   signedToken,
        user: {
            userId:   foundUser.id,
            userName: foundUser.name,
            role:     foundUser.role,
            outletId: foundUser.outletId
        }
    }
}
