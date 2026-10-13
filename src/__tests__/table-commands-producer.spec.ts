import { expect, it } from 'vitest'
import { EditorState, type Transaction } from 'prosemirror-state'
import { createSchema } from '../schema'
import { parseMarkdown } from '../markdown'
import { insertTable } from '../commands'

it('actual legacy insertTable command inserts a 3 by 3 table from the instance schema', () => {
  const schema = createSchema({ mediaResolver: { loadLocalImage: async p => p, loadLocalMedia: async p => p, loadRemoteMedia: async p => p } })
  const state = EditorState.create({ doc: parseMarkdown('', schema) })
  let tr: Transaction | undefined
  expect(insertTable(state, next => { tr = next })).toBe(true)
  expect(tr).toBeDefined()
  expect(tr!.doc.firstChild!.type).toBe(schema.nodes.table)
  expect(tr!.doc.firstChild!.childCount).toBe(3)
  expect(tr!.selection.$from.index(1)).toBe(0)
})

import type { Node as PmNode } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createEditorPlugins } from '../setup'

const mediaResolver = { loadLocalImage: async (p: string) => p, loadLocalMedia: async (p: string) => p, loadRemoteMedia: async (p: string) => p }
const headerOnly = '| A | B | C |\n| --- | :---: | ---: |'
function selectCell(doc: PmNode, row: number, col: number): TextSelection {
  let target: number | undefined
  doc.descendants((node, pos) => {
    if (target !== undefined) return false
    if (node.type.name !== 'table') return true
    let at = pos + 1
    for (let i = 0; i < row; i++) at += node.child(i).nodeSize
    at += 1
    for (let i = 0; i < col; i++) at += node.child(row).child(i).nodeSize
    target = at + 1
    return false
  })
  if (target === undefined) throw new Error('fixture table missing')
  return TextSelection.near(doc.resolve(target)) as TextSelection
}
for (const key of ['Tab', 'Enter']) it(`actual core ${key} appends one body with header alignments and one dispatch`, async () => {
  const schema = createSchema({ mediaResolver })
  const transactions: Transaction[] = []
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state: EditorState.create({ doc: parseMarkdown(headerOnly, schema), plugins: await createEditorPlugins({ mediaResolver, enableTableResize: false }, schema) }),
    dispatchTransaction(tr) { transactions.push(tr); view.updateState(view.state.applyTransaction(tr).state) },
  })
  try {
    view.dispatch(view.state.tr.setSelection(selectCell(view.state.doc, 0, 2)))
    transactions.length = 0
    const event = new KeyboardEvent('keydown', { key, ctrlKey: key === 'Enter', cancelable: true })
    expect(view.someProp('handleKeyDown', handler => handler(view, event))).toBe(true)
    expect(transactions).toHaveLength(1)
    expect(view.state.doc.firstChild!.childCount).toBe(2)
    const body = view.state.doc.firstChild!.child(1)
    expect(Array.from({ length: body.childCount }, (_, i) => body.child(i).attrs.alignment)).toEqual(['left', 'center', 'right'])
    expect(view.state.selection.$from.index(1)).toBe(1)
    expect(view.state.selection.$from.index(2)).toBe(key === 'Tab' ? 0 : 2)
  } finally { view.destroy(); mount.remove() }
})

import { Schema } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { TableMap } from 'prosemirror-tables'
import { closeHistory, history, undo, redo, undoDepth } from 'prosemirror-history'
import { serializeMarkdown } from '../markdown'
import { applySourceBlockTransaction, createSourceSession } from '../source-fidelity'
import { gfmTableCommand, type GfmTableAction } from '../table-commands'

