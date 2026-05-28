import Elysia, { t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { login } from '../controllers/auth.controller'
import { rateLimiterHook } from '../hooks/rateLimiter.hook'
import { authGuard } from '../hooks/auth.hook'

export const routes = new Elysia({ prefix: '/api' })
    .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }))

    // ── Auth (rate-limited) ────────────────────────────────────────────────
    .group('/auth', (authGroup) =>
        authGroup
            .use(rateLimiterHook)
            .post('/login', login, {
                body: t.Object({
                    username: t.String({ minLength: 1 }),
                    password: t.String({ minLength: 1 })
                })
            })
    )

    // ── Protected routes — authGuard applied to all routes below ──────────
    .use(authGuard)
    // Subsequent plans mount their routes here
