// src/plugins/enter-handler.ts
import { Plugin, PluginKey, TextSelection as TextSelection2 } from "prosemirror-state";
import {
  splitBlock,
  chainCommands,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock
} from "prosemirror-commands";

// src/table-commands.ts
import { TextSelection } from "prosemirror-state";
function children(node) {
  const result = [];
  node.forEach((child) => result.push(child));
  return result;
}
function validAlignment(value) {
  return value === "left" || value === "center" || value === "right";
}
function tableContext(state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const table = $from.node(depth);
    if (table.type !== state.schema.nodes.table) continue;
    if ($from.depth < depth + 2) return null;
    const columns = table.firstChild?.childCount ?? 0;
    if (!columns) return null;
    for (let row = 0; row < table.childCount; row++) {
      const node = table.child(row);
      if (node.type !== state.schema.nodes[row === 0 ? "table_header_row" : "table_row"] || node.childCount !== columns) return null;
      for (let col = 0; col < columns; col++) {
        const cell = node.child(col);
        if (cell.type !== state.schema.nodes[row === 0 ? "table_header" : "table_cell"] || cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1 || !validAlignment(cell.attrs.alignment)) return null;
      }
    }
    return { table, pos: $from.before(depth), row: $from.index(depth), column: $from.index(depth + 1) };
  }
  return null;
}
function gfmTableCommand(action) {
  return (state, dispatch) => {
    const { table, table_header_row, table_row, table_header, table_cell, paragraph } = state.schema.nodes;
    if (!table || !table_header_row || !table_row || !table_header || !table_cell || !paragraph) return false;
    const freshCell = (header, alignment) => (header ? table_header : table_cell).createAndFill({ alignment, colspan: 1, rowspan: 1, colwidth: null });
    if (action.kind === "insert") {
      if (!dispatch) return true;
      const tableNode = table.create(null, [
        table_header_row.create(null, Array.from({ length: 3 }, () => freshCell(true, "left"))),
        ...Array.from({ length: 2 }, () => table_row.create(null, Array.from({ length: 3 }, () => freshCell(false, "left"))))
      ]);
      const tr2 = state.tr.replaceSelectionWith(tableNode);
      tr2.doc.descendants((node, pos) => {
        if (node === tableNode) {
          tr2.setSelection(TextSelection.near(tr2.doc.resolve(pos + 3)));
          return false;
        }
        return true;
      });
      dispatch(tr2.scrollIntoView());
      return true;
    }
    const context = tableContext(state);
    if (!context) return false;
    const rows = children(context.table);
    let row = context.row, column = context.column;
    if (action.kind === "align-column") {
      if (!validAlignment(action.alignment)) return false;
      if (!dispatch) return true;
      const tr2 = state.tr;
      let rowPos = context.pos + 1;
      for (const current of rows) {
        let cellPos = rowPos + 1;
        for (let col = 0; col < column; col++) cellPos += current.child(col).nodeSize;
        const cell = current.child(column);
        if (cell.attrs.alignment !== action.alignment) tr2.setNodeMarkup(cellPos, void 0, { ...cell.attrs, alignment: action.alignment }, cell.marks);
        rowPos += current.nodeSize;
      }
      dispatch(tr2);
      return true;
    }
    const freshRow = () => table_row.create(null, children(rows[0]).map((cell) => freshCell(false, cell.attrs.alignment)));
    if (action.kind === "add-row") {
      rows.splice(row + 1, 0, freshRow());
      row++;
    } else if (action.kind === "delete-row") {
      if (rows.length <= 1) return false;
      rows.splice(row, 1);
      if (row === 0) rows[0] = table_header_row.create(
        rows[0].attrs,
        children(rows[0]).map((cell) => table_header.create(cell.attrs, cell.content, cell.marks)),
        rows[0].marks
      );
      row = Math.min(row, rows.length - 1);
    } else if (action.kind === "add-column" || action.kind === "delete-column") {
      if (action.kind === "delete-column" && rows[0].childCount <= 1) return false;
      for (let index = 0; index < rows.length; index++) {
        const cells = children(rows[index]);
        if (action.kind === "add-column") cells.splice(column + 1, 0, freshCell(index === 0, "left"));
        else cells.splice(column, 1);
        rows[index] = rows[index].type.create(rows[index].attrs, cells, rows[index].marks);
      }
      column = action.kind === "add-column" ? column + 1 : Math.min(column, rows[0].childCount - 1);
    } else if (action.kind === "next-cell" || action.kind === "previous-cell") {
      column += action.kind === "next-cell" ? 1 : -1;
      if (column < 0) {
        row--;
        column = row >= 0 ? rows[row].childCount - 1 : 0;
      }
      if (row >= 0 && column >= rows[row].childCount) {
        row++;
        column = 0;
      }
      if (row < 0) return false;
      if (row >= rows.length) rows.push(freshRow());
    } else return false;
    if (!dispatch) return true;
    const replacement = table.create(context.table.attrs, rows, context.table.marks);
    const tr = state.tr;
    if (!replacement.eq(context.table)) tr.replaceWith(context.pos, context.pos + context.table.nodeSize, replacement);
    let position = context.pos + 1;
    for (let index = 0; index < row; index++) position += rows[index].nodeSize;
    position += 1;
    for (let index = 0; index < column; index++) position += rows[row].child(index).nodeSize;
    tr.setSelection(TextSelection.near(tr.doc.resolve(position + 1))).scrollIntoView();
    dispatch(tr);
    return true;
  };
}

