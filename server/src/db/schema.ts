import { pgTable, text, boolean, timestamp, integer, jsonb, numeric, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

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
    id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    itemId:      text('item_id').notNull().references(() => items.id),
    outletId:    text('outlet_id').notNull().references(() => outlets.id),
    stock:       integer('stock').notNull().default(0),
    preAdjDelta: integer('pre_adj_delta').notNull().default(0)
    // display stock = stock + preAdjDelta — never read stock column directly
}, (stockTable) => [
    uniqueIndex('outlet_stock_item_outlet_idx').on(stockTable.itemId, stockTable.outletId)
])

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
    kupon:           jsonb('kupon'),
    additionalCosts: jsonb('additional_costs').notNull().default({ packaging: 0, transport: 0, modification: 0 }),
    total:           numeric('total', { precision: 15, scale: 0 }).notNull(),
    notes:           text('notes').notNull().default(''),
    kategoriAcara:   varchar('kategori_acara', { length: 100 }),
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
    kupon:           jsonb('kupon'),
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
    minTransaksi:    numeric('min_transaksi', { precision: 15, scale: 0 }).notNull().default('0'),
    kuotaTotal:      integer('kuota_total').notNull().default(0),
    kuotaPerMember:  integer('kuota_per_member').notNull().default(0),
    butuhOtorisasi:  boolean('butuh_otorisasi').notNull().default(false),
    syaratKetentuan: text('syarat_ketentuan'),
    effects:         jsonb('effects').notNull(),
    codeType:         text('code_type', { enum: ['Standard', 'Batch', 'PersonalAuto'] }).notNull().default('Standard'),
    createdAt:        timestamp('created_at').notNull().defaultNow()
})

export const kuponCodePool = pgTable('kupon_code_pool', {
    id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    kuponKode:     text('kupon_kode').notNull().references(() => coupons.kode),
    code:          text('code').notNull().unique(),
    kodeMember:    text('kode_member'),
    usedAt:        text('used_at'),
    transactionId: text('transaction_id').references(() => transactions.id)
})

export const kuponLog = pgTable('kupon_log', {
    id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    kodeKupon:     text('kode_kupon').notNull(),
    idTransaksi:   text('id_transaksi'),
    kodeMember:    text('kode_member'),
    nipKasir:      text('nip_kasir').notNull(),
    nipOtorisasi:  text('nip_otorisasi'),
    nilaiPotongan: numeric('nilai_potongan', { precision: 15, scale: 0 }).notNull(),
    cartMutations: jsonb('cart_mutations').notNull(),
    totalSebelum:  numeric('total_sebelum', { precision: 15, scale: 0 }).notNull(),
    totalSesudah:  numeric('total_sesudah', { precision: 15, scale: 0 }).notNull(),
    outlet:        text('outlet').notNull(),
    logType:       text('log_type', { enum: ['Applied', 'AuthFailed'] }).notNull(),
    timestamp:     text('timestamp').notNull()
})

// ── Promos ─────────────────────────────────────────────────────────────────

export const promos = pgTable('promos', {
    id:             text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name:           text('name').notNull(),
    code:           text('code').notNull().unique(),
    discountType:   text('discount_type', { enum: ['percentage', 'fixed'] }).notNull(),
    discountValue:  numeric('discount_value', { precision: 15, scale: 0 }).notNull(),
    minTransaction: numeric('min_transaction', { precision: 15, scale: 0 }).notNull().default('0'),
    startDate:      text('start_date').notNull(),
    endDate:        text('end_date'),
    isActive:       boolean('is_active').notNull().default(true)
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
}, (t) => [
    uniqueIndex('shifts_outlet_date_idx').on(t.outletId, t.date)
])

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
