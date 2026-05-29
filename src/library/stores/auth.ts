import { writable } from 'svelte/store'

export type AuthSession = {
    userId:     string
    userName:   string
    nip:        string
    role:       'cashier' | 'manager' | 'admin'
    outletId:   string
    outletName: string
    token:      string
}

const STORAGE_KEY = 'sb_auth'

function loadFromStorage(): AuthSession | null {
    if (typeof localStorage === 'undefined') return null
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return JSON.parse(atob(raw)) as AuthSession
    } catch {
        return null
    }
}

export const auth = writable<AuthSession | null>(loadFromStorage())

export function setAuth(data: AuthSession): void {
    localStorage.setItem(STORAGE_KEY, btoa(JSON.stringify(data)))
    auth.set(data)
}

export function clearAuth(): void {
    localStorage.removeItem(STORAGE_KEY)
    auth.set(null)
}
