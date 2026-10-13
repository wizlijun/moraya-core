import { expect, it } from 'vitest'
import { TableMap } from 'prosemirror-tables'
import { parseMarkdown, serializeMarkdown } from '../markdown'
import { EditorState } from 'prosemirror-state'
import { applySourceBlockTransaction, createSourceSession } from '../source-fidelity'

it('parses a header-only table without synthesizing an invalid body', () => {
  const raw = '| A | B |\n| --- | ---: |'
  const doc = parseMarkdown(raw), table = doc.firstChild!
  expect(table.type.name).toBe('table')
  expect(table.childCount).toBe(1)
  expect(TableMap.get(table)).toMatchObject({ height: 1, width: 2, problems: null })
  expect(() => doc.check()).not.toThrow()
  for (const [index, alignment] of ['left', 'right'].entries()) {
    expect(table.firstChild!.child(index).attrs).toEqual({ alignment, colspan: 1, rowspan: 1, colwidth: null })
  }
  expect(serializeMarkdown(doc)).toBe('| A | B |\n| --- | ---: |\n')
  expect(parseMarkdown(serializeMarkdown(doc)).eq(doc)).toBe(true)
  const capture = createSourceSession(raw, doc.type.schema)
  expect(capture.ok).toBe(true)
  if (!capture.ok) throw new Error(capture.reason)
  expect(capture.session.source).toBe(raw)
  expect(capture.session.doc.firstChild!.childCount).toBe(1)
  expect(() => capture.session.doc.check()).not.toThrow()
  expect(TableMap.get(capture.session.doc.firstChild!).problems).toBeNull()
})

it.each([
  ['| A | B |\n| --- | ---: |\n| C | D |', 2, 2],
  ['| A |\n| --- |', 1, 1],
  ['> | A | B |\n> | --- | ---: |', 1, 2],
  ['> | A | B |\n> | --- | ---: |\n> | C | D |', 2, 2],
  ['- Intro\n\n  | A | B |\n  | --- | ---: |', 1, 2],
  ['- Intro\n\n  | A | B |\n  | --- | ---: |\n  | C | D |', 2, 2],
] as const)('keeps valid table geometry for %j', (raw, height, width) => {
  const legacy = parseMarkdown(raw)
  expect(() => legacy.check()).not.toThrow()
  expect(parseMarkdown(serializeMarkdown(legacy)).toJSON()).toEqual(legacy.toJSON())
  expect(parseMarkdown(serializeMarkdown(legacy)).eq(legacy)).toBe(true)
  const captured = createSourceSession(raw)
  expect(captured.ok).toBe(true)
  if (!captured.ok) throw new Error(captured.reason)
  expect(captured.session.source).toBe(raw)
  expect(() => captured.session.doc.check()).not.toThrow()
  for (const doc of [legacy, captured.session.doc]) {
    let count = 0
    doc.descendants(node => {
      if (node.type.name === 'table') {
        count++
        expect(TableMap.get(node)).toMatchObject({ height, width, problems: null })
      }
    })
    expect(count).toBe(1)
  }
  const reopened = createSourceSession(captured.session.source)
  expect(reopened.ok && reopened.session.doc.eq(captured.session.doc)).toBe(true)
  let at = -1
  captured.session.doc.descendants((node, pos) => { if (node.isText && node.text === 'A') at = pos })
  expect(at).toBeGreaterThan(0)
  const tr = EditorState.create({ doc: captured.session.doc }).tr.insertText('Z', at, at + 1)
  const edited = applySourceBlockTransaction(captured.session, tr)
  expect(edited.ok).toBe(true)
  if (!edited.ok) throw new Error(edited.reason)
  expect(edited.session.doc.eq(tr.doc)).toBe(true)
  expect(edited.session.source).toContain('Z')
})

it('keeps a non-table pipe paragraph a paragraph in both parsers', () => {
  const raw = '| A | B |', doc = parseMarkdown(raw), captured = createSourceSession(raw)
  expect(doc.firstChild!.type.name).toBe('paragraph')
  expect(parseMarkdown(serializeMarkdown(doc)).eq(doc)).toBe(true)
  expect(captured.ok && captured.session.doc.firstChild!.type.name).toBe('paragraph')
  expect(captured.ok && captured.session.source).toBe(raw)
})
