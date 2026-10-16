import fs from 'node:fs'
import parse from './parse.js'
console.log('[hjson plugin] module loaded')
function pickPaths(value, pick, ctx, file) {
    const paths = pick.split(',').map(s => s.trim()).filter(Boolean)
    const out = {}

    for (const path of paths) {
        const v = path
            .split('.')
            .reduce((o, k) => (o == null ? undefined : o[k]), value)

        if (v === undefined) {
            ctx.error(`[hjson] path "${path}" not found in ${file}`)
            return null
        }
        out[path] = v
    }

    // один путь — отдаём значение, не оборачивая
    if (paths.length === 1) return out[paths[0]]

    // несколько — объект { "a.b": ..., "c.d": ... }
    return out
}

function omitPaths(value, omit, ctx, file) {
    const paths = omit.split(',').map(s => s.trim()).filter(Boolean)
    const cloned = JSON.parse(JSON.stringify(value))

    for (const path of paths) {
        const parts = path.split('.')
        const last = parts.pop()
        const target = parts.reduce((o, k) => (o == null ? undefined : o[k]), cloned)
        if (target && typeof target === 'object') delete target[last]
    }
    return cloned
}

export default function hjson(options = {}) {
    const handlers = options.handlers ?? {}
    const defaultHandler = options.default ?? null

    return {
        name: 'vite-plugin-hjson',
        enforce: 'pre',

        transform(code, id) {
            console.log(handlers)
            const [file, query = ''] = id.split('?')
            if (!file.endsWith('.hjson')) return null

            const params = new URLSearchParams(query)
            const handlerName = params.get('as') ?? defaultHandler
            const pick = params.get('pick')
            const omit = params.get('omit')

            const text = fs.readFileSync(file, 'utf8')
            let value = parse(text)

            // 1) handler (если указан)
            if (handlerName) {
                const handler = handlers[handlerName]
                if (!handler) {
                    this.error(`[hjson] unknown handler "${handlerName}" in ${file}`)
                    return null
                }
                value = handler(value, params, { file, ctx: this })
            }

            // 2) pick (если указан)
            if (pick) {
                const picked = pickPaths(value, pick, this, file)
                if (picked === null) return null
                value = picked
            }

            // 3) omit (если указан)
            if (omit) {
                value = omitPaths(value, omit, this, file)
            }

            return {
                code: `export default ${JSON.stringify(value)};`,
                map: null,
            }
        },
    }
}