# 🌏 Studio Bersih - POS - Project Overview

## 1. 📌 Introduction
Studio Bersih - POS is a high-performance, modern **Point of Sale (POS)** ecosystem designed for businesses that operate across multiple physical locations (outlets) and require both instant retail transactions and scheduled order fulfillment.

Built with **SvelteKit** and **TypeScript**, the system prioritizes speed, reliability, and low cognitive load for cashiers. It bridges the gap between simple retail POS and complex order management systems.

## 2. 🎯 Core Business Objectives
*   **Operational Efficiency**: Minimize the time from "item selection" to "payment completion" using keyboard-first interactions.
*   **Data Integrity**: Ensure every transaction is tracked with precise metadata, including cashier ID, outlet origin, and complex pricing modifiers.
*   **Omniscience**: Provide real-time visibility into stock levels across all outlets, allowing for smarter order fulfillment.
*   **Modern Experience**: Deliver a premium, responsive UI that works seamlessly on both desktop workstations and tablets.

## 3. 🚀 Key Pillars
### 🛒 Dual-Mode Operation
*   **Retail Mode**: Optimized for fast-paced, walk-in customers. Instant checkout, single payment method focus.
*   **Order Mode**: Designed for pre-orders, custom fulfillment, and deposits. Supports partial payments and multi-outlet inventory checking.

### ⌨️ Keyboard-First Design
The UI is engineered to be operated almost entirely without a mouse. Global shortcuts (e.g., `Ctrl+Enter` to pay), arrow-key navigation in lists, and automated input focus ensure a fluid workflow.

### 🧠 Intelligent Pricing Engine
Handles complex calculations on-the-fly, including multi-tier discounts (percentage and fixed), additional costs (packaging, transport), and custom surcharges, all while maintaining a transparent audit trail.

## 4. 👥 Target Audience
*   **Cashiers**: Requiring a fast, non-distracting tool for daily sales.
*   **Outlet Managers**: Needing real-time stock insights and history tracking.
*   **Business Owners**: Looking for a scalable, modern platform to manage their retail growth.

## 5. 🛠️ Technical Philosophy
*   **Simplicity Over Cleverness**: Code is written for clarity and maintainability.
*   **State-Driven UI**: leveraging Svelte stores for a reactive and consistent user experience.
*   **Robust Mocking**: A full client-side mock system allows for frontend development and testing without immediate backend reliance.
