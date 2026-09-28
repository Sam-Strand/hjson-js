import { EOL, setEndOfLine } from './common.js'
import parse from './parse.js'
import stringify from './stringify.js'
import standardDsf from './dsf.js'

const Hjson = {
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
    },
    dsf: standardDsf
}

export {
    parse,
    stringify,
    EOL,
    standardDsf as dsf
}

export default Hjson
