import { useConfig, type Theme } from '../config';

const STORAGE_KEY = 'theme';
const [LIGHT, DARK] = useConfig.THEMES;

/**
 * Theme state, shared across the app. Svelte 5 runes, so this is a `.svelte.ts`
 * file rather than a writable store.
 */
class ThemeStore {
    current = $state<Theme>(LIGHT);

    /** True while the dark counterpart is active. Saves callers comparing names. */
    get isDark(): boolean {
        return this.current === DARK;
    }

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
        this.set(this.parse(saved) ?? (prefersDark ? DARK : LIGHT));
    }

    set(theme: Theme) {
        if (!this.isTheme(theme)) return;
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
        this.set(this.isDark ? LIGHT : DARK);
    }

    /**
     * localStorage holds whatever was written there last — including theme
     * names from an earlier build. Anything unrecognised is discarded so the
     * caller can fall back to the OS preference.
     */
    private parse(value: string | null): Theme | null {
        return this.isTheme(value) ? value : null;
    }

    private isTheme(value: unknown): value is Theme {
        return useConfig.THEMES.includes(value as Theme);
    }
}

export const theme = new ThemeStore();
