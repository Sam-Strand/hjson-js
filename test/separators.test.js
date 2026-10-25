import { describe, expect, test } from 'vitest'
import mkon from '../src/index.js'

// Quoteless strings inside containers end at '}' / ']' and ',' that are not inside a bracket
// pair opened within the string itself. In an object a ',' ends the value only when a key
// and ':' follow it on the same line (or nothing but a comment does).

const p = (s) => mkon.parse(s)

describe('quoteless strings: separators', () => {
    test('inline object (the original issue)', () => {
        expect(p('{ html: ⊄, latex: \\not\\subset, aliases: [notsub, notsubset] }')).toEqual({
            html: '⊄',
            latex: '\\not\\subset',
            aliases: ['notsub', 'notsubset'],
        })
    })

    test('inline array', () => {
        expect(p('[a, b, c]')).toEqual(['a', 'b', 'c'])
        expect(p('[ a , b ,c ]')).toEqual(['a', 'b', 'c'])
        expect(p('[a b, c d]')).toEqual(['a b', 'c d'])
    })

    test('several values per line in a multiline array', () => {
        expect(p('[\n  a, b, c\n  d, e, f\n]')).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    })

    test('several key/values per line in a multiline object', () => {
        expect(p('{\n  a: x, b: y\n  c: z\n}')).toEqual({ a: 'x', b: 'y', c: 'z' })
    })

    test('braceless root object', () => {
        expect(p('a: x, b: y\nc: z')).toEqual({ a: 'x', b: 'y', c: 'z' })
    })

    test('trailing comma and closing bracket right after the value', () => {
        expect(p('[a,]')).toEqual(['a'])
        expect(p('{a: x,}')).toEqual({ a: 'x' })
        expect(p('{a: x}')).toEqual({ a: 'x' })
        expect(p('[[a, b], [c]]')).toEqual([['a', 'b'], ['c']])
        expect(p('{ o: { a: x }, l: [y] }')).toEqual({ o: { a: 'x' }, l: ['y'] })
    })

    test('balanced brackets inside a quoteless string are kept', () => {
        expect(p('{ f: \\frac{a,b}{c}, g: x }')).toEqual({ f: '\\frac{a,b}{c}', g: 'x' })
        expect(p('[ m[i, j], n ]')).toEqual(['m[i, j]', 'n'])
        expect(p('{ s: see [1] }')).toEqual({ s: 'see [1]' })
    })

    test('quoting keeps the comma as part of the string', () => {
        expect(p('[ "a, b", \'c, d\', e ]')).toEqual(['a, b', 'c, d', 'e'])
        expect(p("{ a: '''x, y''' }")).toEqual({ a: 'x, y' })
        expect(p("{\n  a:\n    '''\n    x, y\n    '''\n}")).toEqual({ a: 'x, y' })
    })

    test('colons, comment-like chars and backslashes stay part of the string', () => {
        expect(p('{ url: http://x.y/z, b: 1 }')).toEqual({ url: 'http://x.y/z', b: 1 })
        expect(p('{ a: x # y, b: z }')).toEqual({ a: 'x # y', b: 'z' })
    })

    test('numbers and keywords are unchanged', () => {
        expect(p('[1, -2.5, true, false, null]')).toEqual([1, -2.5, true, false, null])
        expect(p('{ a: 1, b: true }')).toEqual({ a: 1, b: true })
    })

    test('former "fail" fixtures are now valid quoteless strings', () => {
        expect(p('[\\naked]')).toEqual(['\\naked'])
        expect(p('["Bad value", truth]')).toEqual(['Bad value', 'truth'])
        expect(p('[0e]')).toEqual(['0e'])
        expect(p('{"Illegal expression": 1 + 2}')).toEqual({ 'Illegal expression': '1 + 2' })
        expect(p('{"Numbers cannot be hex": 0x14}')).toEqual({ 'Numbers cannot be hex': '0x14' })
    })

    test('a bare root value still runs to the end of the line', () => {
        expect(p('Hello, world')).toBe('Hello, world')
    })

    test('in an object a comma is text unless a key and ":" follow', () => {
        expect(p('{\n  a: Hello, world\n}')).toEqual({ a: 'Hello, world' })
        expect(p('header: ЭК-6. P пара, кг/см2')).toEqual({ header: 'ЭК-6. P пара, кг/см2' })
        expect(p('{ a: x, y, b: 1 }')).toEqual({ a: 'x, y', b: 1 })
        expect(p('{ a: 1,5, b: true, false }')).toEqual({ a: '1,5', b: 'true, false' })
        expect(p('{ path: копия, C:\\data }')).toEqual({ path: 'копия', C: '\\data' })
        expect(p('{ a: x, "k, 2": 2 }')).toEqual({ a: 'x', 'k, 2': 2 })
        expect(p('{\n  a: x,  // c\n  b: y\n}')).toEqual({ a: 'x', b: 'y' })
    })

    test('keys may contain spaces and be multiline strings', () => {
        expect(p('ЭК-6. P пара: 12.5')).toEqual({ 'ЭК-6. P пара': 12.5 })
        expect(p("{\n  '''\n  a\n  b\n  ''': 1\n}")).toEqual({ 'a\nb': 1 })
        expect(() => p('{\n  a b\n  c: 1\n}')).toThrow(/line break/)
    })

    test('stray closing bracket after a value is an error', () => {
        expect(() => p('{ a: x] }')).toThrow()
    })
})

describe('stringify quotes strings the parser would cut', () => {
    const rt = (v) => mkon.parse(mkon.stringify(v))

    test('values with separators are quoted', () => {
        const s = mkon.stringify({ a: 'x, y', b: 'p}', c: 'q]', d: 'ok', e: 'x, y: z', l: ['x, y'] })
        expect(s).toMatch(/a: x, y\n/)
        expect(s).toMatch(/e: "x, y: z"/)
        expect(s).toMatch(/"x, y"/)
        expect(s).toMatch(/b: "p}"/)
        expect(s).toMatch(/c: "q]"/)
        expect(s).toMatch(/d: ok/)
    })

    test('balanced brackets do not force quotes', () => {
        const s = mkon.stringify({ f: '\\frac{a,b}{c}', m: 'm[i, j]' })
        expect(s).toMatch(/f: \\frac\{a,b\}\{c\}/)
        expect(s).toMatch(/m: m\[i, j\]/)
    })

    test('roundtrip', () => {
        const data = {
            list: ['a, b', 'c', 'x]', '{y', 'a{b', 'a[b, c', '\\not\\subset', '\\frac{a,b}{c}'],
            obj: { k: 'v, w', l: 'p}q' },
        }
        expect(rt(data)).toEqual(data)
        expect(mkon.parse(mkon.stringify(data, { condense: 200 }))).toEqual(data)
        expect(rt(['a, b'])).toEqual(['a, b'])
        expect(rt('Hello, world')).toBe('Hello, world')
    })
})
