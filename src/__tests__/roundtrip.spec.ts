/**
 * Roundtrip CI gate (v0.60.0-pre §4.2):
 *   serialize(parse(serialize(parse(x)))) === serialize(parse(x))
 *
 * Allows first-pass normalization (e.g. `_em_` → `*em*`) but the second
 * roundtrip must be byte-identical.
 */
import { describe, test, expect } from 'vitest'
import { parseMarkdown, serializeMarkdown } from '../markdown'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Test helper: __dirname equivalent for ESM. This file runs under vitest+node,
// not in browser bundle (which is the primary target).
const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, 'fixtures')

const fixtureFiles = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.md'))
  .sort()

describe('roundtrip stability', () => {
  for (const file of fixtureFiles) {
    test(`${file}: second roundtrip is byte-stable`, () => {
      const content = readFileSync(join(fixturesDir, file), 'utf-8')

      const doc1 = parseMarkdown(content)
      const md1 = serializeMarkdown(doc1)

      const doc2 = parseMarkdown(md1)
      const md2 = serializeMarkdown(doc2)

      expect(md2).toBe(md1)
    })
  }
})

describe('roundtrip data traps (§4.4)', () => {
  test('inline code preserves `backticks` correctly', () => {
    const input = 'Use `const x = 1` syntax.\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toContain('`const x = 1`')
  })

  test('image with alt and src is preserved', () => {
    const input = '![alt](https://example.com/img.png)\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toContain('![alt](https://example.com/img.png)')
  })

  test('link with title is preserved including title', () => {
    const input = '[Moraya](https://moraya.app "Moraya site")\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toContain('https://moraya.app')
    expect(out).toContain('Moraya site')
  })

  test('fenced code block language identifier is preserved (no case mutation)', () => {
    const input = '```Go\npackage main\n```\n'
    const out = serializeMarkdown(parseMarkdown(input))
    // §4.6 absolute prohibition: no case mutation of language identifier
    expect(out).toMatch(/```Go\b/)
  })

  test('headings of all 6 levels round-trip', () => {
    const input = '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toMatch(/^# H1$/m)
    expect(out).toMatch(/^## H2$/m)
    expect(out).toMatch(/^### H3$/m)
    expect(out).toMatch(/^#### H4$/m)
    expect(out).toMatch(/^##### H5$/m)
    expect(out).toMatch(/^###### H6$/m)
  })

  test('horizontal rule is preserved', () => {
    const input = 'Above\n\n---\n\nBelow\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toContain('---')
  })

  test('blockquote round-trips', () => {
    const input = '> Quoted text\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toMatch(/^> /m)
  })

  test('strikethrough round-trips', () => {
    const input = '~~deleted~~\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toContain('~~deleted~~')
  })
})

describe('§4.6 first-pass normalization whitelist', () => {
  test('`_em_` is normalized to `*em*` on first roundtrip', () => {
    const input = '_italic_\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toContain('*italic*')
    // Second roundtrip must be byte-stable
    const out2 = serializeMarkdown(parseMarkdown(out))
    expect(out2).toBe(out)
  })

  test('`__strong__` is normalized to `**strong**` on first roundtrip', () => {
    const input = '__bold__\n'
    const out = serializeMarkdown(parseMarkdown(input))
    expect(out).toContain('**bold**')
    const out2 = serializeMarkdown(parseMarkdown(out))
    expect(out2).toBe(out)
  })
})
