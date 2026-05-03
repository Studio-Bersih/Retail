# 📋 Implementation Task List

## 1. 🏗️ Foundation & Infrastructure
- [ ] **Standardize Indentation**: Audit all `.svelte` and `.ts` files to ensure strict 4-space indentation.
- [ ] **Enforce camelCase**: Rename any snake_case or PascalCase variables to camelCase (e.g., `outlet_id` -> `outletId`).
- [ ] **Prettier Configuration**: Update `.prettierrc` to enforce `printWidth: 200` to prevent HTML attribute wrapping.
- [ ] **Static Assets**: Verify all icons used in components exist in `/static/icons/`.

## 2. 🔐 Authentication Domain
- [ ] **Cleaner Logic Expansion**: Enhance `utils/cleaner.ts` to clear specific browser caches that might store sensitive POS data.
- [ ] **Auth Store Persistence**: Implement a more robust encryption layer for the auth state in LocalStorage.
- [ ] **Login Form Validation**: Add real-time feedback for credential matching against `mock/auth.ts`.

## 3. 🛒 Retail & Order Core
- [ ] **Keyboard Shortcut System**: Implement a centralized event listener in `+layout.svelte` for global POS shortcuts.
- [ ] **SKU Search Optimization**: Refine `ProductSearchField.svelte` to handle rapid barcode scanner input (debouncing vs. immediate match).
- [ ] **Pricing Engine Unit Tests**: Create test cases for `PricingPanel.svelte` logic (e.g., % discount vs fixed discount precedence).
- [ ] **Stock Omniscience (Order Mode)**: Implement the multi-outlet stock comparison table in `Order.svelte`.
- [ ] **Free Products UI**: Add a specific visual indicator (badge or text color) for items with `isFree: true` in `CartSection.svelte`.

## 4. 📊 Dashboard & History
- [ ] **History Deep Filtering**: Implement full-text search across `Transaction ID` and `Member Name` in `/outlet/history/retail`.
- [ ] **Payload Drawer Completion**: Ensure every field in the `handlePay()` payload is rendered in the history detail drawer.
- [ ] **Pagination Logic**: Connect the history table to a dynamic limit/offset state managed by a Svelte store.

## 5. 🎨 UI/UX Refinement
- [ ] **DaisyUI Theme Audit**: Ensure all components use semantic colors (`primary`, `secondary`, `error`) instead of hardcoded hex codes.
- [ ] **Accessibility (A11y)**: Add `aria-label` to all icon-only buttons (e.g., the delete button in `CartSection`).
- [ ] **Loading States**: Implement skeleton loaders for history logs and product searches using DaisyUI's `skeleton` class.

## 6. 🔌 Backend & Integration
- [ ] **Mock Data Expansion**: Populate `mock/items.ts` with at least 50 varied products to test search performance.
- [ ] **Payload Validation**: Add a Zod schema or similar validator to the `usePost` hook for transaction submissions.
- [ ] **Receipt Printing**: Finalize `utils/printReceipt.ts` to generate a clean, thermal-printer-ready layout.
