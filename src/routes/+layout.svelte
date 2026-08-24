<script lang="ts">
    import './layout.css';
    import { Toaster } from 'svelte-sonner';
    import { theme } from '$lib/stores/theme.svelte';

    let { children } = $props();

    // Read the saved theme once the DOM exists. Doing it here rather than in each
    // page keeps <html data-theme> in one place.
    $effect(() => {
        theme.init();
    });
</script>

<svelte:head>
    <link rel="icon" href="/icons/favicon.svg" />
</svelte:head>

<!-- svelte-sonner renders into its own portal, so one instance at the root
     serves every route. `richColors` maps success/error onto the theme. -->
<Toaster position="top-right" richColors closeButton />

{@render children()}
