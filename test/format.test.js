import { describe, expect, test } from 'vitest'
import Hjson from '../src/index.js'

/**
 * Стабильность комментариев при round-trip.
 *
 * Проверяем две вещи:
 *  1) commentsAfterKey — какие ключи/индексы несут комментарий
 *     до и после rt.parse→rt.stringify. Набор должен совпадать.
 *  2) повторный rt (stringify→parse→stringify) даёт тот же текст —
 *     значит комментарий не «съезжает» и не плодит лишние EOL.
 *
 * Формат кейса: [имя, вход, ожидаемыйВыходПослеПервогоФормата].
 * Если ожидаемыйВыход === вход, значит форматирование идемпотентно.
 */
const cases = [
    // ---- комментарий перед ключом (в объекте) ----
    [
        'перед ключом',
        '{\n  # hello\n  a: 1\n}\n',
        '{\n  # hello\n  a: 1\n}\n',
    ],
    // ---- комментарий после значения (в объекте) ----
    [
        'после значения',
        '{\n  a: 1 # hello\n}\n',
        '{\n  a: 1 # hello\n}\n',
    ],
    // ---- комментарий перед элементом массива ----
    [
        'перед элементом массива',
        '[\n  # hello\n  1\n]\n',
        '[\n  # hello\n  1\n]\n',
    ],
    // ---- комментарий после элемента массива ----
    [
        'после элемента массива',
        '[\n  1 # hello\n]\n',
        '[\n  1 # hello\n]\n',
    ],
    // ---- корневой комментарий ----
    [
        'корневой #',
        '# header\na: 1\n',
        '# header\n{\n  a: 1\n}\n',
    ],
    [
        'корневой //',
        '// header\na: 1\n',
        '// header\n{\n  a: 1\n}\n',
    ],
    [
        'корневой /* */',
        '/* header */\na: 1\n',
        '/* header */\n{\n  a: 1\n}\n',
    ],
    // ---- несколько подряд ----
    [
        'несколько ключей с комментариями',
        '{\n  # first\n  a: 1\n  # second\n  b: 2\n}\n',
        '{\n  # first\n  a: 1\n  # second\n  b: 2\n}\n',
    ],
    // ---- комментарий перед вложенным объектом ----
    [
        'перед вложенным',
        '{\n  # sub\n  a: { b: 1 }\n}\n',
        '{\n  # sub\n  a:\n  {\n    b: 1\n  }\n}\n',
    ],
    // ---- многострочный комментарий ----
    [
        'многострочный #',
        '{\n  # line1\n  # line2\n  a: 1\n}\n',
        '{\n  # line1\n  # line2\n  a: 1\n}\n',
    ],
    // ---- в массиве объектов ----
    [
        'комментарий внутри объекта в массиве',
        '[\n  {\n    # inner\n    a: 1\n  }\n]\n',
        '[\n  {\n    # inner\n    a: 1\n  }\n]\n',
    ],
]

/**
 * Собирает «карту комментариев»: для каждого узла — какие
 * комментарии к нему привязаны. Использует getComment, который
 * публичный API parse() заполняет при keepWsc: true.
 */
function commentMap(data) {
    const HjsonComment = Hjson.comment
    if (!HjsonComment || typeof HjsonComment.getComment !== 'function') return null

    const map = { root: [], keys: {}, elems: {} }
    const dump = (node, path) => {
        const c = HjsonComment.getComment(node)
        if (!c) return
        if (c.r) map.root = c.r.slice()
        if (c.c) {
            for (const k of Object.keys(c.c)) {
                const v = c.c[k]
                if (v && (v[0] || v[1])) {
                    map.keys[path + '/' + k] = [v[0] || '', v[1] || '']
                }
            }
        }
        if (c.a) {
            for (let i = 0; i < c.a.length; i++) {
                const v = c.a[i]
                if (v && (v[0] || v[1])) {
                    map.elems[path + '[' + i + ']'] = [v[0] || '', v[1] || '']
                }
            }
        }
        if (Array.isArray(node)) {
            node.forEach((child, i) => dump(child, path + '[' + i + ']'))
        } else if (node && typeof node === 'object') {
            for (const k of Object.keys(node)) dump(node[k], path + '/' + k)
        }
    }
    dump(data, '')
    return map
}

