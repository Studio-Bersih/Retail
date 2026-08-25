import { useConfig } from '../config';

const RUPIAH = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
});

/** 9000 -> "Rp 9.000" */
export function rupiah(value: number | string): string {
    return RUPIAH.format(Number(value));
}

/**
 * Quantities arrive from the API as DECIMAL(15,3) strings, e.g. "1.500".
 * Show what a person would write: "1,5" — not "1.500", which reads as one
 * thousand five hundred to an Indonesian reader.
 */
export function qty(value: number | string, unit?: string): string {
    const n = Number(value);
    const text = new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: useConfig.QTY_DECIMALS
    }).format(n);
    return unit ? `${text} ${unit}` : text;
}

/** "2026-08-24T14:23:00" -> "24 Agu 2026, 14.23" */
export function dateTime(value: string | Date): string {
    const d = typeof value === 'string' ? new Date(value) : value;
    return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(d);
}

/** Signed quantity, the way the stock ledger reads: "+12", "-1,5". */
export function signed(value: number | string, unit?: string): string {
    const n = Number(value);
    return (n > 0 ? '+' : '') + qty(n, unit);
}
