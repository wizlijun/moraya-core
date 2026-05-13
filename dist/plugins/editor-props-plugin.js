// src/plugins/editor-props-plugin.ts
import { Fragment as Fragment2, Slice } from "prosemirror-model";
import { AllSelection, Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

// src/markdown.ts
import MarkdownIt from "markdown-it";
import deflistPlugin from "markdown-it-deflist";
import texmathPlugin from "markdown-it-texmath";

// node_modules/.pnpm/markdown-it-mark@4.0.0/node_modules/markdown-it-mark/index.mjs
function ins_plugin(md2) {
  function tokenize(state, silent) {
    const start = state.pos;
    const marker = state.src.charCodeAt(start);
    if (silent) {
      return false;
    }
    if (marker !== 61) {
      return false;
    }
    const scanned = state.scanDelims(state.pos, true);
    let len = scanned.length;
    const ch = String.fromCharCode(marker);
    if (len < 2) {
      return false;
    }
    if (len % 2) {
      const token = state.push("text", "", 0);
      token.content = ch;
      len--;
    }
    for (let i = 0; i < len; i += 2) {
      const token = state.push("text", "", 0);
      token.content = ch + ch;
      if (!scanned.can_open && !scanned.can_close) {
        continue;
      }
      state.delimiters.push({
        marker,
        length: 0,
        // disable "rule of 3" length checks meant for emphasis
        jump: i / 2,
        // 1 delimiter = 2 characters
        token: state.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close
      });
    }
    state.pos += scanned.length;
    return true;
  }
  function postProcess(state, delimiters) {
    const loneMarkers = [];
    const max = delimiters.length;
    for (let i = 0; i < max; i++) {
      const startDelim = delimiters[i];
      if (startDelim.marker !== 61) {
        continue;
      }
      if (startDelim.end === -1) {
        continue;
      }
      const endDelim = delimiters[startDelim.end];
      const token_o = state.tokens[startDelim.token];
      token_o.type = "mark_open";
      token_o.tag = "mark";
      token_o.nesting = 1;
      token_o.markup = "==";
      token_o.content = "";
      const token_c = state.tokens[endDelim.token];
      token_c.type = "mark_close";
      token_c.tag = "mark";
      token_c.nesting = -1;
      token_c.markup = "==";
      token_c.content = "";
      if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "=") {
        loneMarkers.push(endDelim.token - 1);
      }
    }
    while (loneMarkers.length) {
      const i = loneMarkers.pop();
      let j = i + 1;
      while (j < state.tokens.length && state.tokens[j].type === "mark_close") {
        j++;
      }
      j--;
      if (i !== j) {
        const token = state.tokens[j];
        state.tokens[j] = state.tokens[i];
        state.tokens[i] = token;
      }
    }
  }
  md2.inline.ruler.before("emphasis", "mark", tokenize);
  md2.inline.ruler2.before("emphasis", "mark", function(state) {
    let curr;
    const tokens_meta = state.tokens_meta;
    const max = (state.tokens_meta || []).length;
    postProcess(state, state.delimiters);
    for (curr = 0; curr < max; curr++) {
      if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
        postProcess(state, tokens_meta[curr].delimiters);
      }
    }
  });
}

