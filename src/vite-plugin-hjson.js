import fs from 'node:fs'
import path from 'node:path'
import parse from './parse.js'
import { declarationFor, declarationPath } from './hjson-types.js'

/** Каталоги, которые не сканируются в поисках .hjson. */
const SKIP_DIRS = new Set(['node_modules', '.git'])

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
 * Удаляет указанные пути из объекта
 *
 * @param {any} value - Исходное значение.
 * @param {string} omit - Строка с путями через запятую, например: "a.b, c.d".
 * @returns {any} Глубокая копия значения без указанных путей.
 */
function omitPaths(value, omit) {
    const paths = omit.split(',').map(s => s.trim()).filter(Boolean)

    for (const path of paths) {
        const parts = path.split('.')
        const last = parts.pop()
        const target = parts.reduce(
            (o, k) => (o == null ? undefined : o[k]),
            value,
        )
        if (target && typeof target === 'object') delete target[last]
    }
    return value
}

/**
 * Все .hjson-файлы в каталоге (рекурсивно), кроме node_modules, .git и `skip`.
 *
 * @param {string} dir
 * @param {Set<string>} skip - абсолютные пути каталогов, которые надо пропустить
 * @returns {string[]}
 */
function findHjsonFiles(dir, skip) {
    /** @type {string[]} */
    const out = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name) && !skip.has(full)) out.push(...findHjsonFiles(full, skip))
        } else if (entry.isFile() && entry.name.endsWith('.hjson')) {
            out.push(full)
        }
    }
    return out
}

/**
 * Записывает файл, только если содержимое изменилось
 * (чтобы не будить watcher'ы и не трогать mtime зря).
 *
 * @param {string} file
 * @param {string} content
 */
function writeIfChanged(file, content) {
    try {
        if (fs.readFileSync(file, 'utf8') === content) return
    } catch {
        // файла ещё нет
    }
    fs.writeFileSync(file, content)
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
 * @param {boolean} [options.dts=true]
 *        Генерировать рядом с каждым `file.hjson` объявление `file.d.hjson.ts`
 *        с типом значения (для импорта без query). В tsconfig нужен
 *        `"allowArbitraryExtensions": true`.
 */
export default function hjson(options = {}) {
    const handlers = options.handlers ?? {}
    const defaultHandler = options.default ?? null
    const dts = options.dts ?? true
    /** @type {string} */
    let root = process.cwd()
    /** @type {Set<string>} */
    let skipDirs = new Set()

    /**
     * Читает файл и применяет handler / pick / omit из query.
     *
     * @param {any} ctx - контекст плагина (нужен this.error)
     * @param {string} file
     * @param {URLSearchParams} params
     * @returns {{ value: any } | null} null — если была ошибка (уже залогирована)
     */
    function load(ctx, file, params) {
        const handlerName = params.get('as') ?? defaultHandler
        const pick = params.get('pick')
        const omit = params.get('omit')

        let value = parse(fs.readFileSync(file, 'utf8'))

        // 1) handler (если указан) — кастомная трансформация значения
        if (handlerName) {
            const handler = handlers[handlerName]
            if (!handler) {
                ctx.error(`[hjson] unknown handler "${handlerName}" in ${file}`)
                return null
            }
            value = handler(value, params, { file, ctx })
        }

        // 2) pick (если указан) — оставить только указанные пути
        if (pick) {
            const picked = pickPaths(value, pick, ctx, file)
            if (picked === null) return null
            value = picked
        }

        // 3) omit (если указан) — удалить указанные пути
        if (omit) value = omitPaths(value, omit)

        return { value }
    }

    /**
     * Пишет `file.d.hjson.ts` с типом того, что даёт импорт без query.
     *
     * @param {any} ctx
     * @param {string} file
     * @param {any} [value] - уже вычисленное значение (иначе файл читается заново)
     */
    function writeDeclaration(ctx, file, value) {
        if (!dts) return
        if (value === undefined) {
            const loaded = load(ctx, file, new URLSearchParams())
            if (!loaded) return
            value = loaded.value
        }
        writeIfChanged(declarationPath(file), declarationFor(value, path.basename(file)))
    }

    return {
        name: 'vite-plugin-hjson',
        // 'pre' — обрабатываем .hjson раньше других плагинов Vite.
        enforce: 'pre',

        /** @param {{ root: string, build: { outDir: string } }} config */
        configResolved(config) {
            root = config.root
            skipDirs = new Set([path.resolve(root, config.build.outDir)])
        },

        /**
         * Объявления нужны TypeScript до того, как Vite дойдёт до импорта
         * (проверка типов, IDE), поэтому генерируем их для всех .hjson сразу.
         */
        buildStart() {
            if (!dts) return
            for (const file of findHjsonFiles(root, skipDirs)) writeDeclaration(this, file)
        },

        /** В dev-режиме обновляем объявление при изменении .hjson. */
        configureServer(server) {
            if (!dts) return
            const ctx = { error: (/** @type {string} */ msg) => server.config.logger.error(msg) }
            /** @param {string} file */
            const update = (file) => {
                if (!file.endsWith('.hjson')) return
                try {
                    writeDeclaration(ctx, file)
                } catch (e) {
                    server.config.logger.error(`[hjson] ${file}: ${e instanceof Error ? e.message : e}`)
                }
            }
            server.watcher.on('add', update)
            server.watcher.on('change', update)
            server.watcher.on('unlink', (/** @type {string} */ file) => {
                if (file.endsWith('.hjson')) fs.rmSync(declarationPath(file), { force: true })
            })
        },

        /**
         * @param {string} code - Содержимое модуля (для .hjson не используется, читаем файл сами).
         * @param {string} id   - Идентификатор модуля, может содержать query: "/abs/path/file.hjson?as=..."
         * @returns {{code:string,map:null}|null}
         */
        transform(code, id) {
            const [file, query = ''] = id.split('?')
            if (!file.endsWith('.hjson')) return null

            const loaded = load(this, file, new URLSearchParams(query))
            if (!loaded) return null

            // импорт без query — тот, для которого пишется объявление
            if (!query) writeDeclaration(this, file, loaded.value)

            return {
                code: `export default ${JSON.stringify(loaded.value)};`,
                map: null,
            }
        },
    }
}
