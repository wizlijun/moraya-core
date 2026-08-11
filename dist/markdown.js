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

// node_modules/.pnpm/markdown-it-footnote@4.0.0/node_modules/markdown-it-footnote/index.mjs
function render_footnote_anchor_name(tokens, idx, options, env) {
  const n = Number(tokens[idx].meta.id + 1).toString();
  let prefix = "";
  if (typeof env.docId === "string") prefix = `-${env.docId}-`;
  return prefix + n;
}
function render_footnote_caption(tokens, idx) {
  let n = Number(tokens[idx].meta.id + 1).toString();
  if (tokens[idx].meta.subId > 0) n += `:${tokens[idx].meta.subId}`;
  return `[${n}]`;
}
function render_footnote_ref(tokens, idx, options, env, slf) {
  const id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
  const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf);
  let refid = id;
  if (tokens[idx].meta.subId > 0) refid += `:${tokens[idx].meta.subId}`;
  return `<sup class="footnote-ref"><a href="#fn${id}" id="fnref${refid}">${caption}</a></sup>`;
}
function render_footnote_block_open(tokens, idx, options) {
  return (options.xhtmlOut ? '<hr class="footnotes-sep" />\n' : '<hr class="footnotes-sep">\n') + '<section class="footnotes">\n<ol class="footnotes-list">\n';
}
function render_footnote_block_close() {
  return "</ol>\n</section>\n";
}
function render_footnote_open(tokens, idx, options, env, slf) {
  let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
  if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
  return `<li id="fn${id}" class="footnote-item">`;
}
function render_footnote_close() {
  return "</li>\n";
}
function render_footnote_anchor(tokens, idx, options, env, slf) {
  let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
  if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
  return ` <a href="#fnref${id}" class="footnote-backref">\u21A9\uFE0E</a>`;
}
function footnote_plugin(md2) {
  const parseLinkLabel = md2.helpers.parseLinkLabel;
  const isSpace = md2.utils.isSpace;
  md2.renderer.rules.footnote_ref = render_footnote_ref;
  md2.renderer.rules.footnote_block_open = render_footnote_block_open;
  md2.renderer.rules.footnote_block_close = render_footnote_block_close;
  md2.renderer.rules.footnote_open = render_footnote_open;
  md2.renderer.rules.footnote_close = render_footnote_close;
  md2.renderer.rules.footnote_anchor = render_footnote_anchor;
  md2.renderer.rules.footnote_caption = render_footnote_caption;
  md2.renderer.rules.footnote_anchor_name = render_footnote_anchor_name;
  function footnote_def(state, startLine, endLine, silent) {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (start + 4 > max) return false;
    if (state.src.charCodeAt(start) !== 91) return false;
    if (state.src.charCodeAt(start + 1) !== 94) return false;
    let pos;
    for (pos = start + 2; pos < max; pos++) {
      if (state.src.charCodeAt(pos) === 32) return false;
      if (state.src.charCodeAt(pos) === 93) {
        break;
      }
    }
    if (pos === start + 2) return false;
    if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 58) return false;
    if (silent) return true;
    pos++;
    if (!state.env.footnotes) state.env.footnotes = {};
    if (!state.env.footnotes.refs) state.env.footnotes.refs = {};
    const label = state.src.slice(start + 2, pos - 2);
    state.env.footnotes.refs[`:${label}`] = -1;
    const token_fref_o = new state.Token("footnote_reference_open", "", 1);
    token_fref_o.meta = { label };
    token_fref_o.level = state.level++;
    state.tokens.push(token_fref_o);
    const oldBMark = state.bMarks[startLine];
    const oldTShift = state.tShift[startLine];
    const oldSCount = state.sCount[startLine];
    const oldParentType = state.parentType;
    const posAfterColon = pos;
    const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
    let offset = initial;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (isSpace(ch)) {
        if (ch === 9) {
          offset += 4 - offset % 4;
        } else {
          offset++;
        }
      } else {
        break;
      }
      pos++;
    }
    state.tShift[startLine] = pos - posAfterColon;
    state.sCount[startLine] = offset - initial;
    state.bMarks[startLine] = posAfterColon;
    state.blkIndent += 4;
    state.parentType = "footnote";
    if (state.sCount[startLine] < state.blkIndent) {
      state.sCount[startLine] += state.blkIndent;
    }
    state.md.block.tokenize(state, startLine, endLine, true);
    state.parentType = oldParentType;
    state.blkIndent -= 4;
    state.tShift[startLine] = oldTShift;
    state.sCount[startLine] = oldSCount;
    state.bMarks[startLine] = oldBMark;
    const token_fref_c = new state.Token("footnote_reference_close", "", -1);
    token_fref_c.level = --state.level;
    state.tokens.push(token_fref_c);
    return true;
  }
  function footnote_inline(state, silent) {
    const max = state.posMax;
    const start = state.pos;
    if (start + 2 >= max) return false;
    if (state.src.charCodeAt(start) !== 94) return false;
    if (state.src.charCodeAt(start + 1) !== 91) return false;
    const labelStart = start + 2;
    const labelEnd = parseLinkLabel(state, start + 1);
    if (labelEnd < 0) return false;
    if (!silent) {
      if (!state.env.footnotes) state.env.footnotes = {};
      if (!state.env.footnotes.list) state.env.footnotes.list = [];
      const footnoteId = state.env.footnotes.list.length;
      const tokens = [];
      state.md.inline.parse(
        state.src.slice(labelStart, labelEnd),
        state.md,
        state.env,
        tokens
      );
      const token = state.push("footnote_ref", "", 0);
      token.meta = { id: footnoteId };
      state.env.footnotes.list[footnoteId] = {
        content: state.src.slice(labelStart, labelEnd),
        tokens
      };
    }
    state.pos = labelEnd + 1;
    state.posMax = max;
    return true;
  }
  function footnote_ref2(state, silent) {
    const max = state.posMax;
    const start = state.pos;
    if (start + 3 > max) return false;
    if (!state.env.footnotes || !state.env.footnotes.refs) return false;
    if (state.src.charCodeAt(start) !== 91) return false;
    if (state.src.charCodeAt(start + 1) !== 94) return false;
    let pos;
    for (pos = start + 2; pos < max; pos++) {
      if (state.src.charCodeAt(pos) === 32) return false;
      if (state.src.charCodeAt(pos) === 10) return false;
      if (state.src.charCodeAt(pos) === 93) {
        break;
      }
    }
    if (pos === start + 2) return false;
    if (pos >= max) return false;
    pos++;
    const label = state.src.slice(start + 2, pos - 1);
    if (typeof state.env.footnotes.refs[`:${label}`] === "undefined") return false;
    if (!silent) {
      if (!state.env.footnotes.list) state.env.footnotes.list = [];
      let footnoteId;
      if (state.env.footnotes.refs[`:${label}`] < 0) {
        footnoteId = state.env.footnotes.list.length;
        state.env.footnotes.list[footnoteId] = { label, count: 0 };
        state.env.footnotes.refs[`:${label}`] = footnoteId;
      } else {
        footnoteId = state.env.footnotes.refs[`:${label}`];
      }
      const footnoteSubId = state.env.footnotes.list[footnoteId].count;
      state.env.footnotes.list[footnoteId].count++;
      const token = state.push("footnote_ref", "", 0);
      token.meta = { id: footnoteId, subId: footnoteSubId, label };
    }
    state.pos = pos;
    state.posMax = max;
    return true;
  }
  function footnote_tail(state) {
    let tokens;
    let current;
    let currentLabel;
    let insideRef = false;
    const refTokens = {};
    if (!state.env.footnotes) {
      return;
    }
    state.tokens = state.tokens.filter(function(tok) {
      if (tok.type === "footnote_reference_open") {
        insideRef = true;
        current = [];
        currentLabel = tok.meta.label;
        return false;
      }
      if (tok.type === "footnote_reference_close") {
        insideRef = false;
        refTokens[":" + currentLabel] = current;
        return false;
      }
      if (insideRef) {
        current.push(tok);
      }
      return !insideRef;
    });
    if (!state.env.footnotes.list) {
      return;
    }
    const list = state.env.footnotes.list;
    state.tokens.push(new state.Token("footnote_block_open", "", 1));
    for (let i = 0, l = list.length; i < l; i++) {
      const token_fo = new state.Token("footnote_open", "", 1);
      token_fo.meta = { id: i, label: list[i].label };
      state.tokens.push(token_fo);
      if (list[i].tokens) {
        tokens = [];
        const token_po = new state.Token("paragraph_open", "p", 1);
        token_po.block = true;
        tokens.push(token_po);
        const token_i = new state.Token("inline", "", 0);
        token_i.children = list[i].tokens;
        token_i.content = list[i].content;
        tokens.push(token_i);
        const token_pc = new state.Token("paragraph_close", "p", -1);
        token_pc.block = true;
        tokens.push(token_pc);
      } else if (list[i].label) {
        tokens = refTokens[`:${list[i].label}`];
      }
      if (tokens) state.tokens = state.tokens.concat(tokens);
      let lastParagraph;
      if (state.tokens[state.tokens.length - 1].type === "paragraph_close") {
        lastParagraph = state.tokens.pop();
      } else {
        lastParagraph = null;
      }
      const t = list[i].count > 0 ? list[i].count : 1;
      for (let j = 0; j < t; j++) {
        const token_a = new state.Token("footnote_anchor", "", 0);
        token_a.meta = { id: i, subId: j, label: list[i].label };
        state.tokens.push(token_a);
      }
      if (lastParagraph) {
        state.tokens.push(lastParagraph);
      }
      state.tokens.push(new state.Token("footnote_close", "", -1));
    }
    state.tokens.push(new state.Token("footnote_block_close", "", -1));
  }
  md2.block.ruler.before("reference", "footnote_def", footnote_def, { alt: ["paragraph", "reference"] });
  md2.inline.ruler.after("image", "footnote_inline", footnote_inline);
  md2.inline.ruler.after("footnote_inline", "footnote_ref", footnote_ref2);
  md2.core.ruler.after("inline", "footnote_tail", footnote_tail);
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

