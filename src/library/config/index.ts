/**
 * Static configuration. Values that never change at runtime.
 *
 * Anything secret belongs in an environment variable, not here — this file is
 * bundled into the client.
 */

export const APP_NAME = 'Retail POS';

/** Base URL of the backend API. Override with PUBLIC_API_URL. */
export const API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8000/api';

/** daisyUI themes declared in src/routes/layout.css. */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Matches pos_satuan.is_pecahan — only these units may hold decimals. */
export const FRACTIONAL_UNITS = ['kg', 'liter'] as const;

/** Quantities are DECIMAL(15,3) in the database. */
export const QTY_DECIMALS = 3;
