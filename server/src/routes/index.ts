import Elysia, { t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { login } from '../controllers/auth.controller'
import { getOutlets, getPaymentMethods, getTransactionTypes } from '../controllers/config.controller'
import { getItemsHandler, getItemByIdHandler, getItemStockHandler } from '../controllers/items.controller'
import { getMembersHandler, getMemberByIdHandler } from '../controllers/members.controller'
import { getPromosHandler } from '../controllers/promos.controller'
import { rateLimiterHook } from '../hooks/rateLimiter.hook'
import { authGuard } from '../hooks/auth.hook'
import { versionHook } from '../hooks/version.hook'

export const routes = new Elysia({ prefix: '/api' })
    .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }))
    .use(versionHook)

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

    // ── Config (cached 1hr) ─────────────────────────────────────────────
    .get('/outlets',           getOutlets)
    .get('/payment-methods',   getPaymentMethods)
    .get('/transaction-types', getTransactionTypes)

    // ── Items ───────────────────────────────────────────────────────────
    .get('/items', getItemsHandler, {
        query: t.Object({
            outletId: t.Optional(t.String()),
            search:   t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .get('/items/:itemId',       getItemByIdHandler)
    .get('/items/:itemId/stock', getItemStockHandler)

    // ── Members ─────────────────────────────────────────────────────────
    .get('/members', getMembersHandler, {
        query: t.Object({
            query: t.Optional(t.String()),
            page:  t.Optional(t.String()),
            limit: t.Optional(t.String())
        })
    })
    .get('/members/:memberId', getMemberByIdHandler)

    // ── Promos ──────────────────────────────────────────────────────────
    .get('/promos', getPromosHandler)
