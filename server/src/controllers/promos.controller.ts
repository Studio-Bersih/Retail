import { getActivePromos } from '../models/promos.model'

export async function getPromosHandler() {
    return getActivePromos()
}
