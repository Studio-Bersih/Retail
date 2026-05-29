# Retail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Retail POS page — product search, cart management, member lookup, pricing panel, and payment modal — as a single-cart SvelteKit page against the existing backend API.

**Architecture:** Two files: `+page.svelte` (orchestrator with four `{#snippet}` sections: searchField, memberField, pricingPanel, cartRows) and `PaymentModal.svelte` (isolated modal component). All cart state lives in a Svelte writable store. The backend already has all required endpoints; this task also adds the `kategori_acara` column to the transactions table.

**Tech Stack:** SvelteKit 2, Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`, `{#snippet}`), TypeScript, TailwindCSS + DaisyUI, Vitest (frontend unit tests), Bun test (backend integration tests).

---

## File Map

| File | Action |
|---|---|
| `server/src/db/schema.ts` | Modify — add `kategoriAcara` column to `transactions` table |
| `server/src/models/transactions.model.ts` | Modify — add `kategoriAcara` to `NewTransactionPayload` and insert |
| `server/src/routes/index.ts` | Modify — add `kategoriAcara` to POST /api/transactions body schema |
| `server/src/routes/transactions.test.ts` | Modify — add test asserting `kategoriAcara` is saved |
| `src/library/types/Cart.ts` | Create — `CartItem` and `CartState` interfaces |
| `src/library/stores/cart.ts` | Create — writable cart store + `addItem`, `removeItem`, `setQty`, `setMember`, `clearMember`, `clearCart` |
| `src/library/stores/cart.test.ts` | Create — unit tests for cart store helpers |
| `src/library/mock/items.ts` | Create — 20 mock items with varied stock and preAdjDelta |
| `src/library/mock/members.ts` | Create — 10 mock members, mix of regular and premium |
| `src/library/mock/payment-methods.ts` | Create — provider name list |
| `src/library/components/outlet/retail/PaymentModal.svelte` | Create — full payment modal |
| `src/routes/outlet/retail/+page.svelte` | Modify — replace skeleton with full implementation |

---

## Task 1: Backend — Add `kategoriAcara` to Transactions

**Files:**
- Modify: `server/src/db/schema.ts`
- Modify: `server/src/models/transactions.model.ts`
- Modify: `server/src/routes/index.ts`
- Modify: `server/src/routes/transactions.test.ts`

- [ ] **Step 1: Add column to schema**

In `server/src/db/schema.ts`, add `kategoriAcara` after the `notes` field in the `transactions` table:

```typescript
notes:           text('notes').notNull().default(''),
kategoriAcara:   varchar('kategori_acara', { length: 100 }),
status:          text('status', { enum: ['completed', 'pending', 'void'] }).notNull().default('completed'),
```

Also add `varchar` to the drizzle-orm import at the top of the file if not already present:
```typescript
import { pgTable, text, numeric, integer, boolean, timestamp, jsonb, unique, varchar } from 'drizzle-orm/pg-core'
```

- [ ] **Step 2: Add `kategoriAcara` to `NewTransactionPayload` interface**

In `server/src/models/transactions.model.ts`, update the interface:

```typescript
export interface NewTransactionPayload {
    memberId:        string | null
    mode:            'retail' | 'order'
    items: Array<{
        id:     string
        qty:    number
        price:  number
        isFree: boolean
    }>
    subtotal:        number
    kupon:           { kode: string; nilaiPotongan: number; cartMutations: unknown; authNip: string | null } | null
    additionalCosts: { packaging: number; transport: number; modification: number }
    total:           number
    notes:           string
    kategoriAcara:   string | null
    paymentMethods:  Array<{ method: string; amount: number }>
}
```

- [ ] **Step 3: Pass `kategoriAcara` into the insert**

In `server/src/models/transactions.model.ts`, inside `saveTransaction`, update the `db.insert(transactions).values({...})` call to include:

```typescript
const [savedTransaction] = await databaseTransaction
    .insert(transactions)
    .values({
        outletId:        session.outletId,
        userId:          session.userId,
        memberId:        payload.memberId,
        mode:            payload.mode,
        subtotal:        String(payload.subtotal),
        kupon:           payload.kupon,
        additionalCosts: payload.additionalCosts,
        total:           String(payload.total),
        notes:           payload.notes,
        kategoriAcara:   payload.kategoriAcara ?? null,
        status:          'completed'
    })
    .returning()
```

- [ ] **Step 4: Add `kategoriAcara` to route body schema**

In `server/src/routes/index.ts`, update the POST `/transactions` body to include:

```typescript
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
    kategoriAcara:   t.Optional(t.Nullable(t.String())),
    paymentMethods:  t.Array(t.Object({
        method: t.String(),
        amount: t.Number()
    }))
})
```

- [ ] **Step 5: Run migration**

Run from `server/`:
```bash
cd server && bun run db:push
```
Expected: schema pushed, `kategori_acara` column added to `transactions` table.

If `db:push` is not available, check `server/package.json` for the exact script name (may be `db:migrate` or `drizzle-kit push`).

- [ ] **Step 6: Add backend test for `kategoriAcara`**

In `server/src/routes/transactions.test.ts`, add this test inside the `describe('POST /api/transactions')` block, after the existing free-item test:

```typescript
it('saves kategoriAcara when provided', async () => {
    const idempotencyKey = crypto.randomUUID()
    const response = await app.handle(
        new Request('http://localhost/api/transactions', {
            method:  'POST',
            headers: { ...authHeaders, 'X-Idempotency-Key': idempotencyKey },
            body: JSON.stringify({
                memberId:        null,
                mode:            'retail',
                items:           [{ id: testItemId, qty: 1, price: 20000, isFree: false }],
                subtotal:        20000,
                kupon:           null,
                additionalCosts: { packaging: 0, transport: 0, modification: 0 },
                total:           20000,
                notes:           '',
                kategoriAcara:   'Pernikahan',
                paymentMethods:  [{ method: 'Tunai', amount: 20000 }]
            })
        })
    )
    const data = await response.json() as { id: string }
    expect(response.status).toBe(201)

    const [saved] = await db.select({ kategoriAcara: transactions.kategoriAcara })
        .from(transactions).where(eq(transactions.id, data.id))
    expect(saved.kategoriAcara).toBe('Pernikahan')

    await db.delete(auditLog).where(eq(auditLog.entityId, data.id))
    await db.delete(stockMovements).where(eq(stockMovements.sourceId, data.id))
    await db.delete(transactionPayments).where(eq(transactionPayments.transactionId, data.id))
    await db.delete(transactionItems).where(eq(transactionItems.transactionId, data.id))
    await db.delete(transactions).where(eq(transactions.id, data.id))
})
```

Also add `transactions` to the existing import:
```typescript
import { items, outletStock, transactions, transactionItems, transactionPayments, stockMovements, auditLog } from '../db/schema'
```
(It is likely already imported — verify and skip if so.)

- [ ] **Step 7: Run backend tests**

```bash
cd server && bun test src/routes/transactions.test.ts
```
Expected: all tests pass including the new one.

- [ ] **Step 8: Commit**

```bash
git add server/src/db/schema.ts server/src/models/transactions.model.ts server/src/routes/index.ts server/src/routes/transactions.test.ts
git commit -m "feat(backend): add kategori_acara column to transactions"
```

---

## Task 2: Cart Types and Store

**Files:**
- Create: `src/library/types/Cart.ts`
- Create: `src/library/stores/cart.ts`
- Create: `src/library/stores/cart.test.ts`

- [ ] **Step 1: Create `Cart.ts` types**

```typescript
// src/library/types/Cart.ts
export interface CartItem {
    id:          string
    name:        string
    sku:         string
    price:       number
    qty:         number
    isFree:      boolean
    stock:       number
    preAdjDelta: number
}

export interface CartState {
    items:           CartItem[]
    memberId:        string | null
    memberName:      string | null
    memberPhone:     string | null
    isPremiumMember: boolean
    percentDiscount: number
    fixedDiscount:   number
    additionalCosts: { packaging: number; transport: number; modification: number }
    paymentMethods:  Array<{ method: string; amount: number }>
    kategoriAcara:   string
    notes:           string
}
```

- [ ] **Step 2: Create `cart.ts` store**

```typescript
// src/library/stores/cart.ts
import { writable } from 'svelte/store'
import type { CartItem, CartState } from '$library/types/Cart'

const initial: CartState = {
    items:           [],
    memberId:        null,
    memberName:      null,
    memberPhone:     null,
    isPremiumMember: false,
    percentDiscount: 0,
    fixedDiscount:   0,
    additionalCosts: { packaging: 0, transport: 0, modification: 0 },
    paymentMethods:  [{ method: 'Tunai', amount: 0 }],
    kategoriAcara:   'Private Event',
    notes:           '',
}

export const cart = writable<CartState>(structuredClone(initial))

export function addItem(item: CartItem): void {
    cart.update(state => {
        const existing = state.items.find(i => i.id === item.id && i.isFree === item.isFree)
        if (existing) {
            return {
                ...state,
                items: state.items.map(i =>
                    i.id === item.id && i.isFree === item.isFree
                        ? { ...i, qty: i.qty + item.qty }
                        : i
                )
            }
        }
        return { ...state, items: [...state.items, item] }
    })
}

export function removeItem(id: string, isFree: boolean): void {
    cart.update(state => ({
        ...state,
        items: state.items.filter(i => !(i.id === id && i.isFree === isFree))
    }))
}

export function setQty(id: string, isFree: boolean, qty: number): void {
    if (qty <= 0) {
        removeItem(id, isFree)
        return
    }
    cart.update(state => ({
        ...state,
        items: state.items.map(i =>
            i.id === id && i.isFree === isFree ? { ...i, qty } : i
        )
    }))
}

export function setMember(id: string, name: string, phone: string, isPremium: boolean): void {
    cart.update(state => ({ ...state, memberId: id, memberName: name, memberPhone: phone, isPremiumMember: isPremium }))
}

export function clearMember(): void {
    cart.update(state => ({ ...state, memberId: null, memberName: null, memberPhone: null, isPremiumMember: false }))
}

export function clearCart(): void {
    cart.set(structuredClone(initial))
}
```

- [ ] **Step 3: Write cart store tests**

```typescript
// src/library/stores/cart.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { cart, addItem, removeItem, setQty, setMember, clearMember, clearCart } from './cart'
import type { CartItem } from '$library/types/Cart'

const makeItem = (overrides: Partial<CartItem> = {}): CartItem => ({
    id: 'item-1', name: 'Sabun', sku: 'SKU-001',
    price: 10000, qty: 1, isFree: false, stock: 50, preAdjDelta: 0,
    ...overrides
})

beforeEach(() => { clearCart() })

describe('addItem', () => {
    it('appends a new item', () => {
        addItem(makeItem())
        expect(get(cart).items).toHaveLength(1)
    })

    it('increments qty for same id + isFree combo', () => {
        addItem(makeItem({ qty: 2 }))
        addItem(makeItem({ qty: 3 }))
        expect(get(cart).items).toHaveLength(1)
        expect(get(cart).items[0].qty).toBe(5)
    })

    it('treats paid and free as separate rows', () => {
        addItem(makeItem({ isFree: false }))
        addItem(makeItem({ isFree: true, price: 0 }))
        expect(get(cart).items).toHaveLength(2)
    })
})

describe('removeItem', () => {
    it('removes matching row', () => {
        addItem(makeItem())
        removeItem('item-1', false)
        expect(get(cart).items).toHaveLength(0)
    })

    it('does not remove free row when targeting paid row', () => {
        addItem(makeItem({ isFree: false }))
        addItem(makeItem({ isFree: true, price: 0 }))
        removeItem('item-1', false)
        expect(get(cart).items).toHaveLength(1)
        expect(get(cart).items[0].isFree).toBe(true)
    })
})

describe('setQty', () => {
    it('updates qty', () => {
        addItem(makeItem({ qty: 2 }))
        setQty('item-1', false, 5)
        expect(get(cart).items[0].qty).toBe(5)
    })

    it('removes row when qty is 0', () => {
        addItem(makeItem())
        setQty('item-1', false, 0)
        expect(get(cart).items).toHaveLength(0)
    })
})

describe('setMember / clearMember', () => {
    it('sets member fields', () => {
        setMember('M01', 'Sari', '0812', true)
        const s = get(cart)
        expect(s.memberId).toBe('M01')
        expect(s.isPremiumMember).toBe(true)
    })

    it('clears member fields', () => {
        setMember('M01', 'Sari', '0812', true)
        clearMember()
        expect(get(cart).memberId).toBeNull()
    })
})

describe('clearCart', () => {
    it('resets to initial state', () => {
        addItem(makeItem())
        setMember('M01', 'Sari', '0812', false)
        clearCart()
        const s = get(cart)
        expect(s.items).toHaveLength(0)
        expect(s.memberId).toBeNull()
        expect(s.kategoriAcara).toBe('Private Event')
    })
})
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
npm test -- src/library/stores/cart.test.ts
```
Expected: FAIL — `cart.ts` not yet implemented (file exists but test may fail on import).

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- src/library/stores/cart.test.ts
```
Expected: all 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/library/types/Cart.ts src/library/stores/cart.ts src/library/stores/cart.test.ts
git commit -m "feat: add CartItem types and cart writable store with helpers"
```

---

## Task 3: Mock Data

**Files:**
- Create: `src/library/mock/items.ts`
- Create: `src/library/mock/members.ts`
- Create: `src/library/mock/payment-methods.ts`

- [ ] **Step 1: Create `mock/items.ts`**

```typescript
// src/library/mock/items.ts
export interface MockItem {
    id:          string
    sku:         string
    name:        string
    category:    string
    price:       number
    stock:       number
    preAdjDelta: number
}

const ITEMS: MockItem[] = [
    { id: 'I001', sku: 'SKU-001', name: 'Sabun Cuci Muka Premium',   category: 'Perawatan Wajah', price: 75000,  stock: 48, preAdjDelta:  5 },
    { id: 'I002', sku: 'SKU-002', name: 'Pelembab Wajah SPF 30',     category: 'Perawatan Wajah', price: 25000,  stock:  7, preAdjDelta: -2 },
    { id: 'I003', sku: 'SKU-003', name: 'Serum Vitamin C 30ml',      category: 'Perawatan Wajah', price: 150000, stock:  2, preAdjDelta:  0 },
    { id: 'I004', sku: 'SKU-004', name: 'Toner Niacinamide 200ml',   category: 'Perawatan Wajah', price: 89000,  stock: 23, preAdjDelta:  0 },
    { id: 'I005', sku: 'SKU-005', name: 'Sunscreen SPF 50 PA+++',    category: 'Perawatan Wajah', price: 120000, stock: 15, preAdjDelta:  3 },
    { id: 'I006', sku: 'SKU-006', name: 'Eye Cream Anti Aging',      category: 'Perawatan Wajah', price: 200000, stock:  4, preAdjDelta:  0 },
    { id: 'I007', sku: 'SKU-007', name: 'Sabun Cuci Tangan 200ml',   category: 'Perawatan Tubuh', price: 25000,  stock: 32, preAdjDelta:  0 },
    { id: 'I008', sku: 'SKU-008', name: 'Sabun Cuci Tangan 500ml',   category: 'Perawatan Tubuh', price: 45000,  stock: 15, preAdjDelta:  0 },
    { id: 'I009', sku: 'SKU-009', name: 'Body Lotion Brightening',   category: 'Perawatan Tubuh', price: 65000,  stock: 20, preAdjDelta: -1 },
    { id: 'I010', sku: 'SKU-010', name: 'Deodorant Roll-On 50ml',    category: 'Perawatan Tubuh', price: 35000,  stock: 40, preAdjDelta:  0 },
    { id: 'I011', sku: 'SKU-011', name: 'Shampoo Anti Dandruff',     category: 'Perawatan Rambut', price: 55000,  stock: 18, preAdjDelta:  2 },
    { id: 'I012', sku: 'SKU-012', name: 'Kondisioner Rambut 300ml',  category: 'Perawatan Rambut', price: 45000,  stock: 12, preAdjDelta:  0 },
    { id: 'I013', sku: 'SKU-013', name: 'Hair Serum Anti Frizz',     category: 'Perawatan Rambut', price: 95000,  stock:  3, preAdjDelta:  0 },
    { id: 'I014', sku: 'SKU-014', name: 'Masker Rambut 200ml',       category: 'Perawatan Rambut', price: 70000,  stock: 25, preAdjDelta:  0 },
    { id: 'I015', sku: 'SKU-015', name: 'Lip Balm SPF 15',           category: 'Perawatan Bibir', price: 30000,  stock: 60, preAdjDelta:  0 },
    { id: 'I016', sku: 'SKU-016', name: 'Pelindung Bibir Beeswax',   category: 'Perawatan Bibir', price: 25000,  stock: 35, preAdjDelta:  0 },
    { id: 'I017', sku: 'SKU-017', name: 'Micellar Water 250ml',      category: 'Pembersih',       price: 60000,  stock: 22, preAdjDelta:  1 },
    { id: 'I018', sku: 'SKU-018', name: 'Foam Cleanser Gentle',      category: 'Pembersih',       price: 80000,  stock:  5, preAdjDelta:  0 },
    { id: 'I019', sku: 'SKU-019', name: 'Makeup Remover Wipes 25s',  category: 'Pembersih',       price: 40000,  stock: 50, preAdjDelta:  0 },
    { id: 'I020', sku: 'SKU-020', name: 'Essence Brightening 100ml', category: 'Perawatan Wajah', price: 180000, stock:  8, preAdjDelta: -3 },
]

export function searchItems(query: string): MockItem[] {
    const q = query.toLowerCase().trim()
    if (!q) {
        return []
    }
    return ITEMS.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
    )
}

export function getItemBySku(sku: string): MockItem | undefined {
    return ITEMS.find(i => i.sku.toLowerCase() === sku.toLowerCase())
}
```

- [ ] **Step 2: Create `mock/members.ts`**

```typescript
// src/library/mock/members.ts
export interface MockMember {
    id:        string
    name:      string
    phone:     string
    isPremium: boolean
}

const MEMBERS: MockMember[] = [
    { id: 'MBR-00101', name: 'Sari Rahayu',       phone: '081234567890', isPremium: true  },
    { id: 'MBR-00102', name: 'Budi Santoso',       phone: '081298765432', isPremium: false },
    { id: 'MBR-00103', name: 'Lena Permata',       phone: '082112345678', isPremium: true  },
    { id: 'MBR-00104', name: 'Dewi Anggraini',     phone: '083187654321', isPremium: false },
    { id: 'MBR-00105', name: 'Rudi Hartono',       phone: '085612341234', isPremium: false },
    { id: 'MBR-00106', name: 'Fitri Handayani',    phone: '087711223344', isPremium: true  },
    { id: 'MBR-00107', name: 'Ahmad Fauzi',        phone: '089955667788', isPremium: false },
    { id: 'MBR-00108', name: 'Ningsih Wulandari',  phone: '081312345678', isPremium: false },
    { id: 'MBR-00109', name: 'Hendra Gunawan',     phone: '082387654321', isPremium: true  },
    { id: 'MBR-00110', name: 'Maya Kusuma',        phone: '085699887766', isPremium: false },
]

export function searchMembers(query: string): MockMember[] {
    const q = query.toLowerCase().trim()
    if (!q) {
        return []
    }
    return MEMBERS.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.phone.includes(q)
    )
}

export function getMemberById(id: string): MockMember | undefined {
    return MEMBERS.find(m => m.id.toLowerCase() === id.toLowerCase())
}

export function getMemberByPhone(phone: string): MockMember | undefined {
    const normalized = phone.replace(/\D/g, '')
    return MEMBERS.find(m => m.phone.replace(/\D/g, '') === normalized)
}
```

- [ ] **Step 3: Create `mock/payment-methods.ts`**

```typescript
// src/library/mock/payment-methods.ts
export const PAYMENT_PROVIDERS: string[] = [
    'QRIS',
    'GoPay',
    'OVO',
    'Dana',
    'ShopeePay',
    'LinkAja',
    'BCA Transfer',
    'BRI Transfer',
    'BNI Transfer',
    'Mandiri Transfer',
]

export function getPaymentProviders(): string[] {
    return PAYMENT_PROVIDERS
}
```

- [ ] **Step 4: Verify TypeScript is happy**

```bash
npm run build 2>&1 | grep -i error | head -20
```
Expected: no errors related to the new mock files.

- [ ] **Step 5: Commit**

```bash
git add src/library/mock/items.ts src/library/mock/members.ts src/library/mock/payment-methods.ts
git commit -m "feat: add items, members, and payment-methods mock data"
```

---

## Task 4: Page Scaffold, Derived Values, and `{#snippet searchField()}`

**Files:**
- Modify: `src/routes/outlet/retail/+page.svelte`

This task replaces the skeleton and implements the full search interaction. Subsequent tasks add the remaining three snippets.

- [ ] **Step 1: Write the full page with searchField snippet**

Replace `src/routes/outlet/retail/+page.svelte` entirely:

```svelte
<script lang="ts">
    import { tick } from 'svelte'
    import { get } from 'svelte/store'
    import { auth } from '$library/stores/auth'
    import { cart, addItem, setQty, removeItem, setMember, clearMember, clearCart } from '$library/stores/cart'
    import { searchItems, getItemBySku, type MockItem } from '$library/mock/items'
    import { searchMembers, getMemberById, getMemberByPhone, type MockMember } from '$library/mock/members'
    import { getPaymentProviders } from '$library/mock/payment-methods'
    import { rupiahFormatter } from '$library/utils/formatter'
    import PaymentModal from '$library/components/outlet/retail/PaymentModal.svelte'

    // ── Search state ────────────────────────────────────
    let searchInput: HTMLInputElement
    let searchValue    = $state('')
    let searchResults  = $state<MockItem[]>([])
    let highlightIndex = $state(0)
    let highlightFree  = $state(false)
    let showDropdown   = $state(false)
    let qtyItem        = $state<MockItem | null>(null)
    let qtyFree        = $state(false)
    let qtyValue       = $state(1)
    let qtyInput: HTMLInputElement

    // ── Member state ────────────────────────────────────
    let memberValue       = $state('')
    let memberResults     = $state<MockMember[]>([])
    let memberHighlight   = $state(0)
    let showMemberDropdown = $state(false)
    let memberSelected    = $state(false)

    // ── Payment modal ───────────────────────────────────
    let payModalOpen = $state(false)

    // ── Pricing ─────────────────────────────────────────
    let biayaOpen = $state(true)

    // ── Derived values ───────────────────────────────────
    let subtotal      = $derived($cart.items.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.qty, 0))
    let discount      = $derived(subtotal * $cart.percentDiscount / 100 + $cart.fixedDiscount)
    let additionalTotal = $derived($cart.additionalCosts.packaging + $cart.additionalCosts.transport + $cart.additionalCosts.modification)
    let total         = $derived(Math.max(0, subtotal - discount + additionalTotal))
    let totalPaid     = $derived($cart.paymentMethods.reduce((s, m) => s + m.amount, 0))
    let kembalian     = $derived(totalPaid - total)

    // ── Search debounce ──────────────────────────────────
    const SKU_REGEX = /^[A-Z0-9]+-[A-Z0-9]+$/i

    $effect(() => {
        const val = searchValue.trim()
        if (!val) {
            searchResults = []
            showDropdown  = false
            qtyItem       = null
            return
        }
        if (qtyItem !== null) {
            return
        }
        if (SKU_REGEX.test(val)) {
            const found = getItemBySku(val)
            if (found) {
                openQtyPrompt(found, false)
            }
            return
        }
        const timer = setTimeout(() => {
            searchResults  = searchItems(val)
            highlightIndex = 0
            highlightFree  = false
            showDropdown   = searchResults.length > 0
        }, 300)
        return () => clearTimeout(timer)
    })

    // ── Member debounce ──────────────────────────────────
    const ID_REGEX    = /^MBR-/i
    const PHONE_REGEX = /^\d{8,}$/

    $effect(() => {
        const val = memberValue.trim()
        if (!val || memberSelected) {
            return
        }
        if (ID_REGEX.test(val)) {
            const found = getMemberById(val)
            if (found) {
                selectMember(found)
            }
            return
        }
        if (PHONE_REGEX.test(val.replace(/\D/g, ''))) {
            const found = getMemberByPhone(val)
            if (found) {
                selectMember(found)
            }
            return
        }
        const timer = setTimeout(() => {
            memberResults    = searchMembers(val)
            memberHighlight  = 0
            showMemberDropdown = true
        }, 300)
        return () => clearTimeout(timer)
    })

    // ── Keyboard handler ─────────────────────────────────
    function onSearchKey(e: KeyboardEvent) {
        if (qtyItem !== null) {
            if (e.key === 'Enter') {
                e.preventDefault()
                confirmQty()
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                closeQtyPrompt()
            }
            return
        }
        if (!showDropdown) {
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            highlightIndex = Math.min(highlightIndex + 1, searchResults.length - 1)
            highlightFree  = false
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            highlightIndex = Math.max(highlightIndex - 1, 0)
            highlightFree  = false
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            highlightFree = !highlightFree
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            const item = searchResults[highlightIndex]
            if (item) {
                openQtyPrompt(item, highlightFree)
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            closeSearch()
        }
    }

    function onMemberKey(e: KeyboardEvent) {
        if (!showMemberDropdown) {
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            memberHighlight = Math.min(memberHighlight + 1, memberResults.length - 1)
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            memberHighlight = Math.max(memberHighlight - 1, 0)
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            const m = memberResults[memberHighlight]
            if (m) {
                selectMember(m)
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            memberValue        = ''
            memberResults      = []
            showMemberDropdown = false
        }
    }

    // ── Global keyboard shortcuts ─────────────────────────
    function onWindowKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault()
            if ($cart.items.length > 0 && !payModalOpen) {
                payModalOpen = true
            }
        }
    }

    // ── Search helpers ────────────────────────────────────
    function openQtyPrompt(item: MockItem, free: boolean) {
        qtyItem      = item
        qtyFree      = free
        qtyValue     = 1
        showDropdown = false
        tick().then(() => { qtyInput?.focus(); qtyInput?.select() })
    }

    function closeQtyPrompt() {
        qtyItem      = null
        showDropdown = searchResults.length > 0
        tick().then(() => searchInput?.focus())
    }

    function closeSearch() {
        searchValue    = ''
        searchResults  = []
        showDropdown   = false
        qtyItem        = null
        tick().then(() => searchInput?.focus())
    }

    function confirmQty() {
        if (!qtyItem) {
            return
        }
        addItem({
            id:          qtyItem.id,
            name:        qtyItem.name,
            sku:         qtyItem.sku,
            price:       qtyFree ? 0 : qtyItem.price,
            qty:         qtyValue,
            isFree:      qtyFree,
            stock:       qtyItem.stock,
            preAdjDelta: qtyItem.preAdjDelta,
        })
        closeSearch()
    }

    // ── Member helpers ────────────────────────────────────
    function selectMember(m: MockMember) {
        setMember(m.id, m.name, m.phone, m.isPremium)
        memberSelected     = true
        memberValue        = m.name
        memberResults      = []
        showMemberDropdown = false
    }

    function onClearMember() {
        clearMember()
        memberSelected = false
        memberValue    = ''
    }

    // ── Row numbering ─────────────────────────────────────
    function rowNumber(index: number): string {
        return `#${index + 1}`
    }

    // Already-in-cart qty for qty prompt tooltip
    let alreadyQty = $derived(
        qtyItem
            ? ($cart.items.find(i => i.id === qtyItem!.id && i.isFree === qtyFree)?.qty ?? 0)
            : 0
    )
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet searchField()}
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Cari Produk</div>
    <div class="relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B5744]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
            bind:this={searchInput}
            bind:value={searchValue}
            onkeydown={onSearchKey}
            class="w-full bg-[#1A120B] border-[1.5px] border-[#C2622A] rounded-lg pl-8 pr-3 h-9 text-sm text-[#E8C9A8] outline-none shadow-[0_0_0_3px_rgba(194,98,42,0.12)]"
            placeholder="SKU atau nama produk..."
            autocomplete="off"
        />

        {#if qtyItem}
            <!-- Qty prompt -->
            <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#2C1E12] border-[1.5px] {qtyFree ? 'border-[rgba(74,222,128,0.4)]' : 'border-[rgba(194,98,42,0.5)]'} rounded-xl shadow-2xl z-50 p-3">
                <div class="text-sm font-bold {qtyFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'} mb-0.5">{qtyItem.name}</div>
                <div class="text-[10px] text-[#6B5744] font-mono mb-1.5">{qtyItem.sku} · {qtyFree ? 'GRATIS' : rupiahFormatter.format(qtyItem.price)}</div>
                {#if alreadyQty > 0}
                    <div class="text-[11px] text-[#4ade80] mb-2 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-[#4ade80] inline-block"></span>
                        Sudah di keranjang: {alreadyQty} pcs
                    </div>
                {/if}
                <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1">Jumlah</div>
                <div class="flex items-center gap-2 mb-2">
                    <input
                        bind:this={qtyInput}
                        bind:value={qtyValue}
                        type="number"
                        min="1"
                        onkeydown={onSearchKey}
                        class="flex-1 bg-[#1A120B] border-[1.5px] {qtyFree ? 'border-[#4ade80] text-[#4ade80]' : 'border-[#C2622A] text-[#E8C9A8]'} rounded-lg h-10 text-xl font-bold text-center outline-none shadow-[0_0_0_3px_{qtyFree ? 'rgba(74,222,128,0.1)' : 'rgba(194,98,42,0.12)'}]"
                    />
                    <span class="text-[11px] text-[#9C7E63]">pcs</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-[10px] text-[#4D3826] font-mono">Esc → kembali ke daftar</span>
                    <button
                        onclick={confirmQty}
                        class="flex items-center gap-1.5 {qtyFree ? 'bg-[rgba(74,222,128,0.18)] text-[#4ade80] border border-[rgba(74,222,128,0.3)]' : 'bg-[#C2622A] text-white'} text-[11px] font-bold px-3 h-7 rounded-md"
                    >
                        {qtyFree ? 'Tambah GRATIS' : 'Tambah ke keranjang'} <kbd class="bg-white/20 rounded px-1 text-[9px] font-mono">Enter</kbd>
                    </button>
                </div>
            </div>
        {:else if showDropdown}
            <!-- Search results dropdown -->
            <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#2C1E12] border-[1.5px] border-[#3D2B1F] rounded-xl shadow-2xl z-50 overflow-hidden">
                <div class="flex items-center justify-between px-2.5 py-1.5 border-b border-[#3D2B1F]">
                    <span class="text-[9px] text-[#4D3826] font-mono">↑↓ pindah · ◄► BAYAR/GRATIS · Enter pilih · Esc tutup</span>
                    <span class="text-[9px] text-[#4D3826]">{searchResults.length} hasil</span>
                </div>
                {#each searchResults as item, i}
                    {@const isActive = i === highlightIndex}
                    {@const showFree = isActive && highlightFree}
                    <button
                        class="w-full text-left px-2.5 py-2 border-b border-[#3D2B1F]/20 last:border-0 transition-colors {isActive ? (showFree ? 'bg-[rgba(74,222,128,0.07)]' : 'bg-[rgba(194,98,42,0.1)]') : 'hover:bg-[#3D2B1F]/30'}"
                        onclick={() => openQtyPrompt(item, showFree)}
                    >
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <div class="text-[12px] font-semibold {showFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}">{item.name}</div>
                                <div class="text-[10px] text-[#6B5744] font-mono mt-0.5">{item.sku}</div>
                                <div class="text-[10px] text-[#9C7E63] mt-0.5">Stok: {item.stock} pcs</div>
                            </div>
                            <div class="text-[12px] font-bold {showFree ? 'text-[#4ade80]' : 'text-[#C2622A]'} whitespace-nowrap">
                                {showFree ? 'GRATIS' : rupiahFormatter.format(item.price)}
                            </div>
                        </div>
                        {#if isActive}
                            <div class="flex mt-1.5 rounded overflow-hidden border border-[#3D2B1F] text-[10px] font-bold">
                                <div class="flex-1 h-5 flex items-center justify-center gap-1 {!showFree ? 'bg-[#C2622A] text-white' : 'text-[#4D3826]'}">
                                    <span class="text-[9px]">◄</span> BAYAR
                                </div>
                                <div class="flex-1 h-5 flex items-center justify-center gap-1 border-l border-[#3D2B1F] {showFree ? 'bg-[rgba(74,222,128,0.18)] text-[#4ade80]' : 'text-[#4D3826]'}">
                                    GRATIS <span class="text-[9px]">►</span>
                                </div>
                            </div>
                        {/if}
                    </button>
                {/each}
            </div>
        {/if}
    </div>
    <div class="flex items-center justify-between mt-2">
        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(194,98,42,0.12)] text-[#C2622A] border border-[rgba(194,98,42,0.2)]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/></svg>
            Mode Retail
        </div>
        <span class="text-[10px] text-[#4D3826]">Auto-focus setelah tambah</span>
    </div>
{/snippet}

<div class="flex gap-3 p-3" style="height: calc(100vh - 62px); margin-top: 62px;">

    <!-- LEFT PANE 35% -->
    <div class="w-[35%] flex flex-col gap-2 min-w-0">
        <div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 overflow-visible relative">
            {@render searchField()}
        </div>
        <div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
            <!-- memberField and pricingPanel go here in later tasks -->
        </div>
    </div>

    <!-- RIGHT PANE 65% -->
    <div class="w-[65%] flex flex-col gap-2 min-w-0">
        <div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
            <!-- cartRows goes here in later tasks -->
        </div>
    </div>
</div>

<PaymentModal bind:isModal={payModalOpen} {total} {totalPaid} {kembalian} />
```

- [ ] **Step 2: Create `PaymentModal.svelte` stub** so the import doesn't break:

Create directory and stub file:
```bash
mkdir -p src/library/components/outlet/retail
```

```svelte
<!-- src/library/components/outlet/retail/PaymentModal.svelte -->
<script lang="ts">
    interface Props {
        isModal?:  boolean
        total?:    number
        totalPaid?: number
        kembalian?: number
    }
    let { isModal = $bindable(false), total = 0, totalPaid = 0, kembalian = 0 }: Props = $props()
</script>
<!-- stub — implemented in Task 8 -->
```

- [ ] **Step 3: Build to check types**

```bash
npm run build 2>&1 | grep -i "error" | head -20
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/retail/+page.svelte src/library/components/outlet/retail/PaymentModal.svelte
git commit -m "feat(retail): page scaffold with searchField snippet and keyboard search flow"
```

---

## Task 5: `{#snippet memberField()}` and `{#snippet pricingPanel()}`

**Files:**
- Modify: `src/routes/outlet/retail/+page.svelte`

- [ ] **Step 1: Add `memberField` and `pricingPanel` snippets to the page**

After the closing `{/snippet}` of `searchField`, add:

```svelte
{#snippet memberField()}
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Member</div>
    {#if memberSelected && $cart.memberName}
        {@const isPremium = $cart.isPremiumMember}
        <div class="flex items-center gap-2 {isPremium ? 'bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.35)]' : 'bg-[rgba(74,222,128,0.07)] border border-[rgba(74,222,128,0.2)]'} rounded-lg px-2.5 py-1.5">
            {#if isPremium}
                <span class="text-base leading-none">♛</span>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-bold text-[#fbbf24] truncate">{$cart.memberName}</div>
                    <div class="text-[10px] text-[rgba(251,191,36,0.6)]">{$cart.memberId} · {$cart.memberPhone}</div>
                </div>
                <span class="text-[9px] font-bold text-[#fbbf24] bg-[rgba(251,191,36,0.15)] border border-[rgba(251,191,36,0.3)] rounded px-1.5 py-0.5 shrink-0">PREMIUM</span>
            {:else}
                <div class="w-5 h-5 rounded-full bg-[rgba(74,222,128,0.2)] flex items-center justify-center text-[9px] font-bold text-[#4ade80] shrink-0">
                    {$cart.memberName.slice(0, 2).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-semibold text-[#4ade80] truncate">{$cart.memberName}</div>
                    <div class="text-[10px] text-[rgba(74,222,128,0.6)]">{$cart.memberId} · {$cart.memberPhone}</div>
                </div>
            {/if}
            <button onclick={onClearMember} class="text-[#6B5744] hover:text-[#f87171] ml-auto shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
        </div>
    {:else}
        <div class="relative">
            <svg class="absolute left-2 top-1/2 -translate-y-1/2 text-[#4D3826]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            <input
                bind:value={memberValue}
                onkeydown={onMemberKey}
                class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] focus:border-[rgba(194,98,42,0.5)] rounded-lg pl-7 pr-3 h-8 text-[12px] text-[#E8C9A8] outline-none"
                placeholder="Nama, ID, atau nomor HP..."
                autocomplete="off"
            />
            {#if showMemberDropdown}
                <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#2C1E12] border-[1.5px] border-[#3D2B1F] rounded-xl shadow-2xl z-40 overflow-hidden">
                    {#if memberResults.length === 0}
                        <div class="px-3 py-2 text-[11px] text-[#6B5744]">Tidak ditemukan</div>
                    {:else}
                        {#each memberResults as m, i}
                            <button
                                class="w-full text-left px-3 py-2 border-b border-[#3D2B1F]/20 last:border-0 transition-colors {i === memberHighlight ? 'bg-[rgba(194,98,42,0.1)]' : 'hover:bg-[#3D2B1F]/30'}"
                                onclick={() => selectMember(m)}
                            >
                                <div class="text-[12px] font-semibold text-[#E8C9A8]">{m.name}</div>
                                <div class="text-[10px] text-[#6B5744] font-mono">{m.id}</div>
                            </button>
                        {/each}
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
{/snippet}

{#snippet pricingPanel()}
    <hr class="border-[#3D2B1F] my-2.5" />
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-2">Harga</div>

    <div class="flex justify-between items-center mb-1">
        <span class="text-[12px] text-[#9C7E63]">Subtotal</span>
        <span class="text-[12px] text-[#E8C9A8]">{rupiahFormatter.format(subtotal)}</span>
    </div>

    <div class="flex gap-1.5 mb-2">
        <div class="flex-1">
            <div class="text-[10px] text-[#6B5744] mb-1">Diskon %</div>
            <input
                type="number"
                min="0"
                max="100"
                bind:value={$cart.percentDiscount}
                class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-md h-7 px-2 text-[12px] {$cart.percentDiscount > 0 ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}"
            />
        </div>
        <div class="flex-1">
            <div class="text-[10px] text-[#6B5744] mb-1">Diskon Rp</div>
            <input
                type="number"
                min="0"
                bind:value={$cart.fixedDiscount}
                class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-md h-7 px-2 text-[12px] text-[#E8C9A8]"
            />
        </div>
    </div>

    {#if discount > 0}
        <div class="flex justify-between items-center mb-2">
            <span class="text-[12px] text-[#9C7E63]">Potongan</span>
            <span class="text-[12px] text-[#4ade80]">– {rupiahFormatter.format(discount)}</span>
        </div>
    {/if}

    <!-- Biaya Tambahan -->
    <button
        class="w-full flex items-center justify-between py-1 mb-1"
        onclick={() => { biayaOpen = !biayaOpen }}
    >
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63]">Biaya Tambahan</span>
        <div class="flex items-center gap-1.5">
            <span class="text-[11px] text-[#9C7E63]">{rupiahFormatter.format(additionalTotal)}</span>
            <svg class="transition-transform {biayaOpen ? 'rotate-180' : ''}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B5744" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
    </button>
    {#if biayaOpen}
        <div class="flex flex-col gap-1 mb-2">
            {#each [['packaging', 'Packaging'], ['transport', 'Transport'], ['modification', 'Modifikasi']] as [field, label]}
                <div class="flex items-center gap-1.5">
                    <span class="text-[11px] text-[#6B5744] w-18 shrink-0">{label}</span>
                    <input
                        type="number"
                        min="0"
                        bind:value={$cart.additionalCosts[field as 'packaging' | 'transport' | 'modification']}
                        class="flex-1 bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-md h-6 px-2 text-[11px] text-[#E8C9A8]"
                    />
                </div>
            {/each}
        </div>
    {/if}

    <hr class="border-[#3D2B1F] mt-1 mb-2" />

    <div class="flex justify-between items-center pt-1">
        <span class="text-[12px] font-bold text-[#C2622A] uppercase tracking-widest">Total</span>
        <span class="text-[20px] font-bold text-[#C2622A] tracking-tight">{rupiahFormatter.format(total)}</span>
    </div>

    <button
        onclick={() => { if ($cart.items.length > 0) payModalOpen = true }}
        disabled={$cart.items.length === 0}
        class="w-full h-10 mt-2.5 bg-[#C2622A] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-[13px] font-bold flex items-center justify-center gap-2"
    >
        Bayar Sekarang <kbd class="bg-white/20 rounded px-1.5 py-0.5 text-[10px] font-mono">Ctrl+Enter</kbd>
    </button>
{/snippet}
```

- [ ] **Step 2: Insert snippet renders into the pricing card**

In the left pane pricing card `div`, replace the comment placeholder with:
```svelte
<div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
    {@render memberField()}
    {@render pricingPanel()}
</div>
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | grep -i "error" | head -20
```
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/retail/+page.svelte
git commit -m "feat(retail): add memberField and pricingPanel snippets"
```

---

## Task 6: `{#snippet cartRows()}`

**Files:**
- Modify: `src/routes/outlet/retail/+page.svelte`

- [ ] **Step 1: Add the `cartRows` snippet**

After the `pricingPanel` snippet closing `{/snippet}`, add:

```svelte
{#snippet cartRows()}
    <!-- Cart header -->
    <div class="flex items-center justify-between mb-2.5 shrink-0">
        <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63]">Keranjang</span>
            {#if $cart.items.length > 0}
                <span class="text-[10px] bg-[rgba(194,98,42,0.12)] text-[#C2622A] rounded-full px-2 py-0.5 font-bold">
                    {$cart.items.length} baris · {$cart.items.reduce((s, i) => s + i.qty, 0)} pcs
                </span>
            {/if}
        </div>
        {#if $cart.items.length > 0}
            <button onclick={clearCart} class="text-[10px] text-[#6B5744] hover:text-[#f87171] transition-colors">Kosongkan</button>
        {/if}
    </div>

    <!-- Column headers -->
    <div class="grid gap-2 px-2.5 pb-1.5 border-b border-[#3D2B1F] shrink-0" style="grid-template-columns: 1fr 96px 88px 22px;">
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#6B5744]">Produk</span>
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#6B5744] text-center">Qty</span>
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#6B5744] text-right">Subtotal</span>
        <span></span>
    </div>

    <!-- Cart rows -->
    <div class="flex-1 overflow-y-auto pt-1 pl-5" style="scrollbar-width: thin; scrollbar-color: #3D2B1F transparent;">
        {#if $cart.items.length === 0}
            <div class="flex flex-col items-center justify-center h-full text-[#4D3826] gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                <span class="text-[12px]">Keranjang kosong</span>
                <span class="text-[11px]">Ketik SKU atau nama produk untuk mulai</span>
            </div>
        {:else}
            {#each $cart.items as item, i}
                {@const isPrevSame = i > 0 && $cart.items[i - 1].id === item.id && item.isFree}
                {#if isPrevSame}
                    <!-- Dashed connector between paired rows -->
                    <div class="mx-2.5 my-0" style="height:1px; background: repeating-linear-gradient(90deg, #3D2B1F 0, #3D2B1F 4px, transparent 4px, transparent 8px);"></div>
                {:else if i > 0}
                    <div class="h-1"></div>
                {/if}
                <div
                    class="relative grid gap-2 items-center px-2.5 py-2 rounded-lg transition-colors {item.isFree ? 'bg-[rgba(74,222,128,0.04)] hover:bg-[rgba(74,222,128,0.08)]' : 'hover:bg-[#3D2B1F]/30'}"
                    style="grid-template-columns: 1fr 96px 88px 22px;"
                >
                    <!-- Row number -->
                    <span class="absolute -left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold font-mono {item.isFree ? 'text-[rgba(74,222,128,0.4)]' : 'text-[#4D3826]'}">
                        {rowNumber(i)}
                    </span>

                    <!-- Product info -->
                    <div>
                        <div class="text-[13px] font-semibold truncate {item.isFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}">{item.name}</div>
                        <div class="text-[10px] font-mono {item.isFree ? 'text-[rgba(74,222,128,0.4)]' : 'text-[#4D3826]'} mt-0.5">{item.sku}</div>
                        {#if item.isFree}
                            <div class="mt-1">
                                <span class="text-[9px] font-bold text-[#4ade80] bg-[rgba(74,222,128,0.12)] rounded px-1 py-0.5">GRATIS</span>
                            </div>
                        {/if}
                        <div class="flex items-center gap-1.5 mt-1 text-[10px] text-[#6B5744]">
                            <span>Stok:</span>
                            <span class="font-semibold {item.stock <= 5 ? 'text-[#fbbf24]' : 'text-[#9C7E63]'}">{item.stock} pcs</span>
                            {#if item.stock <= 5}
                                <span class="text-[9px] text-[#fbbf24] bg-[rgba(251,191,36,0.1)] rounded px-1">⚠ hampir habis</span>
                            {/if}
                            {#if item.preAdjDelta !== 0}
                                <span class="text-[9px] rounded px-1 {item.preAdjDelta > 0 ? 'text-[#4ade80] bg-[rgba(74,222,128,0.1)]' : 'text-[#f87171] bg-[rgba(248,113,113,0.1)]'}">
                                    pre-adj {item.preAdjDelta > 0 ? '+' : ''}{item.preAdjDelta}
                                </span>
                            {/if}
                        </div>
                    </div>

                    <!-- Qty controls -->
                    <div class="flex items-center gap-1 justify-center">
                        <button
                            onclick={() => setQty(item.id, item.isFree, item.qty - 1)}
                            class="w-5 h-5 bg-[#1A120B] border {item.isFree ? 'border-[rgba(74,222,128,0.2)] hover:border-[#4ade80] hover:text-[#4ade80]' : 'border-[#3D2B1F] hover:border-[#C2622A] hover:text-[#C2622A]'} rounded text-[#9C7E63] flex items-center justify-center text-sm font-semibold leading-none shrink-0"
                        >−</button>
                        <span class="text-[13px] font-bold min-w-6 text-center {item.isFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}">{item.qty}</span>
                        <button
                            onclick={() => setQty(item.id, item.isFree, item.qty + 1)}
                            class="w-5 h-5 bg-[#1A120B] border {item.isFree ? 'border-[rgba(74,222,128,0.2)] hover:border-[#4ade80] hover:text-[#4ade80]' : 'border-[#3D2B1F] hover:border-[#C2622A] hover:text-[#C2622A]'} rounded text-[#9C7E63] flex items-center justify-center text-sm font-semibold leading-none shrink-0"
                        >+</button>
                    </div>

                    <!-- Subtotal -->
                    <div class="text-right {item.isFree ? 'text-[11px] font-bold text-[#4ade80]' : 'text-[13px] font-semibold text-[#E8C9A8]'}">
                        {item.isFree ? 'GRATIS' : rupiahFormatter.format(item.price * item.qty)}
                    </div>

                    <!-- Delete -->
                    <button
                        onclick={() => removeItem(item.id, item.isFree)}
                        class="w-5 h-5 rounded flex items-center justify-center text-[#4D3826] hover:bg-[rgba(185,64,64,0.15)] hover:text-[#f87171] transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            {/each}
        {/if}
    </div>
{/snippet}
```

- [ ] **Step 2: Render cartRows in the right pane**

Replace the comment placeholder in the right pane card:
```svelte
<div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
    {@render cartRows()}
</div>
```

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | grep -i "error" | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/retail/+page.svelte
git commit -m "feat(retail): add cartRows snippet with free item indicators and stock badges"
```

---

## Task 7: PaymentModal

**Files:**
- Modify: `src/library/components/outlet/retail/PaymentModal.svelte`

Replace the stub entirely.

- [ ] **Step 1: Write the full PaymentModal**

```svelte
<!-- src/library/components/outlet/retail/PaymentModal.svelte -->
<script lang="ts">
    import Modal from '$library/components/Modal.svelte'
    // svelte:window inside the component handles Ctrl+Enter while modal is open
    import { cart, clearCart } from '$library/stores/cart'
    import { auth } from '$library/stores/auth'
    import { get } from 'svelte/store'
    import { rupiahFormatter } from '$library/utils/formatter'
    import { getPaymentProviders } from '$library/mock/payment-methods'

    interface Props {
        isModal?:   boolean
        total?:     number
        totalPaid?: number
        kembalian?: number
    }

    let {
        isModal   = $bindable(false),
        total     = 0,
        totalPaid = 0,
        kembalian = 0,
    }: Props = $props()

    const KATEGORI_OPTIONS = [
        'Private Event',
        'Pernikahan',
        'Pengajian / Acara Keagamaan',
        'Ulang Tahun',
        'Wisuda',
        'Reuni',
        'Gathering Kantor',
        'Sunatan',
        'Acara Sosial / Komunitas',
        'Tidak Ada Acara',
    ]

    let providers    = $state<string[]>([])
    let submitting   = $state(false)
    let errorMessage = $state('')

    $effect(() => {
        if (isModal) {
            providers    = getPaymentProviders()
            errorMessage = ''
        }
    })

    // Payment methods are taken from the cart store
    function addPaymentMethod() {
        const available = providers.filter(p => p !== 'Tunai')
        cart.update(s => ({
            ...s,
            paymentMethods: [...s.paymentMethods, { method: available[0] ?? 'QRIS', amount: 0 }]
        }))
    }

    function removePaymentMethod(index: number) {
        cart.update(s => ({
            ...s,
            paymentMethods: s.paymentMethods.filter((_, i) => i !== index)
        }))
    }

    function setMethodProvider(index: number, method: string) {
        cart.update(s => ({
            ...s,
            paymentMethods: s.paymentMethods.map((m, i) => i === index ? { ...m, method } : m)
        }))
    }

    function setMethodAmount(index: number, amount: number) {
        cart.update(s => ({
            ...s,
            paymentMethods: s.paymentMethods.map((m, i) => i === index ? { ...m, amount } : m)
        }))
    }

    let canConfirm = $derived(totalPaid >= total && total > 0)
    let hasTunai   = $derived($cart.paymentMethods.some(m => m.method === 'Tunai'))

    async function confirm() {
        if (!canConfirm || submitting) {
            return
        }
        submitting   = true
        errorMessage = ''

        const session = get(auth)
        const subtotal = $cart.items.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.qty, 0)

        const payload = {
            memberId:        $cart.memberId,
            mode:            'retail' as const,
            items:           $cart.items.map(i => ({ id: i.id, qty: i.qty, price: i.price, isFree: i.isFree })),
            subtotal,
            kupon:           null,
            additionalCosts: $cart.additionalCosts,
            total,
            notes:           $cart.notes,
            kategoriAcara:   $cart.kategoriAcara,
            paymentMethods:  $cart.paymentMethods,
        }

        try {
            const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
            const response = await fetch(`${API_URL}/api/transactions`, {
                method:  'POST',
                headers: {
                    'Content-Type':       'application/json',
                    'Authorization':      `Bearer ${session?.token ?? ''}`,
                    'X-Idempotency-Key':  crypto.randomUUID(),
                    'X-App-Version':      '1.0.0',
                    'X-Request-ID':       crypto.randomUUID(),
                },
                body: JSON.stringify(payload),
            })

            if (response.status === 201) {
                clearCart()
                isModal = false
            } else {
                const data = await response.json() as { message?: string }
                errorMessage = data.message ?? 'Terjadi kesalahan. Coba lagi.'
            }
        } catch {
            errorMessage = 'Gagal terhubung ke server.'
        } finally {
            submitting = false
        }
    }
</script>

<svelte:window onkeydown={(e) => { if (e.ctrlKey && e.key === 'Enter' && isModal) { e.preventDefault(); confirm() } }} />

<Modal bind:isModal size="lg" title="Konfirmasi Pembayaran">
    <!-- Total box -->
    <div class="flex items-baseline justify-between bg-[#1A120B] rounded-lg px-3.5 py-2.5 mb-4">
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63]">Total Tagihan</span>
        <span class="text-[22px] font-bold text-[#C2622A] tracking-tight">{rupiahFormatter.format(total)}</span>
    </div>

    <!-- Payment methods -->
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-2">Metode Pembayaran</div>

    {#each $cart.paymentMethods as method, i}
        {@const isTunai = method.method === 'Tunai'}
        {@const isQRIS  = method.method === 'QRIS'}
        <div class="mb-1.5">
            <div class="flex items-center gap-2 bg-[#1A120B] border-[1.5px] {isTunai ? 'border-[rgba(74,222,128,0.3)]' : 'border-[rgba(96,165,250,0.3)]'} rounded-lg px-2.5 py-2">
                <div class="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 {isTunai ? 'bg-[rgba(74,222,128,0.12)]' : 'bg-[rgba(96,165,250,0.12)]'}">
                    {isTunai ? '💵' : '📱'}
                </div>
                {#if isTunai}
                    <span class="text-[12px] font-semibold text-[#E8C9A8] flex-1">Tunai</span>
                {:else}
                    <select
                        value={method.method}
                        onchange={(e) => setMethodProvider(i, (e.target as HTMLSelectElement).value)}
                        class="flex-1 bg-[#2C1E12] border border-[#3D2B1F] rounded-md h-6 px-1.5 text-[12px] text-[#E8C9A8] font-semibold"
                    >
                        {#each providers.filter(p => p !== 'Tunai') as p}
                            <option value={p}>{p}</option>
                        {/each}
                    </select>
                {/if}
                <input
                    type="number"
                    min="0"
                    value={method.amount}
                    oninput={(e) => setMethodAmount(i, Number((e.target as HTMLInputElement).value))}
                    class="w-24 bg-[#2C1E12] border border-[#3D2B1F] rounded-md h-6 px-2 text-[12px] text-[#E8C9A8] text-right shrink-0"
                />
                {#if !isTunai}
                    <button onclick={() => removePaymentMethod(i)} class="w-5 h-5 flex items-center justify-center text-[#4D3826] hover:text-[#f87171] shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                {/if}
            </div>
            {#if isQRIS}
                <!-- QRIS placeholder — OQ-R01 -->
                <div class="mt-1 bg-[#1A120B] border border-[rgba(96,165,250,0.2)] border-t-0 rounded-b-lg px-3 py-2 text-[10px] text-[#4D3826] italic">
                    QRIS akan tampil di sini — OQ-R01
                </div>
            {/if}
        </div>
    {/each}

    <button
        onclick={addPaymentMethod}
        class="w-full h-8 border-[1.5px] border-dashed border-[#3D2B1F] hover:border-[rgba(194,98,42,0.4)] hover:text-[#C2622A] rounded-lg text-[11px] font-semibold text-[#6B5744] flex items-center justify-center gap-1.5 mb-4 transition-colors"
    >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        Tambah metode pembayaran
    </button>

    <!-- Summary -->
    <div class="bg-[#1A120B] rounded-lg px-3 py-2.5 mb-4 text-[11px]">
        <div class="flex justify-between mb-1">
            <span class="text-[#9C7E63]">Total tagihan</span>
            <span class="text-[#E8C9A8] font-semibold">{rupiahFormatter.format(total)}</span>
        </div>
        {#each $cart.paymentMethods as m}
            <div class="flex justify-between mb-1">
                <span class="text-[#9C7E63]">{m.method}</span>
                <span class="text-[#4ade80] font-semibold">{rupiahFormatter.format(m.amount)}</span>
            </div>
        {/each}
        <hr class="border-[#3D2B1F] my-1.5" />
        <div class="flex justify-between mb-1">
            <span class="text-[#9C7E63]">Total dibayar</span>
            <span class="font-semibold {totalPaid >= total ? 'text-[#4ade80]' : 'text-[#f87171]'}">{rupiahFormatter.format(totalPaid)}</span>
        </div>
        {#if hasTunai}
            <div class="flex justify-between">
                <span class="text-[#9C7E63]">Kembalian tunai</span>
                <span class="text-[13px] font-bold text-[#4ade80]">{rupiahFormatter.format(Math.max(0, kembalian))}</span>
            </div>
        {/if}
    </div>

    <!-- Notes -->
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Catatan</div>
    <textarea
        bind:value={$cart.notes}
        placeholder="Keterangan transaksi (opsional)..."
        class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-lg px-2.5 py-2 text-[12px] text-[#6B5744] resize-none h-12 mb-4"
    ></textarea>

    <!-- Kategori Acara -->
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Kategori Acara</div>
    <select
        bind:value={$cart.kategoriAcara}
        class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] focus:border-[rgba(194,98,42,0.4)] rounded-lg h-8 px-2.5 text-[12px] text-[#E8C9A8] mb-2"
    >
        {#each KATEGORI_OPTIONS as opt}
            <option value={opt}>{opt}</option>
        {/each}
    </select>

    {#if errorMessage}
        <div class="text-[11px] text-[#f87171] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] rounded-lg px-3 py-2 mb-2">{errorMessage}</div>
    {/if}

    <!-- Footer buttons rendered via slot trick — placed after main content -->
    <div class="flex gap-2 mt-2 pt-3 border-t border-[#3D2B1F]">
        <button
            onclick={() => { isModal = false }}
            class="flex-1 h-9 bg-transparent border-[1.5px] border-[#3D2B1F] rounded-lg text-[#9C7E63] text-[12px] font-semibold"
        >
            Batal (Esc)
        </button>
        <button
            onclick={confirm}
            disabled={!canConfirm || submitting}
            class="flex-[2] h-9 bg-[#C2622A] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-1.5"
        >
            {submitting ? 'Memproses...' : 'Konfirmasi Pembayaran'}
            {#if !submitting}
                <kbd class="bg-white/20 rounded px-1 text-[9px] font-mono">Ctrl+Enter</kbd>
            {/if}
        </button>
    </div>
</Modal>
```

> **Note on `session?.token`:** The `AuthSession` type in `src/library/stores/auth.ts` does not include a `token` field — the token is returned from the API login but not stored in the auth store. Either:
> - Add `token: string` to `AuthSession` and store it in `setAuth()`, or
> - For now, omit the Authorization header (the backend will return 401, which surfacing is acceptable during dev)
>
> The recommended fix: add `token: string` to `AuthSession` in `auth.ts` and update `setAuth` to store it. Do this if the dev server is being tested end-to-end; skip if mock mode only.

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | grep -i "error" | head -20
```
Expected: no errors (or only the `token` type issue if auth store hasn't been updated).

- [ ] **Step 3: Commit**

```bash
git add src/library/components/outlet/retail/PaymentModal.svelte
git commit -m "feat(retail): implement PaymentModal with dynamic payment methods and kategoriAcara"
```

---

## Task 8: Auth Store Token + Final Wiring

**Files:**
- Modify: `src/library/stores/auth.ts`

- [ ] **Step 1: Add `token` to `AuthSession`**

In `src/library/stores/auth.ts`:

```typescript
export type AuthSession = {
    userId:     string
    userName:   string
    nip:        string
    role:       'cashier' | 'manager' | 'admin'
    outletId:   string
    outletName: string
    token:      string
}
```

- [ ] **Step 2: Update mock auth to return token**

In `src/library/mock/auth.ts`, update the `login` function to include a stub token (the real token comes from the backend):

```typescript
export function login(username: string, password: string): AuthSession {
    const user = MOCK_USERS.find(u => u.username === username && u.password === password)
    if (!user) {
        throw new Error('useNotice.connection.unauthorized')
    }
    const { password: _p, username: _u, ...session } = user
    return { ...session, token: '' }
}
```

> When the real backend login is wired, `token` will be populated from the API response. For now it is an empty string so the type is satisfied.

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | grep -i "error" | head -20
```
Expected: no errors.

- [ ] **Step 4: Run all frontend tests**

```bash
npm test
```
Expected: all cart store tests pass.

- [ ] **Step 5: Run all backend tests**

```bash
cd server && bun test
```
Expected: 110+ tests pass (all prior + the new kategoriAcara test).

- [ ] **Step 6: Final commit**

```bash
git add src/library/stores/auth.ts src/library/mock/auth.ts
git commit -m "feat(retail): wire auth token field; all Retail page tasks complete"
```
