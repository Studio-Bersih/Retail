<script lang="ts">
    // Scaffold check page. Delete once real routes exist — it is here to prove
    // every piece of the setup actually works.
    import { toast } from 'svelte-sonner';
    import { Icon, Drawer, Modal, type ModalSize } from '$components/shared';
    import { theme } from '$lib/stores/theme.svelte';
    import { rupiah, qty, signed } from '$lib/utils';
    import { useMediaQuery } from '$lib/hooks';

    let drawerLeft = $state(false);
    let drawerRight = $state(false);
    let drawerNoClose = $state(false);
    let modalOpen = $state(false);
    let modalSize = $state<ModalSize>('md');
    let modalBare = $state(false);

    const isDesktop = useMediaQuery('(min-width: 768px)');

    const SIZES: ModalSize[] = ['sm', 'md', 'lg', 'xl', 'full'];
    const ICONS = ['store', 'package', 'users', 'search', 'plus', 'trash', 'edit', 'alert'];

    function openModal(size: ModalSize) {
        modalSize = size;
        modalBare = false;
        modalOpen = true;
    }
</script>

<div class="bg-base-200 min-h-screen p-6">
    <div class="mx-auto max-w-4xl space-y-6">
        <header class="flex items-center justify-between">
            <div>
                <h1 class="text-3xl font-bold">Retail POS</h1>
                <p class="text-base-content/60">
                    SvelteKit · Tailwind 4 · daisyUI 5 · Plus Jakarta Sans
                </p>
            </div>
            <button class="btn btn-primary" onclick={() => theme.toggle()}>
                <Icon name={theme.isDark ? 'check' : 'info'} size={18} />
                {theme.isDark ? 'Light' : 'Dark'}
            </button>
        </header>

        <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <h2 class="card-title">Drawer</h2>
                <p class="text-base-content/70 text-sm">
                    Props: <code class="badge badge-ghost badge-sm">title</code>
                    <code class="badge badge-ghost badge-sm">position</code>
                    <code class="badge badge-ghost badge-sm">toggle</code>
                    <code class="badge badge-ghost badge-sm">hideClose</code>
                </p>
                <div class="flex flex-wrap gap-2">
                    <button class="btn btn-outline btn-sm" onclick={() => (drawerLeft = true)}>
                        <Icon name="chevron-right" size={16} /> position left
                    </button>
                    <button class="btn btn-outline btn-sm" onclick={() => (drawerRight = true)}>
                        <Icon name="chevron-left" size={16} /> position right
                    </button>
                    <button class="btn btn-outline btn-sm" onclick={() => (drawerNoClose = true)}>
                        hideClose — Esc still works
                    </button>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <h2 class="card-title">Modal</h2>
                <p class="text-base-content/70 text-sm">
                    Props: <code class="badge badge-ghost badge-sm">size</code>
                    <code class="badge badge-ghost badge-sm">title</code>
                    <code class="badge badge-ghost badge-sm">hideTitle</code>
                    <code class="badge badge-ghost badge-sm">hideClose</code>
                </p>
                <div class="flex flex-wrap gap-2">
                    {#each SIZES as s (s)}
                        <button class="btn btn-outline btn-sm" onclick={() => openModal(s)}>{s}</button>
                    {/each}
                    <button
                        class="btn btn-outline btn-sm"
                        onclick={() => {
                            modalBare = true;
                            modalOpen = true;
                        }}
                    >
                        hideTitle
                    </button>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <h2 class="card-title">Toast &amp; icons</h2>
                <div class="flex flex-wrap gap-2">
                    <button class="btn btn-success btn-sm" onclick={() => toast.success('Produk tersimpan')}>
                        success
                    </button>
                    <button
                        class="btn btn-error btn-sm"
                        onclick={() => toast.error('Kuota karyawan habis')}
                    >
                        error
                    </button>
                    <button
                        class="btn btn-sm"
                        onclick={() => toast('Stok minus', { description: 'Outlet Bogor · 11409B · −14' })}
                    >
                        with description
                    </button>
                </div>
                <div class="flex flex-wrap items-center gap-4 pt-2">
                    {#each ICONS as name (name)}
                        <span class="flex flex-col items-center gap-1">
                            <Icon {name} size={24} label={name} />
                            <span class="text-base-content/50 text-[10px]">{name}</span>
                        </span>
                    {/each}
                    <span class="text-primary flex items-center gap-1 text-sm">
                        <Icon name="store" size={20} /> inherits currentColor
                    </span>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow">
            <div class="card-body">
                <h2 class="card-title">Formatting &amp; hooks</h2>
                <div class="overflow-x-auto">
                    <table class="table table-sm">
                        <tbody>
                            <tr><td>rupiah(9000)</td><td class="font-medium">{rupiah(9000)}</td></tr>
                            <tr><td>qty('1.500', 'kg')</td><td class="font-medium">{qty('1.500', 'kg')}</td></tr>
                            <tr><td>qty('12.000', 'botol')</td><td class="font-medium">{qty('12.000', 'botol')}</td></tr>
                            <tr><td>signed(-5.25, 'kg')</td><td class="font-medium">{signed(-5.25, 'kg')}</td></tr>
                            <tr><td>useMediaQuery(md)</td><td class="font-medium">{isDesktop.matches}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<Drawer bind:toggle={drawerLeft} position="left" title="Filter produk">
    <p>Slides in from the left. Escape or the backdrop closes it.</p>
    {#snippet footer()}
        <div class="flex justify-end gap-2">
            <button class="btn btn-sm btn-ghost" onclick={() => (drawerLeft = false)}>Batal</button>
            <button class="btn btn-sm btn-primary" onclick={() => (drawerLeft = false)}>Terapkan</button>
        </div>
    {/snippet}
</Drawer>

<Drawer bind:toggle={drawerRight} position="right" title="Detail produk">
    <p>Slides in from the right — the default.</p>
</Drawer>

<Drawer bind:toggle={drawerNoClose} position="right" title="Tanpa tombol tutup" hideClose>
    <p>No close button in the header. Press Escape or click the backdrop.</p>
</Drawer>

<Modal
    bind:toggle={modalOpen}
    size={modalSize}
    title="Konfirmasi"
    hideTitle={modalBare}
    hideClose={false}
>
    <p>
        {#if modalBare}
            No header row — the close button floats over the content instead.
        {:else}
            Size <code class="badge badge-ghost badge-sm">{modalSize}</code>.
        {/if}
    </p>
    {#snippet footer()}
        <div class="flex justify-end gap-2">
            <button class="btn btn-sm btn-ghost" onclick={() => (modalOpen = false)}>Batal</button>
            <button
                class="btn btn-sm btn-primary"
                onclick={() => {
                    modalOpen = false;
                    toast.success('Tersimpan');
                }}
            >
                Simpan
            </button>
        </div>
    {/snippet}
</Modal>
