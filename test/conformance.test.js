import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import mkon from '../src/index.js'
import { encode, decode } from './conformance/tagged.js'

// Общий набор кейсов для всех реализаций mkon (JS — эталон, Python — mkon_py).
// Ожидания пересчитываются `node test/conformance/update-cases.mjs`.
const cases = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./conformance/cases.json', import.meta.url)), 'utf8'))

describe('conformance', () => {
    for (const c of cases) {
        test(c.name, () => {
            mkon.setEndOfLine('\n')
            const parse = c.rt ? mkon.rt.parse : mkon.parse
            const stringify = c.rt ? mkon.rt.stringify : mkon.stringify
            const opts = () => ({ ...(c.options || {}) })

            if (c.error) {
                expect(() => ('mkon' in c ? parse(c.mkon) : stringify(decode(c.input), opts()))).toThrow(c.message)
                return
            }
            if ('mkon' in c) {
                const v = parse(c.mkon)
                expect(encode(v)).toEqual(c.value)
                expect(stringify(v, opts())).toBe(c.text)
            } else {
                expect(stringify(decode(c.input), opts())).toBe(c.text)
            }
            // выход должен читаться обратно в то же значение (кроме ANSI-раскраски)
            if (!(c.options && c.options.colors)) expect(encode(parse(c.text))).toEqual(c.value)
        })
    }
})
