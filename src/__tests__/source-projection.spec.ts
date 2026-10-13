import { expect, it } from 'vitest'
import { projectLineEndings, sourceOffsetAt, viewOffsetAt } from '../source-projection'

it('keeps BOM and UTF16 while projecting only CRLF/loneCR', () => {
  const p = projectLineEndings('\uFEFFA\r\n😀B\rC\n')
  expect(p.text).toBe('\uFEFFA\n😀B\nC\n')
  expect(p.sourceLength).toBe(10)
  expect(p.changes).toEqual([
    { sourceFrom: 2, sourceTo: 4, viewFrom: 2, viewTo: 3 },
    { sourceFrom: 7, sourceTo: 8, viewFrom: 6, viewTo: 7 },
  ])
  expect([sourceOffsetAt(p, 2), sourceOffsetAt(p, 3)]).toEqual([2, 4])
  expect([viewOffsetAt(p, 3, -1), viewOffsetAt(p, 3, 1)]).toEqual([2, 3])
})

it.each(['', '\uFEFF', '\r\n', '\r\r\n', 'a\rb\nc\r\nd', '😀'.repeat(5000)])(
  'roundtrips every view boundary: %j', source => {
    const p = projectLineEndings(source)
    expect(p.text).toBe(source.replace(/\r\n?/g, '\n'))
    for (let i = 0; i <= p.text.length; i++) {
      const raw = sourceOffsetAt(p, i)
      expect(viewOffsetAt(p, raw, -1)).toBe(i)
      expect(viewOffsetAt(p, raw, 1)).toBe(i)
    }
    expect(() => sourceOffsetAt(p, -1)).toThrow(RangeError)
    expect(() => viewOffsetAt(p, source.length + 1, 1)).toThrow(RangeError)
  },
)
