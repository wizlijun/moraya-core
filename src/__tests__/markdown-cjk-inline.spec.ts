import {expect, it} from 'vitest'
import {EditorState, TextSelection} from 'prosemirror-state'
import {parseMarkdown} from '../markdown'
import {applySourceBlockTransaction, createSourceSession} from '../source-fidelity'

const formats = [
  ['**', 'strong'], ['__', 'strong'], ['*', 'em'], ['_', 'em'],
  ['~~', 'strike_through'], ['==', 'highlight'], ['^^', 'highlight'],
] as const

it.each(formats.flatMap(([marker, mark]) => ['重点。', '“重点”', '（重点！）'].map(text => ({marker, mark, text}))))(
  '$marker parses CJK punctuation with adjacent text: $text', ({marker, mark, text}) => {
    const raw = `前${marker}${text}${marker}后`, result = createSourceSession(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) throw Error(result.reason)
    const middle = result.session.doc.firstChild!.child(1)
    expect(middle.text).toBe(text)
    expect(middle.marks.map(mark => mark.type.name)).toEqual([mark])
    expect(result.session.doc.eq(parseMarkdown(raw))).toBe(true)
    expect(result.session.source).toBe(raw)
  },
)

it.each(formats.flatMap(([marker, mark]) => ['delete punctuation', 'delete outer space', 'replace end with space', 'delete first word', 'delete last word'].map(operation => ({marker, mark, operation}))))(
  '$marker admits $operation and preserves the PM result', ({marker, mark, operation}) => {
    const body = operation.includes('word') ? '甲 乙' : '重点。'
    const raw = `${marker}${body}${marker}${operation === 'delete outer space' ? ' ' : ''}后`
    const opened = createSourceSession(raw)
    if (!opened.ok) throw Error(opened.reason)
    const base = opened.session, state = EditorState.create({doc: base.doc}), end = 1 + body.length
    expect(base.doc.firstChild!.firstChild!.marks.map(mark => mark.type.name)).toEqual([mark])
    const tr = state.tr
    if (operation === 'delete outer space') tr.delete(end, end + 1)
    else if (operation === 'delete first word') tr.delete(1, 2)
    else if (operation === 'replace end with space') tr.setSelection(TextSelection.create(base.doc, end - 1, end)).insertText(' ')
    else tr.delete(end - 1, end)
    const result = applySourceBlockTransaction(base, tr)
    expect(result.ok).toBe(true)
    if (!result.ok) throw Error(result.reason)
    expect(result.session.doc.eq(tr.doc)).toBe(true)
    expect(result.session.source.startsWith(marker)).toBe(true)
    expect(result.session.source).not.toContain('\\' + marker)
    expect(base.source).toBe(raw)
  },
)

it.each(['foo_bar_baz', 'foo__bar__baz', '*bold.*after', '__bold.__after', '~~bold.~~after', '==bold.==after'])('retains ASCII flanking: %s', raw => {
  const doc = parseMarkdown(raw)
  expect(doc.firstChild!.textContent).toBe(raw)
  expect(doc.firstChild!.firstChild!.marks).toEqual([])
})

it.each(formats)('%s remains literal in code, math and escapes', (marker, mark) => {
  for (const raw of ['`' + marker + '重点。' + marker + '后`', '$' + marker + '重点。' + marker + '后$', marker.split('').map(c => '\\' + c).join('') + '重点。' + marker.split('').map(c => '\\' + c).join('') + '后']) {
    const doc = parseMarkdown(raw)
    let formatted = false
    doc.descendants(node => { if (node.marks.some(m => m.type.name === mark)) formatted = true })
    expect(formatted).toBe(false)
  }
})
