import { describe, test, expect } from 'vitest'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { parseMarkdown, serializeMarkdown } from '../markdown'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })

describe('highlight mark — schema', () => {
  test('schema exposes highlight mark type', () => {
    expect(schema.marks.highlight).toBeDefined()
  })

  test('highlight mark toDOM spec returns mark tag', () => {
    const spec = schema.marks.highlight.spec
    const dom = spec.toDOM!(schema.marks.highlight.create())
    expect(Array.isArray(dom) && dom[0]).toBe('mark')
  })

  test('highlight mark parses from <mark> element', () => {
    expect(schema.marks.highlight.spec.parseDOM).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: 'mark' })])
    )
  })
})

describe('highlight mark — parsing', () => {
  test('^^text^^ parses to highlight mark', () => {
    const doc = parseMarkdown('Hello ^^world^^ end\n')
    let found = false
    let markedText = ''
    doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'highlight')) {
        found = true
        markedText = node.text || ''
      }
    })
    expect(found).toBe(true)
    expect(markedText).toBe('world')
  })

  test('==text== parses to highlight mark', () => {
    const doc = parseMarkdown('Hello ==world== end\n')
    let found = false
    let markedText = ''
    doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'highlight')) {
        found = true
        markedText = node.text || ''
      }
    })
    expect(found).toBe(true)
    expect(markedText).toBe('world')
  })

  test('empty ^^^^ produces no highlight mark', () => {
    const doc = parseMarkdown('Hello ^^^^ end\n')
    let found = false
    doc.descendants((node) => {
      node.marks.forEach((m) => {
        if (m.type.name === 'highlight') found = true
      })
    })
    expect(found).toBe(false)
  })

  test('two ^^highlights^^ in one paragraph both parse', () => {
    const doc = parseMarkdown('^^a^^ and ^^b^^\n')
    const highlighted: string[] = []
    doc.descendants((node) => {
      if (node.isText && node.marks.some((m) => m.type.name === 'highlight')) {
        highlighted.push(node.text || '')
      }
    })
    expect(highlighted).toContain('a')
    expect(highlighted).toContain('b')
  })
})

describe('highlight mark — serialization', () => {
  test('highlight mark serializes to ^^text^^', () => {
    const doc = parseMarkdown('Hello ^^world^^ end\n')
    const out = serializeMarkdown(doc)
    expect(out).toContain('^^world^^')
  })

  test('==text== input roundtrips as ^^text^^', () => {
    const doc = parseMarkdown('Hello ==world== end\n')
    const out = serializeMarkdown(doc)
    expect(out).toContain('^^world^^')
  })

  test('second roundtrip is byte-stable for ^^text^^', () => {
    const input = 'Hello ^^world^^ end\n'
    const md1 = serializeMarkdown(parseMarkdown(input))
    const md2 = serializeMarkdown(parseMarkdown(md1))
    expect(md2).toBe(md1)
  })
})
