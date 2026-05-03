# 🧾 PRODUCT REQUIREMENTS & CAPABILITIES (V2.0)

## POS Application (Retail + Order Mode)

---

# 1. 📌 OVERVIEW

## 1.1 Objective

Build a modern **Point of Sale (POS) web application** that supports:
* 🛒 **Retail** (instant transactions)
* 📦 **Order** (scheduled / multi-outlet orders with deposit support)

---

## 1.2 Core Goals

* ⚡ Fast cashier workflow (Keyboard-First Operations: Arrow keys, Global Escaped Modal binds, Ctrl+Enter shortcuts)
* 🧠 Low cognitive load UI (Dynamic automated Focus fields instantly readying typings, precise visual hierarchies)
* 🎯 Intelligent Payload Tracking (Auto-gathering of metrics for seamless backend ingestion)
* 💾 Persistent cart (No accidental loss tracking directly via internal stores)
* 🏪 Real-time cross-outlet visibility filters

---

# 2. 🔐 AUTHENTICATION

## Login Flow

* Credentials mapped natively inside auth tracking logic.
* Integrated `utils/cleaner.ts` which automatically forcefully wipes LocalStorage, SessionStorage, and all Cache Cookies upon logout.
* Automatically relays `$auth` store structures natively identifying the exact Cashier / Worker associated to all Checkout payloads.

---

# 3. 🎯 ADVANCED RETAIL & ORDER CHECKOUT SYSTEM

The core mechanism separating **Retail** operations from standard **Order** fulfillment operates across the highly scaled `CartSection.svelte` logic tree alongside the dynamic `PaymentModal.svelte`.

## A. Intelligent Item Selection
### Exact SKU Search:
* Submitting highly-specific codes instantly grabs exact datasets bypassing all UI overheads in a single stroke (Appending automatically to `.cart-qty-input`).
* If not exact, it seamlessly trips the Smart Search modal rendering comprehensive matching items automatically formatted to visually separate free items versus standard carts.

### Interactive Cart System:
* Cart natively leverages dynamic `<input type="number">` inputs enabling manual rapid numeric edits, bounded strictly to clean quantities.
* Includes Arrow Navigations (`ArrowUp/ArrowDown`) natively bypassing mice interactions entirely while focusing inputs perfectly.
* Identifies "Real-Time Stock Counters" beside item definitions, throwing explicit text coloring alerts when cashier edits bypass specific active-branch quantities.
* "Free Products" tracking dynamically segregates total sums while mapping exclusively against manually appended components vs. Promo rewards!

## B. Complex Transaction Modifiers
### Pricing Panel Abstraction (`PricingPanel.svelte`)
* Completely untangles simple items away from high-density calculations: Handles Multi-level scaling discounts (Percentage AND hard Rupiah fixed constants) concurrently.
* Calculates extra packaging costs, modification surcharges, transport layers, and general `AdditionalCuts` vs `AdditionalAdds` custom definitions on the fly.

### Transaction Notes & Roles
* Includes dynamic internal notes appending to internal REST Checkout API pipelines seamlessly.
* Defines "Transaction Types" defaulting to explicit modes like internally simulated "Personal Purchase", mapping alongside specific User-selected Members inside native UI drawers.

## C. Payload Aggregation Checkout (`PaymentModal.svelte`)
### Deposit Control Flow
* Dynamically handles strict `allowDeposit` variables based entirely on operational mode (Orders vs Retail) letting POS lock down logic paths efficiently.
* Cash default resets to empty field ensuring purposeful entries to track exact payments to exact change mappings.

### Shortcut Execution
* Listens strictly for `CTRL + ENTER` logic to instantly hook into payment submission APIs, directly console-logging perfectly merged data payloads containing `$auth`, `MemberID`, `PricingDetails`, `FreeProducts` arrays, `Items` payload architectures, and `Multiple Payment Methods` matrices seamlessly simulating total transactions efficiently without backend reliance.

---

# 4. 🏢 MULTI-OUTLET INVENTORY OMNISCIENCE

## 📦 Cek Stok Outlet (`Order.svelte`)
* Natively breaks out of current physical location environments by triggering multi-outlet array queries.
* Intelligently queries pure `$cart.items` data objects explicitly matching current exact customer carts against specified alternate location inventories gracefully parsing only the required comparative stock tables.

---

# 5. 💳 PAYMENT & QRIS METRICS
* Integrates robust abstraction wrappers (E.g. `<Rupiah useClass="" />`) that guarantees native numerical inputs effortlessly translate dynamically back into real integer logic while casting visually perfectly.
* Explicit QRIS M-Banking code triggers.

---

# 6. 🧠 UI / STYLING CAPABILITIES
* Implements robust DaisyUI variables supporting exact light/dark system interactions, specifically injected theme switchers directly embedded natively at standard Navigation levels.
* Strict "Oneline HTML Configuration Architecture", enforcing custom `<prettier.config.js>` formatting tracking 4-indent scale spaces scaling uniformly at high `<printWidth>` capacities explicitly separating logical structures efficiently.

---

# 7. 📜 TRANSACTION HISTORY (RIWAYAT TRANSAKSI)

## A. Deep Search & Filtering
* Seamlessly toggles strictly between **Retail** and **Order** modes relying cleanly on the centralized `$mode` configuration store.
* Unbound dynamic searching actively scanning deeper properties including `Transaction ID`, `Cashier Name`, `Transaction Type`, `Member ID`, `Notes`, `Phone`, and `Outlet ID` effortlessly.
* Strict Date Range bindings automatically initialized via `useDefault.ts` hooks resolving default timelines cleanly (First day to Current day limits natively).

## B. Exhaustive Payload Presentation
* Explicit transaction Drawers recursively break down the entire `handlePay()` submission schema mapping nested matrices exactly.
* Fully itemizes custom adjustments (`AdditionalCost.packaging`, `transport`, `AdditionalAdds/Cuts`), explicitly calculating and rendering Promo/Discount deductions.
* Fully dynamic numbered pagination structures complete with adjustable limit parameters natively hooked to the dataset boundaries.
