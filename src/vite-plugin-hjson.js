import fs from 'node:fs'
import parse from './parse.js'

export default function hjson() {
    return {
        name: 'vite-plugin-hjson',
        enforce: 'pre',

        transform(code, id) {
            const [file, query = ''] = id.split('?')

            if (!file.endsWith('.hjson')) return null

            const params = new URLSearchParams(query)
            const pick = params.get('pick')

            const text = fs.readFileSync(file, 'utf8')
            const value = parse(text)

            if (pick) {
                const picked = pick
                    .split('.')
                    .reduce((o, k) => (o == null ? undefined : o[k]), value)

                if (picked === undefined) {
                    this.error(`[hjson] path "${pick}" not found in ${file}`)
                    return null
                }

                return {
                    code: `export default ${JSON.stringify(picked)};`,
                    map: null,
                }
            }

            return {
                code: `export default ${JSON.stringify(value)};`,
                map: null,
            }
        },
    }
}