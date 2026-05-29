export interface MockMember {
    id:        string
    name:      string
    phone:     string
    isPremium: boolean
}

const MEMBERS: MockMember[] = [
    { id: 'MBR-00101', name: 'Sari Rahayu',       phone: '081234567890', isPremium: true  },
    { id: 'MBR-00102', name: 'Budi Santoso',       phone: '081298765432', isPremium: false },
    { id: 'MBR-00103', name: 'Lena Permata',       phone: '082112345678', isPremium: true  },
    { id: 'MBR-00104', name: 'Dewi Anggraini',     phone: '083187654321', isPremium: false },
    { id: 'MBR-00105', name: 'Rudi Hartono',       phone: '085612341234', isPremium: false },
    { id: 'MBR-00106', name: 'Fitri Handayani',    phone: '087711223344', isPremium: true  },
    { id: 'MBR-00107', name: 'Ahmad Fauzi',        phone: '089955667788', isPremium: false },
    { id: 'MBR-00108', name: 'Ningsih Wulandari',  phone: '081312345678', isPremium: false },
    { id: 'MBR-00109', name: 'Hendra Gunawan',     phone: '082387654321', isPremium: true  },
    { id: 'MBR-00110', name: 'Maya Kusuma',        phone: '085699887766', isPremium: false },
]

export function searchMembers(query: string): MockMember[] {
    const q = query.toLowerCase().trim()
    if (!q) {
        return []
    }
    return MEMBERS.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.phone.includes(q)
    )
}

export function getMemberById(id: string): MockMember | undefined {
    return MEMBERS.find(m => m.id.toLowerCase() === id.toLowerCase())
}

export function getMemberByPhone(phone: string): MockMember | undefined {
    const normalized = phone.replace(/\D/g, '')
    return MEMBERS.find(m => m.phone.replace(/\D/g, '') === normalized)
}
