import { expect, it } from 'vitest'
import { prepareVerifiedFileBase, prepareCandidate, emptyFileParseWork } from '../source-file-cache'
import { createSourceSession, prepareFileSourceEdits, type SourceSession } from '../source-fidelity'

function open(source: string): SourceSession {
  const r = createSourceSession(source)
  if (!r.ok) throw new Error(r.reason)
  return r.session
}
function replace(base: SourceSession, removed: string, text: string) {
  const from = base.source.indexOf(removed)
  expect(from).toBeGreaterThanOrEqual(0)
  return prepareFileSourceEdits(base, { expectedRevision: base.revision,
    edits: [{ from, to: from + removed.length, removed, text }] })
}
it('preserves duplicates and unused definitions while promoting a deleted winner', () => {
  const base = open('[A][id]\n\n[id]: /one\n[id]: /two\n[unused]: /keep\n')
  const r = replace(base, '[id]: /one\n', '')
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.session.doc.firstChild!.firstChild!.marks[0]!.attrs.href).toBe('/two')
  expect(r.session.source).toContain('[unused]: /keep')
  expect(r.file.environmentVersion).toBe(1)
  expect(r.file.work.environmentChanged).toBe(true)
  expect(r.file.correspondence[0]!.kind).toBe('untouched')
})
it('resolves a remote previously unresolved reference without changing its raw root', () => {
  const base = open('[new]\n\nOther')
  const r = prepareFileSourceEdits(base, { expectedRevision: 0, edits: [{ from: base.source.length,
    to: base.source.length, removed: '', text: '\n\n[new]: /url\n' }] })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.session.doc.firstChild!.firstChild!.marks[0]!.attrs.href).toBe('/url')
  expect(r.file.correspondence[0]!.kind).toBe('untouched')
})
it('returns the identical base for a cache-hit no-op with zero work', () => {
  const base = open('alpha')
  const r = prepareFileSourceEdits(base, { expectedRevision: 0, edits: [] })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.session).toBe(base)
  expect(r.file.work.fullCaptureCalls).toBe(0)
  expect(r.file.work.pmEmissionTokenCount).toBe(0)
})
it.each(['', '[unused]: /keep\n'])('advances raw revision even with equal PM: %j', source => {
  const base = open(source)
  const r = prepareFileSourceEdits(base, { expectedRevision: 0, edits: [{ from: base.source.length,
    to: base.source.length, removed: '', text: '[another]: /x\n' }] })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.session.revision).toBe(1)
  expect(r.session.doc.eq(base.doc)).toBe(true)
})
it('rejects CAS mismatch and malformed patches without parsing or publishing', () => {
  const base = open('a😀b\r\nc')
  for (const input of [
    { expectedRevision: 1, edits: [] },
    { expectedRevision: 0, edits: [{ from: 1, to: 2, removed: '\uD83D', text: '' }] },
    { expectedRevision: 0, edits: [{ from: 4, to: 5, removed: '\r', text: '' }] },
    { expectedRevision: 0, edits: [{ from: 0, to: 1, removed: 'wrong', text: '' }] },
  ]) {
    const r = prepareFileSourceEdits(base, input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.work.fullCaptureCalls).toBe(0)
  }
  expect(base.source).toBe('a😀b\r\nc')
})

it('adds definitions with a local block window and invalidates all inline roots', () => {
  const base = open('[new]\n\nMiddle\n\nEnd')
  const r = prepareFileSourceEdits(base, { expectedRevision: 0, edits: [{ from: base.source.length,
    to: base.source.length, removed: '', text: '\n\n[new]: /url\n' }] })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.file.work.fullCaptureCalls).toBe(0)
  expect(r.file.work.environmentChanged).toBe(true)
  expect(r.file.work.inlineRoots).toEqual([0, 1, 2])
})

it.each([
  ['paragraph split', 'Paragraph 8 alpha beta', 'Paragraph 8 alpha\n\nbeta', 'split'],
  ['paragraph join', 'Paragraph 8 alpha beta\n\nParagraph 9 alpha beta', 'Paragraph 8 alpha beta Paragraph 9 alpha beta', 'join'],
  ['paragraph delete', 'Paragraph 8 alpha beta\n\n', '', 'deleted'],
] as const)('local correspondence: %s', (_name, removed, added, kind) => {
  const base = open(Array.from({ length: 20 }, (_, i) => `Paragraph ${i} alpha beta`).join('\n\n'))
  const r = replace(base, removed, added)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.file.work.fullCaptureCalls).toBe(0)
  expect(r.file.work.inlineRoots.length).toBeLessThanOrEqual(5)
  expect(r.file.correspondence.some(c => c.kind === kind)).toBe(true)
  const oracle = open(r.session.source)
  expect(r.session.doc.eq(oracle.doc)).toBe(true)
  for (const key of ['roots', 'gaps', 'protectedSources', 'layout', 'textSpans'] as const) expect(r.session[key]).toEqual(oracle[key])
})

