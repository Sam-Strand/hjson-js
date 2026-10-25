import { describe, expect, test } from 'vitest'
import Mkon from '../src/index.js'
import { typeOf } from '../src/mkon-types.js'
import { toJsLiteral } from '../src/vite-plugin-mkon.js'

const p = (s) => Mkon.parse(s)
const s = (v, o) => Mkon.stringify(v, o)
const iso = (d) => d.toISOString()

describe('ISO dates: parse (quoteless only)', () => {
    test('date only -> UTC midnight', () => {
        const d = p('2024-01-15')
        expect(d instanceof Date).toBe(true)
        expect(iso(d)).toBe('2024-01-15T00:00:00.000Z')
    })

    test('date-time with Z / offset, optional seconds and fraction', () => {
        expect(iso(p('2024-01-15T10:30Z'))).toBe('2024-01-15T10:30:00.000Z')
        expect(iso(p('2024-01-15T10:30:45Z'))).toBe('2024-01-15T10:30:45.000Z')
        expect(iso(p('2024-01-15T10:30:45.1Z'))).toBe('2024-01-15T10:30:45.100Z')
        expect(iso(p('2024-01-15T10:30:45.123456Z'))).toBe('2024-01-15T10:30:45.123Z')
        expect(iso(p('2024-01-15T13:30:00+03:00'))).toBe('2024-01-15T10:30:00.000Z')
        expect(iso(p('2024-01-15T05:00:00-05:30'))).toBe('2024-01-15T10:30:00.000Z')
    })

    test('in containers, with separators and comments', () => {
        const v = p('{ a: 2024-01-15, b: [2024-02-29, 2024-03-01T12:00Z] // c\n c: 2024-01-15 /* c */ }')
        expect(iso(v.a)).toBe('2024-01-15T00:00:00.000Z')
        expect(v.b.map(iso)).toEqual(['2024-02-29T00:00:00.000Z', '2024-03-01T12:00:00.000Z'])
        expect(iso(v.c)).toBe('2024-01-15T00:00:00.000Z')
    })

    test('quoted dates stay strings', () => {
        expect(p('["2024-01-15", \'2024-01-15T10:30Z\', \'\'\'2024-01-15\'\'\']'))
            .toEqual(['2024-01-15', '2024-01-15T10:30Z', '2024-01-15'])
    })

    test('anything that is not exactly an ISO date stays a string', () => {
        expect(p('[2024-01-15T10:30, 2024-01-15 10:30Z, 2024-1-5, 20240115, 2024-01-15 is a date, 2024-01-15T10:30:00z, 2024/01/15]'))
            .toEqual(['2024-01-15T10:30', '2024-01-15 10:30Z', '2024-1-5', 20240115, '2024-01-15 is a date', '2024-01-15T10:30:00z', '2024/01/15'])
    })

    test('bare date-time at the root is a Date, not a braceless object', () => {
        expect(iso(p('2024-01-15T10:30Z'))).toBe('2024-01-15T10:30:00.000Z')
        expect(iso(p('// c\n2024-01-15T10:30Z // c\n'))).toBe('2024-01-15T10:30:00.000Z')
        expect(p('2024-01-15T10:30: x')).toEqual({ '2024-01-15T10': '30: x' })
    })

    test('years 0000-0099 do not shift to 19xx', () => {
        expect(p('0050-06-01').getUTCFullYear()).toBe(50)
        expect(p('0000-01-01').getUTCFullYear()).toBe(0)
    })

    test('invalid calendar values are errors, not silent rollovers', () => {
        for (const bad of ['2023-02-29', '2024-02-30', '2024-13-01', '2024-00-10', '2024-04-31',
            '2024-01-15T24:00Z', '2024-01-15T10:60Z', '2024-01-15T10:30:60Z', '2024-01-15T10:30+24:00']) {
            expect(() => p(`{ d: ${bad} }`)).toThrow(/Invalid/)
        }
        expect(p('2000-02-29').getUTCDate()).toBe(29) // 2000 — високосный
        expect(() => p('1900-02-29')).toThrow(/Invalid/) // 1900 — нет
    })
})

describe('ISO dates: stringify', () => {
    test('midnight UTC -> date only, otherwise full UTC time', () => {
        expect(s(new Date('2024-01-15T00:00:00Z'))).toBe('2024-01-15\n')
        expect(s(new Date('2024-01-15T10:30:00Z'))).toBe('2024-01-15T10:30:00Z\n')
        expect(s(new Date('2024-01-15T10:30:00.250Z'))).toBe('2024-01-15T10:30:00.250Z\n')
        expect(s({ d: new Date('2024-01-15T00:00:00Z') })).toBe('{\n  d: 2024-01-15\n}\n')
    })

    test('strings that look like dates are quoted', () => {
        const out = s({ a: '2024-01-15', b: '2024-01-15T10:30Z', c: '2024-02-30', d: '2024-01-15 // x', e: 'on 2024-01-15' })
        expect(out).toMatch(/a: "2024-01-15"/)
        expect(out).toMatch(/b: "2024-01-15T10:30Z"/)
        expect(out).toMatch(/c: "2024-02-30"/)
        expect(out).toMatch(/d: "2024-01-15 \/\/ x"/)
        expect(out).toMatch(/e: on 2024-01-15/)
    })

    test('invalid Date and out-of-range years throw', () => {
        expect(() => s({ d: new Date(NaN) })).toThrow(/Invalid Date/)
        expect(() => s({ d: new Date('+010000-01-01T00:00:00Z') })).toThrow(/outside/)
    })

    test('roundtrip keeps Date as Date and strings as strings', () => {
        const data = {
            dates: [new Date('2024-01-15T00:00:00Z'), new Date('2024-01-15T10:30:45.123Z'), new Date('0050-06-01T00:00:00Z')],
            strs: ['2024-01-15', '2024-01-15T10:30Z', '2024-02-30', '2024-01-15T10:30'],
        }
        for (const opt of [{}, { condense: 200 }, { quotes: 'all' }, { separator: true }, { keepWsc: true }]) {
            const back = Mkon.parse(s(data, opt))
            expect(back.dates.every((d) => d instanceof Date)).toBe(true)
            expect(back.dates.map(iso)).toEqual(data.dates.map(iso))
            expect(back.strs).toEqual(data.strs)
        }
    })
})

describe('format plugins (dsf) are gone', () => {
    test('passing dsf is an error', () => {
        expect(() => Mkon.parse('a: 1', { dsf: [] })).toThrow(/dsf.*removed/)
        expect(() => Mkon.stringify({ a: 1 }, { dsf: [] })).toThrow(/dsf.*removed/)
    })

    test('no dsf export', () => {
        expect(Mkon.dsf).toBe(undefined)
    })

    test('hex is just a string now', () => {
        expect(p('{ a: 0x1F }')).toEqual({ a: '0x1F' })
    })
})

describe('Date in tooling', () => {
    test('TypeScript type', () => {
        expect(typeOf(new Date())).toBe('Date')
        expect(typeOf({ d: new Date() })).toMatch(/d: Date/)
    })

    test('vite module literal', () => {
        expect(toJsLiteral({ d: new Date('2024-01-15T00:00:00Z') })).toBe('{"d":new Date("2024-01-15T00:00:00.000Z")}')
        const v = new Function('return ' + toJsLiteral([new Date('2024-01-15T10:30:00Z')]))()
        expect(v[0] instanceof Date).toBe(true)
        expect(v[0].toISOString()).toBe('2024-01-15T10:30:00.000Z')
    })
})
