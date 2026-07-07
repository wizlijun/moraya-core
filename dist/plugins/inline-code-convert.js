// src/plugins/inline-code-convert.ts
import { Plugin, PluginKey } from "prosemirror-state";
var pluginKey = new PluginKey("moraya-inline-code-convert");
var ZWSP = "\u200B";
var ZWSP_MARK_NAMES = ["code", "strong", "em", "strike_through"];
function hasZwspTargetMark(marks, state) {
  return ZWSP_MARK_NAMES.some((name) => {
    const mt = state.schema.marks[name];
    return mt && mt.isInSet(marks);
  });
}
var CODE_PATTERN = /`([^`]+)`/g;
function findCodePatternsInBlock(state, pos) {
  const matches = [];
  const codeType = state.schema.marks.code;
  let resolved;
  try {
    resolved = state.doc.resolve(pos);
  } catch {
    return matches;
  }
  const parent = resolved.parent;
  if (!parent.isTextblock) return matches;
  if (parent.type.spec.code) return matches;
  const base = resolved.start();
  let nodePos = base;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (child.isText && child.text && !(codeType && codeType.isInSet(child.marks))) {
      CODE_PATTERN.lastIndex = 0;
      let m;
      while ((m = CODE_PATTERN.exec(child.text)) !== null) {
        matches.push({
          from: nodePos + m.index,
          to: nodePos + m.index + m[0].length,
          content: m[1] ?? ""
        });
      }
    }
    nodePos += child.nodeSize;
  }
  return matches;
}
function needsCursorTarget(state) {
  const { $head } = state.selection;
  if (!$head) return -1;
  const parent = $head.parent;
  if (!parent.isTextblock || parent.type.spec.code || parent.childCount === 0) return -1;
  const lastChild = parent.lastChild;
  if (!lastChild?.isText) return -1;
  if (!hasZwspTargetMark(lastChild.marks, state) && lastChild.text?.endsWith(ZWSP)) return -1;
  for (let i = parent.childCount - 1; i >= 0; i--) {
    const child = parent.child(i);
    if (child.isText && !hasZwspTargetMark(child.marks, state) && child.text === ZWSP) continue;
    if (child.isText && hasZwspTargetMark(child.marks, state)) {
      return $head.start() + parent.content.size;
    }
    break;
  }
  return -1;
}
function createInlineCodeConvertPlugin(enableBacktickCollapse = true) {
  return new Plugin({
    key: pluginKey,
    appendTransaction(transactions, oldState, newState) {
      if (transactions.some((tr) => tr.getMeta(pluginKey))) return null;
      if (transactions.some((tr) => tr.getMeta("full-delete"))) return null;
      const selChanged = transactions.some((tr) => tr.selectionSet);
      const docChanged = transactions.some((tr) => tr.docChanged);
      if (!selChanged && !docChanged) return null;
      if (!newState.selection.empty) return null;
      const newPos = newState.selection.from;
      const oldPos = oldState.selection.from;
      const codeType = newState.schema.marks.code;
      const oldMatches = enableBacktickCollapse ? findCodePatternsInBlock(oldState, oldPos) : [];
      const wasIn = oldMatches.find((m) => oldPos > m.from && oldPos < m.to);
      if (wasIn && codeType) {
        let mappedFrom = wasIn.from;
        if (docChanged) {
          for (const t of transactions) {
            mappedFrom = t.mapping.map(mappedFrom);
          }
          if (mappedFrom < 0 || mappedFrom > newState.doc.content.size) return null;
        }
        const newMatches = findCodePatternsInBlock(newState, mappedFrom);
        const isStillIn = newMatches.find((m) => newPos > m.from && newPos < m.to);
        if (!isStillIn) {
          const target = newMatches.find(
            (m) => Math.abs(m.from - mappedFrom) < 3
          );
          if (target?.content) {
            const codeNode = newState.schema.text(target.content, [codeType.create()]);
            const tr = newState.tr.replaceWith(target.from, target.to, codeNode);
            tr.setMeta(pluginKey, "collapse");
            tr.setMeta("addToHistory", false);
            return tr;
          }
        }
      }
      const insertPos = needsCursorTarget(newState);
      if (insertPos >= 0) {
        const tr = newState.tr.insertText(ZWSP, insertPos);
        tr.setMeta(pluginKey, "cursor-target");
        tr.setMeta("addToHistory", false);
        if (newState.selection.from === insertPos) {
          const { $head: $h } = newState.selection;
          if ($h?.nodeBefore) {
            const hasInclusive = ZWSP_MARK_NAMES.filter((n) => n !== "code").some((name) => {
              const mt = newState.schema.marks[name];
              return mt && $h.nodeBefore.marks.some((m) => m.type === mt);
            });
            if (hasInclusive) {
              const filtered = $h.marks().filter(
                (m) => !ZWSP_MARK_NAMES.filter((n) => n !== "code").some((name) => {
                  const mt = newState.schema.marks[name];
                  return mt && m.type === mt;
                })
              );
              tr.setStoredMarks(filtered);
            }
          }
        }
        return tr;
      }
      if (transactions.some((tr) => tr.getMeta("code-escape"))) return null;
      const { $head } = newState.selection;
      if ($head && newState.selection.empty && codeType) {
        const nodeBefore = $head.nodeBefore;
        const nodeAfter = $head.nodeAfter;
        if (nodeBefore?.marks.some((m) => m.type === codeType) && nodeAfter?.isText && !codeType.isInSet(nodeAfter.marks) && nodeAfter.text?.startsWith(ZWSP)) {
          const stored = newState.storedMarks;
          if (stored && stored.some((m) => m.type === codeType)) return null;
          const marks = [...$head.marks(), codeType.create()];
          const tr = newState.tr.setStoredMarks(marks);
          tr.setMeta(pluginKey, "boundary-marks");
          tr.setMeta("addToHistory", false);
          return tr;
        }
        const inclusiveMarkNames = ZWSP_MARK_NAMES.filter((n) => n !== "code");
        const hasInclusiveBefore = nodeBefore != null && inclusiveMarkNames.some((name) => {
          const mt = newState.schema.marks[name];
          return mt && nodeBefore.marks.some((m) => m.type === mt);
        });
        if (hasInclusiveBefore && nodeAfter?.isText && nodeAfter.text?.startsWith(ZWSP)) {
          const stored = newState.storedMarks;
          const storedHasInclusive = stored?.some(
            (m) => inclusiveMarkNames.some((name) => {
              const mt = newState.schema.marks[name];
              return mt && m.type === mt;
            })
          );
          if (stored !== null && !storedHasInclusive) return null;
          const filtered = $head.marks().filter(
            (m) => !inclusiveMarkNames.some((name) => {
              const mt = newState.schema.marks[name];
              return mt && m.type === mt;
            })
          );
          const tr = newState.tr.setStoredMarks(filtered);
          tr.setMeta(pluginKey, "boundary-marks-inclusive");
          tr.setMeta("addToHistory", false);
          return tr;
        }
      }
      return null;
    }
  });
}
export {
  ZWSP,
  createInlineCodeConvertPlugin
};
//# sourceMappingURL=inline-code-convert.js.map