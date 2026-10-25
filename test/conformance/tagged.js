// tagged JSON — как передавать значения mkon через JSON без потерь
// (общий формат для JS- и Python-тестов, см. mkon_py/tests/_support.py):
//   NaN / Infinity / -Infinity / -0  →  { "$number": "NaN" } и т.д.
//   Date                             →  { "$date": "2024-01-15T00:00:00.000Z" }

export function encode(v) {
    if (typeof v === 'number') {
        if (Number.isNaN(v)) return { $number: 'NaN' }
        if (v === Infinity) return { $number: 'Infinity' }
        if (v === -Infinity) return { $number: '-Infinity' }
        if (v === 0 && 1 / v < 0) return { $number: '-0' }
        return v
    }
    if (v instanceof Date) return { $date: v.toISOString() }
    if (Array.isArray(v)) return v.map(encode)
    if (v && typeof v === 'object') {
        const o = {}
        for (const k of Object.keys(v)) o[k] = encode(v[k])
        return o
    }
    return v
}

export function decode(v) {
    if (Array.isArray(v)) return v.map(decode)
    if (v && typeof v === 'object') {
        const keys = Object.keys(v)
        if (keys.length === 1 && keys[0] === '$number') return Number(v.$number)
        if (keys.length === 1 && keys[0] === '$date') return new Date(v.$date)
        const o = {}
        for (const k of keys) o[k] = decode(v[k])
        return o
    }
    return v
}
