import { expect, it } from 'vitest'
import { identityTrace, sliceTrace, editTrace } from '../source-trace'

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
