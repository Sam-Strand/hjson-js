/**
 * Вывод TypeScript-типа по значению, разобранному из mkon.
 *
 * Типы расширяются так же, как при `resolveJsonModule` в TypeScript:
 * `"a"` → `string`, `1` → `number`. Элементы-объекты массива сливаются
 * в один объектный тип; ключи, которых нет в части элементов,
 * становятся необязательными.
 */

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const INDENT = '    '

/** @param {unknown} value */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
        Object.prototype.toString.call(value) !== '[object Date]'
}

/** @param {string} key */
function formatKey(key) {
    return IDENTIFIER.test(key) ? key : JSON.stringify(key)
}

/**
 * Тип объекта, слитый из нескольких объектов (для элементов массива).
 *
 * @param {Record<string, unknown>[]} objects
 * @param {string} indent
 * @returns {string}
 */
function mergedObjectType(objects, indent) {
    /** @type {Map<string, unknown[]>} */
    const keys = new Map()
    for (const obj of objects) {
        for (const [key, value] of Object.entries(obj)) {
            if (!keys.has(key)) keys.set(key, [])
            keys.get(key)?.push(value)
        }
    }
    if (keys.size === 0) return '{}'

    const inner = indent + INDENT
    const lines = []
    for (const [key, values] of keys) {
        const optional = values.length < objects.length ? '?' : ''
        lines.push(`${inner}${formatKey(key)}${optional}: ${unionType(values, inner)}`)
    }
    return `{\n${lines.join('\n')}\n${indent}}`
}

/**
 * Объединение типов набора значений (без повторов).
 *
 * @param {unknown[]} values
 * @param {string} indent
 * @returns {string}
 */
function unionType(values, indent) {
    const objects = /** @type {Record<string, unknown>[]} */ (values.filter(isPlainObject))
    const others = values.filter((v) => !isPlainObject(v))

    const types = new Set(others.map((v) => typeOf(v, indent)))
    if (objects.length) types.add(mergedObjectType(objects, indent))

    const list = [...types]
    if (list.length === 0) return 'never'
    return list.join(' | ')
}

/**
 * TypeScript-тип значения.
 *
 * @param {unknown} value
 * @param {string} [indent] - текущий отступ (для многострочных объектов)
 * @returns {string}
 */
export function typeOf(value, indent = '') {
    if (value === null) return 'null'
    if (Object.prototype.toString.call(value) === '[object Date]') return 'Date'
    if (Array.isArray(value)) {
        if (value.length === 0) return 'unknown[]'
        const element = unionType(value, indent)
        return element.includes(' | ') ? `(${element})[]` : `${element}[]`
    }
    if (isPlainObject(value)) return mergedObjectType([/** @type {Record<string, unknown>} */ (value)], indent)
    switch (typeof value) {
        case 'string':
            return 'string'
        case 'number':
            return 'number'
        case 'boolean':
            return 'boolean'
        default:
            return 'unknown'
    }
}

/**
 * Содержимое файла объявления (`file.d.mkon.ts`) для импорта `file.mkon`.
 *
 * @param {unknown} value - значение, которое экспортирует модуль
 * @param {string} source - имя исходного файла (для комментария)
 * @returns {string}
 */
export function declarationFor(value, source) {
    return (
        `// Сгенерировано vite-plugin-mkon из ${source}. Не редактируйте вручную.\n` +
        `declare const value: ${typeOf(value)}\n` +
        `export default value\n`
    )
}

/**
 * Путь файла объявления для `.mkon`-файла: `a/b.mkon` → `a/b.d.mkon.ts`.
 * TypeScript находит такие файлы при `allowArbitraryExtensions: true`.
 *
 * @param {string} file
 * @returns {string}
 */
export function declarationPath(file) {
    return file.replace(/\.mkon$/, '.d.mkon.ts')
}
