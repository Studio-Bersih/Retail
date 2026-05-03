# 🚀 Studio Bersih - POS Feature Breakdown

## 1. 🛒 Retail POS (Instant Sales)
The primary interface for fast checkout.
*   **Feature Description**: A streamlined workflow to add items via SKU search, modify quantities, and finalize payments in seconds.
*   **User Flow**:
    1.  Scan or type SKU in the search field.
    2.  Item is automatically added to the cart or triggers a selection modal if ambiguous.
    3.  Adjust quantities using arrow keys or direct input.
    4.  Apply member ID (optional).
    5.  Hit `Ctrl+Enter` to open Payment Modal.
    6.  Select payment method and confirm.
*   **Edge Cases**:
    *   Attempting to checkout with an empty cart (Button disabled).
    *   Adding more items than currently in stock (Visual warning/alert).
    *   Scanning a non-existent SKU (Error toast notification).

## 2. 📦 Order Management (Scheduled Sales)
Advanced mode for transactions involving deposits and later fulfillment.
*   **Feature Description**: Allows cashiers to process orders that are not yet "finished". Supports deposit tracking and multi-outlet stock verification.
*   **Key Capabilities**:
    *   **Deposit Support**: Accept partial payments and track the remaining balance.
    *   **Outlet Stock Checker**: Verify if an item in the cart is available at a different branch.
*   **User Flow**:
    1.  Switch mode to "Order".
    2.  Add items to the cart.
    3.  Input customer details (Required for orders).
    4.  Input deposit amount in the Payment Modal.
    5.  Set expected fulfillment date/notes.

## 3. 🧠 Smart Cart & Pricing
The heart of the transaction logic.
*   **Features**:
    *   **Free Products**: Capability to add "Gift" items with zero price that still track inventory.
    *   **Multi-Tier Discounts**: Apply percentage-based (%) and fixed-amount (IDR) discounts simultaneously.
    *   **Additional Costs**: Manual entry for packaging, modification, or transportation fees.
    *   **Additional Adds/Cuts**: Custom line-item adjustments for non-standard transactions.

## 4. 🔍 Advanced Transaction History
Comprehensive audit trail and reporting.
*   **Features**:
    *   **Deep Search**: Filter by Transaction ID, Cashier Name, Member ID, or specific Outlet.
    *   **Date Range Filtering**: Defaulting to the current month with manual override.
    *   **Detail Drawers**: Deep dive into every payload, showing itemization, payment methods, and notes.
    *   **Pagination**: Smooth handling of large datasets with adjustable limits.

## 5. 💳 Payment Integration
*   **Cash**: Quick entry with automated "Change" calculation.
*   **QRIS**: Visual QR code generation (mocked) for mobile banking transactions.
*   **Multi-Payment**: Future-ready matrix for splitting payments across multiple methods.

## 6. 🏪 Multi-Outlet Sync
*   **Outlets Filter**: Dashboard and history views can be filtered to see specific branch performance.
*   **Cross-Outlet Visibility**: While in Order mode, cashiers can see "Omniscience" stock tables for other branches.
