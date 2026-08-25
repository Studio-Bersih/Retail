<script lang="ts">
    import { portal } from 'svelte-portal';
    import type { Snippet } from 'svelte';
    import Icon from './Icon.svelte';
    import { lockScroll } from '$lib/utils/scrollLock';

    export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

    type Props = {
        /** width of the dialog */
        size?: ModalSize;
        /** heading text */
        title?: string;
        /** hide the whole header row, title and close button together */
        hideTitle?: boolean;
        /** hide only the close button, keeping the title */
        hideClose?: boolean;
        /** open state — bind to it: <Modal bind:toggle={open}> */
        toggle?: boolean;
        /** optional footer, e.g. Save / Cancel */
        footer?: Snippet;
        children?: Snippet;
    };

    let {
        size = 'md',
        title = '',
        hideTitle = false,
        hideClose = false,
        toggle = $bindable(false),
        footer,
        children
    }: Props = $props();

    const WIDTHS: Record<ModalSize, string> = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
        full: 'max-w-[95vw]'
    };

    function close() {
        toggle = false;
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') close();
    }

    // Reference-counted, so a Modal opened from inside a Drawer does not leave
    // <body> stuck at overflow:hidden when it closes.
    $effect(() => {
        if (!toggle) return;
        return lockScroll();
    });
</script>

<svelte:window {onkeydown} />

{#if toggle}
    <div use:portal={'body'}>
        <div
            class="bg-scrim fixed inset-0 z-40 backdrop-blur-[2px]"
            role="button"
            tabindex="-1"
            aria-label="Tutup"
            onclick={close}
            onkeydown={(e) => e.key === 'Enter' && close()}
        ></div>

        <div class="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
            <div
                class="bg-base-100 border-base-300 shadow-warm-lg pointer-events-auto relative flex
                max-h-[90vh] w-full flex-col rounded-[var(--radius-box)] border
                {WIDTHS[size]} modal-pop"
                role="dialog"
                aria-modal="true"
                aria-label={title || 'Dialog'}
            >
                {#if !hideTitle}
                    <header class="border-base-300 bg-wash flex items-center justify-between border-b px-5 py-4">
                        <h2 class="text-lg font-semibold">{title}</h2>
                        {#if !hideClose}
                            <button class="btn btn-sm btn-ghost btn-circle" onclick={close} aria-label="Tutup">
                                <Icon name="close" size={18} />
                            </button>
                        {/if}
                    </header>
                {:else if !hideClose}
                    <!-- no header, but the close button still needs somewhere to live -->
                    <button
                        class="btn btn-sm btn-ghost btn-circle absolute top-2 right-2"
                        onclick={close}
                        aria-label="Tutup"
                    >
                        <Icon name="close" size={18} />
                    </button>
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
    </div>
{/if}

<style>
    .modal-pop {
        animation: modal-pop 0.16s cubic-bezier(0.32, 0.72, 0, 1);
    }
    @keyframes modal-pop {
        from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .modal-pop {
            animation: none;
        }
    }
</style>
