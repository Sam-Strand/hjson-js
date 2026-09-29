import { EOL } from './common.js'

/**
 * Входные опции `stringify()` (то, что пользователь передаёт в `opt`).
 * Все поля опциональны.
 *
 * @typedef {object} StringifyInputOptions
 * @property {'\n' | '\r\n'} [eol] Символ конца строки. По умолчанию `EOL`.
 * @property {number | string} [space]          Отступ: число пробелов или готовая строка. По умолчанию `'  '`.
 * @property {boolean} [bracesSameLine]         `{`/`[` на одной строке с ключом. По умолчанию `false`.
 * @property {boolean} [emitRootBraces]         Оборачивать корень в `{}`. По умолчанию `true`.
 * @property {boolean} [separator]              Добавлять запятые. По умолчанию `false`.
 * @property {boolean} [keepWsc]                Хранить комментарии/whitespace. По умолчанию `false`.
 * @property {'min' | 'keys' | 'strings' | 'all'} [quotes]  Режим кавычек. По умолчанию `'min'`.
 * @property {'"' | "'"} [quoteChar]            Символ кавычек. По умолчанию `'"'`.
 * @property {number} [condense]                Порог схлопывания. По умолчанию `0` (выкл.).
 * @property {'std' | 'no-tabs' | 'off'} [multiline]  Режим multiline-строк. По умолчанию `'std'`.
 * @property {object | null} [dsf]              Domain Specific Formats. По умолчанию `null`.
 * @property {boolean} [sortProps]              Сортировать ключи. По умолчанию `false`.
 * @property {boolean} [colors]                 ANSI-раскраска. По умолчанию `false`.
 */

/**
 * Нормализованные настройки, которые возвращает `normalizeOptions()`.
 * Все поля обязательны.
 *
 * @typedef {object} StringifyOptions
 * @property {'\n' | '\r\n'} eol
 * @property {string} indent
 * @property {boolean} keepComments
 * @property {boolean} bracesSameLine
 * @property {boolean} emitRootBraces
 * @property {boolean} quoteKeys
 * @property {boolean} quoteStrings
 * @property {'"' | "'"} quoteChar
 * @property {number} condense
 * @property {0 | 1 | 2} multiline
 * @property {'' | ','} separator
 * @property {object | null} dsf
 * @property {boolean} sortProps
 * @property {boolean} colors
 */

/**
 * Приводит пользовательские опции к нормальному виду.
 * Никаких `=== undefined` снаружи — только здесь.
 *
 * @param {StringifyInputOptions} [opt]
 * @returns {StringifyOptions}
 */
export function normalizeOptions(opt) {
    const o = opt && typeof opt === 'object' ? opt : {}

    // --- quotes: 'min' | 'keys' | 'strings' | 'all' 
    let quotes = o.quotes
    switch (quotes) {
        case 'all':
        case 'keys':
        case 'strings':
            break
        default:
            quotes = 'min'
    }

    // --- quoteChar
    let quoteChar = '"'
    switch (o.quoteChar) {
        case "'":
        case '"':
            quoteChar = o.quoteChar
            break
        default:
            quoteChar = '"'
    }

    // --- multiline: 'std' | 'no-tabs' | 'off'
    let multiline
    switch (o.multiline) {
        case 'off':
            multiline = 0
            break
        case 'no-tabs':
            multiline = 2
            break
        default:
            multiline = 1
    }

    // --- eol
    let eol = EOL
    switch (o.eol) {
        case '\n':
        case '\r\n':
            eol = o.eol
            break
        default:
            eol = EOL
    }

    // --- indent
    let indent = '  '
    switch (typeof o.space) {
        case 'number':
            indent = new Array(Math.max(0, o.space | 0) + 1).join(' ')
            break
        case 'string':
            indent = o.space
            break
        default:
            indent = '  '
    }

    // --- флаги
    const separatorOn = o.separator === true
    const quoteStrings = quotes === 'all' || quotes === 'strings' || separatorOn
    const quoteKeys = quotes === 'all' || quotes === 'keys'

    // multiline выключается, если строки всё равно в кавычках или явно off
    if (quoteStrings || multiline === 0) multiline = 0

    return {
        eol,
        indent,
        keepComments: o.keepWsc === true,
        bracesSameLine: o.bracesSameLine === true,
        emitRootBraces: o.emitRootBraces !== false,
        quoteKeys,
        quoteStrings,
        quoteChar,
        condense: o.condense || 0,
        multiline,
        separator: separatorOn ? ',' : '',
        dsf: o.dsf || null,
        sortProps: o.sortProps === true,
        colors: o.colors === true,
    }
}
