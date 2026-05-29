<script lang="ts">
    import Modal from '$library/components/Modal.svelte'
    import { cart, clearCart } from '$library/stores/cart'
    import { auth } from '$library/stores/auth'
    import { get } from 'svelte/store'
    import { rupiahFormatter } from '$library/utils/formatter'
    import { getPaymentProviders } from '$library/mock/payment-methods'

    interface Props {
        isModal?:   boolean
        total?:     number
        totalPaid?: number
        kembalian?: number
    }

    let {
        isModal   = $bindable(false),
        total     = 0,
        totalPaid = 0,
        kembalian = 0,
    }: Props = $props()

    const KATEGORI_OPTIONS = [
        'Private Event',
        'Pernikahan',
        'Pengajian / Acara Keagamaan',
        'Ulang Tahun',
        'Wisuda',
        'Reuni',
        'Gathering Kantor',
        'Sunatan',
        'Acara Sosial / Komunitas',
        'Tidak Ada Acara',
    ]

    let providers    = $state<string[]>([])
    let submitting   = $state(false)
    let errorMessage = $state('')

    $effect(() => {
        if (isModal) {
            providers    = getPaymentProviders()
            errorMessage = ''
        }
    })

    function addPaymentMethod() {
        const available = providers.filter(p => p !== 'Tunai')
        cart.update(s => ({
            ...s,
            paymentMethods: [...s.paymentMethods, { method: available[0] ?? 'QRIS', amount: 0 }]
        }))
    }

    function removePaymentMethod(index: number) {
        cart.update(s => ({
            ...s,
            paymentMethods: s.paymentMethods.filter((_, i) => i !== index)
        }))
    }

    function setMethodProvider(index: number, method: string) {
        cart.update(s => ({
            ...s,
            paymentMethods: s.paymentMethods.map((m, i) => i === index ? { ...m, method } : m)
        }))
    }

    function setMethodAmount(index: number, amount: number) {
        cart.update(s => ({
            ...s,
            paymentMethods: s.paymentMethods.map((m, i) => i === index ? { ...m, amount } : m)
        }))
    }

    function onWindowKeydown(e: KeyboardEvent) {
        if (e.ctrlKey && e.key === 'Enter' && isModal) {
            e.preventDefault()
            confirm()
        }
    }

    let canConfirm = $derived(totalPaid >= total && total > 0)
    let hasTunai   = $derived($cart.paymentMethods.some(m => m.method === 'Tunai'))

    async function confirm() {
        if (!canConfirm || submitting) {
            return
        }
        submitting   = true
        errorMessage = ''

        const session  = get(auth)
        const subtotal = $cart.items.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.qty, 0)

        const payload = {
            memberId:        $cart.memberId,
            mode:            'retail' as const,
            items:           $cart.items.map(i => ({ id: i.id, qty: i.qty, price: i.price, isFree: i.isFree })),
            subtotal,
            kupon:           null,
            additionalCosts: $cart.additionalCosts,
            total,
            notes:           $cart.notes,
            kategoriAcara:   $cart.kategoriAcara,
            paymentMethods:  $cart.paymentMethods,
        }

        try {
            const API_URL  = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
            const response = await fetch(`${API_URL}/api/transactions`, {
                method:  'POST',
                headers: {
                    'Content-Type':      'application/json',
                    'Authorization':     `Bearer ${session?.token ?? ''}`,
                    'X-Idempotency-Key': crypto.randomUUID(),
                    'X-App-Version':     '1.0.0',
                    'X-Request-ID':      crypto.randomUUID(),
                },
                body: JSON.stringify(payload),
            })

            if (response.status === 201) {
                clearCart()
                isModal = false
            } else {
                const data   = await response.json() as { message?: string }
                errorMessage = data.message ?? 'Terjadi kesalahan. Coba lagi.'
            }
        } catch {
            errorMessage = 'Gagal terhubung ke server.'
        } finally {
            submitting = false
        }
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Modal bind:isModal size="lg" title="Konfirmasi Pembayaran">
    <!-- Total box -->
    <div class="flex items-baseline justify-between bg-[#1A120B] rounded-lg px-3.5 py-2.5 mb-4">
        <span class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63]">Total Tagihan</span>
        <span class="text-[22px] font-bold text-[#C2622A] tracking-tight">{rupiahFormatter.format(total)}</span>
    </div>

    <!-- Payment methods -->
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-2">Metode Pembayaran</div>

    {#each $cart.paymentMethods as method, i}
        {@const isTunai = method.method === 'Tunai'}
        {@const isQRIS  = method.method === 'QRIS'}
        <div class="mb-1.5">
            <div class="flex items-center gap-2 bg-[#1A120B] border-[1.5px] {isTunai ? 'border-[rgba(74,222,128,0.3)]' : 'border-[rgba(96,165,250,0.3)]'} rounded-lg px-2.5 py-2">
                <div class="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 {isTunai ? 'bg-[rgba(74,222,128,0.12)]' : 'bg-[rgba(96,165,250,0.12)]'}">
                    {isTunai ? '💵' : '📱'}
                </div>
                {#if isTunai}
                    <span class="text-[12px] font-semibold text-[#E8C9A8] flex-1">Tunai</span>
                {:else}
                    <select
                        value={method.method}
                        onchange={(e) => setMethodProvider(i, (e.target as HTMLSelectElement).value)}
                        class="flex-1 bg-[#2C1E12] border border-[#3D2B1F] rounded-md h-6 px-1.5 text-[12px] text-[#E8C9A8] font-semibold"
                    >
                        {#each providers.filter(p => p !== 'Tunai') as p}
                            <option value={p}>{p}</option>
                        {/each}
                    </select>
                {/if}
                <input
                    type="number"
                    min="0"
                    value={method.amount}
                    oninput={(e) => setMethodAmount(i, Number((e.target as HTMLInputElement).value))}
                    class="w-24 bg-[#2C1E12] border border-[#3D2B1F] rounded-md h-6 px-2 text-[12px] text-[#E8C9A8] text-right shrink-0"
                />
                {#if !isTunai}
                    <button onclick={() => removePaymentMethod(i)} class="w-5 h-5 flex items-center justify-center text-[#4D3826] hover:text-[#f87171] shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                {/if}
            </div>
            {#if isQRIS}
                <div class="mt-1 bg-[#1A120B] border border-[rgba(96,165,250,0.2)] border-t-0 rounded-b-lg px-3 py-2 text-[10px] text-[#4D3826] italic">
                    QRIS akan tampil di sini — OQ-R01
                </div>
            {/if}
        </div>
    {/each}

    <button
        onclick={addPaymentMethod}
        class="w-full h-8 border-[1.5px] border-dashed border-[#3D2B1F] hover:border-[rgba(194,98,42,0.4)] hover:text-[#C2622A] rounded-lg text-[11px] font-semibold text-[#6B5744] flex items-center justify-center gap-1.5 mb-4 transition-colors"
    >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        Tambah metode pembayaran
    </button>

    <!-- Summary -->
    <div class="bg-[#1A120B] rounded-lg px-3 py-2.5 mb-4 text-[11px]">
        <div class="flex justify-between mb-1">
            <span class="text-[#9C7E63]">Total tagihan</span>
            <span class="text-[#E8C9A8] font-semibold">{rupiahFormatter.format(total)}</span>
        </div>
        {#each $cart.paymentMethods as m}
            <div class="flex justify-between mb-1">
                <span class="text-[#9C7E63]">{m.method}</span>
                <span class="text-[#4ade80] font-semibold">{rupiahFormatter.format(m.amount)}</span>
            </div>
        {/each}
        <hr class="border-[#3D2B1F] my-1.5" />
        <div class="flex justify-between mb-1">
            <span class="text-[#9C7E63]">Total dibayar</span>
            <span class="font-semibold {totalPaid >= total ? 'text-[#4ade80]' : 'text-[#f87171]'}">{rupiahFormatter.format(totalPaid)}</span>
        </div>
        {#if hasTunai}
            <div class="flex justify-between">
                <span class="text-[#9C7E63]">Kembalian tunai</span>
                <span class="text-[13px] font-bold text-[#4ade80]">{rupiahFormatter.format(Math.max(0, kembalian))}</span>
            </div>
        {/if}
    </div>

    <!-- Notes -->
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Catatan</div>
    <textarea
        bind:value={$cart.notes}
        placeholder="Keterangan transaksi (opsional)..."
        class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] rounded-lg px-2.5 py-2 text-[12px] text-[#6B5744] resize-none h-12 mb-4"
    ></textarea>

    <!-- Kategori Acara -->
    <div class="text-[10px] font-bold tracking-widest uppercase text-[#9C7E63] mb-1.5">Kategori Acara</div>
    <select
        bind:value={$cart.kategoriAcara}
        class="w-full bg-[#1A120B] border-[1.5px] border-[#3D2B1F] focus:border-[rgba(194,98,42,0.4)] rounded-lg h-8 px-2.5 text-[12px] text-[#E8C9A8] mb-2"
    >
        {#each KATEGORI_OPTIONS as opt}
            <option value={opt}>{opt}</option>
        {/each}
    </select>

    {#if errorMessage}
        <div class="text-[11px] text-[#f87171] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] rounded-lg px-3 py-2 mb-2">{errorMessage}</div>
    {/if}

    <div class="flex gap-2 mt-2 pt-3 border-t border-[#3D2B1F]">
        <button
            onclick={() => { isModal = false }}
            class="flex-1 h-9 bg-transparent border-[1.5px] border-[#3D2B1F] rounded-lg text-[#9C7E63] text-[12px] font-semibold"
        >
            Batal (Esc)
        </button>
        <button
            onclick={confirm}
            disabled={!canConfirm || submitting}
            class="flex-[2] h-9 bg-[#C2622A] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-1.5"
        >
            {submitting ? 'Memproses...' : 'Konfirmasi Pembayaran'}
            {#if !submitting}
                <kbd class="bg-white/20 rounded px-1 text-[9px] font-mono">Ctrl+Enter</kbd>
            {/if}
        </button>
    </div>
</Modal>
