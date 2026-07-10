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
