import common from './hjson-common'
import parse from './hjson-parse'
import stringify from './hjson-stringify'
import comments from './hjson-comments'
import dsf from './hjson-dsf'

const Hjson = {
    parse,
    stringify,

    endOfLine() {
        return common.EOL
    },

    setEndOfLine(eol) {
        if (eol === '\n' || eol === '\r\n') {
            common.EOL = eol
        }
    },

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

    comments,
    dsf: dsf.std
}

export {
    parse,
    stringify,
    common,
    comments,
    dsf
}

export default Hjson
