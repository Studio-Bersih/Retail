import Elysia, { t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { login } from '../controllers/auth.controller'
import { getOutlets, getPaymentMethods, getTransactionTypes } from '../controllers/config.controller'
import { getItemsHandler, getItemByIdHandler, getItemStockHandler } from '../controllers/items.controller'
import { getMembersHandler, getMemberByIdHandler } from '../controllers/members.controller'
import { getPromosHandler } from '../controllers/promos.controller'
import { createTransactionHandler, getTransactionsHandler, getTransactionByIdHandler } from '../controllers/transactions.controller'
import { getCurrentShiftHandler, openShiftHandler, closeShiftHandler } from '../controllers/kasirHarian.controller'
import { rateLimiterHook } from '../hooks/rateLimiter.hook'
import { authGuard } from '../hooks/auth.hook'
import { versionHook } from '../hooks/version.hook'
import { idempotencyHook } from '../hooks/idempotency.hook'

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

    // ── Transactions ─────────────────────────────────────────────────────
    .group('/transactions', (transactionGroup) =>
        transactionGroup
            .use(idempotencyHook)
            .post('', createTransactionHandler, {
                body: t.Object({
                    memberId:        t.Nullable(t.String()),
                    mode:            t.Union([t.Literal('retail'), t.Literal('order')]),
                    items: t.Array(t.Object({
                        id:     t.String(),
                        qty:    t.Integer({ minimum: 1 }),
                        price:  t.Number(),
                        isFree: t.Boolean()
                    })),
                    subtotal:        t.Number(),
                    kupon:           t.Nullable(t.Object({
                        kode:          t.String(),
                        nilaiPotongan: t.Number(),
                        cartMutations: t.Unknown(),
                        authNip:       t.Nullable(t.String())
                    })),
                    additionalCosts: t.Object({
                        packaging:    t.Number(),
                        transport:    t.Number(),
                        modification: t.Number()
                    }),
                    total:           t.Number(),
                    notes:           t.String(),
                    paymentMethods:  t.Array(t.Object({
                        method: t.String(),
                        amount: t.Number()
                    }))
                })
            })
    )
    .get('/transactions', getTransactionsHandler, {
        query: t.Object({
            outletId: t.Optional(t.String()),
            from:     t.Optional(t.String()),
            to:       t.Optional(t.String()),
            userId:   t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .get('/transactions/:transactionId', getTransactionByIdHandler)

    // ── Kasir Harian ─────────────────────────────────────────────────────
    .get('/shifts/current', getCurrentShiftHandler)
    .post('/shifts/open', openShiftHandler, {
        body: t.Object({
            openingBalance: t.Number(),
            date:           t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
        })
    })
    .post('/shifts/close', closeShiftHandler, {
        body: t.Object({
            shiftId: t.String(),
            counts:  t.Array(t.Object({
                paymentMethod: t.String(),
                actualAmount:  t.Number()
            }))
        })
    })
