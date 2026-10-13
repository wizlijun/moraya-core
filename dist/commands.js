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
    const table2 = $from.node(depth);
    if (table2.type !== state.schema.nodes.table) continue;
    if ($from.depth < depth + 2) return null;
    const columns = table2.firstChild?.childCount ?? 0;
    if (!columns) return null;
    for (let row = 0; row < table2.childCount; row++) {
      const node = table2.child(row);
      if (node.type !== state.schema.nodes[row === 0 ? "table_header_row" : "table_row"] || node.childCount !== columns) return null;
      for (let col = 0; col < columns; col++) {
        const cell = node.child(col);
        if (cell.type !== state.schema.nodes[row === 0 ? "table_header" : "table_cell"] || cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1 || !validAlignment(cell.attrs.alignment)) return null;
      }
    }
    return { table: table2, pos: $from.before(depth), row: $from.index(depth), column: $from.index(depth + 1) };
  }
  return null;
}
function gfmTableCommand(action) {
  return (state, dispatch) => {
    const { table: table2, table_header_row: table_header_row2, table_row: table_row2, table_header: table_header2, table_cell: table_cell2, paragraph: paragraph2 } = state.schema.nodes;
    if (!table2 || !table_header_row2 || !table_row2 || !table_header2 || !table_cell2 || !paragraph2) return false;
    const freshCell = (header, alignment) => (header ? table_header2 : table_cell2).createAndFill({ alignment, colspan: 1, rowspan: 1, colwidth: null });
    if (action.kind === "insert") {
      if (!dispatch) return true;
      const tableNode = table2.create(null, [
        table_header_row2.create(null, Array.from({ length: 3 }, () => freshCell(true, "left"))),
        ...Array.from({ length: 2 }, () => table_row2.create(null, Array.from({ length: 3 }, () => freshCell(false, "left"))))
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
    const freshRow = () => table_row2.create(null, children(rows[0]).map((cell) => freshCell(false, cell.attrs.alignment)));
    if (action.kind === "add-row") {
      rows.splice(row + 1, 0, freshRow());
      row++;
    } else if (action.kind === "delete-row") {
      if (rows.length <= 1) return false;
      rows.splice(row, 1);
      if (row === 0) rows[0] = table_header_row2.create(
        rows[0].attrs,
        children(rows[0]).map((cell) => table_header2.create(cell.attrs, cell.content, cell.marks)),
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
    const replacement = table2.create(context.table.attrs, rows, context.table.marks);
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

// src/commands.ts
import {
  toggleMark,
  setBlockType,
  wrapIn,
  lift
} from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";

// src/schema.ts
import { Schema, Fragment } from "prosemirror-model";
import katex from "katex";

// src/types.ts
var NULL_MEDIA_RESOLVER_SENTINEL = /* @__PURE__ */ Symbol("@moraya/core:null-media-resolver");

// src/schema.ts
function extractHtmlAttr(html, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = html.match(re);
  return m ? m[1] ?? m[2] ?? m[3] ?? null : null;
}
function extractAllHtmlAttrs(html) {
  const attrs = {};
  const re = /([a-zA-Z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1];
    if (!name) continue;
    attrs[name.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}
function showBrokenImage(container, sourceText) {
  container.textContent = "";
  container.className = (container.className.replace(/\bhtml-img-wrapper\b|\bimage-node\b/, "").trim() + " broken-image").trim();
  const icon = document.createElement("span");
  icon.className = "broken-image-icon";
  container.appendChild(icon);
  const code2 = document.createElement("code");
  code2.className = "broken-image-src";
  code2.textContent = sourceText;
  container.appendChild(code2);
}
function htmlTagToStyle(openTag) {
  const tagMatch = openTag.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch || !tagMatch[1]) return "";
  const tagName = tagMatch[1].toLowerCase();
  switch (tagName) {
    case "font": {
      const parts = [];
      const color = extractHtmlAttr(openTag, "color");
      if (color) parts.push(`color: ${color}`);
      const size = extractHtmlAttr(openTag, "size");
      if (size) {
        const sizeMap = {
          "1": "0.63em",
          "2": "0.82em",
          "3": "1em",
          "4": "1.13em",
          "5": "1.5em",
          "6": "2em",
          "7": "3em"
        };
        parts.push(`font-size: ${sizeMap[size] || size}`);
      }
      const face = extractHtmlAttr(openTag, "face");
      if (face) parts.push(`font-family: ${face}`);
      return parts.join("; ");
    }
    case "span":
    case "div":
      return extractHtmlAttr(openTag, "style") || "";
    default:
      return "";
  }
}
var documentBaseDir = "";
function isAbsoluteFilePath(src) {
  if (!src) return false;
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  if (/^[A-Z]:[\\/]/i.test(src)) return true;
  return false;
}
function isRelativePath(src) {
  if (!src) return false;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(src)) return false;
  if (src.startsWith("/") || /^[A-Z]:[\\/]/i.test(src)) return false;
  return true;
}
function resolveRelativePath(src) {
  if (!documentBaseDir) return src;
  let rel = src.replace(/^\.\//, "");
  const sep = documentBaseDir.includes("\\") ? "\\" : "/";
  let base = documentBaseDir.endsWith(sep) ? documentBaseDir.slice(0, -1) : documentBaseDir;
  while (rel.startsWith("../") || rel.startsWith("..\\")) {
    rel = rel.slice(3);
    const lastSep = base.lastIndexOf(sep);
    if (lastSep > 0) base = base.slice(0, lastSep);
  }
  return `${base}${sep}${rel}`;
}
function localMediaSource(src) {
  const raw = src.trim();
  const fileUrl = /^file:\/\//i.test(raw);
  if (!fileUrl && !isAbsoluteFilePath(raw) && !isRelativePath(raw)) return null;
  let path = raw.split(/[?#]/, 1)[0] ?? "";
  if (fileUrl) {
    const match = /^file:\/\/([^/]*)(\/.*)$/i.exec(path);
    if (!match) return null;
    const host = match[1];
    const pathname = match[2];
    path = host && host.toLowerCase() !== "localhost" ? `//${host}${pathname}` : pathname;
    if (/^\/[a-z]:\//i.test(path)) path = path.slice(1);
  }
  try {
    path = decodeURIComponent(path);
  } catch {
  }
  if (!path || path.includes("\0")) return null;
  return {
    path: fileUrl || isAbsoluteFilePath(path) ? path : resolveRelativePath(path),
    source: { src, baseDir: documentBaseDir }
  };
}
function loadLocalImageSrc(img, src, mediaResolver) {
  const local = localMediaSource(src);
  if (!local) {
    img.src = src;
    return;
  }
  mediaResolver.loadLocalImage(local.path, local.source).then((url) => {
    if (url) img.src = url;
    else img.dispatchEvent(new Event("error"));
  }).catch(() => {
    img.dispatchEvent(new Event("error"));
  });
}
function setMediaSrc(el, src, mediaResolver) {
  const local = localMediaSource(src);
  if (local) {
    mediaResolver.loadLocalMedia(local.path, local.source).then((url) => {
      if (!url) return;
      el.src = url;
      if (el instanceof HTMLMediaElement) el.load();
    }).catch(() => {
    });
  } else if (/^https?:\/\//i.test(src)) {
    if (el instanceof HTMLVideoElement) {
      el.src = src;
      el.load();
    } else {
      mediaResolver.loadRemoteMedia(src).then((url) => {
        if (!url) return;
        el.src = url;
        if (el instanceof HTMLMediaElement) el.load();
      }).catch(() => {
      });
    }
  } else {
    el.src = src;
  }
}
function createMediaElement(tagName, value, mediaResolver) {
  const wrapper = document.createElement("span");
  wrapper.dataset.type = "html-inline";
  wrapper.dataset.value = value;
  wrapper.className = "html-media-wrapper";
  wrapper.contentEditable = "false";
  const el = document.createElement(tagName);
  const stopForControls = (ev) => ev.stopPropagation();
  el.addEventListener("mousedown", stopForControls);
  el.addEventListener("click", stopForControls);
  el.addEventListener("pointerdown", stopForControls);
  const openTagMatch = value.match(new RegExp(`^<${tagName}\\b[^>]*>`, "i"));
  const openTag = openTagMatch ? openTagMatch[0] : "";
  const attrs = extractAllHtmlAttrs(openTag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === "src" || tagName === "video" && key === "poster") continue;
    if (key.startsWith("on")) continue;
    el.setAttribute(key, val);
  }
  const strippedTag = openTag.replace(/=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, "");
  const boolAttrs = ["controls", "autoplay", "loop", "muted", "playsinline"];
  for (const attr of boolAttrs) {
    if (!(attr in attrs) && new RegExp(`\\b${attr}\\b`, "i").test(strippedTag)) {
      el.setAttribute(attr, "");
    }
  }
  if (tagName === "audio" && !attrs.preload) {
    el.setAttribute("preload", "auto");
  }
  const sourceRe = /<source\b[^>]*\/?>/gi;
  let srcMatch;
  while ((srcMatch = sourceRe.exec(value)) !== null) {
    const srcAttrs = extractAllHtmlAttrs(srcMatch[0]);
    if (!srcAttrs.src) continue;
    const source = document.createElement("source");
    if (srcAttrs.type) source.type = srcAttrs.type;
    setMediaSrc(source, srcAttrs.src, mediaResolver);
    el.appendChild(source);
  }
  if (attrs.src) {
    setMediaSrc(el, attrs.src, mediaResolver);
  }
  if (tagName === "video" && attrs.poster) {
    const local = localMediaSource(attrs.poster);
    if (local) {
      mediaResolver.loadLocalImage(local.path, local.source).then((url) => {
        if (url) el.setAttribute("poster", url);
      }).catch(() => {
      });
    } else {
      el.setAttribute("poster", attrs.poster);
    }
  }
  wrapper.appendChild(el);
  return wrapper;
}
var doc = {
  content: "block+"
};
var text = { group: "inline" };
var paragraph = {
  content: "inline*",
  group: "block",
  parseDOM: [{ tag: "p" }],
  toDOM() {
    return ["p", 0];
  }
};
var heading = {
  attrs: {
    id: { default: "" },
    level: { default: 1 }
  },
  content: "inline*",
  group: "block",
  defining: true,
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    getAttrs(dom) {
      return { level, id: dom.getAttribute("id") || "" };
    }
  })),
  toDOM(node) {
    const attrs = {};
    if (node.attrs.id) attrs.id = node.attrs.id;
    return [`h${node.attrs.level}`, attrs, 0];
  }
};
var blockquote = {
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [{ tag: "blockquote" }],
  toDOM() {
    return ["blockquote", 0];
  }
};
var code_block = {
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  code: true,
  attrs: {
    language: { default: "" }
  },
  parseDOM: [{
    tag: "pre",
    preserveWhitespace: "full",
    getAttrs(dom) {
      return { language: dom.dataset.language || "" };
    }
  }],
  toDOM(node) {
    return ["pre", { "data-language": node.attrs.language || void 0 }, ["code", 0]];
  }
};
var frontmatter = {
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  code: true,
  isolating: true,
  parseDOM: [{ tag: "pre.moraya-frontmatter", preserveWhitespace: "full" }],
  toDOM() {
    return ["pre", { class: "moraya-frontmatter", "data-frontmatter": "true" }, ["code", 0]];
  }
};
var horizontal_rule = {
  group: "block",
  parseDOM: [{ tag: "hr" }],
  toDOM() {
    return ["hr"];
  }
};
var bullet_list = {
  content: "list_item+",
  group: "block",
  parseDOM: [{ tag: "ul" }],
  toDOM() {
    return ["ul", 0];
  }
};
var ordered_list = {
  content: "list_item+",
  group: "block",
  attrs: {
    order: { default: 1 }
  },
  parseDOM: [{
    tag: "ol",
    getAttrs(dom) {
      return { order: dom.hasAttribute("start") ? +(dom.getAttribute("start") || 1) : 1 };
    }
  }],
  toDOM(node) {
    return node.attrs.order === 1 ? ["ol", 0] : ["ol", { start: node.attrs.order }, 0];
  }
};
var list_item = {
  content: "paragraph block*",
  group: "listItem",
  defining: true,
  attrs: {
    label: { default: "\u2022" },
    listType: { default: "bullet" },
    spread: { default: "true" },
    checked: { default: null }
  },
  parseDOM: [
    {
      tag: 'li[data-item-type="task"]',
      getAttrs(dom) {
        return {
          label: dom.dataset.label,
          listType: dom.dataset.listType,
          spread: dom.dataset.spread,
          checked: dom.dataset.checked ? dom.dataset.checked === "true" : null
        };
      }
    },
    {
      tag: "li",
      getAttrs(dom) {
        return {
          label: dom.dataset.label || "\u2022",
          listType: dom.dataset.listType || "bullet",
          spread: dom.dataset.spread || "true"
        };
      }
    }
  ],
  toDOM(node) {
    if (node.attrs.checked != null) {
      return ["li", {
        "data-item-type": "task",
        "data-label": node.attrs.label,
        "data-list-type": node.attrs.listType,
        "data-spread": node.attrs.spread,
        "data-checked": String(node.attrs.checked)
      }, 0];
    }
    return ["li", {
      "data-label": node.attrs.label,
      "data-list-type": node.attrs.listType,
      "data-spread": node.attrs.spread
    }, 0];
  }
};
var hardbreak = {
  inline: true,
  group: "inline",
  selectable: false,
  attrs: {
    isInline: { default: false }
  },
  parseDOM: [
    { tag: "br" },
    {
      tag: 'span[data-type="hardbreak"]',
      getAttrs() {
        return { isInline: true };
      }
    }
  ],
  toDOM() {
    return ["span", { "data-type": "hardbreak", "class": "hardbreak-marker" }, "\n"];
  },
  leafText() {
    return "\n";
  }
};
var html_block = {
  content: "text*",
  group: "block",
  marks: "",
  code: true,
  defining: true,
  parseDOM: [{
    tag: 'div[data-type="html"]',
    preserveWhitespace: "full"
  }],
  toDOM() {
    return ["div", { "data-type": "html" }, ["pre", 0]];
  }
};
var table = {
  content: "table_header_row table_row*",
  group: "block",
  tableRole: "table",
  isolating: true,
  parseDOM: [{ tag: "table" }],
  toDOM() {
    return ["table", ["tbody", 0]];
  }
};
var table_header_row = {
  content: "(table_header)*",
  tableRole: "row",
  parseDOM: [
    { tag: "tr[data-is-header]" },
    {
      tag: "tr",
      getAttrs(dom) {
        const hasHeader = dom.querySelector("th");
        return hasHeader ? {} : false;
      }
    }
  ],
  toDOM() {
    return ["tr", { "data-is-header": "true" }, 0];
  }
};
var table_row = {
  content: "(table_cell)*",
  tableRole: "row",
  parseDOM: [{ tag: "tr" }],
  toDOM() {
    return ["tr", 0];
  }
};
var table_header = {
  content: "paragraph+",
  tableRole: "header_cell",
  attrs: {
    alignment: { default: "left" },
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null }
  },
  isolating: true,
  parseDOM: [{
    tag: "th",
    getAttrs(dom) {
      return {
        alignment: dom.style.textAlign || "left",
        colspan: Number(dom.getAttribute("colspan") || 1),
        rowspan: Number(dom.getAttribute("rowspan") || 1),
        colwidth: null
      };
    }
  }],
  toDOM(node) {
    return ["th", { style: `text-align: ${node.attrs.alignment || "left"}` }, 0];
  }
};
var table_cell = {
  content: "paragraph+",
  tableRole: "cell",
  attrs: {
    alignment: { default: "left" },
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null }
  },
  isolating: true,
  parseDOM: [{
    tag: "td",
    getAttrs(dom) {
      return {
        alignment: dom.style.textAlign || "left",
        colspan: Number(dom.getAttribute("colspan") || 1),
        rowspan: Number(dom.getAttribute("rowspan") || 1),
        colwidth: null
      };
    }
  }],
  toDOM(node) {
    return ["td", { style: `text-align: ${node.attrs.alignment || "left"}` }, 0];
  }
};
var spreadsheet = {
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { source: { default: "" } },
  parseDOM: [{
    tag: "div[data-spreadsheet]",
    getAttrs(dom) {
      return { source: dom.getAttribute("data-source") ?? "" };
    }
  }],
  toDOM(node) {
    return ["div", { "data-spreadsheet": "", "data-source": node.attrs.source }];
  }
};
var note_anchor = {
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { note: { default: "" } },
  parseDOM: [{
    tag: "span[data-note-anchor]",
    getAttrs(dom) {
      return { note: dom.dataset.note ?? "" };
    }
  }],
  toDOM(node) {
    return ["span", {
      "data-note-anchor": "",
      "data-note": node.attrs.note,
      class: "moraya-note-anchor",
      contenteditable: "false"
    }];
  }
};
var footnote_ref = {
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { label: { default: "" } },
  parseDOM: [{
    tag: "sup[data-footnote-ref]",
    getAttrs(dom) {
      return { label: dom.dataset.label ?? "" };
    }
  }],
  toDOM(node) {
    return ["sup", {
      "data-footnote-ref": "",
      "data-label": node.attrs.label,
      class: "moraya-footnote-ref",
      contenteditable: "false"
    }];
  }
};
var footnote_definition = {
  group: "block",
  content: "block+",
  defining: true,
  attrs: { label: { default: "" }, tight: { default: false } },
  parseDOM: [{
    tag: "div[data-footnote-def]",
    getAttrs(dom) {
      return { label: dom.dataset.label ?? "", tight: dom.dataset.tight === "true" };
    }
  }],
  toDOM(node) {
    return ["div", {
      "data-footnote-def": "",
      "data-label": node.attrs.label,
      "data-tight": String(node.attrs.tight),
      class: "moraya-footnote-def"
    }, 0];
  }
};
var math_inline = {
  group: "inline",
  content: "text*",
  inline: true,
  atom: true,
  parseDOM: [{
    tag: 'span[data-type="math_inline"]',
    getContent(dom, schema2) {
      if (!(dom instanceof HTMLElement)) return Fragment.empty;
      const value = dom.dataset.value ?? "";
      if (!value) return Fragment.empty;
      return Fragment.from(schema2.text(value));
    }
  }],
  toDOM(node) {
    const code2 = node.textContent;
    const dom = document.createElement("span");
    dom.dataset.type = "math_inline";
    dom.dataset.value = code2;
    try {
      katex.render(code2, dom);
    } catch {
      dom.textContent = code2;
      dom.classList.add("math-error");
      dom.setAttribute("data-math-type", "inline");
    }
    return dom;
  }
};
var math_block = {
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: "" }
  },
  parseDOM: [{
    tag: 'div[data-type="math_block"]',
    preserveWhitespace: "full",
    getAttrs(dom) {
      return { value: dom.dataset.value ?? "" };
    }
  }],
  toDOM(node) {
    const code2 = node.attrs.value;
    const dom = document.createElement("div");
    dom.dataset.type = "math_block";
    dom.dataset.value = code2;
    try {
      katex.render(code2, dom, { displayMode: true });
    } catch {
      dom.textContent = code2;
      dom.classList.add("math-error");
      dom.setAttribute("data-math-type", "block");
    }
    return dom;
  }
};
var defList = {
  content: "(defListTerm | defListDescription)+",
  group: "block",
  defining: true,
  parseDOM: [{ tag: "dl" }],
  toDOM() {
    return ["dl", { class: "definition-list" }, 0];
  }
};
var defListTerm = {
  content: "inline*",
  group: "block",
  defining: true,
  parseDOM: [{ tag: "dt" }],
  toDOM() {
    return ["dt", 0];
  }
};
var defListDescription = {
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [{ tag: "dd" }],
  toDOM() {
    return ["dd", 0];
  }
};
var strong = {
  parseDOM: [
    {
      tag: "b",
      getAttrs(dom) {
        return dom.style.fontWeight !== "normal" && null;
      }
    },
    { tag: "strong" },
    {
      style: "font-weight",
      getAttrs(value) {
        return /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null;
      }
    }
  ],
  toDOM() {
    return ["strong", 0];
  }
};
var em = {
  parseDOM: [
    { tag: "i" },
    { tag: "em" },
    {
      style: "font-style",
      getAttrs(value) {
        return value === "italic" && null;
      }
    }
  ],
  toDOM() {
    return ["em", 0];
  }
};
var code = {
  priority: 100,
  code: true,
  inclusive: false,
  parseDOM: [{ tag: "code" }],
  toDOM() {
    return ["code", 0];
  }
};
var link = {
  attrs: {
    href: {},
    title: { default: null }
  },
  inclusive: false,
  parseDOM: [{
    tag: "a[href]",
    getAttrs(dom) {
      return {
        href: dom.getAttribute("href"),
        title: dom.getAttribute("title")
      };
    }
  }],
  toDOM(mark) {
    const attrs = { href: mark.attrs.href };
    if (mark.attrs.title) attrs.title = mark.attrs.title;
    return ["a", attrs, 0];
  }
};
var strike_through = {
  parseDOM: [
    { tag: "del" },
    { tag: "s" },
    {
      style: "text-decoration",
      getAttrs(value) {
        return value === "line-through" && null;
      }
    }
  ],
  toDOM() {
    return ["del", 0];
  }
};
var highlight = {
  attrs: {
    // Stores which markdown delimiter was used so roundtrip preserves it.
    delimiter: { default: "caret" }
  },
  parseDOM: [{
    tag: "mark",
    getAttrs(dom) {
      return { delimiter: dom.dataset.delimiter === "equals" ? "equals" : "caret" };
    }
  }],
  toDOM(mark) {
    const d = mark.attrs.delimiter;
    return d === "equals" ? ["mark", { "data-delimiter": "equals" }, 0] : ["mark", 0];
  }
};
var annotation = {
  attrs: { note: { default: "" } },
  inclusive: false,
  parseDOM: [{
    tag: "span[data-annotation]",
    getAttrs(dom) {
      return { note: dom.dataset.note ?? "" };
    }
  }],
  toDOM(mark) {
    return ["span", {
      "data-annotation": "",
      "data-note": mark.attrs.note,
      class: "moraya-annotation"
    }, 0];
  }
};
var html_mark = {
  attrs: {
    openTag: { default: "" },
    closeTag: { default: "" }
  },
  excludes: "",
  // Allow nesting multiple html_marks (e.g., <font><u>text</u></font>)
  parseDOM: [{
    tag: '[data-type="html-mark"]',
    getAttrs(dom) {
      return {
        openTag: dom.dataset.openTag ?? "",
        closeTag: dom.dataset.closeTag ?? ""
      };
    }
  }],
  toDOM(mark) {
    const openTag = mark.attrs.openTag;
    const tagMatch = openTag.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
    const tagName = tagMatch && tagMatch[1] ? tagMatch[1].toLowerCase() : "span";
    const attrs = {
      "data-type": "html-mark",
      "data-open-tag": openTag,
      "data-close-tag": mark.attrs.closeTag
    };
    const semanticTags = ["sub", "sup", "u", "ins", "mark", "small", "big", "kbd", "abbr"];
    if (semanticTags.includes(tagName)) {
      return [tagName, attrs, 0];
    }
    const style = htmlTagToStyle(openTag);
    if (style) attrs.style = style;
    return ["span", attrs, 0];
  }
};
function buildImageNodeSpec(mediaResolver) {
  return {
    inline: true,
    group: "inline",
    selectable: true,
    draggable: true,
    marks: "",
    atom: true,
    defining: true,
    isolating: true,
    attrs: {
      src: { default: "" },
      alt: { default: "" },
      title: { default: "" }
    },
    parseDOM: [{
      tag: "img[src]",
      getAttrs(dom) {
        return {
          src: dom.getAttribute("src") || "",
          alt: dom.getAttribute("alt") || "",
          title: dom.getAttribute("title") || dom.getAttribute("alt") || ""
        };
      }
    }],
    toDOM(node) {
      const container = document.createElement("span");
      container.className = "image-node";
      const img = document.createElement("img");
      if (node.attrs.alt) img.alt = node.attrs.alt;
      if (node.attrs.title) img.title = node.attrs.title;
      const titleStr = node.attrs.title || "";
      const widthMatch = titleStr.match(/^width=(\d+%?)$/);
      const widthVal = widthMatch?.[1];
      if (widthVal) {
        img.style.width = widthVal.includes("%") ? widthVal : `${widthVal}px`;
        img.style.maxWidth = "none";
      }
      img.onerror = () => {
        const alt = node.attrs.alt ? `![${node.attrs.alt}]` : "![]";
        const title = node.attrs.title ? ` "${node.attrs.title}"` : "";
        showBrokenImage(container, `${alt}(${node.attrs.src}${title})`);
      };
      const src = node.attrs.src;
      loadLocalImageSrc(img, src, mediaResolver);
      container.appendChild(img);
      return container;
    }
  };
}
function buildHtmlInlineNodeSpec(mediaResolver) {
  return {
    group: "inline",
    inline: true,
    atom: true,
    attrs: {
      value: { default: "" }
    },
    parseDOM: [{
      tag: 'span[data-type="html-inline"]',
      getAttrs(dom) {
        return { value: dom.dataset.value ?? "" };
      }
    }],
    toDOM(node) {
      const value = node.attrs.value;
      if (/^<img\s/i.test(value)) {
        const wrapper = document.createElement("span");
        wrapper.dataset.type = "html-inline";
        wrapper.dataset.value = value;
        wrapper.className = "html-img-wrapper";
        const attrs = extractAllHtmlAttrs(value);
        const src = attrs.src || "";
        if (src) {
          const img = document.createElement("img");
          for (const [key, val] of Object.entries(attrs)) {
            if (key === "src") continue;
            if (key === "onerror" || key === "onload" || key.startsWith("on")) continue;
            img.setAttribute(key, val);
          }
          img.onerror = () => {
            showBrokenImage(wrapper, value);
          };
          loadLocalImageSrc(img, src, mediaResolver);
          wrapper.appendChild(img);
        } else {
          showBrokenImage(wrapper, value);
        }
        return wrapper;
      }
      if (/^<video\b/i.test(value)) return createMediaElement("video", value, mediaResolver);
      if (/^<audio\b/i.test(value)) return createMediaElement("audio", value, mediaResolver);
      return ["span", { "data-type": "html-inline", "data-value": value }];
    }
  };
}
function buildNodes(mediaResolver) {
  return {
    doc,
    text,
    paragraph,
    heading,
    blockquote,
    code_block,
    frontmatter,
    horizontal_rule,
    bullet_list,
    ordered_list,
    list_item,
    image: buildImageNodeSpec(mediaResolver),
    hardbreak,
    html_block,
    html_inline: buildHtmlInlineNodeSpec(mediaResolver),
    table,
    table_header_row,
    table_row,
    table_header,
    table_cell,
    spreadsheet,
    math_inline,
    math_block,
    defList,
    defListTerm,
    defListDescription,
    note_anchor,
    footnote_ref,
    footnote_definition
  };
}
var marks = {
  html_mark,
  annotation,
  strong,
  em,
  code,
  link,
  strike_through,
  highlight
};
var nullMediaResolver = {
  [NULL_MEDIA_RESOLVER_SENTINEL]: true,
  async loadLocalImage() {
    return "";
  },
  async loadLocalMedia() {
    return "";
  },
  async loadRemoteMedia(url) {
    return url;
  }
};
var defaultSchema = new Schema({
  nodes: buildNodes(nullMediaResolver),
  marks
});

// src/commands.ts
var schema = defaultSchema;
function markType(name) {
  const m = schema.marks[name];
  if (!m) throw new Error(`[@moraya/core] mark "${name}" not in schema`);
  return m;
}
function nodeType(name) {
  const n = schema.nodes[name];
  if (!n) throw new Error(`[@moraya/core] node "${name}" not in schema`);
  return n;
}
var toggleBold = (state, dispatch) => toggleMark(markType("strong"))(state, dispatch);
var toggleItalic = (state, dispatch) => toggleMark(markType("em"))(state, dispatch);
var toggleStrikethrough = (state, dispatch) => toggleMark(markType("strike_through"))(state, dispatch);
var toggleCode = (state, dispatch) => toggleMark(markType("code"))(state, dispatch);
var toggleHighlight = (state, dispatch) => toggleMark(markType("highlight"))(state, dispatch);
function setHeading(level) {
  return (state, dispatch) => setBlockType(nodeType("heading"), { level })(state, dispatch);
}
var toggleBlockquote = (state, dispatch) => {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "blockquote") {
      return lift(state, dispatch);
    }
  }
  return wrapIn(nodeType("blockquote"))(state, dispatch);
};
var toggleOrderedList = (state, dispatch) => wrapInList(nodeType("ordered_list"))(state, dispatch);
var toggleBulletList = (state, dispatch) => wrapInList(nodeType("bullet_list"))(state, dispatch);
function makeToggleList(typeName) {
  return (state, dispatch, view) => {
    const listType = state.schema.nodes[typeName];
    const listItemType = state.schema.nodes.list_item;
    if (!listType || !listItemType) return false;
    const { $from } = state.selection;
    for (let d = $from.depth; d >= 0; d--) {
      if ($from.node(d).type === listType) {
        return liftListItem(listItemType)(state, dispatch, view);
      }
    }
    return wrapInList(listType)(state, dispatch, view);
  };
}
var wrapInBulletList = makeToggleList("bullet_list");
var wrapInOrderedList = makeToggleList("ordered_list");
var wrapInTaskList = (state, dispatch) => {
  const bulletListType = state.schema.nodes.bullet_list;
  const listItemType = state.schema.nodes.list_item;
  if (!bulletListType || !listItemType) return false;
  if (!wrapInList(bulletListType)(state)) return false;
  if (!dispatch) return true;
  let listTr;
  wrapInList(bulletListType)(state, (tr) => {
    listTr = tr;
  });
  if (!listTr) return false;
  const $from = listTr.doc.resolve(listTr.selection.from);
  let listDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type === bulletListType) {
      listDepth = d;
      break;
    }
  }
  if (listDepth < 0) {
    dispatch(listTr.scrollIntoView());
    return true;
  }
  const listStart = $from.before(listDepth);
  const listEnd = listStart + $from.node(listDepth).nodeSize;
  const updates = [];
  listTr.doc.nodesBetween(listStart, listEnd, (node, pos) => {
    if (node.type === listItemType && node.attrs.checked === null) {
      updates.push({ pos, attrs: { ...node.attrs, checked: false } });
    }
  });
  for (let i = updates.length - 1; i >= 0; i--) {
    const u = updates[i];
    listTr.setNodeMarkup(u.pos, void 0, u.attrs);
  }
  dispatch(listTr.scrollIntoView());
  return true;
};
var toggleCodeBlock = (state, dispatch) => {
  const { code_block: cb, paragraph: paragraph2 } = state.schema.nodes;
  if (!cb || !paragraph2) return false;
  if (state.selection.$from.parent.type === cb) {
    return setBlockType(paragraph2)(state, dispatch);
  }
  return setBlockType(cb, { language: "" })(state, dispatch);
};
var insertHorizontalRule = (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(nodeType("horizontal_rule").create()));
  }
  return true;
};
var insertTable = gfmTableCommand({ kind: "insert" });
var insertMathBlock = (state, dispatch) => {
  const mathBlock = state.schema.nodes.math_block;
  if (!mathBlock) {
    if (dispatch) {
      dispatch(state.tr.insertText("\n$$\n\\\n$$\n"));
    }
    return true;
  }
  if (dispatch) {
    const node = mathBlock.create({ value: "" });
    dispatch(state.tr.replaceSelectionWith(node));
  }
  return true;
};
function toggleLink(href) {
  return (state, dispatch) => {
    const link2 = markType("link");
    const { from, to } = state.selection;
    if (state.doc.rangeHasMark(from, to, link2)) {
      if (dispatch) dispatch(state.tr.removeMark(from, to, link2));
      return true;
    }
    if (!href) return false;
    if (dispatch) {
      dispatch(state.tr.addMark(from, to, link2.create({ href })));
    }
    return true;
  };
}
function insertImage(src, alt) {
  return (state, dispatch) => {
    const img = nodeType("image").create({ src, alt: alt ?? null });
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(img));
    }
    return true;
  };
}
export {
  gfmTableCommand,
  insertHorizontalRule,
  insertImage,
  insertMathBlock,
  insertTable,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCode,
  toggleCodeBlock,
  toggleHighlight,
  toggleItalic,
  toggleLink,
  toggleOrderedList,
  toggleStrikethrough,
  wrapInBulletList,
  wrapInOrderedList,
  wrapInTaskList
};
//# sourceMappingURL=commands.js.map