export const Messages = {
    LOGIN_SUCCESS: 'Berhasil masuk.',
    TRANSACTION_SAVED: 'Transaksi berhasil disimpan.',
    ORDER_SAVED: 'Pesanan berhasil disimpan.',
    ORDER_COMPLETED: 'Pesanan berhasil diselesaikan.',
    COUPON_APPLIED: 'Kupon berhasil diterapkan.',
    PT_SUBMITTED: 'Permintaan perbaikan berhasil dikirim.',
    PT_APPROVED: 'Perbaikan transaksi disetujui.',
    PT_REJECTED: 'Perbaikan transaksi ditolak.',
    COUPON_CREATED:        'Kupon berhasil dibuat.',
    COUPON_UPDATED:        'Kupon berhasil diperbarui.',
    COUPON_STATUS_UPDATED: 'Status kupon berhasil diubah.',
    SHIFT_OPENED: 'Shift berhasil dibuka.',
    SHIFT_CLOSED: 'Shift berhasil ditutup.',
} as const

export type MessageKey = keyof typeof Messages
