# Visual Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the SvelteKit frontend and implement the Studio Bersih design system — warm brown bersih/bersih-dark themes, CSS token layer, Lucide icon inventory, and the outlet layout shell (fixed navbar with inline tab strip, slide-in drawer, avatar dropdown, empty state).

**Architecture:** All design tokens live in `app.css` as CSS custom properties keyed to `[data-theme]`. DaisyUI v4 + Tailwind v3 provide the component layer; the token layer overrides DaisyUI defaults with the warm brown palette. The outlet layout (`src/routes/outlet/+layout.svelte`) owns the navbar, drawer, and tab state — tabs are ephemeral `$state`, never persisted.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, TailwindCSS 3, DaisyUI 4, svelte-sonner, Lucide Static (icon SVGs)

**Spec:** `docs/superpowers/specs/2026-05-28-visual-guide-design.md`
**Reference:** `docs/ui-ux.md` — cheat-sheet with exact class strings and color values

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Create | Dependencies and scripts |
| `svelte.config.js` | Create | SvelteKit config with vitePreprocess |
| `vite.config.ts` | Create | Vite config (imports SvelteKit plugin) |
| `tsconfig.json` | Create | TypeScript config |
| `.prettierrc` | Create | Prettier: 4-space indent, printWidth 200 |
| `tailwind.config.js` | Create | DaisyUI v4 bersih + bersih-dark themes |
| `postcss.config.js` | Create | Tailwind + autoprefixer PostCSS plugins |
| `src/app.html` | Create | HTML shell — sets `data-theme="bersih"` on `<html>` |
| `src/app.css` | Create | CSS tokens (`--primary`, `--bg`, etc.), `scrollbar-none`, `fadeSlideIn` |
| `src/routes/+layout.svelte` | Create | Root layout — imports `app.css`, mounts `Toaster` |
| `src/routes/+page.svelte` | Create | Login page skeleton |
| `src/routes/outlet/+layout.svelte` | Create | Outlet shell — navbar + drawer + tab system + empty state |
| `src/routes/outlet/+page.svelte` | Create | Redirects `/outlet/` → `/outlet/retail/` |
| `src/library/stores/auth.ts` | Create | Auth store stub (userId, userName, role, outletId, etc.) |
| `src/library/stores/mode.ts` | Create | Mode store: `"retail" \| "order"` |
| `static/icons/*.svg` | Create | 24 Lucide SVG files via lucide-static package |

---

## Task 1: Bootstrap SvelteKit project

**Files:**
- Create: `package.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/app.html`
- Create: `.prettierrc`

- [ ] **Step 1: Create `package.json`**

```json
{
    "name": "studio-bersih-pos",
    "version": "0.0.1",
    "private": true,
    "scripts": {
        "dev": "vite dev",
        "build": "vite build",
        "preview": "vite preview",
        "lint": "prettier --check .",
        "format": "prettier --write ."
    },
    "devDependencies": {
        "@sveltejs/adapter-auto": "^3.0.0",
        "@sveltejs/kit": "^2.0.0",
        "@sveltejs/vite-plugin-svelte": "^4.0.0",
        "autoprefixer": "^10.4.0",
        "daisyui": "^4.0.0",
        "lucide-static": "^0.469.0",
        "postcss": "^8.4.0",
        "prettier": "^3.0.0",
        "prettier-plugin-svelte": "^3.0.0",
        "svelte": "^5.0.0",
        "tailwindcss": "^3.4.0",
        "typescript": "^5.0.0"
    },
    "dependencies": {
        "svelte-sonner": "^0.3.28"
    },
    "type": "module"
}
```

- [ ] **Step 2: Create `svelte.config.js`**

```js
import adapter from '@sveltejs/adapter-auto'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter()
    }
}

export default config
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [sveltekit()]
})
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
    "extends": "./.svelte-kit/tsconfig.json",
    "compilerOptions": {
        "allowJs": true,
        "checkJs": true,
        "esModuleInterop": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "skipLibCheck": true,
        "sourceMap": true,
        "strict": true,
        "lib": ["ESNext", "DOM", "DOM.Iterable"],
        "moduleResolution": "bundler"
    }
}
```

- [ ] **Step 5: Create `src/app.html`**

