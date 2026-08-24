<script lang="ts">
    import { portal } from 'svelte-portal';
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';

    type Props = {
        /** heading shown in the drawer header */
        title?: string;
        /** which edge it slides in from */
        position?: 'left' | 'right';
        /** open state — bind to it: <Drawer bind:toggle={open}> */
        toggle?: boolean;
        /** hide the header close button. Escape and the backdrop still close it. */
        hideClose?: boolean;
        /** optional footer, e.g. Save / Cancel */
        footer?: Snippet;
        children?: Snippet;
    };

    let {
        title = '',
        position = 'right',
        toggle = $bindable(false),
        hideClose = false,
        footer,
        children
    }: Props = $props();

    function close() {
        toggle = false;
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') close();
    }

    // The drawer is fixed to the viewport, so a scrolling page behind it reads as
    // broken. Locking <body> while it is open is the least surprising fix.
    $effect(() => {
        if (!toggle) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    });
</script>

<svelte:window {onkeydown} />

{#if toggle}
    <div use:portal={'body'}>
        <!-- backdrop -->
        <div
            class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            role="button"
            tabindex="-1"
            aria-label="Tutup"
            onclick={close}
            onkeydown={(e) => e.key === 'Enter' && close()}
        ></div>

        <div
            class="bg-base-100 fixed inset-y-0 z-50 flex w-full max-w-md flex-col shadow-xl
            {position === 'left' ? 'left-0 slide-left' : 'right-0 slide-right'}"
            role="dialog"
            aria-modal="true"
            aria-label={title || 'Drawer'}
        >
            {#if title || !hideClose}
                <header class="border-base-300 flex items-center justify-between border-b px-5 py-4">
                    <h2 class="text-lg font-semibold">{title}</h2>
                    {#if !hideClose}
                        <button class="btn btn-sm btn-ghost btn-circle" onclick={close} aria-label="Tutup">
                            <Icon name="close" size={18} />
                        </button>
                    {/if}
                </header>
            {/if}

            <div class="flex-1 overflow-y-auto px-5 py-4">
                {@render children?.()}
            </div>

            {#if footer}
                <footer class="border-base-300 border-t px-5 py-4">
                    {@render footer()}
                </footer>
            {/if}
        </div>
    </div>
{/if}

<style>
    /* Keyframes, not a transition on a class, so the drawer animates on mount
    without a flash of the un-transformed position. */
    .slide-right {
        animation: slide-in-right 0.22s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .slide-left {
        animation: slide-in-left 0.22s cubic-bezier(0.32, 0.72, 0, 1);
    }
    @keyframes slide-in-right {
        from {
            transform: translateX(100%);
        }
    }
    @keyframes slide-in-left {
        from {
            transform: translateX(-100%);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .slide-right,
        .slide-left {
            animation: none;
        }
    }
</style>
