import { goto } from '$app/navigation'
import { clearAuth } from '$library/stores/auth'

export function forceWipe(): void {
    clearAuth()
    localStorage.clear()
    sessionStorage.clear()
    goto('/')
}
