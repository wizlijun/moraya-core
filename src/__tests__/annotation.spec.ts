import { describe, test, expect } from 'vitest'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { parseMarkdown, serializeMarkdown } from '../markdown'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })

describe('annotation mark — schema', () => {
  test('schema exposes annotation mark type', () => {
    expect(schema.marks.annotation).toBeDefined()
  })

  test('annotation mark is not inclusive (typing after it stays plain)', () => {
    expect(schema.marks.annotation.spec.inclusive).toBe(false)
  })

  test('annotation toDOM carries data-note', () => {
    const dom = schema.marks.annotation.spec.toDOM!(
      schema.marks.annotation.create({ note: 'hi' }), true)
    expect(Array.isArray(dom)).toBe(true)
    expect((dom as unknown[])[1]).toMatchObject({ 'data-note': 'hi' })
  })
})

describe('note_anchor node — schema', () => {
  test('schema exposes note_anchor node type', () => {
    expect(schema.nodes.note_anchor).toBeDefined()
  })

  test('note_anchor is an inline atom', () => {
    const spec = schema.nodes.note_anchor.spec
    expect(spec.inline).toBe(true)
    expect(spec.atom).toBe(true)
  })

  test('note_anchor toDOM carries data-note', () => {
    const dom = schema.nodes.note_anchor.spec.toDOM!(
      schema.nodes.note_anchor.create({ note: 'p' }))
    expect((dom as unknown[])[1]).toMatchObject({ 'data-note': 'p' })
  })
})

describe('CriticMarkup — parsing', () => {
  test('{==text==}{>>note<<} parses to annotation mark', () => {
    const doc = parseMarkdown('a {==bc==}{>>my note<<} d\n')
    let note = ''
    let marked = ''
    doc.descendants((node) => {
      const m = node.marks.find((mk) => mk.type.name === 'annotation')
      if (node.isText && m) { note = m.attrs.note as string; marked = node.text || '' }
    })
    expect(marked).toBe('bc')
    expect(note).toBe('my note')
  })

  test('standalone {>>note<<} parses to note_anchor node', () => {
    const doc = parseMarkdown('end{>>point note<<}\n')
    let found: string | null = null
    doc.descendants((node) => {
      if (node.type.name === 'note_anchor') found = node.attrs.note as string
    })
    expect(found).toBe('point note')
  })

  test('inline formatting survives inside annotated text', () => {
    const doc = parseMarkdown('{==has **bold** word==}{>>n<<}\n')
    let boldAnnotated = false
    doc.descendants((node) => {
      if (node.isText && node.text === 'bold'
          && node.marks.some((m) => m.type.name === 'strong')
          && node.marks.some((m) => m.type.name === 'annotation')) boldAnnotated = true
    })
    expect(boldAnnotated).toBe(true)
  })

  test('unclosed marker stays literal text (fail open)', () => {
    const doc = parseMarkdown('a {>>never closed\n')
    let hasAnchor = false
    doc.descendants((node) => { if (node.type.name === 'note_anchor') hasAnchor = true })
    expect(hasAnchor).toBe(false)
    expect(doc.textContent).toContain('{>>never closed')
  })

  test('empty note is allowed: {>><<}', () => {
    const doc = parseMarkdown('x{>><<}\n')
    let found: string | null = null
    doc.descendants((node) => {
      if (node.type.name === 'note_anchor') found = node.attrs.note as string
    })
    expect(found).toBe('')
  })
})

describe('CriticMarkup — serialization / round-trip', () => {
  // serializeMarkdown emits no trailing newline — compare trimmed.
  test('wrapped annotation round-trips exactly', () => {
    const md = 'a {==bc==}{>>my note<<} d'
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md)
  })

  test('point annotation round-trips exactly', () => {
    const md = 'end{>>point note<<}'
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md)
  })

  test('inline bold inside annotation round-trips', () => {
    const md = '{==has **bold** word==}{>>n<<}'
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md)
  })

  test('note text is sanitized on serialize (newline / <<} guard)', () => {
    // Build a doc with a hostile note via the node API and serialize it.
    const hostile = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('x'),
        schema.nodes.note_anchor.create({ note: 'line1\nline2 <<} end' }),
      ]),
    ])
    const out = serializeMarkdown(hostile)
    expect(out).toContain('{>>line1 line2 < <} end<<}')
  })
})

describe('annotation over inline code', () => {
  // 给行内代码加批注:序列化必须把 CriticMarkup 放在反引号**外面**。
  // 放里面的话,代码段内一切按字面渲染 —— 批注既不显示徽标,重新解析时也整个消失。
  test('annotated inline code round-trips (markup outside the backticks)', () => {
    const md = '输入（{==`fixture`==}{>>这是什么意思？<<}）'
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md)
  })

  test('the annotation survives a save→reload cycle', () => {
    const md = '{==`fixture`==}{>>why?<<}'
    const once = serializeMarkdown(parseMarkdown(md))
    const doc = parseMarkdown(once)
    let noted: string | null = null
    doc.descendants((n) => {
      const m = n.marks.find((x) => x.type.name === 'annotation')
      if (m) noted = m.attrs.note as string
    })
    expect(noted).toBe('why?')       // 修复前:批注被吞进 code 里,这里是 null
  })

  test('the code mark itself is preserved', () => {
    const doc = parseMarkdown('{==`fixture`==}{>>why?<<}')
    let marks: string[] = []
    doc.descendants((n) => { if (n.isText) marks = n.marks.map((m) => m.type.name) })
    expect(marks).toContain('code')
    expect(marks).toContain('annotation')
  })
})

describe('annotation spanning an inner mark boundary (regression)', () => {
  // 真实事故:源文 `**被录一方的知情同意**（美国部分州要求双方同意）`,用户选中跨过
  // 加粗边界做批注。若 annotation 比 strong 内层,序列化会在加粗边界处断开、各补一份
  // {>>note<<} —— 一条批注变两条,伴生笔记里多出一个同文本的 question 节点,采纳时
  // 按文本匹配就会标错节点、卡片清不掉。批注是数据模型的身份,不能被排版 mark 切开。
  test('one annotation across bold+plain stays ONE annotation', () => {
    const md = '{==**A**B==}{>>note<<}\n'
    const out = serializeMarkdown(parseMarkdown(md, schema))
    const opens = out.match(/\{==/g) ?? []
    const notes = out.match(/\{>>/g) ?? []
    expect({ out, opens: opens.length, notes: notes.length })
      .toMatchObject({ opens: 1, notes: 1 })
  })

  test('annotation covering only part of a bold run does not duplicate the note', () => {
    const md = '**A{==B==}{>>note<<}C**\n'
    const out = serializeMarkdown(parseMarkdown(md, schema))
    expect((out.match(/\{>>/g) ?? []).length).toBe(1)
  })
})
