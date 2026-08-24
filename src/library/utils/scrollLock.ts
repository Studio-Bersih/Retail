/**
 * Reference-counted body scroll lock.
 *
 * Every overlay that covers the viewport wants `<body>` to stop scrolling
 * behind it, and overlays stack — a Modal opened from inside a Drawer is
 * normal. The naive version, where each component snapshots
 * `body.style.overflow` and restores it on close, breaks in exactly that case:
 * the second overlay snapshots the value the FIRST one already set
 * ("hidden"), and restores it on close. The page then never scrolls again.
 *
 * Counting instead means only the first lock stores the original value and
 * only the last release puts it back.
 *
 *     $effect(() => {
 *         if (!open) return;
 *         return lockScroll();   // the returned function is the cleanup
 *     });
 */

let depth = 0;
let original = '';

export function lockScroll(): () => void {
    if (typeof document === 'undefined') return () => {};

    if (depth === 0) {
        original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }
    depth += 1;

    let released = false;
    return () => {
        // Guard against a double release — Svelte can run a cleanup more than
        // once during HMR, and that would decrement the count too far.
        if (released) return;
        released = true;

        depth = Math.max(0, depth - 1);
        if (depth === 0) {
            document.body.style.overflow = original;
        }
    };
}

/** How many overlays currently hold the lock. Exposed for tests. */
export function scrollLockDepth(): number {
    return depth;
}
