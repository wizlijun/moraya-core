// src/plugins/footnote-plugin.ts
import { Plugin, PluginKey } from "prosemirror-state";
var footnotePluginKey = new PluginKey("moraya-footnote");
function findDefinition(doc, label) {
  let hit = null;
  doc.descendants((node, pos) => {
    if (hit) return false;
    if (node.type.name === "footnote_definition" && node.attrs.label === label) {
      hit = { node, pos };
      return false;
    }
    return true;
  });
  return hit;
}
function findFirstRef(doc, label) {
  let hit = null;
  doc.descendants((node, pos) => {
    if (hit) return false;
    if (node.type.name === "footnote_ref" && node.attrs.label === label) {
      hit = { node, pos };
      return false;
    }
    return true;
  });
  return hit;
}
function definitionText(doc, label) {
  const hit = findDefinition(doc, label);
  if (!hit) return "";
  const parts = [];
  hit.node.forEach((child) => {
    parts.push(child.textContent);
  });
  return parts.join(" ").trim();
}
function scrollToAndFlash(view, pos) {
  const dom = view.nodeDOM(pos);
  const el = dom instanceof HTMLElement ? dom : dom?.parentElement;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("moraya-footnote-flash");
  view.dom.ownerDocument.defaultView?.setTimeout(() => {
    el.classList.remove("moraya-footnote-flash");
  }, 1200);
}
function createFootnotePlugin() {
  return new Plugin({
    key: footnotePluginKey,
    props: {
      handleDOMEvents: {
        mouseover(view, event) {
          const el = event.target;
          const refEl = el?.closest?.("[data-footnote-ref]");
          if (refEl instanceof HTMLElement) {
            const label = refEl.dataset.label ?? "";
            const text = definitionText(view.state.doc, label);
            refEl.title = text ? `[^${label}] ${text}` : `[^${label}] (\u672A\u5B9A\u4E49)`;
          }
          return false;
        },
        mousedown(view, event) {
          const el = event.target;
          const refEl = el?.closest?.("[data-footnote-ref]");
          const defEl = el?.closest?.("[data-footnote-def]");
          if (refEl instanceof HTMLElement) {
            const hit = findDefinition(view.state.doc, refEl.dataset.label ?? "");
            if (!hit) return false;
            event.preventDefault();
            scrollToAndFlash(view, hit.pos);
            return true;
          }
          if (defEl instanceof HTMLElement && el === defEl) {
            const hit = findFirstRef(view.state.doc, defEl.dataset.label ?? "");
            if (!hit) return false;
            event.preventDefault();
            scrollToAndFlash(view, hit.pos);
            return true;
          }
          return false;
        }
      }
    }
  });
}
export {
  createFootnotePlugin,
  definitionText,
  findDefinition,
  findFirstRef,
  footnotePluginKey
};
//# sourceMappingURL=footnote-plugin.js.map