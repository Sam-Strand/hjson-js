import { describe, expect, test } from 'vitest'
import Mkon from '../src/index.js'

const p = (s) => Mkon.parse(s)
const s = (v, o) => Mkon.stringify(v, o)
const rt = (v, o) => Mkon.parse(Mkon.stringify(v, o))

describe('comments: only // and /* */', () => {
    test('# is part of a value, not a comment', () => {
        expect(p('{ color: #fff }')).toEqual({ color: '#fff' })
        expect(p('{ a: x # y }')).toEqual({ a: 'x # y' })
        expect(p('[#1, #2]')).toEqual(['#1', '#2'])
        expect(p('a: 1 # x')).toEqual({ a: '1 # x' })
    })

    test('# at the start of a line is not a comment', () => {
        expect(() => p('{\n  # old comment\n  a: 1\n}')).toThrow()
        expect(p('{\n  #tag: 1\n}')).toEqual({ '#tag': 1 })
    })

    test('// and /* */ still work', () => {
        expect(p('{\n  // c\n  a: 1 // c\n  /* c */ b: 2 /* c */\n}')).toEqual({ a: 1, b: 2 })
        expect(p('[1, /* c */ 2] // c')).toEqual([1, 2])
    })

    test('stringify does not quote # anymore', () => {
        expect(s({ color: '#fff', '#k': 1 })).toBe('{\n  color: #fff\n  #k: 1\n}\n')
        expect(rt({ color: '#fff', '#k': 1, a: 'x # y' })).toEqual({ color: '#fff', '#k': 1, a: 'x # y' })
    })

    test('kept comments are written as //', () => {
        const data = Mkon.parse('{\n  // about a\n  a: 1 // after\n}', { keepWsc: true })
        const out = Mkon.stringify(data, { keepWsc: true })
        expect(out).toContain('// about a')
        expect(out).toContain('// after')
        expect(out).not.toContain('#')
    })
})

describe('special floats: NaN, Infinity, +Infinity, -Infinity, -0', () => {
    test('parse literals', () => {
        expect(p('NaN')).toBeNaN()
        expect(p('Infinity')).toBe(Infinity)
        expect(p('+Infinity')).toBe(Infinity)
        expect(p('-Infinity')).toBe(-Infinity)
        expect(Object.is(p('-0'), -0)).toBe(true)
    })

    test('parse in containers, with separators and comments', () => {
        const v = p('{ a: NaN, b: Infinity, c: -Infinity, d: +Infinity // c\n e: -0 }')
        expect(v.a).toBeNaN()
        expect(v.b).toBe(Infinity)
        expect(v.c).toBe(-Infinity)
        expect(v.d).toBe(Infinity)
        expect(Object.is(v.e, -0)).toBe(true)
        const a = p('[NaN, Infinity, -Infinity]')
        expect(a[0]).toBeNaN()
        expect(a.slice(1)).toEqual([Infinity, -Infinity])
    })

    test('other spellings and longer text stay strings', () => {
        expect(p('[nan, inf, -inf, Inf, NAN, infinity, Infinity war, NaN!, +1, + Infinity]'))
            .toEqual(['nan', 'inf', '-inf', 'Inf', 'NAN', 'infinity', 'Infinity war', 'NaN!', '+1', '+ Infinity'])
    })

    test('quoted literals stay strings', () => {
        expect(p('["NaN", \'Infinity\', "-Infinity", "-0"]')).toEqual(['NaN', 'Infinity', '-Infinity', '-0'])
    })

    test('stringify numbers', () => {
        expect(s([NaN, Infinity, -Infinity, -0, 0, 1.5, -2e-7])).toBe('[\n  NaN\n  Infinity\n  -Infinity\n  -0\n  0\n  1.5\n  -2e-7\n]\n')
    })

    test('stringify quotes strings that look like these literals', () => {
        const out = s({ a: 'NaN', b: 'Infinity', c: '-Infinity', d: '+Infinity', e: '-0', f: 'NaN, x' })
        expect(out).toMatch(/a: "NaN"/)
        expect(out).toMatch(/b: "Infinity"/)
        expect(out).toMatch(/c: "-Infinity"/)
        expect(out).toMatch(/d: "\+Infinity"/)
        expect(out).toMatch(/e: "-0"/)
        expect(out).toMatch(/f: "NaN, x"/)
    })

    test('roundtrip keeps numbers numbers and strings strings', () => {
        const data = {
            nums: [NaN, Infinity, -Infinity, -0, 0, 3.14],
            strs: ['NaN', 'Infinity', '-Infinity', '+Infinity', '-0', 'nan', 'inf'],
            obj: { x: NaN, y: 'NaN' },
        }
        for (const opt of [{}, { condense: 200 }, { quotes: 'all' }, { separator: true }]) {
            const back = rt(data, opt)
            expect(Number.isNaN(back.nums[0])).toBe(true)
            expect(back.nums.slice(1, 3)).toEqual([Infinity, -Infinity])
            expect(Object.is(back.nums[3], -0)).toBe(true)
            expect(Object.is(back.nums[4], 0)).toBe(true)
            expect(back.nums[5]).toBe(3.14)
            expect(back.strs).toEqual(data.strs)
            expect(Number.isNaN(back.obj.x)).toBe(true)
            expect(back.obj.y).toBe('NaN')
        }
    })

    test('keys named like literals are fine', () => {
        expect(rt({ NaN: 1, Infinity: 'Infinity' })).toEqual({ NaN: 1, Infinity: 'Infinity' })
    })
})