// src/markdown.ts
import { MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";

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
  if (/^(https?:|data:|blob:|javascript:|vbscript:|tauri:|\/\/)/i.test(src)) return false;
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
function loadLocalImageSrc(img, src, mediaResolver) {
  let path;
  try {
    path = decodeURIComponent(src);
  } catch {
    path = src;
  }
  mediaResolver.loadLocalImage(path).then((url) => {
    if (url) img.src = url;
    else img.dispatchEvent(new Event("error"));
  }).catch(() => {
    img.dispatchEvent(new Event("error"));
  });
}
function setMediaSrc(el, src, mediaResolver) {
  if (isAbsoluteFilePath(src)) {
    mediaResolver.loadLocalMedia(src).then((url) => {
      if (!url) return;
      el.src = url;
      if (el instanceof HTMLMediaElement) el.load();
    }).catch(() => {
    });
  } else if (isRelativePath(src)) {
    mediaResolver.loadLocalMedia(resolveRelativePath(src)).then((url) => {
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
    if (key === "src") continue;
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
    language: { default: "text" }
  },
  parseDOM: [{
    tag: "pre",
    preserveWhitespace: "full",
    getAttrs(dom) {
      return { language: dom.dataset.language || "text" };
    }
  }],
  toDOM(node) {
    return ["pre", { "data-language": node.attrs.language || void 0 }, ["code", 0]];
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
  content: "table_header_row table_row+",
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
var math_inline = {
  group: "inline",
  content: "text*",
  inline: true,
  atom: true,
  parseDOM: [{
    tag: 'span[data-type="math_inline"]',
    getContent(dom, schema) {
      if (!(dom instanceof HTMLElement)) return Fragment.empty;
      const value = dom.dataset.value ?? "";
      if (!value) return Fragment.empty;
      return Fragment.from(schema.text(value));
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
  parseDOM: [{ tag: "mark" }],
  toDOM() {
    return ["mark", 0];
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
      if (isAbsoluteFilePath(src)) {
        loadLocalImageSrc(img, src, mediaResolver);
      } else if (isRelativePath(src)) {
        loadLocalImageSrc(img, resolveRelativePath(src), mediaResolver);
      } else {
        img.src = src;
      }
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
          if (isAbsoluteFilePath(src)) {
            loadLocalImageSrc(img, src, mediaResolver);
          } else if (isRelativePath(src)) {
            loadLocalImageSrc(img, resolveRelativePath(src), mediaResolver);
          } else {
            img.src = src;
          }
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
    math_inline,
    math_block,
    defList,
    defListTerm,
    defListDescription
  };
}
var marks = {
  html_mark,
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

// src/markdown.ts
var md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false
}).enable(["table", "strikethrough"]).use(deflistPlugin).use(texmathPlugin).use(ins_plugin);
md.inline.ruler.push("caret_highlight", (state, silent) => {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 94) return false;
  if (state.src.charCodeAt(start + 1) !== 94) return false;
  const contentStart = start + 2;
  if (contentStart >= state.posMax) return false;
  let closeIdx = -1;
  for (let i = contentStart; i < state.posMax - 1; i++) {
    if (state.src.charCodeAt(i) === 94 && state.src.charCodeAt(i + 1) === 94) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx < 0 || closeIdx === contentStart) return false;
  if (!silent) {
    state.push("caret_highlight_open", "mark", 1).markup = "^^";
    const token = state.push("text", "", 0);
    token.content = state.src.slice(contentStart, closeIdx);
    state.push("caret_highlight_close", "mark", -1).markup = "^^";
  }
  state.pos = closeIdx + 2;
  return true;
});
function tagPairedHtmlInline(tokens) {
  const VOID_RE = /^<(?:br|hr|img|input|wbr|area|base|col|embed|link|meta|param|source|track)[\s/>]/i;
  for (const token of tokens) {
    if (token.type !== "inline" || !token.children) continue;
    const children = token.children;
    const stack = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child || child.type !== "html_inline") continue;
      const content = child.content;
      if (VOID_RE.test(content) || /\/>$/.test(content) || /^<!--/.test(content)) continue;
      const closeMatch = content.match(/^<\/([a-zA-Z][a-zA-Z0-9]*)\s*>$/);
      if (closeMatch && closeMatch[1]) {
        const tagName = closeMatch[1].toLowerCase();
        for (let j = stack.length - 1; j >= 0; j--) {
          const entry = stack[j];
          if (!entry) continue;
          if (entry.tagName === tagName) {
            const opener = children[entry.index];
            if (opener) {
              opener.meta = { ...opener.meta || {}, htmlPaired: true };
            }
            child.meta = { ...child.meta || {}, htmlPaired: true };
            stack.splice(j, 1);
            break;
          }
        }
        continue;
      }
      const openMatch = content.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>$/);
      if (openMatch && openMatch[1]) {
        stack.push({ tagName: openMatch[1].toLowerCase(), index: i });
      }
    }
  }
}
function preserveBlankLines(tokens) {
  function mkToken(type, tag, nesting, extra) {
    return {
      type,
      tag,
      nesting,
      content: "",
      children: null,
      attrs: null,
      info: "",
      meta: null,
      map: null,
      block: true,
      hidden: false,
      level: 0,
      markup: "",
      ...extra
    };
  }
  const result = [];
  let lastTopBlockEndLine = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    if (tok.map && tok.level === 0 && (tok.nesting === 1 || tok.nesting === 0)) {
      const startLine = tok.map[0];
      const gap = startLine - lastTopBlockEndLine;
      if (gap > 1 && lastTopBlockEndLine > 0) {
        const extra = gap - 1;
        for (let j = 0; j < extra; j++) {
          result.push(
            mkToken("paragraph_open", "p", 1),
            mkToken("inline", "", 0, { level: 1, block: false, children: [] }),
            mkToken("paragraph_close", "p", -1)
          );
        }
      }
      lastTopBlockEndLine = tok.map[1];
    }
    result.push(tok);
  }
  return result;
}
var _origMdParse = md.parse.bind(md);
md.parse = function(src, env) {
  let tokens = _origMdParse(src, env);
  tagPairedHtmlInline(tokens);
  tokens = preserveBlankLines(tokens);
  return tokens;
};
var parserTokens = {
  // ── Block tokens ──
  paragraph: { block: "paragraph" },
  blockquote: { block: "blockquote" },
  heading: {
    block: "heading",
    getAttrs(token) {
      return { level: Number(token.tag.slice(1)) };
    }
  },
  hr: { node: "horizontal_rule" },
  bullet_list: { block: "bullet_list" },
  ordered_list: {
    block: "ordered_list",
    getAttrs(token) {
      return { order: Number(token.attrGet("start") || 1) };
    }
  },
  list_item: {
    block: "list_item",
    getAttrs(_token, tokens, index) {
      let checked = null;
      for (let i = index + 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t) continue;
        if (t.type === "inline" && t.content) {
          const match = t.content.match(/^\[( |x|X)\]\s?/);
          if (match) {
            checked = match[1] !== " ";
            t.content = t.content.slice(match[0].length);
            const children = t.children;
            if (children && children.length > 0) {
              const firstChild = children[0];
              if (firstChild.type === "text") {
                firstChild.content = firstChild.content.slice(match[0].length);
                if (!firstChild.content) {
                  children.shift();
                }
              }
            }
          }
          break;
        }
        if (t.type === "list_item_close") break;
      }
      return { checked };
    }
  },
  code_block: {
    block: "code_block",
    getAttrs() {
      return { language: "text" };
    },
    noCloseToken: true
  },
  fence: {
    block: "code_block",
    getAttrs(token) {
      return { language: token.info.trim() || "text" };
    },
    noCloseToken: true
  },
  html_block: {
    block: "html_block",
    noCloseToken: true
  },
  html_inline: {
    // markdown-it emits this token for inline HTML like <br>, <span>, <sup>,
    // and HTML comments <!-- ... -->. Store raw HTML in the `value` attr.
    node: "html_inline",
    noCloseToken: true,
    getAttrs(token) {
      return { value: token.content };
    }
  },
  // ── Table tokens ──
  // NOTE: tr/th/td are NOT listed here — they are handled by custom tokenHandler
  // overrides in MorayaMarkdownParser below. The `block:` spec alone can't
  // handle (a) thead-row → table_header_row vs table_row dispatch, or
  // (b) wrapping inline content in the required paragraph child of each cell.
  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },
  // ── Definition list tokens ──
  dl: { block: "defList" },
  dt: { block: "defListTerm" },
  dd: { block: "defListDescription" },
  // ── Math tokens (from markdown-it-texmath) ──
  // Use block: spec (not node:) so token.content is added as text children,
  // correctly filling math_inline's `content: 'text*'`.
  math_inline: {
    block: "math_inline",
    noCloseToken: true
  },
  // markdown-it-texmath emits math_inline_double for $$...$$ in inline context.
  // Map to math_inline to prevent "Token type not supported" crash.
  math_inline_double: {
    block: "math_inline",
    noCloseToken: true
  },
  math_block: {
    node: "math_block",
    noCloseToken: true,
    getAttrs(token) {
      return { value: token.content.trim() };
    }
  },
  // ── Inline tokens ──
  image: {
    node: "image",
    getAttrs(token) {
      let src = token.attrGet("src") || "";
      try {
        src = decodeURIComponent(src);
      } catch {
      }
      return {
        src,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alt: (token.children || []).map((c) => c.content).join("") || "",
        title: token.attrGet("title") || ""
      };
    }
  },
  hardbreak: { node: "hardbreak" },
  softbreak: { node: "hardbreak", attrs: { isInline: true } },
  // ── Mark tokens ──
  em: { mark: "em" },
  strong: { mark: "strong" },
  s: { mark: "strike_through" },
  code_inline: { mark: "code", noCloseToken: true },
  link: {
    mark: "link",
    getAttrs(token) {
      let href = token.attrGet("href") || "";
      href = href.replace(
        /%[C-F][0-9A-F](?:%[89AB][0-9A-F])+/gi,
        (m) => {
          try {
            return decodeURIComponent(m);
          } catch {
            return m;
          }
        }
      );
      return {
        href,
        title: token.attrGet("title") || null
      };
    }
  },
  mark: { mark: "highlight" },
  caret_highlight: { mark: "highlight" }
};
var MorayaMarkdownParser = class extends MarkdownParser {
  /**
   * The schema this parser instance is bound to. Captured for use in
   * tokenHandler overrides (tr_open / th_open / etc.) so they reference the
   * caller-provided schema rather than the module-level defaultSchema.
   */
  schema;
  constructor(schemaArg = defaultSchema) {
    super(schemaArg, md, parserTokens);
    this.schema = schemaArg;
    const h = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.tokenHandlers
    );
    function cellAlignment(tok) {
      const style = tok.attrGet("style") || "";
      const m = style.match(/text-align:\s*(\w+)/);
      return m && m[1] ? m[1] : "left";
    }
    h["tr_open"] = (state, _tok, tokens, i) => {
      let inThead = false;
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j].type === "thead_open") {
          inThead = true;
          break;
        }
        if (tokens[j].type === "thead_close" || tokens[j].type === "tbody_open") break;
      }
      state.openNode(inThead ? schemaArg.nodes.table_header_row : schemaArg.nodes.table_row, null);
    };
    h["tr_close"] = (state) => state.closeNode();
    h["th_open"] = (state, tok) => {
      state.openNode(schemaArg.nodes.table_header, { alignment: cellAlignment(tok) });
      state.openNode(schemaArg.nodes.paragraph, null);
    };
    h["th_close"] = (state) => {
      state.closeNode();
      state.closeNode();
    };
    h["td_open"] = (state, tok) => {
      state.openNode(schemaArg.nodes.table_cell, { alignment: cellAlignment(tok) });
      state.openNode(schemaArg.nodes.paragraph, null);
    };
    h["td_close"] = (state) => {
      state.closeNode();
      state.closeNode();
    };
    const defaultLinkOpen = h["link_open"];
    const defaultLinkClose = h["link_close"];
    h["link_open"] = (state, tok, tokens, i) => {
      let hasContent = false;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "link_close") break;
        if (tokens[j].type === "text" && tokens[j].content) {
          hasContent = true;
          break;
        }
        if (["image", "code_inline", "softbreak", "hardbreak", "html_inline"].includes(tokens[j].type)) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) {
        let href = tok.attrGet("href") || "";
        href = href.replace(
          /%[C-F][0-9A-F](?:%[89AB][0-9A-F])+/gi,
          (m) => {
            try {
              return decodeURIComponent(m);
            } catch {
              return m;
            }
          }
        );
        const title = tok.attrGet("title");
        let literal = `[](${href}`;
        if (title) literal += ` "${title}"`;
        literal += ")";
        state.addText(literal);
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === "link_close") {
            tokens[j].meta = { ...tokens[j].meta || {}, skipClose: true };
            break;
          }
        }
        return;
      }
      defaultLinkOpen(state, tok, tokens, i);
    };
    h["link_close"] = (state, tok, tokens, i) => {
      if (tok.meta?.skipClose) return;
      defaultLinkClose(state, tok, tokens, i);
    };
    const defaultTextHandler = h["text"];
    h["text"] = (state, tok, toks, ii) => {
      if (tok.meta?.mediaSkip) return;
      defaultTextHandler(state, tok, toks, ii);
    };
    h["html_inline"] = (state, tok, tokens, i) => {
      if (tok.meta?.mediaSkip) return;
      const content = tok.content;
      const mediaMatch = content.match(/^<(audio|video)\b/i);
      if (mediaMatch && mediaMatch[1]) {
        const tagName = mediaMatch[1].toLowerCase();
        const closeRe = new RegExp(`^</${tagName}\\s*>$`, "i");
        let fullHtml = content;
        for (let j = i + 1; j < tokens.length; j++) {
          const t = tokens[j];
          if (t.type === "html_inline" && closeRe.test(t.content.trim())) {
            fullHtml += t.content;
            t.meta = { ...t.meta || {}, mediaSkip: true };
            break;
          }
          if (t.content) fullHtml += t.content;
          t.meta = { ...t.meta || {}, mediaSkip: true };
        }
        state.addNode(schemaArg.nodes.html_inline, { value: fullHtml });
        return;
      }
      if (tok.meta?.htmlPaired) {
        const htmlMark = schemaArg.marks.html_mark;
        if (!htmlMark) {
          state.addNode(schemaArg.nodes.html_inline, { value: content });
          return;
        }
        if (!content.startsWith("</")) {
          const tagMatch = content.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
          const tagName = tagMatch && tagMatch[1] ? tagMatch[1].toLowerCase() : "";
          state.openMark(htmlMark.create({
            openTag: content,
            closeTag: `</${tagName}>`
          }));
        } else {
          state.closeMark(htmlMark);
        }
        return;
      }
      state.addNode(schemaArg.nodes.html_inline, { value: content });
    };
    const defaultHtmlBlock = h["html_block"];
    h["html_block"] = (state, tok, tokens, i) => {
      const content = tok.content.trim();
      if (/^<img\s/i.test(content)) {
        const imgPattern = /<img\s[^>]*\/?>/gi;
        const imgs = content.match(imgPattern);
        state.openNode(schemaArg.nodes.paragraph, null);
        if (imgs && imgs.length > 0) {
          for (let j = 0; j < imgs.length; j++) {
            if (j > 0) {
              state.addNode(schemaArg.nodes.hardbreak, { isInline: true });
            }
            state.addNode(schemaArg.nodes.html_inline, { value: imgs[j] });
          }
        } else {
          state.addNode(schemaArg.nodes.html_inline, { value: content });
        }
        state.closeNode();
      } else if (/^<(video|audio)\b/i.test(content)) {
        state.openNode(schemaArg.nodes.paragraph, null);
        state.addNode(schemaArg.nodes.html_inline, { value: content });
        state.closeNode();
      } else {
        defaultHtmlBlock(state, tok, tokens, i);
      }
    };
  }
};
var defaultParser = new MorayaMarkdownParser(defaultSchema);
var parserCache = /* @__PURE__ */ new WeakMap();
parserCache.set(defaultSchema, defaultParser);
function getParserFor(schema) {
  if (!schema || schema === defaultSchema) return defaultParser;
  let p = parserCache.get(schema);
  if (!p) {
    p = new MorayaMarkdownParser(schema);
    parserCache.set(schema, p);
  }
  return p;
}
var serializer = new MarkdownSerializer(
  {
    // ── Block nodes ──
    doc(state, node) {
      state.renderContent(node);
    },
    paragraph(state, node) {
      if (node.content.size === 0) {
        state.write("");
      } else {
        state.renderInline(node);
      }
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(`${"#".repeat(node.attrs.level)} `);
      state.renderInline(node, false);
      state.closeBlock(node);
    },
    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    code_block(state, node) {
      const lang = node.attrs.language || "";
      const fenceLang = lang === "text" ? "" : lang;
      state.write(`\`\`\`${fenceLang}
`);
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    horizontal_rule(state, node) {
      state.write("---");
      state.closeBlock(node);
    },
    bullet_list(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    ordered_list(state, node) {
      const start = node.attrs.order || 1;
      state.renderList(node, "   ", (i) => `${start + i}. `);
    },
    list_item(state, node) {
      if (node.attrs.checked != null) {
        const checkbox = node.attrs.checked ? "[x] " : "[ ] ";
        state.write(checkbox);
      }
      state.renderContent(node);
    },
    image(state, node) {
      const alt = state.esc(node.attrs.alt || "", false);
      const src = node.attrs.src || "";
      const title = node.attrs.title;
      if (title) {
        state.write(`![${alt}](${src} "${state.esc(title, false)}")`);
      } else {
        state.write(`![${alt}](${src})`);
      }
    },
    hardbreak(state) {
      state.write("  \n");
    },
    html_block(state, node) {
      state.text(node.textContent, false);
      state.closeBlock(node);
    },
    html_inline(state, node) {
      state.text(node.attrs.value, false);
    },
    // ── Table nodes ──
    table(state, node) {
      const alignments = [];
      const headerRow = node.child(0);
      headerRow.forEach((cell) => {
        alignments.push(cell.attrs.alignment || "left");
      });
      renderTableRow(state, headerRow);
      const sep = alignments.map((a) => {
        switch (a) {
          case "center":
            return ":---:";
          case "right":
            return "---:";
          default:
            return "---";
        }
      });
      state.write(`| ${sep.join(" | ")} |`);
      state.ensureNewLine();
      for (let i = 1; i < node.childCount; i++) {
        renderTableRow(state, node.child(i));
      }
      state.closeBlock(node);
    },
    table_header_row() {
    },
    table_row() {
    },
    table_header(state, node) {
      state.renderInline(node.firstChild);
    },
    table_cell(state, node) {
      state.renderInline(node.firstChild);
    },
    // ── Math nodes ──
    math_inline(state, node) {
      state.write(`$${node.textContent}$`);
    },
    math_block(state, node) {
      state.write("$$\n");
      state.text(node.attrs.value || node.textContent, false);
      state.ensureNewLine();
      state.write("$$");
      state.closeBlock(node);
    },
    // ── Definition list nodes ──
    defList(state, node) {
      state.renderContent(node);
    },
    defListTerm(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    defListDescription(state, node) {
      state.write(":   ");
      state.renderContent(node);
    },
    // ── Fallback for text node (shouldn't be needed but safe) ──
    text(state, node) {
      state.text(node.text || "");
    }
  },
  {
    // ── Mark serializers ──
    strong: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true
    },
    em: {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true
    },
    code: {
      open(_state, mark, parent, index) {
        return isPlainURL(mark, parent, index, 1) ? "" : "`";
      },
      close(_state, mark, parent, index) {
        return isPlainURL(mark, parent, index, -1) ? "" : "`";
      },
      escape: false
    },
    link: {
      open(_state, mark, parent, index) {
        return isPlainURL(mark, parent, index, 1) ? "<" : "[";
      },
      close(state, mark, parent, index) {
        const href = mark.attrs.href;
        const title = mark.attrs.title;
        if (isPlainURL(mark, parent, index, -1)) {
          return ">";
        }
        return title ? `](${href} "${state.esc(title, false)}")` : `](${href})`;
      },
      mixable: false
    },
    strike_through: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true
    },
    highlight: {
      open: "^^",
      close: "^^",
      mixable: true,
      expelEnclosingWhitespace: true
    },
    html_mark: {
      open(_state, mark) {
        return mark.attrs.openTag;
      },
      close(_state, mark) {
        return mark.attrs.closeTag;
      }
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  {
    hardBreakNodeName: "hardbreak",
    strict: false
  }
);
function renderTableRow(state, row) {
  const cells = [];
  const s = state;
  row.forEach((cell) => {
    const parts = [];
    cell.forEach((para) => {
      if (para.type.name !== "paragraph") return;
      const savedOut = s.out;
      const savedClosed = s.closed;
      s.out = "";
      s.closed = null;
      state.renderInline(para);
      const piece = s.out.replace(/\n/g, " ").trim();
      s.out = savedOut;
      s.closed = savedClosed;
      parts.push(piece);
    });
    cells.push(parts.join(" "));
  });
  state.write(`| ${cells.join(" | ")} |`);
  state.ensureNewLine();
}
function isPlainURL(mark, parent, index, side) {
  if (mark.attrs.title || !/^\w+:/.test(mark.attrs.href)) return false;
  const content = parent.child(index + (side < 0 ? -1 : 0));
  if (!content.isText || content.text !== mark.attrs.href || content.marks[content.marks.length - 1] !== mark) {
    return false;
  }
  if (index === (side < 0 ? 1 : parent.childCount - 1)) return true;
  const next = parent.child(index + (side < 0 ? -2 : 1));
  return !mark.isInSet(next.marks);
}
function normalizeMathBlocks(text2) {
  if (!text2.includes("$$")) return text2;
  const lines = text2.split("\n");
  const result = [];
  let inFence = false;
  let inMathBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!inMathBlock && /^(`{3,}|~{3,})/.test(trimmed)) {
      inFence = !inFence;
      result.push(line);
      continue;
    }
    if (inFence) {
      result.push(line);
      continue;
    }
    if (trimmed === "$$") {
      if (!inMathBlock) {
        const last = result[result.length - 1];
        if (result.length > 0 && last !== void 0 && last.trim() !== "") {
          result.push("");
        }
        result.push(line);
        inMathBlock = true;
      } else {
        result.push(line);
        inMathBlock = false;
        const next = lines[i + 1];
        if (next !== void 0 && next.trim() !== "") {
          result.push("");
        }
      }
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}
function normalizeSmartQuotes(text2) {
  if (!/[“”„‟‘’‚‛]/.test(text2)) return text2;
  return text2.replace(
    /(\]\([^\n)]*\s)“([^”\n]*)”(\s*\))/g,
    (_m, pre, title, post) => `${pre}"${title}"${post}`
  ).replace(
    /(\]\([^\n)]*\s)“([^”\n]*)”(\s*\))/g,
    (_m, pre, title, post) => `${pre}"${title}"${post}`
  ).replace(
    /(\]\([^\n)]*\s)‘([^’\n]*)’(\s*\))/g,
    (_m, pre, title, post) => `${pre}'${title}'${post}`
  );
}
function parseMarkdown(markdown, schemaArg) {
  const p = getParserFor(schemaArg);
  try {
    return p.parse(normalizeSmartQuotes(normalizeMathBlocks(markdown)));
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[parseMarkdown] best-effort fallback for malformed input:", err);
    }
    return p.schema.topNodeType.createAndFill();
  }
}

// src/plugins/editor-props-plugin.ts
var editorPropsKey = new PluginKey("moraya-editor-props");
function isLocalFilePath(href) {
  if (href.startsWith("/")) return true;
  if (href.startsWith("./") || href.startsWith("../")) return true;
  if (/^[A-Za-z]:[/\\]/.test(href)) return true;
  if (href.startsWith("file://")) return true;
  return false;
}
function resolveLocalPath(href, platform) {
  let path = href;
  if (path.startsWith("file:///")) {
    path = path.slice(7);
    try {
      path = decodeURIComponent(path);
    } catch {
    }
  } else if (path.startsWith("file://")) {
    path = path.slice(5);
    try {
      path = decodeURIComponent(path);
    } catch {
    }
  }
  if (path.startsWith("/") || /^[A-Za-z]:[/\\]/.test(path)) return path;
  const currentFile = platform.getCurrentFilePath();
  if (currentFile) {
    const dir = currentFile.replace(/[/\\][^/\\]*$/, "");
    return dir + "/" + path;
  }
  return path;
}
function createEditorPropsPlugin(opts) {
  const { platform, linkOpener } = opts;
  const isMacOS = platform.isMacOS;
  let pendingPaste = false;
  return new Plugin({
    key: editorPropsKey,
    props: {
      /**
       * Parse pasted plain text as Markdown so syntax renders instead of
       * being inserted as escaped literal text.
       */
      clipboardTextParser(text2, $context, plain) {
        if (plain || $context.parent.type.spec.code) return void 0;
        const doc2 = parseMarkdown(text2);
        if (doc2.textContent.length === 0 && doc2.content.size <= 2) return void 0;
        const content = doc2.content;
        if (content.childCount === 1 && content.firstChild.type.name === "paragraph") {
          return new Slice(content.firstChild.content, 0, 0);
        }
        return new Slice(content, 0, 0);
      },
      /**
       * Safety net for degenerate pastes (empty markdown link, empty <a>, etc.).
       * Also routes pasted markdown image syntax through the markdown parser.
       */
      handlePaste(view, event, slice) {
        const plain = event.clipboardData?.getData("text/plain");
        if (!plain) return false;
        const trimmed = plain.trim();
        if (/^!\[/.test(trimmed)) {
          const doc2 = parseMarkdown(trimmed);
          if (doc2.content.size > 2) {
            const content = doc2.content;
            const inner = content.childCount === 1 && content.firstChild.type.name === "paragraph" ? content.firstChild.content : content;
            view.dispatch(
              view.state.tr.replaceSelection(new Slice(inner, 0, 0))
            );
            pendingPaste = true;
            return true;
          }
        }
        const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(trimmed);
        if (linkMatch && (!linkMatch[1] || !linkMatch[2])) {
          const textNode = view.state.schema.text(plain);
          view.dispatch(
            view.state.tr.replaceSelection(new Slice(Fragment2.from(textNode), 0, 0))
          );
          pendingPaste = true;
          return true;
        }
        try {
          const sliceText = slice.content.textBetween(0, slice.content.size, "", "");
          if (sliceText.trim().length === 0 && trimmed.length > 0) {
            const textNode = view.state.schema.text(plain);
            view.dispatch(
              view.state.tr.replaceSelection(new Slice(Fragment2.from(textNode), 0, 0))
            );
            pendingPaste = true;
            return true;
          }
        } catch {
        }
        return false;
      },
      /**
       * Paste language normalization:
       * Copy class="language-xxx" from <code> to data-language on parent <pre>.
       */
      transformPastedHTML(html) {
        if (!html.includes("language-")) return html;
        try {
          const template = document.createElement("template");
          template.innerHTML = html;
          const fragment = template.content;
          for (const pre of fragment.querySelectorAll("pre")) {
            if (pre.dataset.language) continue;
            const code2 = pre.querySelector("code");
            if (!code2) continue;
            const match = code2.className.match(/(?:language|lang)-(\S+)/);
            if (match && match[1]) {
              pre.dataset.language = match[1];
            }
          }
          return template.innerHTML;
        } catch {
          return html;
        }
      },
      handleDOMEvents: {
        /**
         * Safety: prevent WebView navigation on any remaining <a> clicks.
         * (Most <a> tags get expanded to literal text on mousedown, but this
         * is a fallback in case the click fires before the expand.)
         */
        click(_view, event) {
          const me = event;
          const target = me.target;
          if (!target) return false;
          const anchor = target.closest("a[href]");
          if (anchor) {
            me.preventDefault();
          }
          return false;
        },
        mousedown(view, event) {
          const me = event;
          if (me.button !== 0) return false;
          const target = me.target;
          if (!target) return false;
          if (me.metaKey || me.ctrlKey) {
            const anchor = target.closest("a[href]");
            if (anchor) {
              const href = anchor.getAttribute("href");
              if (href) {
                me.preventDefault();
                const targetHref = isLocalFilePath(href) ? resolveLocalPath(href, platform) : href;
                try {
                  linkOpener.open(targetHref);
                } catch (e) {
                  console.warn("[opener] failed:", targetHref, e);
                }
                return true;
              }
            }
          }
          const mathBlock = target.closest('div[data-type="math_block"]');
          if (!mathBlock) return false;
          me.preventDefault();
          try {
            const pos = view.posAtDOM(mathBlock, 0);
            const $pos = view.state.doc.resolve(pos);
            let beforePos = pos;
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === "math_block") {
                beforePos = $pos.before(d);
                break;
              }
            }
            const $before = view.state.doc.resolve(beforePos);
            if (!$before.nodeAfter || $before.nodeAfter.type.name !== "math_block") {
              if ($pos.nodeAfter?.type.name === "math_block") {
                beforePos = pos;
              }
            }
            const sel = TextSelection.near(view.state.doc.resolve(beforePos), -1);
            view.dispatch(view.state.tr.setSelection(sel));
          } catch {
          }
          view.focus();
          return true;
        },
        /**
         * Cmd/Ctrl held → add 'link-hover' class for pointer cursor on links.
         * Also handles fast AllSelection delete + WKWebView end-of-textblock
         * Backspace fix at the highest priority interception point.
         */
        keydown(view, event) {
          if (event.isComposing) return false;
          if (event.key === "Meta" || event.key === "Control") {
            view.dom.classList.add("link-hover");
          }
          if ((event.key === "Backspace" || event.key === "Delete") && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            try {
              ;
              view.domObserver?.flush?.();
            } catch {
            }
            const docSize = view.state.doc.content.size;
            let isAllSelected = false;
            const sel = view.state.selection;
            if (sel instanceof AllSelection || docSize > 0 && sel.from <= 1 && sel.to >= docSize - 1) {
              isAllSelected = true;
            }
            if (!isAllSelected && docSize > 0) {
              try {
                const domSel = window.getSelection();
                if (domSel && !domSel.isCollapsed && domSel.rangeCount > 0) {
                  const range = domSel.getRangeAt(0);
                  const editorRange = document.createRange();
                  editorRange.selectNodeContents(view.dom);
                  if (range.compareBoundaryPoints(Range.START_TO_START, editorRange) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, editorRange) >= 0) {
                    isAllSelected = true;
                  }
                }
              } catch {
              }
            }
            if (!isAllSelected && docSize > 0) {
              try {
                const domSel = window.getSelection();
                if (domSel && !domSel.isCollapsed) {
                  const selectedText = domSel.toString();
                  const fullText = view.dom.textContent || "";
                  if (selectedText.length > 0 && fullText.length > 0 && selectedText.length >= fullText.length * 0.9) {
                    isAllSelected = true;
                  }
                }
              } catch {
              }
            }
            if (isAllSelected) {
              event.preventDefault();
              const paragraphType = view.state.schema.nodes.paragraph;
              if (!paragraphType) return false;
              const emptyParagraph = paragraphType.create();
              const tr = view.state.tr.replaceWith(0, docSize, emptyParagraph);
              tr.setSelection(TextSelection.create(tr.doc, 1));
              tr.setMeta("full-delete", true);
              view.dispatch(tr);
              return true;
            }
            if (event.key === "Backspace") {
              if (sel instanceof TextSelection && sel.empty && sel.$cursor) {
                const { parent, parentOffset } = sel.$cursor;
                if (parent.isTextblock && parentOffset === parent.content.size && parentOffset > 0) {
                  const nb = sel.$cursor.nodeBefore;
                  if (nb) {
                    event.preventDefault();
                    if (nb.isText && nb.text) {
                      const code2 = nb.text.charCodeAt(nb.text.length - 1);
                      const delLen = code2 >= 56320 && code2 <= 57343 ? 2 : 1;
                      view.dispatch(view.state.tr.delete(sel.from - delLen, sel.from).scrollIntoView());
                    } else {
                      view.dispatch(view.state.tr.delete(sel.from - nb.nodeSize, sel.from).scrollIntoView());
                    }
                    return true;
                  }
                }
              }
            }
          }
          return false;
        },
        keyup(view, event) {
          if (event.key === "Meta" || event.key === "Control") {
            view.dom.classList.remove("link-hover");
          }
          return false;
        }
      },
      /**
       * Click below content: append a paragraph and place cursor there when
       * the last node is a code_block / table / etc. and user clicks below it.
       */
      handleClick(view, _pos, event) {
        if (event.button !== 0) return false;
        const { doc: doc2 } = view.state;
        const lastNode = doc2.lastChild;
        if (!lastNode || lastNode.type.name === "paragraph") return false;
        const lastNodePos = doc2.content.size - lastNode.nodeSize;
        const lastDOM = view.nodeDOM(lastNodePos);
        if (!lastDOM) return false;
        const rect = lastDOM.getBoundingClientRect();
        if (event.clientY <= rect.bottom) return false;
        const paragraphType = view.state.schema.nodes.paragraph;
        if (!paragraphType) return false;
        const endPos = doc2.content.size;
        const paragraph2 = paragraphType.create();
        const tr = view.state.tr.insert(endPos, paragraph2);
        tr.setSelection(TextSelection.create(tr.doc, endPos + 1));
        view.dispatch(tr);
        view.focus();
        return true;
      },
      /**
       * Image click: prevent NodeSelection blue highlight, place TextSelection
       * after the image instead. (math_block is handled in mousedown above.)
       */
      handleClickOn(view, _pos, node, nodePos, event) {
        if (node.type.name !== "image") return false;
        if (event.button !== 0) return false;
        const $pos = view.state.doc.resolve(nodePos + node.nodeSize);
        const sel = TextSelection.near($pos);
        view.dispatch(view.state.tr.setSelection(sel));
        return true;
      },
      /**
       * Keyboard shortcuts (after keymap plugins):
       *  - ArrowRight: escape formatting mark boundary
       *  - Backspace/Delete on AllSelection: fast full-doc deletion
       */
      handleKeyDown(view, event) {
        if (event.isComposing) return false;
        if (event.key === "ArrowRight" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
          const sel = view.state.selection;
          if (sel.empty && sel instanceof TextSelection && sel.$cursor) {
            const $cursor = sel.$cursor;
            const ZWSP_MARK_NAMES = ["code", "strong", "em", "strike_through"];
            const nodeBefore = $cursor.nodeBefore;
            const nodeAfter = $cursor.nodeAfter;
            const hasTargetMarkBefore = nodeBefore != null && ZWSP_MARK_NAMES.some((name) => {
              const mt = view.state.schema.marks[name];
              return mt && nodeBefore.marks.some((m) => m.type === mt);
            });
            if (hasTargetMarkBefore && nodeAfter?.isText && nodeAfter.text?.startsWith("\u200B")) {
              const nextPos = $cursor.pos + nodeAfter.nodeSize;
              const $next = view.state.doc.resolve(Math.min(nextPos, view.state.doc.content.size));
              const nextSel = TextSelection.near($next, 1);
              const tr = view.state.tr.setSelection(nextSel);
              tr.setStoredMarks([]);
              tr.setMeta("code-escape", true);
              tr.scrollIntoView();
              view.dispatch(tr);
              return true;
            }
          }
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          const sel = view.state.selection;
          const docSize = view.state.doc.content.size;
          const isAllSelected = sel instanceof AllSelection || docSize > 0 && sel.from <= 1 && sel.to >= docSize - 1;
          if (isAllSelected) {
            event.preventDefault();
            const paragraphType = view.state.schema.nodes.paragraph;
            if (!paragraphType) return false;
            const emptyParagraph = paragraphType.create();
            const tr = view.state.tr.replaceWith(0, docSize, emptyParagraph);
            tr.setSelection(TextSelection.create(tr.doc, 1));
            tr.setMeta("full-delete", true);
            view.dispatch(tr);
            return true;
          }
        }
        return false;
      },
      /**
       * WKWebView caret fix: add 'caret-empty-para' decoration to empty
       * paragraph under cursor on macOS.
       */
      decorations(state) {
        if (!isMacOS) return DecorationSet.empty;
        const { selection } = state;
        if (!selection.empty) return DecorationSet.empty;
        const { $from } = selection;
        const parent = $from.parent;
        if (parent.type.name === "paragraph" && parent.content.size === 0) {
          const pos = $from.before();
          return DecorationSet.create(state.doc, [
            Decoration.node(pos, pos + parent.nodeSize, { class: "caret-empty-para" })
          ]);
        }
        return DecorationSet.empty;
      }
    },
    /**
     * Scroll-after-paste + empty-doc focus recovery.
     */
    view(editorView) {
      function onPaste() {
        pendingPaste = true;
      }
      editorView.dom.addEventListener("paste", onPaste, true);
      function onBlur() {
        editorView.dom.classList.remove("link-hover");
      }
      window.addEventListener("blur", onBlur);
      return {
        update(view, prevState) {
          if (isMacOS && view.state.doc !== prevState.doc) {
            const docSize = view.state.doc.content.size;
            const prevDocSize = prevState.doc.content.size;
            if (docSize <= 4 && prevDocSize > 4) {
              requestAnimationFrame(() => {
                try {
                  if (!view.hasFocus()) view.focus();
                } catch {
                }
              });
            }
          }
          if (!pendingPaste || view.state.doc.eq(prevState.doc)) return;
          pendingPaste = false;
          requestAnimationFrame(() => {
            try {
              const { from } = view.state.selection;
              const coords = view.coordsAtPos(from);
              const wrapper = view.dom.closest(".editor-wrapper");
              if (!wrapper) return;
              const rect = wrapper.getBoundingClientRect();
              if (coords.top < rect.top || coords.bottom > rect.bottom) {
                wrapper.scrollTop += coords.top - rect.top - rect.height / 2;
              }
            } catch {
            }
          });
        },
        destroy() {
          editorView.dom.removeEventListener("paste", onPaste, true);
          window.removeEventListener("blur", onBlur);
          editorView.dom.classList.remove("link-hover");
        }
      };
    }
  });
}
export {
  createEditorPropsPlugin
};
//# sourceMappingURL=editor-props-plugin.js.map