it.each([
  'A[^x] ![alt[^x]](/img)\n\nBefore\n\nMiddle\n\nAfter\n\n[^x]: body',
  'A[^y] B[^x]\n\nBefore\n\nMiddle\n\nAfter\n\n[^x]: X\n\n[^y]: Y',
])('replays prefix footnote effects for a local unrelated edit: %s', source => {
  const base = open(source), r = replace(base, 'Middle', 'Changed')
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.file.work.fullCaptureCalls).toBe(0)
  expect(r.file.work.inlineParseCalls).toBeLessThanOrEqual(3)
  expect(r.file.work.inlineEffectReplayCount).toBeGreaterThan(0)
  expect(r.file.environmentVersion).toBe(0)
  const oracle = open(r.session.source)
  expect(r.session.doc.eq(oracle.doc)).toBe(true)
})
it('runtime effect changes invalidate inline suffix without changing semantic environment version', () => {
  const base = open('Before\n\nA[^x] B[^y]\n\nAfter\n\n[^x]: X[^y]\n\n[^y]: Y')
  const r = replace(base, 'A[^x] B[^y]', 'B[^y] A[^x]')
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.file.environmentVersion).toBe(0)
  expect(r.file.work.inlineParseCalls).toBeGreaterThanOrEqual(5)
  expect(r.session.doc.eq(open(r.session.source).doc)).toBe(true)
})

