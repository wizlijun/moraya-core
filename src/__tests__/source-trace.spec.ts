import { expect, it } from 'vitest'
import { identityTrace, sliceTrace, editTrace } from '../source-trace'
import type { SourceTrace } from '../source-trace'

it('records only declared changes, including generated math separator', () => {
  const t = editTrace(identityTrace('甲\n$$\n'), [{ from: 2, to: 2, text: '\n' }])
  expect(t.text).toBe('甲\n\n$$\n')
  expect(sliceTrace(t, 3, 5).pieces).toEqual([
    { from: 0, to: 2, sourceFrom: 2, sourceTo: 4, kind: 'copy' },
  ])
  expect(sliceTrace(t, 2, 3).pieces[0]?.kind).toBe('generated')
  const n = editTrace(identityTrace('A\r\nB\0'), [
    { from: 1, to: 3, text: '\n' }, { from: 4, to: 5, text: '\uFFFD' },
  ])
  expect(n.text).toBe('A\nB\uFFFD')
  expect(n.pieces.filter(p => p.kind === 'atomic').map(p => [p.sourceFrom, p.sourceTo]))
    .toEqual([[1, 3], [4, 5]])
})
it('only maps complete atomic replacements and composes changes', () => {
  const t = editTrace(identityTrace('A&amp;B'), [{ from: 1, to: 6, text: 'XY' }])
  expect(sliceTrace(t, 1, 3).pieces).toEqual([
    { from: 0, to: 2, sourceFrom: 1, sourceTo: 6, kind: 'atomic' },
  ])
  expect(sliceTrace(t, 2, 3).pieces[0]?.kind).toBe('generated')
  const n = editTrace(t, [{ from: 1, to: 3, text: '&' }])
  expect(n.text).toBe('A&B')
  expect(n.pieces[1]).toEqual({ from: 1, to: 2, sourceFrom: 1, sourceTo: 6, kind: 'atomic' })
})
it('rejects overlapping or out-of-bounds edits', () => {
  for (const edits of [
    [{ from: -1, to: 0, text: '' }], [{ from: 2, to: 1, text: '' }],
    [{ from: 0, to: 4, text: '' }],
    [{ from: 1, to: 2, text: '' }, { from: 1, to: 1, text: '' }],
  ]) expect(() => editTrace(identityTrace('abc'), edits)).toThrow(RangeError)
})

it('locates ordered slices and composes edits without rescanning piece prefixes', () => {
  const counts: number[] = []
  for (const size of [128, 256]) {
    const base = editTrace(identityTrace('a\r\n'.repeat(size)), Array.from({ length: size }, (_, i) =>
      ({ from: i * 3 + 1, to: i * 3 + 3, text: '\n' })))
    let reads = 0
    const traced: SourceTrace = { text: base.text, pieces: new Proxy(base.pieces, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++
        return Reflect.get(target, key, receiver)
      },
    }) }
    for (let i = 0; i < size; i++) expect(sliceTrace(traced, i * 2, i * 2 + 1).text).toBe('a')
    const result = editTrace(traced, Array.from({ length: size }, (_, i) =>
      ({ from: i * 2, to: i * 2 + 1, text: 'b' })))
    expect(result.text).toBe('b\n'.repeat(size))
    expect(result.pieces).toHaveLength(size * 2)
    counts.push(reads)
  }
  expect(counts[1]).toBeLessThan(counts[0]! * 2.6)
})

it('preserves inclusive insertion anchors and partial-atomic opacity during composition', () => {
  const base = editTrace(identityTrace('abcd'), [{ from: 0, to: 3, text: 'XY' }])
  const inserted = editTrace(base, [{ from: 2, to: 2, text: '!' }, { from: 2, to: 2, text: '?' }])
  expect(inserted.text).toBe('XY!?d')
  expect(inserted.pieces.slice(1, 3)).toEqual([
    { from: 2, to: 3, sourceFrom: 0, sourceTo: 0, kind: 'generated' },
    { from: 3, to: 4, sourceFrom: 0, sourceTo: 0, kind: 'generated' },
  ])
  const partial = editTrace(base, [{ from: 1, to: 2, text: '!' }, { from: 2, to: 3, text: '' }])
  expect(partial.text).toBe('X!')
  expect(partial.pieces.every(p => p.kind === 'generated')).toBe(true)
})
