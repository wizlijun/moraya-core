import { afterEach, expect, it, vi } from 'vitest'
import MarkdownIt from 'markdown-it'
import { EditorState } from 'prosemirror-state'
import { createSourceSession, applySourceBlockTransaction, prepareFileSourceEdits } from '../source-fidelity'

const probe = new MarkdownIt()
afterEach(() => vi.restoreAllMocks())

it.each([100, 1000])('existing rich entry parses one changed paragraph locally in %i roots', count => {
  const source = Array.from({ length: count }, (_, i) => `Paragraph ${i} alpha beta`).join('\n\n')
  const block = vi.spyOn(Object.getPrototypeOf(probe.block), 'parse')
  const inline = vi.spyOn(Object.getPrototypeOf(probe.inline), 'parse')
  const opened = createSourceSession(source)
  expect(opened.ok).toBe(true)
  if (!opened.ok) throw new Error(opened.reason)
  console.log(JSON.stringify({ phase: 'open', count, block: block.mock.calls.length,
    blockUnits: block.mock.calls.reduce((sum, args) => sum + String(args[0]).length, 0),
    inline: inline.mock.calls.length }))
  block.mockClear(); inline.mockClear()
  const root = opened.session.roots[Math.floor(count / 2)]!
  const pos = root.pmFrom + 1 + `Paragraph ${Math.floor(count / 2)} `.length
  const tr = EditorState.create({ doc: opened.session.doc }).tr.insertText('omega', pos, pos + 5)
  const result = applySourceBlockTransaction(opened.session, tr)
  expect(result.ok).toBe(true)
  if (result.ok) console.log(JSON.stringify({ phase: 'work', count, work: result.file!.work }))
  console.log(JSON.stringify({ phase: 'edit', count, block: block.mock.calls.length,
    blockUnits: block.mock.calls.reduce((sum, args) => sum + String(args[0]).length, 0),
    inline: inline.mock.calls.length }))
  expect(inline.mock.calls.length).toBe(3)
  if(result.ok){expect(result.file!.work.blockRuleCalls).toBe(48);expect(result.file!.work.blockLinesVisited).toBe(221);expect(result.file!.work.topLevelRunnerCalls).toBe(1)}
})

it.each([100, 1000])('raw API updates one ordinary paragraph locally in %i roots', count => {
  const source = Array.from({ length: count }, (_, i) => `Paragraph ${i} alpha beta`).join('\n\n')
  const opened = createSourceSession(source)
  expect(opened.ok).toBe(true)
  if (!opened.ok) throw new Error(opened.reason)
  const target = `Paragraph ${Math.floor(count / 2)} alpha beta`
  const from = source.indexOf(target) + target.indexOf('alpha')
  const expected = source.slice(0, from) + 'omega' + source.slice(from + 5)
  const result = prepareFileSourceEdits(opened.session, {
    expectedRevision: 0, edits: [{ from, to: from + 5, removed: 'alpha', text: 'omega' }],
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  expect(Buffer.from(result.session.source)).toEqual(Buffer.from(expected))
  expect(result.session.revision).toBe(1)
  expect(result.file.work.mode).toBe('local')
  expect(result.file.work.fullCaptureCalls).toBe(0)
  expect(result.file.work.legacyParseCalls).toBe(0)
  expect(result.file.work.topLevelRunnerCalls).toBe(1)
  expect(result.file.work.inlineRoots.length).toBeLessThanOrEqual(3)
  const oracle = createSourceSession(expected)
  expect(oracle.ok).toBe(true)
  if (!oracle.ok) throw new Error(oracle.reason)
  expect(result.session.doc.eq(oracle.session.doc)).toBe(true)
  for (const key of ['roots', 'gaps', 'protectedSources', 'layout', 'textSpans'] as const)
    expect(result.session[key]).toEqual(oracle.session[key])
  expect(opened.session.source).toBe(source)
})

it.each(['literal a[0]', '\\*star\\* and _em_', '# literal\\#', 'A  \nB', '[empty]() and A', 'A[^x]\n\n[^x]: body', '<b>A</b>'])('source-only mark renderer has no unreported legacy parses: %s', source => {
  const opened = createSourceSession(source)
  if(!opened.ok)throw new Error(opened.reason)
  let from = -1, size = 0
  opened.session.doc.descendants((node,pos)=>{if(from < 0 && node.isText){from=pos;size=node.text!.length}})
  expect(from).toBeGreaterThanOrEqual(0)
  const block = vi.spyOn(Object.getPrototypeOf(probe.block),'parse')
  const inline = vi.spyOn(Object.getPrototypeOf(probe.inline),'parse')
  const tr = EditorState.create({doc:opened.session.doc}).tr.addMark(from,from+size,opened.session.doc.type.schema.marks.strong!.create())
  const r = applySourceBlockTransaction(opened.session,tr)
  expect(r.ok).toBe(true)
  if(!r.ok)return
  expect(r.session.doc.eq(tr.doc)).toBe(true)
  expect(r.file!.work.legacyParseCalls).toBe(0)
  expect(block).not.toHaveBeenCalled()
  expect(inline.mock.calls.length).toBe(r.file!.work.inlineParseCalls)
})
