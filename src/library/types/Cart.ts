export interface CartItem {
    id:          string
    name:        string
    sku:         string
    price:       number
    qty:         number
    isFree:      boolean
    stock:       number
    preAdjDelta: number
}

export interface CartState {
    items:           CartItem[]
    memberId:        string | null
    memberName:      string | null
    memberPhone:     string | null
    isPremiumMember: boolean
    percentDiscount: number
    fixedDiscount:   number
    additionalCosts: { packaging: number; transport: number; modification: number }
    paymentMethods:  Array<{ method: string; amount: number }>
    kategoriAcara:   string
    notes:           string
}
