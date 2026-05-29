<script lang="ts">
    interface Props {
        isModal?:   boolean
        total?:     number
        totalPaid?: number
        kembalian?: number
    }
    let { isModal = $bindable(false), total = 0, totalPaid = 0, kembalian = 0 }: Props = $props()
</script>
<!-- stub — implemented in Task 7 -->
