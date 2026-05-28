import Elysia from 'elysia'

export const correlationHook = new Elysia({ name: 'correlation' })
    .derive(({ headers }) => {
        const requestId = headers['x-request-id'] ?? crypto.randomUUID()
        return { requestId }
    })
