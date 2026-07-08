import { describe, it, expect } from 'vitest'
import { parseMarkdown, serializeMarkdown } from '../markdown'

const DOC = `---
title: Hello
tags:
  - a
  - b
list:
  - one
  - two
---

# Body

text here
`

describe('YAML frontmatter', () => {
  it('parses a leading --- … --- block into a single frontmatter node with newlines preserved', () => {
    const doc = parseMarkdown(DOC)
    const first = doc.firstChild!
    expect(first.type.name).toBe('frontmatter')
    expect(first.textContent).toBe(
      'title: Hello\ntags:\n  - a\n  - b\nlist:\n  - one\n  - two',
    )
    // The rest of the document is untouched.
    expect(doc.child(1).type.name).toBe('heading')
  })

  it('round-trips frontmatter back to identical markdown', () => {
    const doc = parseMarkdown(DOC)
    // The serializer never emits a trailing newline (true for any document).
    expect(serializeMarkdown(doc)).toBe(DOC.replace(/\n$/, ''))
  })

  it('does not treat a non-leading --- as frontmatter', () => {
    const md = `# Title\n\n---\n\nbody\n`
    const doc = parseMarkdown(md)
    expect(doc.firstChild!.type.name).toBe('heading')
    // The --- after the heading stays a horizontal rule.
    expect(doc.child(1).type.name).toBe('horizontal_rule')
  })

  it('leaves a document with no closing fence as normal markdown', () => {
    const md = `---\nnot really frontmatter\n`
    const doc = parseMarkdown(md)
    expect(doc.firstChild!.type.name).not.toBe('frontmatter')
  })
})
