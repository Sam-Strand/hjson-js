/**
 * @typedef {object} DsfExtension
 * @property {string} name Имя расширения.
 * @property {(value: *) => *} parse Преобразует строковое значение в JS-значение.
 * @property {(value: *) => string|undefined} stringify Преобразует JS-значение в строку.
 */

/**
 * Загружает DSF-расширения для указанной операции.
 *
 * @param {DsfExtension[]|undefined|null} extensions Расширения.
 * @param {'parse'|'stringify'} type Операция.
 * @returns {(value: *) => *} Обработчик DSF.
 */
export function loadDsf(extensions, type) {
    if (!Array.isArray(extensions)) {
        if (extensions) {
            throw new Error('dsf option must contain an array!')
        }

        return nopDsf
    }

    if (extensions.length === 0) return nopDsf

    const handlers = extensions.map(extension => {
        if (
            !extension.name ||
            typeof extension.parse !== 'function' ||
            typeof extension.stringify !== 'function'
        ) {
            throw new Error('extension does not match the DSF interface')
        }

        return (...args) => {
            try {
                if (type === 'parse') {
                    return extension.parse(...args)
                }

                if (type === 'stringify') {
                    const result = extension.stringify(...args)

                    if (
                        result !== undefined &&
                        (
                            typeof result !== 'string' ||
                            result.length === 0 ||
                            result[0] === '"' ||
                            [...result].some(isInvalidDsfChar)
                        )
                    ) {
                        throw new Error(
                            'value may not be empty, start with a quote or contain a punctuator character except colon: ' +
                            result
                        )
                    }

                    return result
                }

                throw new Error('Invalid type')
            } catch (error) {
                throw new Error(
                    `DSF-${extension.name} failed; ${error.message}`
                )
            }
        }
    })

    return value => runDsf(handlers, value)
}

/**
 * Последовательно запускает обработчики DSF.
 *
 * @param {Function[]} handlers Обработчики DSF.
 * @param {*} value Значение.
 * @returns {*} Результат первого обработчика, вернувшего значение.
 */
function runDsf(handlers, value) {
    for (const handler of handlers) {
        const result = handler(value)

        if (result !== undefined) return result
    }
}

/**
 * Пустой обработчик DSF.
 *
 * @returns {undefined}
 */
function nopDsf() {}

/**
 * Проверяет символ, запрещённый внутри DSF-значения.
 *
 * @param {string} char Символ.
 * @returns {boolean} Признак недопустимого символа.
 */
function isInvalidDsfChar(char) {
    return (
        char === '{' ||
        char === '}' ||
        char === '[' ||
        char === ']' ||
        char === ','
    )
}

/**
 * Создаёт расширение для специальных числовых значений.
 *
 * @returns {DsfExtension} Расширение `math`.
 */
function math() {
    return {
        name: 'math',

        parse(value) {
            switch (value) {
                case '+inf':
                case 'inf':
                case '+Inf':
                case 'Inf':
                    return Infinity

                case '-inf':
                case '-Inf':
                    return -Infinity

                case 'nan':
                case 'NaN':
                    return NaN
            }
        },

        stringify(value) {
            if (typeof value !== 'number') return
            if (1 / value === -Infinity) return '-0'
            if (value === Infinity) return 'Inf'
            if (value === -Infinity) return '-Inf'
            if (Number.isNaN(value)) return 'NaN'
        }
    }
}

math.description = 'support for Inf/inf, -Inf/-inf, Nan/naN and -0'

/**
 * Создаёт расширение для шестнадцатеричных чисел.
 *
 * @param {object} [options] Настройки расширения.
 * @param {boolean} [options.out] Использовать шестнадцатеричную запись при сериализации.
 * @returns {DsfExtension} Расширение `hex`.
 */
function hex(options = {}) {
    return {
        name: 'hex',

        parse(value) {
            if (/^0x[0-9A-Fa-f]+$/.test(value)) {
                return Number.parseInt(value, 16)
            }
        },

        stringify(value) {
            if (options.out && Number.isInteger(value)) {
                return '0x' + value.toString(16)
            }
        }
    }
}

hex.description = 'parse hexadecimal numbers prefixed with 0x'

/**
 * Создаёт расширение для дат в формате ISO.
 *
 * @returns {DsfExtension} Расширение `date`.
 */
function date() {
    return {
        name: 'date',

        parse(value) {
            if (
                /^\d{4}-\d{2}-\d{2}$/.test(value) ||
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:.\d+)(?:Z|[+-]\d{2}:\d{2})$/.test(value)
            ) {
                const timestamp = Date.parse(value)

                if (!Number.isNaN(timestamp)) {
                    return new Date(timestamp)
                }
            }
        },

        stringify(value) {
            if (Object.prototype.toString.call(value) !== '[object Date]') {
                return
            }

            const iso = value.toISOString()

            if (iso.endsWith('T00:00:00.000Z')) {
                return iso.slice(0, 10)
            }

            return iso
        }
    }
}

date.description = 'support ISO dates'

/**
 * Стандартные DSF-расширения.
 *
 * @type {{
 *     math: typeof math,
 *     hex: typeof hex,
 *     date: typeof date
 * }}
 */
export const standardDsf = {
    math,
    hex,
    date
}

export default standardDsf
