import { createComment, getComment, tryParseNumber, parseSpecialNumber, parseIsoDate } from './common.js'

// Fast paths: runs of "ordinary" characters are consumed with sticky regexes.
// Every decision of the parser is still taken on the same characters, in the same order.
// whitespace (everything <= ' ') and comments // ... and /* ... */ (unterminated: up to the end)
const WHITE_RE = /(?:[\x00-\x20]+|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))*/y
// ordinary characters of a quoteless value: anything but EOL, separators, brackets and '/'
const TFNNS_PLAIN_RE = /[^\r\n,{}\[\]\/]+/y
// ordinary characters of a quoted string
const STRING_PLAIN_RE = { '"': /[^"\\\n\r]+/y, "'": /[^'\\\n\r]+/y }
// ordinary characters of a quoteless key
const KEY_PLAIN_RE = /[^\x00-\x20{}\[\],:]+/y
// ordinary characters inside a ''' string
const ML_PLAIN_RE = /[^'\n\r]+/y

function runAt(re, text, pos) {
    re.lastIndex = pos
    return re.exec(text)
}

export default function parse(source, opt) {
    var text
    var at;   // The index of the current character
    var ch;   // The current character
    var escapee = {
        '"': '"',
        "'": "'",
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t'
    }

    var keepComments

    function resetAt() {
        at = 0
        ch = ' '
    }

    function isPunctuatorChar(c) {
        return c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':'
    }

    // Call error when something is wrong.
    function error(m) {
        var i, col = 0, line = 1
        for (i = at - 1; i > 0 && text[i] !== '\n'; i--, col++) { }
        for (; i > 0; i--) if (text[i] === '\n') line++
        throw new Error(m + " at line " + line + "," + col + " >>>" + text.substr(at - col, 20) + " ...")
    }

    function next() {
        // get the next character.
        ch = text.charAt(at)
        at++
        return ch
    }

    function peek(offs) {
        // range check is not required
        return text.charAt(at + offs)
    }

    // move to the character at `pos` (same as calling next() until we get there)
    function jump(pos) {
        at = pos
        next()
    }

    function string(allowML) {
        // Parse a string value.
        // callers make sure that (ch === '"' || ch === "'")
        var string = ''

        // When parsing for string values, we must look for "/' and \ characters.
        var exitCh = ch
        var plain = STRING_PLAIN_RE[exitCh]
        for (; ;) {
            var m = runAt(plain, text, at)
            if (m) { string += m[0]; at = plain.lastIndex }
            if (!next()) break
            if (ch === exitCh) {
                next()
                if (allowML && exitCh === "'" && ch === "'" && string.length === 0) {
                    // ''' indicates a multiline string
                    next()
                    return mlString()
                } else return string
            }
            if (ch === '\\') {
                next()
                if (ch === 'u') {
                    var uffff = 0
                    for (var i = 0; i < 4; i++) {
                        next()
                        var c = ch.charCodeAt(0), hex
                        if (ch >= '0' && ch <= '9') hex = c - 48
                        else if (ch >= 'a' && ch <= 'f') hex = c - 97 + 0xa
                        else if (ch >= 'A' && ch <= 'F') hex = c - 65 + 0xa
                        else error("Bad \\u char " + ch)
                        uffff = uffff * 16 + hex
                    }
                    string += String.fromCharCode(uffff)
                } else if (typeof escapee[ch] === 'string') {
                    string += escapee[ch]
                } else break
            } else if (ch === '\n' || ch === '\r') {
                error("Bad string containing newline")
            } else {
                string += ch
            }
        }
        error("Bad string")
    }

    function mlString() {
        // Parse a multiline string value.
        var string = '', triple = 0

        // we are at ''' +1 - get indent
        var indent = 0
        for (; ;) {
            var c = peek(-indent - 5)
            if (!c || c === '\n') break
            indent++
        }

        function skipIndent() {
            var skip = indent
            while (ch && ch <= ' ' && ch !== '\n' && skip-- > 0) next()
        }

        // skip white/to (newline)
        while (ch && ch <= ' ' && ch !== '\n') next()
        if (ch === '\n') { next(); skipIndent(); }

        // When parsing multiline string values, we must look for ' characters.
        for (; ;) {
            if (!ch) {
                error("Bad multiline string")
            } else if (ch === '\'') {
                triple++
                next()
                if (triple === 3) {
                    if (string.slice(-1) === '\n') string = string.slice(0, -1); // remove last EOL
                    return string
                } else continue
            } else {
                while (triple > 0) {
                    string += '\''
                    triple--
                }
            }
            if (ch === '\n') {
                string += '\n'
                next()
                skipIndent()
            } else if (ch === '\r') {
                next()
            } else {
                // ordinary characters up to a quote / end of line, in one go
                var m = runAt(ML_PLAIN_RE, text, at - 1)
                string += m[0]
                jump(ML_PLAIN_RE.lastIndex)
            }
        }
    }

    function keyname() {
        // quotes for keys are optional in mkon
        // unless they include {}[],: or whitespace.

        if (ch === '"' || ch === "'") return string(false)

        var name = "", start = at, space = -1
        for (; ;) {
            if (ch === ':') {
                if (!name) error("Found ':' but no key name (for an empty key name use quotes)")
                else if (space >= 0 && space !== name.length) { at = start + space; error("Found whitespace in your key name (use quotes to include)"); }
                return name
            } else if (ch <= ' ') {
                if (!ch) error("Found EOF while looking for a key name (check your syntax)")
                else if (space < 0) space = name.length
            } else if (isPunctuatorChar(ch)) {
                error("Found '" + ch + "' where a key name was expected (check your syntax or use quotes if the key name includes {}[],: or whitespace)")
            } else {
                runAt(KEY_PLAIN_RE, text, at - 1)
                name += text.slice(at - 1, KEY_PLAIN_RE.lastIndex)
                jump(KEY_PLAIN_RE.lastIndex)
                continue
            }
            next()
        }
    }

    function white() {
        // skip whitespace and comments (mkon allows JS-style comments only: // and /* */)
        if (!ch || (ch > ' ' && ch !== '/')) return  // common case: already on a meaningful character
        if (at === 0) {  // initial state: a virtual space before the text
            next()
            if (!ch) return
        }
        runAt(WHITE_RE, text, at - 1)
        jump(WHITE_RE.lastIndex)
    }

    function tfnns(inContainer) {
        // mkon strings can be quoteless
        // returns string, number (incl. NaN / ±Infinity), Date (ISO 8601), true, false, or null.
        //
        // Inside a container (array / object, including the braceless root object)
        // a quoteless string ends at the first ',', '}' or ']' that is not inside
        // a bracket pair opened within the string itself, e.g.
        //   { a: x, b: [p, q] }   -> a = "x", b = ["p", "q"]
        //   { f: \frac{a,b}{c} }  -> f = "\frac{a,b}{c}"
        // A bare root value (no container) still runs to the end of the line.
        if (isPunctuatorChar(ch))
            error("Found a punctuator character '" + ch + "' when expecting a quoteless string (check your syntax)")

        var start = at - 1
        var value
        var depth = 0 // brackets opened inside this quoteless string

        for (; ;) {
            if (runAt(TFNNS_PLAIN_RE, text, at)) at = TFNNS_PLAIN_RE.lastIndex
            next()
            // (detection of ml strings was moved to string())
            var isEol = ch === '\r' || ch === '\n' || ch === ''
            var isSep = ch === ',' || ch === '}' || ch === ']'
            var endsString = isEol || inContainer && isSep && depth === 0
            if (endsString ||
                isSep ||
                ch === '/' && (peek(0) === '/' || peek(0) === '*')
            ) {
                // this tests for the case of {true|false|null|num|NaN|±Infinity|ISO date}
                // followed by { ',' | '}' | ']' | '//' | '/*' }
                // which needs to be parsed as the specified value
                value = text.slice(start, at - 1)
                var chf = value[0]
                switch (chf) {
                    case 'f': if (value.trim() === "false") return false; break
                    case 'n': if (value.trim() === "null") return null; break
                    case 't': if (value.trim() === "true") return true; break
                    case 'N':
                    case 'I':
                    case '+':
                        var sp = parseSpecialNumber(value.trim())
                        if (sp !== undefined) return sp
                        break
                    default:
                        if (chf === '-' || chf >= '0' && chf <= '9') {
                            var n = tryParseNumber(value)
                            if (n !== undefined) return n
                            if (chf !== '-') {
                                var dt
                                try { dt = parseIsoDate(value.trim()) } catch (e) { error(e.message) }
                                if (dt !== undefined) return dt
                            }
                            if (chf === '-') {
                                var sn = parseSpecialNumber(value.trim())
                                if (sn !== undefined) return sn
                            }
                        }
                }
                if (endsString) {
                    // remove any whitespace at the end (ignored in quoteless strings)
                    return value.trim()
                }
            }
            if (ch === '{' || ch === '[') depth++
            else if ((ch === '}' || ch === ']') && depth > 0) depth--
        }
    }

    function readCommentAt(cAt, first) {
        var i
        cAt--
        // remove trailing whitespace
        // but only up to EOL
        for (i = at - 2; i > cAt && text[i] <= ' ' && text[i] !== '\n'; i--)
        if (text[i] === '\n') i--
        if (text[i] === '\r') i--
        var res = text.substr(cAt, i - cAt + 1)
        // return if we find anything other than whitespace
        for (i = 0; i < res.length; i++) {
            if (res[i] > ' ') {
                var j = res.indexOf('\n')
                if (j >= 0) {
                    // отрезаем trailing whitespace у ОБЕИХ частей
                    var c = [
                        res.substr(0, j).replace(/\s+$/, ''),
                        res.substr(j + 1).replace(/\s+$/, '')
                    ]
                    if (first && c[0].trim().length === 0) c.shift()
                    return c
                } else {
                    return [res.replace(/\s+$/, '')]
                }
            }
        }
        return []
    }

    function errorClosingHint(value) {
        function search(value, ch) {
            var i, k, length, res
            switch (typeof value) {
                case 'string':
                    if (value.indexOf(ch) >= 0) res = value
                    break
                case 'object':
                    if (Object.prototype.toString.apply(value) === '[object Array]') {
                        for (i = 0, length = value.length; i < length; i++) {
                            res = search(value[i], ch) || res
                        }
                    } else {
                        for (k in value) {
                            if (!Object.prototype.hasOwnProperty.call(value, k)) continue
                            res = search(value[k], ch) || res
                        }
                    }
            }
            return res
        }

        function report(ch) {
            var possibleErr = search(value, ch)
            if (possibleErr) {
                return "found '" + ch + "' in a string value, your mistake could be with:\n" +
                    "  > " + possibleErr + "\n" +
                    "  (unquoted strings end at the next line or at a ',' / '}' / ']' outside of brackets!)"
            } else return ""
        }

        return report('}') || report(']')
    }

    function array() {
        // Parse an array value.
        // assuming ch === '['

        var array = []
        var comments, cAt, nextComment
        try {
            if (keepComments) comments = createComment(array, { a: [] })

            next()
            cAt = at
            white()
            if (comments) nextComment = readCommentAt(cAt, true).join('\n')
            if (ch === ']') {
                next()
                if (comments) comments.e = [nextComment]
                return array;  // empty array
            }

            while (ch) {
                array.push(value(true))
                cAt = at
                white()
                // in mkon the comma is optional and trailing commas are allowed
                // note that we do not keep comments before the , if there are any
                if (ch === ',') { next(); cAt = at; white(); }
                if (comments) {
                    var c = readCommentAt(cAt)
                    comments.a.push([nextComment || "", c[0] || ""])
                    nextComment = c[1]
                }
                if (ch === ']') {
                    next()
                    if (comments) comments.a[comments.a.length - 1][1] += nextComment || ""
                    return array
                }
                white()
            }

            error("End of input while parsing an array (missing ']')")
        } catch (e) {
            e.hint = e.hint || errorClosingHint(array)
            throw e
        }
    }

    function object(withoutBraces) {
        // Parse an object value.

        var key = "", object = {}
        var comments, cAt, nextComment

        try {
            if (keepComments) comments = createComment(object, { c: {}, o: [] })

            if (!withoutBraces) {
                // assuming ch === '{'
                next()
                cAt = at
                white()
                if (comments) nextComment = readCommentAt(cAt, true).join('\n')
            } else {
                // root-level object without braces:
                // ведущий комментарий уже сохранён rootValue() как root-комментарий,
                // повторно его к первому ключу привязывать не надо
                white()
                cAt = at
            }

            if (ch === '}' && !withoutBraces) {
                if (comments) comments.e = [nextComment]
                next()
                return object
            }
            while (ch) {
                key = keyname()
                white()
                if (ch !== ':') error("Expected ':' instead of '" + ch + "'")
                next()
                // duplicate keys overwrite the previous value
                object[key] = value(true)
                cAt = at
                white()
                // in mkon the comma is optional and trailing commas are allowed
                // note that we do not keep comments before the , if there are any
                if (ch === ',') { next(); cAt = at; white(); }
                if (comments) {
                    var c = readCommentAt(cAt)
                    // a duplicate key keeps its first position, like the value does
                    if (!Object.prototype.hasOwnProperty.call(comments.c, key)) comments.o.push(key)
                    comments.c[key] = [nextComment || "", c[0] || ""]
                    nextComment = c[1]
                }
                if (ch === '}' && !withoutBraces) {
                    next()
                    if (comments) comments.c[key][1] += nextComment || ""
                    return object
                }
                white()
            }

            if (withoutBraces) return object
            else error("End of input while parsing an object (missing '}')")
        } catch (e) {
            e.hint = e.hint || errorClosingHint(object)
            throw e
        }
    }

    function value(inContainer) {
        // Parse a mkon value. It could be an object, an array, a string, a number or a word.

        white()
        switch (ch) {
            case '{': return object()
            case '[': return array()
            case "'":
            case '"': return string(true)
            default: return tfnns(inContainer)
        }
    }

    function checkTrailing(v, c) {
        var cAt = at
        white()
        if (ch) error("Syntax error, found trailing characters")
        if (keepComments) {
            var b = c.join('\n'), a = readCommentAt(cAt).join('\n')
            // comments can only be attached to objects (containers and Date);
            // around a primitive root they are dropped
            if ((a || b) && v !== null && typeof v === 'object') {
                var comments = createComment(v, getComment(v))
                comments.r = [b, a]
            }
        }
        return v
    }

    function saveState() {
        return { at: at, ch: ch }
    }

    function restoreState(state) {
        at = state.at
        ch = state.ch
    }

    function rootValue() {
        white()
        var c = keepComments ? readCommentAt(1) : null

        switch (ch) {
            case '{':
                return checkTrailing(object(), c)
            case '[':
                return checkTrailing(array(), c)
        }

        var state = saveState()

        // A bare ISO date-time at the root ("2024-01-15T10:30Z") contains ':'
        // and would otherwise be read as a braceless object { "2024-01-15T10": "30Z" }.
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:/.test(text.substr(at - 1, 14))) {
            try {
                var dt = value()
                if (dt instanceof Date) return checkTrailing(dt, c)
            } catch (e) { }
            restoreState(state)
        }

        try {
            return checkTrailing(object(true), c)
        } catch (e) {
            restoreState(state)
            return checkTrailing(value(), c)
        }
    }

    if (typeof source !== "string") throw new Error("source is not a string")

    if (opt && typeof opt === 'object') {
        if (opt.dsf != null) throw new Error("The 'dsf' option was removed: mkon has no format plugins (NaN/Infinity and ISO dates are built in)")
        keepComments = opt.keepWsc
    }
    text = source
    resetAt()
    return rootValue()
}
