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

fs.writeFileSync(file, JSON.stringify(cases, null, 2) + '\n')
console.log(`updated ${cases.length} cases`)
