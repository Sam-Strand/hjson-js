import { test, describe, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import hjson from '../../src/vite-plugin-hjson.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(__dirname, 'fixtures')

function runRaw(file, { options = {}, query = '' } = {}) {
    const plugin = hjson(options)
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
    expect(() => run(file, opts)).toThrow(/\[hjson\]/)
}

describe('vite-plugin-hjson', () => {
    describe('базовый парсинг', () => {
        test('парсит простой hjson', () => {
            expect(runRaw('basic.hjson')).toBe(
                'export default {"name":"test","version":"1.0.0","enabled":true};'
            )
        })

        test('парсит вложенные объекты и массивы', () => {
            expect(runRaw('arrays.hjson')).toBe(
                'export default {"items":[{"id":1,"name":"one"},{"id":2,"name":"two"},{"id":3,"name":"three"}],"tags":["a","b","c"]};'
            )
        })

        test('игнорирует комментарии', () => {
            expect(runRaw('config.hjson')).toBe(
                'export default {"server":{"host":"localhost","port":3000},"db":{"url":"postgres://localhost","user":"root","password":"root"}};'
            )
        })

        test('возвращает null для не-hjson файла', () => {
            const plugin = hjson()
            const ctx = { error: () => {} }
            expect(plugin.transform.call(ctx, '', '/tmp/foo.js')).toBeNull()
        })
    })

    describe('query: pick', () => {
        test('выбирает один путь (возвращает значение)', () => {
            expect(runRaw('nested.hjson', { query: 'pick=a.b.c' })).toBe(
                'export default "deep";'
            )
        })

        test('выбирает несколько путей (возвращает объект)', () => {
            expect(
                runRaw('nested.hjson', { query: 'pick=a.b.c,a.b.d,e' })
            ).toBe(
                'export default {"a.b.c":"deep","a.b.d":"also-deep","e":"top"};'
            )
        })

        test('поддерживает пробелы вокруг запятых', () => {
            expect(
                runRaw('nested.hjson', { query: 'pick=a.b.c , e' })
            ).toBe('export default {"a.b.c":"deep","e":"top"};')
        })

        test('падает с ctx.error, если путь не найден', () => {
            runExpectError('nested.hjson', { query: 'pick=a.b.zzz' })
        })
    })

    describe('query: omit', () => {
        test('удаляет один путь', () => {
            expect(runRaw('user.hjson', { query: 'omit=password' })).toBe(
                'export default {"id":42,"name":"Alice","role":"admin","profile":{"email":"alice@example.com","age":30}};'
            )
        })

        test('удаляет вложенные пути', () => {
            expect(
                runRaw('user.hjson', { query: 'omit=profile.email' })
            ).toBe(
                'export default {"id":42,"name":"Alice","password":"secret","role":"admin","profile":{"age":30}};'
            )
        })

        test('удаляет несколько путей', () => {
            expect(
                runRaw('user.hjson', { query: 'omit=password,profile.email' })
            ).toBe(
                'export default {"id":42,"name":"Alice","role":"admin","profile":{"age":30}};'
            )
        })

        test('не падает на несуществующем пути', () => {
            expect(runRaw('user.hjson', { query: 'omit=nope.nope' })).toBe(
                'export default {"id":42,"name":"Alice","password":"secret","role":"admin","profile":{"email":"alice@example.com","age":30}};'
            )
        })
    })

    describe('pick + omit вместе', () => {
        test('сначала pick, потом omit', () => {
            expect(
                runRaw('config.hjson', {
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
                runRaw('user.hjson', {
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
                runRaw('basic.hjson', {
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
                runRaw('basic.hjson', {
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
                runRaw('user.hjson', {
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
            runExpectError('basic.hjson', { query: 'as=nope' })
        })
    })

    describe('свойства плагина', () => {
        test('name и enforce', () => {
            const p = hjson()
            expect(p.name).toBe('vite-plugin-hjson')
            expect(p.enforce).toBe('pre')
        })

        test('map === null', () => {
            const p = hjson()
            const ctx = { error: () => {} }
            const id = path.join(FIXTURES, 'basic.hjson')
            const res = p.transform.call(ctx, '', id)
            expect(res.map).toBeNull()
        })
    })
})