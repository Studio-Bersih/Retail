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
                const newIndex = cartSelectedIndex < $cart.items.length - 1 ? cartSelectedIndex + 1 : 0
                cartSelectedIndex = newIndex
                const item = $cart.items[newIndex]
                if (item) {
                    openQtyPrompt(item, item.isFree)
                }
                return
            }
            if (e.key === 'ArrowUp' && $cart.items.length > 0) {
                e.preventDefault()
                const newIndex = cartSelectedIndex > 0 ? cartSelectedIndex - 1 : $cart.items.length - 1
                cartSelectedIndex = newIndex
                const item = $cart.items[newIndex]
                if (item) {
                    openQtyPrompt(item, item.isFree)
                }
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
            tick().then(() => searchInput?.focus())
        }
    }

    // ── Search helpers ────────────────────────────────────────────────────────
    function openQtyPrompt(item: MockItem, free: boolean) {
        qtyItem      = item
        qtyFree      = free
        qtyValue     = 1
        showDropdown = false
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

    function onGlobalKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' && !payModalOpen) {
            searchInput?.focus()
        }
    }
</script>

<svelte:window onkeydown={onGlobalKeydown} />

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
                placeholder="SKU atau nama produk... [ESC]"
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
