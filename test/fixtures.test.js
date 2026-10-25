import { describe, expect, test } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mkon from '../src/index.js'

const rootDir = fileURLToPath(new URL('./assets/', import.meta.url))

const defaultOptions = {
    legacyRoot: false
}

function load(file) {
    return readFileSync(join(rootDir, file), 'utf8')
        .replace(/\r/g, '')
}

function loadMeta(name) {
    const file = join(rootDir, `${name}_testmeta.mkon`)

    if (!existsSync(file)) {
        return defaultOptions
    }

    return mkon.parse(readFileSync(file, 'utf8'))
}

const tests = readFileSync(join(rootDir, 'testlist.txt'), 'utf8')
    .split('\n')
    .filter(Boolean)

describe('mkon fixtures', () => {
    for (const file of tests) {
        const parts = file.split('_test.')

        if (parts.length < 2) continue

        const isJson = parts[1] === 'json'
        const name = parts[0]

        describe(name, () => {
            test('parse/stringify', () => {
                const text = load(file)
                const shouldFail = name.startsWith('fail')
                const meta = loadMeta(name)

                mkon.setEndOfLine('\n')

                if (shouldFail) {
                    expect(() => mkon.parse(text)).toThrow()
                    return
                }

                const data = mkon.parse(text)

                const jsonFromData = JSON.stringify(data, null, 2)
                const mkonFromData = mkon.stringify(data, meta.options)

                const jsonResultRaw = load(`${name}_result.json`)
                const jsonResult = JSON.stringify(
                    JSON.parse(jsonResultRaw),
                    null,
                    2
                )

                const mkonResult = load(`${name}_result.mkon`)

                expect(jsonFromData).toBe(jsonResult)
                expect(mkonFromData).toBe(mkonResult)

                expect(jsonResultRaw).toBe(jsonResult)

                if (isJson) {
                    expect(JSON.stringify(data))
                        .toBe(JSON.stringify(JSON.parse(text)))
                }
            })
        })
    }
})
