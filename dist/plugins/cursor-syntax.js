// src/plugins/cursor-syntax.ts
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
var pluginKey = new PluginKey("moraya-cursor-syntax");
var HEADING_PREFIX = {
  1: "# ",
  2: "## ",
  3: "### ",
  4: "#### ",
  5: "##### ",
  6: "###### "
};
var MARK_DELIMITERS = {
  strong: { open: "**", close: "**" },
  em: { open: "*", close: "*" },
  code: { open: "`", close: "`" },
  strike_through: { open: "~~", close: "~~" },
  highlight: { open: "^^", close: "^^" }
};
function makeWidget(text, className) {
  return () => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  };
}
function getMarkRange(state, pos, markType) {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const base = $pos.start();
  const runs = [];
  let runFrom = -1;
  let nodePos = base;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childEnd = nodePos + child.nodeSize;
    if (markType.isInSet(child.marks)) {
      if (runFrom === -1) runFrom = nodePos;
    } else {
      if (runFrom !== -1) {
        runs.push({ from: runFrom, to: nodePos });
        runFrom = -1;
      }
    }
    nodePos = childEnd;
  }
  if (runFrom !== -1) runs.push({ from: runFrom, to: nodePos });
  return runs.find((r) => pos >= r.from && pos < r.to) ?? null;
}
function buildDecorations(state) {
  const { selection } = state;
  if (!selection.empty) return DecorationSet.empty;
  const $from = selection.$from;
  const decorations = [];
  const pos = $from.pos;
  const depth = $from.depth;
  const parent = $from.parent;
  if (parent.type === state.schema.nodes.heading) {
    const level = parent.attrs.level;
    const prefix = HEADING_PREFIX[level] ?? "# ";
    const contentStart = $from.start(depth);
    decorations.push(
      Decoration.widget(contentStart, makeWidget(prefix, "syntax-md-prefix"), {
        side: -1,
        key: "heading-prefix"
      })
    );
  }
  for (let d = depth - 1; d >= 1; d--) {
    if ($from.node(d).type === state.schema.nodes.blockquote) {
      const contentStart = $from.start(depth);
      decorations.push(
        Decoration.widget(contentStart, makeWidget("> ", "syntax-md-prefix"), {
          side: -1,
          key: "bq-prefix"
        })
      );
      break;
    }
  }
  for (const [markName, delim] of Object.entries(MARK_DELIMITERS)) {
    const markType = state.schema.marks[markName];
    if (!markType) continue;
    const range = getMarkRange(state, pos, markType);
    if (!range) continue;
    decorations.push(
      Decoration.widget(range.from, makeWidget(delim.open, "syntax-md-mark"), {
        side: -1,
        key: `${markName}-open`
      }),
      Decoration.widget(range.to, makeWidget(delim.close, "syntax-md-mark"), {
        side: 1,
        key: `${markName}-close`
      })
    );
  }
  return DecorationSet.create(state.doc, decorations);
}
function createCursorSyntaxPlugin() {
  return new Plugin({
    key: pluginKey,
    state: {
      init(_, state) {
        return buildDecorations(state);
      },
      apply(tr, old, _, newState) {
        if (!tr.selectionSet && !tr.docChanged) return old;
        return buildDecorations(newState);
      }
    },
    props: {
      decorations(state) {
        return this.getState(state);
      }
    }
  });
}
export {
  createCursorSyntaxPlugin
};
//# sourceMappingURL=cursor-syntax.js.map