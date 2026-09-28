// test/stringify-multiline.test.js
import { describe, it, expect } from 'vitest'
import hjson from '../src/index.js'

// Конфиг из issue (расширения hjson-vsc)
const baseOpt = {
    condense: 0,
    bracesSameLine: false,
    emitRootBraces: false,
    quotes: 'min',
    multiline: 'std',
    separator: false,
    space: 4,
    eol: '\n',
    colors: false,
    serializeDeterministically: false,
    quoteChar: "'",
}

/**
 * Парсит и один раз сериализует.
 */
function roundTripOnce(input, opt = baseOpt) {
    return hjson.rt.stringify(hjson.rt.parse(input, opt), opt)
}

/**
 * Прогоняет N циклов parse→stringify и требует, чтобы результат
 * перестал меняться уже после первого прохода.
 * Возвращает стабилизированную строку.
 */
function expectStable(input, iterations = 5, opt = baseOpt) {
    let current = roundTripOnce(input, opt)
    for (let i = 0; i < iterations; i++) {
        const next = roundTripOnce(current, opt)
        expect(next, `round ${i + 1} изменил результат`).toBe(current)
        current = next
    }
    return current
}

describe('hjson stringify — multiline strings', () => {
    // ------------------------------------------------------------------
    // Регресс из issue
    // ------------------------------------------------------------------

    describe('array of multiline strings, quotes on same line as element', () => {
        it('не добавляет пустую строку перед открывающими \'\'\'', () => {
            const input = `[
    '''
    line1
    line2
    '''
]
`
            const out = roundTripOnce(input)

            // между '[' и первым ''' ровно одна переведённая строка,
            // никаких "\n\n"
            expect(out).not.toMatch(/\[\s*\n\s*\n/)
            // перед ''' идёт ровно 4 пробела (один уровень)
            expect(out).toContain("\n    '''")
            expect(out).not.toContain("\n        '''")
        })

        it('не увеличивает отступ при повторных форматированиях (idempotent)', () => {
            const input = `[
    '''
    line1
    line2
    '''
]
`
            const out = expectStable(input)
            expect(out).toContain("\n    '''\n    line1\n    line2\n    '''\n")
        })

        it('воспроизводит SQL-кейс из issue без сдвига', () => {
            const input = `[
    '''
    --sql
    CREATE TABLE IF NOT EXISTS "{schema}".namespaces (
        uid my_id PRIMARY KEY,
        label text,
        upload timestamptz NOT NULL DEFAULT now()
    )
    '''
    '''
    --sql
    CREATE TABLE IF NOT EXISTS "{schema}".units (
        label text PRIMARY KEY
    )
    '''
]
`
            const out = expectStable(input)

            // внешний отступ элементов массива остаётся 4
            expect(out).toMatch(/\n {4}'''/)
            // вложенный SQL-отступ сохраняется как 8
            expect(out).toContain('\n        uid my_id PRIMARY KEY,')
            // нет "съехавшего" отступа 8 на самих '''
            expect(out).not.toMatch(/\n {8}'''/)
            // нет пустых строк между элементами
            expect(out).not.toMatch(/'''\s*\n\s*\n\s*'''/)
        })

        it('полностью совпадает с ожидаемым форматом', () => {
            const input = `[
    '''
    line1
    line2
    '''
]
`
            const expected = `[
    '''
    line1
    line2
    '''
]
`
            expect(roundTripOnce(input)).toBe(expected)
        })
    })

    // ------------------------------------------------------------------
    // Многострочные значения в объектах
    // ------------------------------------------------------------------

    describe('object with multiline string value', () => {
        it('bracesSameLine: false — стабильно', () => {
            const input = `{
    key:
        '''
        a
        b
        '''
}
`
            expectStable(input)
        })

        it('bracesSameLine: false — ключ и значение на одной строке ввода', () => {
            const input = `{
    key: '''
    a
    b
    '''
}
`
            // сами по себе кавычки на строке с ключом —
            // это допустимый ввод, проверяем только стабильность
            expectStable(input)
        })

        it('bracesSameLine: true — стабильно', () => {
            const opt = { ...baseOpt, bracesSameLine: true }
            const input = `{
    key:
        '''
        a
        b
        '''
}
`
            expectStable(input, 5, opt)
        })
    })

    // ------------------------------------------------------------------
    // Вложенность
    // ------------------------------------------------------------------

    describe('nesting', () => {
        it('массив внутри объекта', () => {
            const input = `{
    list: [
        '''
        a
        b
        '''
        '''
        c
        d
        '''
    ]
}
`
            expectStable(input)
        })

        it('объект внутри массива с multiline-значением', () => {
            const input = `[
    {
        key:
            '''
            a
            b
            '''
    }
]
`
            expectStable(input)
        })

        it('двойная вложенность массива', () => {
            const input = `[
    [
        '''
        a
        b
        '''
    ]
]
`
            expectStable(input)
        })

        it('глубоко вложенная смесь объектов/массивов', () => {
            const input = `{
    a: [
        {
            b: [
                '''
                deep
                content
                '''
            ]
        }
    ]
}
`
            expectStable(input)
        })
    })

    // ------------------------------------------------------------------
    // Смешанные значения в массиве
    // ------------------------------------------------------------------

    describe('mixed arrays', () => {
        it('скаляры и multiline-строки вместе', () => {
            const input = `[
    plain
    42
    '''
    a
    b
    '''
    true
]
`
            expectStable(input)
        })

        it('одна строка с переводом строки не делает соседей multiline', () => {
            const input = `[
    a
    '''
    b
    c
    '''
    d
]
`
            const out = expectStable(input)
            expect(out).toContain('\n    a\n')
            expect(out).toContain('\n    d\n')
        })

        it('короткие строки без переводов строк не становятся multiline', () => {
            const input = `[
    a
    b
    c
]
`
            const out = roundTripOnce(input)
            expect(out).not.toContain("'''")
        })
    })

    // ------------------------------------------------------------------
    // Опции multiline / quotes
    // ------------------------------------------------------------------

    describe('multiline option', () => {
        it('multiline: "off" — тройные кавычки не используются', () => {
            const opt = { ...baseOpt, multiline: 'off' }
            const input = `[
    '''
    a
    b
    '''
]
`
            const out = expectStable(input, 5, opt)
            expect(out).not.toContain("'''")
            // содержимое станет обычной строкой
            expect(out).toMatch(/"a\\nb"|'a\\nb'/)
        })

        it('quotes: "strings" отключает multiline', () => {
            const opt = { ...baseOpt, quotes: 'strings' }
            const input = `[
    '''
    a
    b
    '''
]
`
            const out = expectStable(input, 5, opt)
            expect(out).not.toContain("'''")
        })

        it('multiline: "no-tabs" — с табами внутри строки', () => {
            const opt = { ...baseOpt, multiline: 'no-tabs' }
            const input = "[\n    '''\n    a\n\tb\n    '''\n]\n"
            expectStable(input, 5, opt)
        })

        it('multiline: "std" — строка с \r\n не ломает вывод', () => {
            const input = "[\r\n    '''\r\n    a\r\n    b\r\n    '''\r\n]\r\n"
            expectStable(input, 5, { ...baseOpt, eol: '\r\n' })
        })
    })

    // ------------------------------------------------------------------
    // quoteChar
    // ------------------------------------------------------------------

    describe('quoteChar', () => {
        it('одинарная кавычка стабильна', () => {
            const input = `[
    '''
    a
    b
    '''
    "needs quotes"
]
`
            expectStable(input, 5, { ...baseOpt, quoteChar: "'" })
        })

        it('двойная кавычка стабильна', () => {
            const input = `[
    '''
    a
    b
    '''
]
`
            expectStable(input, 5, { ...baseOpt, quoteChar: '"' })
        })
    })

    // ------------------------------------------------------------------
    // Краевые случаи содержимого
    // ------------------------------------------------------------------

    describe('edge cases', () => {
        it('пустой массив', () => {
            expectStable('[]\n')
        })

        it('массив с пустой строкой', () => {
            const input = `[
    ""
]
`
            const out = expectStable(input)
            expect(out).not.toContain("'''")
        })

        it('содержимое с закрывающими кавычками внутри требует экранирования', () => {
            const input = `[
    '''
    has ''' inside
    '''
]
`
            // так парсить нельзя — проверим, что падает ожидаемо
            expect(() => hjson.rt.parse(input, baseOpt)).toThrow()
        })

        it('содержимое с одним переводом строки в конце', () => {
            const input = `[
    '''
    a

    '''
]
`
            expectStable(input)
        })

        it('содержимое с ведущей пустой строкой', () => {
            const input = `[
    '''

    a
    '''
]
`
            expectStable(input)
        })

        it('содержимое с несколькими пустыми строками подряд', () => {
            const input = `[
    '''
    a


    b
    '''
]
`
            expectStable(input)
        })

        it('короткое однострочное содержимое не превращается в multiline', () => {
            const input = `{
    key: '''
    only
    '''
}
`
            const out = roundTripOnce(input)
            // 'only' не содержит переносов строк → должно вывестись как обычная строка
            expect(out).not.toContain("'''")
        })
    })

    // ------------------------------------------------------------------
    // Сильно повторяющийся round-trip
    // ------------------------------------------------------------------

    describe('long-term idempotency', () => {
        it('стабильно на 10 итерациях (SQL-кейс из issue)', () => {
            const input = `[
    '''
    --sql
    CREATE TABLE IF NOT EXISTS "{schema}".namespaces (
        uid my_id PRIMARY KEY
    )
    '''
    '''
    --sql
    CREATE TABLE IF NOT EXISTS "{schema}".units (
        label text PRIMARY KEY
    )
    '''
]
`
            expectStable(input, 10)
        })

        it('стабильно на 10 итерациях (вложенная структура)', () => {
            const input = `{
    a: [
        {
            b: '''
            x
            y
            '''
        }
        '''
        p
        q
        '''
    ]
}
`
            expectStable(input, 10)
        })

        it('стабильно на 10 итерациях (смешанный массив)', () => {
            const input = `[
    header
    '''
    multiline
    content
    '''
    footer
    42
    [
        '''
        nested
        ml
        '''
    ]
]
`
            expectStable(input, 10)
        })
    })
})
