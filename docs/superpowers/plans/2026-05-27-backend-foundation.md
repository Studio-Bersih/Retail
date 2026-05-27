# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `server/` Bun + Elysia.js project with PostgreSQL via Drizzle ORM, Redis, all infrastructure hooks, and a working auth endpoint — the foundation every subsequent backend plan builds on.

**Architecture:** The server lives at `server/` in the monorepo root. All requests flow through correlation → version → logger → auth hooks before reaching controllers. Controllers coordinate but never touch the database; models handle all DB access with every write inside `db.transaction()`. Auth uses JWT via `@elysiajs/jwt`.

**Tech Stack:** Bun, Elysia.js, Drizzle ORM, PostgreSQL (`postgres` driver), Redis (`ioredis`), `@elysiajs/jwt`, `@elysiajs/cors`, `@elysiajs/rate-limit`, `bun:test`

> **Naming rules enforced throughout:** camelCase everywhere. No single-letter variable names. Descriptive parameter names in every callback (`.map(item => ...)` not `.map(i => ...)`). Every `catch` block uses `caughtError` not `e`.

> **This is Plan 1 of 6.** Subsequent plans add domain endpoints on top of this foundation.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/package.json` | Create | Dependencies + scripts |
| `server/tsconfig.json` | Create | Bun TypeScript config |
| `server/drizzle.config.ts` | Create | Drizzle-kit config |
| `server/.env.example` | Create | Required env var template |
| `server/src/types/index.ts` | Create | Shared server-side types (JwtSession, PaginatedResponse) |
| `server/src/utils/env.ts` | Create | Startup env validation |
| `server/src/utils/constants.ts` | Create | APP_VERSION, ports, TTLs |
| `server/src/utils/errors.ts` | Create | Centralized error strings |
| `server/src/utils/messages.ts` | Create | Centralized success strings |
| `server/src/utils/password.ts` | Create | Bun.password wrappers |
| `server/src/utils/cache.ts` | Create | Redis client + helpers |
| `server/src/db/schema.ts` | Create | All Drizzle table definitions |
| `server/src/db/index.ts` | Create | Drizzle client + connection pool |
| `server/src/db/seed.ts` | Create | Initial data (outlets, users, payment methods) |
| `server/src/hooks/correlation.hook.ts` | Create | Attaches X-Request-ID to every request |
| `server/src/hooks/version.hook.ts` | Create | Blocks stale clients (X-App-Version check) |
| `server/src/hooks/logger.hook.ts` | Create | Console + file crash logging |
| `server/src/hooks/rateLimiter.hook.ts` | Create | Rate limit on auth endpoints |
| `server/src/hooks/idempotency.hook.ts` | Create | Redis-backed idempotency for POST /transactions and /orders |
| `server/src/hooks/auth.hook.ts` | Create | JWT bearer guard; derives session into context |
| `server/src/models/auth.model.ts` | Create | findUserByCredentials — db.transaction() |
| `server/src/controllers/auth.controller.ts` | Create | login — coordinates model + JWT sign |
| `server/src/routes/index.ts` | Create | All routes (auth only for now); TypeBox schemas |
| `server/src/index.ts` | Create | App entry; validateEnv, register plugins, listen |
| `server/src/routes/auth.test.ts` | Create | Integration tests via Elysia .handle() |
| `server/logs/.gitkeep` | Create | Ensures logs/ exists in git |

---

### Task 1: Project scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/drizzle.config.ts`
- Create: `server/.env.example`
- Create: `server/logs/.gitkeep`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "studio-bersih-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "db:generate": "bunx drizzle-kit generate",
    "db:migrate": "bunx drizzle-kit migrate",
    "db:seed": "bun run src/db/seed.ts",
    "db:studio": "bunx drizzle-kit studio"
  },
  "dependencies": {
    "elysia": "latest",
    "@elysiajs/jwt": "latest",
    "@elysiajs/cors": "latest",
    "@elysiajs/rate-limit": "latest",
    "drizzle-orm": "latest",
    "postgres": "latest",
    "ioredis": "latest"
  },
  "devDependencies": {
    "drizzle-kit": "latest",
    "@types/bun": "latest",
    "typescript": "latest"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `server/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    schema: './src/db/schema.ts',
    out: './src/db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL!
    }
})
```

- [ ] **Step 4: Create `server/.env.example`**

```
DATABASE_URL=postgresql://user:password@localhost:5432/studio_bersih
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here-minimum-32-characters
NODE_ENV=development
PORT=3000
```

Copy to `.env` and fill in real values. Never commit `.env`.

- [ ] **Step 5: Create `server/logs/.gitkeep`**

Create an empty file at `server/logs/.gitkeep`. Add `server/logs/*.log` to `.gitignore`.

- [ ] **Step 6: Install dependencies**

```bash
cd server && bun install
```

Expected: `node_modules/` created, `bun.lockb` generated, no errors.

- [ ] **Step 7: Commit**

```bash
git add server/
git commit -m "chore: scaffold server/ Bun + Elysia project"
```

---

### Task 2: Shared types + utility files

**Files:**
- Create: `server/src/types/index.ts`
- Create: `server/src/utils/env.ts`
- Create: `server/src/utils/constants.ts`
- Create: `server/src/utils/errors.ts`
- Create: `server/src/utils/messages.ts`
- Create: `server/src/utils/password.ts`
- Create: `server/src/utils/cache.ts`

- [ ] **Step 1: Create `server/src/types/index.ts`**

```typescript
export type UserRole = 'cashier' | 'manager' | 'admin'

export interface JwtSession {
    userId:   string
    userName: string
    role:     UserRole
    outletId: string
}

export interface PaginationParams {
    page:  number
    limit: number
}

export interface PaginatedResponse<RowData> {
    data: RowData[]
    meta: {
        page:       number
        limit:      number
        total:      number
        totalPages: number
    }
}
```

- [ ] **Step 2: Create `server/src/utils/env.ts`**

```typescript
const REQUIRED_ENV_VARS = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
] as const

export function validateEnv(): void {
    const missingVars = REQUIRED_ENV_VARS.filter(envVarName => !process.env[envVarName])
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
    }
}
```

- [ ] **Step 3: Create `server/src/utils/constants.ts`**

```typescript
export const APP_VERSION           = '1.0.0'
export const MIN_CLIENT_VERSION    = '1.0.0'
export const CACHE_TTL_CONFIG      = 3600   // 1 hour — outlets, payment-methods, transaction-types
export const CACHE_TTL_IDEMPOTENCY = 86400  // 24 hours — idempotency keys
export const DEV_PORT              = 3000
export const PROD_PORT             = 10565
export const CONNECTION_POOL_SIZE  = 20
```

- [ ] **Step 4: Create `server/src/utils/errors.ts`**

```typescript
export const Errors = {
    UNAUTHORIZED:         'useNotice.connection.unauthorized',
    FORBIDDEN:            'useNotice.connection.forbidden',
    NOT_FOUND:            'useNotice.connection.notFound',
    VALIDATION_FAILED:    'useNotice.connection.validationFailed',
    DUPLICATE_REQUEST:    'useNotice.connection.duplicateRequest',
    CLIENT_VERSION_STALE: 'useNotice.connection.clientVersionStale',
    SERVER_ERROR:         'useNotice.connection.serverError',
    COUPON_INVALID:       'useNotice.coupon.invalid',
    COUPON_EXPIRED:       'useNotice.coupon.expired',
    COUPON_EXHAUSTED:     'useNotice.coupon.exhausted',
    STOCK_INSUFFICIENT:   'useNotice.stock.insufficient',
} as const

export type ErrorKey = keyof typeof Errors
```

- [ ] **Step 5: Create `server/src/utils/messages.ts`**

```typescript
export const Messages = {
    LOGIN_SUCCESS:      'Berhasil masuk.',
    TRANSACTION_SAVED:  'Transaksi berhasil disimpan.',
    ORDER_SAVED:        'Pesanan berhasil disimpan.',
    ORDER_COMPLETED:    'Pesanan berhasil diselesaikan.',
    COUPON_APPLIED:     'Kupon berhasil diterapkan.',
    PT_SUBMITTED:       'Permintaan perbaikan berhasil dikirim.',
    PT_APPROVED:        'Perbaikan transaksi disetujui.',
    PT_REJECTED:        'Perbaikan transaksi ditolak.',
    SHIFT_OPENED:       'Shift berhasil dibuka.',
    SHIFT_CLOSED:       'Shift berhasil ditutup.',
} as const

export type MessageKey = keyof typeof Messages
```

- [ ] **Step 6: Create `server/src/utils/password.ts`**

```typescript
export async function hashPassword(plainPassword: string): Promise<string> {
    return Bun.password.hash(plainPassword, { algorithm: 'bcrypt', cost: 10 })
}

export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return Bun.password.verify(plainPassword, hashedPassword)
}
```

- [ ] **Step 7: Create `server/src/utils/cache.ts`**

```typescript
import Redis from 'ioredis'

export const redisClient = new Redis(process.env.REDIS_URL!, {
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (retryCount) => {
        if (retryCount > 3) return null
        return retryCount * 200
    }
})

export async function cacheGet<CachedValue>(cacheKey: string): Promise<CachedValue | null> {
    const cachedValue = await redisClient.get(cacheKey)
    if (!cachedValue) return null
    return JSON.parse(cachedValue) as CachedValue
}

export async function cacheSet(cacheKey: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redisClient.setex(cacheKey, ttlSeconds, JSON.stringify(value))
}

export async function cacheInvalidate(cacheKey: string): Promise<void> {
    await redisClient.del(cacheKey)
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd server && bun run --no-install src/utils/env.ts
```

Expected: no TypeScript errors printed. (File has no side effects at import time so nothing runs.)

- [ ] **Step 9: Commit**

```bash
git add server/src/
git commit -m "feat(server): add shared types and utility files"
```

---

### Task 3: Database schema + connection

**Files:**
- Create: `server/src/db/schema.ts`
- Create: `server/src/db/index.ts`

- [ ] **Step 1: Create `server/src/db/schema.ts`**

```typescript
import { pgTable, text, boolean, timestamp, integer, jsonb, numeric, uniqueIndex } from 'drizzle-orm/pg-core'

// ── Config / Auth ──────────────────────────────────────────────────────────

export const outlets = pgTable('outlets', {
    id:       text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name:     text('name').notNull(),
    location: text('location').notNull(),
    phone:    text('phone').notNull(),
    isActive: boolean('is_active').notNull().default(true)
})

export const users = pgTable('users', {
    id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    username:     text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name:         text('name').notNull(),
    role:         text('role', { enum: ['cashier', 'manager', 'admin'] }).notNull(),
    outletId:     text('outlet_id').notNull().references(() => outlets.id),
    isActive:     boolean('is_active').notNull().default(true),
    createdAt:    timestamp('created_at').notNull().defaultNow()
})

export const paymentMethods = pgTable('payment_methods', {
    id:       text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name:     text('name').notNull(),
    type:     text('type').notNull(),
    isActive: boolean('is_active').notNull().default(true)
})

export const transactionTypes = pgTable('transaction_types', {
    id:   text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    code: text('code').notNull().unique()
})

// ── Inventory ──────────────────────────────────────────────────────────────

export const items = pgTable('items', {
    id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    sku:         text('sku').notNull().unique(),
    name:        text('name').notNull(),
    category:    text('category').notNull(),
    itemType:    text('item_type', { enum: ['raw_material', 'finished_good', 'both'] }).notNull(),
    priceLevel1: numeric('price_level1', { precision: 15, scale: 0 }).notNull().default('0'),
    priceLevel2: numeric('price_level2', { precision: 15, scale: 0 }).notNull().default('0'),
    priceLevel3: numeric('price_level3', { precision: 15, scale: 0 }).notNull().default('0'),
    isActive:    boolean('is_active').notNull().default(true)
})

export const outletStock = pgTable('outlet_stock', {
    id:       text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    itemId:   text('item_id').notNull().references(() => items.id),
    outletId: text('outlet_id').notNull().references(() => outlets.id),
    quantity: integer('quantity').notNull().default(0)
}, (stockTable) => ({
    uniqueItemOutlet: uniqueIndex('outlet_stock_item_outlet_idx').on(stockTable.itemId, stockTable.outletId)
}))

// ── Members ────────────────────────────────────────────────────────────────

export const members = pgTable('members', {
    id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name:              text('name').notNull(),
    whatsapp:          text('whatsapp'),
    birthdate:         text('birthdate'),
    address:           text('address'),
    points:            integer('points').notNull().default(0),
    isPremium:         boolean('is_premium').notNull().default(false),
    lastTransactionAt: timestamp('last_transaction_at')
})

// ── Transactions ───────────────────────────────────────────────────────────

export const transactions = pgTable('transactions', {
    id:              text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    outletId:        text('outlet_id').notNull().references(() => outlets.id),
    userId:          text('user_id').notNull().references(() => users.id),
    memberId:        text('member_id').references(() => members.id),
    mode:            text('mode', { enum: ['retail', 'order'] }).notNull(),
    subtotal:        numeric('subtotal', { precision: 15, scale: 0 }).notNull(),
    kuponCode:       text('kupon_code'),
    kuponDiscount:   numeric('kupon_discount', { precision: 15, scale: 0 }).notNull().default('0'),
    additionalCosts: jsonb('additional_costs').notNull().default({ packaging: 0, transport: 0, modification: 0 }),
    total:           numeric('total', { precision: 15, scale: 0 }).notNull(),
    notes:           text('notes').notNull().default(''),
    status:          text('status', { enum: ['completed', 'pending', 'void'] }).notNull().default('completed'),
    createdAt:       timestamp('created_at').notNull().defaultNow()
})

export const transactionItems = pgTable('transaction_items', {
    id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull().references(() => transactions.id),
    itemId:        text('item_id').notNull().references(() => items.id),
    qty:           integer('qty').notNull(),
    price:         numeric('price', { precision: 15, scale: 0 }).notNull(),
    isFree:        boolean('is_free').notNull().default(false)
})

export const transactionPayments = pgTable('transaction_payments', {
    id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull().references(() => transactions.id),
    method:        text('method').notNull(),
    amount:        numeric('amount', { precision: 15, scale: 0 }).notNull()
})

// ── Orders (Pesanan) ───────────────────────────────────────────────────────

export const orders = pgTable('orders', {
    id:              text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    outletId:        text('outlet_id').notNull().references(() => outlets.id),
    userId:          text('user_id').notNull().references(() => users.id),
    memberId:        text('member_id').references(() => members.id),
    subtotal:        numeric('subtotal', { precision: 15, scale: 0 }).notNull(),
    kuponCode:       text('kupon_code'),
    kuponDiscount:   numeric('kupon_discount', { precision: 15, scale: 0 }).notNull().default('0'),
    additionalCosts: jsonb('additional_costs').notNull().default({ packaging: 0, transport: 0, modification: 0 }),
    total:           numeric('total', { precision: 15, scale: 0 }).notNull(),
    deposit:         numeric('deposit', { precision: 15, scale: 0 }).notNull().default('0'),
    remaining:       numeric('remaining', { precision: 15, scale: 0 }).notNull().default('0'),
    notes:           text('notes').notNull().default(''),
    status:          text('status', { enum: ['active', 'completed', 'cancelled'] }).notNull().default('active'),
    dueDate:         text('due_date'),
    createdAt:       timestamp('created_at').notNull().defaultNow()
})

export const orderItems = pgTable('order_items', {
    id:      text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id').notNull().references(() => orders.id),
    itemId:  text('item_id').notNull().references(() => items.id),
    qty:     integer('qty').notNull(),
    price:   numeric('price', { precision: 15, scale: 0 }).notNull(),
    isFree:  boolean('is_free').notNull().default(false)
})

// ── Coupons (Kupon) ────────────────────────────────────────────────────────

export const coupons = pgTable('coupons', {
    id:               text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    kode:             text('kode').notNull().unique(),
    nama:             text('nama').notNull(),
    kategori:         text('kategori', { enum: ['Public', 'Member-only', 'Personal', 'Staff/Internal'] }).notNull(),
    kodeMember:       text('kode_member'),
    outletIds:        jsonb('outlet_ids'),
    status:           text('status', { enum: ['Active', 'Inactive'] }).notNull().default('Active'),
    tanggalMulai:     text('tanggal_mulai').notNull(),
    tanggalBerakhir:  text('tanggal_berakhir'),
    minTransaksi:     numeric('min_transaksi', { precision: 15, scale: 0 }).notNull().default('0'),
    maxUses:          integer('max_uses'),
    maxUsesPerMember: integer('max_uses_per_member'),
    effects:          jsonb('effects').notNull(),
    codeType:         text('code_type', { enum: ['Standard', 'Batch', 'PersonalAuto'] }).notNull().default('Standard'),
    createdAt:        timestamp('created_at').notNull().defaultNow()
})

export const couponUsage = pgTable('coupon_usage', {
    id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    couponId:      text('coupon_id').notNull().references(() => coupons.id),
    transactionId: text('transaction_id').references(() => transactions.id),
    userId:        text('user_id').notNull().references(() => users.id),
    outletId:      text('outlet_id').notNull().references(() => outlets.id),
    usedAt:        timestamp('used_at').notNull().defaultNow()
})

// ── Promos ─────────────────────────────────────────────────────────────────

export const promos = pgTable('promos', {
    id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name:          text('name').notNull(),
    code:          text('code').notNull().unique(),
    discountType:  text('discount_type', { enum: ['percentage', 'fixed'] }).notNull(),
    discountValue: numeric('discount_value', { precision: 15, scale: 0 }).notNull(),
    minTransaction:numeric('min_transaction', { precision: 15, scale: 0 }).notNull().default('0'),
    startDate:     text('start_date').notNull(),
    endDate:       text('end_date'),
    isActive:      boolean('is_active').notNull().default(true)
})

// ── Kasir Harian ───────────────────────────────────────────────────────────

export const shifts = pgTable('shifts', {
    id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    outletId:       text('outlet_id').notNull().references(() => outlets.id),
    userId:         text('user_id').notNull().references(() => users.id),
    date:           text('date').notNull(),
    openingBalance: numeric('opening_balance', { precision: 15, scale: 0 }).notNull().default('0'),
    status:         text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
    openedAt:       timestamp('opened_at').notNull().defaultNow(),
    closedAt:       timestamp('closed_at')
})

export const shiftCounts = pgTable('shift_counts', {
    id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    shiftId:        text('shift_id').notNull().references(() => shifts.id),
    paymentMethod:  text('payment_method').notNull(),
    expectedAmount: numeric('expected_amount', { precision: 15, scale: 0 }).notNull(),
    actualAmount:   numeric('actual_amount', { precision: 15, scale: 0 }).notNull()
})

// ── Perbaikan Transaksi ────────────────────────────────────────────────────

export const ptRequests = pgTable('pt_requests', {
    id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull().references(() => transactions.id),
    requestedBy:   text('requested_by').notNull().references(() => users.id),
    reviewedBy:    text('reviewed_by').references(() => users.id),
    reason:        text('reason').notNull(),
    oldSnapshot:   jsonb('old_snapshot').notNull(),
    newSnapshot:   jsonb('new_snapshot'),
    status:        text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    createdAt:     timestamp('created_at').notNull().defaultNow(),
    reviewedAt:    timestamp('reviewed_at')
})

// ── Stock Movements ────────────────────────────────────────────────────────

export const stockMovements = pgTable('stock_movements', {
    id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    itemId:     text('item_id').notNull().references(() => items.id),
    outletId:   text('outlet_id').notNull().references(() => outlets.id),
    delta:      integer('delta').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId:   text('source_id'),
    createdBy:  text('created_by').notNull().references(() => users.id),
    createdAt:  timestamp('created_at').notNull().defaultNow()
})

// ── System ─────────────────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
    id:         text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId:     text('user_id').notNull().references(() => users.id),
    action:     text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId:   text('entity_id').notNull(),
    oldValue:   jsonb('old_value'),
    newValue:   jsonb('new_value'),
    requestId:  text('request_id'),
    createdAt:  timestamp('created_at').notNull().defaultNow()
})
```

- [ ] **Step 2: Create `server/src/db/index.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { CONNECTION_POOL_SIZE } from '../utils/constants'

const queryClient = postgres(process.env.DATABASE_URL!, {
    max:             CONNECTION_POOL_SIZE,
    idle_timeout:    30,
    connect_timeout: 10
})

export const db = drizzle(queryClient, { schema })
```

- [ ] **Step 3: Commit**

```bash
git add server/src/db/
git commit -m "feat(server): add full database schema and Drizzle client"
```

---

### Task 4: Migration + seed data

**Files:**
- Create: `server/src/db/migrations/` (generated)
- Create: `server/src/db/seed.ts`

- [ ] **Step 1: Create the database**

In PostgreSQL, create the database:
```sql
CREATE DATABASE studio_bersih;
```

- [ ] **Step 2: Generate migration**

```bash
cd server && bun run db:generate
```

Expected: `src/db/migrations/0000_initial.sql` created with all `CREATE TABLE` statements.

- [ ] **Step 3: Apply migration**

```bash
cd server && bun run db:migrate
```

Expected: `Applying migration 0000_initial` printed. All tables created in PostgreSQL.

- [ ] **Step 4: Create `server/src/db/seed.ts`**

```typescript
import { db } from './index'
import { outlets, users, paymentMethods, transactionTypes } from './schema'
import { hashPassword } from '../utils/password'

async function seed(): Promise<void> {
    console.log('Seeding database...')

    const [mainOutlet] = await db.insert(outlets).values({
        name:     'Outlet Utama',
        location: 'Jakarta',
        phone:    '021-1234567',
        isActive: true
    }).returning()

    const [secondOutlet] = await db.insert(outlets).values({
        name:     'Outlet Cabang',
        location: 'Bandung',
        phone:    '022-7654321',
        isActive: true
    }).returning()

    const adminPasswordHash    = await hashPassword('admin123')
    const managerPasswordHash  = await hashPassword('manager123')
    const cashierPasswordHash  = await hashPassword('kasir123')

    await db.insert(users).values([
        {
            username:     'admin',
            passwordHash: adminPasswordHash,
            name:         'Admin Pusat',
            role:         'admin',
            outletId:     mainOutlet.id,
            isActive:     true
        },
        {
            username:     'manager',
            passwordHash: managerPasswordHash,
            name:         'Budi Santoso',
            role:         'manager',
            outletId:     mainOutlet.id,
            isActive:     true
        },
        {
            username:     'kasir1',
            passwordHash: cashierPasswordHash,
            name:         'Rina Maharani',
            role:         'cashier',
            outletId:     mainOutlet.id,
            isActive:     true
        },
        {
            username:     'kasir2',
            passwordHash: cashierPasswordHash,
            name:         'Doni Pratama',
            role:         'cashier',
            outletId:     secondOutlet.id,
            isActive:     true
        },
    ])

    await db.insert(paymentMethods).values([
        { name: 'Tunai',         type: 'cash',     isActive: true },
        { name: 'QRIS',          type: 'qris',     isActive: true },
        { name: 'Transfer Bank', type: 'transfer', isActive: true },
        { name: 'Kartu Debit',   type: 'debit',    isActive: true },
    ])

    await db.insert(transactionTypes).values([
        { name: 'Retail',  code: 'retail' },
        { name: 'Pesanan', code: 'order' },
    ])

    console.log('Seeding complete.')
    process.exit(0)
}

seed().catch((caughtError) => {
    console.error('Seed failed:', caughtError)
    process.exit(1)
})
```

- [ ] **Step 5: Run seed**

```bash
cd server && bun run db:seed
```

Expected:
```
Seeding database...
Seeding complete.
```

- [ ] **Step 6: Commit**

```bash
git add server/src/db/
git commit -m "feat(server): add initial migration and seed data"
```

---

### Task 5: All hooks

**Files:**
- Create: `server/src/hooks/correlation.hook.ts`
- Create: `server/src/hooks/version.hook.ts`
- Create: `server/src/hooks/logger.hook.ts`
- Create: `server/src/hooks/rateLimiter.hook.ts`
- Create: `server/src/hooks/idempotency.hook.ts`
- Create: `server/src/hooks/auth.hook.ts`

- [ ] **Step 1: Create `server/src/hooks/correlation.hook.ts`**

```typescript
import Elysia from 'elysia'

export const correlationHook = new Elysia({ name: 'correlation' })
    .derive(({ headers }) => {
        const requestId = headers['x-request-id'] ?? crypto.randomUUID()
        return { requestId }
    })
```

- [ ] **Step 2: Create `server/src/hooks/version.hook.ts`**

```typescript
import Elysia from 'elysia'
import { MIN_CLIENT_VERSION } from '../utils/constants'
import { Errors } from '../utils/errors'

function isVersionSufficient(clientVersion: string, minimumVersion: string): boolean {
    const clientParts  = clientVersion.split('.').map(Number)
    const minimumParts = minimumVersion.split('.').map(Number)

    for (let partIndex = 0; partIndex < 3; partIndex++) {
        const clientPart  = clientParts[partIndex]  ?? 0
        const minimumPart = minimumParts[partIndex] ?? 0
        if (clientPart > minimumPart) return true
        if (clientPart < minimumPart) return false
    }
    return true
}

export const versionHook = new Elysia({ name: 'version' })
    .onBeforeHandle(({ headers, error }) => {
        const clientVersion = headers['x-app-version']
        if (!clientVersion) return error(426, { message: Errors.CLIENT_VERSION_STALE })
        if (!isVersionSufficient(clientVersion, MIN_CLIENT_VERSION)) {
            return error(426, { message: Errors.CLIENT_VERSION_STALE })
        }
    })
```

- [ ] **Step 3: Create `server/src/hooks/logger.hook.ts`**

```typescript
import Elysia from 'elysia'
import { appendFileSync, mkdirSync, existsSync } from 'fs'

const LOG_DIRECTORY = './logs'

function ensureLogDirectoryExists(): void {
    if (!existsSync(LOG_DIRECTORY)) mkdirSync(LOG_DIRECTORY, { recursive: true })
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

        const startTime = (store as Record<string, unknown>).requestStartTime as number ?? Date.now()
        const requestId = headers['x-request-id'] ?? 'unknown'
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
```

- [ ] **Step 4: Create `server/src/hooks/rateLimiter.hook.ts`**

```typescript
import Elysia from 'elysia'
import rateLimit from '@elysiajs/rate-limit'

export const rateLimiterHook = new Elysia({ name: 'rate-limiter' })
    .use(rateLimit({
        duration:      60000,
        max:           10,
        errorResponse: { message: 'Terlalu banyak percobaan. Tunggu satu menit.' }
    }))
```

- [ ] **Step 5: Create `server/src/hooks/idempotency.hook.ts`**

```typescript
import Elysia from 'elysia'
import { redisClient, cacheSet } from '../utils/cache'
import { Errors } from '../utils/errors'
import { CACHE_TTL_IDEMPOTENCY } from '../utils/constants'

export const idempotencyHook = new Elysia({ name: 'idempotency' })
    .onBeforeHandle(async ({ headers, error }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (!idempotencyKey) return error(400, { message: 'X-Idempotency-Key header is required.' })

        const cachedResponse = await redisClient.get(`idempotency:${idempotencyKey}`)
        if (cachedResponse) return JSON.parse(cachedResponse)
    })
    .onAfterHandle(async ({ headers, response }) => {
        const idempotencyKey = headers['x-idempotency-key']
        if (idempotencyKey && response) {
            await cacheSet(`idempotency:${idempotencyKey}`, response, CACHE_TTL_IDEMPOTENCY)
        }
    })
```

- [ ] **Step 6: Create `server/src/hooks/auth.hook.ts`**

```typescript
import Elysia from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { Errors } from '../utils/errors'
import type { JwtSession } from '../types'

export const authGuard = new Elysia({ name: 'auth-guard' })
    .use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }))
    .derive(async ({ headers, jwt: jwtPlugin, error }) => {
        const authorizationHeader = headers.authorization
        if (!authorizationHeader?.startsWith('Bearer ')) {
            return error(401, { message: Errors.UNAUTHORIZED })
        }

        const bearerToken    = authorizationHeader.replace('Bearer ', '')
        const verifiedPayload = await jwtPlugin.verify(bearerToken)
        if (!verifiedPayload) return error(401, { message: Errors.UNAUTHORIZED })

        return { session: verifiedPayload as JwtSession }
    })
```

- [ ] **Step 7: Commit**

```bash
git add server/src/hooks/
git commit -m "feat(server): add all request lifecycle hooks"
```

---

### Task 6: Auth model + controller (TDD)

**Files:**
- Create: `server/src/models/auth.model.ts`
- Create: `server/src/controllers/auth.controller.ts`

> **Prerequisite:** Database must be running and seeded (Task 4 complete).

- [ ] **Step 1: Write the failing test**

Create `server/src/models/auth.model.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { findUserByCredentials } from './auth.model'

describe('findUserByCredentials', () => {
    it('returns user for valid admin credentials', async () => {
        const foundUser = await findUserByCredentials('admin', 'admin123')
        expect(foundUser).not.toBeNull()
        expect(foundUser?.role).toBe('admin')
        expect(foundUser?.name).toBe('Admin Pusat')
    })

    it('returns user for valid cashier credentials', async () => {
        const foundUser = await findUserByCredentials('kasir1', 'kasir123')
        expect(foundUser).not.toBeNull()
        expect(foundUser?.role).toBe('cashier')
    })

    it('returns null for wrong password', async () => {
        const foundUser = await findUserByCredentials('admin', 'wrongpassword')
        expect(foundUser).toBeNull()
    })

    it('returns null for unknown username', async () => {
        const foundUser = await findUserByCredentials('nonexistent', 'anypassword')
        expect(foundUser).toBeNull()
    })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd server && bun test src/models/auth.model.test.ts
```

Expected: FAIL — `Cannot find module './auth.model'`

- [ ] **Step 3: Create `server/src/models/auth.model.ts`**

```typescript
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword } from '../utils/password'

export async function findUserByCredentials(username: string, password: string) {
    return db.transaction(async (databaseTransaction) => {
        const [foundUser] = await databaseTransaction
            .select()
            .from(users)
            .where(eq(users.username, username))

        if (!foundUser || !foundUser.isActive) return null

        const isValidPassword = await verifyPassword(password, foundUser.passwordHash)
        return isValidPassword ? foundUser : null
    })
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd server && bun test src/models/auth.model.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Create `server/src/controllers/auth.controller.ts`**

```typescript
import { Errors } from '../utils/errors'
import { Messages } from '../utils/messages'
import { findUserByCredentials } from '../models/auth.model'

export async function login(context: {
    body: { username: string; password: string }
    jwt: { sign: (payload: object) => Promise<string> }
    error: (statusCode: number, body: unknown) => unknown
}) {
    const foundUser = await findUserByCredentials(context.body.username, context.body.password)
    if (!foundUser) return context.error(401, { message: Errors.UNAUTHORIZED })

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
```

- [ ] **Step 6: Commit**

```bash
git add server/src/models/ server/src/controllers/
git commit -m "feat(server): add auth model and controller with tests"
```

---

### Task 7: Routes + app entry point

**Files:**
- Create: `server/src/routes/index.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Create `server/src/routes/index.ts`**

```typescript
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

    // ── Protected routes — authGuard applied to everything below ──────────
    .use(authGuard)
    // Subsequent plans mount their routes here
```

- [ ] **Step 2: Create `server/src/index.ts`**

```typescript
import Elysia from 'elysia'
import { cors } from '@elysiajs/cors'
import { validateEnv } from './utils/env'
import { correlationHook } from './hooks/correlation.hook'
import { versionHook } from './hooks/version.hook'
import { loggerHook } from './hooks/logger.hook'
import { routes } from './routes'
import { DEV_PORT, PROD_PORT, APP_VERSION } from './utils/constants'

validateEnv()

export const app = new Elysia()
    .use(cors())
    .use(correlationHook)
    .use(loggerHook)
    .get('/health', () => ({
        status:  'ok',
        version: APP_VERSION,
        env:     process.env.NODE_ENV ?? 'development'
    }))
    .use(versionHook)
    .use(routes)

const serverPort = process.env.NODE_ENV === 'production' ? PROD_PORT : DEV_PORT

app.listen(serverPort, () => {
    console.log(`🚀 Studio Bersih API → http://localhost:${serverPort}  [${process.env.NODE_ENV ?? 'development'}]`)
})
```

- [ ] **Step 3: Start the server**

```bash
cd server && bun run dev
```

Expected:
```
🚀 Studio Bersih API → http://localhost:3000  [development]
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/ server/src/index.ts
git commit -m "feat(server): add routes and app entry point"
```

---

### Task 8: Integration tests + smoke test

**Files:**
- Create: `server/src/routes/auth.test.ts`

> Tests use Elysia's `.handle()` method which runs the full request lifecycle without a network call. PostgreSQL and Redis must be running and the database must be seeded.

- [ ] **Step 1: Create `server/src/routes/auth.test.ts`**

```typescript
import { describe, it, expect } from 'bun:test'
import { app } from '../index'

