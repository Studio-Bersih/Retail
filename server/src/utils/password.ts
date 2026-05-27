export async function hashPassword(plainPassword: string): Promise<string> {
    return Bun.password.hash(plainPassword, { algorithm: 'bcrypt', cost: 10 })
}

export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return Bun.password.verify(plainPassword, hashedPassword)
}
