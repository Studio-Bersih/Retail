import type { AuthSession } from '$library/stores/auth'

type MockUser = AuthSession & { username: string; password: string }

const MOCK_USERS: MockUser[] = [
    { username: 'admin',   password: 'admin123',   userId: 'U001', userName: 'Admin Pusat',   nip: '001', role: 'admin',   outletId: 'O001', outletName: 'Outlet Utama' },
    { username: 'manager', password: 'manager123', userId: 'U002', userName: 'Budi Santoso',  nip: '002', role: 'manager', outletId: 'O001', outletName: 'Outlet Utama' },
    { username: 'kasir1',  password: 'kasir123',   userId: 'U003', userName: 'Rina Maharani', nip: '003', role: 'cashier', outletId: 'O001', outletName: 'Outlet Utama' },
    { username: 'kasir2',  password: 'kasir123',   userId: 'U004', userName: 'Doni Pratama',  nip: '004', role: 'cashier', outletId: 'O002', outletName: 'Outlet Cabang' }
]

export function login(username: string, password: string): AuthSession {
    const user = MOCK_USERS.find(u => u.username === username && u.password === password)
    if (!user) {
        throw new Error('useNotice.connection.unauthorized')
    }
    const { password: _p, username: _u, ...session } = user
    return { ...session, token: '' }
}
