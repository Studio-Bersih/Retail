import Elysia, { t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { login } from '../controllers/auth.controller'
import { getOutlets, getPaymentMethods, getTransactionTypes } from '../controllers/config.controller'
import { getItemsHandler, getItemByIdHandler, getItemStockHandler } from '../controllers/items.controller'
import { getMembersHandler, getMemberByIdHandler } from '../controllers/members.controller'
import { getPromosHandler } from '../controllers/promos.controller'
import { createTransactionHandler, getTransactionsHandler, getTransactionByIdHandler } from '../controllers/transactions.controller'
import { createOrderHandler, getOrdersHandler, getOrderByIdHandler, updateOrderHandler, completeOrderHandler } from '../controllers/orders.controller'
import { getCurrentShiftHandler, openShiftHandler, closeShiftHandler } from '../controllers/kasirHarian.controller'
import {
    getCouponsHandler, getCouponByKodeHandler, createCouponHandler,
    updateCouponHandler, toggleCouponStatusHandler, validateCouponHandler
} from '../controllers/coupons.controller'
import { getStockMovementsHandler, createStockMovementHandler } from '../controllers/stockMovements.controller'
import {
    getPtRequestsHandler, getPtRequestByIdHandler, createPtRequestHandler,
    updatePtRequestHandler, approvePtRequestHandler, rejectPtRequestHandler
} from '../controllers/ptRequests.controller'
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

    // ── Orders (Pesanan) ─────────────────────────────────────────────────
    .group('/orders', (orderGroup) =>
        orderGroup
            .use(idempotencyHook)
            .post('', createOrderHandler, {
                body: t.Object({
                    memberId:        t.Nullable(t.String()),
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
                    total:     t.Number(),
                    deposit:   t.Number(),
                    remaining: t.Number(),
                    notes:     t.String(),
                    dueDate:   t.Nullable(t.String())
                })
            })
    )
    .get('/orders', getOrdersHandler, {
        query: t.Object({
            outletId: t.Optional(t.String()),
            status:   t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .get('/orders/:orderId', getOrderByIdHandler)
    .put('/orders/:orderId', updateOrderHandler, {
        body: t.Object({
            memberId:        t.Nullable(t.String()),
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
            total:     t.Number(),
            deposit:   t.Number(),
            remaining: t.Number(),
            notes:     t.String(),
            dueDate:   t.Nullable(t.String())
        })
    })
    .patch('/orders/:orderId/complete', completeOrderHandler)

    // ── Stock Movements ───────────────────────────────────────────────────
    .get('/stock-movements', getStockMovementsHandler, {
        query: t.Object({
            itemId:   t.Optional(t.String()),
            outletId: t.Optional(t.String()),
            from:     t.Optional(t.String()),
            to:       t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .post('/stock-movements', createStockMovementHandler, {
        body: t.Object({
            itemId:   t.String(),
            outletId: t.String(),
            delta:    t.Integer(),
            note:     t.String()
        })
    })

    // ── PT Requests (Perbaikan Transaksi) ─────────────────────────────────
    .get('/pt-requests', getPtRequestsHandler, {
        query: t.Object({
            outletId: t.Optional(t.String()),
            status:   t.Optional(t.String()),
            page:     t.Optional(t.String()),
            limit:    t.Optional(t.String())
        })
    })
    .post('/pt-requests', createPtRequestHandler, {
        body: t.Object({
            transactionId: t.String(),
            reason:        t.String({ minLength: 1 }),
            newSnapshot:   t.Object({
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
                total:          t.Number(),
                notes:          t.String(),
                paymentMethods: t.Array(t.Object({
                    method: t.String(),
                    amount: t.Number()
                }))
            })
        })
    })
    .get('/pt-requests/:requestId', getPtRequestByIdHandler)
    .put('/pt-requests/:requestId', updatePtRequestHandler, {
        body: t.Object({
            reason:      t.String({ minLength: 1 }),
            newSnapshot: t.Object({
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
                total:          t.Number(),
                notes:          t.String(),
                paymentMethods: t.Array(t.Object({
                    method: t.String(),
                    amount: t.Number()
                }))
            })
        })
    })
    .patch('/pt-requests/:requestId/approve', approvePtRequestHandler)
    .patch('/pt-requests/:requestId/reject',  rejectPtRequestHandler)

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

    // ── Coupons (Kupon) ───────────────────────────────────────────────────
    .get('/coupons', getCouponsHandler, {
        query: t.Object({
            search: t.Optional(t.String()),
            status: t.Optional(t.String()),
            page:   t.Optional(t.String()),
            limit:  t.Optional(t.String())
        })
    })
    .post('/coupons', createCouponHandler, {
        body: t.Object({
            kode:            t.String({ minLength: 1 }),
            nama:            t.String({ minLength: 1 }),
            kategori:        t.Union([t.Literal('Public'), t.Literal('Member-only'), t.Literal('Personal'), t.Literal('Staff/Internal')]),
            kodeMember:      t.Nullable(t.String()),
            outletIds:       t.Nullable(t.Array(t.String())),
            status:          t.Union([t.Literal('Active'), t.Literal('Inactive')]),
            tanggalMulai:    t.String({ minLength: 1 }),
            tanggalBerakhir: t.Nullable(t.String()),
            minTransaksi:    t.Number(),
            kuotaTotal:      t.Integer(),
            kuotaPerMember:  t.Integer(),
            butuhOtorisasi:  t.Boolean(),
            syaratKetentuan: t.Nullable(t.String()),
            effects: t.Object({
                fixedDiscount:      t.Number(),
                percentageDiscount: t.Number(),
                cartMutations:      t.Array(t.Object({
                    type:          t.Union([t.Literal('AddItem'), t.Literal('RemoveItem'), t.Literal('ModifyQty')]),
                    itemId:        t.String(),
                    qty:           t.Integer({ minimum: 0 }),
                    isFree:        t.Boolean(),
                    priceOverride: t.Number()
                }))
            }),
            codeType: t.Union([t.Literal('Standard'), t.Literal('Batch'), t.Literal('PersonalAuto')])
        })
    })
    .get('/coupons/:kode', getCouponByKodeHandler)
    .put('/coupons/:kode', updateCouponHandler, {
        body: t.Object({
            nama:            t.String({ minLength: 1 }),
            kategori:        t.Union([t.Literal('Public'), t.Literal('Member-only'), t.Literal('Personal'), t.Literal('Staff/Internal')]),
            kodeMember:      t.Nullable(t.String()),
            outletIds:       t.Nullable(t.Array(t.String())),
            status:          t.Union([t.Literal('Active'), t.Literal('Inactive')]),
            tanggalMulai:    t.String({ minLength: 1 }),
            tanggalBerakhir: t.Nullable(t.String()),
            minTransaksi:    t.Number(),
            kuotaTotal:      t.Integer(),
            kuotaPerMember:  t.Integer(),
            butuhOtorisasi:  t.Boolean(),
            syaratKetentuan: t.Nullable(t.String()),
            effects: t.Object({
                fixedDiscount:      t.Number(),
                percentageDiscount: t.Number(),
                cartMutations:      t.Array(t.Object({
                    type:          t.Union([t.Literal('AddItem'), t.Literal('RemoveItem'), t.Literal('ModifyQty')]),
                    itemId:        t.String(),
                    qty:           t.Integer({ minimum: 0 }),
                    isFree:        t.Boolean(),
                    priceOverride: t.Number()
                }))
            }),
            codeType: t.Union([t.Literal('Standard'), t.Literal('Batch'), t.Literal('PersonalAuto')])
        })
    })
    .patch('/coupons/:kode/status', toggleCouponStatusHandler)
    .post('/coupons/:kode/validate', validateCouponHandler, {
        body: t.Object({
            cartTotal: t.Number(),
            memberId:  t.Nullable(t.String()),
            outletId:  t.String()
        })
    })
