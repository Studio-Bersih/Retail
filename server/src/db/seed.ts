import { db } from './index'
import { outlets, users, paymentMethods, transactionTypes } from './schema'
import { hashPassword } from '../utils/password'

async function seed(): Promise<void> {
    console.log('Seeding database...')

    const [mainOutlet] = await db.insert(outlets).values({
        name:     'Outlet Utama',
        location: 'Jakarta',
        phone:    '021-1234567',
        isActive: true
    }).returning()

    const [secondOutlet] = await db.insert(outlets).values({
        name:     'Outlet Cabang',
        location: 'Bandung',
        phone:    '022-7654321',
        isActive: true
    }).returning()

    const adminPasswordHash   = await hashPassword('admin123')
    const managerPasswordHash = await hashPassword('manager123')
    const cashierPasswordHash = await hashPassword('kasir123')

    await db.insert(users).values([
        {
            username:     'admin',
            passwordHash: adminPasswordHash,
            name:         'Admin Pusat',
            role:         'admin',
            outletId:     mainOutlet.id,
            isActive:     true
        },
        {
            username:     'manager',
            passwordHash: managerPasswordHash,
            name:         'Budi Santoso',
            role:         'manager',
            outletId:     mainOutlet.id,
            isActive:     true
        },
        {
            username:     'kasir1',
            passwordHash: cashierPasswordHash,
            name:         'Rina Maharani',
            role:         'cashier',
            outletId:     mainOutlet.id,
            isActive:     true
        },
        {
            username:     'kasir2',
            passwordHash: cashierPasswordHash,
            name:         'Doni Pratama',
            role:         'cashier',
            outletId:     secondOutlet.id,
            isActive:     true
        }
    ])

    await db.insert(paymentMethods).values([
        { name: 'Tunai',         type: 'cash',     isActive: true },
        { name: 'QRIS',          type: 'qris',     isActive: true },
        { name: 'Transfer Bank', type: 'transfer', isActive: true },
        { name: 'Kartu Debit',   type: 'debit',    isActive: true }
    ])

    await db.insert(transactionTypes).values([
        { name: 'Retail',  code: 'retail' },
        { name: 'Pesanan', code: 'order' }
    ])

    console.log('Seeding complete.')
    process.exit(0)
}

seed().catch((caughtError) => {
    console.error('Seed failed:', caughtError)
    process.exit(1)
})
