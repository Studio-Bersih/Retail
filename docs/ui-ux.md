# UI/UX Developer Reference

**Format:** cheat-sheet — every section leads with the value or class string. No prose before the answer.

---

## 1. Color Tokens

Custom CSS variables declared on `[data-theme]`. Set on `<html>` via the theme toggle. Use these vars in any custom CSS; use DaisyUI semantic classes in Svelte markup.

### Core Palette

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--primary` | `#C2622A` | `#C2622A` | CTA buttons, active tabs, links, active nav |
| `--primary-h` | `#A8501F` | `#A8501F` | Hover state for primary elements |
| `--primary-dim` | `rgba(194,98,42,0.10)` | `rgba(194,98,42,0.15)` | Tinted backgrounds, focus rings |
| `--bg` | `#F5F0E8` | `#1A120B` | Page background |
| `--surface` | `#FAF8F5` | `#221710` | Table headers, input backgrounds, hover rows |
| `--card` | `#FFFFFF` | `#2C1E12` | Cards, modals, navbar, drawer |
| `--border` | `#E5DDD5` | `#3D2B1F` | Card borders, input borders, dividers |
| `--border-soft` | `#EDE8E2` | `#342015` | Table row separators |
| `--text` | `#3D2B1F` | `#E8C9A8` | Primary body text, headings |
| `--text-muted` | `#9C7E63` | `#9C7E63` | Labels, secondary text, table headers |
| `--text-faint` | `#C4AC98` | `#6B5744` | Captions, placeholders, meta |

### Semantic Colours

| Token | Light bg | Light text | Dark bg | Dark text | Usage |
|---|---|---|---|---|---|
| success | `#D1FADF` | `#1A5C3A` | `#0A2918` | `#4ade80` | Aktif badge, saved toast |
| error | `#FEE2E2` | `#991B1B` | `#2A0A0A` | `#f87171` | Batalkan, destructive actions |
| warning | `#FEF3C7` | `#92400E` | `#2A1A02` | `#fbbf24` | ⏳ Menunggu badges |
| info | `#DBEAFE` | `#1E40AF` | `#1e3a5f` | `#60a5fa` | Informational states |

### Drawer Tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--drawer-bg` | `#2C1E12` | `#0F0A05` | Drawer background (always dark) |
| `--drawer-text` | `#E8C9A8` | `#E8C9A8` | Drawer primary text |
| `--drawer-muted` | `#9C7E63` | `#6B5744` | Drawer secondary text, section labels |

### Applying the Theme

```css
/* tailwind.config.js — extend with custom vars */
:root { /* light */ }
[data-theme="dark"] { /* dark overrides */ }
```

```svelte
<!-- Toggle: flip data-theme on <html> -->
<script>
    let dark = $state(false)
    $effect(() => {
        document.documentElement.setAttribute('data-theme', dark ? 'bersih-dark' : 'bersih')
    })
</script>
```

DaisyUI theme name: `bersih` (light) / `bersih-dark` (dark). Configure in `tailwind.config.js` under `daisyui.themes`.

---

## 2. Typography Scale

Font family: system stack — `'Inter', 'Segoe UI', system-ui, sans-serif` (no custom font loaded).

| Role | Tailwind classes | Size | Weight | Usage |
|---|---|---|---|---|
| Page title | `text-xl font-bold tracking-tight` | 20px | 700 | `<h1>` on every page |
| Section heading | `text-base font-semibold` | 16px | 600 | Modal titles, card headings |
| Table header | `text-[10px] font-semibold uppercase tracking-[0.06em]` | 10px | 600 | `<th>` in all tables |
| Body | `text-[13px]` | 13px | 400 | Default paragraph, table cells |
| Label | `text-[11px] font-semibold uppercase tracking-[0.07em]` | 11px | 600 | Form field labels |
| Caption / meta | `text-[11px]` | 11px | 400 | Timestamps, NIP, version string |
| Emphasis number | `text-xl font-bold tracking-tight` | 20–22px | 700 | Stat cards (totals, counts) |
| Nav logo | `text-[14px] font-bold tracking-tight` | 14px | 700 | Navbar logo "Studio Bersih" |

Colour pairings:
- Primary text → `text-[var(--text)]`
- Muted text → `text-[var(--text-muted)]`
- Faint/caption → `text-[var(--text-faint)]`
- Primary accent → `text-[var(--primary)]`

