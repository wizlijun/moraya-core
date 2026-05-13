// src/plugins/enter-handler.ts
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import {
  splitBlock,
  chainCommands,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock
} from "prosemirror-commands";
import { addRowAfter } from "prosemirror-tables";
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
            event.preventDefault();
            addRowAfter(view.state, view.dispatch);
            const { $from: $cur } = view.state.selection;
            for (let d = $cur.depth; d > 0; d--) {
              const name = $cur.node(d).type.name;
              if (name === "table_row" || name === "table_header_row") {
                try {
                  const rowEnd = $cur.after(d);
                  const $newRow = view.state.doc.resolve(rowEnd + 1);
                  view.dispatch(
                    view.state.tr.setSelection(TextSelection.near($newRow)).scrollIntoView()
                  );
                } catch {
                }
                break;
              }
            }
            return true;
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
                view.dispatch(view.state.tr.setSelection(TextSelection.near($target)).scrollIntoView());
              } else {
                const paragraph = view.state.schema.nodes.paragraph;
                if (paragraph) {
                  const tr = view.state.tr.insert(tableEnd, paragraph.create());
                  const $target = tr.doc.resolve(tableEnd + 1);
                  tr.setSelection(TextSelection.near($target));
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
              view.dispatch(view.state.tr.setSelection(TextSelection.near($target)).scrollIntoView());
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
                    tr.setSelection(TextSelection.near($dataRow));
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