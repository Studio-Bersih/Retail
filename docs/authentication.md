# 🔐 Authentication & Security

## 1. 🚪 Logic Flow
Studio Bersih - POS uses a centralized authentication store (`$auth`) to manage the current session.

*   **Login**: Users authenticate with credentials (mapped via `mock/auth.ts`).
*   **Session Data**: The auth object contains:
    *   `userId`: Unique identifier for the cashier.
    *   `userName`: Display name for the UI.
    *   `role`: Determines access levels (Cashier, Manager, Admin).
    *   `outletId`: The physical location the user is currently assigned to.
*   **Persistence**: Auth state is persisted in encrypted LocalStorage to survive page refreshes.

## 2. 🧹 The "Cleaner" Protocol
Security is paramount in a POS environment. The system includes a `utils/cleaner.ts` utility.
*   **Function**: `forceWipe()`
*   **Trigger**: Explicit Logout or Session Expiry.
*   **Actions**:
    1.  Clears `LocalStorage`.
    2.  Clears `SessionStorage`.
    3.  Flushes all Svelte Stores (Auth, Cart, Toast).
    4.  Redirects to the root login page.

## 3. 🛡️ Route Protection
Access is controlled via SvelteKit layouts and hooks.
*   **Outlet Root**: `/outlet` is protected. Any unauthenticated access is redirected to `/`.
*   **Role-Based Views**: Components like "Void Transaction" or "Apply Manager Discount" are gated by the `$auth.role` property.

## 4. 📝 Audit Trail
Every transaction payload sent to the backend includes the `cashierId` and `outletId` natively from the `$auth` store, ensuring that no sale is ever anonymous.
