import { THEMES, type Theme } from '../config';

const STORAGE_KEY = 'theme';

/**
 * Theme state, shared across the app. Svelte 5 runes, so this is a `.svelte.ts`
 * file rather than a writable store.
 */
class ThemeStore {
    current = $state<Theme>('light');

    /** Call once on mount. Reads the saved choice, falling back to the OS. */
    init() {
        if (typeof window === 'undefined') return;
        let saved: string | null = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch {
            // private mode, or site data blocked — fall through to the OS setting
        }
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        this.set((saved as Theme) ?? (prefersDark ? 'dark' : 'light'));
    }

    set(theme: Theme) {
        if (!THEMES.includes(theme)) return;
        this.current = theme;
        if (typeof document === 'undefined') return;
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // not fatal — the theme still applies for this page view
        }
    }

    toggle() {
        this.set(this.current === 'light' ? 'dark' : 'light');
    }
}

export const theme = new ThemeStore();