// src/markdown.ts
var md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false
}).enable(["table", "strikethrough"]).use(deflistPlugin).use(texmathPlugin).use(ins_plugin).use(footnote_plugin);
md.core.ruler.disable("footnote_tail");
md.inline.ruler.disable("footnote_inline");
md.inline.ruler.after("footnote_ref", "footnote_ref_orphan", (state, silent) => {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 91) return false;
  if (src.charCodeAt(start + 1) !== 94) return false;
  let pos = start + 2;
  for (; pos < state.posMax; pos++) {
    const ch = src.charCodeAt(pos);
    if (ch === 32 || ch === 10) return false;
    if (ch === 93) break;
  }
  if (pos === start + 2) return false;
  if (pos >= state.posMax) return false;
  if (!silent) {
    const tok = state.push("footnote_ref", "", 0);
    tok.meta = { label: src.slice(start + 2, pos) };
  }
  state.pos = pos + 1;
  return true;
});
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
    const oldPos = state.pos;
    const oldMax = state.posMax;
    state.pos = contentStart;
    state.posMax = closeIdx;
    state.md.inline.tokenize(state);
    state.pos = oldPos;
    state.posMax = oldMax;
    state.push("caret_highlight_close", "mark", -1).markup = "^^";
  }
  state.pos = closeIdx + 2;
  return true;
});
md.inline.ruler.push("critic_annotation", (state, silent) => {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 123) return false;
  if (src.startsWith("{>>", start)) {
    const close = src.indexOf("<<}", start + 3);
    if (close < 0) return false;
    const note2 = src.slice(start + 3, close);
    if (note2.includes("\n")) return false;
    if (!silent) {
      const tok = state.push("critic_note", "", 0);
      tok.meta = { note: note2 };
    }
    state.pos = close + 3;
    return true;
  }
  if (!src.startsWith("{==", start)) return false;
  const hlClose = src.indexOf("==}{>>", start + 3);
  if (hlClose < 0) return false;
  const text2 = src.slice(start + 3, hlClose);
  if (!text2 || text2.includes("\n")) return false;
  const noteStart = hlClose + 6;
  const noteClose = src.indexOf("<<}", noteStart);
  if (noteClose < 0) return false;
  const note = src.slice(noteStart, noteClose);
  if (note.includes("\n")) return false;
  if (!silent) {
    const open = state.push("critic_anno_open", "span", 1);
    open.meta = { note };
    const oldPos = state.pos;
    const oldMax = state.posMax;
    state.pos = start + 3;
    state.posMax = hlClose;
    state.md.inline.tokenize(state);
    state.pos = oldPos;
    state.posMax = oldMax;
    state.push("critic_anno_close", "span", -1);
  }
  state.pos = noteClose + 3;
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
function fixFootnoteDefMaps(tokens) {
  let prevDefEnd = -1;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (!open || open.type !== "footnote_reference_open") continue;
    let start = Infinity;
    let end = -Infinity;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (!t) continue;
      if (t.type === "footnote_reference_close") break;
      if (!t.map) continue;
      start = Math.min(start, t.map[0]);
      end = Math.max(end, t.map[1]);
    }
    if (start === Infinity || end === -Infinity) continue;
    open.map = [start, end];
    const meta = { ...open.meta ?? {} };
    meta.tight = start === prevDefEnd;
    open.meta = meta;
    prevDefEnd = end;
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
md.block.ruler.before(
  "table",
  "front_matter",
  (state, startLine, endLine, silent) => {
    if (startLine !== 0 || state.blkIndent !== 0 || state.tShift[startLine] !== 0) return false;
    const openStart = state.bMarks[startLine];
    const openMax = state.eMarks[startLine];
    if (state.src.slice(openStart, openMax) !== "---") return false;
    let nextLine = startLine;
    let closed = false;
    for (; ; ) {
      nextLine++;
      if (nextLine >= endLine) break;
      const lineStart = state.bMarks[nextLine];
      const lineMax = state.eMarks[nextLine];
      if (state.src.slice(lineStart, lineMax) === "---") {
        closed = true;
        break;
      }
    }
    if (!closed) return false;
    if (silent) return true;
    const contentStart = state.bMarks[startLine + 1];
    const contentEnd = state.bMarks[nextLine];
    const token = state.push("front_matter", "", 0);
    token.markup = "---";
    token.block = true;
    token.map = [startLine, nextLine + 1];
    token.content = state.src.slice(contentStart, contentEnd);
    state.line = nextLine + 1;
    return true;
  },
  { alt: [] }
);
var _origMdParse = md.parse.bind(md);
md.parse = function(src, env) {
  let tokens = _origMdParse(src, env);
  tagPairedHtmlInline(tokens);
  fixFootnoteDefMaps(tokens);
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
  front_matter: {
    block: "frontmatter",
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
  mark: { mark: "highlight", attrs: { delimiter: "equals" } },
  caret_highlight: { mark: "highlight", attrs: { delimiter: "caret" } },
  critic_anno: {
    mark: "annotation",
    getAttrs: (tok) => ({ note: tok.meta?.note ?? "" })
  },
  critic_note: {
    node: "note_anchor",
    getAttrs: (tok) => ({ note: tok.meta?.note ?? "" })
  },
  // ── Footnote tokens ──
  // markdown-it-footnote 的引用 token(以及我们的兜底规则)都叫 footnote_ref。
  footnote_ref: {
    node: "footnote_ref",
    getAttrs: (tok) => ({ label: tok.meta?.label ?? "" })
  },
  // 定义的 token 名是 footnote_reference_open/close —— markdown-it-footnote 的
  // 既定命名,不是 footnote_definition_*。`block:` 规格自动配对 open/close。
  footnote_reference: {
    block: "footnote_definition",
    getAttrs: (tok) => {
      const meta = tok.meta;
      return { label: meta?.label ?? "", tight: meta?.tight === true };
    }
  }
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
    const defaultFence = h["fence"];
    h["fence"] = (state, tok, tokens, i) => {
      const lang = tok.info.trim().toLowerCase();
      if (lang === "csv" && schemaArg.nodes.spreadsheet) {
        state.addNode(schemaArg.nodes.spreadsheet, { source: tok.content.trim() });
        return;
      }
      defaultFence(state, tok, tokens, i);
    };
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
    spreadsheet(state, node) {
      state.write("```csv\n");
      const src = node.attrs.source;
      if (src) state.text(src, false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    frontmatter(state, node) {
      state.write("---\n");
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("---");
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
    note_anchor(state, node) {
      state.write(`{>>${sanitizeNote(node.attrs.note)}<<}`);
    },
    footnote_ref(state, node) {
      state.write(`[^${node.attrs.label}]`);
    },
    footnote_definition(state, node) {
      if (node.attrs.tight) state.flushClose(1);
      state.write(`[^${node.attrs.label}]: `);
      state.wrapBlock("    ", "", node, () => state.renderContent(node));
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
      open(_state, mark) {
        return mark.attrs.delimiter === "equals" ? "==" : "^^";
      },
      close(_state, mark) {
        return mark.attrs.delimiter === "equals" ? "==" : "^^";
      },
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
    },
    annotation: {
      open: "{==",
      close(_state, mark) {
        return `==}{>>${sanitizeNote(mark.attrs.note)}<<}`;
      },
      // mixable so inner marks (**bold** etc.) don't split the annotation
      // into multiple {==…==}{>>…<<} fragments.
      mixable: true,
      expelEnclosingWhitespace: true
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
function sanitizeNote(s) {
  return s.replace(/\r?\n/g, " ").replace(/<<\}/g, "< <}");
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
var ASYNC_PARSE_THRESHOLD = 5e4;
function parseMarkdownAsync(markdown, schemaArg) {
  const p = getParserFor(schemaArg);
  const normalized = normalizeSmartQuotes(normalizeMathBlocks(markdown));
  if (normalized.length < ASYNC_PARSE_THRESHOLD) {
    return Promise.resolve(parseMarkdown(normalized, schemaArg));
  }
  return new Promise((resolve) => setTimeout(() => {
    try {
      resolve(p.parse(normalized));
    } catch {
      resolve(p.schema.topNodeType.createAndFill());
    }
  }, 0));
}
var ESCAPE_RELAX_GROUPS = [
  /\\([[\]])/g,
  /\\(\*)/g,
  /\\([`~_])/g,
  /\\(#)/g,
  /\\([-+>.])/g
];
var HAS_RELAXABLE_ESCAPE = /\\[`*#~_[\]\-+>.]/;
function relaxEscapes(md2, doc2) {
  if (!HAS_RELAXABLE_ESCAPE.test(md2)) return md2;
  let reference;
  try {
    reference = JSON.stringify(doc2.toJSON());
  } catch {
    return md2;
  }
  let current = md2;
  for (const re of ESCAPE_RELAX_GROUPS) {
    const candidate = current.replace(re, "$1");
    if (candidate === current) continue;
    try {
      if (JSON.stringify(parseMarkdown(candidate).toJSON()) === reference) current = candidate;
    } catch {
    }
  }
  return current;
}
function serializeMarkdown(doc2) {
  let result = serializer.serialize(doc2, { tightLists: true });
  result = relaxEscapes(result, doc2);
  result = result.replace(/​/g, "");
  return result;
}
export {
  parseMarkdown,
  parseMarkdownAsync,
  serializeMarkdown
};
//# sourceMappingURL=markdown.js.map