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
        let merged = false
        const items = state.items.map(i => {
            if (i.id === item.id && i.isFree === item.isFree) {
                merged = true
                return { ...i, qty: i.qty + item.qty }
            }
            return i
        })
        if (!merged) {
            items.push(item)
        }
        return { ...state, items }
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