---

## 3. Spacing & Radius

Only these values are in use. Do not introduce others without updating this table.

### Border Radius

| Token | Value | Used on |
|---|---|---|
| `rounded-lg` | 8px | Cards, modals, table wrappers |
| `rounded-[10px]` | 10px | Stat cards, main content cards |
| `rounded-[12px]` | 12px | Dropdowns, drawer footer items |
| `rounded-[14px]` | 14px | Payment modals (high-stakes) |
| `rounded-md` | 6px | Buttons (sm), inputs, selects |
| `rounded-[7px]` | 7px | Standard buttons, nav items, tabs |
| `rounded-[8px]` | 8px | Quick action buttons, feature cards |
| `rounded-full` | 9999px | Badges, avatar, toggle track |

### Gap / Padding

| Context | Value |
|---|---|
| Page horizontal padding | `px-5` (20px) |
| Page top padding | `pt-[calc(56px+12px)]` — clears navbar |
| Card padding | `p-[18px]` |
| Stat card padding | `px-[18px] py-[15px]` |
| Navbar height | `56px` (fixed) |
| Navbar horizontal padding | `px-3` (12px) |
| Navbar item gap | `gap-[6px]` |
| Drawer width | `252px` |
| Section gap (within card) | `gap-[10px]` or `gap-3` |

---

## 4. Icon System

