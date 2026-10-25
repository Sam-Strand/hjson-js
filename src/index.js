import { EOL, setEndOfLine } from './common.js'
import parse from './parse.js'
import stringify from './stringify.js'

const mkon = {
    parse,
    stringify,

    endOfLine() {
        return EOL
    },

    setEndOfLine,

    rt: {
        parse(text, options) {
            options = options || {}
            options.keepWsc = true
            return parse(text, options)
        },

        stringify(value, options) {
            options = options || {}
            options.keepWsc = true
            return stringify(value, options)
        }
    }
}

export {
    parse,
    stringify,
    EOL
}

export default mkon
