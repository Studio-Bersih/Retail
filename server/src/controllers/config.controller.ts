import { getAllOutlets, getAllPaymentMethods, getAllTransactionTypes } from '../models/config.model'

export async function getOutlets() {
    return getAllOutlets()
}

export async function getPaymentMethods() {
    return getAllPaymentMethods()
}

export async function getTransactionTypes() {
    return getAllTransactionTypes()
}
