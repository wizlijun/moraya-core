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

// src/source-projection.ts
function projectLineEndings(source) {
  const chunks = [];
  const changes = [];
  let start = 0;
  let view = 0;
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) !== 13) continue;
    chunks.push(source.slice(start, i));
    view += i - start;
    const end = i + (source.charCodeAt(i + 1) === 10 ? 2 : 1);
    changes.push({ sourceFrom: i, sourceTo: end, viewFrom: view, viewTo: view + 1 });
    chunks.push("\n");
    view++;
    i = end - 1;
    start = end;
  }
  chunks.push(source.slice(start));
  return { text: chunks.join(""), sourceLength: source.length, changes };
}

// src/source-trace.ts
function identityTrace(text2) {
  return { text: text2, pieces: text2.length ? [{ from: 0, to: text2.length, sourceFrom: 0, sourceTo: text2.length, kind: "copy" }] : [] };
}
function firstPiece(t, from) {
  let lo = 0, hi = t.pieces.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (t.pieces[mid].to <= from) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function slicePieces(t, from, to, start) {
  const pieces = [];
  for (let i = start; i < t.pieces.length; i++) {
    const p = t.pieces[i];
    if (p.from >= to) break;
    const a = Math.max(from, p.from), b = Math.min(to, p.to);
    if (a >= b) continue;
    const whole = a === p.from && b === p.to;
    pieces.push({
      from: a - from,
      to: b - from,
      sourceFrom: p.kind === "copy" ? p.sourceFrom + a - p.from : p.sourceFrom,
      sourceTo: p.kind === "copy" ? p.sourceFrom + b - p.from : p.sourceTo,
      kind: p.kind === "atomic" && !whole ? "generated" : p.kind
    });
  }
  return pieces;
}
function sliceTrace(t, from, to) {
  return { text: t.text.slice(from, to), pieces: slicePieces(t, from, to, firstPiece(t, from)) };
}
function editTrace(t, edits) {
  let at = 0, length = 0, pieceIndex = 0, anchorIndex = 0;
  const chunks = [], pieces = [];
  const slice = (from, to) => {
    while (pieceIndex < t.pieces.length && t.pieces[pieceIndex].to <= from) pieceIndex++;
    return { text: t.text.slice(from, to), pieces: slicePieces(t, from, to, pieceIndex) };
  };
  const append = (part) => {
    for (const p of part.pieces) pieces.push({ ...p, from: p.from + length, to: p.to + length });
    chunks.push(part.text);
    length += part.text.length;
  };
  for (const e of edits) {
    if (e.from < at || e.to < e.from || e.to > t.text.length) throw new RangeError("trace edit");
    append(slice(at, e.from));
    if (e.text) {
      const old = slice(e.from, e.to).pieces;
      while (anchorIndex < t.pieces.length && t.pieces[anchorIndex].to < e.from) anchorIndex++;
      const candidate = t.pieces[anchorIndex];
      const anchor = candidate && candidate.from <= e.from ? candidate : void 0;
      const raw = anchor ? anchor.kind === "copy" ? anchor.sourceFrom + e.from - anchor.from : anchor.sourceFrom : 0;
      const contiguous = old.length > 0 && old.every((p, i) => p.kind !== "generated" && (!i || old[i - 1].sourceTo === p.sourceFrom));
      append({ text: e.text, pieces: [{
        from: 0,
        to: e.text.length,
        sourceFrom: contiguous ? old[0].sourceFrom : raw,
        sourceTo: contiguous ? old[old.length - 1].sourceTo : raw,
        kind: contiguous ? "atomic" : "generated"
      }] });
    }
    at = e.to;
  }
  append(slice(at, t.text.length));
  return { text: chunks.join(""), pieces };
}

// src/source-ownership.ts
var UnsupportedOwnership = class extends Error {
};
function rawRange(trace, from, to) {
  const view = sliceTrace(trace, from, to);
  for (const offset of [from, to]) {
    const piece = trace.pieces[firstPiece(trace, offset)];
    if (piece?.kind === "atomic" && offset > piece.from && offset < piece.to) {
      throw new UnsupportedOwnership();
    }
  }
  const real = view.pieces.filter((p) => p.kind !== "generated");
  if (!real.length) return void 0;
  if (real.some((p, i) => i > 0 && real[i - 1].sourceTo !== p.sourceFrom)) throw new UnsupportedOwnership();
  return { from: real[0].sourceFrom, to: real[real.length - 1].sourceTo };
}
function lineStarts(text2) {
  const result = [0];
  for (let i = 0; i < text2.length; i++) if (text2[i] === "\n") result.push(i + 1);
  if (result[result.length - 1] !== text2.length) result.push(text2.length);
  return result;
}
function rendererTailStart(text2, from, to, tokenType) {
  if (to <= from || text2[to - 1] !== "\n") return to;
  if (["fence", "code_block", "front_matter", "html_block", "math_block", "math_block_eqno"].includes(tokenType)) return to - 1;
  const flow = /* @__PURE__ */ new Set([
    "paragraph_open",
    "heading_open",
    "bullet_list_open",
    "ordered_list_open",
    "blockquote_open",
    "table_open",
    "footnote_reference_open",
    "dl_open",
    "hr"
  ]);
  if (!flow.has(tokenType)) throw new UnsupportedOwnership();
  let end = to;
  while (end > from) {
    const start = Math.max(from, text2.lastIndexOf("\n", end - 2) + 1);
    const content = text2.slice(start, end - 1);
    if (/^[ \t]*$/.test(content)) {
      end = start;
      continue;
    }
    return end - 1;
  }
  return from;
}

// src/markdown.ts
var md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false
}).enable(["table", "strikethrough"]).use(deflistPlugin).use(texmathPlugin).use(ins_plugin).use(footnote_plugin);
md.core.ruler.disable("footnote_tail");
md.inline.ruler.disable("footnote_inline");
function decodeMultibytePercentSequences(value) {
  return value.replace(
    /%[C-F][0-9A-F](?:%[89AB][0-9A-F])+/gi,
    (match) => {
      try {
        return decodeURIComponent(match);
      } catch {
        return match;
      }
    }
  );
}
function restoreLocalWindowsSeparators(value) {
  const hasUriScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
  const isWindowsDrivePath = /^[A-Za-z]:%5C/i.test(value);
  return hasUriScheme && !isWindowsDrivePath ? value : value.replace(/%5C/gi, "\\");
}
function serializeImageDestination(src) {
  const normalized = decodeMultibytePercentSequences(md.normalizeLink(src));
  return /[%\s()<>]/.test(normalized) ? `<${normalized}>` : normalized;
}
function serializeImageTitle(title) {
  return title.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
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
function preserveBlankLines(tokens, capture = false) {
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
          const open = mkToken("paragraph_open", "p", 1);
          if (capture) syntheticTokens.add(open);
          result.push(
            open,
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
var captureKey = /* @__PURE__ */ Symbol("document source capture");
var owners = /* @__PURE__ */ new WeakMap();
var tokenArrays = /* @__PURE__ */ new WeakMap();
var inlineStateOwners = /* @__PURE__ */ new WeakMap();
var tokenSources = /* @__PURE__ */ new WeakMap();
var pendingSources = /* @__PURE__ */ new WeakMap();
var captureAvailable = true;
function wrapCaptureRule(ruler, name, wrapper) {
  const original = ruler.__rules__?.find((rule) => rule.name === name)?.fn;
  if (typeof original !== "function") {
    captureAvailable = false;
    return;
  }
  ruler.at(name, (...args) => wrapper(original, ...args));
}
var collectorFor = (state) => state.env?.[captureKey];
var inlineEngine = md.inline;
var OriginalInlineState = inlineEngine.State;
if (typeof OriginalInlineState !== "function") captureAvailable = false;
inlineEngine.State = function(...args) {
  const state = new OriginalInlineState(...args);
  const collector = collectorFor(state);
  const owner = owners.get(args[3]);
  if (collector && owner) {
    if (state.src !== owner.text || state.tokens !== args[3] || typeof state.pending !== "string" || typeof state.pushPending !== "function") throw new UnsupportedSourceCapture();
    inlineStateOwners.set(state, owner);
    pendingSources.set(state, []);
    const pushPending = state.pushPending.bind(state);
    state.pushPending = () => {
      const token = pushPending();
      tokenSources.set(token, { collector, runs: pendingSources.get(state) });
      pendingSources.set(state, []);
      return token;
    };
  }
  return state;
};
wrapCaptureRule(md.core.ruler, "normalize", (original, state) => {
  const collector = collectorFor(state);
  if (!collector) return original(state);
  if (state.src !== collector.trace.text) throw new UnsupportedSourceCapture();
  const projection = projectLineEndings(state.src);
  collector.trace = editTrace(collector.trace, projection.changes.map((c) => ({
    from: c.sourceFrom,
    to: c.sourceTo,
    text: "\n"
  })));
  const nulEdits = [];
  for (let i = 0; i < collector.trace.text.length; i++) {
    if (collector.trace.text[i] === "\0") nulEdits.push({ from: i, to: i + 1, text: "\uFFFD" });
  }
  collector.trace = editTrace(collector.trace, nulEdits);
  const result = original(state);
  if (state.src !== collector.trace.text) throw new UnsupportedSourceCapture();
  return result;
});
wrapCaptureRule(md.block.ruler, "paragraph", (original, state, ...args) => {
  const collector = collectorFor(state);
  if (!collector || state.level !== 0 || state.blkIndent !== 0) return original(state, ...args);
  const originalGetLines = state.getLines;
  if (typeof originalGetLines !== "function" || !Array.isArray(state.bMarks) || !Array.isArray(state.eMarks)) throw new UnsupportedSourceCapture();
  const start = state.tokens.length;
  let capturedLines;
  state.getLines = function(begin, end, indent, keepLastLF) {
    const value = originalGetLines.call(this, begin, end, indent, keepLastLF);
    if (indent !== 0) return value;
    const from = this.bMarks[begin];
    const to = keepLastLF ? Math.min(this.src.length, this.eMarks[end - 1] + 1) : this.eMarks[end - 1];
    const part = sliceTrace(collector.trace, from, to);
    if (part.text !== value) throw new UnsupportedSourceCapture();
    const left = value.length - value.trimStart().length;
    capturedLines = sliceTrace(part, left, left + value.trim().length);
    return value;
  };
  let result;
  try {
    result = original(state, ...args);
  } finally {
    state.getLines = originalGetLines;
  }
  if (result) for (const token of state.tokens.slice(start)) {
    if (token.type !== "inline" || token.level !== 1) continue;
    if (!capturedLines || capturedLines.text !== token.content || !Array.isArray(token.children)) {
      throw new UnsupportedSourceCapture();
    }
    owners.set(token.children, capturedLines);
    tokenArrays.set(token, token.children);
  }
  return result;
});
wrapCaptureRule(md.core.ruler, "inline", (original, state) => {
  if (!collectorFor(state)) return original(state);
  const mapped = state.tokens.filter((token) => tokenArrays.has(token));
  const check = () => {
    for (const token of mapped) {
      if (!Array.isArray(token.children) || token.children !== tokenArrays.get(token)) throw new UnsupportedSourceCapture();
    }
  };
  check();
  const result = original(state);
  check();
  return result;
});
wrapCaptureRule(md.inline.ruler, "newline", (original, state, silent) => {
  if (silent || !inlineStateOwners.has(state) || state.src[state.pos] !== "\n") return original(state, silent);
  let end = state.pending.length;
  while (end > 0 && state.pending[end - 1] === " ") end--;
  const expected = state.pending.slice(0, end);
  let trim = state.pending.length - end;
  const runs = pendingSources.get(state);
  while (trim > 0 && runs.length) {
    const run = runs.pop();
    if (run.text.length <= trim) {
      trim -= run.text.length;
      continue;
    }
    const keep = run.text.length - trim;
    runs.push(run.trace && run.kind === "linear" ? { text: run.text.slice(0, keep), kind: "linear", trace: sliceTrace(run.trace, 0, keep) } : { text: run.text.slice(0, keep) });
    trim = 0;
  }
  if (trim || runs.map((run) => run.text).join("") !== expected) throw new UnsupportedSourceCapture();
  const start = state.tokens.length;
  const result = original(state, silent);
  if (!result || state.pending !== "" || expected && (state.tokens[start]?.type !== "text" || state.tokens[start].content !== expected)) throw new UnsupportedSourceCapture();
  return result;
});
wrapCaptureRule(md.inline.ruler, "backticks", (original, state, silent) => {
  const owner = inlineStateOwners.get(state);
  if (silent || !owner || state.src[state.pos] !== "`") return original(state, silent);
  const from = state.pos, pending = state.pending, tokenCount = state.tokens.length;
  if (!Number.isInteger(state.posMax) || state.posMax <= from || state.posMax > state.src.length) {
    throw new UnsupportedSourceCapture();
  }
  let end = from + 1;
  while (end < state.posMax && state.src[end] === "`") end++;
  const marker = state.src.slice(from, end);
  const result = original(state, silent);
  if (!result) throw new UnsupportedSourceCapture();
  if (state.pos === end) {
    if (state.backticksScanned !== true || state.pending !== pending + marker || state.tokens.length !== tokenCount) {
      throw new UnsupportedSourceCapture();
    }
    pendingSources.get(state).push({ text: marker, kind: "linear", trace: sliceTrace(owner, from, end) });
  }
  return result;
});
wrapCaptureRule(md.inline.ruler, "text", (original, state, silent) => {
  const from = state.pos;
  const ok = original(state, silent);
  const owner = inlineStateOwners.get(state);
  if (ok && !silent && owner) {
    pendingSources.get(state).push({ trace: sliceTrace(owner, from, state.pos), text: state.src.slice(from, state.pos), kind: "linear" });
  }
  return ok;
});
for (const name of ["entity", "escape"]) {
  wrapCaptureRule(md.inline.ruler, name, (original, state, silent) => {
    const from = state.pos;
    const ok = original(state, silent);
    const collector = collectorFor(state);
    const owner = inlineStateOwners.get(state);
    if (ok && !silent && collector && owner) {
      const token = state.tokens[state.tokens.length - 1];
      if (token.type === "text_special") tokenSources.set(token, {
        collector,
        runs: [{ trace: sliceTrace(owner, from, state.pos), text: token.content, kind: "atomic" }]
      });
    }
    return ok;
  });
}
wrapCaptureRule(md.inline.ruler, "emphasis", (original, state, silent) => {
  const from = state.pos;
  const ok = original(state, silent);
  const collector = collectorFor(state);
  const owner = inlineStateOwners.get(state);
  if (ok && !silent && collector && owner) {
    const count = state.pos - from;
    state.tokens.slice(-count).forEach((token, i) => tokenSources.set(token, {
      collector,
      runs: [{ trace: sliceTrace(owner, from + i, from + i + 1), text: token.content, kind: "linear" }]
    }));
  }
  return ok;
});
md.inline.ruler.push("source_capture_fallback", (state, silent) => {
  const owner = inlineStateOwners.get(state);
  if (silent || !owner) return false;
  const from = state.pos++;
  const text2 = state.src.slice(from, state.pos);
  state.pending += text2;
  pendingSources.get(state).push({ trace: sliceTrace(owner, from, state.pos), text: text2, kind: "linear" });
  return true;
});
function captureJoin(tokens, collector, special) {
  let runs = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "text" && !(special && token.type === "text_special")) continue;
    if (token.content) for (const run of tokenSources.get(token)?.runs ?? [{ text: token.content }]) runs.push(run);
    const next = tokens[i + 1];
    if (!next || next.type !== "text" && !(special && next.type === "text_special")) {
      tokenSources.set(token, { collector, runs });
      runs = [];
    }
  }
}
wrapCaptureRule(md.inline.ruler2, "fragments_join", (original, state) => {
  const collector = collectorFor(state);
  if (collector && inlineStateOwners.has(state)) captureJoin(state.tokens, collector, false);
  return original(state);
});
wrapCaptureRule(md.core.ruler, "text_join", (original, state) => {
  const collector = collectorFor(state);
  if (collector) for (const token of state.tokens) {
    if (token.type === "inline") captureJoin(token.children, collector, true);
  }
  return original(state);
});
var frameSizes = /* @__PURE__ */ new WeakMap();
function captureCursor(state) {
  if (!Array.isArray(state.stack) || !state.stack.length) throw new UnsupportedSourceCapture();
  let pos = state.stack.length - 1;
  for (const frame of state.stack) {
    if (!Array.isArray(frame.content) || !Array.isArray(frame.marks)) throw new UnsupportedSourceCapture();
    const content = frame.content;
    const previous = frameSizes.get(frame);
    if (previous && (previous.content !== content || content.length < previous.length)) throw new UnsupportedSourceCapture();
    let size = previous ? previous.size - previous.tailSize : 0;
    let tailSize = 0;
    for (let i = previous ? Math.max(0, previous.length - 1) : 0; i < content.length; i++) {
      tailSize = content[i].nodeSize;
      size += tailSize;
    }
    frameSizes.set(frame, { content, length: content.length, size, tailSize });
    pos += size;
  }
  return pos;
}
function captureText(state, token, delegate) {
  const provenance = tokenSources.get(token);
  if (!provenance) {
    delegate();
    return;
  }
  const { collector, runs } = provenance;
  if (runs.map((run) => run.text).join("") !== token.content) throw new UnsupportedSourceCapture();
  let pos = captureCursor(state);
  const supported = state.stack[state.stack.length - 1].marks.every((mark) => ["em", "strong", "link"].includes(mark.type.name));
  for (const run of runs) {
    const a = pos;
    pos += run.text.length;
    if (!supported || !run.trace || !run.text) continue;
    const ps = run.trace.pieces;
    if (run.kind === "linear" && run.trace.text === run.text) {
      for (const p of ps) if (p.kind !== "generated") collector.runs.push({
        sourceFrom: p.sourceFrom,
        sourceTo: p.sourceTo,
        pmFrom: a + p.from,
        pmTo: a + p.to,
        kind: p.kind === "copy" ? "linear" : "atomic"
      });
      continue;
    }
    const contiguous = ps.length > 0 && ps.every((p, i) => p.kind !== "generated" && (!i || ps[i - 1].sourceTo === p.sourceFrom));
    if (!contiguous) continue;
    collector.runs.push({
      sourceFrom: ps[0].sourceFrom,
      sourceTo: ps[ps.length - 1].sourceTo,
      pmFrom: a,
      pmTo: pos,
      kind: "atomic"
    });
  }
  delegate();
  if (captureCursor(state) !== pos) throw new UnsupportedSourceCapture();
}
var syntheticTokens = /* @__PURE__ */ new WeakSet();
var rootStarts = /* @__PURE__ */ new WeakMap();
var rootEnds = /* @__PURE__ */ new WeakMap();
function prepareRootEvents(tokens, collector) {
  const starts = lineStarts(collector.trace.text);
  let natural = 0;
  const renderable = /* @__PURE__ */ new Set([
    "paragraph_open",
    "heading_open",
    "bullet_list_open",
    "ordered_list_open",
    "blockquote_open",
    "table_open",
    "footnote_reference_open",
    "dl_open",
    "hr",
    "fence",
    "code_block",
    "front_matter",
    "html_block",
    "math_block",
    "math_block_eqno"
  ]);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const synthetic = syntheticTokens.has(token);
    if (token.level !== 0 || token.nesting === -1 || !token.map && !synthetic) continue;
    let last = i;
    if (token.nesting === 1) {
      last = i + 1;
      while (last < tokens.length && !(tokens[last].level === 0 && tokens[last].nesting === -1)) last++;
      if (last === tokens.length) throw new UnsupportedSourceCapture();
    } else if (token.nesting !== 0) throw new UnsupportedSourceCapture();
    let sourceFrom = 0, sourceTo = 0, tailFrom = 0;
    if (!synthetic) {
      const from = starts[token.map[0]], to = starts[token.map[1]];
      if (from === void 0 || to === void 0 || to <= from) throw new UnsupportedSourceCapture();
      const raw = rawRange(collector.trace, from, to);
      if (!raw) throw new UnsupportedSourceCapture();
      sourceFrom = raw.from;
      sourceTo = raw.to;
      tailFrom = sourceTo;
      if (renderable.has(token.type)) {
        const tail = rawRange(collector.trace, rendererTailStart(collector.trace.text, from, to, token.type), to);
        if (tail) {
          if (tail.to !== sourceTo) throw new UnsupportedSourceCapture();
          tailFrom = tail.from;
        }
      }
    }
    const draft = {
      collector,
      kind: synthetic ? "synthetic" : "natural",
      gapIndex: natural,
      id: natural,
      tokenType: token.type,
      sourceFrom,
      sourceTo,
      tailFrom
    };
    if (!synthetic) natural++;
    rootStarts.set(token, draft);
    rootEnds.set(tokens[last], draft);
    i = last;
  }
}
function rootCursor(state) {
  if (!Array.isArray(state.stack) || state.stack.length !== 1 || !Array.isArray(state.stack[0].content)) {
    throw new UnsupportedSourceCapture();
  }
  return { count: state.stack[0].content.length, pos: captureCursor(state) };
}
function captureRootEmission(state, token, delegate) {
  const start = rootStarts.get(token), end = rootEnds.get(token);
  if (start) {
    const cursor = rootCursor(state);
    start.childFrom = cursor.count;
    start.pmFrom = cursor.pos;
  }
  delegate();
  if (end) {
    const cursor = rootCursor(state);
    if (end.childFrom === void 0 || end.pmFrom === void 0 || cursor.count <= end.childFrom) {
      throw new UnsupportedSourceCapture();
    }
    const emission = { childFrom: end.childFrom, childTo: cursor.count, pmFrom: end.pmFrom, pmTo: cursor.pos };
    if (end.kind === "synthetic") end.collector.synthetic.push({ gapIndex: end.gapIndex, emission });
    else end.collector.roots.push({
      id: end.id,
      tokenType: end.tokenType,
      sourceFrom: end.sourceFrom,
      sourceTo: end.sourceTo,
      tailFrom: end.tailFrom,
      ...emission
    });
  }
}
function buildSourceGaps(source, roots, synthetic) {
  const grouped = Array.from({ length: roots.length + 1 }, () => []);
  for (const entry of synthetic) {
    if (!Number.isInteger(entry.gapIndex) || entry.gapIndex < 0 || entry.gapIndex > roots.length) {
      throw new UnsupportedSourceCapture();
    }
    grouped[entry.gapIndex].push(entry.emission);
  }
  const result = [];
  let at = 0, lastChild = 0;
  for (let i = 0; i <= roots.length; i++) {
    const root = roots[i], to = root?.sourceFrom ?? source.length;
    if (to < at) throw new UnsupportedSourceCapture();
    result.push({
      sourceFrom: at,
      sourceTo: to,
      kind: /^[\s\uFEFF]*$/u.test(source.slice(at, to)) ? "trivia" : "opaque",
      synthetic: grouped[i]
    });
    if (root) {
      if (root.id !== i || root.sourceTo <= to || root.sourceTo > source.length || root.childFrom < lastChild) {
        throw new UnsupportedSourceCapture();
      }
      at = root.sourceTo;
      lastChild = root.childTo;
    }
  }
  return result;
}
var _origMdParse = md.parse.bind(md);
md.parse = function(src, env) {
  let tokens = _origMdParse(src, env);
  tagPairedHtmlInline(tokens);
  fixFootnoteDefMaps(tokens);
  const collector = env?.[captureKey];
  tokens = preserveBlankLines(tokens, !!collector);
  if (collector) prepareRootEvents(tokens, collector);
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
      const src = restoreLocalWindowsSeparators(
        decodeMultibytePercentSequences(token.attrGet("src") || "")
      );
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
      const href = decodeMultibytePercentSequences(token.attrGet("href") || "");
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
        const href = decodeMultibytePercentSequences(tok.attrGet("href") || "");
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
      captureText(state, tok, () => defaultTextHandler(state, tok, toks, ii));
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
    for (const key of Object.keys(h)) {
      const delegate = h[key];
      h[key] = (state, tok, tokens, i) => captureRootEmission(state, tok, () => delegate(state, tok, tokens, i));
    }
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
      const destination = serializeImageDestination(node.attrs.src || "");
      const title = node.attrs.title;
      if (title) {
        state.write(`![${alt}](${destination} "${serializeImageTitle(title)}")`);
      } else {
        state.write(`![${alt}](${destination})`);
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
function normalizeMathBlocks(text2, edits) {
  if (!text2.includes("$$")) return text2;
  const lines = text2.split("\n");
  const starts = [];
  if (edits) {
    let offset = 0;
    for (const line of lines) {
      starts.push(offset);
      offset += line.length + 1;
    }
  }
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
          if (edits) edits.push({ from: starts[i], to: starts[i], text: "\n" });
        }
        result.push(line);
        inMathBlock = true;
      } else {
        result.push(line);
        inMathBlock = false;
        const next = lines[i + 1];
        if (next !== void 0 && next.trim() !== "") {
          result.push("");
          if (edits) edits.push({ from: starts[i + 1], to: starts[i + 1], text: "\n" });
        }
      }
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}
function normalizeSmartQuotes(text2, observe) {
  if (!/[“”„‟‘’‚‛]/.test(text2)) return text2;
  const passes = [
    [/(\]\([^\n)]*\s)“([^”\n]*)”(\s*\))/g, '"'],
    [/(\]\([^\n)]*\s)“([^”\n]*)”(\s*\))/g, '"'],
    [/(\]\([^\n)]*\s)‘([^’\n]*)’(\s*\))/g, "'"]
  ];
  for (const [pattern, quote] of passes) {
    const before = text2, edits = [];
    text2 = text2.replace(pattern, (_m, pre, title, post, offset) => {
      if (observe) {
        const left = offset + pre.length, right = left + 1 + title.length;
        edits.push({ from: left, to: left + 1, text: quote }, { from: right, to: right + 1, text: quote });
      }
      return pre + quote + title + quote + post;
    });
    observe?.(before, text2, edits);
  }
  return text2;
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
var UnsupportedSourceCapture = class extends Error {
};
function parseDocumentWithSourceCapture(source, schema) {
  if (!captureAvailable) return { ok: false, reason: "unsupported-source" };
  try {
    let trace = identityTrace(source);
    if (source.charCodeAt(0) === 65279) trace = editTrace(trace, [{ from: 0, to: 1, text: "" }]);
    const mathEdits = [];
    const math = normalizeMathBlocks(trace.text, mathEdits);
    trace = editTrace(trace, mathEdits);
    if (trace.text !== math) throw new UnsupportedSourceCapture();
    const work = normalizeSmartQuotes(math, (before, after, edits) => {
      if (trace.text !== before) throw new UnsupportedSourceCapture();
      trace = editTrace(trace, edits);
      if (trace.text !== after) throw new UnsupportedSourceCapture();
    });
    const collector = { trace, runs: [], roots: [], synthetic: [] };
    const doc2 = getParserFor(schema).parse(work, { [captureKey]: collector });
    const text2 = [];
    doc2.forEach((paragraph2, offset) => {
      if (paragraph2.type.name !== "paragraph") return;
      paragraph2.forEach((node, inner) => {
        if (node.isText) text2.push({ node, paragraph: paragraph2, from: offset + 1 + inner, to: offset + 1 + inner + node.nodeSize });
      });
    });
    let pmEnd = 0, sourceEnd = 0, textIndex = 0;
    for (const run of collector.runs) {
      if (run.pmFrom < pmEnd || run.pmTo <= run.pmFrom || run.pmTo > doc2.content.size || run.sourceFrom < sourceEnd || run.sourceTo <= run.sourceFrom || run.sourceTo > source.length || run.kind === "linear" && run.sourceTo - run.sourceFrom !== run.pmTo - run.pmFrom) {
        throw new UnsupportedSourceCapture();
      }
      while (textIndex < text2.length && text2[textIndex].to <= run.pmFrom) textIndex++;
      const paragraph2 = text2[textIndex]?.paragraph;
      let pos = run.pmFrom;
      while (pos < run.pmTo) {
        const part = text2[textIndex];
        if (!part || part.paragraph !== paragraph2 || part.from > pos || part.to <= pos || part.node.marks.some((mark) => !["em", "strong", "link"].includes(mark.type.name))) {
          throw new UnsupportedSourceCapture();
        }
        const end = Math.min(part.to, run.pmTo);
        if (run.kind === "linear" && source.slice(run.sourceFrom + pos - run.pmFrom, run.sourceFrom + end - run.pmFrom) !== part.node.text.slice(pos - part.from, end - part.from)) throw new UnsupportedSourceCapture();
        pos = end;
        if (pos === part.to) textIndex++;
      }
      pmEnd = run.pmTo;
      sourceEnd = run.sourceTo;
    }
    return { ok: true, value: {
      doc: doc2,
      textRuns: collector.runs,
      roots: collector.roots,
      gaps: buildSourceGaps(source, collector.roots, collector.synthetic)
    } };
  } catch (error) {
    return { ok: false, reason: error instanceof UnsupportedSourceCapture || error instanceof UnsupportedOwnership ? "unsupported-source" : "parse-error" };
  }
}
function parseParagraphWithSourceCapture(source, schema) {
  const parsed = parseDocumentWithSourceCapture(source, schema);
  if (!parsed.ok) return parsed;
  const { doc: doc2, textRuns } = parsed.value;
  if (doc2.childCount !== 1 || doc2.firstChild?.type.name !== "paragraph") return { ok: false, reason: "unsupported-source" };
  let pos = 1, supported = true;
  for (const run of textRuns) {
    if (run.pmFrom !== pos) supported = false;
    pos = run.pmTo;
  }
  doc2.firstChild.forEach((node) => {
    if (!node.isText || node.marks.some((mark) => !["em", "strong", "link"].includes(mark.type.name))) supported = false;
  });
  return supported && pos === doc2.content.size - 1 ? parsed : { ok: false, reason: "unsupported-source" };
}
export {
  parseDocumentWithSourceCapture,
  parseMarkdown,
  parseMarkdownAsync,
  parseParagraphWithSourceCapture,
  serializeMarkdown
};
//# sourceMappingURL=markdown.js.map