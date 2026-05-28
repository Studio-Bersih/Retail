import { writable } from 'svelte/store'

export const mode = writable<'retail' | 'order'>('retail')
