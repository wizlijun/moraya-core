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
