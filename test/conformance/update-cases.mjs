// Пересчитывает ожидаемые результаты в cases.json по текущей JS-реализации (эталон).
//
//   node test/conformance/update-cases.mjs
//
// Каждый кейс задаёт вход — `mkon` (текст) или `input` (значение в tagged JSON) —
// и опционально `options`, `rt`. Скрипт дописывает ожидания:
//   value — результат parse (tagged JSON) или error/message, если parse падает;
//   text  — stringify(parse(mkon)) или stringify(input).
// После запуска посмотрите `git diff cases.json`: изменения ожиданий = изменения стандарта.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mkon from '../../src/index.js'
import { encode, decode } from './tagged.js'

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases.json')
const cases = JSON.parse(fs.readFileSync(file, 'utf8'))

for (const c of cases) {
    for (const k of ['value', 'text', 'error', 'message']) delete c[k]
    mkon.setEndOfLine('\n')
    const parse = c.rt ? mkon.rt.parse : mkon.parse
    const stringify = c.rt ? mkon.rt.stringify : mkon.stringify
    try {
        if ('mkon' in c) {
            const v = parse(c.mkon)
            c.value = encode(v)
            c.text = stringify(v, { ...(c.options || {}) })
        } else {
            c.text = stringify(decode(c.input), { ...(c.options || {}) })
            c.value = encode(parse(c.text))
        }
    } catch (e) {
        c.error = true
        c.message = String(e.message).split(' at line ')[0]
    }
}

// невидимые символы и U+2028/U+2029 пишем как \uXXXX: иначе редакторы ругаются на «необычные концы строк»
const INVISIBLE = /[\u007f-\u00a0\u00ad\u061c\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]/g
const json = JSON.stringify(cases, null, 2).replace(INVISIBLE, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
fs.writeFileSync(file, json + '\n')
console.log(`updated ${cases.length} cases`)