const BASE_HEADERS = {
    'Content-Type':  'application/json',
    'X-App-Version': '1.0.0',
    'X-Request-ID':  crypto.randomUUID()
}

describe('POST /api/auth/login', () => {
    it('returns 200 and token for valid credentials', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: BASE_HEADERS,
                body:    JSON.stringify({ username: 'admin', password: 'admin123' })
            })
        )
        const responseData = await response.json() as { token: string; user: { role: string } }

        expect(response.status).toBe(200)
        expect(responseData.token).toBeTruthy()
        expect(responseData.user.role).toBe('admin')
    })

    it('returns 401 for wrong password', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: BASE_HEADERS,
                body:    JSON.stringify({ username: 'admin', password: 'wrongpassword' })
            })
        )
        expect(response.status).toBe(401)
    })

    it('returns 426 when X-App-Version header is missing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ username: 'admin', password: 'admin123' })
            })
        )
        expect(response.status).toBe(426)
    })

    it('returns 422 when password field is missing', async () => {
        const response = await app.handle(
            new Request('http://localhost/api/auth/login', {
                method:  'POST',
                headers: BASE_HEADERS,
                body:    JSON.stringify({ username: 'admin' })
            })
        )
        expect(response.status).toBe(422)
    })

    it('returns 200 from health check', async () => {
        const response = await app.handle(
            new Request('http://localhost/health')
        )
        const responseData = await response.json() as { status: string }
        expect(response.status).toBe(200)
        expect(responseData.status).toBe('ok')
    })
})
```

- [ ] **Step 2: Run integration tests**

```bash
cd server && bun test src/routes/auth.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 3: Smoke test with curl**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-App-Version: 1.0.0" \
  -d '{"username":"admin","password":"admin123"}'
```

Expected response:
```json
{
  "message": "Berhasil masuk.",
  "token": "eyJ...",
  "user": { "userId": "...", "userName": "Admin Pusat", "role": "admin", "outletId": "..." }
}
```

- [ ] **Step 4: Verify console log output**

Expected in terminal running `bun run dev`:
```
[2026-05-27 18:34:02] POST    /api/auth/login                          → 200  (87ms)
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/auth.test.ts
git commit -m "test(server): add auth integration tests"
```
