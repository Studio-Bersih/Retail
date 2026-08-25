/**
 * Static configuration. Values that never change at runtime.
 *
 * Everything lives on the single `useConfig` object so a consumer imports one
 * name and reads what it needs off it — `useConfig.API_URL` says where the
 * value comes from at the call site, which a bare `API_URL` does not.
 *
 * Anything secret belongs in an environment variable, not here — this file is
 * bundled into the client.
 */
export const useConfig = {
    APP_NAME: 'Retail POS',

    /** Base URL of the backend API. Override with PUBLIC_API_URL. */
    API_URL: import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8000/api',

    /**
     * daisyUI themes declared in src/routes/layout.css. Order is meaningful:
     * index 0 is the light default, index 1 its dark counterpart, and the
     * theme store toggles between them by position rather than by name.
     */
    THEMES: ['retail', 'retail-dark'],

    /** Matches pos_satuan.is_pecahan — only these units may hold decimals. */
    FRACTIONAL_UNITS: ['kg', 'liter'],

    /** Quantities are DECIMAL(15,3) in the database. */
    QTY_DECIMALS: 3
} as const;

export type Theme = (typeof useConfig.THEMES)[number];
export type FractionalUnit = (typeof useConfig.FRACTIONAL_UNITS)[number];
