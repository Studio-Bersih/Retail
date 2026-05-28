import { describe, it, expect } from 'vitest'
import { login } from './auth'

describe('login', () => {
    it('returns session for valid cashier credentials', () => {
        const session = login('kasir1', 'kasir123')
        expect(session).toMatchObject({
            userId:     'U003',
            userName:   'Rina Maharani',
            role:       'cashier',
            outletId:   'O001',
            outletName: 'Outlet Utama'
        })
    })

    it('returns session for valid manager credentials', () => {
        const session = login('manager', 'manager123')
        expect(session).toMatchObject({ userId: 'U002', role: 'manager' })
    })

    it('returns session for valid admin credentials', () => {
        const session = login('admin', 'admin123')
        expect(session).toMatchObject({ userId: 'U001', role: 'admin' })
    })

    it('throws for wrong password', () => {
        expect(() => login('kasir1', 'wrongpass')).toThrow('useNotice.connection.unauthorized')
    })

    it('throws for unknown username', () => {
        expect(() => login('ghost', 'any')).toThrow('useNotice.connection.unauthorized')
    })

    it('does not return password field in session', () => {
        const session = login('kasir1', 'kasir123')
        expect(session).not.toHaveProperty('password')
        expect(session).not.toHaveProperty('username')
    })
})
