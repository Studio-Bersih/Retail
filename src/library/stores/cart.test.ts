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
