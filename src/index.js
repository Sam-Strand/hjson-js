import { EOL, setEndOfLine } from './common'
import parse from './parse'
import stringify from './stringify'
import standardDsf from './dsf'

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
