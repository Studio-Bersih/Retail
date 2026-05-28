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
