import fs from 'node:fs'
import parse from './parse.js'

/**
 * Выбирает значения по списку путей из объекта.
 *
 * @param {any} value - Исходное значение (объект/массив/примитив).
 * @param {string} pick - Строка с путями через запятую, например: "a.b, c.d".
 * @param {object} ctx - Контекст Vite (this внутри transform), нужен для this.error.
 * @param {string} file - Путь к файлу (для сообщений об ошибках).
 * @returns {any|null} Значение (если путь один) или объект { "a.b": ..., "c.d": ... }.
 *                     null — если хотя бы один путь не найден (ошибка уже залогирована).
 */
function pickPaths(value, pick, ctx, file) {
    // "a.b, c.d" -> ["a.b", "c.d"]
    const paths = pick.split(',').map(s => s.trim()).filter(Boolean)
    const out = {}

    for (const path of paths) {
        // Проходим по вложенным ключам: "a.b.c" -> value.a.b.c
        const v = path
            .split('.')
            .reduce((o, k) => (o == null ? undefined : o[k]), value)

        if (v === undefined) {
            ctx.error(`[hjson] path "${path}" not found in ${file}`)
            return null
        }
        out[path] = v
    }

    if (paths.length === 1) return out[paths[0]]

    return out
}

/**
 * Удаляет указанные пути из объекта (не мутируя оригинал).
 *
 * @param {any} value - Исходное значение.
 * @param {string} omit - Строка с путями через запятую, например: "a.b, c.d".
 * @param {object} ctx - Контекст Vite (не используется, оставлен для единообразия).
 * @param {string} file - Путь к файлу (не используется, оставлен для единообразия).
 * @returns {any} Глубокая копия значения без указанных путей.
 */
function omitPaths(value, omit, ctx, file) {
    const paths = omit.split(',').map(s => s.trim()).filter(Boolean)
    // Глубокая копия через JSON — дёшево и достаточно для данных из HJSON.
    const cloned = JSON.parse(JSON.stringify(value))

    for (const path of paths) {
        const parts = path.split('.')
        const last = parts.pop()                 // последний ключ, который удаляем
        const target = parts.reduce(          // доходим до родителя
            (o, k) => (o == null ? undefined : o[k]),
            cloned,
        )
        if (target && typeof target === 'object') delete target[last]
    }
    return cloned
}

/**
 * Vite-плагин для импорта .hjson файлов.
 *
 * Поддерживает query-параметры в import-пути:
 *   import data from './file.hjson?as=config&pick=a.b,c&omit=d'
 *
 * - `as=<name>`   — применить один из handlers (см. options.handlers)
 * - `pick=a.b,c`  — оставить только указанные пути
 * - `omit=a.b,c`  — исключить указанные пути
 *
 * @param {object} [options]
 * @param {Record<string, (value:any, params:URLSearchParams, ctx:{file:string, ctx:any}) => any>} [options.handlers]
 *        Именованные обработчики значения до применения pick/omit.
 * @param {string|null} [options.default]
 *        Имя handler'а по умолчанию, если в import не указан `?as=...`.
 */
export default function hjson(options = {}) {
    const handlers = options.handlers ?? {}
    const defaultHandler = options.default ?? null

    return {
        name: 'vite-plugin-hjson',
        // 'pre' — обрабатываем .hjson раньше других плагинов Vite.
        enforce: 'pre',

        /**
         * @param {string} code - Содержимое модуля (для .hjson не используется, читаем файл сами).
         * @param {string} id   - Идентификатор модуля, может содержать query: "/abs/path/file.hjson?as=..."
         * @returns {{code:string,map:null}|null}
         */
        transform(code, id) {
            const [file, query = ''] = id.split('?')
            if (!file.endsWith('.hjson')) return null

            const params = new URLSearchParams(query)
            const handlerName = params.get('as') ?? defaultHandler
            const pick = params.get('pick')
            const omit = params.get('omit')

            const text = fs.readFileSync(file, 'utf8')
            let value = parse(text)

            // 1) handler (если указан) — кастомная трансформация значения
            if (handlerName) {
                const handler = handlers[handlerName]
                if (!handler) {
                    this.error(`[hjson] unknown handler "${handlerName}" in ${file}`)
                    return null
                }
                value = handler(value, params, { file, ctx: this })
            }

            // 2) pick (если указан) — оставить только указанные пути
            if (pick) {
                const picked = pickPaths(value, pick, this, file)
                if (picked === null) return null
                value = picked
            }

            // 3) omit (если указан) — удалить указанные пути
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
