# Auth / Login Design Spec

## Goal

Implement the login page at `/`, the `$auth` session store with encrypted LocalStorage persistence, client-side route protection for `/outlet/**`, and the mock authentication layer — so every subsequent feature has a working session foundation to build on.

---

## Architecture

Three layers:

1. **Login page** (`src/routes/+page.svelte`) — username + password form with auto-redirect if session already exists
2. **Auth store** (`src/library/stores/auth.ts`) — nullable session object, persisted via `btoa`-encoded LocalStorage
3. **Route guard** (`src/routes/outlet/+layout.svelte`) — client-side `onMount` redirect for unauthenticated access

All auth data flows from `mock/auth.ts` via `usePost` interception during development.

---

## Login Page (`src/routes/+page.svelte`)

### Layout

Centered card on a full-dark background (`bg-base-300` or equivalent DaisyUI dark token). Card contains:
- App name "Studio Bersih" + subtitle "Point of Sale"
- `<input type="text">` for username
- `<input type="password">` for password
- `<button>` "Masuk" — disabled and showing a spinner while the post is in flight
- Error message area below the button (shown only on failure)

### Behavior

- **Auto-redirect on mount:** `onMount` reads `$auth`. If a valid session exists, calls `goto('/outlet/dashboard')` immediately. The form never renders.
- **Submit:** triggered by button click or `Enter` key on either field.
- **On success:** calls `setAuth(response)`, then `goto('/outlet/dashboard')`. All roles land on the same destination.
- **On failure:** error toast (via `toast.ts`), password field cleared, focus returned to password input.

### Svelte 5 state

```typescript
let username = $state("")
let password = $state("")
let loading = $state(false)
let error = $state<string | null>(null)
```

---

## Auth Store (`src/library/stores/auth.ts`)

### Session type

```typescript
type AuthSession = {
    userId: string
    userName: string
    role: "cashier" | "manager" | "admin"
    outletId: string
}
```

### Store shape

```typescript
import { writable } from 'svelte/store'

const STORAGE_KEY = "sb_auth"

function loadFromStorage(): AuthSession | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return JSON.parse(atob(raw)) as AuthSession
    } catch {
        return null
    }
}

export const auth = writable<AuthSession | null>(
    typeof localStorage !== 'undefined' ? loadFromStorage() : null
)

export function setAuth(data: AuthSession): void {
    localStorage.setItem(STORAGE_KEY, btoa(JSON.stringify(data)))
    auth.set(data)
}

export function clearAuth(): void {
    localStorage.removeItem(STORAGE_KEY)
    auth.set(null)
}
```

**Persistence mechanism:** `btoa(JSON.stringify(session))` — base64 obfuscation, not real encryption. Sufficient for a mock-first project. The `setAuth` / `clearAuth` interface is stable; a real AES implementation can replace the storage calls without touching consumers.

**SSR safety:** The store initializes to `null` when `localStorage` is not defined (server-side). `onMount` guards handle the client-side restore.

---

## Cleaner Protocol (`src/library/utils/cleaner.ts`)

`forceWipe()` is the single logout and session-expiry handler:

```typescript
import { goto } from '$app/navigation'
import { clearAuth } from '$library/stores/auth'
import { cart } from '$library/stores/cart'
import { toast } from '$library/stores/toast'

export function forceWipe(): void {
    clearAuth()
    cart.set(initialCartState)  // initialCartState exported from stores/cart.ts
    toast.set([])
    localStorage.clear()
    sessionStorage.clear()
    goto('/')
}
```

Triggered by: explicit logout button, future session expiry logic, or any unrecoverable API auth error.

---

## Route Protection (`src/routes/outlet/+layout.svelte`)

```svelte
<script lang="ts">
    import { onMount } from 'svelte'
    import { goto } from '$app/navigation'
    import { get } from 'svelte/store'
    import { auth } from '$library/stores/auth'

    onMount(() => {
        if (!get(auth)) goto('/')
    })
</script>

<slot />
```

- Fires on every page under `/outlet/**`
- No server hooks — fully client-side SvelteKit app
- `/factory/` is not route-gated here; role-based UI visibility is handled at the component level via `$auth.role`

---

## Mock Data (`src/library/mock/auth.ts`)

### User table

```typescript
const MOCK_USERS = [
    { username: "admin",   password: "admin123",   userId: "U001", userName: "Admin Pusat",   role: "admin",   outletId: "O001" },
    { username: "manager", password: "manager123", userId: "U002", userName: "Budi Santoso",  role: "manager", outletId: "O001" },
    { username: "kasir1",  password: "kasir123",   userId: "U003", userName: "Rina Maharani", role: "cashier", outletId: "O001" },
    { username: "kasir2",  password: "kasir123",   userId: "U004", userName: "Doni Pratama",  role: "cashier", outletId: "O002" },
]
```

### Login function

```typescript
import type { AuthSession } from '$library/stores/auth'

export function login(username: string, password: string): AuthSession {
    const user = MOCK_USERS.find(u => u.username === username && u.password === password)
    if (!user) throw new Error("useNotice.connection.unauthorized")
    const { password: _, ...session } = user
    return session
}
```

`usePost` in dev intercepts `POST /api/auth/login` and delegates to `login()`. On error the thrown message maps to a user-facing toast via the notice system.

---

## Role-Based Access

| Role | Post-login destination | Special access |
|------|----------------------|----------------|
| `cashier` | `/outlet/dashboard` | Standard POS operations |
| `manager` | `/outlet/dashboard` | Manager-gated actions (void, discount override) |
| `admin` | `/outlet/dashboard` | Full access; `/factory/` visible in nav |

All roles land on the same route. Factory route is accessible to all authenticated users; admin-specific nav items are shown/hidden by `$auth.role` in the Navbar component.

---

## Files Touched

| File | Action |
|------|--------|
| `src/routes/+page.svelte` | Create — login page |
| `src/library/stores/auth.ts` | Create — auth store + setAuth/clearAuth |
| `src/library/utils/cleaner.ts` | Create — forceWipe() |
| `src/routes/outlet/+layout.svelte` | Create — route guard |
| `src/library/mock/auth.ts` | Create — mock users + login() |
