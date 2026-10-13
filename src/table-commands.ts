import type { Node as PmNode } from 'prosemirror-model'
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'

export type GfmTableAction =
  | { kind: 'insert' }
  | { kind: 'add-row' | 'delete-row' | 'add-column' | 'delete-column' | 'next-cell' | 'previous-cell' }
  | { kind: 'align-column'; alignment: 'left' | 'center' | 'right' }

function children(node: PmNode): PmNode[] {
  const result: PmNode[] = []
  node.forEach(child => result.push(child))
  return result
}

function validAlignment(value: unknown): value is 'left' | 'center' | 'right' {
  return value === 'left' || value === 'center' || value === 'right'
}

function tableContext(state: EditorState) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const table = $from.node(depth)
    if (table.type !== state.schema.nodes.table) continue
    if ($from.depth < depth + 2) return null
    const columns = table.firstChild?.childCount ?? 0
    if (!columns) return null
    for (let row = 0; row < table.childCount; row++) {
      const node = table.child(row)
      if (node.type !== state.schema.nodes[row === 0 ? 'table_header_row' : 'table_row'] || node.childCount !== columns) return null
      for (let col = 0; col < columns; col++) {
        const cell = node.child(col)
        if (cell.type !== state.schema.nodes[row === 0 ? 'table_header' : 'table_cell']
          || cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1 || !validAlignment(cell.attrs.alignment)) return null
      }
    }
    return { table, pos: $from.before(depth), row: $from.index(depth), column: $from.index(depth + 1) }
  }
  return null
}

/** Commands for rectangular GFM tables, using only the current editor's schema. */
export function gfmTableCommand(action: GfmTableAction): Command {
  return (state, dispatch) => {
    const { table, table_header_row, table_row, table_header, table_cell, paragraph } = state.schema.nodes
    if (!table || !table_header_row || !table_row || !table_header || !table_cell || !paragraph) return false
    const send = (tr: Transaction, tablePos: number, column: number) =>
      dispatch!(tr.setMeta('moraya:gfm-table-operation', { v: 1, kind: action.kind, tablePos, column }))
    const freshCell = (header: boolean, alignment: 'left' | 'center' | 'right') =>
      (header ? table_header : table_cell).createAndFill({ alignment, colspan: 1, rowspan: 1, colwidth: null })!
    if (action.kind === 'insert') {
      if (!dispatch) return true
      const tableNode = table.create(null, [
        table_header_row.create(null, Array.from({ length: 3 }, () => freshCell(true, 'left'))),
        ...Array.from({ length: 2 }, () => table_row.create(null, Array.from({ length: 3 }, () => freshCell(false, 'left')))),
      ])
      const tr = state.tr.replaceSelectionWith(tableNode)
      let tablePos = 0
      tr.doc.descendants((node, pos) => {
        if (node === tableNode) { tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 3))); tablePos = pos; return false }
        return true
      })
      send(tr.scrollIntoView(), tablePos, 0)
      return true
    }
    const context = tableContext(state)
    if (!context) return false
    const rows = children(context.table)
    let row = context.row, column = context.column
    if (action.kind === 'align-column') {
      if (!validAlignment(action.alignment)) return false
      if (!dispatch) return true
      const tr = state.tr
      let rowPos = context.pos + 1
      for (const current of rows) {
        let cellPos = rowPos + 1
        for (let col = 0; col < column; col++) cellPos += current.child(col).nodeSize
        const cell = current.child(column)
        if (cell.attrs.alignment !== action.alignment) tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, alignment: action.alignment }, cell.marks)
        rowPos += current.nodeSize
      }
      // Keep probe/execute consistent even when the column already has this alignment.
      send(tr, context.pos, context.column)
      return true
    }
    const freshRow = () => table_row.create(null, children(rows[0]!).map(cell => freshCell(false, cell.attrs.alignment)))
    if (action.kind === 'add-row') {
      rows.splice(row + 1, 0, freshRow())
      row++
    } else if (action.kind === 'delete-row') {
      if (rows.length <= 1) return false
      rows.splice(row, 1)
      if (row === 0) rows[0] = table_header_row.create(rows[0]!.attrs,
        children(rows[0]!).map(cell => table_header.create(cell.attrs, cell.content, cell.marks)), rows[0]!.marks)
      row = Math.min(row, rows.length - 1)
    } else if (action.kind === 'add-column' || action.kind === 'delete-column') {
      if (action.kind === 'delete-column' && rows[0]!.childCount <= 1) return false
      for (let index = 0; index < rows.length; index++) {
        const cells = children(rows[index]!)
        if (action.kind === 'add-column') cells.splice(column + 1, 0, freshCell(index === 0, 'left'))
        else cells.splice(column, 1)
        rows[index] = rows[index]!.type.create(rows[index]!.attrs, cells, rows[index]!.marks)
      }
      column = action.kind === 'add-column' ? column + 1 : Math.min(column, rows[0]!.childCount - 1)
    } else if (action.kind === 'next-cell' || action.kind === 'previous-cell') {
      column += action.kind === 'next-cell' ? 1 : -1
      if (column < 0) { row--; column = row >= 0 ? rows[row]!.childCount - 1 : 0 }
      if (row >= 0 && column >= rows[row]!.childCount) { row++; column = 0 }
      if (row < 0) return false
      if (row >= rows.length) rows.push(freshRow())
    } else return false
    if (!dispatch) return true
    const replacement = table.create(context.table.attrs, rows, context.table.marks)
    const tr = state.tr
    if (!replacement.eq(context.table)) tr.replaceWith(context.pos, context.pos + context.table.nodeSize, replacement)
    let position = context.pos + 1
    for (let index = 0; index < row; index++) position += rows[index]!.nodeSize
    position += 1
    for (let index = 0; index < column; index++) position += rows[row]!.child(index).nodeSize
    tr.setSelection(TextSelection.near(tr.doc.resolve(position + 1))).scrollIntoView()
    send(tr, context.pos, context.column)
    return true
  }
}
