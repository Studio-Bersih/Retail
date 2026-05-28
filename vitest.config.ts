import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
    resolve: {
        alias: {
            $library: resolve('./src/library')
        }
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.test.ts']
    }
})
