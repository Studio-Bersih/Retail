/**
 * Reactive media query.
 *
 *   const isDesktop = useMediaQuery('(min-width: 768px)');
 *   {#if isDesktop.matches} ... {/if}
 *
 * Returns `false` during SSR, where there is no window to measure.
 */
export function useMediaQuery(query: string) {
    let matches = $state(false);

    $effect(() => {
        if (typeof window === 'undefined') return;
        const mql = window.matchMedia(query);
        matches = mql.matches;
        const onChange = (e: MediaQueryListEvent) => (matches = e.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    });

    return {
        get matches() {
            return matches;
        }
    };
}
