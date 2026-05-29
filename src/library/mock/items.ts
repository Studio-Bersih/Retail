export interface MockItem {
    id:          string
    sku:         string
    name:        string
    category:    string
    price:       number
    stock:       number
    preAdjDelta: number
}

const ITEMS: MockItem[] = [
    { id: 'I001', sku: 'SKU-001', name: 'Sabun Cuci Muka Premium',   category: 'Perawatan Wajah', price: 75000,  stock: 48, preAdjDelta:  5 },
    { id: 'I002', sku: 'SKU-002', name: 'Pelembab Wajah SPF 30',     category: 'Perawatan Wajah', price: 25000,  stock:  7, preAdjDelta: -2 },
    { id: 'I003', sku: 'SKU-003', name: 'Serum Vitamin C 30ml',      category: 'Perawatan Wajah', price: 150000, stock:  2, preAdjDelta:  0 },
    { id: 'I004', sku: 'SKU-004', name: 'Toner Niacinamide 200ml',   category: 'Perawatan Wajah', price: 89000,  stock: 23, preAdjDelta:  0 },
    { id: 'I005', sku: 'SKU-005', name: 'Sunscreen SPF 50 PA+++',    category: 'Perawatan Wajah', price: 120000, stock: 15, preAdjDelta:  3 },
    { id: 'I006', sku: 'SKU-006', name: 'Eye Cream Anti Aging',      category: 'Perawatan Wajah', price: 200000, stock:  4, preAdjDelta:  0 },
    { id: 'I007', sku: 'SKU-007', name: 'Sabun Cuci Tangan 200ml',   category: 'Perawatan Tubuh', price: 25000,  stock: 32, preAdjDelta:  0 },
    { id: 'I008', sku: 'SKU-008', name: 'Sabun Cuci Tangan 500ml',   category: 'Perawatan Tubuh', price: 45000,  stock: 15, preAdjDelta:  0 },
    { id: 'I009', sku: 'SKU-009', name: 'Body Lotion Brightening',   category: 'Perawatan Tubuh', price: 65000,  stock: 20, preAdjDelta: -1 },
    { id: 'I010', sku: 'SKU-010', name: 'Deodorant Roll-On 50ml',    category: 'Perawatan Tubuh', price: 35000,  stock: 40, preAdjDelta:  0 },
    { id: 'I011', sku: 'SKU-011', name: 'Shampoo Anti Dandruff',     category: 'Perawatan Rambut', price: 55000,  stock: 18, preAdjDelta:  2 },
    { id: 'I012', sku: 'SKU-012', name: 'Kondisioner Rambut 300ml',  category: 'Perawatan Rambut', price: 45000,  stock: 12, preAdjDelta:  0 },
    { id: 'I013', sku: 'SKU-013', name: 'Hair Serum Anti Frizz',     category: 'Perawatan Rambut', price: 95000,  stock:  3, preAdjDelta:  0 },
    { id: 'I014', sku: 'SKU-014', name: 'Masker Rambut 200ml',       category: 'Perawatan Rambut', price: 70000,  stock: 25, preAdjDelta:  0 },
    { id: 'I015', sku: 'SKU-015', name: 'Lip Balm SPF 15',           category: 'Perawatan Bibir', price: 30000,  stock: 60, preAdjDelta:  0 },
    { id: 'I016', sku: 'SKU-016', name: 'Pelindung Bibir Beeswax',   category: 'Perawatan Bibir', price: 25000,  stock: 35, preAdjDelta:  0 },
    { id: 'I017', sku: 'SKU-017', name: 'Micellar Water 250ml',      category: 'Pembersih',       price: 60000,  stock: 22, preAdjDelta:  1 },
    { id: 'I018', sku: 'SKU-018', name: 'Foam Cleanser Gentle',      category: 'Pembersih',       price: 80000,  stock:  5, preAdjDelta:  0 },
    { id: 'I019', sku: 'SKU-019', name: 'Makeup Remover Wipes 25s',  category: 'Pembersih',       price: 40000,  stock: 50, preAdjDelta:  0 },
    { id: 'I020', sku: 'SKU-020', name: 'Essence Brightening 100ml', category: 'Perawatan Wajah', price: 180000, stock:  8, preAdjDelta: -3 },
]

export function searchItems(query: string): MockItem[] {
    const q = query.toLowerCase().trim()
    if (!q) {
        return []
    }
    return ITEMS.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
    )
}

export function getItemBySku(sku: string): MockItem | undefined {
    return ITEMS.find(i => i.sku.toLowerCase() === sku.toLowerCase())
}
