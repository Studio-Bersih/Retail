import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'

// ── Own DB pool (3 connections — closed explicitly at exit) ───────────────
const queryClient = postgres(process.env.DATABASE_URL!, { max: 3, idle_timeout: 10 })
const db = drizzle(queryClient, { schema })

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)

function getArg(flag: string, fallback: string): string {
    const idx = args.indexOf(flag)
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const PHASE    = getArg('--phase', 'all')
const N        = parseInt(getArg('--concurrency', '10'))
const DURATION = parseInt(getArg('--duration', '5'))
const BASE_URL = getArg('--url', 'http://localhost:3000')
const JSON_MODE = args.includes('--json')

// ── Colors ─────────────────────────────────────────────────────────────────
const c = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    red:    '\x1b[31m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    orange: '\x1b[38;5;208m'
}

function phaseHeader(num: number, title: string) {
    console.log(`\n${c.bold}${c.cyan}Phase ${num} — ${title}${c.reset}`)
}

// ── HTTP helper ───────────────────────────────────────────────────────────
async function apiFetch(
    path: string,
    opts: { method?: string; body?: unknown; token?: string; idempotencyKey?: string; timeoutMs?: number } = {}
): Promise<Response> {
    const headers: Record<string, string> = {
        'Content-Type':  'application/json',
        'X-App-Version': '1.0.0'
    }
    if (opts.token)          headers['Authorization']     = `Bearer ${opts.token}`
    if (opts.idempotencyKey) headers['X-Idempotency-Key'] = opts.idempotencyKey

    const controller = new AbortController()
    const timer = opts.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined

    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            method:  opts.method ?? 'GET',
            headers,
            body:    opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal:  controller.signal
        })
        if (timer) clearTimeout(timer)
        return res
    } catch (err) {
        if (timer) clearTimeout(timer)
        throw err
    }
}

// ── Token pool ─────────────────────────────────────────────────────────────
interface TokenEntry { token: string; userId: string; outletId: string; username: string }
let tokenPool: TokenEntry[] = []

async function buildTokenPool(): Promise<void> {
    console.log(`\n${c.bold}Authenticating test users...${c.reset}`)
    const credentials = [
        { username: 'admin',   password: 'admin123'   },
        { username: 'manager', password: 'manager123' },
        { username: 'kasir1',  password: 'kasir123'   },
        { username: 'kasir2',  password: 'kasir123'   }
    ]
    for (const cred of credentials) {
        const res = await apiFetch('/api/auth/login', { method: 'POST', body: cred })
        if (!res.ok) throw new Error(`Login failed for ${cred.username}: HTTP ${res.status}`)
        const data = await res.json() as { token: string; user: { userId: string; outletId: string } }
        tokenPool.push({ token: data.token, userId: data.user.userId, outletId: data.user.outletId, username: cred.username })
        console.log(`  ${c.green}✓${c.reset} ${cred.username}`)
    }
}

function roundRobin(idx: number): TokenEntry { return tokenPool[idx % tokenPool.length] }
