import { describe, test, expect } from 'vitest'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'

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
