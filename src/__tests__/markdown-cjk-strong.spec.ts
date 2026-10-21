import {expect, it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {parseMarkdown} from '../markdown'
import {applySourceBlockTransaction, createSourceSession} from '../source-fidelity'

const sentence = '用户怎么用 Tower.md，我们预测不了；人脑在哪里会出错，我们预测得了。'
const tail = '所以核心不预设任何场景，'
const raw = `**${sentence}**${tail}`

it.each([
  [raw, sentence, tail],
  ['前**「重点」**后', '「重点」', '后'],
  ['前**“重点”**后', '“重点”', '后'],
  ['前**（重点！）**后', '（重点！）', '后'],
  ['**重点，**后', '重点，', '后'],
  ['**重点？**after', '重点？', 'after'],
  ['***重点。***后', '重点。', '后'],
])('parses CJK punctuation at strong boundaries without changing source: %s', (source, bold, after) => {
  const parsed = parseMarkdown(source)
  const opened = createSourceSession(source)
  expect(opened.ok).toBe(true)
  if (!opened.ok) throw Error(opened.reason)
  expect(opened.session.source).toBe(source)
  expect(opened.session.doc.eq(parsed)).toBe(true)
  const strong: string[] = []
  parsed.descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === 'strong')) strong.push(node.text!) })
  expect(strong.join('')).toBe(bold)
  expect(parsed.firstChild!.lastChild!.text).toBe(after)
  expect(parsed.firstChild!.lastChild!.marks).toEqual([])
})

it.each(['**bold.**after', '** 重点。**后', '**重点。 **后', '\\*\\*重点。\\*\\*后', '`**重点。**后`', '$**重点。**后$'])('keeps ASCII, whitespace and opaque rules: %s', source => {
  const doc = parseMarkdown(source)
  let strong = false
  doc.descendants(node => { if (node.marks.some(mark => mark.type.name === 'strong')) strong = true })
  expect(strong).toBe(false)
})

it('keeps native pairing for mixed star runs', () => {
  const doc = parseMarkdown('*重点。***后')
  expect(doc.firstChild!.firstChild!.text).toBe('重点。')
  expect(doc.firstChild!.firstChild!.marks.map(mark => mark.type.name)).toEqual(['em'])
  expect(doc.firstChild!.lastChild!.text).toBe('**后')
  const opened = createSourceSession('*重点。***后')
  expect(opened.ok && opened.session.doc.eq(doc)).toBe(true)
})

it.each(['delete punctuation', 'insert space', 'insert bold space', 'remove strong'] as const)('admits %s on the reported sentence', operation => {
  const opened = createSourceSession(raw)
  if (!opened.ok) throw Error(opened.reason)
  const base = opened.session, tr = EditorState.create({doc: base.doc}).tr
  expect(base.doc.firstChild!.firstChild!.marks.map(mark => mark.type.name)).toEqual(['strong'])
  const end = 1 + sentence.length
  const expected = operation === 'delete punctuation' ? raw.replace('。', '')
    : operation === 'insert bold space' ? raw.replace('。**所', '。&#32;**&#25152;')
    : operation === 'insert space' ? raw.replace('**所以', '** 所以') : sentence + tail
  if (operation === 'delete punctuation') tr.delete(end - 1, end)
  else if (operation === 'insert bold space') tr.insertText(' ', end)
  else if (operation === 'insert space') tr.insertText(' ', end).removeMark(end, end + 1)
  else tr.removeMark(1, end, base.doc.type.schema.marks.strong)
  const result = applySourceBlockTransaction(base, tr)
  expect(result.ok).toBe(true)
  if (!result.ok) throw Error(result.reason)
  expect(result.session.source).toBe(expected)
  expect(result.session.doc.eq(tr.doc)).toBe(true)
})
