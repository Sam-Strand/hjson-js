import { describe, it, expect } from 'vitest'
import Hjson from '../src/index.js'

// ---------------------------------------------------------------------------
// Общие опции round-trip.
// По умолчанию indent = 4 пробела, скобки — на строке ключа (как в исходнике).
// ---------------------------------------------------------------------------
const rtOpts = {
    emitRootBraces: false,
    bracesSameLine: true,
    space: 4,
}

/** parse → stringify с нашими опциями. */
function rt(source, opts = rtOpts) {
    return Hjson.rt.stringify(Hjson.rt.parse(source), opts)
}

/** parse → stringify → parse → stringify: текст не должен меняться. */
function rtTwice(source, opts = rtOpts) {
    const once = rt(source, opts)
    const twice = rt(once, opts)
    return { once, twice }
}

// ===========================================================================
// 1. Базовая индентация и вложенность
// ===========================================================================

describe('rt comments: базовая индентация', () => {
    it('вложенные ключи и объекты, комментарии на каждом уровне', () => {
        const source = `# root comment
// lv1 comment
lv1: {
    /*
    lv2 comment
    */
    lv2: {
        // lv3 comment
        lv3: [
            v1
            v2
            // v3 comment
            v3
        ]
    }
}
`
        expect(rt(source)).toBe(source)
    })

    it('глубокая вложенность (5 уровней) с комментарием на каждом', () => {
        const source = `# l0
a: {
    # l1
    b: {
        # l2
        c: {
            # l3
            d: {
                # l4
                e: 1
            }
        }
    }
}
`
        expect(rt(source)).toBe(source)
    })

    it('indent = 2 сохраняется', () => {
        const source = `a: {
  # c
  b: 1
}
`
        expect(rt(source, { emitRootBraces: false, bracesSameLine: true, space: 2 })).toBe(source)
    })

    it('indent = 4 сохраняется', () => {
        const source = `a: {
    # c
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })

    it('indent = tab сохраняется', () => {
        const source = `a: {
\t# c
\tb: 1
}
`
        expect(rt(source, { emitRootBraces: false, bracesSameLine: true, space: '\t' })).toBe(source)
    })
})

// ===========================================================================
// 2. Три вида комментариев
// ===========================================================================

describe('rt comments: виды комментариев', () => {
    it('# перед ключом', () => {
        const source = `a: {
    # c
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })

    it('// перед ключом', () => {
        const source = `a: {
    // c
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })

    it('/* */ перед ключом (однострочный)', () => {
        const source = `a: {
    /* c */
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })

    it('/* */ перед ключом (многострочный)', () => {
        const source = `a: {
    /*
    c1
    c2
    */
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })

    it('многострочный /* */ в глубокой вложенности', () => {
        const source = `a: {
    b: {
        /*
        hello
        world
        */
        c: 1
    }
}
`
        expect(rt(source)).toBe(source)
    })

    it('# после значения (inline)', () => {
        const source = `a: 1 # c
`
        expect(rt(source)).toBe(source)
    })

    it('// после значения (inline)', () => {
        const source = `a: 1 // c
`
        expect(rt(source)).toBe(source)
    })

    it('/* */ после значения (inline)', () => {
        const source = `a: 1 /* c */
`
        expect(rt(source)).toBe(source)
    })

    it('комментарий перед элементом массива', () => {
        const source = `a: [
    # c
    1
    2
]
`
        expect(rt(source)).toBe(source)
    })

    it('комментарий после элемента массива', () => {
        const source = `a: [
    1 # c
    2
]
`
        expect(rt(source)).toBe(source)
    })
})

// ===========================================================================
// 3. Многострочные #-комментарии подряд
// ===========================================================================

describe('rt comments: несколько подряд', () => {
    it('три # подряд перед ключом', () => {
        const source = `a: {
    # one
    # two
    # three
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })

    it('# и // вперемешку', () => {
        const source = `a: {
    # one
    // two
    # three
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })

    it('комментарий перед несколькими ключами', () => {
        const source = `a: {
    # first
    b: 1
    # second
    c: 2
    # third
    d: 3
}
`
        expect(rt(source)).toBe(source)
    })

    it('перед ключом и после значения одновременно', () => {
        const source = `a: {
    # before
    b: 1 # after
    c: 2
}
`
        expect(rt(source)).toBe(source)
    })
})

// ===========================================================================
// 4. Корневые комментарии
// ===========================================================================

describe('rt comments: корневые', () => {
    it('корневой #', () => {
        const source = `# header
a: 1
`
        expect(rt(source)).toBe(source)
    })

    it('корневой //', () => {
        const source = `// header
a: 1
`
        expect(rt(source)).toBe(source)
    })

    it('корневой /* */', () => {
        const source = `/* header */
a: 1
`
        expect(rt(source)).toBe(source)
    })

    it('корневой многострочный /* */', () => {
        const source = `/*
header line 1
header line 2
*/
a: 1
`
        expect(rt(source)).toBe(source)
    })

    it('два корневых комментария подряд', () => {
        const source = `# one
// two
a: 1
`
        expect(rt(source)).toBe(source)
    })

    it('корневой + комментарий внутри', () => {
        const source = `# root
a: {
    # inner
    b: 1
}
`
        expect(rt(source)).toBe(source)
    })
})

// ===========================================================================
// 5. Пустые контейнеры
// ===========================================================================

describe('rt comments: пустые контейнеры (стабильность формы)', () => {
    const cases = [
        ['пустой объект', `a: {}\n`],
        ['пустой массив', `a: []\n`],
        ['как значения ключей', `a: {}\nb: []\nc: 1\n`],
        ['в массиве', `a: [\n    {}\n    []\n    1\n]\n`],
    ]

    for (const [name, source] of cases) {
        it(name, () => {
            const once = rt(source)
            const twice = rt(once)
            expect(twice).toBe(once)
        })
    }

    it('пустой объект с комментарием внутри сохраняется буквально', () => {
        const source = `a: {\n    # only comment\n}\n`
        expect(rt(source)).toBe(source)
    })

    it('пустой массив с комментарием внутри сохраняется буквально', () => {
        const source = `a: [\n    # only comment\n]\n`
        expect(rt(source)).toBe(source)
    })
})

// ===========================================================================
// 6. Объекты внутри массивов и наоборот
// ===========================================================================

describe('rt comments: смешанные структуры', () => {
    it('комментарий внутри объекта внутри массива', () => {
        const source = `a: [
    {
        # inner
        b: 1
    }
]
`
        expect(rt(source)).toBe(source)
    })

    it('массив внутри объекта с комментариями на двух уровнях', () => {
        const source = `a: {
    # obj-level
    b: [
        # arr-level
        1
        2
    ]
}
`
        expect(rt(source)).toBe(source)
    })

    it('несколько объектов в массиве, каждый со своим комментарием', () => {
        const source = `a: [
    {
        # first
        x: 1
    }
    {
        # second
        y: 2
    }
]
`
        expect(rt(source)).toBe(source)
    })

    it('комментарий перед элементом массива объектов', () => {
        const source = `a: [
    # about obj
    {
        b: 1
    }
]
`
        expect(rt(source)).toBe(source)
    })
})

// ===========================================================================
// 7. Комментарий после вложенного значения
// ===========================================================================

describe('rt comments: после вложенных значений (стабильность)', () => {
    it('после вложенного объекта', () => {
        const source = `a: {\n    b: { c: 1 } # after\n}\n`
        const once = rt(source)
        expect(once).toMatch(/# after/)
        expect(rt(once)).toBe(once)
    })

    it('после массива', () => {
        const source = `a: {\n    b: [1, 2] # after\n}\n`
        const once = rt(source)
        expect(once).toMatch(/# after/)
        expect(rt(once)).toBe(once)
    })
})

// ===========================================================================
// 8. Idempotency: rt(rt(x)) === rt(x)
// ===========================================================================

describe('rt comments: idempotency', () => {
    const cases = [
        [
            'многоуровневая вложенность',
            `# root
a: {
    // l1
    b: {
        /* l2 */
        c: [
            # arr
            1
            2
        ]
    }
}
`,
        ],
        [
            'корневой + несколько ключей',
            `# top
a: 1
# mid
b: 2
// bottom
c: 3
`,
        ],
        [
            'многострочный /* */',
            `a: {
    /*
    one
    two
    three
    */
    b: 1
}
`,
        ],
        [
            'всё вперемешку',
            `# r
a: [
    # first
    {
        x: 1 # after x
        # before y
        y: 2
    }
    // second
    [
    ]
    {
    }
]
`,
        ],
    ]

    for (const [name, source] of cases) {
        it(name, () => {
            const { once, twice } = rtTwice(source)
            expect(once).toBe(source)
            expect(twice).toBe(once)
        })
    }
})

// ===========================================================================
// 9. Дополнительно: сохранение indent-уровня при повторном парсинге
// ===========================================================================

describe('rt comments: стабильность после повторного парсинга', () => {
    it('глубокая вложенность не теряет отступы', () => {
        const source = `a: {
    b: {
        c: {
            # deep
            d: 1
        }
    }
}
`
        const once = rt(source)
        const twice = rt(once)
        const thrice = rt(twice)
        expect(once).toBe(source)
        expect(twice).toBe(source)
        expect(thrice).toBe(source)
    })

    it('комментарий остаётся на своём узле, а не съезжает к соседу', () => {
        const source = `a: {
    # about b
    b: 1
    c: 2
}
`
        const out = rt(source)
        expect(out).toMatch(/# about b\n\s+b: 1/)
        expect(out).not.toMatch(/# about b\n\s+c: 2/)
    })
})