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

    $effect(() => {
        void $cart.items.length
        cartSelectedIndex = -1
    })

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