describe('rt comments: комментарий остаётся на своём узле', () => {
    for (const [name, input, expected] of cases) {
        test(name, () => {
            const data = Hjson.rt.parse(input)
            const output = Hjson.rt.stringify(data)

            // 1) формат совпадает с ожидаемым
            expect(output).toBe(expected)
        })
    }
})

describe('rt comments idempotent: комментарии не гуляют', () => {
    for (const [name, input] of cases) {
        test(name, () => {
            const data1 = Hjson.rt.parse(input)
            const text1 = Hjson.rt.stringify(data1)

            const data2 = Hjson.rt.parse(text1)
            const text2 = Hjson.rt.stringify(data2)

            // 1) текст после повторного round-trip не меняется
            expect(text2).toBe(text1)

            // 2) данные эквивалентны
            expect(data2).toEqual(data1)

            // 3) карта комментариев совпадает: ярлыки прибиты к тем же узлам
            const map1 = commentMap(data1)
            const map2 = commentMap(data2)
            if (map1 && map2) {
                expect(map2).toEqual(map1)
            }
        })
    }
})

describe('rt comments: нет лишних переводов строк', () => {
    test('комментарий после значения не добавляет пустую строку', () => {
        const input = '{\n  a: 1 # hello\n}\n'
        const output = Hjson.rt.stringify(Hjson.rt.parse(input))
        // ровно один \n после комментария, не два
        expect(output).toBe('{\n  a: 1 # hello\n}\n')
        expect(output).not.toMatch(/# hello\n\n/)
    })

    test('корневой комментарий не добавляет пустую строку', () => {
        const input = '# header\na: 1\n'
        const output = Hjson.rt.stringify(Hjson.rt.parse(input))
        expect(output).toBe('# header\n{\n  a: 1\n}\n')
        expect(output).not.toMatch(/# header\n\n/)
    })

    test('комментарий перед ключом не добавляет пустую строку', () => {
        const input = '{\n  # first\n  a: 1\n}\n'
        const output = Hjson.rt.stringify(Hjson.rt.parse(input))
        expect(output).not.toMatch(/# first\n\n/)
    })
})

describe('rt comments: комментарий не съезжает на соседний узел', () => {
    test('комментарий перед ключом остаётся перед ним', () => {
        const input = '{\n  # about a\n  a: 1\n  b: 2\n}\n'
        const output = Hjson.rt.stringify(Hjson.rt.parse(input))
        expect(output).toMatch(/# about a\s+a: 1/)
        // и НЕ оказался у b
        expect(output).not.toMatch(/# about a\s+b: 2/)
    })

    test('комментарий перед элементом массива остаётся перед ним', () => {
        const input = '[\n  1\n  # about 2\n  2\n]\n'
        const output = Hjson.rt.stringify(Hjson.rt.parse(input))
        expect(output).toMatch(/# about 2\s+2/)
        expect(output).not.toMatch(/# about 2\s+1/)
    })

    test('два комментария не склеиваются в один', () => {
        const input = '{\n  # first\n  a: 1\n  # second\n  b: 2\n}\n'
        const output = Hjson.rt.stringify(Hjson.rt.parse(input))
        expect(output).toContain('# first')
        expect(output).toContain('# second')
        expect(output.indexOf('# first')).toBeLessThan(output.indexOf('# second'))
    })
})

describe('rt comments: emitRootBraces=false не теряет корневой комментарий', () => {
    const cases = [
        ['корневой #', '# header\na: 1\n', '# header\na: 1\n'],
        ['корневой //', '// header\na: 1\n', '// header\na: 1\n'],
        ['корневой /* */', '/* header */\na: 1\n', '/* header */\na: 1\n'],
        ['вложенный', '# header\na:\n{\n  b: 1\n}\n', '# header\na:\n{\n  b: 1\n}\n'],
    ]

    for (const [name, input, expected] of cases) {
        test(name, () => {
            const data = Hjson.rt.parse(input)
            const output = Hjson.rt.stringify(data, { emitRootBraces: false })
            expect(output).toBe(expected)

            // и повторный round-trip стабилен
            const data2 = Hjson.rt.parse(output)
            const output2 = Hjson.rt.stringify(data2, { emitRootBraces: false })
            expect(output2).toBe(output)
        })
    }
})
