export let EOL = '\n'

export function setEndOfLine(eol) {
    if (eol === '\n' || eol === '\r\n') {
        EOL = eol
    }
}

/**
 * Пытается разобрать строку как число.
 *
 * Поддерживаются:
 * - целые числа
 * - дробные числа
 * - экспоненциальная запись
 * - знак `-` перед числом
 *
 * После числа допускаются пробельные символы. Если `stopAtNext` включён,
 * также допускаются разделители JSON/HJSON и начало комментария.
 *
 * @param {string} text Текст для разбора.
 * @param {boolean} [stopAtNext=false] Разрешить завершение числа перед разделителем или комментарием.
 * @returns {number|undefined} Распознанное число или `undefined`, если текст не является корректным числом.
 */
export function tryParseNumber(text, stopAtNext = false) {
    let string = ''
    let leadingZeros = 0
    let testLeading = true
    let at = 0
    let ch = ''

    const next = () => text.charAt(at++)

    ch = next()

    if (ch === '-') {
        string = '-'
        ch = next()
    }

    while (ch >= '0' && ch <= '9') {
        if (testLeading) {
            if (ch === '0') leadingZeros++
            else testLeading = false
        }

        string += ch
        ch = next()
    }

    if (testLeading) leadingZeros--

    if (ch === '.') {
        string += '.'
        ch = next()

        while (ch >= '0' && ch <= '9') {
            string += ch
            ch = next()
        }
    }

    if (ch === 'e' || ch === 'E') {
        string += ch
        ch = next()

        if (ch === '-' || ch === '+') {
            string += ch
            ch = next()
        }

        while (ch >= '0' && ch <= '9') {
            string += ch
            ch = next()
        }
    }

    while (ch && ch <= ' ') {
        ch = next()
    }

    if (stopAtNext) {
        if (
            ch === ',' ||
            ch === '}' ||
            ch === ']' ||
            ch === '#' ||
            (ch === '/' && (text[at] === '/' || text[at] === '*'))
        ) {
            ch = ''
        }
    }

    const number = Number(string)

    if (ch || leadingZeros || !Number.isFinite(number)) {
        return undefined
    }

    return number
}

/**
 * Добавляет комментарий к значению.
 *
 * Комментарий сохраняется в неперечисляемом свойстве `__COMMENTS__`.
 *
 * @param {object} value Значение, к которому добавляется комментарий.
 * @param {object} [comment] Данные комментария.
 * @returns {object} Сохранённый комментарий.
 */
export function createComment(value, comment) {
    Object.defineProperty(value, '__COMMENTS__', {
        enumerable: false,
        writable: true
    })

    return (value.__COMMENTS__ = comment || {})
}

/**
 * Удаляет комментарий из значения.
 *
 * @param {object} value Значение, у которого удаляется комментарий.
 * @returns {void}
 */
export function removeComment(value) {
    Object.defineProperty(value, '__COMMENTS__', {
        value: undefined
    })
}

/**
 * Возвращает комментарий, связанный со значением.
 *
 * @param {object} value Значение, у которого извлекается комментарий.
 * @returns {object|undefined} Данные комментария.
 */
export function getComment(value) {
    return value.__COMMENTS__
}

/**
 * Добавляет маркер комментария к строкам, которые ещё не являются комментариями.
 *
 * Строки, начинающиеся с `#`, `//` или `/*`, не изменяются.
 * Для блочного комментария предполагается, что он занимает оставшуюся часть текста.
 *
 * @param {string} text Текст для обработки.
 * @returns {string} Текст с принудительно добавленными комментариями.
 */
export function forceComment(text) {
    if (!text) return ''

    const lines = text.split(EOL)

    for (let j = 0; j < lines.length; j++) {
        const line = lines[j]

        for (let i = 0; i < line.length; i++) {
            const char = line[i]

            if (char === '#') break

            if (
                char === '/' &&
                (line[i + 1] === '/' || line[i + 1] === '*')
            ) {
                if (line[i + 1] === '*') {
                    // Считаем, что блочный комментарий занимает весь остаток текста.
                    j = lines.length
                }

                break
            }

            if (char > ' ') {
                lines[j] = '# ' + line
                break
            }
        }
    }

    return lines.join(EOL)
}
