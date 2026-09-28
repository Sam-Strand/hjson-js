import hjson from './src/index.js'
/*
const test_str = `
{
    '''
        value
        '''
}
`

const test_str = `
[
    str 1
    '''
    value 1
    '''
    str 2
    '''
    value 2
    '''
]
`
*/
const test_str = `
[
    '''
    --sql
    CREATE TABLE IF NOT EXISTS "{schema}".namespaces (
        uid my_id PRIMARY KEY,
        label text,
        upload timestamptz NOT NULL DEFAULT now()
    )
    '''
    '''
    --sql
    CREATE TABLE IF NOT EXISTS "{schema}".units (
        label text PRIMARY KEY
    )
    '''
]

`

const opt = {"condense":30,"bracesSameLine":false,"emitRootBraces":false,"quotes":"min","multiline":"std","separator":false,"space":4,"eol":"auto","colors":false,"serializeDeterministically":false,"quoteChar":"'"}
const parse_obj_1 = hjson.rt.parse(test_str, opt)

const stringify_obj_1 = hjson.rt.stringify(parse_obj_1, opt)

//const parse_obj_2 = hjson.rt.parse(stringify_obj_1, opt)

//const stringify_obj_2 = hjson.rt.stringify(parse_obj_2, opt)
console.log(parse_obj_1)
console.log(stringify_obj_1)
//console.log(parse_obj_2)
//console.log(stringify_obj_2)