// src/plugins/enter-handler.ts
var enterHandlerKey = new PluginKey("moraya-enter-handler");
function parsePipeTableHeader(text) {
  if (!/^\|(.+\|)+\s*$/.test(text)) return null;
  const cells = text.split("|").slice(1, -1).map((s) => s.trim());
  if (cells.length < 2) return null;
  if (cells.every((c) => /^:?-+:?$/.test(c))) return null;
  return cells;
}
function buildTableFromHeaders(schema, headers) {
  const tableType = schema.nodes.table;
  const headerRowType = schema.nodes.table_header_row;
  const dataRowType = schema.nodes.table_row;
  const headerCellType = schema.nodes.table_header;
  const dataCellType = schema.nodes.table_cell;
  const paragraphType = schema.nodes.paragraph;
  if (!tableType || !headerRowType || !dataRowType || !headerCellType || !dataCellType || !paragraphType) {
    return null;
  }
  const headerCells = headers.map((text) => {
    const para = text ? paragraphType.create(null, schema.text(text)) : paragraphType.create();
    return headerCellType.create({ alignment: "left" }, para);
  });
  const emptyCells = headers.map(
    () => dataCellType.createAndFill({ alignment: "left" })
  );
  const headerRow = headerRowType.create(null, headerCells);
  const dataRow = dataRowType.create(null, emptyCells);
  return tableType.create(null, [headerRow, dataRow]);
}
function createEnterHandlerPlugin() {
  const enterCommand = chainCommands(
    newlineInCode,
    createParagraphNear,
    liftEmptyBlock,
    splitBlock
  );
  return new Plugin({
    key: enterHandlerKey,
    props: {
      handleKeyDown(view, event) {
        if (event.isComposing || event.key !== "Enter") return false;
        const { $from } = view.state.selection;
        let inTable = false;
        let cellDepth = -1;
        let inListItem = false;
        for (let d = $from.depth; d > 0; d--) {
          const nodeName = $from.node(d).type.name;
          if (nodeName === "table_cell" || nodeName === "table_header") {
            inTable = true;
            cellDepth = d;
            break;
          }
          if (nodeName === "list_item") {
            inListItem = true;
            break;
          }
        }
        if (inTable) {
          if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
            const handled = gfmTableCommand({ kind: "add-row" })(view.state, view.dispatch);
            if (handled) event.preventDefault();
            return handled;
          }
          if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            const hardbreak = view.state.schema.nodes.hardbreak;
            if (hardbreak) {
              const tr = view.state.tr.replaceSelectionWith(hardbreak.create({ isInline: false }));
              view.dispatch(tr.scrollIntoView());
            }
            return true;
          }
          if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            if (cellDepth < 2) return true;
            const rowDepth = cellDepth - 1;
            const tableDepth = cellDepth - 2;
            const colIndex = $from.index(rowDepth);
            const rowIndex = $from.index(tableDepth);
            const tableNode = $from.node(tableDepth);
            const tableStart = $from.start(tableDepth);
            if (rowIndex === tableNode.childCount - 1) {
              const tableEnd = $from.after(tableDepth);
              const afterNode = view.state.doc.nodeAt(tableEnd);
              if (afterNode) {
                const $target = view.state.doc.resolve(tableEnd + 1);
                view.dispatch(view.state.tr.setSelection(TextSelection2.near($target)).scrollIntoView());
              } else {
                const paragraph = view.state.schema.nodes.paragraph;
                if (paragraph) {
                  const tr = view.state.tr.insert(tableEnd, paragraph.create());
                  const $target = tr.doc.resolve(tableEnd + 1);
                  tr.setSelection(TextSelection2.near($target));
                  view.dispatch(tr.scrollIntoView());
                }
              }
            } else {
              const nextRow = tableNode.child(rowIndex + 1);
              const safeCol = Math.min(colIndex, nextRow.childCount - 1);
              let targetPos = tableStart;
              for (let r = 0; r <= rowIndex; r++) {
                targetPos += tableNode.child(r).nodeSize;
              }
              targetPos += 1;
              for (let c = 0; c < safeCol; c++) {
                targetPos += nextRow.child(c).nodeSize;
              }
              targetPos += 1;
              const $target = view.state.doc.resolve(targetPos);
              view.dispatch(view.state.tr.setSelection(TextSelection2.near($target)).scrollIntoView());
            }
            return true;
          }
          return false;
        }
        if (inListItem) return false;
        if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
          if ($from.parent.type.name === "paragraph") {
            const text = $from.parent.textContent;
            const match = $from.parentOffset === text.length ? text.match(/^```(\S*)\s*$/) : null;
            if (match) {
              const language = match[1] ?? "";
              const codeBlockType = view.state.schema.nodes.code_block;
              if (codeBlockType) {
                const pos = $from.before();
                const end = $from.after();
                const tr = view.state.tr;
                tr.replaceWith(pos, end, codeBlockType.create({ language }));
                view.dispatch(tr);
                return true;
              }
            }
            const headers = $from.parentOffset === text.length ? parsePipeTableHeader(text) : null;
            if (headers) {
              const $para = view.state.doc.resolve($from.before());
              const parentNode = $para.node($para.depth);
              const tableType = view.state.schema.nodes.table;
              if (tableType && parentNode.type.contentMatch.matchType(tableType)) {
                const tableNode = buildTableFromHeaders(view.state.schema, headers);
                if (tableNode) {
                  const pos = $from.before();
                  const end = $from.after();
                  const tr = view.state.tr;
                  tr.replaceWith(pos, end, tableNode);
                  const inserted = tr.doc.nodeAt(pos);
                  if (inserted && inserted.childCount >= 2) {
                    const headerRowSize = inserted.child(0).nodeSize;
                    const $dataRow = tr.doc.resolve(pos + 1 + headerRowSize + 1);
                    tr.setSelection(TextSelection2.near($dataRow));
                  }
                  tr.scrollIntoView();
                  view.dispatch(tr);
                  return true;
                }
              }
            }
          }
          return enterCommand(view.state, view.dispatch, view);
        }
        return false;
      }
    }
  });
}
export {
  createEnterHandlerPlugin
};
//# sourceMappingURL=enter-handler.js.map