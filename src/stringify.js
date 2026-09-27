import { tryParseNumber, getComment, EOL, forceComment} from './common'
import { loadDsf } from './dsf'

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

/**
 * Serialize a JS value to an Hjson string.
 *
 * @param {unknown} data - Any JSON-serializable value.
 * @param {object} [opt] - Options.
 * @returns {string}
 */
export default function stringify(data, opt) {
    // options
    let eol = EOL
    let indent = '  '
    let keepComments = false
    let bracesSameLine = false
    let quoteKeys = false
    let quoteStrings = false
    let condense = 0
    let multiline = 1 // std=1, no-tabs=2, off=0
    let separator = '' // comma separator
    let dsfDef = null
    let sortProps = false
    let emitRootBraces = true
    let token = plainToken
    let quoteChar = '"'

    if (opt && typeof opt === 'object') {
        opt.quotes = opt.quotes === 'always' ? 'strings' : opt.quotes // legacy

        if (opt.quoteChar === "'" || opt.quoteChar === '"') {
            quoteChar = opt.quoteChar
        }

        if (opt.eol === '\n' || opt.eol === '\r\n') eol = opt.eol
        keepComments = opt.keepWsc
        condense = opt.condense || 0
        bracesSameLine = opt.bracesSameLine
        emitRootBraces = opt.emitRootBraces !== false
        quoteKeys = opt.quotes === 'all' || opt.quotes === 'keys'
        quoteStrings = opt.quotes === 'all' || opt.quotes === 'strings' || opt.separator === true
        if (quoteStrings || opt.multiline === 'off') multiline = 0
        else multiline = opt.multiline === 'no-tabs' ? 2 : 1
        separator = opt.separator === true ? token.com[0] : ''
        dsfDef = opt.dsf
        sortProps = opt.sortProps

        // If the space parameter is a number, make an indent string containing that
        // many spaces. If it is a string, it will be used as the indent string.
        if (typeof opt.space === 'number') {
            indent = new Array(opt.space + 1).join(' ')
        } else if (typeof opt.space === 'string') {
            indent = opt.space
        }

        if (opt.colors === true) {
            token = {
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
        if (quoteChar !== '"') {
            const q = quoteChar
            token = {
                ...token,
                qkey: [
                    token.qkey[0].replace(/"/g, q),
                    token.qkey[1].replace(/"/g, q),
                ],
                qstr: [
                    token.qstr[0].replace(/"/g, q),
                    token.qstr[1].replace(/"/g, q),
                ],
            }
        }
        for (const k of Object.keys(plainToken)) {
            token[k].push(plainToken[k][0].length, plainToken[k][1].length)
        }
    }

    //
    const runDsf = loadDsf(dsfDef, 'stringify') // domain specific formats

    const commonRange =
        '\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff'
    // needsEscape tests if the string can be written without escapes
    const quoteEsc = quoteChar === '"' ? '\\"' : "'"
    const needsEscape = new RegExp('[\\\\' + quoteEsc + '\x00-\x1f' + commonRange + ']', 'g')
    // needsQuotes tests if the string can be written as a quoteless string (like needsEscape but without \\ and \")
    const needsQuotes = new RegExp(
        '^\\s|^"|^\'|^#|^\\/\\*|^\\/\\/|^\\{|^\\}|^\\[|^\\]|^:|^,|\\s$|[\x00-\x1f' +
            commonRange +
            ']',
        'g',
    )
    // needsEscapeML tests if the string can be written as a multiline string (like needsEscape but without \n, \r, \\, \", \t unless multines is 'std')
    const needsEscapeML = new RegExp(
        '\'\'\'|^[\\s]+$|[\x00-' +
            (multiline === 2 ? '\x09' : '\x08') +
            '\x0b\x0c\x0e-\x1f' +
            commonRange +
            ']',
        'g',
    )
    // starts with a keyword and optionally is followed by a comment
    const startsWithKeyword = new RegExp('^(true|false|null)\\s*((,|\\]|\\}|#|//|/\\*).*)?$')
    const meta = {
        // table of character substitutions
        '\b': 'b',
        '\t': 't',
        '\n': 'n',
        '\f': 'f',
        '\r': 'r',
        '"': '"',
        "'": "'",
        '\\': '\\',
    }
    const needsEscapeName = /[,\{\[\}\]\s:#"']|\/\/|\/\*/
    let gap = ''
    let wrapLen = 0

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

    function quote(string, gap, hasComment, isRootObject) {
        if (!string) return wrap(token.qstr, '')

        needsQuotes.lastIndex = 0
        startsWithKeyword.lastIndex = 0

        // Check if we can insert this string without quotes
        // see hjson syntax (must not parse as true, false, null or number)
        if (
            quoteStrings ||
            hasComment ||
            needsQuotes.test(string) ||
            tryParseNumber(string, true) !== undefined ||
            startsWithKeyword.test(string)
        ) {
            // If the string contains no control characters, no quote characters, and no
            // backslash characters, then we can safely slap some quotes around it.
            // Otherwise we first check if the string can be expressed in multiline
            // format or we must replace the offending characters with safe escape
            // sequences.
            needsEscape.lastIndex = 0
            needsEscapeML.lastIndex = 0
            if (!needsEscape.test(string)) return wrap(token.qstr, string)
            if (!needsEscapeML.test(string) && !isRootObject && multiline)
                return mlString(string, gap, bracesSameLine)
            return wrap(token.qstr, quoteReplace(string))
        }
        // return without quotes
        return wrap(token.str, string)
    }

    function mlString(string, gap, sameLine) {
        const a = string.replace(/\r/g, '').split('\n')
        gap += indent

        if (a.length === 1 && a[0][0] !== "'" && a[0][a[0].length - 1] !== "'") {
            return wrap(token.mstr, a[0])
        }
        let res = (sameLine ? '' : eol + gap) + token.mstr[0]
        for (let i = 0; i < a.length; i++) {
            res += eol
            if (a[i]) res += gap + a[i]
        }
        return res + eol + gap + token.mstr[1]
    }

    function quoteKey(name) {
        if (!name) return token.qkey[0] + token.qkey[1]

        // Check if we can insert this key without quotes
        if (quoteKeys || needsEscapeName.test(name)) {
            needsEscape.lastIndex = 0
            return wrap(token.qkey, needsEscape.test(name) ? quoteReplace(name) : name)
        }
        // return without quotes
        return wrap(token.key, name)
    }

    function str(value, hasComment, noIndent, isRootObject) {
        // Produce a string from value.

        const startsWithNL = (s) => s && s[s[0] === '\r' ? 1 : 0] === '\n'
        const commentOnThisLine = (s) => s && !startsWithNL(s)
        const makeComment = (s, prefix, trim) => {
            if (!s) return ''
            s = forceComment(s)
            const len = s.length
            let i = 0
            for (; i < len && s[i] <= ' '; i++) {}
            if (trim && i > 0) s = s.substr(i)
            if (i < len) return prefix + wrap(token.rem, s)
            return s
        }

        // What happens next depends on the value's type.

        // check for DSF
        const dsfValue = runDsf(value)
        if (dsfValue !== undefined) return wrap(token.dsf, dsfValue)

        switch (typeof value) {
            case 'string':
                return quote(value, gap, hasComment, isRootObject)

            case 'number':
                // JSON numbers must be finite. Encode non-finite numbers as null.
                return isFinite(value)
                    ? wrap(token.num, String(value))
                    : wrap(token.lit, 'null')

            case 'boolean':
                return wrap(token.lit, String(value))

            case 'object': {
                // If the type is 'object', we might be dealing with an object or an array or
                // null.

                // Due to a specification blunder in ECMAScript, typeof null is 'object',
                // so watch out for that case.
                if (!value) return wrap(token.lit, 'null')

                let comments // whitespace & comments
                if (keepComments) comments = getComment(value)

                const isArray = Object.prototype.toString.apply(value) === '[object Array]'

                // Make an array to hold the partial results of stringifying this object value.
                const mind = gap
                gap += indent
                const eolMind = eol + mind
                const eolGap = eol + gap
                const prefix = noIndent || bracesSameLine ? '' : eolMind
                const partial = []
                let setsep
                // condense helpers:
                const cpartial = condense ? [] : null
                const saveQuoteStrings = quoteStrings
                const saveMultiline = multiline
                const iseparator = separator ? '' : token.com[0]
                let cwrapLen = 0

                let i, length // loop
                let k, v, vs // key, value
                let c, ca
                let res, cres

                if (isArray) {
                    // The value is an array. Stringify every element. Use null as a placeholder
                    // for non-JSON values.

                    for (i = 0, length = value.length; i < length; i++) {
                        setsep = i < length - 1
                        if (comments) {
                            c = comments.a[i] || []
                            ca = commentOnThisLine(c[1])
                            partial.push(makeComment(c[0], '\n') + eolGap)
                            if (cpartial && (c[0] || c[1] || ca)) cpartial.length = 0, cpartial.disabled = true
                        } else partial.push(eolGap)
                        wrapLen = 0
                        v = value[i]
                        partial.push(str(v, comments ? ca : false, true) + (setsep ? separator : ''))
                        if (cpartial && !cpartial.disabled) {
                            // prepare the condensed version
                            switch (typeof v) {
                                case 'string':
                                    wrapLen = 0
                                    quoteStrings = true
                                    multiline = 0
                                    cpartial.push(str(v, false, true) + (setsep ? token.com[0] : ''))
                                    quoteStrings = saveQuoteStrings
                                    multiline = saveMultiline
                                    break
                                case 'object':
                                    if (v) {
                                        cpartial.disabled = true
                                        break
                                    } // falls through
                                default:
                                    cpartial.push(
                                        partial[partial.length - 1] + (setsep ? iseparator : ''),
                                    )
                                    break
                            }
                            if (setsep) wrapLen += token.com[0].length - token.com[2]
                            cwrapLen += wrapLen
                        }
                        if (comments && c[1])
                            partial.push(makeComment(c[1], ca ? ' ' : '\n', ca))
                    }

                    if (length === 0) {
                        // when empty
                        if (comments && comments.e)
                            partial.push(makeComment(comments.e[0], '\n') + eolMind)
                    } else partial.push(eolMind)

                    // Join all of the elements together, separated with newline, and wrap them in
                    // brackets.
                    if (partial.length === 0) res = wrap(token.arr, '')
                    else {
                        res = prefix + wrap(token.arr, partial.join(''))
                        // try if the condensed version can fit (parent key name is not included)
                        if (cpartial && !cpartial.disabled) {
                            cres = cpartial.join(' ')
                            if (cres.length - cwrapLen <= condense) res = wrap(token.arr, cres)
                        }
                    }
                } else {
                    // Otherwise, iterate through all of the keys in the object.
                    const commentKeys = comments ? comments.o.slice() : []
                    const objectKeys = []
                    for (k in value) {
                        if (
                            Object.prototype.hasOwnProperty.call(value, k) &&
                            commentKeys.indexOf(k) < 0
                        )
                            objectKeys.push(k)
                    }
                    if (sortProps) {
                        objectKeys.sort()
                    }
                    const keys = commentKeys.concat(objectKeys)

                    for (i = 0, length = keys.length; i < length; i++) {
                        setsep = i < length - 1
                        k = keys[i]
                        if (comments) {
                            c = comments.c[k] || []
                            ca = commentOnThisLine(c[1])
                            partial.push(makeComment(c[0], '\n') + eolGap)
                            if (cpartial && (c[0] || c[1] || ca)) cpartial.disabled = true
                        } else partial.push(eolGap)

                        wrapLen = 0
                        v = value[k]
                        vs = str(v, comments && ca)
                        partial.push(
                            quoteKey(k) +
                                token.col[0] +
                                (startsWithNL(vs) ? '' : ' ') +
                                vs +
                                (setsep ? separator : ''),
                        )
                        if (comments && c[1])
                            partial.push(makeComment(c[1], ca ? ' ' : '\n', ca))
                        if (cpartial && !cpartial.disabled) {
                            // prepare the condensed version
                            switch (typeof v) {
                                case 'string':
                                    wrapLen = 0
                                    quoteStrings = true
                                    multiline = 0
                                    vs = str(v, false)
                                    quoteStrings = saveQuoteStrings
                                    multiline = saveMultiline
                                    cpartial.push(
                                        quoteKey(k) +
                                            token.col[0] +
                                            ' ' +
                                            vs +
                                            (setsep ? token.com[0] : ''),
                                    )
                                    break
                                case 'object':
                                    if (v) {
                                        cpartial.disabled = true
                                        break
                                    } // falls through
                                default:
                                    cpartial.push(
                                        partial[partial.length - 1] + (setsep ? iseparator : ''),
                                    )
                                    break
                            }
                            wrapLen += token.col[0].length - token.col[2]
                            if (setsep) wrapLen += token.com[0].length - token.com[2]
                            cwrapLen += wrapLen
                        }
                    }
                    if (length === 0) {
                        // when empty
                        if (comments && comments.e)
                            partial.push(makeComment(comments.e[0], '\n') + eolMind)
                    } else partial.push(eolMind)

                    // Join all of the member texts together, separated with newlines
                    if (partial.length === 0) {
                        res = wrap(token.obj, '')
                    } else {
                        // and wrap them in braces
                        res = prefix + wrap(token.obj, partial.join(''))
                        // try if the condensed version can fit
                        if (cpartial && !cpartial.disabled) {
                            cres = cpartial.join(' ')
                            if (cres.length - cwrapLen <= condense) res = wrap(token.obj, cres)
                        }
                    }
                }

                gap = mind
                return res
            }
        }
    }

    const dataComments = keepComments ? getComment(data) : null
    const comments = dataComments && dataComments.r
    let res = str(data, null, true, true)

    if (
        typeof data === 'object' &&
        data !== null &&
        !Array.isArray(data) &&
        !emitRootBraces &&
        res[0] === '{' &&
        res[res.length - 1] === '}'
    ) {
        res = res
            .slice(1, -1)
            .replace(new RegExp('\\n' + escapeRegExp(indent), 'g'), '\n')

        if (res[0] === '\n') res = res.slice(1)
        if (res[res.length - 1] === '\n') res = res.slice(0, -1)
    }

    if (emitRootBraces && comments && comments[0]) {
        res = comments[0] + eol + res
    }

    if (comments) res += comments[1] || ''

    if (!res.endsWith(eol)) res += eol

    return res
}
