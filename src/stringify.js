import { tryParseNumber, getComment, forceComment } from './common.js'
import { loadDsf } from './dsf.js'
import { normalizeOptions } from './options.js'

// ============================================================================
// Tokens
// ============================================================================

const plainToken = {
    obj: ['{', '}'],
    arr: ['[', ']'],
    key: ['', ''],
    qkey: ['"', '"'],
    col: [':', ''],
    com: [',', ''],
    str: ['', ''],
    qstr: ['"', '"'],
    mstr: ["'''", "'''"],
    num: ['', ''],
    lit: ['', ''],
    dsf: ['', ''],
    esc: ['\\', ''],
    uni: ['\\u', ''],
    rem: ['', ''],
}

function makeColorToken() {
    return {
        obj: ['\x1b[37m{\x1b[0m', '\x1b[37m}\x1b[0m'],
        arr: ['\x1b[37m[\x1b[0m', '\x1b[37m]\x1b[0m'],
        key: ['\x1b[33m', '\x1b[0m'],
        qkey: ['\x1b[33m"', '"\x1b[0m'],
        col: ['\x1b[37m:\x1b[0m', ''],
        com: ['\x1b[37m,\x1b[0m', ''],
        str: ['\x1b[37;1m', '\x1b[0m'],
        qstr: ['\x1b[37;1m"', '"\x1b[0m'],
        mstr: ["\x1b[37;1m'''", "'''\x1b[0m"],
        num: ['\x1b[36;1m', '\x1b[0m'],
        lit: ['\x1b[36m', '\x1b[0m'],
        dsf: ['\x1b[37m', '\x1b[0m'],
        esc: ['\x1b[31m\\', '\x1b[0m'],
        uni: ['\x1b[31m\\u', '\x1b[0m'],
        rem: ['\x1b[35m', '\x1b[0m'],
    }
}

// ============================================================================
// stringify()
// ============================================================================

/**
 * Serialize a JS value to an Hjson string.
 *
 * @param {unknown} data - Any JSON-serializable value.
 * @param {object} [opt] - Options.
 * @returns {string}
 */
