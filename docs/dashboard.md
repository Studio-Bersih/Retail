# 📊 Dashboard & Analytics

## 1. 🏠 Outlet Dashboard
The primary landing page after login (`/outlet/dashboard`).

### Key Widgets:
*   **Today's Sales Summary**: Real-time counter of total revenue for the current outlet.
*   **Transaction Volume**: Quick glance at the number of Retail vs Order completions.
*   **Stock Alerts**: Items reaching low-stock thresholds in the current outlet.
*   **Quick Actions**: Large, accessible buttons for "New Sale", "Check Stock", and "Open History".

## 2. 🏢 Factory / Admin Dashboard
A higher-level view for management (`/factory`).

### Key Widgets:
*   **Multi-Outlet Comparison**: Bar charts comparing performance across different branches.
*   **Aggregated Analytics**: Total company revenue and growth metrics.
*   **Inventory Overview**: System-wide stock levels for factory-to-outlet replenishment.

## 3. 🧭 Navigation
The `Navbar.svelte` provides consistent access to:
*   **Mode Switcher**: Toggle between light/dark themes and operational contexts.
*   **User Profile**: Quick logout and profile settings.
*   **Notifications**: Alerts for inventory or system updates.
