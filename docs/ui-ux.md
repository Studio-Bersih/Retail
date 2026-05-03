# 🎨 UI/UX & Design System

## 1. 🌈 Aesthetic Direction
Studio Bersih - POS follows a **"Premium Professional"** aesthetic:
*   **Framework**: TailwindCSS + DaisyUI.
*   **Theme**: Dark-first by default, but supports high-contrast Light mode.
*   **Visual Hierarchy**: Crucial data (Total Amount, Cart items) is emphasized with distinct colors (Primary, Error for cuts).

## 2. ⌨️ Accessibility & Focus
*   **Automatic Focus**: Upon adding an item or closing a modal, the "SKU Search" field is automatically re-focused.
*   **Keyboard Shortcuts**:
    *   `Ctrl + Enter`: Trigger Checkout.
    *   `Esc`: Close any active modal.
    *   `Arrow Keys`: Navigate through cart quantities or search results.
*   **Zero-Mouse Target**: The layout is designed so that a cashier never *needs* to touch a mouse for a standard transaction.

## 3. 🧱 Component Strategy
*   **Factory Dashboard**: High-density data tables and charts.
*   **Outlet Retail**: Card-based layout with split panels (Search/Pricing on left, Cart on right).
*   **Modals**: Centered, backdrop-blur interactions for high-stakes actions (Payment, Promo).

## 4. 📱 Responsiveness
*   **Desktop**: Full dual-pane view.
*   **Tablet**: Stacked view with bottom-pinned action buttons.
*   **Mobile**: (Limited) Read-only history and basic stock checking.

## 5. 🖼️ Icons
All icons are SVG-based and stored in `/static/icons/` for consistency and performance.
*   Common icons: `tag.svg`, `qr-code.svg`, `wallet.svg`, `search.svg`, `user.svg`.
