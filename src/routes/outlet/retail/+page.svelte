<script lang="ts">
    import { tick } from 'svelte'
    import { cart, addItem, setQty, removeItem, setMember, clearMember, clearCart } from '$library/stores/cart'
    import { searchItems, getItemBySku, type MockItem } from '$library/mock/items'
    import { searchMembers, getMemberById, getMemberByPhone, type MockMember } from '$library/mock/members'
    import { rupiahFormatter } from '$library/utils/formatter'
    import PaymentModal from '$library/components/outlet/retail/PaymentModal.svelte'

    // ── Search state ────────────────────────────────────
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

    // ── Member state ────────────────────────────────────
    let memberValue        = $state('')
    let memberResults      = $state<MockMember[]>([])
    let memberHighlight    = $state(0)
    let showMemberDropdown = $state(false)
    let memberSelected     = $state(false)

    // ── Payment modal ───────────────────────────────────
    let payModalOpen = $state(false)

    // ── Pricing ─────────────────────────────────────────
    let biayaOpen = $state(true)

    // ── Derived values ───────────────────────────────────
    let subtotal        = $derived($cart.items.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.qty, 0))
    let discount        = $derived(subtotal * $cart.percentDiscount / 100 + $cart.fixedDiscount)
    let additionalTotal = $derived($cart.additionalCosts.packaging + $cart.additionalCosts.transport + $cart.additionalCosts.modification)
    let total           = $derived(Math.max(0, subtotal - discount + additionalTotal))
    let totalPaid       = $derived($cart.paymentMethods.reduce((s, m) => s + m.amount, 0))
    let kembalian       = $derived(totalPaid - total)

    // ── Search debounce ──────────────────────────────────
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

    // ── Member debounce ──────────────────────────────────
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

    // ── Keyboard handlers ────────────────────────────────
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

    // ── Global keyboard shortcuts ─────────────────────────
    function onWindowKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault()
            if ($cart.items.length > 0 && !payModalOpen) {
                payModalOpen = true
            }
        }
    }

    // ── Search helpers ────────────────────────────────────
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

    // ── Member helpers ────────────────────────────────────
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

    // ── Row numbering ─────────────────────────────────────
    function rowNumber(index: number): string {
        return `#${index + 1}`
    }

    // Already-in-cart qty for qty prompt indicator
    let alreadyQty = $derived(
        qtyItem
            ? ($cart.items.find(i => i.id === qtyItem!.id && i.isFree === qtyFree)?.qty ?? 0)
            : 0
    )
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet searchField()}
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Cari Produk</div>
    <div class="relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B5744]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
            bind:this={searchInput}
            bind:value={searchValue}
            onkeydown={onSearchKey}
            class="w-full bg-[#1A120B] border-[1.5px] border-[#C2622A] rounded-lg pl-8 pr-3 h-9 text-sm text-[#E8C9A8] outline-none shadow-[0_0_0_3px_rgba(194,98,42,0.12)]"
            placeholder="SKU atau nama produk..."
            autocomplete="off"
        />

        {#if qtyItem}
            <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#2C1E12] border-[1.5px] {qtyFree ? 'border-[rgba(74,222,128,0.4)]' : 'border-[rgba(194,98,42,0.5)]'} rounded-xl shadow-2xl z-50 p-3">
                <div class="text-sm font-bold {qtyFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'} mb-0.5">{qtyItem.name}</div>
                <div class="text-[10px] text-[#6B5744] font-mono mb-1.5">{qtyItem.sku} · {qtyFree ? 'GRATIS' : rupiahFormatter.format(qtyItem.price)}</div>
                {#if alreadyQty > 0}
                    <div class="text-[11px] text-[#4ade80] mb-2 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-[#4ade80] inline-block"></span>
                        Sudah di keranjang: {alreadyQty} pcs
                    </div>
                {/if}
                <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1">Jumlah</div>
                <div class="flex items-center gap-2 mb-2">
                    <input
                        bind:this={qtyInput}
                        bind:value={qtyValue}
                        type="number"
                        min="1"
                        onkeydown={onSearchKey}
                        class="flex-1 bg-[#1A120B] border-[1.5px] {qtyFree ? 'border-[#4ade80] text-[#4ade80]' : 'border-[#C2622A] text-[#E8C9A8]'} rounded-lg h-10 text-xl font-bold text-center outline-none"
                    />
                    <span class="text-[11px] text-[#9C7E63]">pcs</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-[10px] text-[#4D3826] font-mono">Esc → kembali ke daftar</span>
                    <button
                        onclick={confirmQty}
                        class="flex items-center gap-1.5 {qtyFree ? 'bg-[rgba(74,222,128,0.18)] text-[#4ade80] border border-[rgba(74,222,128,0.3)]' : 'bg-[#C2622A] text-white'} text-[11px] font-bold px-3 h-7 rounded-md"
                    >
                        {qtyFree ? 'Tambah GRATIS' : 'Tambah ke keranjang'} <kbd class="bg-white/20 rounded px-1 text-[9px] font-mono">Enter</kbd>
                    </button>
                </div>
            </div>
        {:else if showDropdown}
            <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#2C1E12] border-[1.5px] border-[#3D2B1F] rounded-xl shadow-2xl z-50 overflow-hidden">
                <div class="flex items-center justify-between px-2.5 py-1.5 border-b border-[#3D2B1F]">
                    <span class="text-[9px] text-[#4D3826] font-mono">↑↓ pindah · ◄► BAYAR/GRATIS · Enter pilih · Esc tutup</span>
                    <span class="text-[9px] text-[#4D3826]">{searchResults.length} hasil</span>
                </div>
                {#each searchResults as item, i}
                    {@const isActive = i === highlightIndex}
                    {@const showFree = isActive && highlightFree}
                    <button
                        class="w-full text-left px-2.5 py-2 border-b border-[#3D2B1F]/20 last:border-0 transition-colors {isActive ? (showFree ? 'bg-[rgba(74,222,128,0.07)]' : 'bg-[rgba(194,98,42,0.1)]') : 'hover:bg-[#3D2B1F]/30'}"
                        onclick={() => openQtyPrompt(item, showFree)}
                    >
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <div class="text-[12px] font-semibold {showFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}">{item.name}</div>
                                <div class="text-[10px] text-[#6B5744] font-mono mt-0.5">{item.sku}</div>
                                <div class="text-[10px] text-[#9C7E63] mt-0.5">Stok: {item.stock} pcs</div>
                            </div>
                            <div class="text-[12px] font-bold {showFree ? 'text-[#4ade80]' : 'text-[#C2622A]'} whitespace-nowrap">
                                {showFree ? 'GRATIS' : rupiahFormatter.format(item.price)}
                            </div>
                        </div>
                        {#if isActive}
                            <div class="flex mt-1.5 rounded overflow-hidden border border-[#3D2B1F] text-[10px] font-bold">
                                <div class="flex-1 h-5 flex items-center justify-center gap-1 {!showFree ? 'bg-[#C2622A] text-white' : 'text-[#4D3826]'}">
                                    <span class="text-[9px]">◄</span> BAYAR
                                </div>
                                <div class="flex-1 h-5 flex items-center justify-center gap-1 border-l border-[#3D2B1F] {showFree ? 'bg-[rgba(74,222,128,0.18)] text-[#4ade80]' : 'text-[#4D3826]'}">
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
        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(194,98,42,0.12)] text-[#C2622A] border border-[rgba(194,98,42,0.2)]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/></svg>
            Mode Retail
        </div>
        <span class="text-[10px] text-[#4D3826]">Auto-focus setelah tambah</span>
    </div>
{/snippet}

{#snippet memberField()}
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Member</div>
    {#if memberSelected && $cart.memberName}
        {@const isPremium = $cart.isPremiumMember}
        <div class="flex items-center gap-2 {isPremium ? 'bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.35)]' : 'bg-[rgba(74,222,128,0.07)] border border-[rgba(74,222,128,0.2)]'} rounded-lg px-2.5 py-1.5">
            {#if isPremium}
                <span class="text-base leading-none">♛</span>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-bold text-[#fbbf24] truncate">{$cart.memberName}</div>
                    <div class="text-[10px] text-[rgba(251,191,36,0.6)]">{$cart.memberId} · {$cart.memberPhone}</div>
                </div>
                <span class="text-[9px] font-bold text-[#fbbf24] bg-[rgba(251,191,36,0.15)] border border-[rgba(251,191,36,0.3)] rounded px-1.5 py-0.5 shrink-0">PREMIUM</span>
            {:else}
                <div class="w-5 h-5 rounded-full bg-[rgba(74,222,128,0.2)] flex items-center justify-center text-[9px] font-bold text-[#4ade80] shrink-0">
                    {$cart.memberName.slice(0, 2).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-semibold text-[#4ade80] truncate">{$cart.memberName}</div>
                    <div class="text-[10px] text-[rgba(74,222,128,0.6)]">{$cart.memberId} · {$cart.memberPhone}</div>
                </div>
            {/if}
            <button onclick={onClearMember} class="text-[#6B5744] hover:text-[#f87171] ml-auto shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
        </div>
    {:else}
        <div class="relative">
            <svg class="absolute left-2 top-1/2 -translate-y-1/2 text-[#4D3826]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            <input
                bind:value={memberValue}
                onkeydown={onMemberKey}
                class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] focus:border-[rgba(194,98,42,0.5)] rounded-lg pl-7 pr-3 h-8 text-[12px] text-[#E8C9A8] outline-none"
                placeholder="Nama, ID, atau nomor HP..."
                autocomplete="off"
            />
            {#if showMemberDropdown}
                <div class="absolute top-[calc(100%+4px)] left-0 right-0 bg-[#2C1E12] border-[1.5px] border-[#3D2B1F] rounded-xl shadow-2xl z-40 overflow-hidden">
                    {#if memberResults.length === 0}
                        <div class="px-3 py-2 text-[11px] text-[#6B5744]">Tidak ditemukan</div>
                    {:else}
                        {#each memberResults as m, i}
                            <button
                                class="w-full text-left px-3 py-2 border-b border-[#3D2B1F]/20 last:border-0 transition-colors {i === memberHighlight ? 'bg-[rgba(194,98,42,0.1)]' : 'hover:bg-[#3D2B1F]/30'}"
                                onclick={() => selectMember(m)}
                            >
                                <div class="text-[12px] font-semibold text-[#E8C9A8]">{m.name}</div>
                                <div class="text-[10px] text-[#6B5744] font-mono">{m.id}</div>
                            </button>
                        {/each}
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
{/snippet}

{#snippet pricingPanel()}
    <hr class="border-[#3D2B1F] my-2.5" />
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-2">Harga</div>

    <div class="flex justify-between items-center mb-1">
        <span class="text-[12px] text-[#9C7E63]">Subtotal</span>
        <span class="text-[12px] text-[#E8C9A8]">{rupiahFormatter.format(subtotal)}</span>
    </div>

    <div class="flex gap-1.5 mb-2">
        <div class="flex-1">
            <div class="text-[10px] text-[#6B5744] mb-1">Diskon %</div>
            <input
                type="number"
                min="0"
                max="100"
                bind:value={$cart.percentDiscount}
                class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-md h-7 px-2 text-[12px] {$cart.percentDiscount > 0 ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}"
            />
        </div>
        <div class="flex-1">
            <div class="text-[10px] text-[#6B5744] mb-1">Diskon Rp</div>
            <input
                type="number"
                min="0"
                bind:value={$cart.fixedDiscount}
                class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-md h-7 px-2 text-[12px] text-[#E8C9A8]"
            />
        </div>
    </div>

    {#if discount > 0}
        <div class="flex justify-between items-center mb-2">
            <span class="text-[12px] text-[#9C7E63]">Potongan</span>
            <span class="text-[12px] text-[#4ade80]">– {rupiahFormatter.format(discount)}</span>
        </div>
    {/if}

    <button
        class="w-full flex items-center justify-between py-1 mb-1"
        onclick={() => { biayaOpen = !biayaOpen }}
    >
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63]">Biaya Tambahan</span>
        <div class="flex items-center gap-1.5">
            <span class="text-[11px] text-[#9C7E63]">{rupiahFormatter.format(additionalTotal)}</span>
            <svg class="transition-transform {biayaOpen ? 'rotate-180' : ''}" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B5744" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </div>
    </button>
    {#if biayaOpen}
        <div class="flex flex-col gap-1 mb-2">
            {#each [['packaging', 'Packaging'], ['transport', 'Transport'], ['modification', 'Modifikasi']] as [field, label]}
                <div class="flex items-center gap-1.5">
                    <span class="text-[11px] text-[#6B5744] w-18 shrink-0">{label}</span>
                    <input
                        type="number"
                        min="0"
                        bind:value={$cart.additionalCosts[field as 'packaging' | 'transport' | 'modification']}
                        class="flex-1 bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-md h-6 px-2 text-[11px] text-[#E8C9A8]"
                    />
                </div>
            {/each}
        </div>
    {/if}

    <hr class="border-[#3D2B1F] mt-1 mb-2" />

    <div class="flex justify-between items-center pt-1">
        <span class="text-[12px] font-bold text-[#C2622A] uppercase tracking-widest">Total</span>
        <span class="text-[20px] font-bold text-[#C2622A] tracking-tight">{rupiahFormatter.format(total)}</span>
    </div>

    <button
        onclick={() => { payModalOpen = true }}
        disabled={$cart.items.length === 0}
        class="w-full h-10 mt-2.5 bg-[#C2622A] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-[13px] font-bold flex items-center justify-center gap-2"
    >
        Bayar Sekarang <kbd class="bg-white/20 rounded px-1.5 py-0.5 text-[10px] font-mono">Ctrl+Enter</kbd>
    </button>
{/snippet}

{#snippet cartRows()}
    <div class="flex items-center justify-between mb-2.5 shrink-0">
        <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63]">Keranjang</span>
            {#if $cart.items.length > 0}
                <span class="text-[10px] bg-[rgba(194,98,42,0.12)] text-[#C2622A] rounded-full px-2 py-0.5 font-bold">
                    {$cart.items.length} baris · {$cart.items.reduce((s, i) => s + i.qty, 0)} pcs
                </span>
            {/if}
        </div>
        {#if $cart.items.length > 0}
            <button onclick={clearCart} class="text-[10px] text-[#6B5744] hover:text-[#f87171] transition-colors">Kosongkan</button>
        {/if}
    </div>

    <div class="grid gap-2 px-2.5 pb-1.5 border-b border-[#3D2B1F] shrink-0" style="grid-template-columns: 1fr 96px 88px 22px;">
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#6B5744]">Produk</span>
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#6B5744] text-center">Qty</span>
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#6B5744] text-right">Subtotal</span>
        <span></span>
    </div>

    <div class="flex-1 overflow-y-auto pt-1 pl-5" style="scrollbar-width: thin; scrollbar-color: #3D2B1F transparent;">
        {#if $cart.items.length === 0}
            <div class="flex flex-col items-center justify-center h-full text-[#4D3826] gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                <span class="text-[12px]">Keranjang kosong</span>
                <span class="text-[11px]">Ketik SKU atau nama produk untuk mulai</span>
            </div>
        {:else}
            {#each $cart.items as item, i}
                {@const isPrevSame = i > 0 && $cart.items[i - 1].id === item.id && item.isFree}
                {#if isPrevSame}
                    <div class="mx-2.5 my-0" style="height:1px; background: repeating-linear-gradient(90deg, #3D2B1F 0, #3D2B1F 4px, transparent 4px, transparent 8px);"></div>
                {:else if i > 0}
                    <div class="h-1"></div>
                {/if}
                <div
                    class="relative grid gap-2 items-center px-2.5 py-2 rounded-lg transition-colors {item.isFree ? 'bg-[rgba(74,222,128,0.04)] hover:bg-[rgba(74,222,128,0.08)]' : 'hover:bg-[#3D2B1F]/30'}"
                    style="grid-template-columns: 1fr 96px 88px 22px;"
                >
                    <span class="absolute -left-4 top-1/2 -translate-y-1/2 text-[9px] font-bold font-mono {item.isFree ? 'text-[rgba(74,222,128,0.4)]' : 'text-[#4D3826]'}">
                        {rowNumber(i)}
                    </span>

                    <div>
                        <div class="text-[13px] font-semibold truncate {item.isFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}">{item.name}</div>
                        <div class="text-[10px] font-mono {item.isFree ? 'text-[rgba(74,222,128,0.4)]' : 'text-[#4D3826]'} mt-0.5">{item.sku}</div>
                        {#if item.isFree}
                            <div class="mt-1">
                                <span class="text-[9px] font-bold text-[#4ade80] bg-[rgba(74,222,128,0.12)] rounded px-1 py-0.5">GRATIS</span>
                            </div>
                        {/if}
                        <div class="flex items-center gap-1.5 mt-1 text-[10px] text-[#6B5744]">
                            <span>Stok:</span>
                            <span class="font-semibold {item.stock <= 5 ? 'text-[#fbbf24]' : 'text-[#9C7E63]'}">{item.stock} pcs</span>
                            {#if item.stock <= 5}
                                <span class="text-[9px] text-[#fbbf24] bg-[rgba(251,191,36,0.1)] rounded px-1">⚠ hampir habis</span>
                            {/if}
                            {#if item.preAdjDelta !== 0}
                                <span class="text-[9px] rounded px-1 {item.preAdjDelta > 0 ? 'text-[#4ade80] bg-[rgba(74,222,128,0.1)]' : 'text-[#f87171] bg-[rgba(248,113,113,0.1)]'}">
                                    pre-adj {item.preAdjDelta > 0 ? '+' : ''}{item.preAdjDelta}
                                </span>
                            {/if}
                        </div>
                    </div>

                    <div class="flex items-center gap-1 justify-center">
                        <button
                            onclick={() => setQty(item.id, item.isFree, item.qty - 1)}
                            class="w-5 h-5 bg-[#1A120B] border {item.isFree ? 'border-[rgba(74,222,128,0.2)] hover:border-[#4ade80] hover:text-[#4ade80]' : 'border-[#3D2B1F] hover:border-[#C2622A] hover:text-[#C2622A]'} rounded text-[#9C7E63] flex items-center justify-center text-sm font-semibold leading-none shrink-0"
                        >−</button>
                        <span class="text-[13px] font-bold min-w-6 text-center {item.isFree ? 'text-[#4ade80]' : 'text-[#E8C9A8]'}">{item.qty}</span>
                        <button
                            onclick={() => setQty(item.id, item.isFree, item.qty + 1)}
                            class="w-5 h-5 bg-[#1A120B] border {item.isFree ? 'border-[rgba(74,222,128,0.2)] hover:border-[#4ade80] hover:text-[#4ade80]' : 'border-[#3D2B1F] hover:border-[#C2622A] hover:text-[#C2622A]'} rounded text-[#9C7E63] flex items-center justify-center text-sm font-semibold leading-none shrink-0"
                        >+</button>
                    </div>

                    <div class="text-right {item.isFree ? 'text-[11px] font-bold text-[#4ade80]' : 'text-[13px] font-semibold text-[#E8C9A8]'}">
                        {item.isFree ? 'GRATIS' : rupiahFormatter.format(item.price * item.qty)}
                    </div>

                    <button
                        onclick={() => removeItem(item.id, item.isFree)}
                        class="w-5 h-5 rounded flex items-center justify-center text-[#4D3826] hover:bg-[rgba(185,64,64,0.15)] hover:text-[#f87171] transition-colors"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            {/each}
        {/if}
    </div>
{/snippet}

<div class="flex gap-3 p-3" style="height: calc(100vh - 62px); margin-top: 62px;">

    <!-- LEFT PANE 35% -->
    <div class="w-[35%] flex flex-col gap-2 min-w-0">
        <div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 overflow-visible relative">
            {@render searchField()}
        </div>
        <div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
            {@render memberField()}
            {@render pricingPanel()}
        </div>
    </div>

    <!-- RIGHT PANE 65% -->
    <div class="w-[65%] flex flex-col gap-2 min-w-0">
        <div class="bg-[#2C1E12] border border-[#3D2B1F] rounded-xl p-3.5 flex-1 flex flex-col overflow-hidden">
            {@render cartRows()}
        </div>
    </div>
</div>

<PaymentModal bind:isModal={payModalOpen} {total} {totalPaid} {kembalian} />