**Source:** [lucide.dev](https://lucide.dev) — search → copy SVG → save to `/static/icons/`.

**Naming:** `kebab-case.svg` — match the Lucide icon name exactly (e.g., `shopping-bag.svg`, `clipboard.svg`, `bar-chart.svg`).

**Usage in Svelte:**

```svelte
<!-- Inline SVG (recommended for colour inheritance) -->
<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- paste Lucide path content here -->
</svg>

<!-- Or as <img> when colour control is not needed -->
<img src="/icons/shopping-bag.svg" alt="" class="w-4 h-4" />
```

**Standard sizes:**

| Context | Class | px |
|---|---|---|
| Inline with text | `w-3.5 h-3.5` | 14px |
| Button icon | `w-[13px] h-[13px]` | 13px |
| Nav / drawer item | `w-[15px] h-[15px]` | 15px |
| Feature card | `w-5 h-5` | 20px |
| Empty state icon | `w-6 h-6` | 24px |

**Current icon inventory:**

| File | Lucide name | Used in |
|---|---|---|
| `menu.svg` | `menu` | Navbar hamburger |
| `x.svg` | `x` | Drawer close, tab close |
| `shopping-bag.svg` | `shopping-bag` | Retail quick action, Retail tab |
| `clipboard.svg` | `clipboard` | Order quick action, Pesanan |
| `grid.svg` | `grid-2x2` | Dashboard nav item |
| `clock.svg` | `clock` | Riwayat Transaksi |
| `bar-chart.svg` | `bar-chart-2` | Kasir Harian |
| `package.svg` | `package` | Master Item |
| `sliders.svg` | `sliders-horizontal` | Penyesuaian Stok |
| `settings.svg` | `settings` | Pengaturan |
| `log-out.svg` | `log-out` | Avatar dropdown — Keluar |
| `sun.svg` | `sun` | Theme toggle (light indicator) |
| `moon.svg` | `moon` | Theme toggle (dark indicator) |
| `plus.svg` | `plus` | New tab button |
| `chevron-left.svg` | `chevron-left` | Pagination prev |
| `chevron-right.svg` | `chevron-right` | Pagination next |
| `search.svg` | `search` | Search input adornment |
| `tag.svg` | `tag` | Kupon / promo |
| `user.svg` | `user` | Member, avatar fallback |
| `wallet.svg` | `wallet` | Payment methods |
| `printer.svg` | `printer` | Print receipt |
| `trash-2.svg` | `trash-2` | Delete action |
| `pencil.svg` | `pencil` | Edit action |
| `eye.svg` | `eye` | Lihat (view) action |

---

## 5. Theme System

Two themes: `bersih` (light, default) and `bersih-dark`. Switched by setting `data-theme` on `<html>`.

**Toggle implementation (Svelte 5):**

```svelte
<script lang="ts">
    let dark = $state(false)

    $effect(() => {
        document.documentElement.setAttribute('data-theme', dark ? 'bersih-dark' : 'bersih')
    })
</script>

<!-- Sun icon -->
<svg ...><!-- sun.svg --></svg>

<div
    class="w-[38px] h-[20px] rounded-full border border-[var(--border)] relative cursor-pointer transition-colors duration-250"
    style:background={dark ? 'var(--primary)' : 'var(--border)'}
    onclick={() => dark = !dark}
>
    <div
        class="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-220"
        style:transform={dark ? 'translateX(18px)' : 'translateX(0)'}
    ></div>
</div>

<!-- Moon icon -->
<svg ...><!-- moon.svg --></svg>
```

**Tailwind config (daisyui themes):**

```js
// tailwind.config.js
daisyui: {
    themes: [
        {
            bersih: {
                "primary":          "#C2622A",
                "primary-content":  "#ffffff",
                "secondary":        "#9C7E63",
                "accent":           "#E8A87C",
                "neutral":          "#3D2B1F",
                "base-100":         "#FFFFFF",
                "base-200":         "#FAF8F5",
                "base-300":         "#F5F0E8",
                "base-content":     "#3D2B1F",
                "success":          "#3D7A5C",
                "warning":          "#D4900A",
                "error":            "#B94040",
                "info":             "#3b82f6",
            }
        },
        {
            "bersih-dark": {
                "primary":          "#C2622A",
                "primary-content":  "#ffffff",
                "secondary":        "#9C7E63",
                "accent":           "#E8A87C",
                "neutral":          "#E8C9A8",
                "base-100":         "#2C1E12",
                "base-200":         "#221710",
                "base-300":         "#1A120B",
                "base-content":     "#E8C9A8",
                "success":          "#4ade80",
                "warning":          "#fbbf24",
                "error":            "#f87171",
                "info":             "#60a5fa",
            }
        }
    ]
}
```

---

## 6. Components

### Buttons

| Variant | Class string | When to use |
|---|---|---|
| Primary | `btn btn-primary btn-sm` | Main CTA: Checkout, Simpan, Setujui |
| Ghost | `btn btn-ghost btn-sm` | Cancel, secondary in pairs |
| Outline | `btn btn-outline btn-primary btn-sm` | Edit, secondary action with emphasis |
| Error / destructive | `btn btn-error btn-sm` | Batalkan, Hapus — irreversible actions |
| Warning | `btn btn-warning btn-sm` | Soft-destructive: Tolak, flag states |
| Success | `btn btn-success btn-sm` | Approve: Setujui Pembatalan |
| Icon-only | `btn btn-ghost btn-sm btn-square` | Icon buttons in toolbars |

Full-width (inside modal footer): add `w-full` to the class string.

Pairing rule: primary + ghost when one action is dominant. Never two primary buttons side by side.

```svelte
<!-- canonical table action row -->
<button class="btn btn-primary btn-sm">Checkout</button>
<button class="btn btn-ghost btn-sm">Edit</button>
```

---

### Badges

```svelte
<!-- Aktif (success) -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-success/15 text-success">
    Aktif
</span>

<!-- ⏳ Menunggu (any awaiting state) -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-warning/15 text-warning">
    ⏳ Menunggu Batal
</span>

<!-- Error / cancelled -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-error/15 text-error">
    Dibatalkan
</span>

<!-- Neutral / closed -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-base-200 text-[var(--text-muted)]">
    Selesai
</span>

<!-- Info / blue -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-info/15 text-info">
    Open
</span>
```

---

### Inputs & Selects

```svelte
<!-- Text input — standard -->
<input
    type="text"
    class="input input-bordered input-sm w-72"
    placeholder="Cari..."
    bind:value={search}
/>

<!-- Number input — modal field -->
<input
    type="number"
    class="input input-bordered input-sm w-full"
    placeholder="0"
    bind:value={amount}
/>

<!-- Select — per-page or dropdown -->
<select class="select select-bordered select-sm" bind:value={perPage}>
    <option value={10}>10 / halaman</option>
    <option value={25}>25 / halaman</option>
    <option value={50}>50 / halaman</option>
    <option value={100}>100 / halaman</option>
</select>

<!-- Textarea — notes field -->
<textarea
    class="textarea textarea-bordered textarea-sm w-full"
    placeholder="Keterangan..."
    rows="3"
    bind:value={notes}
></textarea>
```

Focus ring: DaisyUI applies `ring-primary` on focus automatically when using `input-bordered`.

---

### Table + Pagination

**Copy verbatim — canonical pattern for every list page.**

```svelte
<script lang="ts">
    let search = $state("")
    let perPage: 10 | 25 | 50 | 100 = $state(25)
    let currentPage = $state(1)

    let filtered = $derived(items.filter(item =>
        Object.values(item).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
    ))
    let totalPages = $derived(Math.max(1, Math.ceil(filtered.length / perPage)))
    let paginated = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage))

    $effect(() => {
        search; perPage;
        currentPage = 1
    })

    let pageButtons = $derived((() => {
        let start = Math.max(1, currentPage - 2)
        let end = Math.min(totalPages, start + 4)
        if (end - start < 4) start = Math.max(1, end - 4)
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    })())
</script>

<!-- Toolbar -->
<div class="flex items-center justify-between gap-4 mb-4">
    <input type="text" class="input input-bordered input-sm w-72" placeholder="Cari..." bind:value={search} />
    <select class="select select-bordered select-sm" bind:value={perPage}>
        <option value={10}>10 / halaman</option>
        <option value={25}>25 / halaman</option>
        <option value={50}>50 / halaman</option>
        <option value={100}>100 / halaman</option>
    </select>
</div>

<!-- Table -->
<div class="overflow-x-auto">
    <table class="table table-sm w-full">
        <thead>
            <tr>
                <th>Col A</th>
                <th>Col B</th>
            </tr>
        </thead>
        <tbody>
            {#each paginated as row}
                <tr class="hover">
                    <td>{row.colA}</td>
                    <td>{row.colB}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<!-- Pagination -->
{#if totalPages > 1}
    <div class="flex justify-center items-center gap-1 mt-4">
        <button class="btn btn-sm btn-ghost" disabled={currentPage === 1} onclick={() => currentPage--}>‹</button>
        {#each pageButtons as p}
            <button
                class="btn btn-sm {p === currentPage ? 'btn-primary' : 'btn-ghost'}"
                onclick={() => currentPage = p}
            >{p}</button>
        {/each}
        <button class="btn btn-sm btn-ghost" disabled={currentPage === totalPages} onclick={() => currentPage++}>›</button>
    </div>
{/if}
```

---

### Modal

Modals are inline in `+page.svelte` — no separate component file unless shared across pages.

```svelte
<script lang="ts">
    let modalOpen = $state(false)
</script>

<!-- Trigger -->
<button class="btn btn-primary btn-sm" onclick={() => modalOpen = true}>Buka</button>

<!-- Modal -->
{#if modalOpen}
    <!-- backdrop -->
    <div
        class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onclick={() => modalOpen = false}
    >
        <!-- panel — stop propagation so clicking inside doesn't close -->
        <div
            class="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md p-6"
            onclick={e => e.stopPropagation()}
        >
            <h2 class="text-base font-bold mb-1">Judul Modal</h2>
            <p class="text-sm text-[var(--text-muted)] mb-4">Subjudul atau konteks</p>

            <!-- fields -->
            <div class="flex flex-col gap-3 mb-5">
                <label class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Field</label>
                <input class="input input-bordered input-sm w-full" placeholder="..." />
            </div>

            <!-- footer -->
            <div class="flex justify-end gap-2">
                <button class="btn btn-ghost btn-sm" onclick={() => modalOpen = false}>Batal</button>
                <button class="btn btn-primary btn-sm" onclick={handleSubmit}>Simpan</button>
            </div>
        </div>
    </div>
{/if}
```

`Esc` to close: add `onkeydown` listener in `$effect` or use `svelte-body`.

High-stakes modals (payment, deletion): `backdrop-blur-sm` is mandatory. Low-stakes confirmations: `backdrop-blur-none` is acceptable.

---

### Toast

Uses `svelte-sonner`. Import `Toaster` once in `+layout.svelte`. Call `toast.*` anywhere.

```svelte
<!-- +layout.svelte -->
<script>
    import { Toaster } from 'svelte-sonner'
</script>
<Toaster richColors position="top-right" />
```

```typescript
// anywhere in .svelte or .ts
import { toast } from 'svelte-sonner'

toast.success("Transaksi berhasil disimpan")
toast.error("Stok tidak mencukupi")
toast.info("Permintaan pembatalan dikirim")
toast.warning("Stok hampir habis")
```

`richColors` is always on — it applies the success/error/warning palette automatically. Do not write custom toast styles.

---

## 7. Layout Patterns

### Navbar + Inline Tab Strip

Single `56px` fixed bar. Reading left → right:

```
[☰] [Logo] [|] [Retail] [Order] [── tab strip (flex:1, scrollable) ──] [＋] [Greeting / outlet·version] [|] [☀/🌙] [RK]
```

```svelte
<nav class="fixed top-0 left-0 right-0 z-[200] h-[56px] bg-base-100 border-b border-[var(--border)] flex items-center gap-[6px] px-3 shadow-sm">

    <!-- hamburger -->
    <button class="btn btn-ghost btn-sm btn-square" onclick={openDrawer}>
        <svg class="w-4 h-4"><!-- menu.svg --></svg>
    </button>

    <!-- logo -->
    <span class="text-[14px] font-bold tracking-tight shrink-0">
        Studio <span class="text-[var(--primary)]">Bersih</span>
    </span>
    <div class="w-px h-5 bg-[var(--border)] shrink-0"></div>

    <!-- quick actions -->
    <button class="btn btn-primary btn-sm gap-1.5 shrink-0" onclick={() => openTab('retail')}>
        <svg class="w-[13px] h-[13px]"><!-- shopping-bag.svg --></svg>
        Retail
    </button>
    <button class="btn btn-outline btn-primary btn-sm gap-1.5 shrink-0" onclick={() => openTab('order')}>
        <svg class="w-[13px] h-[13px]"><!-- clipboard.svg --></svg>
        Order
    </button>

    <!-- tab strip -->
    <div class="flex-1 min-w-0 flex items-center gap-[3px] overflow-x-auto scrollbar-none px-1">
        {#each tabs as tab}
            <div
                class="flex items-center gap-[6px] px-[10px] h-[34px] rounded-[8px] text-[12px] font-medium shrink-0 cursor-pointer transition-all border relative
                    {tab.id === activeTab
                        ? 'bg-[var(--tab-active-bg)] text-[var(--primary)] border-[rgba(194,98,42,0.25)] font-semibold after:absolute after:bottom-[-1px] after:left-2 after:right-2 after:h-[2px] after:bg-[var(--primary)] after:rounded-full'
                        : 'text-[var(--text-muted)] border-transparent hover:bg-base-200 hover:text-[var(--text)]'}"
                onclick={() => activateTab(tab.id)}
            >
                <svg class="w-[13px] h-[13px] shrink-0"><!-- {tab.icon}.svg --></svg>
                <span>{tab.label}</span>
                <span
                    class="w-[15px] h-[15px] rounded-sm flex items-center justify-center text-[var(--text-faint)] hover:bg-[var(--error-bg)] hover:text-[var(--error-text)] ml-[2px]"
                    onclick|stopPropagation={() => closeTab(tab.id)}
                >
                    <svg class="w-[9px] h-[9px]"><!-- x.svg --></svg>
                </span>
            </div>
        {/each}

        <!-- new tab button -->
        <button
            class="w-[26px] h-[26px] rounded-[6px] border border-dashed border-[var(--border)] flex items-center justify-center text-[var(--text-faint)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary-dim)] shrink-0"
            onclick={toggleTabPicker}
        >
            <svg class="w-[12px] h-[12px]"><!-- plus.svg --></svg>
        </button>
    </div>

    <!-- greeting -->
    <div class="flex flex-col justify-center items-end shrink-0">
        <span class="text-[12px] font-semibold text-[var(--text)]">Selamat pagi, {name} 👋</span>
        <span class="text-[10px] font-mono text-[var(--text-faint)]">{outletName} · {version}</span>
    </div>
    <div class="w-px h-5 bg-[var(--border)] shrink-0"></div>

    <!-- theme toggle (see §5) -->

    <!-- avatar (see §7 Avatar Dropdown) -->
</nav>
```

Tab state lives in the layout component — not in a store. Tabs are ephemeral: lost on page refresh.

---

### Drawer

Slides in from left. `252px` wide. Always dark background regardless of theme.

```svelte
<script lang="ts">
    let drawerOpen = $state(false)
</script>

<!-- overlay -->
{#if drawerOpen}
    <div
        class="fixed inset-0 z-[300] bg-black/45 backdrop-blur-[2px] transition-opacity"
        onclick={() => drawerOpen = false}
    ></div>
{/if}

<!-- drawer panel -->
<aside
    class="fixed top-0 left-0 bottom-0 z-[400] w-[252px] flex flex-col shadow-2xl transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0,0.12,1)]"
    style:background="var(--drawer-bg)"
    style:transform={drawerOpen ? 'translateX(0)' : 'translateX(-100%)'}
>
    <!-- header -->
    <div class="h-[56px] flex items-center justify-between px-[14px] border-b border-white/[0.06] shrink-0">
        <span class="text-[14px] font-bold" style:color="var(--drawer-text)">
            Studio <span style:color="var(--primary)">Bersih</span>
        </span>
        <button
            class="w-[29px] h-[29px] rounded-[6px] border border-white/10 flex items-center justify-center transition-colors hover:bg-white/[0.07]"
            style:color="var(--drawer-muted)"
            onclick={() => drawerOpen = false}
        >
            <svg class="w-[12px] h-[12px]"><!-- x.svg --></svg>
        </button>
    </div>

    <!-- nav items -->
    <nav class="flex-1 px-2 py-[10px] flex flex-col gap-[2px] overflow-y-auto">

        <!-- section label -->
        <span class="text-[10px] font-semibold uppercase tracking-[0.1em] px-[10px] py-[10px] pb-[5px]"
              style:color="var(--drawer-muted)">Outlet</span>

        <!-- nav item -->
        <a class="flex items-center gap-[10px] px-[10px] py-[9px] rounded-[7px] text-[13px] font-medium transition-all cursor-pointer
                  {active ? 'bg-[var(--primary)] text-white' : 'hover:bg-white/[0.07]'}"
           style:color={active ? undefined : 'var(--drawer-muted)'}
           onclick={closeDrawer}
        >
            <svg class="w-[14px] h-[14px] shrink-0"><!-- icon.svg --></svg>
            Label
        </a>
    </nav>

    <!-- user footer -->
    <div class="px-2 py-[10px] border-t border-white/[0.06] shrink-0">
        <div class="flex items-center gap-[10px] px-[10px] py-[9px]">
            <div class="w-[27px] h-[27px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                 style:background="var(--primary)">{initials}</div>
            <div>
                <div class="text-[12px] font-semibold" style:color="var(--drawer-text)">{name}</div>
                <div class="text-[10px]" style:color="var(--drawer-muted)">{role} · {outlet}</div>
            </div>
        </div>
    </div>
</aside>
```

Close on `Esc`: `document.addEventListener('keydown', e => { if (e.key === 'Escape') drawerOpen = false })` in `$effect`.

---

### Avatar Dropdown

```svelte
<script lang="ts">
    let ddOpen = $state(false)
</script>

<div class="relative">
    <!-- close on outside click: bind a click listener on document in $effect, or wrap this div in an overlay -->
    <div
        class="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[11px] font-bold text-white cursor-pointer border-2 border-transparent transition-all hover:border-[var(--primary)] hover:shadow-[0_0_0_3px_var(--primary-dim)]"
        style:background="var(--primary)"
        onclick={() => ddOpen = !ddOpen}
    >
        {initials}
    </div>

    {#if ddOpen}
        <div class="absolute top-[calc(100%+10px)] right-0 bg-base-100 border border-[var(--border)] rounded-[12px] shadow-xl min-w-[210px] overflow-hidden z-[999]">
            <div class="px-4 py-[13px] border-b border-[var(--border)]">
                <div class="text-[13px] font-bold text-[var(--text)]">{name}</div>
                <div class="text-[11px] text-[var(--text-muted)] mt-px">{role}</div>
                <div class="text-[10px] font-mono text-[var(--text-faint)] mt-[2px]">NIP: {nip} · {outlet}</div>
            </div>
            <button class="w-full flex items-center gap-[10px] px-4 py-[10px] text-[13px] font-medium text-[var(--text-muted)] hover:bg-base-200 hover:text-[var(--text)] transition-colors">
                <svg class="w-[14px] h-[14px]"><!-- settings.svg --></svg>
                Pengaturan
            </button>
            <div class="h-px bg-[var(--border)] my-1"></div>
            <button class="w-full flex items-center gap-[10px] px-4 py-[10px] text-[13px] font-medium text-[var(--error-text)] hover:bg-[var(--error-bg)] transition-colors" onclick={logout}>
                <svg class="w-[14px] h-[14px]"><!-- log-out.svg --></svg>
                Keluar
            </button>
        </div>
    {/if}
</div>
```

---

### Empty State

Shown when no tabs are open. Full viewport height minus navbar.

```svelte
<div class="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-5 py-10 text-center">

    <!-- icon box -->
    <div class="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center mb-[18px] border"
         style:background="var(--primary-dim)" style:border-color="rgba(194,98,42,0.2)" style:color="var(--primary)">
        <svg class="w-6 h-6"><!-- grid.svg --></svg>
    </div>

    <h2 class="text-[20px] font-bold tracking-tight text-[var(--text)] mb-[7px]">Mau mulai dari mana?</h2>
    <p class="text-[14px] text-[var(--text-muted)] max-w-[380px] leading-relaxed mb-7">
        Pilih fitur di bawah untuk membukanya sebagai tab. Kamu bisa membuka beberapa fitur sekaligus dan berpindah bebas.
    </p>

    <!-- feature grid -->
    <div class="grid grid-cols-3 gap-[9px] max-w-[540px] w-full">
        {#each features as f}
            <button
                class="bg-base-100 border border-[var(--border)] rounded-[12px] p-[15px] flex flex-col items-center gap-[7px] text-center cursor-pointer transition-all hover:border-[var(--primary)] hover:shadow-[0_4px_16px_rgba(194,98,42,0.12)] hover:-translate-y-[2px]"
                onclick={() => openTab(f.id)}
            >
                <svg class="w-5 h-5 text-[var(--primary)]"><!-- {f.icon}.svg --></svg>
                <span class="text-[12px] font-semibold text-[var(--text)]">{f.label}</span>
                <span class="text-[10px] text-[var(--text-muted)] leading-snug">{f.desc}</span>
            </button>
        {/each}
    </div>

    <!-- hint -->
    <div class="mt-[22px] text-[11px] text-[var(--text-faint)] flex items-center gap-[6px] flex-wrap justify-center">
        <kbd class="bg-base-200 border border-[var(--border)] border-b-2 rounded px-[6px] py-[1px] text-[10px] font-mono text-[var(--text-muted)]">Retail</kbd>
        atau
        <kbd class="bg-base-200 border border-[var(--border)] border-b-2 rounded px-[6px] py-[1px] text-[10px] font-mono text-[var(--text-muted)]">Order</kbd>
        di navbar untuk mulai cepat
    </div>
</div>
```

Feature list for the grid:

| id | label | desc | icon |
|---|---|---|---|
| `retail` | Retail | Transaksi langsung & kasir | `shopping-bag` |
| `order` | Order | Buat pesanan dengan DP | `clipboard` |
| `pesanan` | Pesanan | Antrean pesanan aktif | `clipboard` |
| `riwayat` | Riwayat | Semua transaksi selesai | `clock` |
| `kasir` | Kasir Harian | Laporan shift & setoran | `bar-chart-2` |
| `stok` | Master Item | Katalog & stok barang | `package` |

---

### Page Wrapper

Every route inside `/outlet/` gets this wrapper to clear the fixed navbar.

```svelte
<div class="pt-[calc(56px+12px)] px-5 pb-8 max-w-[960px] mx-auto">
    <!-- page content -->
</div>
```

Page-in animation (optional, apply to outermost wrapper):

```svelte
<div class="... animate-[fadeSlideIn_0.25s_ease]">
```

```css
/* in app.css or <style> */
@keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
```

---

## 8. Keyboard Shortcuts

| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl+Enter` | Confirm checkout | PaymentModal open |
| `Esc` | Close modal / close drawer | Any modal or drawer open |
| `↑` / `↓` | Navigate cart quantities or search results | Retail page |
| `Esc` | Close avatar dropdown or tab picker | Dropdowns open |

After any modal close or item add: return focus to `ProductSearchField` (Retail page only).