function run(state: EditorState, command: Command) {
  let tr: Transaction | undefined
  const before = state
  expect(command(state)).toBe(true)
  expect(state).toBe(before)
  expect(command(state, next => { tr = next })).toBe(true)
  expect(tr).toBeDefined()
  tr!.doc.check()
  return { tr: tr!, state: state.apply(tr!) }
}
function stateAt(raw = headerOnly, row = 0, col = 2) {
  const state = EditorState.create({ doc: parseMarkdown(raw), plugins: [history()] })
  return state.apply(state.tr.setSelection(selectCell(state.doc, row, col)))
}
function attrs(row: PmNode) { return Array.from({ length: row.childCount }, (_, i) => row.child(i).attrs) }
function expectFreshRow(row: PmNode) {
  expect(attrs(row)).toEqual(['left', 'center', 'right'].map(alignment => ({ alignment, colspan: 1, rowspan: 1, colwidth: null })))
}
function reject(state: EditorState, action: GfmTableAction) {
  let dispatched = false
  const doc = state.doc, selection = state.selection, depth = undoDepth(state)
  expect(gfmTableCommand(action)(state)).toBe(false)
  expect(gfmTableCommand(action)(state, () => { dispatched = true })).toBe(false)
  expect(dispatched).toBe(false)
  expect(state.doc).toBe(doc)
  expect(state.selection).toBe(selection)
  expect(undoDepth(state)).toBe(depth)
}
it('shared add-row and terminal next-cell inherit header alignment, select in the same transaction and preserve header identity', () => {
  for (const kind of ['add-row', 'next-cell'] as const) {
    const before = stateAt(), result = run(before, gfmTableCommand({ kind }))
    const table = result.state.doc.firstChild!
    expect(table.childCount).toBe(2)
    expect(table.firstChild).toBe(before.doc.firstChild!.firstChild)
    expectFreshRow(table.child(1))
    expect(result.state.selection.$from.index(1)).toBe(1)
    expect(result.state.selection.$from.index(2)).toBe(kind === 'add-row' ? 2 : 0)
    expect(TableMap.get(table).problems).toBeNull()
  }
})
it('ordinary cell navigation only changes selection, and the first previous-cell is rejected', () => {
  const before = stateAt(headerOnly, 0, 1)
  const next = run(before, gfmTableCommand({ kind: 'next-cell' }))
  expect(next.tr.doc).toBe(before.doc)
  expect(next.tr.steps).toHaveLength(0)
  expect(next.state.selection.$from.index(2)).toBe(2)
  const previous = run(next.state, gfmTableCommand({ kind: 'previous-cell' }))
  expect(previous.tr.doc).toBe(before.doc)
  expect(previous.state.selection.eq(before.selection)).toBe(true)
  reject(stateAt(headerOnly, 0, 0), { kind: 'previous-cell' })
})
it('align-column edits header and every body, preserves other columns and widths, and has a zero-step no-op dispatch', () => {
  let before = stateAt(headerOnly + '\n| D | E | F |\n| G | H | I |', 1, 2)
  const width = before.tr
  before.doc.descendants((node, pos) => { if (node.type.name === 'table_cell' || node.type.name === 'table_header') width.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: [180] }, node.marks) })
  before = before.apply(width)
  const result = run(before, gfmTableCommand({ kind: 'align-column', alignment: 'center' }))
  expect(result.tr.steps).toHaveLength(3)
  for (let row = 0; row < 3; row++) {
    const afterRow = result.state.doc.firstChild!.child(row), beforeRow = before.doc.firstChild!.child(row)
    expect(afterRow.child(2).attrs).toEqual({ ...beforeRow.child(2).attrs, alignment: 'center' })
    for (const column of [0, 1]) expect(afterRow.child(column).toJSON()).toEqual(beforeRow.child(column).toJSON())
  }
  const noop = run(result.state, gfmTableCommand({ kind: 'align-column', alignment: 'center' }))
  expect(noop.tr.steps).toHaveLength(0)
  expect(noop.tr.doc).toBe(result.state.doc)
  reject(before, { kind: 'align-column', alignment: 'invalid' } as unknown as GfmTableAction)
})
it('delete-row preserves body content/attrs/marks on header promotion and allows header-only result', () => {
  const raw = headerOnly + '\n| **D** | E | F |'
  const before = stateAt(raw, 0, 1)
  const body = before.doc.firstChild!.child(1)
  const promoted = run(before, gfmTableCommand({ kind: 'delete-row' })).state
  expect(promoted.doc.firstChild!.childCount).toBe(1)
  for (let col = 0; col < 3; col++) {
    const cell = promoted.doc.firstChild!.firstChild!.child(col)
    expect(cell.type.name).toBe('table_header')
    expect(cell.attrs).toEqual(body.child(col).attrs)
    expect(cell.content.eq(body.child(col).content)).toBe(true)
    expect(cell.marks).toEqual(body.child(col).marks)
  }
  const removedBody = run(stateAt(raw, 1, 1), gfmTableCommand({ kind: 'delete-row' })).state
  expect(removedBody.doc.eq(parseMarkdown(headerOnly))).toBe(true)
  reject(promoted, { kind: 'delete-row' })
})
it('add/delete column works on header-only and normal tables, preserves untouched cells and rejects the last column', () => {
  for (const raw of [headerOnly, headerOnly + '\n| D | E | F |']) {
    const before = stateAt(raw, 0, 1)
    const added = run(before, gfmTableCommand({ kind: 'add-column' })).state
    const table = added.doc.firstChild!
    expect(TableMap.get(table)).toMatchObject({ width: 4, problems: null })
    table.forEach((row, _offset, index) => {
      expect(row.child(2).attrs).toEqual({ alignment: 'left', colspan: 1, rowspan: 1, colwidth: null })
      expect(row.child(0)).toBe(before.doc.firstChild!.child(index).child(0))
      expect(row.child(3)).toBe(before.doc.firstChild!.child(index).child(2))
    })
    expect(added.selection.$from.index(2)).toBe(2)
    const removed = run(added, gfmTableCommand({ kind: 'delete-column' })).state
    expect(removed.doc.eq(before.doc)).toBe(true)
    expect(TableMap.get(removed.doc.firstChild!).problems).toBeNull()
  }
  reject(stateAt('| A |\n| --- |', 0, 0), { kind: 'delete-column' })
})
it('rejects missing schema nodes, non-tables, invalid alignment, merged and ragged tables without dispatch', () => {
  const missing = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} } })
  reject(EditorState.create({ schema: missing }), { kind: 'insert' })
  reject(EditorState.create({ doc: parseMarkdown('outside') }), { kind: 'add-row' })
  const actions: GfmTableAction[] = ['add-row', 'delete-row', 'add-column', 'delete-column', 'next-cell', 'previous-cell'].map(kind => ({ kind } as GfmTableAction))
  actions.push({ kind: 'align-column', alignment: 'center' })
  for (const shape of ['colspan', 'rowspan', 'ragged', 'alignment']) {
    const before = stateAt(headerOnly + '\n| D | E | F |', 1, 1)
    const tr = before.tr
    if (shape === 'ragged') {
      const table = before.doc.firstChild!, row = table.child(1)
      tr.replaceWith(table.firstChild!.nodeSize + 1, table.nodeSize - 1, row.type.create(row.attrs, [row.firstChild!]))
    } else {
      const pos = selectCell(before.doc, 0, 0).$from.before(3), cell = before.doc.nodeAt(pos)!
      tr.setNodeMarkup(pos, undefined, { ...cell.attrs, [shape]: shape === 'alignment' ? 'invalid' : 2 })
    }
    const malformed = before.apply(tr.setSelection(selectCell(tr.doc, 0, 0)))
    for (const action of actions) reject(malformed, action)
  }
})
it('actual Source accepts add-row/alignment with exact EOF raw and full doc equality, without clearing colwidth', () => {
  const captured = createSourceSession(headerOnly)
  if (!captured.ok) throw new Error(captured.reason)
  let state = EditorState.create({ doc: captured.session.doc })
  state = state.apply(state.tr.setSelection(selectCell(state.doc, 0, 2)))
  const added = run(state, gfmTableCommand({ kind: 'add-row' }))
  const applied = applySourceBlockTransaction(captured.session, added.tr)
  expect(applied.ok).toBe(true)
  if (!applied.ok) throw new Error(applied.reason)
  expect(applied.session.source).toBe(headerOnly + '\n|  |  |  |')
  expect(applied.session.doc.eq(added.tr.doc)).toBe(true)
  const aligned = run(added.state, gfmTableCommand({ kind: 'align-column', alignment: 'center' }))
  const final = applySourceBlockTransaction(applied.session, aligned.tr)
  expect(final.ok).toBe(true)
  if (!final.ok) throw new Error(final.reason)
  expect(final.session.source).toBe('| A | B | C |\n| --- | :---: | :---: |\n|  |  |  |')
  expect(final.session.doc.eq(aligned.tr.doc)).toBe(true)
  expect(serializeMarkdown(aligned.tr.doc)).toBe(final.session.source + '\n')
  const cellPos = selectCell(aligned.state.doc, 0, 2).$from.before(3)
  const widthTr = aligned.state.tr.setNodeMarkup(cellPos, undefined, { ...aligned.state.doc.nodeAt(cellPos)!.attrs, colwidth: [180] })
  expect(applySourceBlockTransaction(final.session, widthTr).ok).toBe(false)
})
it('Source preserves BOM/CRLF, original gaps and protected HTML/footnotes around a dirty table', () => {
  const prefix = '\uFEFFBefore\r\n\r\n\r\n', suffix = '\r\n\r\n<!-- untouched -->\r\n\r\n[^n]: note\r\n'
  const raw = prefix + headerOnly.replaceAll('\n', '\r\n') + suffix
  const captured = createSourceSession(raw)
  if (!captured.ok) throw new Error(captured.reason)
  let state = EditorState.create({ doc: captured.session.doc })
  state = state.apply(state.tr.setSelection(selectCell(state.doc, 0, 2)))
  const { tr } = run(state, gfmTableCommand({ kind: 'add-row' }))
  const applied = applySourceBlockTransaction(captured.session, tr)
  expect(applied.ok).toBe(true)
  if (!applied.ok) throw new Error(applied.reason)
  expect(Buffer.from(applied.session.source)).toEqual(Buffer.from(prefix + headerOnly + '\n|  |  |  |' + suffix))
  expect(applied.session.doc.eq(tr.doc)).toBe(true)
})
it('native PM history exactly restores table attrs, selection and canonical raw after add-row then alignment', () => {
  const before = stateAt(), added = run(before, gfmTableCommand({ kind: 'add-row' })).state
  const boundary = added.apply(closeHistory(added.tr))
  const aligned = run(boundary, gfmTableCommand({ kind: 'align-column', alignment: 'center' })).state
  const undoneAlign = run(aligned, undo).state
  expect(undoneAlign.doc.eq(added.doc)).toBe(true)
  expect(undoneAlign.selection.eq(added.selection)).toBe(true)
  const undoneRow = run(undoneAlign, undo).state
  expect(undoneRow.doc.eq(before.doc)).toBe(true)
  expect(undoneRow.selection.eq(before.selection)).toBe(true)
  expect(serializeMarkdown(undoneRow.doc)).toBe(serializeMarkdown(before.doc))
  const redone = run(run(undoneRow, redo).state, redo).state
  expect(redone.doc.eq(aligned.doc)).toBe(true)
  expect(redone.selection.eq(aligned.selection)).toBe(true)
})

