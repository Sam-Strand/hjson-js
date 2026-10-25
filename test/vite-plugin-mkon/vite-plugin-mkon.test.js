import { test, describe, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mkon from '../../src/vite-plugin-mkon.js'
import { typeOf, declarationFor, declarationPath } from '../../src/mkon-types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(__dirname, 'fixtures')

function runRaw(file, { options = {}, query = '' } = {}) {
    // объявления проверяются отдельно, в фикстуры их не пишем
    const plugin = mkon({ dts: false, ...options })
    const abs = path.join(FIXTURES, file)
    const id = query ? `${abs}?${query}` : abs

    const ctx = {
        errors: [],
        error(msg) {
            this.errors.push(msg)
            throw new Error(msg)
        },
    }

    const result = plugin.transform.call(ctx, '', id)
    if (result == null) return null
    return result.code
}

function run(file, opts) {
    const code = runRaw(file, opts)
    if (code == null) return null
    const src = code.replace(/^export default\s+/, '').replace(/;\s*$/, '')
    return new Function(`return (${src});`)()
}

function runExpectError(file, opts) {
    expect(() => run(file, opts)).toThrow(/\[mkon\]/)
}

describe('vite-plugin-mkon', () => {
    describe('базовый парсинг', () => {
        test('парсит простой mkon', () => {
            expect(runRaw('basic.mkon')).toBe(
                'export default {"name":"test","version":"1.0.0","enabled":true};'
            )
        })

        test('парсит вложенные объекты и массивы', () => {
            expect(runRaw('arrays.mkon')).toBe(
                'export default {"items":[{"id":1,"name":"one"},{"id":2,"name":"two"},{"id":3,"name":"three"}],"tags":["a","b","c"]};'
            )
        })

        test('игнорирует комментарии', () => {
            expect(runRaw('config.mkon')).toBe(
                'export default {"server":{"host":"localhost","port":3000},"db":{"url":"postgres://localhost","user":"root","password":"root"}};'
            )
        })

        test('возвращает null для не-mkon файла', () => {
            const plugin = mkon()
            const ctx = { error: () => {} }
            expect(plugin.transform.call(ctx, '', '/tmp/foo.js')).toBeNull()
        })
    })

    describe('query: pick', () => {
        test('выбирает один путь (возвращает значение)', () => {
            expect(runRaw('nested.mkon', { query: 'pick=a.b.c' })).toBe(
                'export default "deep";'
            )
        })

        test('выбирает несколько путей (возвращает объект)', () => {
            expect(
                runRaw('nested.mkon', { query: 'pick=a.b.c,a.b.d,e' })
            ).toBe(
                'export default {"a.b.c":"deep","a.b.d":"also-deep","e":"top"};'
            )
        })

        test('поддерживает пробелы вокруг запятых', () => {
            expect(
                runRaw('nested.mkon', { query: 'pick=a.b.c , e' })
            ).toBe('export default {"a.b.c":"deep","e":"top"};')
        })

        test('падает с ctx.error, если путь не найден', () => {
            runExpectError('nested.mkon', { query: 'pick=a.b.zzz' })
        })
    })

    describe('query: omit', () => {
        test('удаляет один путь', () => {
            expect(runRaw('user.mkon', { query: 'omit=password' })).toBe(
                'export default {"id":42,"name":"Alice","role":"admin","profile":{"email":"alice@example.com","age":30}};'
            )
        })

        test('удаляет вложенные пути', () => {
            expect(
                runRaw('user.mkon', { query: 'omit=profile.email' })
            ).toBe(
                'export default {"id":42,"name":"Alice","password":"secret","role":"admin","profile":{"age":30}};'
            )
        })

        test('удаляет несколько путей', () => {
            expect(
                runRaw('user.mkon', { query: 'omit=password,profile.email' })
            ).toBe(
                'export default {"id":42,"name":"Alice","role":"admin","profile":{"age":30}};'
            )
        })

        test('не падает на несуществующем пути', () => {
            expect(runRaw('user.mkon', { query: 'omit=nope.nope' })).toBe(
                'export default {"id":42,"name":"Alice","password":"secret","role":"admin","profile":{"email":"alice@example.com","age":30}};'
            )
        })
    })

    describe('pick + omit вместе', () => {
        test('сначала pick, потом omit', () => {
            expect(
                runRaw('config.mkon', {
                    query: 'pick=server,db&omit=db.password,server.port',
                })
            ).toBe(
                'export default {"server":{"host":"localhost"},"db":{"url":"postgres://localhost","user":"root"}};'
            )
        })
    })

    describe('handlers', () => {
        test('применяет handler по ?as=', () => {
            expect(
                runRaw('user.mkon', {
                    options: {
                        handlers: { public: ({ password, ...rest }) => rest },
                    },
                    query: 'as=public',
                })
            ).toBe(
                'export default {"id":42,"name":"Alice","role":"admin","profile":{"email":"alice@example.com","age":30}};'
            )
        })

        test('применяет default handler без ?as=', () => {
            expect(
                runRaw('basic.mkon', {
                    options: {
                        default: 'upper',
                        handlers: {
                            upper: (v) => ({ ...v, name: v.name.toUpperCase() }),
                        },
                    },
                })
            ).toBe(
                'export default {"name":"TEST","version":"1.0.0","enabled":true};'
            )
        })

        test('?as= переопределяет default', () => {
            expect(
                runRaw('basic.mkon', {
                    options: {
                        default: 'upper',
                        handlers: {
                            upper: (v) => ({ ...v, name: v.name.toUpperCase() }),
                            version: (v) => ({ version: v.version }),
                        },
                    },
                    query: 'as=version',
                })
            ).toBe('export default {"version":"1.0.0"};')
        })

        test('handler работает до pick/omit', () => {
            expect(
                runRaw('user.mkon', {
                    options: {
                        handlers: {
                            mask: (value) => ({ ...value, password: '***' }),
                        },
                    },
                    query: 'as=mask&pick=password,name',
                })
            ).toBe('export default {"password":"***","name":"Alice"};')
        })

        test('падает на неизвестном handler', () => {
            runExpectError('basic.mkon', { query: 'as=nope' })
        })
    })

    describe('свойства плагина', () => {
        test('name и enforce', () => {
            const p = mkon()
            expect(p.name).toBe('vite-plugin-mkon')
            expect(p.enforce).toBe('pre')
        })

        test('map === null', () => {
            const p = mkon({ dts: false })
            const ctx = { error: () => {} }
            const id = path.join(FIXTURES, 'basic.mkon')
            const res = p.transform.call(ctx, '', id)
            expect(res.map).toBeNull()
        })
    })

    describe('типы (dts)', () => {
        test('выводит примитивы, массивы и вложенные объекты', () => {
            expect(typeOf({ a: 1, b: 'x', c: true, d: null, e: [] })).toBe(
                '{\n    a: number\n    b: string\n    c: boolean\n    d: null\n    e: unknown[]\n}'
            )
        })

        test('сливает объекты в массиве, отсутствующие ключи — необязательные', () => {
            expect(typeOf([{ id: 1, name: 'a' }, { id: 2 }])).toBe('{\n    id: number\n    name?: string\n}[]')
        })

        test('объединяет разные типы элементов', () => {
            expect(typeOf([1, 'a', 2])).toBe('(number | string)[]')
        })

        test('кавычит ключи, которые не являются идентификаторами', () => {
            expect(typeOf({ 'a-b': 1, '1x': 2 })).toBe('{\n    "a-b": number\n    "1x": number\n}')
        })

        test('путь объявления', () => {
            expect(declarationPath('/x/config.mkon')).toBe('/x/config.d.mkon.ts')
        })

        test('declarationFor экспортирует default', () => {
            expect(declarationFor({ a: 1 }, 'a.mkon')).toMatch(/declare const value: \{\n {4}a: number\n\}\nexport default value\n$/)
        })

        function tempProject() {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mkon-dts-'))
            fs.writeFileSync(path.join(root, 'user.mkon'), fs.readFileSync(path.join(FIXTURES, 'user.mkon')))
            fs.writeFileSync(path.join(root, 'broken.mkon'), '{ a: "\\uxxxx" }')
            return root
        }
        const ctx = { error: (m) => { throw new Error(m) } }

        test('объявление пишется при импорте и учитывает default handler', () => {
            const root = tempProject()
            const file = path.join(root, 'user.mkon')
            const p = mkon({ default: 'public', handlers: { public: ({ password, ...rest }) => rest } })
            p.transform.call(ctx, '', file)
            const dts = fs.readFileSync(declarationPath(file), 'utf8')
            expect(dts).toContain('profile: {')
            expect(dts).not.toContain('password')
        })

        test('неимпортированные .mkon не трогаются (в том числе битые)', () => {
            const root = tempProject()
            mkon().transform.call(ctx, '', path.join(root, 'user.mkon'))
            expect(fs.existsSync(path.join(root, 'broken.d.mkon.ts'))).toBe(false)
        })

        test('transform без query обновляет объявление, с query — нет', () => {
            const root = tempProject()
            const file = path.join(root, 'user.mkon')
            const p = mkon()
            p.transform.call(ctx, '', file + '?pick=name')
            expect(fs.existsSync(declarationPath(file))).toBe(false)
            p.transform.call(ctx, '', file)
            expect(fs.existsSync(declarationPath(file))).toBe(true)
        })

        test('dts: false ничего не пишет', () => {
            const root = tempProject()
            mkon({ dts: false }).transform.call(ctx, '', path.join(root, 'user.mkon'))
            expect(fs.existsSync(path.join(root, 'user.d.mkon.ts'))).toBe(false)
        })
    })
})
