import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir   = path.resolve(__dirname, '..')
const srcDir    = path.join(rootDir, 'node_modules', 'lucide-static', 'icons')
const outDir    = path.join(rootDir, 'static', 'icons')

const ICONS = [
    'menu', 'x', 'shopping-bag', 'clipboard', 'grid-2x2',
    'clock', 'bar-chart-2', 'package', 'sliders-horizontal',
    'settings', 'log-out', 'sun', 'moon', 'plus',
    'chevron-left', 'chevron-right', 'search', 'tag',
    'user', 'wallet', 'printer', 'trash-2', 'pencil', 'eye'
]

fs.mkdirSync(outDir, { recursive: true })

let copied = 0
const missing = []

for (const name of ICONS) {
    const src = path.join(srcDir, `${name}.svg`)
    const dst = path.join(outDir, `${name}.svg`)
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst)
        copied++
    } else {
        missing.push(name)
    }
}

console.log(`Copied ${copied}/${ICONS.length} icons to static/icons/`)
if (missing.length) console.warn('Missing icons:', missing.join(', '))