it.each(['', '\n', '\r\n', '\r', '\n\n', '\r\n\r\n'])('structural table replacement preserves the original EOF terminator/tail %j', tail => {
  const raw = headerOnly.replaceAll('\n', tail.startsWith('\r') ? '\r\n' : '\n') + tail
  const capture = createSourceSession(raw)
  if (!capture.ok) throw new Error(capture.reason)
  let state = EditorState.create({ doc: capture.session.doc })
  state = state.apply(state.tr.setSelection(selectCell(state.doc, 0, 2)))
  const { tr } = run(state, gfmTableCommand({ kind: 'add-row' }))
  const applied = applySourceBlockTransaction(capture.session, tr)
  expect(applied.ok).toBe(true)
  if (!applied.ok) throw new Error(applied.reason)
  expect(applied.session.source).toBe(headerOnly + '\n|  |  |  |' + tail)
  expect(applied.session.doc.eq(tr.doc)).toBe(true)
})
it('a born table and a multi-node replacement retain their generated content EOL', () => {
  for (const raw of ['', headerOnly]) {
    const capture = createSourceSession(raw)
    if (!capture.ok) throw new Error(capture.reason)
    const state = EditorState.create({ doc: capture.session.doc })
    const tr = raw ? state.tr.replaceWith(0, state.doc.content.size, [state.schema.nodes.paragraph.create(null, state.schema.text('New')), state.doc.firstChild!])
      : run(state, gfmTableCommand({ kind: 'insert' })).tr
    const applied = applySourceBlockTransaction(capture.session, tr)
    expect(applied.ok).toBe(true)
    if (!applied.ok) throw new Error(applied.reason)
    expect(applied.session.source.endsWith('\n')).toBe(true)
    expect(applied.session.doc.eq(tr.doc)).toBe(true)
  }
})

