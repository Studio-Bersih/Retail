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
