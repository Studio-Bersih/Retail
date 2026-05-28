import Elysia from 'elysia'
import { appendFileSync, mkdirSync, existsSync } from 'fs'

const LOG_DIRECTORY = './logs'

function ensureLogDirectoryExists(): void {
    if (!existsSync(LOG_DIRECTORY)) {
        mkdirSync(LOG_DIRECTORY, { recursive: true })
    }
}

function getFormattedTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function getTodayLogFilePath(): string {
    const todayDate = new Date().toISOString().slice(0, 10)
    return `${LOG_DIRECTORY}/${todayDate}.log`
}

export const loggerHook = new Elysia({ name: 'logger' })
    .onRequest(({ store }) => {
        (store as Record<string, unknown>).requestStartTime = Date.now()
    })
    .onAfterHandle(({ request, set, store }) => {
        const startTime   = (store as Record<string, unknown>).requestStartTime as number
        const elapsedMs   = Date.now() - startTime
        const httpMethod  = request.method.padEnd(7)
        const requestPath = new URL(request.url).pathname.padEnd(40)
        const statusCode  = (set.status ?? 200).toString()

        console.log(`[${getFormattedTimestamp()}] ${httpMethod} ${requestPath} → ${statusCode}  (${elapsedMs}ms)`)
    })
    .onError(({ request, error: caughtError, store, headers }) => {
        ensureLogDirectoryExists()

        const startTime    = (store as Record<string, unknown>).requestStartTime as number ?? Date.now()
        const requestId    = headers['x-request-id'] ?? 'unknown'
        const errorMessage = caughtError instanceof Error ? caughtError.message : String(caughtError)
        const errorStack   = caughtError instanceof Error ? caughtError.stack : undefined

        const logEntry = JSON.stringify({
            timestamp:  new Date().toISOString(),
            requestId,
            method:     request.method,
            path:       new URL(request.url).pathname,
            error:      errorMessage,
            stack:      errorStack,
            durationMs: Date.now() - startTime
        })

        appendFileSync(getTodayLogFilePath(), logEntry + '\n')
        console.error(`[${getFormattedTimestamp()}] ERROR ${new URL(request.url).pathname} — ${errorMessage}`)
    })
