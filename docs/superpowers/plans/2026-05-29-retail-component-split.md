# Retail Component Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `+page.svelte` retail page into `CartSection.svelte` (right pane) and `LeftPanel.svelte` (left pane), leaving `+page.svelte` as a thin layout shell.

**Architecture:** `cartSelectedIndex` and `payModalOpen` are shared state that live in `+page.svelte` and flow down via `$bindable` props to `LeftPanel` (which modifies them via keyboard) and as read-only to `CartSection` (which only renders the highlight). Each component derives pricing values independently from the global cart store — no prop drilling for derived values.

**Tech Stack:** SvelteKit 2, Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`), TypeScript, TailwindCSS + DaisyUI

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/library/components/outlet/retail/CartSection.svelte` | Cart rows display with qty controls and remove buttons |
| Create | `src/library/components/outlet/retail/LeftPanel.svelte` | Search field, member lookup, pricing panel with pay button |
| Modify | `src/routes/outlet/retail/+page.svelte` | Thin layout shell: shared state, global keyboard shortcut, layout |
| Unchanged | `src/library/components/outlet/retail/PaymentModal.svelte` | — |

---

### Task 1: Create CartSection.svelte

**Files:**
- Create: `src/library/components/outlet/retail/CartSection.svelte`

- [ ] **Step 1: Create the file with this exact content**

```svelte
<script lang="ts">
    import { cart, setQty, removeItem, clearCart } from '$library/stores/cart'
    import { rupiahFormatter } from '$library/utils/formatter'

    interface Props {
        cartSelectedIndex: number
    }

    let { cartSelectedIndex }: Props = $props()

    function rowNumber(index: number): string {
        return `#${index + 1}`
    }
</script>

