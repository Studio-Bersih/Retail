import Elysia, { status } from 'elysia'
import { MIN_CLIENT_VERSION } from '../utils/constants'
import { Errors } from '../utils/errors'

function isVersionSufficient(clientVersion: string, minimumVersion: string): boolean {
    const clientParts  = clientVersion.split('.').map(Number)
    const minimumParts = minimumVersion.split('.').map(Number)

    for (let partIndex = 0; partIndex < 3; partIndex++) {
        const clientPart  = clientParts[partIndex]  ?? 0
        const minimumPart = minimumParts[partIndex] ?? 0
        if (clientPart > minimumPart) {
            return true
        }
        if (clientPart < minimumPart) {
            return false
        }
    }
    return true
}

export const versionHook = new Elysia({ name: 'version' })
    .onBeforeHandle({ as: 'scoped' }, ({ headers }) => {
        const clientVersion = headers['x-app-version']
        if (!clientVersion) {
            return status(426, { message: Errors.CLIENT_VERSION_STALE })
        }
        if (!isVersionSufficient(clientVersion, MIN_CLIENT_VERSION)) {
            return status(426, { message: Errors.CLIENT_VERSION_STALE })
        }
    })
