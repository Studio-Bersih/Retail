export const Errors = {
    UNAUTHORIZED: 'useNotice.connection.unauthorized',
    FORBIDDEN: 'useNotice.connection.forbidden',
    NOT_FOUND: 'useNotice.connection.notFound',
    VALIDATION_FAILED: 'useNotice.connection.validationFailed',
    DUPLICATE_REQUEST: 'useNotice.connection.duplicateRequest',
    CLIENT_VERSION_STALE: 'useNotice.connection.clientVersionStale',
    SERVER_ERROR: 'useNotice.connection.serverError',
    COUPON_INVALID: 'useNotice.coupon.invalid',
    COUPON_EXPIRED: 'useNotice.coupon.expired',
    COUPON_EXHAUSTED: 'useNotice.coupon.exhausted',
    STOCK_INSUFFICIENT: 'useNotice.stock.insufficient',
} as const

export type ErrorKey = keyof typeof Errors
