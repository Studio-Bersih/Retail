import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword } from '../utils/password'

export async function findUserByCredentials(username: string, password: string) {
    return db.transaction(async (databaseTransaction) => {
        const [foundUser] = await databaseTransaction
            .select()
            .from(users)
            .where(eq(users.username, username))

        if (!foundUser || !foundUser.isActive) {
            return null
        }

        const isValidPassword = await verifyPassword(password, foundUser.passwordHash)
        return isValidPassword ? foundUser : null
    })
}
