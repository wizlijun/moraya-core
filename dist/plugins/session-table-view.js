// src/plugins/session-table-view.ts
import { TableView } from "prosemirror-tables";
function createSessionTableView(options) {
  return (node, _view, getPos) => {
    const tableView = new TableView(node, 25);
    const paint = (widths) => {
      let total = 0, complete = true;
      Array.from(tableView.colgroup.children).forEach((element, index) => {
        const width = widths?.[index] ?? null;
        element.style.width = width === null ? "" : `${width}px`;
        total += width ?? 25;
        complete &&= width !== null;
      });
      tableView.table.style.width = complete ? `${total}px` : "";
      tableView.table.style.minWidth = complete ? "" : `${total}px`;
    };
    const read = () => paint(options.readWidths(getPos(), tableView.node));
    const unregister = options.register({ getPos, paint });
    read();
    return {
      dom: tableView.dom,
      contentDOM: tableView.contentDOM,
      update(next) {
        if (!tableView.update(next)) return false;
        read();
        return true;
      },
      ignoreMutation: (record) => tableView.ignoreMutation(record),
      destroy: unregister
    };
  };
}
export {
  createSessionTableView
};
//# sourceMappingURL=session-table-view.js.map