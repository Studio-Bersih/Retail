export const rupiahFormatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
})

export type CarbonType =
    | 'timestamp'   // 28 Mei 2026, 14.30
    | 'datetime'    // Rabu, 28 Mei 2026 · 14:30
    | 'date'        // 28 Mei 2026
    | 'date-long'   // Rabu, 28 Mei 2026
    | 'date-short'  // 28 Mei '26
    | 'day-month'   // 28 Mei
    | 'month-year'  // Mei 2026
    | 'year'        // 2026
    | 'time'        // 14:30
    | 'time-full'   // 14:30:05

const carbonFormatters: Record<CarbonType, Intl.DateTimeFormat> = {
    timestamp:    new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    datetime:     new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    date:         new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    'date-long':  new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    'date-short': new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: '2-digit' }),
    'day-month':  new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long' }),
    'month-year': new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }),
    year:         new Intl.DateTimeFormat('id-ID', { year: 'numeric' }),
    time:         new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }),
    'time-full':  new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
}

export function Carbon(date: string | Date, type: CarbonType = 'date'): string {
    const d = typeof date === 'string' ? new Date(date) : date
    if (isNaN(d.getTime())) {
        return '-'
    }
    return carbonFormatters[type].format(d)
}

/**
 * Strips all non-digit characters from a Rupiah input and returns the numeric value.
 * "Rp 1.500.000" → 1500000  |  "" → 0
 */
export function currencySanitizer(value: string): number {
    const digits = value.replace(/[^0-9]/g, '')
    if (digits === '') {
        return 0
    }
    return parseInt(digits, 10)
}