export default function stringify(data, opt) {
    // ------------------------------------------------------------------
    // Options & tokens
    // ------------------------------------------------------------------
    const nopt = normalizeOptions(opt)
    const {
        eol, indent, keepComments, bracesSameLine, emitRootBraces,
        quoteKeys, quoteChar, condense, separator, dsf, sortProps, colors,
    } = nopt
    let { quoteStrings, multiline } = nopt
    let token = colors === true ? makeColorToken() : plainToken

    if (quoteChar !== '"') {
        const q = quoteChar
        token = {
            ...token,
            qkey: [token.qkey[0].replace(/"/g, q), token.qkey[1].replace(/"/g, q)],
            qstr: [token.qstr[0].replace(/"/g, q), token.qstr[1].replace(/"/g, q)],
        }
    }

    // Каждый token — [left, right, leftLen, rightLen].
    // leftLen/rightLen — «видимая» длина без ANSI (для condense).
    for (const k of Object.keys(plainToken)) {
        token[k].push(plainToken[k][0].length, plainToken[k][1].length)
    }

    const runDsf = loadDsf(dsf, 'stringify')

    // ------------------------------------------------------------------
    // Regexes / char tables
    // ------------------------------------------------------------------
    const commonRange =
        '\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff'
    const quoteEsc = quoteChar === '"' ? '\\"' : "'"
    const needsEscape = new RegExp('[\\\\' + quoteEsc + '\x00-\x1f' + commonRange + ']', 'g')
    const needsQuotes = new RegExp(
        '^\\s|^"|^\'|^#|^\\/\\*|^\\/\\/|^\\{|^\\}|^\\[|^\\]|^:|^,|\\s$|[\x00-\x1f' + commonRange + ']',
        'g',
    )
    const needsEscapeML = new RegExp(
        '\'\'\'|^[\\s]+$|[\x00-' + (multiline === 2 ? '\x09' : '\x08') +
        '\x0b\x0c\x0e-\x1f' + commonRange + ']',
        'g',
    )
    const startsWithKeyword = new RegExp('^(true|false|null)\\s*((,|\\]|\\}|#|//|/\\*).*)?$')
    const needsEscapeName = /[,\{\[\}\]\s:#"']|\/\/|\/\*/
    const meta = {
        '\b': 'b', '\t': 't', '\n': 'n', '\f': 'f', '\r': 'r',
        '"': '"', "'": "'", '\\': '\\',
    }

    // ------------------------------------------------------------------
    // Mutable state
    // ------------------------------------------------------------------
    let gap = ''      // текущий отступ (только пробелы)
    let wrapLen = 0   // «видимая» длина текущего куска (для condense)

    // ==================================================================
    // Small helpers (без state)
    // ==================================================================

    const startsWithNL = (s) => !!(s && s[s[0] === '\r' ? 1 : 0] === '\n')
    const commentOnThisLine = (s) => !!s && !startsWithNL(s)

    function escapeRegExp(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    function wrap(tk, v) {
        wrapLen += tk[0].length + tk[1].length - tk[2] - tk[3]
        return tk[0] + v + tk[1]
    }

    function quoteReplace(string) {
        return string.replace(needsEscape, (a) => {
            const c = meta[a]
            if (typeof c === 'string') return wrap(token.esc, c)
            return wrap(token.uni, ('0000' + a.charCodeAt(0).toString(16)).slice(-4))
        })
    }

    // ==================================================================
    // Comments
    // ==================================================================

    /** Привести многострочный комментарий к отступу indentLevel. */
    function reindent(text, indentLevel) {
        return text
            .split('\n')
            .map((line) => {
                const stripped = line.replace(/^\s+/, '')
                return stripped ? indentLevel + stripped : ''
            })
            .join('\n')
    }

    /** Полный рендер комментария: forceComment → reindent → покраска. */
    function renderComment(s, indentLevel) {
        if (!s) return ''
        return wrap(token.rem, reindent(forceComment(s), indentLevel))
    }

    /** Inline-комментарий (на той же строке, что значение). */
    function renderInlineComment(s) {
        if (!s) return ''
        return ' ' + wrap(token.rem, forceComment(s).replace(/^\s+/, ''))
    }

    // ==================================================================
    // Strings / keys
    // ==================================================================

    function quote(string, hasComment, isRootObject, noIndent) {
        if (!string) return wrap(token.qstr, '')

        needsQuotes.lastIndex = 0
        startsWithKeyword.lastIndex = 0

        if (
            quoteStrings || hasComment ||
            needsQuotes.test(string) ||
            tryParseNumber(string, true) !== undefined ||
            startsWithKeyword.test(string)
        ) {
            needsEscape.lastIndex = 0
            needsEscapeML.lastIndex = 0
            if (!needsEscape.test(string)) return wrap(token.qstr, string)
            if (!needsEscapeML.test(string) && !isRootObject && multiline)
                return mlString(string, gap, bracesSameLine || noIndent, noIndent)
            return wrap(token.qstr, quoteReplace(string))
        }
        return wrap(token.str, string)
    }

    function mlString(string, currentGap, sameLine, shallow) {
        const a = string.replace(/\r/g, '').split('\n')
        if (!shallow) currentGap += indent

        if (a.length === 1 && a[0][0] !== "'" && a[0][a[0].length - 1] !== "'") {
            return wrap(token.mstr, a[0])
        }
        let res = (sameLine ? '' : eol + currentGap) + token.mstr[0]
        for (let i = 0; i < a.length; i++) {
            res += eol
            if (a[i]) res += currentGap + a[i]
        }
        return res + eol + currentGap + token.mstr[1]
    }

    function quoteKey(name) {
        if (!name) return token.qkey[0] + token.qkey[1]
        if (quoteKeys || needsEscapeName.test(name)) {
            needsEscape.lastIndex = 0
            return wrap(token.qkey, needsEscape.test(name) ? quoteReplace(name) : name)
        }
        return wrap(token.key, name)
    }

    // ==================================================================
    // Opening brackets helpers
    // ==================================================================

    /**
     * Общая «шапка» для strArray / strObject: считает mind, gap, eolMind,
     * eolGap, prefix и заводит partial / cpartial.
     */
    function openContainer(noIndent) {
        const mind = gap
        gap += indent
        const eolMind = eol + mind
        const eolGap = eol + gap
        const prefix = noIndent || bracesSameLine ? '' : eolMind
        return {
            mind, eolMind, eolGap, prefix,
            partial: [],
            cpartial: condense ? [] : null,
            saveQuoteStrings: quoteStrings,
            saveMultiline: multiline,
            iseparator: separator ? '' : token.com[0],
            cwrapLen: 0,
        }
    }

    /**
     * Общая «подошва»: закрывает контейнер, восстанавливает gap,
     * подставляет condense-версию, если она влезла.
     */
    function closeContainer(ctx, tk, value, res) {
        gap = ctx.mind
        return res
    }

    /**
     * Рендер before-comment / пустой строки.
     * Возвращает то, что надо положить в partial: `\n<gap># c\n<gap>` либо `\n<gap>`.
     */
    function beforeComment(c, indentLevel) {
        if (c && c[0]) {
            const bc = renderComment(c[0], indentLevel)
            if (bc) return eol + bc + eolGap()
        }
        return eolGap()
    }

    // маленький алиас, чтобы beforeComment не тянул ctx
    function eolGap() { return eol + gap }

    /**
     * Рендер after-comment (того, что стоит на строке значения).
     * Возвращает '' или ` # ...` / `\n<gap># ...`.
     */
    function afterComment(c, ca, indentLevel) {
        if (!c || !c[1]) return ''
        if (ca) return renderInlineComment(c[1])
        return eol + renderComment(c[1], indentLevel)
    }

    // ==================================================================
    // Dispatching
    // ==================================================================

    function str(value, hasComment, noIndent, isRootObject) {
        const dsfValue = runDsf(value)
        if (dsfValue !== undefined) return wrap(token.dsf, dsfValue)

        switch (typeof value) {
            case 'string':
                return quote(value, hasComment, isRootObject, noIndent)
            case 'number':
                return isFinite(value)
                    ? wrap(token.num, String(value))
                    : wrap(token.lit, 'null')
            case 'boolean':
                return wrap(token.lit, String(value))
            case 'object': {
                if (!value) return wrap(token.lit, 'null')
                const comments = keepComments ? getComment(value) : null
                const isArray = Object.prototype.toString.apply(value) === '[object Array]'
                return isArray
                    ? strArray(value, comments, noIndent)
                    : strObject(value, comments, noIndent)
            }
        }
    }

    // ==================================================================
    // Arrays
    // ==================================================================

    function strArray(value, comments, noIndent) {
        const ctx = openContainer(noIndent)
        const { partial, cpartial } = ctx

        for (let i = 0, length = value.length; i < length; i++) {
            const setsep = i < length - 1
            const c = comments ? (comments.a[i] || []) : null
            const ca = c ? commentOnThisLine(c[1]) : false

            // before-comment / eol+indent
            if (comments) {
                partial.push(beforeComment(c, gap))
                if (cpartial && (c[0] || c[1] || ca)) {
                    cpartial.length = 0
                    cpartial.disabled = true
                }
            } else {
                partial.push(eolGap())
            }

            // value
            wrapLen = 0
            const v = value[i]
            partial.push(str(v, comments ? ca : false, true) + (setsep ? separator : ''))

            // condense-вариант
            if (cpartial && !cpartial.disabled) {
                switch (typeof v) {
                    case 'string':
                        wrapLen = 0
                        quoteStrings = true
                        multiline = 0
                        cpartial.push(str(v, false, true) + (setsep ? token.com[0] : ''))
                        quoteStrings = ctx.saveQuoteStrings
                        multiline = ctx.saveMultiline
                        break
                    case 'object':
                        if (v) { cpartial.disabled = true; break }
                    // falls through
                    default:
                        cpartial.push(partial[partial.length - 1] + (setsep ? ctx.iseparator : ''))
                }
                if (setsep) wrapLen += token.com[0].length - token.com[2]
                ctx.cwrapLen += wrapLen
            }

            // after-comment
            const ac = afterComment(c, ca, gap)
            if (ac) partial.push(ac)
        }

        // closing / empty
        if (value.length === 0) {
            if (comments && comments.e) {
                const ec = renderComment(comments.e[0], ctx.mind)
                partial.push(ec ? ctx.eolMind + ec + ctx.eolMind : ctx.eolMind)
            }
            // если комментариев нет — partial остаётся пустым → `[]`
        } else {
            partial.push(ctx.eolMind)
        }

        let res
        if (partial.length === 0) {
            res = wrap(token.arr, '')
        } else {
            res = ctx.prefix + wrap(token.arr, partial.join(''))
            if (cpartial && !cpartial.disabled) {
                const cres = cpartial.join(' ')
                if (cres.length - ctx.cwrapLen <= condense) res = wrap(token.arr, cres)
            }
        }
        return closeContainer(ctx, token.arr, value, res)
    }

    // ==================================================================
    // Objects
    // ==================================================================

    function strObject(value, comments, noIndent) {
        const ctx = openContainer(noIndent)
        const { partial, cpartial } = ctx

        // порядок ключей: сначала несущие комментарии, затем остальные
        const commentKeys = comments ? comments.o.slice() : []
        const objectKeys = []
        for (const k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k) && commentKeys.indexOf(k) < 0) {
                objectKeys.push(k)
            }
        }
        if (sortProps) objectKeys.sort()
        const keys = commentKeys.concat(objectKeys)

        for (let i = 0, length = keys.length; i < length; i++) {
            const setsep = i < length - 1
            const k = keys[i]
            const c = comments ? (comments.c[k] || []) : null
            const ca = c ? commentOnThisLine(c[1]) : false

            // before-comment / eol+indent
            if (comments) {
                partial.push(beforeComment(c, gap))
                if (cpartial && (c[0] || c[1] || ca)) cpartial.disabled = true
            } else {
                partial.push(eolGap())
            }

            // key: value
            wrapLen = 0
            const v = value[k]
            const vs = str(v, comments && ca)
            partial.push(
                quoteKey(k) +
                token.col[0] +
                (startsWithNL(vs) ? '' : ' ') +
                vs +
                (setsep ? separator : ''),
            )

            // after-comment
            const ac = afterComment(c, ca, gap)
            if (ac) partial.push(ac)

            // condense-вариант
            if (cpartial && !cpartial.disabled) {
                switch (typeof v) {
                    case 'string': {
                        wrapLen = 0
                        quoteStrings = true
                        multiline = 0
                        const vs2 = str(v, false)
                        quoteStrings = ctx.saveQuoteStrings
                        multiline = ctx.saveMultiline
                        cpartial.push(
                            quoteKey(k) + token.col[0] + ' ' + vs2 + (setsep ? token.com[0] : ''),
                        )
                        break
                    }
                    case 'object':
                        if (v) { cpartial.disabled = true; break }
                    // falls through
                    default:
                        cpartial.push(partial[partial.length - 1] + (setsep ? ctx.iseparator : ''))
                }
                wrapLen += token.col[0].length - token.col[2]
                if (setsep) wrapLen += token.com[0].length - token.com[2]
                ctx.cwrapLen += wrapLen
            }
        }

        // closing / empty
        if (keys.length === 0) {
            if (comments && comments.e) {
                const ec = renderComment(comments.e[0], ctx.mind)
                partial.push(ec ? ctx.eolMind + ec + ctx.eolMind : ctx.eolMind)
            }
            // если комментариев нет — partial остаётся пустым → `{}`
        } else {
            partial.push(ctx.eolMind)
        }

        let res
        if (partial.length === 0) {
            res = wrap(token.obj, '')
        } else {
            res = ctx.prefix + wrap(token.obj, partial.join(''))
            if (cpartial && !cpartial.disabled) {
                const cres = cpartial.join(' ')
                if (cres.length - ctx.cwrapLen <= condense) res = wrap(token.obj, cres)
            }
        }
        return closeContainer(ctx, token.obj, value, res)
    }

    // ==================================================================
    // Root assembly
    // ==================================================================

    const dataComments = keepComments ? getComment(data) : null
    const rootComments = dataComments && dataComments.r
    let res = str(data, null, true, true)

    // снять корневые скобки, если не просили их печатать
    if (
        typeof data === 'object' && data !== null && !Array.isArray(data) &&
        !emitRootBraces && res[0] === '{' && res[res.length - 1] === '}'
    ) {
        res = res
            .slice(1, -1)
            .replace(new RegExp('\\n' + escapeRegExp(indent), 'g'), '\n')

        if (res[0] === '\n') res = res.slice(1)
        if (res[res.length - 1] === '\n') res = res.slice(0, -1)
    }

    if (rootComments && rootComments[0]) {
        res = rootComments[0].replace(/\s+$/, '') + eol + res
    }
    if (rootComments && rootComments[1]) {
        res += rootComments[1].replace(/\s+$/, '')
    }
    if (!res.endsWith(eol)) res += eol

    return res
}