it('recovers foreign authority once, preserves no-op identity, and rejects altered facts atomically', () => {
  const base = open('A\n\n> ```js\n> F\n> ```')
  const foreign = { ...base, roots: base.roots.map(r => ({ ...r })), layout: { ...base.layout } }
  const first = prepareFileSourceEdits(foreign, { expectedRevision: 0, edits: [] })
  expect(first.ok).toBe(true)
  if (!first.ok) return
  expect(first.session).toBe(foreign)
  expect(first.file.work.fullCaptureCalls).toBe(1)
  expect(first.file.work.inlineRoots).toEqual(base.roots.map(root=>root.id))
  expect(first.file.work.mode).toBe('full-fallback')
  expect(first.file.work.fallbackReason).toBe('cache-miss')
  const second = prepareFileSourceEdits(foreign, { expectedRevision: 0, edits: [] })
  expect(second.ok && second.file.work.fullCaptureCalls).toBe(0)
  const bad = { ...base, roots: base.roots.map((r, i) => i ? r : { ...r, sourceTo: r.sourceTo + 1 }) }
  for (let i = 0; i < 2; i++) {
    const r = prepareFileSourceEdits(bad, { expectedRevision: 0, edits: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.work.fullCaptureCalls).toBe(1)
  }
})
it.each([
  ['unclosed fence', 'Middle', '```'],
  ['setext', 'Middle', 'Title\n==='],
  ['HTML', 'Middle', '<div>\nbody'],
  ['list continuation', 'Middle', '- A\n  continuation'],
  ['definition list', 'Middle', 'Term\n: definition'],
  ['math block', 'Middle', '$$\nx+y\n$$'],
] as const)('explicit fallback keeps oracle equality: %s', (_name, removed, added) => {
  const base = open('Before\n\nMiddle\n\nAfter\n\nTail'), r = replace(base, removed, added)
  const source = base.source.replace(removed, () => added), oracle = createSourceSession(source)
  expect(r.ok).toBe(oracle.ok)
  if (!r.ok || !oracle.ok) return
  expect(r.file.work.mode).toBe('full-fallback')
  expect(r.file.work.fullCaptureCalls).toBeGreaterThan(0)
  expect(r.session.doc.eq(oracle.session.doc)).toBe(true)
  for (const key of ['roots', 'gaps', 'protectedSources', 'layout', 'textSpans'] as const)
    expect(r.session[key]).toEqual(oracle.session[key])
})
it('correspondence tracks gap birth and whole-source repartition without text matching', () => {
  const base = open('Same\n\nSame'), from = base.roots[1]!.sourceFrom
  const prepend = prepareFileSourceEdits(base, { expectedRevision: 0, edits: [{ from, to: from, removed: '', text: 'New\n\n' }] })
  expect(prepend.ok).toBe(true)
  if (prepend.ok) {
    expect(prepend.file.correspondence).toContainEqual({ beforeRoots: [0], afterRoots: [0], kind: 'untouched' })
    expect(prepend.file.correspondence).toContainEqual({ beforeRoots: [1], afterRoots: [2], kind: 'untouched' })
    expect(prepend.file.correspondence).toContainEqual({ beforeRoots: [], afterRoots: [1], kind: 'birth' })
  }
  const all = replace(base, base.source, 'Same\n\nDifferent\n\nSame')
  expect(all.ok).toBe(true)
  if (all.ok) expect(all.file.correspondence).toEqual([{ beforeRoots: [0, 1], afterRoots: [0, 1, 2], kind: 'repartition' }])
})

it.each([
  '\uFEFFAlpha\r\n\r\nMiddle\r\n\r\nTail', 'Alpha\r\rMiddle\r\rTail',
  'Alpha\n\nMiddle\0\n\nTail', 'Alpha\n\nMiddle😀\n\nTail',
])('keeps raw preprocessing bytes and compares complete capture: %j', source => {
  const base = open(source), r = replace(base, 'Middle', 'Changed')
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const expected = source.replace('Middle', 'Changed'), oracle = open(expected)
  expect(Buffer.from(r.session.source)).toEqual(Buffer.from(expected))
  expect(r.session.doc.eq(oracle.doc)).toBe(true)
  for (const key of ['roots', 'gaps', 'protectedSources', 'layout', 'textSpans'] as const) expect(r.session[key]).toEqual(oracle[key])
})
it.each([
  [{ from: 0, to: 0, removed: '', text: 'x' }, { from: 0, to: 0, removed: '', text: 'y' }],
  [{ from: 1, to: 2, removed: 'b', text: 'x' }, { from: 0, to: 1, removed: 'a', text: 'y' }],
  [{ from: 0, to: 2, removed: 'ab', text: 'x' }, { from: 1, to: 2, removed: 'b', text: 'y' }],
  [{ from: NaN, to: 0, removed: '', text: 'x' }],
  [{ from: 0, to: Infinity, removed: '', text: 'x' }],
  [{ from: -1, to: 0, removed: '', text: 'x' }],
  [{ from: 0.5, to: 1, removed: 'a', text: 'x' }],
].map(edits => ({ edits })))('rejects malformed raw patches without work: $edits', ({ edits }) => {
  const base = open('abc'), r = prepareFileSourceEdits(base, { expectedRevision: 0, edits })
  expect(r.ok).toBe(false)
  if (!r.ok) { expect(r.work.fullCaptureCalls).toBe(0); expect(r.work.rawSplicedCodeUnits).toBe(0) }
})
it.each([
  '[A][id]\n\n[id]: /one\n[id]: /two\n',
  '[A][id]\n\n> [id]: /one\n> [unused]: /keep\n',
  '[A][id]\n\n- [id]: /one\n\n  text\n',
  '[A][id]\n\n[id]: /one\n  "title"\n',
  '[A][id]\n\n[id]: /one\n  "title" garbage\n',
  '[^x] [^y]\n\n[^x]: X[^x]\n\n[^x]: duplicate\n\n[^y]: Y',
])('rebuilds definition environment through actual rules: %s', source => {
  const base = open(source), removed = source.includes('/one') ? '/one' : '[^x]: X[^x]', added = source.includes('/one') ? '/changed' : '[^z]: X[^z]'
  const r = replace(base, removed, added)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const oracle = open(r.session.source)
  expect(r.session.doc.eq(oracle.doc)).toBe(true)
  for (const key of ['roots', 'gaps', 'protectedSources', 'layout', 'textSpans'] as const) expect(r.session[key]).toEqual(oracle[key])
})
it('changing only a duplicate loser keeps semantic version and local inline closure', () => {
  const base = open('Start\n\n[A][id]\n\nBefore\n\nMiddle\n\n[id]: /one\n[id]: /two\n\nTail')
  const r = replace(base, '/two', '/loser')
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.file.environmentVersion).toBe(0)
  expect(r.file.work.environmentChanged).toBe(false)
  expect(r.file.work.fullCaptureCalls).toBe(0)
  expect(r.file.work.inlineParseCalls).toBeLessThan(r.session.roots.length)
  expect(r.session.doc.eq(open(r.session.source).doc)).toBe(true)
})
it('records a real enclosing window for two distant edits', () => {
  const base = open(Array.from({ length: 30 }, (_, i) => `Paragraph ${i} alpha beta`).join('\n\n'))
  const edits = [5, 22].map(i => { const from = base.source.indexOf(`Paragraph ${i} alpha`) + `Paragraph ${i} `.length
    return { from, to: from + 5, removed: 'alpha', text: 'omega' } })
  const r = prepareFileSourceEdits(base, { expectedRevision: 0, edits })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.file.work.fullCaptureCalls).toBe(0)
  expect(r.file.work.blockWindows).toHaveLength(1)
  expect(r.file.work.inlineRoots.length).toBeGreaterThan(3)
  expect(r.file.work.rawTouchedBeforeRoots).toEqual([5, 22])
  expect(r.session.doc.eq(open(r.session.source).doc)).toBe(true)
})

it('failed foreign candidate cannot publish recovery or mutate reusable templates', () => {
  const original = open('Alpha\n\nTail'), foreign = { ...original, roots: original.roots.map(r => ({ ...r })) }
  const fingerprint = JSON.stringify(foreign), work = emptyFileParseWork(), verified = prepareVerifiedFileBase(foreign, work)
  if ('ok' in verified) throw new Error(verified.reason)
  const failed = prepareCandidate(verified, [{ from: 0, to: 5, removed: 'Alpha', text: 'Beta' }], work, original.doc)
  expect(failed.ok).toBe(false)
  expect(JSON.stringify(foreign)).toBe(fingerprint)
  const recovered = prepareFileSourceEdits(foreign, { expectedRevision: 0, edits: [] })
  expect(recovered.ok).toBe(true)
  if(recovered.ok) expect(recovered.file.work.fullCaptureCalls).toBe(1)
  expect(replace(foreign, 'Alpha', 'Gamma').ok).toBe(true)
})
