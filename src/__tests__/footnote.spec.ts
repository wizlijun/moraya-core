import { describe, test, expect } from 'vitest'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })

describe('footnote schema', () => {
  test('footnote_ref is an inline atom carrying a label', () => {
    const type = schema.nodes.footnote_ref
    expect(type).toBeDefined()
    expect(type.isInline).toBe(true)
    expect(type.isAtom).toBe(true)
    const node = type.create({ label: 'loop' })
    expect(node.attrs.label).toBe('loop')
  })

  test('footnote_ref renders as <sup> with data-label', () => {
    const node = schema.nodes.footnote_ref.create({ label: 'loop' })
    const [tag, attrs] = schema.nodes.footnote_ref.spec.toDOM!(node) as [string, Record<string, string>]
    expect(tag).toBe('sup')
    expect(attrs['data-label']).toBe('loop')
    expect(attrs.class).toBe('moraya-footnote-ref')
  })

  test('footnote_definition is a block node accepting block content', () => {
    const type = schema.nodes.footnote_definition
    expect(type).toBeDefined()
    expect(type.isBlock).toBe(true)
    const para = schema.nodes.paragraph.create(null, schema.text('循环的注释。'))
    const def = type.create({ label: 'loop' }, para)
    expect(def.attrs.label).toBe('loop')
    expect(def.childCount).toBe(1)
  })
})
