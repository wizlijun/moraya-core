// src/plugins/link-text-plugin.ts
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
var pluginKey = new PluginKey("moraya-link-text");
var LINK_PATTERN_DECO = /\[([^\]]*)\]\(([^)]*)\)/g;
var LINK_PATTERN_CONVERT = /\[([^\]]+)\]\(([^)]+)\)/g;
function findLinkPatterns(state, regex) {
  const matches = [];
  const linkType = state.schema.marks.link;
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (linkType && linkType.isInSet(node.marks)) return;
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(node.text)) !== null) {
      matches.push({
        from: pos + m.index,
        to: pos + m.index + m[0].length,
        text: m[1] ?? "",
        url: m[2] ?? ""
      });
    }
  });
  return matches;
}
function findLinkPatternsInBlock(state, pos, regex) {
  const matches = [];
  const linkType = state.schema.marks.link;
  let resolved;
  try {
    resolved = state.doc.resolve(pos);
  } catch {
    return matches;
  }
  const parent = resolved.parent;
  if (!parent.isTextblock) return matches;
  const base = resolved.start();
  let nodePos = base;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (child.isText && child.text && !(linkType && linkType.isInSet(child.marks))) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(child.text)) !== null) {
        matches.push({
          from: nodePos + m.index,
          to: nodePos + m.index + m[0].length,
          text: m[1] ?? "",
          url: m[2] ?? ""
        });
      }
    }
    nodePos += child.nodeSize;
  }
  return matches;
}
function buildDecorations(state) {
  const matches = findLinkPatterns(state, LINK_PATTERN_DECO);
  if (matches.length === 0) return DecorationSet.empty;
  const decorations = matches.map(
    (m) => Decoration.inline(m.from, m.to, { class: "link-text-syntax" })
  );
  return DecorationSet.create(state.doc, decorations);
}
function cursorInsidePattern(pos, matches) {
  return matches.some((m) => pos >= m.from && pos <= m.to);
}
function findLinkMarkAtPos(state, pos) {
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  let resolved;
  try {
    resolved = state.doc.resolve(pos);
  } catch {
    return null;
  }
  const parent = resolved.parent;
  if (!parent.isTextblock) return null;
  const base = resolved.start();
  let runFrom = -1;
  let runTo = -1;
  let href = "";
  const textParts = [];
  let nodePos = base;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childEnd = nodePos + child.nodeSize;
    const lm = linkType.isInSet(child.marks);
    if (lm) {
      if (runFrom === -1) {
        runFrom = nodePos;
        href = lm.attrs.href || "";
        textParts.length = 0;
      }
      textParts.push(child.text || "");
      runTo = childEnd;
    } else {
      if (runFrom !== -1 && pos >= runFrom && pos <= runTo) {
        return { from: runFrom, to: runTo, text: textParts.join(""), href };
      }
      runFrom = -1;
      runTo = -1;
      href = "";
      textParts.length = 0;
    }
    nodePos = childEnd;
  }
  if (runFrom !== -1 && pos >= runFrom && pos <= runTo) {
    return { from: runFrom, to: runTo, text: textParts.join(""), href };
  }
  return null;
}
function createLinkTextPlugin() {
  return new Plugin({
    key: pluginKey,
    state: {
      init(_, state) {
        return buildDecorations(state);
      },
      apply(tr, old, _, newState) {
        if (!tr.docChanged) return old;
        if (tr.getMeta("full-delete")) return DecorationSet.empty;
        return buildDecorations(newState);
      }
    },
    props: {
      decorations(state) {
        return this.getState(state);
      }
    },
    appendTransaction(transactions, oldState, newState) {
      if (transactions.some((tr2) => tr2.getMeta(pluginKey))) return null;
      if (transactions.some((tr2) => tr2.getMeta("full-delete"))) return null;
      const selChanged = transactions.some((tr2) => tr2.selectionSet);
      const docChanged = transactions.some((tr2) => tr2.docChanged);
      if (!selChanged && !docChanged) return null;
      const linkType = newState.schema.marks.link;
      if (!linkType) return null;
      if (!newState.selection.empty) return null;
      const newPos = newState.selection.from;
      const oldPos = oldState.selection.from;
      const linkInfo = findLinkMarkAtPos(newState, newPos);
      if (linkInfo) {
        const oldLinkInfo = findLinkMarkAtPos(oldState, oldPos);
        if (!oldLinkInfo) {
          const { from, to, text, href } = linkInfo;
          const literal = `[${text}](${href})`;
          const textNode = newState.schema.text(literal);
          const tr2 = newState.tr.replaceWith(from, to, textNode);
          tr2.setMeta(pluginKey, "expand");
          tr2.setMeta("addToHistory", false);
          const relPos = Math.max(0, Math.min(newPos - from, text.length));
          const cursorPos = from + 1 + relPos;
          try {
            tr2.setSelection(TextSelection.create(tr2.doc, cursorPos));
          } catch {
          }
          return tr2;
        }
        return null;
      }
      const oldBlockMatches = findLinkPatternsInBlock(oldState, oldPos, LINK_PATTERN_CONVERT);
      if (oldBlockMatches.length === 0) return null;
      const wasIn = oldBlockMatches.find((m) => oldPos >= m.from && oldPos <= m.to);
      if (!wasIn) return null;
      let target;
      if (docChanged) {
        let mappedFrom = wasIn.from;
        for (const t of transactions) {
          mappedFrom = t.mapping.map(mappedFrom);
        }
        if (mappedFrom < 0 || mappedFrom > newState.doc.content.size) return null;
        const newBlockMatches = findLinkPatternsInBlock(newState, mappedFrom, LINK_PATTERN_CONVERT);
        if (cursorInsidePattern(newPos, newBlockMatches)) return null;
        target = newBlockMatches.find((m) => Math.abs(m.from - mappedFrom) < 3);
      } else {
        const newBlockMatches = findLinkPatternsInBlock(newState, wasIn.from, LINK_PATTERN_CONVERT);
        if (cursorInsidePattern(newPos, newBlockMatches)) return null;
        target = newBlockMatches.find((m) => m.from === wasIn.from && m.to === wasIn.to);
      }
      if (!target || !target.text || !target.url) return null;
      const mark = linkType.create({ href: target.url });
      const linkNode = newState.schema.text(target.text, [mark]);
      const tr = newState.tr.replaceWith(target.from, target.to, linkNode);
      tr.setMeta(pluginKey, "collapse");
      tr.setMeta("addToHistory", false);
      return tr;
    }
  });
}
export {
  createLinkTextPlugin
};
//# sourceMappingURL=link-text-plugin.js.map