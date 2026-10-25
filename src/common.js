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
 * также допускаются разделители JSON/mkon и начало комментария (`//`, `/*`).
 *
 * `NaN` и `±Infinity` здесь не распознаются — для них см. `parseSpecialNumber`.
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
 * Специальные значения float, которые mkon пишет литералами.
 * Регистр важен: `nan`, `inf`, `Inf` — обычные строки.
 */
export const SPECIAL_NUMBERS = {
    'NaN': NaN,
    'Infinity': Infinity,
    '+Infinity': Infinity,
    '-Infinity': -Infinity
}

/**
 * Разбирает литерал специального числа (`NaN`, `Infinity`, `+Infinity`, `-Infinity`).
 *
 * @param {string} text Уже обрезанный по краям текст.
 * @returns {number|undefined} Число или `undefined`, если это не литерал.
 */
export function parseSpecialNumber(text) {
    return Object.prototype.hasOwnProperty.call(SPECIAL_NUMBERS, text)
        ? SPECIAL_NUMBERS[text]
        : undefined
}

/**
 * Сериализует число так, чтобы parse вернул ровно его же:
 * `NaN`, `Infinity`, `-Infinity`, `-0` и обычные числа.
 *
 * @param {number} value
 * @returns {string}
 */
export function numberToString(value) {
    if (Number.isNaN(value)) return 'NaN'
    if (value === Infinity) return 'Infinity'
    if (value === -Infinity) return '-Infinity'
    if (value === 0 && 1 / value < 0) return '-0'
    return String(value)
}

// ----------------------------------------------------------------------------
// ISO 8601 даты
// ----------------------------------------------------------------------------

const ISO_DATE_SRC = '(\\d{4})-(\\d{2})-(\\d{2})'
const ISO_TIME_SRC = 'T(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d+))?)?(Z|[+-]\\d{2}:\\d{2})'
const ISO_RE = new RegExp('^' + ISO_DATE_SRC + '(?:' + ISO_TIME_SRC + ')?$')
const ISO_LIKE_RE = new RegExp('^' + ISO_DATE_SRC + '(?:' + ISO_TIME_SRC + ')?\\s*((,|\\]|\\}|//|/\\*).*)?$')

/**
 * Разбирает ISO-дату, если текст целиком на неё похож.
 *
 * Поддерживаются ровно две формы:
 * - `YYYY-MM-DD` — полночь UTC;
 * - `YYYY-MM-DDTHH:MM[:SS[.fff…]](Z|±HH:MM)` — часовой пояс обязателен,
 *   иначе результат зависел бы от пояса машины.
 *
 * @param {string} text Уже обрезанный по краям текст.
 * @returns {Date|undefined} Дата или `undefined`, если текст не похож на ISO-дату.
 * @throws {Error} Если текст похож на дату, но она невалидна (`2024-02-30`, `25:00`).
 */
export function parseIsoDate(text) {
    const m = ISO_RE.exec(text)
    if (!m) return undefined

    const [, ys, mos, ds, hs, mis, ss, frac, tz] = m
    const y = +ys, mo = +mos, d = +ds
    const h = hs === undefined ? 0 : +hs
    const mi = mis === undefined ? 0 : +mis
    const s = ss === undefined ? 0 : +ss
    const ms = frac === undefined ? 0 : +(frac + '00').slice(0, 3)

    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
    const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
    if (mo < 1 || mo > 12 || d < 1 || d > dim || h > 23 || mi > 59 || s > 59) {
        throw new Error("Invalid date '" + text + "'")
    }

    let offset = 0
    if (tz && tz !== 'Z') {
        const oh = +tz.slice(1, 3), om = +tz.slice(4, 6)
        if (oh > 23 || om > 59) throw new Error("Invalid time zone offset in '" + text + "'")
        offset = (tz[0] === '-' ? -1 : 1) * (oh * 60 + om)
    }

    const date = new Date(0)
    date.setUTCFullYear(y, mo - 1, d) // setUTCFullYear, чтобы годы 0000–0099 не съехали в 19xx
    date.setUTCHours(h, mi, s, ms)
    date.setTime(date.getTime() - offset * 60000)
    return date
}

/**
 * Похожа ли строка на ISO-дату (в том числе с хвостом-разделителем или комментарием)?
 * Такие строки `stringify` обязан брать в кавычки, иначе они прочитаются как Date
 * (или вызовут ошибку, если дата невалидна).
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeIsoDate(text) {
    return ISO_LIKE_RE.test(text)
}

/**
 * @param {unknown} value
 * @returns {value is Date}
 */
export function isDate(value) {
    return Object.prototype.toString.call(value) === '[object Date]'
}

/**
 * Сериализует Date: `YYYY-MM-DD` для полуночи UTC, иначе `YYYY-MM-DDTHH:MM:SS[.mmm]Z`.
 *
 * @param {Date} date
 * @returns {string}
 * @throws {Error} Для Invalid Date и годов вне 0000–9999.
 */
export function dateToString(date) {
    const t = date.getTime()
    if (Number.isNaN(t)) throw new Error('Cannot stringify Invalid Date')
    const y = date.getUTCFullYear()
    if (y < 0 || y > 9999) throw new Error('Cannot stringify date outside of years 0000-9999: ' + date.toISOString())
    const iso = date.toISOString()
    if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10)
    return iso.endsWith('.000Z') ? iso.slice(0, -5) + 'Z' : iso
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
 * Строки, начинающиеся с `//` или `/*`, не изменяются, остальные получают префикс `// `.
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
                lines[j] = '// ' + line
                break
            }
        }
    }

    return lines.join(EOL)
}
