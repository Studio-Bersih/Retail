export type UserRole = 'cashier' | 'manager' | 'admin'

export interface JwtSession {
    userId: string
    userName: string
    role: UserRole
    outletId: string
}

export interface PaginationParams {
    page: number
    limit: number
}

export interface PaginatedResponse<RowData> {
    data: RowData[]
    meta: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
}
