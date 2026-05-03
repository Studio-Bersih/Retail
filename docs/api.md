# 🔌 API & State Management

## 1. 🛠️ API Communication
Studio Bersih - POS uses two core hooks for all backend interactions:
*   **`useGet.ts`**: Handles data fetching with built-in loading states and error handling.
*   **`usePost.ts`**: Handles data submission (Checkouts, Updates) with JSON payload validation.

## 2. 📦 Data Payloads
### Transaction Payload (`handlePay()`):
```typescript
{
    auth: { userId: string, outletId: string },
    memberId: string | null,
    items: Array<{
        id: string,
        qty: number,
        price: number,
        isFree: boolean
    }>,
    pricing: {
        subtotal: number,
        percentDiscount: number,
        fixedDiscount: number,
        additionalCost: { packaging: number, transport: number, modification: number },
        total: number
    },
    paymentMethods: Array<{ method: string, amount: number }>,
    notes: string,
    mode: "retail" | "order"
}
```

## 3. 💾 Svelte Stores
The application state is decentralized across specialized stores:
*   **`cart.ts`**: Manages the active transaction. Includes logic for adding items, calculating totals, and persistence.
*   **`auth.ts`**: Manages user identity and session.
*   **`mode.ts`**: Tracks whether the system is in "Retail" or "Order" mode globally.
*   **`toast.ts`**: A global queue for UI notifications.

## 4. 🎭 Mocking System (`/mock`)
During development or offline mode, the system relies on high-fidelity mock data:
*   `items.ts`: Full product catalog.
*   `history.ts`: Pre-populated transaction logs for UI testing.
*   `members.ts`: Customer database for search testing.
