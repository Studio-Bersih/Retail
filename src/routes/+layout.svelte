<script lang="ts">
    import { Toaster } from 'svelte-sonner'
    import '../app.css'

    const { children } = $props()
</script>

<Toaster richColors position="top-right" />
{@render children()}
