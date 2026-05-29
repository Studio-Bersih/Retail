export const PAYMENT_PROVIDERS: string[] = [
    'QRIS',
    'GoPay',
    'OVO',
    'Dana',
    'ShopeePay',
    'LinkAja',
    'BCA Transfer',
    'BRI Transfer',
    'BNI Transfer',
    'Mandiri Transfer',
]

export function getPaymentProviders(): string[] {
    return PAYMENT_PROVIDERS
}
