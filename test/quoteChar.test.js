import { describe, expect, test } from 'vitest'
import Hjson from '../src/index.js'

/**
 * Тесты опции quoteChar (и её алиаса singleQuote).
 *
 * Каждый кейс — [имя, данные, опции, ожидаемый текст].
 * Ключевая идея: экранирование зависит от выбранной кавычки.
 *   - с двойными кавычками экранируется "
 *   - с одинарными — '
 *   - обратный слэш экранируется всегда
 */
const cases = [
    // ---- по умолчанию (двойные кавычки) ----
    [
        'default: апостроф не экранируется',
        { a: "this's" },
        { quotes: 'strings' },
        '{\n  a: "this\'s"\n}\n',
    ],
    [
        'default: двойная кавычка экранируется',
        { a: 'say "hi"' },
        { quotes: 'strings' },
        '{\n  a: "say \\"hi\\""\n}\n',
    ],
    [
        'default: обратный слэш экранируется',
        { a: 'a\\b' },
        { quotes: 'strings' },
        '{\n  a: "a\\\\b"\n}\n',
    ],

    // ---- одинарные кавычки через quoteChar ----
    [
        'single: апостроф экранируется',
        { a: "this's" },
        { quotes: 'strings', quoteChar: "'" },
        "{\n  a: 'this\\'s'\n}\n",
    ],
    [
        'single: двойная кавычка не экранируется',
        { a: 'say "hi"' },
        { quotes: 'strings', quoteChar: "'" },
        "{\n  a: 'say \"hi\"'\n}\n",
    ],
    [
        'single: строка без спецсимволов',
        { a: 'hello' },
        { quotes: 'strings', quoteChar: "'" },
        "{\n  a: 'hello'\n}\n",
    ],
    [
        'single: обратный слэш экранируется',
        { a: 'a\\b' },
        { quotes: 'strings', quoteChar: "'" },
        "{\n  a: 'a\\\\b'\n}\n",
    ],

    // ---- ключи ----
    [
        'default: ключ с апострофом',
        { "a'b": 1 },
        { quotes: 'keys' },
        '{\n  "a\'b": 1\n}\n',
    ],
    [
        'single: ключ с апострофом',
        { "a'b": 1 },
        { quotes: 'keys', quoteChar: "'" },
        "{\n  'a\\'b': 1\n}\n",
    ],
    [
        'single: ключ с двойной кавычкой',
        { 'a"b': 1 },
        { quotes: 'keys', quoteChar: "'" },
        "{\n  'a\"b': 1\n}\n",
    ],

    // ---- алиас singleQuote ----
    [
        'single: апостроф экранируется',
        { a: "this's" },
        { quotes: 'strings', quoteChar: "'" },
        "{\n  a: 'this\\'s'\n}\n",
    ],
    [
        'single: двойная кавычка не экранируется',
        { a: 'say "hi"' },
        { quotes: 'strings', quoteChar: "'" },
        "{\n  a: 'say \"hi\"'\n}\n",
    ],

    // ---- массив ----
    [
        'single: массив со смешанными кавычками',
        ["this's", 'say "hi"'],
        { quotes: 'strings', quoteChar: "'" },
        "[\n  'this\\'s'\n  'say \"hi\"'\n]\n",
    ],

    // ---- когда кавычки нужны без quotes: 'strings' ----
    [
        'default: строка, начинающаяся с апострофа',
        { a: "'hello'" },
        {},
        '{\n  a: "\'hello\'"\n}\n',
    ],
    [
        'single: строка, начинающаяся с апострофа',
        { a: "'hello'" },
        { quoteChar: "'" },
        "{\n  a:\n    '''\n    'hello'\n    '''\n}\n",
    ],
]

describe('stringify: опция quoteChar / singleQuote', () => {
    for (const [name, data, opt, expected] of cases) {
        test(name, () => {
            const output = Hjson.stringify(data, opt)
            expect(output).toBe(expected)
        })
    }
})

describe('stringify: дефолт не изменился', () => {
    test('без опции quoteChar экранируется только "', () => {
        const out = Hjson.stringify(
            { a: "this's", b: 'say "hi"' },
            { quotes: 'strings' },
        )
        expect(out).toBe(
            '{\n  a: "this\'s"\n  b: "say \\"hi\\""\n}\n',
        )
    })
})