import { createEnterHandlerPlugin } from '../plugins/enter-handler'
async function keyView(raw: string) {
  const schema = createSchema({ mediaResolver }), transactions: Transaction[] = []
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state: EditorState.create({ doc: parseMarkdown(raw, schema), plugins: await createEditorPlugins({ mediaResolver, enableTableResize: false }, schema) }),
    dispatchTransaction(tr) { transactions.push(tr); view.updateState(view.state.applyTransaction(tr).state) },
  })
  return { view, transactions, destroy() { view.destroy(); mount.remove() } }
}
it('actual Enter handler preserves Plain/Shift Enter and pipe-header contracts, and ignores composition', async () => {
  for (const tail of ['', '\n\nTail']) {
    const fixture = await keyView(headerOnly + tail)
    try {
      const { view, transactions } = fixture
      view.dispatch(view.state.tr.setSelection(selectCell(view.state.doc, 0, 2)))
      const before = view.state.doc
      transactions.length = 0
      expect(view.someProp('handleKeyDown', handler => handler(view, new KeyboardEvent('keydown', { key: 'Enter' })))).toBe(true)
      expect(transactions).toHaveLength(1)
      expect(view.state.doc.firstChild!.childCount).toBe(1)
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(view.state.selection.$from.parent.textContent).toBe(tail ? 'Tail' : '')
      if (tail) expect(view.state.doc).toBe(before)
      else {
        const capture = createSourceSession(headerOnly, view.state.schema)
        if (!capture.ok) throw new Error(capture.reason)
        const applied = applySourceBlockTransaction(capture.session, transactions[0]!)
        expect(applied.ok).toBe(true)
        if (!applied.ok) throw new Error(applied.reason)
        expect(applied.session.doc.eq(view.state.doc)).toBe(true)
      }
    } finally { fixture.destroy() }
  }
  const fixture = await keyView(headerOnly)
  try {
    const { view, transactions } = fixture
    view.dispatch(view.state.tr.setSelection(selectCell(view.state.doc, 0, 1)))
    transactions.length = 0
    const plugin = createEnterHandlerPlugin(), composing = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true })
    expect(plugin.props.handleKeyDown!.call(plugin, view, composing)).toBe(false)
    expect(transactions).toHaveLength(0)
    expect(view.someProp('handleKeyDown', handler => handler(view, new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })))).toBe(true)
    expect(transactions).toHaveLength(1)
    expect(view.state.doc.firstChild!.childCount).toBe(1)
    expect(view.state.doc.firstChild!.firstChild!.child(1).firstChild!.firstChild!.type.name).toBe('hardbreak')
  } finally { fixture.destroy() }
  const pipe = await keyView('| A | B |')
  try {
    const { view } = pipe
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
    expect(view.someProp('handleKeyDown', handler => handler(view, new KeyboardEvent('keydown', { key: 'Enter' })))).toBe(true)
    const table = view.state.doc.firstChild!
    expect(TableMap.get(table)).toMatchObject({ height: 2, width: 2, problems: null })
    expect(view.state.selection.$from.index(1)).toBe(1)
    expect(view.state.selection.$from.index(2)).toBe(0)
    table.forEach(row => row.forEach(cell => expect(cell.attrs).toEqual({ alignment: 'left', colspan: 1, rowspan: 1, colwidth: null })))
  } finally { pipe.destroy() }
})
it('actual setup Tab keeps middle navigation doc identity and refuses nested-first/merged table fallback', async () => {
  for (const scenario of ['middle', 'nested-first', 'merged']) {
    const raw = scenario === 'nested-first' ? '- Outer\n\n  ' + headerOnly.replaceAll('\n', '\n  ') : headerOnly
    const fixture = await keyView(raw)
    try {
      const { view, transactions } = fixture
      view.dispatch(view.state.tr.setSelection(selectCell(view.state.doc, 0, scenario === 'middle' ? 1 : 0)))
      if (scenario === 'merged') {
        const at = view.state.selection.$from.before(3), cell = view.state.doc.nodeAt(at)!
        view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...cell.attrs, colspan: 2 }))
      }
      const before = view.state
      transactions.length = 0
      const handled = view.someProp('handleKeyDown', handler => handler(view, new KeyboardEvent('keydown', { key: 'Tab', shiftKey: scenario === 'nested-first' })))
      expect(!!handled).toBe(scenario === 'middle')
      expect(view.state.doc).toBe(before.doc)
      expect(transactions).toHaveLength(scenario === 'middle' ? 1 : 0)
      if (scenario !== 'middle') expect(view.state).toBe(before)
    } finally { fixture.destroy() }
  }
})
it.each([
  [{ kind: 'delete-row' }, headerOnly + '\n| D | E | F |', 1, 2, headerOnly],
  [{ kind: 'delete-row' }, headerOnly + '\n| D | E | F |', 0, 2, '| D | E | F |\n| --- | :---: | ---: |'],
  [{ kind: 'add-column' }, headerOnly, 0, 2, '| A | B | C |  |\n| --- | :---: | ---: | --- |'],
  [{ kind: 'delete-column' }, headerOnly, 0, 2, '| A | B |\n| --- | :---: |'],
  [{ kind: 'align-column', alignment: 'center' }, headerOnly, 0, 2, '| A | B | C |\n| --- | :---: | :---: |'],
] as const)('actual Source %j preserves EOF absence through full structural output', (action, raw, row, col, expected) => {
  const capture = createSourceSession(raw)
  if (!capture.ok) throw new Error(capture.reason)
  let state = EditorState.create({ doc: capture.session.doc })
  state = state.apply(state.tr.setSelection(selectCell(state.doc, row, col)))
  const { tr } = run(state, gfmTableCommand(action))
  const applied = applySourceBlockTransaction(capture.session, tr)
  expect(applied.ok).toBe(true)
  if (!applied.ok) throw new Error(applied.reason)
  expect(applied.session.source).toBe(expected)
  expect(applied.session.doc.eq(tr.doc)).toBe(true)
})
