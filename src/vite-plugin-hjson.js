import fs from 'node:fs'
import parse from './parse.js'

export default function hjson() {
    return {
        name: 'vite-plugin-hjson',
        enforce: 'pre',
        transform(code, id) {
            if (!id.endsWith('.hjson')) return null
            const text = fs.readFileSync(id, 'utf8')
            const value = parse(text)
            return {
                code: `export default ${JSON.stringify(value)};`,
                map: null,
            }
        },
    }
}
