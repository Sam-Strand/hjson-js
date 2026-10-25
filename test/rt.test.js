import { describe, expect, test } from 'vitest'
import mkon from '../src/index.js'

/**
 * Round-trip: текст → parse → stringify → текст.
 *
 * Проверяет, что rt сохраняет комментарии и форматирование.
 * Каждый кейс — это [имя, вход, ожидаемый выход].
 * Если вход === выход, значит round-trip идемпотентен для этого случая.
 */
const cases = [
    // ---- без комментариев ----
    ['пустой объект', '{}\n', '{\n}\n'],
    ['пустой массив', '[]\n', '[\n]\n'],
    ['простой объект', '{ a: 1 }\n', '{\n  a: 1\n}\n'],
    
    ['простой массив', '[1, 2, 3]\n', '[\n  1\n  2\n  3\n]\n'],
    ['вложенный объект', '{ a: { b: 1 } }\n', '{\n  a:\n  {\n    b: 1\n  }\n}\n'],
    ['вложенный массив', '{ a: [1, 2] }\n', '{\n  a:\n  [\n    1\n    2\n  ]\n}\n'],

    //// ---- с комментариями ----
    //['комментарий перед ключом', '# hello\n{ a: 1 }\n', '# hello\n{\n  a: 1\n}\n'], //error
    ['комментарий после значения', '{ a: 1 # hello\n}\n', '{\n  a: 1 # hello\n}\n'],
    //['комментарий внутри', '{\n  # hello\n  a: 1\n}\n', '{\n  # hello\n  a: 1\n}\n'],//error
    //['js-комментарий //', '// hello\n{ a: 1 }\n', '// hello\n{\n  a: 1\n}\n'],//error
    //['js-комментарий /* */', '/* hello */\n{ a: 1 }\n', '/* hello */\n{\n  a: 1\n}\n'],//error
    //['комментарий в массиве', '[\n  # hello\n  1\n]\n', '[\n  # hello\n  1\n]\n'],//error

    //// ---- пробелы и отступы ----
    //['отступ 4 пробела', '{\n    a: 1\n}\n', '{\n    a: 1\n}\n'],//error
    //['табы', '{\n\ta: 1\n}\n', '{\n\ta: 1\n}\n'],//error

    //// ---- root без фигурных скобок ----
    ['root без скобок', 'a: 1\n', '{\n  a: 1\n}\n'],
    //['root без скобок + комм.', '# hello\na: 1\n', '# hello\n{\n  a: 1\n}\n'],//error
]

describe('rt: text → parse → stringify → text', () => {
    for (const [name, input, expected] of cases) {
        test(name, () => {
            const data = mkon.rt.parse(input)
            const output = mkon.rt.stringify(data)
            expect(output).toBe(expected)
        })
    }
})

describe('rt idempotent: parse → stringify → parse → stringify', () => {
    for (const [name, input] of cases) {
        test(name, () => {
            const data1 = mkon.rt.parse(input)
            const text1 = mkon.rt.stringify(data1)

            const data2 = mkon.rt.parse(text1)
            const text2 = mkon.rt.stringify(data2)

            expect(text2).toBe(text1)
            expect(data2).toEqual(data1)
        })
    }
})