```html
<!doctype html>
<html lang="id" data-theme="bersih">
    <head>
        <meta charset="utf-8" />
        <link rel="icon" href="%sveltekit.assets%/favicon.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        %sveltekit.head%
    </head>
    <body data-sveltekit-preload-data="hover">
        <div style="display: contents">%sveltekit.body%</div>
    </body>
</html>
```

- [ ] **Step 6: Create `.prettierrc`**

```json
{
    "useTabs": false,
    "tabWidth": 4,
    "singleQuote": true,
    "trailingComma": "none",
    "printWidth": 200,
    "singleAttributePerLine": false,
    "plugins": ["prettier-plugin-svelte"],
    "overrides": [
        { "files": "*.svelte", "options": { "parser": "svelte" } }
    ]
}
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Create minimal `src/routes/+page.svelte` so SvelteKit can start**

```svelte
<h1>Studio Bersih</h1>
```

- [ ] **Step 9: Start dev server and verify it runs**

```bash
npm run dev
```

Expected: `Local: http://localhost:5173` — browser shows "Studio Bersih".

- [ ] **Step 10: Commit**

```bash
git add package.json svelte.config.js vite.config.ts tsconfig.json src/app.html .prettierrc
git commit -m "feat: bootstrap SvelteKit project with TypeScript"
```

---

## Task 2: Configure Tailwind + DaisyUI with bersih themes

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

- [ ] **Step 1: Create `postcss.config.js`**

```js
export default {
    plugins: {
        tailwindcss: {},
        autoprefixer: {}
    }
}
```

- [ ] **Step 2: Create `tailwind.config.js` with both themes**

```js
/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{html,js,ts,svelte}'],
    plugins: [require('daisyui')],
    daisyui: {
        themes: [
            {
                bersih: {
                    'primary':          '#C2622A',
                    'primary-content':  '#ffffff',
                    'secondary':        '#9C7E63',
                    'accent':           '#E8A87C',
                    'neutral':          '#3D2B1F',
                    'base-100':         '#FFFFFF',
                    'base-200':         '#FAF8F5',
                    'base-300':         '#F5F0E8',
                    'base-content':     '#3D2B1F',
                    'success':          '#3D7A5C',
                    'warning':          '#D4900A',
                    'error':            '#B94040',
                    'info':             '#3b82f6'
                }
            },
            {
                'bersih-dark': {
                    'primary':          '#C2622A',
                    'primary-content':  '#ffffff',
                    'secondary':        '#9C7E63',
                    'accent':           '#E8A87C',
                    'neutral':          '#E8C9A8',
                    'base-100':         '#2C1E12',
                    'base-200':         '#221710',
                    'base-300':         '#1A120B',
                    'base-content':     '#E8C9A8',
                    'success':          '#4ade80',
                    'warning':          '#fbbf24',
                    'error':            '#f87171',
                    'info':             '#60a5fa'
                }
            }
        ]
    }
}
```

- [ ] **Step 3: Verify Tailwind picks up the config**

```bash
npm run dev
```

Expected: dev server restarts without errors. No visual change yet — app.css hasn't imported Tailwind.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js postcss.config.js
git commit -m "feat: configure Tailwind v3 + DaisyUI v4 bersih themes"
```

---

## Task 3: Global CSS — tokens, utilities, animations

**Files:**
- Create: `src/app.css`

The token layer sits on top of DaisyUI. These CSS variables are used in component markup via `var(--token)` when DaisyUI semantic classes don't cover it (e.g., drawer chrome, tab underline, muted text).

- [ ] **Step 1: Create `src/app.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── Light theme tokens ── */
[data-theme="bersih"] {
    --primary:       #C2622A;
    --primary-h:     #A8501F;
    --primary-dim:   rgba(194, 98, 42, 0.10);
    --bg:            #F5F0E8;
    --surface:       #FAF8F5;
    --card:          #FFFFFF;
    --border:        #E5DDD5;
    --border-soft:   #EDE8E2;
    --text:          #3D2B1F;
    --text-muted:    #9C7E63;
    --text-faint:    #C4AC98;
    --drawer-bg:     #2C1E12;
    --drawer-text:   #E8C9A8;
    --drawer-muted:  #9C7E63;
    --tab-active-bg: rgba(194, 98, 42, 0.08);
}