<div class="w-[65%] flex flex-col gap-2 min-w-0">
    <div class="bg-base-100 border border-[var(--border)] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
        <div class="flex items-center justify-between mb-2.5 shrink-0">
            <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)]">Keranjang</span>
                {#if $cart.items.length > 0}
                    <span class="text-[10px] bg-[var(--primary-dim)] text-primary rounded-full px-2 py-0.5 font-bold">
                        {$cart.items.length} baris · {$cart.items.reduce((s, i) => s + i.qty, 0)} pcs
                    </span>
                {/if}
            </div>
            {#if $cart.items.length > 0}
                <button onclick={clearCart} class="text-[10px] text-[var(--text-muted)] hover:text-error transition-colors">Kosongkan</button>
            {/if}
        </div>

        <div class="grid gap-2 px-2.5 pb-1.5 border-b border-[var(--border)] shrink-0" style="grid-template-columns: 1fr 96px 88px 22px;">
            <span class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)]">Produk</span>
            <span class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] text-center">Qty</span>
            <span class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] text-right">Subtotal</span>
            <span></span>
        </div>

        <div class="flex-1 overflow-y-auto pt-1 pl-5" style="scrollbar-width: thin; scrollbar-color: var(--border) transparent;">
            {#if $cart.items.length === 0}
                <div class="flex flex-col items-center justify-center h-full text-[var(--text-faint)] gap-2">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                    <span class="text-[12px]">Keranjang kosong</span>
                    <span class="text-[11px]">Ketik SKU atau nama produk untuk mulai</span>
                </div>
            {:else}
                {#each $cart.items as item, i}
                    {@const isPrevSame = i > 0 && $cart.items[i - 1].id === item.id && item.isFree}
                    {@const isSelected = i === cartSelectedIndex}
                    {#if isPrevSame}
                        <div class="mx-2.5 my-0" style="height:1px; background: repeating-linear-gradient(90deg, var(--border) 0, var(--border) 4px, transparent 4px, transparent 8px);"></div>
                    {:else if i > 0}
                        <div class="h-1"></div>
                    {/if}
                    <div
                        class="relative grid gap-2 items-center px-2.5 py-2 rounded-lg transition-colors
                            {isSelected ? 'outline outline-2 outline-primary/40 bg-[var(--primary-dim)]' : item.isFree ? 'bg-success/[0.04] hover:bg-success/[0.08]' : 'hover:bg-base-200'}"
                        style="grid-template-columns: 1fr 96px 88px 22px;"
                    >
                        <span class="absolute -left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold font-mono {item.isFree ? 'text-success/40' : 'text-[var(--text-faint)]'}">
                            {rowNumber(i)}
                        </span>

                        <div>
                            <div class="text-[13px] font-semibold truncate {item.isFree ? 'text-success' : 'text-[var(--text)]'}">{item.name}</div>
                            <div class="text-[10px] font-mono {item.isFree ? 'text-success/40' : 'text-[var(--text-faint)]'} mt-0.5">{item.sku}</div>
                            {#if item.isFree}
                                <div class="mt-1">
                                    <span class="text-[9px] font-bold text-success bg-success/[0.12] rounded px-1 py-0.5">GRATIS</span>
                                </div>
                            {/if}
                            <div class="flex items-center gap-1.5 mt-1 text-[10px] text-[var(--text-muted)]">
                                <span>Stok:</span>
                                <span class="font-semibold {item.stock <= 5 ? 'text-warning' : 'text-[var(--text-muted)]'}">{item.stock} pcs</span>
                                {#if item.stock <= 5}
                                    <span class="text-[9px] text-warning bg-warning/10 rounded px-1">⚠ hampir habis</span>
                                {/if}
                                {#if item.preAdjDelta !== 0}
                                    <span class="text-[9px] rounded px-1 {item.preAdjDelta > 0 ? 'text-success bg-success/10' : 'text-error bg-error/10'}">
                                        pre-adj {item.preAdjDelta > 0 ? '+' : ''}{item.preAdjDelta}
                                    </span>
                                {/if}
                            </div>
                        </div>

                        <div class="flex items-center gap-1 justify-center">
                            <button
                                onclick={() => setQty(item.id, item.isFree, item.qty - 1)}
                                class="w-5 h-5 bg-base-300 border {item.isFree ? 'border-success/20 hover:border-success hover:text-success' : 'border-[var(--border)] hover:border-primary hover:text-primary'} rounded text-[var(--text-muted)] flex items-center justify-center text-sm font-semibold leading-none shrink-0"
                            >−</button>
                            <span class="text-[13px] font-bold min-w-6 text-center {item.isFree ? 'text-success' : 'text-[var(--text)]'}">{item.qty}</span>
                            <button
                                onclick={() => setQty(item.id, item.isFree, item.qty + 1)}
                                class="w-5 h-5 bg-base-300 border {item.isFree ? 'border-success/20 hover:border-success hover:text-success' : 'border-[var(--border)] hover:border-primary hover:text-primary'} rounded text-[var(--text-muted)] flex items-center justify-center text-sm font-semibold leading-none shrink-0"
                            >+</button>
                        </div>

                        <div class="text-right {item.isFree ? 'text-[11px] font-bold text-success' : 'text-[13px] font-semibold text-[var(--text)]'}">
                            {item.isFree ? 'GRATIS' : rupiahFormatter.format(item.price * item.qty)}
                        </div>

                        <button
                            onclick={() => removeItem(item.id, item.isFree)}
                            class="w-5 h-5 rounded flex items-center justify-center text-[var(--text-faint)] hover:bg-error/15 hover:text-error transition-colors"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/richie/Documents/Sandbox/Retail && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5
```

Expected: `0 errors` (warnings about unused vars are fine at this stage since +page.svelte still has the old code).

- [ ] **Step 3: Commit**

```bash
git add src/library/components/outlet/retail/CartSection.svelte
git commit -m "feat(retail): extract CartSection component from page"
```

---

### Task 2: Create LeftPanel.svelte

**Files:**
- Create: `src/library/components/outlet/retail/LeftPanel.svelte`

- [ ] **Step 1: Create the file with this exact content**

```svelte
<script lang="ts">
    import { tick } from 'svelte'
    import { cart, addItem, setMember, clearMember } from '$library/stores/cart'
    import { searchItems, getItemBySku, type MockItem } from '$library/mock/items'
    import { searchMembers, getMemberById, getMemberByPhone, type MockMember } from '$library/mock/members'
    import { rupiahFormatter } from '$library/utils/formatter'

    interface Props {
        cartSelectedIndex?: number
        payModalOpen?:      boolean
    }

    let {
        cartSelectedIndex = $bindable(-1),
        payModalOpen      = $bindable(false),
    }: Props = $props()

    // ── Search state ─────────────────────────────────────────────────────────
    let searchInput: HTMLInputElement
    let searchValue    = $state('')
    let searchResults  = $state<MockItem[]>([])
    let highlightIndex = $state(0)
    let highlightFree  = $state(false)
    let showDropdown   = $state(false)
    let qtyItem        = $state<MockItem | null>(null)
    let qtyFree        = $state(false)
    let qtyValue       = $state(1)
    let qtyInput: HTMLInputElement

    // ── Member state ─────────────────────────────────────────────────────────
    let memberValue        = $state('')
    let memberResults      = $state<MockMember[]>([])
    let memberHighlight    = $state(0)
    let showMemberDropdown = $state(false)
    let memberSelected     = $state(false)

    // ── Pricing accordion ─────────────────────────────────────────────────────
    let biayaOpen = $state(true)

    // ── Derived pricing ───────────────────────────────────────────────────────
    let subtotal        = $derived($cart.items.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.qty, 0))
    let discount        = $derived(subtotal * $cart.percentDiscount / 100 + $cart.fixedDiscount)
    let additionalTotal = $derived($cart.additionalCosts.packaging + $cart.additionalCosts.transport + $cart.additionalCosts.modification)
    let total           = $derived(Math.max(0, subtotal - discount - $cart.additionalCut.amount + additionalTotal))

    let alreadyQty = $derived(
        qtyItem
            ? ($cart.items.find(i => i.id === qtyItem!.id && i.isFree === qtyFree)?.qty ?? 0)
            : 0
    )

    // ── Reset cart selection when items change ────────────────────────────────
    $effect(() => {
        void $cart.items.length
        cartSelectedIndex = -1
    })

    // ── Search debounce ───────────────────────────────────────────────────────
    const SKU_REGEX = /^[A-Z0-9]+-[A-Z0-9]+$/i

    $effect(() => {
        const val = searchValue.trim()
        if (!val) {
            searchResults = []
            showDropdown  = false
            qtyItem       = null
            return
        }
        if (qtyItem !== null) {
            return
        }
        if (SKU_REGEX.test(val)) {
            const found = getItemBySku(val)
            if (found) {
                openQtyPrompt(found, false)
            }
            return
        }
        const timer = setTimeout(() => {
            searchResults  = searchItems(val)
            highlightIndex = 0
            highlightFree  = false
            showDropdown   = searchResults.length > 0
        }, 300)
        return () => clearTimeout(timer)
    })

    // ── Member debounce ───────────────────────────────────────────────────────
    const ID_REGEX    = /^MBR-/i
    const PHONE_REGEX = /^\d{8,}$/

    $effect(() => {
        const val = memberValue.trim()
        if (!val || memberSelected) {
            return
        }
        if (ID_REGEX.test(val)) {
            const found = getMemberById(val)
            if (found) {
                selectMember(found)
            }
            return
        }
        if (PHONE_REGEX.test(val.replace(/\D/g, ''))) {
            const found = getMemberByPhone(val)
            if (found) {
                selectMember(found)
            }
            return
        }
        const timer = setTimeout(() => {
            memberResults      = searchMembers(val)
            memberHighlight    = 0
            showMemberDropdown = true
        }, 300)
        return () => clearTimeout(timer)
    })

    // ── Keyboard handlers ─────────────────────────────────────────────────────
    function onSearchKey(e: KeyboardEvent) {
        if (qtyItem !== null) {
            if (e.key === 'Enter') {
                e.preventDefault()
                confirmQty()
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                closeQtyPrompt()
            }
            return
        }

        if (!showDropdown) {
            if (e.key === 'ArrowDown' && $cart.items.length > 0) {
                e.preventDefault()
                cartSelectedIndex = cartSelectedIndex < $cart.items.length - 1 ? cartSelectedIndex + 1 : 0
                return
            }
            if (e.key === 'ArrowUp' && $cart.items.length > 0) {
                e.preventDefault()
                cartSelectedIndex = cartSelectedIndex > 0 ? cartSelectedIndex - 1 : $cart.items.length - 1
                return
            }
            if (e.key === 'Enter' && cartSelectedIndex >= 0) {
                e.preventDefault()
                const item = $cart.items[cartSelectedIndex]
                if (item) {
                    openQtyPrompt(item, item.isFree)
                }
                return
            }
            if (e.key === 'Escape' && cartSelectedIndex >= 0) {
                e.preventDefault()
                cartSelectedIndex = -1
                return
            }
            return
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            highlightIndex = Math.min(highlightIndex + 1, searchResults.length - 1)
            highlightFree  = false
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            highlightIndex = Math.max(highlightIndex - 1, 0)
            highlightFree  = false
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            highlightFree = !highlightFree
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            const item = searchResults[highlightIndex]
            if (item) {
                openQtyPrompt(item, highlightFree)
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            closeSearch()
        }
    }

    function onMemberKey(e: KeyboardEvent) {
        if (!showMemberDropdown) {
            return
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            memberHighlight = Math.min(memberHighlight + 1, memberResults.length - 1)
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            memberHighlight = Math.max(memberHighlight - 1, 0)
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            const m = memberResults[memberHighlight]
            if (m) {
                selectMember(m)
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            memberValue        = ''
            memberResults      = []
            showMemberDropdown = false
        }
    }

    // ── Search helpers ────────────────────────────────────────────────────────
    function openQtyPrompt(item: MockItem, free: boolean) {
        qtyItem           = item
        qtyFree           = free
        qtyValue          = 1
        showDropdown      = false
        cartSelectedIndex = -1
        tick().then(() => { qtyInput?.focus(); qtyInput?.select() })
    }

    function closeQtyPrompt() {
        qtyItem      = null
        showDropdown = searchResults.length > 0
        tick().then(() => searchInput?.focus())
    }

    function closeSearch() {
        searchValue   = ''
        searchResults = []
        showDropdown  = false
        qtyItem       = null
        tick().then(() => searchInput?.focus())
    }

    function confirmQty() {
        if (!qtyItem) {
            return
        }
        addItem({
            id:          qtyItem.id,
            name:        qtyItem.name,
            sku:         qtyItem.sku,
            price:       qtyFree ? 0 : qtyItem.price,
            qty:         qtyValue,
            isFree:      qtyFree,
            stock:       qtyItem.stock,
            preAdjDelta: qtyItem.preAdjDelta,
        })
        closeSearch()
    }

    // ── Member helpers ────────────────────────────────────────────────────────
    function selectMember(m: MockMember) {
        setMember(m.id, m.name, m.phone, m.isPremium)
        memberSelected     = true
        memberValue        = m.name
        memberResults      = []
        showMemberDropdown = false
    }

    function onClearMember() {
        clearMember()
        memberSelected = false
        memberValue    = ''
    }
</script>

<div class="w-[35%] flex flex-col gap-2 min-w-0">
    <!-- Search card -->
    <div class="bg-base-100 border border-[var(--border)] rounded-xl p-3.5 overflow-visible relative">
        <div class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mb-1.5">Cari Produk</div>
        <div class="relative">
            <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
                bind:this={searchInput}
                bind:value={searchValue}
                onkeydown={onSearchKey}
                class="w-full bg-base-300 border-[1.5px] border-primary rounded-lg pl-8 pr-3 h-9 text-sm text-[var(--text)] outline-none shadow-[0_0_0_3px_var(--primary-dim)]"
                placeholder="SKU atau nama produk..."
                autocomplete="off"
            />

            {#if qtyItem}
                <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-base-100 border-[1.5px] {qtyFree ? 'border-success/40' : 'border-primary/50'} rounded-xl shadow-2xl z-50 p-3">
                    <div class="text-sm font-bold {qtyFree ? 'text-success' : 'text-[var(--text)]'} mb-0.5">{qtyItem.name}</div>
                    <div class="text-[10px] text-[var(--text-muted)] font-mono mb-1.5">{qtyItem.sku} · {qtyFree ? 'GRATIS' : rupiahFormatter.format(qtyItem.price)}</div>
                    {#if alreadyQty > 0}
                        <div class="text-[11px] text-success mb-2 flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-success inline-block"></span>
                            Sudah di keranjang: {alreadyQty} pcs
                        </div>
                    {/if}
                    <div class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mb-1">Jumlah</div>
                    <div class="flex items-center gap-2 mb-2">
                        <input
                            bind:this={qtyInput}
                            bind:value={qtyValue}
                            type="number"
                            min="1"
                            onkeydown={onSearchKey}
                            class="flex-1 bg-base-300 border-[1.5px] {qtyFree ? 'border-success text-success' : 'border-primary text-[var(--text)]'} rounded-lg h-10 text-xl font-bold text-center outline-none"
                        />
                        <span class="text-[11px] text-[var(--text-muted)]">pcs</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] text-[var(--text-faint)] font-mono">Esc → kembali ke daftar</span>
                        <button
                            onclick={confirmQty}
                            class="flex items-center gap-1.5 {qtyFree ? 'bg-success/18 text-success border border-success/30' : 'bg-primary text-white'} text-[11px] font-bold px-3 h-7 rounded-md"
                        >
                            {qtyFree ? 'Tambah GRATIS' : 'Tambah ke keranjang'} <kbd class="bg-white/20 rounded px-1 text-[9px] font-mono">Enter</kbd>
                        </button>
                    </div>
                </div>
            {:else if showDropdown}
                <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-base-100 border-[1.5px] border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div class="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)]">
                        <span class="text-[9px] text-[var(--text-faint)] font-mono">↑↓ pindah · ◄► BAYAR/GRATIS · Enter pilih · Esc tutup</span>
                        <span class="text-[9px] text-[var(--text-faint)]">{searchResults.length} hasil</span>
                    </div>
                    {#each searchResults as item, i}
                        {@const isActive = i === highlightIndex}
                        {@const showFree = isActive && highlightFree}
                        <button
                            class="w-full text-left px-2.5 py-2 border-b border-[var(--border)]/20 last:border-0 transition-colors {isActive ? (showFree ? 'bg-success/[0.07]' : 'bg-primary/10') : 'hover:bg-base-200'}"
                            onclick={() => openQtyPrompt(item, showFree)}
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div>
                                    <div class="text-[12px] font-semibold {showFree ? 'text-success' : 'text-[var(--text)]'}">{item.name}</div>
                                    <div class="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">{item.sku}</div>
                                    <div class="text-[10px] text-[var(--text-muted)] mt-0.5">Stok: {item.stock} pcs</div>
                                </div>
                                <div class="text-[12px] font-bold {showFree ? 'text-success' : 'text-primary'} whitespace-nowrap">
                                    {showFree ? 'GRATIS' : rupiahFormatter.format(item.price)}
                                </div>
                            </div>
                            {#if isActive}
                                <div class="flex mt-1.5 rounded overflow-hidden border border-[var(--border)] text-[10px] font-bold">
                                    <div class="flex-1 h-5 flex items-center justify-center gap-1 {!showFree ? 'bg-primary text-white' : 'text-[var(--text-faint)]'}">
                                        <span class="text-[9px]">◄</span> BAYAR
                                    </div>
                                    <div class="flex-1 h-5 flex items-center justify-center gap-1 border-l border-[var(--border)] {showFree ? 'bg-success/18 text-success' : 'text-[var(--text-faint)]'}">
                                        GRATIS <span class="text-[9px]">►</span>
                                    </div>
                                </div>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
        <div class="flex items-center justify-between mt-2">
            <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--primary-dim)] text-primary border border-primary/20">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/></svg>
                Mode Retail
            </div>
            <span class="text-[10px] text-[var(--text-faint)]">Auto-focus setelah tambah</span>
        </div>
    </div>

    <!-- Member + Pricing card -->
    <div class="bg-base-100 border border-[var(--border)] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
        <!-- Member -->
        <div class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mb-1.5">Member</div>
        {#if memberSelected && $cart.memberName}
            {@const isPremium = $cart.isPremiumMember}
            <div class="flex items-center gap-2 {isPremium ? 'bg-warning/[0.08] border border-warning/35' : 'bg-success/[0.07] border border-success/20'} rounded-lg px-2.5 py-1.5">
                {#if isPremium}
                    <span class="text-base leading-none">♛</span>
                    <div class="flex-1 min-w-0">
                        <div class="text-[11px] font-bold text-warning truncate">{$cart.memberName}</div>
                        <div class="text-[10px] text-warning/60">{$cart.memberId} · {$cart.memberPhone}</div>
                    </div>
                    <span class="text-[9px] font-bold text-warning bg-warning/15 border border-warning/30 rounded px-1.5 py-0.5 shrink-0">PREMIUM</span>
                {:else}
                    <div class="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center text-[9px] font-bold text-success shrink-0">
                        {$cart.memberName.slice(0, 2).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-[11px] font-semibold text-success truncate">{$cart.memberName}</div>
                        <div class="text-[10px] text-success/60">{$cart.memberId} · {$cart.memberPhone}</div>
                    </div>
                {/if}
                <button onclick={onClearMember} class="text-[var(--text-muted)] hover:text-error ml-auto shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
        {:else}
            <div class="relative">
                <svg class="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                <input
                    bind:value={memberValue}
                    onkeydown={onMemberKey}
                    class="w-full bg-base-300 border-[1.5px] border-[var(--border)] focus:border-primary/50 rounded-lg pl-7 pr-3 h-8 text-[12px] text-[var(--text)] outline-none"
                    placeholder="Nama, ID, atau nomor HP..."
                    autocomplete="off"
                />
                {#if showMemberDropdown}
                    <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-base-100 border-[1.5px] border-[var(--border)] rounded-xl shadow-2xl z-40 overflow-hidden">
                        {#if memberResults.length === 0}
                            <div class="px-3 py-2 text-[11px] text-[var(--text-muted)]">Tidak ditemukan</div>
                        {:else}
                            {#each memberResults as m, i}
                                <button
                                    class="w-full text-left px-3 py-2 border-b border-[var(--border)]/20 last:border-0 transition-colors {i === memberHighlight ? 'bg-primary/10' : 'hover:bg-base-200'}"
                                    onclick={() => selectMember(m)}
                                >
                                    <div class="text-[12px] font-semibold text-[var(--text)]">{m.name}</div>
                                    <div class="text-[10px] text-[var(--text-muted)] font-mono">{m.id}</div>
                                </button>
                            {/each}
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Pricing panel -->
        <hr class="border-[var(--border)] my-2.5" />
        <div class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mb-2">Harga</div>

        <div class="flex justify-between items-center mb-1">
            <span class="text-[12px] text-[var(--text-muted)]">Subtotal</span>
            <span class="text-[12px] text-[var(--text)]">{rupiahFormatter.format(subtotal)}</span>
        </div>

        <div class="flex gap-1.5 mb-2">
            <div class="flex-1">
                <div class="text-[10px] text-[var(--text-muted)] mb-1">Diskon %</div>
                <input
                    type="number"
                    min="0"
                    max="100"
                    bind:value={$cart.percentDiscount}
                    class="w-full bg-base-300 border-[1.5px] border-[var(--border)] rounded-md h-7 px-2 text-[12px] {$cart.percentDiscount > 0 ? 'text-success' : 'text-[var(--text)]'}"
                />
            </div>
            <div class="flex-1">
                <div class="text-[10px] text-[var(--text-muted)] mb-1">Diskon Rp</div>
                <input
                    type="number"
                    min="0"
                    bind:value={$cart.fixedDiscount}
                    class="w-full bg-base-300 border-[1.5px] border-[var(--border)] rounded-md h-7 px-2 text-[12px] text-[var(--text)]"
                />
            </div>
        </div>

        {#if discount > 0}
            <div class="flex justify-between items-center mb-2">
                <span class="text-[12px] text-[var(--text-muted)]">Potongan</span>
                <span class="text-[12px] text-success">– {rupiahFormatter.format(discount)}</span>
            </div>
        {/if}

        <button
            class="w-full flex items-center justify-between py-1 mb-1"
            onclick={() => { biayaOpen = !biayaOpen }}
        >
            <span class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)]">Biaya Tambahan</span>
            <div class="flex items-center gap-1.5">
                <span class="text-[11px] text-[var(--text-muted)]">{rupiahFormatter.format(additionalTotal)}</span>
                <svg class="transition-transform text-[var(--text-muted)] {biayaOpen ? 'rotate-180' : ''}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
            </div>
        </button>
        {#if biayaOpen}
            <div class="flex flex-col gap-1 mb-2">
                {#each [['packaging', 'Packaging'], ['transport', 'Transport'], ['modification', 'Modifikasi']] as [field, label]}
                    <div class="flex items-center gap-1.5">
                        <span class="text-[11px] text-[var(--text-muted)] w-18 shrink-0">{label}</span>
                        <input
                            type="number"
                            min="0"
                            bind:value={$cart.additionalCosts[field as 'packaging' | 'transport' | 'modification']}
                            class="flex-1 bg-base-300 border-[1.5px] border-[var(--border)] rounded-md h-6 px-2 text-[11px] text-[var(--text)]"
                        />
                    </div>
                {/each}
            </div>
        {/if}

        <div class="flex items-center gap-1.5 mb-1">
            <span class="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] shrink-0">Potongan</span>
            <input
                type="text"
                bind:value={$cart.additionalCut.label}
                placeholder="Keterangan..."
                class="flex-1 min-w-0 bg-base-300 border-[1.5px] border-[var(--border)] rounded-md h-6 px-2 text-[11px] text-[var(--text)] placeholder:text-[var(--text-faint)]"
            />
            <input
                type="number"
                min="0"
                bind:value={$cart.additionalCut.amount}
                class="w-20 shrink-0 bg-base-300 border-[1.5px] border-[var(--border)] rounded-md h-6 px-2 text-[11px] text-[var(--text)]"
            />
        </div>
        {#if $cart.additionalCut.amount > 0}
            <div class="flex justify-between items-center mb-1">
                <span class="text-[12px] text-[var(--text-muted)]">{$cart.additionalCut.label || 'Potongan'}</span>
                <span class="text-[12px] text-success">– {rupiahFormatter.format($cart.additionalCut.amount)}</span>
            </div>
        {/if}

        <hr class="border-[var(--border)] mt-1 mb-2" />

        <div class="flex justify-between items-center pt-1">
            <span class="text-[12px] font-bold text-primary uppercase tracking-widest">Total</span>
            <span class="text-[20px] font-bold text-primary tracking-tight">{rupiahFormatter.format(total)}</span>
        </div>

        <button
            onclick={() => { payModalOpen = true }}
            disabled={$cart.items.length === 0}
            class="w-full h-10 mt-2.5 bg-primary disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-[13px] font-bold flex items-center justify-center gap-2"
        >
            Bayar Sekarang <kbd class="bg-white/20 rounded px-1.5 py-0.5 text-[10px] font-mono">Ctrl+Enter</kbd>
        </button>
    </div>
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/richie/Documents/Sandbox/Retail && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5
```

Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
git add src/library/components/outlet/retail/LeftPanel.svelte
git commit -m "feat(retail): extract LeftPanel component from page"
```

---

### Task 3: Refactor +page.svelte to layout shell

**Files:**
- Modify: `src/routes/outlet/retail/+page.svelte`

- [ ] **Step 1: Replace the entire file with this content**

```svelte
<script lang="ts">
    import { cart } from '$library/stores/cart'
    import PaymentModal from '$library/components/outlet/retail/PaymentModal.svelte'
    import LeftPanel from '$library/components/outlet/retail/LeftPanel.svelte'
    import CartSection from '$library/components/outlet/retail/CartSection.svelte'

    let cartSelectedIndex = $state(-1)
    let payModalOpen      = $state(false)

    let subtotal        = $derived($cart.items.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.qty, 0))
    let discount        = $derived(subtotal * $cart.percentDiscount / 100 + $cart.fixedDiscount)
    let additionalTotal = $derived($cart.additionalCosts.packaging + $cart.additionalCosts.transport + $cart.additionalCosts.modification)
    let total           = $derived(Math.max(0, subtotal - discount - $cart.additionalCut.amount + additionalTotal))
    let totalPaid       = $derived($cart.paymentMethods.reduce((s, m) => s + m.amount, 0))
    let kembalian       = $derived(totalPaid - total)

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault()
            if ($cart.items.length > 0 && !payModalOpen) {
                payModalOpen = true
            }
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="flex gap-3 p-3" style="height: calc(100vh - 62px); margin-top: 62px;">
    <LeftPanel bind:cartSelectedIndex bind:payModalOpen />
    <CartSection {cartSelectedIndex} />
</div>

<PaymentModal bind:isModal={payModalOpen} {total} {totalPaid} {kembalian} />
```

- [ ] **Step 2: Verify TypeScript compiles with zero errors**

```bash
cd /home/richie/Documents/Sandbox/Retail && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -10
```

Expected: `0 errors, 0 warnings`

- [ ] **Step 3: Start dev server and verify UI**

```bash
cd /home/richie/Documents/Sandbox/Retail && npm run dev
```

Open `http://localhost:5173/outlet/retail` and verify:
- Left pane renders search field, member lookup, and pricing panel
- Right pane renders cart (empty state with icon)
- Typing a product name in search shows dropdown
- Arrow keys navigate the dropdown
- Adding an item shows it in the cart on the right
- Arrow keys in the search field (no dropdown) highlight cart rows
- Ctrl+Enter opens the payment modal
- Payment modal still works end-to-end

- [ ] **Step 4: Commit**

```bash
git add src/routes/outlet/retail/+page.svelte
git commit -m "refactor(retail): +page.svelte reduced to layout shell"
```
