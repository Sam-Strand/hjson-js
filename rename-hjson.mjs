// rename-hjson.mjs
// usage: node rename-hjson.mjs [dir] [--apply]
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const root = args.find(a => !a.startsWith('--')) ?? '.'
const SKIP = new Set(['node_modules', '.git', 'dist'])

let n = 0
for (const e of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    const dir = e.parentPath ?? e.path
    if (!e.isFile() || !e.name.endsWith('.hjson')) continue
    if (path.relative(root, dir).split(path.sep).some(p => SKIP.has(p))) continue
    const from = path.join(dir, e.name)
    const to = from.slice(0, -'.hjson'.length) + '.mkon'
    if (fs.existsSync(to)) { console.warn('skip, exists:', to); continue }
    console.log(`${from} -> ${to}`)
    if (apply) fs.renameSync(from, to)
    n++
}
console.log(`${n} file(s) ${apply ? 'renamed' : 'to rename (dry run, add --apply)'}`)