/* ── Dark theme tokens ── */
[data-theme="bersih-dark"] {
    --primary:       #C2622A;
    --primary-h:     #A8501F;
    --primary-dim:   rgba(194, 98, 42, 0.15);
    --bg:            #1A120B;
    --surface:       #221710;
    --card:          #2C1E12;
    --border:        #3D2B1F;
    --border-soft:   #342015;
    --text:          #E8C9A8;
    --text-muted:    #9C7E63;
    --text-faint:    #6B5744;
    --drawer-bg:     #0F0A05;
    --drawer-text:   #E8C9A8;
    --drawer-muted:  #6B5744;
    --tab-active-bg: rgba(194, 98, 42, 0.12);
}

/* ── Utilities ── */
@layer utilities {
    .scrollbar-none {
        scrollbar-width: none;
    }
    .scrollbar-none::-webkit-scrollbar {
        display: none;
    }
}

/* ── Page transition animation ── */
@keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Verify browser**

```bash
npm run dev
```

Open browser → DevTools → Elements → `<html>` should have `data-theme="bersih"`. Background colour of `<body>` should be white (DaisyUI `base-100`). No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat: add global CSS token layer (bersih/bersih-dark) + utilities"
```

---

## Task 4: Lucide icon inventory

**Files:**
- Create: `static/icons/*.svg` (24 files)
- Create: `scripts/copy-icons.mjs` (build-time helper, not shipped)

- [ ] **Step 1: Create `scripts/copy-icons.mjs`**

```js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir   = path.resolve(__dirname, '..')
const srcDir    = path.join(rootDir, 'node_modules', 'lucide-static', 'icons')
const outDir    = path.join(rootDir, 'static', 'icons')

const ICONS = [
    'menu',
    'x',
    'shopping-bag',
    'clipboard',
    'grid-2x2',
    'clock',
    'bar-chart-2',
    'package',
    'sliders-horizontal',
    'settings',
    'log-out',
    'sun',
    'moon',
    'plus',
    'chevron-left',
    'chevron-right',
    'search',
    'tag',
    'user',
    'wallet',
    'printer',
    'trash-2',
    'pencil',
    'eye'
]

fs.mkdirSync(outDir, { recursive: true })

let copied = 0
let missing = []

for (const name of ICONS) {
    const src = path.join(srcDir, `${name}.svg`)
    const dst = path.join(outDir, `${name}.svg`)
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst)
        copied++
    } else {
        missing.push(name)
    }
}

console.log(`Copied ${copied}/${ICONS.length} icons to static/icons/`)
if (missing.length) console.warn('Missing icons:', missing.join(', '))
```

- [ ] **Step 2: Run the script**

```bash
node scripts/copy-icons.mjs
```

Expected output:
```
Copied 24/24 icons to static/icons/
```

If any icons are listed as missing, check the exact filename in `node_modules/lucide-static/icons/` — some may differ from the name in the inventory. Update the script and re-run until all 24 copy successfully.

- [ ] **Step 3: Verify files were created**

```bash
ls static/icons/ | wc -l
```

Expected: `24`

- [ ] **Step 4: Commit**

```bash
git add static/icons/ scripts/copy-icons.mjs
git commit -m "feat: add 24 Lucide SVG icons to static/icons/"
```

---

## Task 5: Store stubs — auth and mode

**Files:**
- Create: `src/library/stores/auth.ts`
- Create: `src/library/stores/mode.ts`

These are stubs — the full auth flow (LocalStorage persistence, encryption) is implemented in `2026-05-27-auth.md`. The outlet layout reads from these stores so they must exist now.

- [ ] **Step 1: Create `src/library/stores/auth.ts`**

```typescript
import { writable } from 'svelte/store'

export interface AuthState {
    userId:     string | null
    userName:   string | null
    nip:        string | null
    role:       'cashier' | 'manager' | 'admin' | null
    outletId:   string | null
    outletName: string | null
}

const defaultAuth: AuthState = {
    userId:     null,
    userName:   null,
    nip:        null,
    role:       null,
    outletId:   null,
    outletName: null
}

export const auth = writable<AuthState>(defaultAuth)
```

- [ ] **Step 2: Create `src/library/stores/mode.ts`**

```typescript
import { writable } from 'svelte/store'

export const mode = writable<'retail' | 'order'>('retail')
```

- [ ] **Step 3: Commit**

```bash
git add src/library/stores/
git commit -m "feat: add auth and mode store stubs"
```

---

## Task 6: Root layout — app.css import + Toaster

**Files:**
- Create: `src/routes/+layout.svelte`

- [ ] **Step 1: Create `src/routes/+layout.svelte`**

```svelte
<script lang="ts">
    import '../app.css'
    import { Toaster } from 'svelte-sonner'

    let { children } = $props()
</script>

<Toaster richColors position="top-right" />

{@render children()}
```

- [ ] **Step 2: Verify browser**

```bash
npm run dev
```

Open `http://localhost:5173`. DaisyUI styles should now apply — background should be warm white (`#FAF8F5` / `base-200`). No toast visible until `toast.*` is called. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: add root layout with Toaster"
```

---

## Task 7: Outlet layout — navbar, drawer, tab strip, empty state

**Files:**
- Create: `src/routes/outlet/+layout.svelte`
- Create: `src/routes/outlet/+page.svelte`

This is the main shell. The outlet layout renders the fixed navbar (hamburger → logo → quick actions → tab strip → greeting → theme toggle → avatar) above all outlet routes. Tab state is ephemeral `$state` in this component — not a store, not persisted.

- [ ] **Step 1: Create `src/routes/outlet/+layout.svelte`**

```svelte
<script lang="ts">
    import { goto } from '$app/navigation'
    import { page } from '$app/state'
    import { get } from 'svelte/store'
    import { auth } from '$lib/stores/auth'
    import { mode } from '$lib/stores/mode'
    import { onMount } from 'svelte'

    let { children } = $props()

    // ── Auth guard ──
    onMount(() => {
        const $auth = get(auth)
        if (!$auth.userId) goto('/')
    })

    // ── Tab system ──
    interface Tab {
        id:    string
        label: string
        route: string
        icon:  string   // SVG path content for currentColor rendering
    }

    const FEATURES: { id: string; label: string; route: string; icon: string; desc: string }[] = [
        { id: 'retail',  label: 'Retail',       route: '/outlet/retail',        icon: 'shopping-bag', desc: 'Transaksi langsung & kasir' },
        { id: 'pesanan', label: 'Pesanan',       route: '/outlet/pesanan',       icon: 'clipboard',    desc: 'Antrean pesanan aktif' },
        { id: 'riwayat', label: 'Riwayat',       route: '/outlet/history/retail', icon: 'clock',       desc: 'Semua transaksi selesai' },
        { id: 'kasir',   label: 'Kasir Harian',  route: '/outlet/kasir',         icon: 'bar-chart-2',  desc: 'Laporan shift & setoran' },
        { id: 'stok',    label: 'Master Item',   route: '/outlet/master-item',   icon: 'package',      desc: 'Katalog & stok barang' },
        { id: 'penyesuaian', label: 'Penyesuaian', route: '/outlet/penyesuaian', icon: 'sliders',      desc: 'Penyesuaian stok' }
    ]

    let tabs      = $state<Tab[]>([])
    let activeTab = $state<string | null>(null)

    function openTab(id: string) {
        const existing = tabs.find(t => t.id === id)
        if (existing) {
            activeTab = id
            goto(existing.route)
            return
        }
        const def = FEATURES.find(f => f.id === id)
        if (!def) return
        tabs.push({ id: def.id, label: def.label, route: def.route, icon: def.icon })
        activeTab = id
        goto(def.route)
    }

    function closeTab(id: string) {
        const idx = tabs.findIndex(t => t.id === id)
        if (idx === -1) return
        tabs.splice(idx, 1)
        if (activeTab === id) {
            if (tabs.length === 0) {
                activeTab = null
                goto('/outlet')
            } else {
                const next = tabs[Math.max(0, idx - 1)]
                activeTab = next.id
                goto(next.route)
            }
        }
    }

    function openRetail() {
        mode.set('retail')
        openTab('retail')
    }

    function openOrder() {
        mode.set('order')
        openTab('retail')
    }

    // ── Theme toggle ──
    let dark = $state(false)
    $effect(() => {
        document.documentElement.setAttribute('data-theme', dark ? 'bersih-dark' : 'bersih')
    })

    // ── Drawer ──
    let drawerOpen = $state(false)

    // ── Avatar dropdown ──
    let ddOpen = $state(false)

    function handleDocClick(e: MouseEvent) {
        const target = e.target as HTMLElement
        if (!target.closest('[data-avatar-zone]')) ddOpen = false
    }

    $effect(() => {
        document.addEventListener('click', handleDocClick)
        return () => document.removeEventListener('click', handleDocClick)
    })

    // ── Keyboard ──
    $effect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                drawerOpen = false
                ddOpen = false
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    })

    // ── Auth reactive reads ──
    let $auth = $state(get(auth))
    auth.subscribe(v => { $auth = v })

    let initials  = $derived(($auth.userName ?? 'U').slice(0, 2).toUpperCase())
    let greeting  = $derived((() => {
        const h = new Date().getHours()
        if (h < 12) return 'Selamat pagi'
        if (h < 17) return 'Selamat siang'
        return 'Selamat malam'
    })())

    const VERSION = '0.1.0'
</script>

<!-- ════════════════════════════════════════════
     NAVBAR
════════════════════════════════════════════ -->
<nav class="fixed top-0 left-0 right-0 z-[200] h-[56px] bg-base-100 border-b border-[var(--border)] flex items-center gap-[6px] px-3 shadow-sm">

    <!-- hamburger -->
    <button class="btn btn-ghost btn-sm btn-square" onclick={() => drawerOpen = true}>
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
        </svg>
    </button>

    <!-- logo -->
    <span class="text-[14px] font-bold tracking-tight shrink-0 select-none">
        Studio <span class="text-[var(--primary)]">Bersih</span>
    </span>
    <div class="w-px h-5 bg-[var(--border)] shrink-0"></div>

    <!-- quick actions -->
    <button class="btn btn-primary btn-sm gap-1.5 shrink-0" onclick={openRetail}>
        <svg class="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><line x1="3" x2="21" y1="6" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        Retail
    </button>
    <button class="btn btn-outline btn-primary btn-sm gap-1.5 shrink-0" onclick={openOrder}>
        <svg class="w-[13px] h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        </svg>
        Order
    </button>

    <!-- ── Tab strip ── -->
    <div class="flex-1 min-w-0 flex items-center gap-[3px] overflow-x-auto scrollbar-none px-1">
        {#each tabs as tab (tab.id)}
            {@const isActive = tab.id === activeTab}
            <div
                class="flex items-center gap-[6px] px-[10px] h-[34px] rounded-[7px] text-[12px] font-medium shrink-0 cursor-pointer transition-all border relative
                    {isActive
                        ? 'bg-[var(--tab-active-bg)] text-[var(--primary)] border-[rgba(194,98,42,0.25)] font-semibold'
                        : 'text-[var(--text-muted)] border-transparent hover:bg-base-200 hover:text-[var(--text)]'}"
                onclick={() => { activeTab = tab.id; goto(tab.route) }}
            >
                {#if isActive}
                    <span class="absolute bottom-[-1px] left-2 right-2 h-[2px] bg-[var(--primary)] rounded-full"></span>
                {/if}
                <img src="/icons/{tab.icon}.svg" alt="" class="w-[13px] h-[13px] shrink-0 opacity-70" />
                <span>{tab.label}</span>
                <span
                    class="w-[15px] h-[15px] rounded-sm flex items-center justify-center text-[var(--text-faint)] hover:bg-error/15 hover:text-error ml-[2px]"
                    onclick|stopPropagation={() => closeTab(tab.id)}
                >
                    <svg class="w-[9px] h-[9px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                </span>
            </div>
        {/each}

        <!-- new tab picker button -->
        <button
            class="w-[26px] h-[26px] rounded-[6px] border border-dashed border-[var(--border)] flex items-center justify-center text-[var(--text-faint)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary-dim)] transition-all shrink-0"
            title="Buka fitur baru"
        >
            <svg class="w-[12px] h-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
        </button>
    </div>

    <!-- greeting + outlet + version -->
    <div class="flex flex-col justify-center items-end shrink-0 leading-none">
        <span class="text-[12px] font-semibold text-[var(--text)]">{greeting}, {$auth.userName ?? 'Pengguna'} 👋</span>
        <span class="text-[10px] font-mono text-[var(--text-faint)] mt-[2px]">{$auth.outletName ?? 'Outlet'} · v{VERSION}</span>
    </div>
    <div class="w-px h-5 bg-[var(--border)] shrink-0"></div>

    <!-- theme toggle -->
    <svg class="w-[14px] h-[14px] shrink-0 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2m-7.07-14.93 1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2m-4.34-7.07-1.41 1.41M6.34 17.66l-1.41 1.41" />
    </svg>
    <div
        class="w-[38px] h-[20px] rounded-full border border-[var(--border)] relative cursor-pointer transition-colors duration-250 shrink-0"
        style:background={dark ? 'var(--primary)' : 'var(--border)'}
        onclick={() => dark = !dark}
    >
        <div
            class="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-220"
            style:transform={dark ? 'translateX(18px)' : 'translateX(0)'}
        ></div>
    </div>
    <svg class="w-[14px] h-[14px] shrink-0 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>

    <!-- avatar + dropdown -->
    <div class="relative shrink-0" data-avatar-zone>
        <div
            class="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[11px] font-bold text-white cursor-pointer border-2 border-transparent transition-all hover:border-[var(--primary)] hover:shadow-[0_0_0_3px_var(--primary-dim)] select-none"
            style:background="var(--primary)"
            onclick={() => ddOpen = !ddOpen}
        >
            {initials}
        </div>

        {#if ddOpen}
            <div class="absolute top-[calc(100%+10px)] right-0 bg-base-100 border border-[var(--border)] rounded-[12px] shadow-xl min-w-[210px] overflow-hidden z-[999]">
                <div class="px-4 py-[13px] border-b border-[var(--border)]">
                    <div class="text-[13px] font-bold text-[var(--text)]">{$auth.userName ?? '—'}</div>
                    <div class="text-[11px] text-[var(--text-muted)] mt-px capitalize">{$auth.role ?? '—'}</div>
                    <div class="text-[10px] font-mono text-[var(--text-faint)] mt-[2px]">NIP: {$auth.nip ?? '—'} · {$auth.outletName ?? '—'}</div>
                </div>
                <button class="w-full flex items-center gap-[10px] px-4 py-[10px] text-[13px] font-medium text-[var(--text-muted)] hover:bg-base-200 hover:text-[var(--text)] transition-colors">
                    <svg class="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                    Pengaturan
                </button>
                <div class="h-px bg-[var(--border)] my-1"></div>
                <button
                    class="w-full flex items-center gap-[10px] px-4 py-[10px] text-[13px] font-medium text-error hover:bg-error/10 transition-colors"
                    onclick={() => goto('/')}
                >
                    <svg class="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
                    Keluar
                </button>
            </div>
        {/if}
    </div>
</nav>

<!-- ════════════════════════════════════════════
     DRAWER OVERLAY + PANEL
════════════════════════════════════════════ -->
{#if drawerOpen}
    <div
        class="fixed inset-0 z-[300] bg-black/45 backdrop-blur-[2px] transition-opacity"
        onclick={() => drawerOpen = false}
    ></div>
{/if}

<aside
    class="fixed top-0 left-0 bottom-0 z-[400] w-[252px] flex flex-col shadow-2xl transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0,0.12,1)]"
    style:background="var(--drawer-bg)"
    style:transform={drawerOpen ? 'translateX(0)' : 'translateX(-100%)'}
>
    <!-- drawer header -->
    <div class="h-[56px] flex items-center justify-between px-[14px] border-b border-white/[0.06] shrink-0">
        <span class="text-[14px] font-bold select-none" style:color="var(--drawer-text)">
            Studio <span style:color="var(--primary)">Bersih</span>
        </span>
        <button
            class="w-[29px] h-[29px] rounded-[6px] border border-white/10 flex items-center justify-center transition-colors hover:bg-white/[0.07]"
            style:color="var(--drawer-muted)"
            onclick={() => drawerOpen = false}
        >
            <svg class="w-[12px] h-[12px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
        </button>
    </div>

    <!-- drawer nav -->
    <nav class="flex-1 px-2 py-[10px] flex flex-col gap-[2px] overflow-y-auto">
        <span class="text-[10px] font-semibold uppercase tracking-[0.1em] px-[10px] py-[10px] pb-[5px]" style:color="var(--drawer-muted)">Outlet</span>

        {#each FEATURES as f}
            {@const isActive = page.url.pathname.startsWith(f.route)}
            <button
                class="w-full flex items-center gap-[10px] px-[10px] py-[9px] rounded-[7px] text-[13px] font-medium transition-all cursor-pointer text-left
                    {isActive ? 'bg-[var(--primary)] text-white' : 'hover:bg-white/[0.07]'}"
                style:color={isActive ? undefined : 'var(--drawer-muted)'}
                onclick={() => { openTab(f.id); drawerOpen = false }}
            >
                <img src="/icons/{f.icon}.svg" alt="" class="w-[14px] h-[14px] shrink-0 opacity-80" />
                {f.label}
            </button>
        {/each}
    </nav>

    <!-- drawer footer — user chip -->
    <div class="px-2 py-[10px] border-t border-white/[0.06] shrink-0">
        <div class="flex items-center gap-[10px] px-[10px] py-[9px]">
            <div class="w-[27px] h-[27px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 select-none" style:background="var(--primary)">
                {initials}
            </div>
            <div>
                <div class="text-[12px] font-semibold" style:color="var(--drawer-text)">{$auth.userName ?? '—'}</div>
                <div class="text-[10px]" style:color="var(--drawer-muted)">{$auth.role ?? '—'} · {$auth.outletName ?? '—'}</div>
            </div>
        </div>
    </div>
</aside>

<!-- ════════════════════════════════════════════
     MAIN CONTENT
════════════════════════════════════════════ -->
{#if tabs.length === 0}
    <!-- Empty state — no tabs open -->
    <div class="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] mt-[56px] px-5 py-10 text-center">
        <div class="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center mb-[18px] border"
             style:background="var(--primary-dim)" style:border-color="rgba(194,98,42,0.2)" style:color="var(--primary)">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
        </div>

        <h2 class="text-[20px] font-bold tracking-tight text-[var(--text)] mb-[7px]">Mau mulai dari mana?</h2>
        <p class="text-[14px] text-[var(--text-muted)] max-w-[380px] leading-relaxed mb-7">
            Pilih fitur di bawah untuk membukanya sebagai tab. Kamu bisa membuka beberapa fitur sekaligus dan berpindah bebas.
        </p>

        <div class="grid grid-cols-3 gap-[9px] max-w-[540px] w-full">
            {#each FEATURES as f}
                <button
                    class="bg-base-100 border border-[var(--border)] rounded-[12px] p-[15px] flex flex-col items-center gap-[7px] text-center cursor-pointer transition-all hover:border-[var(--primary)] hover:shadow-[0_4px_16px_rgba(194,98,42,0.12)] hover:-translate-y-[2px]"
                    onclick={() => openTab(f.id)}
                >
                    <img src="/icons/{f.icon}.svg" alt="" class="w-5 h-5" />
                    <span class="text-[12px] font-semibold text-[var(--text)]">{f.label}</span>
                    <span class="text-[10px] text-[var(--text-muted)] leading-snug">{f.desc}</span>
                </button>
            {/each}
        </div>

        <div class="mt-[22px] text-[11px] text-[var(--text-faint)] flex items-center gap-[6px] flex-wrap justify-center">
            <kbd class="bg-base-200 border border-[var(--border)] border-b-2 rounded px-[6px] py-[1px] text-[10px] font-mono text-[var(--text-muted)]">Retail</kbd>
            atau
            <kbd class="bg-base-200 border border-[var(--border)] border-b-2 rounded px-[6px] py-[1px] text-[10px] font-mono text-[var(--text-muted)]">Order</kbd>
            di navbar untuk mulai cepat
        </div>
    </div>
{:else}
    <div class="pt-[56px]">
        {@render children()}
    </div>
{/if}
```

- [ ] **Step 2: Create `src/routes/outlet/+page.svelte`**

This page is hit when navigating to `/outlet/` directly. It redirects to the retail page.

```svelte
<script lang="ts">
    import { goto } from '$app/navigation'
    import { onMount } from 'svelte'

    onMount(() => goto('/outlet/retail', { replaceState: true }))
</script>
```

- [ ] **Step 3: Verify browser**

Navigate to `http://localhost:5173/outlet`. Expected:
- Fixed navbar renders with "Studio Bersih" logo, Retail + Order buttons, empty tab strip, greeting, theme toggle, avatar circle
- Empty state grid appears below navbar with 6 feature cards
- Clicking a quick action button or a feature card: a tab appears in the navbar tab strip
- Clicking a tab's × closes it; if last tab closes, empty state returns
- Hamburger opens drawer from left; clicking backdrop or × closes it
- Theme toggle switches `data-theme` on `<html>`; background and text colours update

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/
git commit -m "feat: add outlet layout shell — navbar, drawer, tab system, empty state"
```

---

## Task 8: Login page skeleton

**Files:**
- Modify: `src/routes/+page.svelte`

This is a structural placeholder. Actual auth logic (form validation, API call, store write) is implemented in `2026-05-27-auth.md`.

- [ ] **Step 1: Replace `src/routes/+page.svelte`**

```svelte
<script lang="ts">
    import { goto } from '$app/navigation'
    import { auth } from '$lib/stores/auth'
    import { get } from 'svelte/store'
    import { onMount } from 'svelte'

    onMount(() => {
        if (get(auth).userId) goto('/outlet')
    })

    let companyCode = $state('')
    let username    = $state('')
    let password    = $state('')
    let loading     = $state(false)

    async function handleLogin() {
        if (!companyCode || !username || !password) return
        loading = true
        // TODO: replaced by real auth in 2026-05-27-auth.md
        // For now, mock-fill the store for layout testing
        auth.set({ userId: '1', userName: username, nip: '001', role: 'cashier', outletId: 'o1', outletName: companyCode })
        await goto('/outlet')
        loading = false
    }
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
    <div class="bg-base-100 border border-[var(--border)] rounded-[14px] shadow-xl w-full max-w-sm p-8">
        <div class="text-center mb-8">
            <h1 class="text-[22px] font-bold tracking-tight text-[var(--text)]">
                Studio <span class="text-[var(--primary)]">Bersih</span>
            </h1>
            <p class="text-[13px] text-[var(--text-muted)] mt-1">Point of Sale</p>
        </div>

        <form class="flex flex-col gap-4" onsubmit|preventDefault={handleLogin}>
            <div class="flex flex-col gap-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]">Kode Perusahaan</label>
                <input type="text" class="input input-bordered input-sm w-full" placeholder="Contoh: SBRS" bind:value={companyCode} />
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]">Username</label>
                <input type="text" class="input input-bordered input-sm w-full" placeholder="Username" bind:value={username} autocomplete="username" />
            </div>
            <div class="flex flex-col gap-1.5">
                <label class="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]">Password</label>
                <input type="password" class="input input-bordered input-sm w-full" placeholder="••••••••" bind:value={password} autocomplete="current-password" />
            </div>

            <button type="submit" class="btn btn-primary btn-sm w-full mt-2" disabled={loading}>
                {loading ? 'Masuk...' : 'Masuk'}
            </button>
        </form>
    </div>
</div>
```

- [ ] **Step 2: Verify browser**

Navigate to `http://localhost:5173`. Expected:
- Warm cream background, centred white card
- "Studio Bersih" header with orange "Bersih"
- Three fields: Kode Perusahaan, Username, Password
- Filling all three and submitting navigates to `/outlet` and shows the outlet layout with empty state

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add login page skeleton (auth implementation in 2026-05-27-auth.md)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered in task |
|---|---|
| Warm brown palette, bersih/bersih-dark themes | Task 2 (`tailwind.config.js`) |
| CSS custom token layer | Task 3 (`app.css`) |
| Icon system — Lucide, 24 SVGs, `/static/icons/` | Task 4 |
| Theme toggle — `data-theme` on `<html>`, Svelte 5 `$effect` | Task 7 (outlet layout) |
| Navbar: hamburger, logo, quick actions, tab strip, greeting, toggle, avatar | Task 7 |
| Tab system: ephemeral `$state`, open/close, active underline | Task 7 |
| Drawer: 252px, always dark, nav items, user footer | Task 7 |
| Avatar dropdown: initials, Settings, Keluar | Task 7 |
| Empty state: 6 feature cards, "Mau mulai dari mana?" | Task 7 |
| Login page: company code + username + password fields | Task 8 |
| Toaster: svelte-sonner, richColors, top-right | Task 6 |
| Prettier: 4-space, printWidth 200 | Task 1 |

**No placeholders detected.** All steps contain full code.

**Type consistency:** `AuthState` defined in Task 5, consumed in Task 7 via `auth.subscribe`. `Tab` interface defined and used within Task 7's single file. `FEATURES` array used for both tab opening and drawer nav — single source of truth.

**Scope:** One plan → one working frontend shell. Feature pages (Retail, Pesanan, Riwayat, etc.) have their own plans.

---

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — execute tasks in this session using executing-plans

Which approach?
