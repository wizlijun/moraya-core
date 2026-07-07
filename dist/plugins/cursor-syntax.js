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
function getMarkRuns(state, pos, markType) {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return [];
  const base = $pos.start();
  const runs = [];
  let runFrom = -1;
  let runMark = null;
  let nodePos = base;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childEnd = nodePos + child.nodeSize;
    const mark = markType.isInSet(child.marks) ? child.marks.find((m) => m.type === markType) : null;
    if (mark) {
      if (runFrom === -1) {
        runFrom = nodePos;
        runMark = mark;
      }
    } else {
      if (runFrom !== -1) {
        runs.push({ from: runFrom, to: nodePos, mark: runMark });
        runFrom = -1;
        runMark = null;
      }
    }
    nodePos = childEnd;
  }
  if (runFrom !== -1) runs.push({ from: runFrom, to: nodePos, mark: runMark });
  return runs;
}
function buildDecorations(state, inlineScope) {
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
    const runs = getMarkRuns(state, pos, markType);
    const targets = inlineScope === "line" ? runs : runs.filter((r) => pos >= r.from && pos < r.to);
    for (const range of targets) {
      let openStr = delim.open;
      let closeStr = delim.close;
      if (markName === "highlight" && range.mark.attrs?.delimiter === "equals") {
        openStr = "==";
        closeStr = "==";
      }
      decorations.push(
        Decoration.widget(range.from, makeWidget(openStr, "syntax-md-mark"), {
          side: -1,
          key: `${markName}-open-${range.from}`
        }),
        Decoration.widget(range.to, makeWidget(closeStr, "syntax-md-mark"), {
          side: 1,
          key: `${markName}-close-${range.to}`
        })
      );
    }
  }
  return DecorationSet.create(state.doc, decorations);
}
function createCursorSyntaxPlugin(inlineScope = "cursor") {
  return new Plugin({
    key: pluginKey,
    state: {
      init(_, state) {
        return buildDecorations(state, inlineScope);
      },
      apply(tr, old, _, newState) {
        if (!tr.selectionSet && !tr.docChanged) return old;
        return buildDecorations(newState, inlineScope);
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