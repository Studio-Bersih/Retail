# 🏗️ Studio Bersih - POS Structure (Reacted from /src)

A comprehensive breakdown of the internal SvelteKit modular components scaling across Studio Bersih - POS operations.

```text
src/
├── app.css                 - Global stylesheets and Tailwind tokens
├── app.d.ts                - Ambient type declarations
├── app.html                - Root HTML entry
├── library/                - Core business logic & reusable modules
│   ├── components/         - Visual UI blocks
│   │   ├── factory/        - Factory dashboard components
│   │   │   └── Navbar.svelte
│   │   ├── outlet/         - Outlet/Retail domain components
│   │   │   ├── Order.svelte - Order mode orchestrator (Multi-outlet & deposits)
│   │   │   ├── Retail.svelte - Retail mode orchestrator (Direct POS sales)
│   │   │   └── retail/     - Specialized feature chunks
│   │   │       ├── CartSection.svelte      - Dynamic cart list & Free products logic
│   │   │       ├── ItemSearchModal.svelte  - Product suggestion and selection modal
│   │   │       ├── MemberPanel.svelte      - Customer Service and Member UI block
│   │   │       ├── MemberSearchModal.svelte- Suggestion modal identifying members 
│   │   │       ├── Notes.svelte            - Transactional extra payload metadata
│   │   │       ├── PaymentModal.svelte     - Checkout orchestration & REST payload
│   │   │       ├── PricingPanel.svelte     - Discount, addon, & modification calculation
│   │   │       ├── ProductSearchField.svelte- Exact SKU vs Keyword interpretation field
│   │   │       ├── PromoModal.svelte       - Promo validation component
│   │   │       ├── QrisModal.svelte        - Mobile banking QR code viewer
│   │   │       └── SearchDrawer.svelte     - Generalized drawer framework
│   │   └── shared/         - Global layout & utility components
│   │       ├── Drawer.svelte
│   │       ├── Icon.svelte
│   │       ├── Modal.svelte
│   │       ├── Navbar.svelte
│   │       ├── Rupiah.svelte               - Native IDR Currency Input binding abstraction
│   │       ├── Toast.svelte
│   │       └── Toggle.svelte
│   ├── hooks/              - Composable interaction layers (API hooks)
│   │   ├── useGet.ts
│   │   └── usePost.ts
│   ├── mock/               - Client-side static simulated endpoints & datasets
│   │   ├── auth.ts
│   │   ├── cs.ts
│   │   ├── history.ts      - Dense dynamic transaction history generation
│   │   ├── items.ts
│   │   ├── members.ts
│   │   ├── outlets.ts
│   │   ├── payment-methods.ts
│   │   ├── promos.ts
│   │   └── transaction-types.ts
│   ├── stores/             - Svelte persistent global state containers
│   │   ├── auth.ts         - Auth tracking and caching flow
│   │   ├── cart.ts         - Checkout persistence & complex payload construction
│   │   ├── mode.ts         - Global dashboard theme tracking
│   │   └── toast.ts        - UI feedback pipeline
│   ├── types/              - TypeScript domain entity safety
│   │   ├── Cart.ts
│   │   └── Master.ts
│   ├── utils/              - Pure utility helpers
│   │   ├── Carbon.ts       - Date parsing orchestration
│   │   ├── cleaner.ts      - Auth flush, LocalStorage, and complete Session clearing
│   │   └── formatter.ts    - Global localized strings & formatDate parsing
│   └── validator/          - UI filtering & boundary logic orchestration
│       └── useDefault.ts   - Default date scoping (first, last, current limits)
└── routes/                 - NextJS-style file-system routing orchestrator
    ├── +layout.svelte      - Core application shell structure
    ├── +page.svelte        - Root index (Login) 
    ├── factory/           
    │   └── +page.svelte    - Factory root page
    └── outlet/
        ├── +layout.svelte  - Protected authenticated outlet wrapper
        ├── dashboard/
        │   └── +page.svelte- Outlet default operational statistics
        ├── history/
        │   └── retail/
        │       └── +page.svelte- Paginated history logs, filtering & drawer payloads
        └── retail/
            └── +page.svelte- Point Of Sale initialization wrapper
```
