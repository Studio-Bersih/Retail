const REQUIRED_ENV_VARS = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'PORT',
] as const

export function validateEnv(): void {
    const missingVars = REQUIRED_ENV_VARS.filter(envVarName => !process.env[envVarName])
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
    }
}
