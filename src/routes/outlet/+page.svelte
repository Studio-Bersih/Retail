<script lang="ts">
    import { goto } from '$app/navigation'
    import { onMount } from 'svelte'

    onMount(() => goto('/outlet/retail', { replaceState: true }))
</script>
