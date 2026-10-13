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

// src/source-layout.ts
function collectBlankDrafts(source, trace, starts, regions, protectedSources) {
  const result = [];
  const protectedOrder = protectedSources;
  const referenceStarts = new Set(protectedOrder.filter((p) => p.scope === "top-level").map((p) => p.sourceFrom));
  const referenceEnds = new Set(protectedOrder.filter((p) => p.scope === "top-level").map((p) => p.sourceTo));
  let line = 0, protectedIndex = 0;
  for (const region of regions) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const first = run[0], last = run[run.length - 1];
      const touches = referenceEnds.has(first.sourceFrom) || referenceStarts.has(last.sourceTo);
      if (region.left && region.right || touches) first.role = "separator";
      for (const unit of run) result.push(unit);
      run = [];
    };
    while (line + 1 < starts.length && starts[line] < region.from) line++;
    while (line + 1 < starts.length && starts[line + 1] <= region.to) {
      const from = starts[line], to = starts[line + 1];
      line++;
      if (to <= from || !/^[ \t]*\n$/.test(trace.text.slice(from, to))) {
        flush();
        continue;
      }
      const piece = sliceTrace(trace, from, to);
      if (piece.pieces.some((p) => p.kind === "generated")) {
        flush();
        continue;
      }
      const raw = rawRange(trace, from, to);
      if (!raw || !/^[ \t]*(?:\r\n|\r|\n)$/.test(source.slice(raw.from, raw.to))) {
        flush();
        continue;
      }
      while (protectedIndex < protectedOrder.length && protectedOrder[protectedIndex].sourceTo <= raw.from) protectedIndex++;
      const occupied = protectedOrder[protectedIndex];
      if (occupied && occupied.sourceFrom < raw.to) {
        flush();
        continue;
      }
      const prev = region.previousRoot;
      let container = { kind: "gap", gapIndex: region.gapIndex };
      if (prev && raw.from < prev.sourceTo) {
        if (raw.from < prev.tailFrom || raw.to > prev.sourceTo) throw new UnsupportedOwnership();
        container = { kind: "root-tail", rootId: prev.id };
      }
      run.push({
        id: 0,
        sourceFrom: raw.from,
        sourceTo: raw.to,
        container,
        role: "empty-paragraph",
        insertBefore: region.insertBefore
      });
    }
    flush();
  }
  result.forEach((u, i) => {
    u.id = i;
  });
  return result;
}
function finishSourceLayout(blankLines, fallback, lists) {
  const units = blankLines.map((u) => {
    const base = { id: u.id, sourceFrom: u.sourceFrom, sourceTo: u.sourceTo, container: u.container };
    if (u.role === "separator") return { ...base, role: "separator" };
    if (!u.emission) throw new UnsupportedOwnership();
    return { ...base, role: "empty-paragraph", emission: u.emission };
  });
  return { blankLines: units, ...fallback ? { fallback } : {}, ...lists ? { lists } : {} };
}

// src/source-content-trace.ts
function traceConsumedLines(trace, read, actual) {
  const chunks = [], pieces = [];
  let length = 0;
  for (let i = 0; i < read.end - read.begin; i++) {
    const row = read.rows[i];
    if (!row) return void 0;
    let first = row.b, width = 0;
    const last = row.e + (i + 1 < read.end - read.begin || read.keepLastLF ? 1 : 0);
    while (first < last && width < read.indent) {
      const ch = trace.text[first];
      if (ch === " ") width++;
      else if (ch === "	") width += 4 - (width + row.bs) % 4;
      else if (first - row.b < row.t) width++;
      else break;
      first++;
    }
    if (width > read.indent) {
      const padding = " ".repeat(width - read.indent);
      pieces.push({ from: length, to: length + padding.length, sourceFrom: 0, sourceTo: 0, kind: "generated" });
      chunks.push(padding);
      length += padding.length;
    }
    const part = sliceTrace(trace, first, last);
    for (const p of part.pieces) pieces.push({ ...p, from: p.from + length, to: p.to + length });
    chunks.push(part.text);
    length += part.text.length;
  }
  const text2 = chunks.join("");
  return text2 === actual ? { text: text2, pieces } : void 0;
}
function traceTableRow(trace, from, to, actual) {
  const row = sliceTrace(trace, from, to), left = row.text.length - row.text.trimStart().length;
  const trimmed = sliceTrace(row, left, left + row.text.trim().length);
  const cells = [];
  let start = 0, escaped = false;
  let edits = [];
  const append = (end) => {
    cells.push(editTrace(sliceTrace(trimmed, start, end), edits));
    edits = [];
  };
  for (let i = 0; i < trimmed.text.length; i++) {
    const ch = trimmed.text[i];
    if (ch === "|") {
      if (escaped) edits.push({ from: i - 1 - start, to: i + 1 - start, text: "|" });
      else {
        append(i);
        start = i + 1;
      }
    }
    escaped = ch === "\\";
  }
  append(trimmed.text.length);
  if (cells[0]?.text === "") cells.shift();
  if (cells[cells.length - 1]?.text === "") cells.pop();
  const projected = actual.map((value, i) => {
    const cell = cells[i];
    if (!cell) return void 0;
    const leading = cell.text.length - cell.text.trimStart().length;
    return sliceTrace(cell, leading, leading + cell.text.trim().length);
  });
  if (projected.some((cell, i) => (cell?.text ?? "") !== actual[i])) return void 0;
  return projected;
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
          const open = mkToken("paragraph_open", "p", 1);
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
    const collector = collectorFor(state);
    if (collector) {
      if (contentStart === void 0 || contentEnd === void 0) throw new UnsupportedSourceCapture();
      literalFacts.set(token, { collector, trace: sliceTrace(collector.trace, contentStart, contentEnd), kind: "front_matter" });
    }
    state.line = nextLine + 1;
    return true;
  },
  { alt: [] }
);
var captureKey = /* @__PURE__ */ Symbol("document source capture");
var owners = /* @__PURE__ */ new WeakMap();
var inlineFrames = /* @__PURE__ */ new WeakMap();
var inlineCloseStates = /* @__PURE__ */ new WeakSet();
var inlineFacts = /* @__PURE__ */ new WeakMap();
var literalFacts = /* @__PURE__ */ new WeakMap();
var capturedTextParents = ["paragraph", "heading", "code_block", "frontmatter", "html_block"];
var capturedTextMarks = ["em", "strong", "link", "annotation", "html_mark", "highlight", "strike_through"];
var tokenArrays = /* @__PURE__ */ new WeakMap();
var inlineStateOwners = /* @__PURE__ */ new WeakMap();
var tokenSources = /* @__PURE__ */ new WeakMap();
var pendingSources = /* @__PURE__ */ new WeakMap();
var capturedFenceClosed = /* @__PURE__ */ new WeakMap();
var capturedRootFencesClosed = /* @__PURE__ */ new WeakMap();
var capturedListLayouts = /* @__PURE__ */ new WeakMap();
var captureAvailable = true;
function capturedSourceLists(source, doc2, roots, layout) {
  const bound = capturedListLayouts.get(layout);
  return bound && bound.source === source && bound.doc === doc2 && bound.roots === roots && bound.lists === layout.lists ? bound.lists : void 0;
}
function capturedInlineBodies(source, doc2, roots, layout) {
  const bound = capturedListLayouts.get(layout);
  return bound && bound.source === source && bound.doc === doc2 && bound.roots === roots && bound.lists === layout.lists ? bound.bodies : void 0;
}
function sourceRootHasClosedFences(root) {
  return capturedRootFencesClosed.get(root) === true;
}
function wrapCaptureRule(ruler, name, wrapper, preserveAlternates = false) {
  const original = ruler.__rules__?.find((rule) => rule.name === name)?.fn;
  if (typeof original !== "function") {
    captureAvailable = false;
    return;
  }
  const alt = preserveAlternates ? ruler.__rules__.find((rule) => rule.name === name).alt.slice() : [];
  ruler.at(name, (...args) => wrapper(original, ...args), { alt });
}
var collectorFor = (state) => state.env?.[captureKey];
wrapCaptureRule(md.block.ruler, "fence", (original, state, startLine, endLine, silent) => {
  if (!collectorFor(state) || silent) return original(state, startLine, endLine, silent);
  const originalGetLines = state.getLines, descriptor = Object.getOwnPropertyDescriptor(state, "getLines");
  if (typeof originalGetLines !== "function" || descriptor?.configurable === false) throw new UnsupportedSourceCapture();
  const tokenStart = state.tokens.length;
  let contentEnd, bodyTrace;
  Object.defineProperty(state, "getLines", {
    configurable: true,
    writable: true,
    enumerable: descriptor?.enumerable ?? false,
    value: function(begin, end, indent, keepLastLF) {
      if (this !== state || contentEnd !== void 0 || begin !== startLine + 1 || !Number.isInteger(end) || end < begin || end > endLine || keepLastLF !== true) throw new UnsupportedSourceCapture();
      contentEnd = end;
      const read = { begin, end, indent, keepLastLF, rows: Array.from({ length: end - begin }, (_, i) => {
        const line = begin + i;
        return { b: state.bMarks[line], e: state.eMarks[line], t: state.tShift[line], bs: state.bsCount[line] };
      }) };
      const value = originalGetLines.call(this, begin, end, indent, keepLastLF);
      bodyTrace = traceConsumedLines(collectorFor(state).trace, read, value);
      return value;
    }
  });
  let result;
  try {
    result = original(state, startLine, endLine, silent);
  } finally {
    if (descriptor) Object.defineProperty(state, "getLines", descriptor);
    else delete state.getLines;
  }
  if (result) {
    const tokens = state.tokens.slice(tokenStart), token = tokens[0];
    if (tokens.length !== 1 || token?.type !== "fence" || contentEnd === void 0 || token.map?.[0] !== startLine || token.map?.[1] !== state.line || state.line !== contentEnd && state.line !== contentEnd + 1) throw new UnsupportedSourceCapture();
    capturedFenceClosed.set(token, state.line === contentEnd + 1);
    if (bodyTrace) literalFacts.set(token, { collector: collectorFor(state), trace: bodyTrace, kind: token.type });
  } else if (contentEnd !== void 0) throw new UnsupportedSourceCapture();
  return result;
});
for (const name of ["code", "html_block"]) wrapCaptureRule(md.block.ruler, name, (original, state, ...args) => {
  const collector = collectorFor(state);
  if (!collector) return original(state, ...args);
  const getLines = state.getLines, descriptor = Object.getOwnPropertyDescriptor(state, "getLines"), start = state.tokens.length;
  let bodyTrace;
  state.getLines = function(begin, end, indent, keepLastLF) {
    const read = { begin, end, indent, keepLastLF, rows: Array.from({ length: end - begin }, (_, i) => {
      const line = begin + i;
      return { b: this.bMarks[line], e: this.eMarks[line], t: this.tShift[line], bs: this.bsCount[line] };
    }) };
    const value = getLines.call(this, begin, end, indent, keepLastLF);
    bodyTrace = traceConsumedLines(collector.trace, read, value);
    return value;
  };
  let result;
  try {
    result = original(state, ...args);
  } finally {
    if (descriptor) Object.defineProperty(state, "getLines", descriptor);
    else delete state.getLines;
  }
  const added = state.tokens.slice(start), token = added[0];
  if (result && added.length === 1 && bodyTrace && token.type === (name === "code" ? "code_block" : "html_block")) {
    if (name === "code") bodyTrace = { text: bodyTrace.text + "\n", pieces: [
      ...bodyTrace.pieces,
      { from: bodyTrace.text.length, to: bodyTrace.text.length + 1, sourceFrom: 0, sourceTo: 0, kind: "generated" }
    ] };
    if (bodyTrace.text === token.content) literalFacts.set(token, { collector, trace: bodyTrace, kind: token.type });
  }
  return result;
}, true);
wrapCaptureRule(md.block.ruler, "table", (original, state, ...args) => {
  const collector = collectorFor(state), start = state.tokens.length;
  const result = original(state, ...args);
  if (!collector || !result) return result;
  const tokens = state.tokens.slice(start);
  for (let i = 0; i < tokens.length; i++) {
    const row = tokens[i];
    if (row.type !== "tr_open" || !row.map) continue;
    const slots = [];
    let j = i + 1;
    for (; j < tokens.length && tokens[j].type !== "tr_close"; j += 3) {
      if (!["th_open", "td_open"].includes(tokens[j]?.type) || tokens[j + 1]?.type !== "inline" || tokens[j + 2]?.type !== tokens[j].type.replace("_open", "_close")) throw new UnsupportedSourceCapture();
      slots.push(tokens[j + 1]);
    }
    if (tokens[j]?.type !== "tr_close") throw new UnsupportedSourceCapture();
    const line = row.map[0];
    const projected = traceTableRow(collector.trace, state.bMarks[line] + state.tShift[line], state.eMarks[line], slots.map((t) => t.content));
    if (projected) slots.forEach((token, k) => {
      const trace = projected[k];
      if (trace) bindInlineTrace(token, collector, trace, "table-cell");
    });
    i = j;
  }
  return result;
}, true);
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
  collector.lineStarts = lineStarts(collector.trace.text);
  return result;
});
wrapCaptureRule(md.block.ruler, "reference", function observeReferenceCandidate(original, state, startLine, endLine, silent) {
  const collector = collectorFor(state);
  if (!collector || silent) return original(state, startLine, endLine, silent);
  const scope = state.level === 0 && state.blkIndent === 0 ? "top-level" : "nested";
  const had = Object.hasOwn(state.env, "references"), saved = state.env.references;
  const candidates = {};
  state.env.references = candidates;
  let result;
  try {
    result = original(state, startLine, endLine, silent);
  } finally {
    if (had) state.env.references = saved;
    else delete state.env.references;
  }
  if (!result) return result;
  const entries = Object.entries(candidates);
  if (entries.length !== 1) throw new UnsupportedSourceCapture();
  const [label, value] = entries[0];
  if (typeof state.env.references === "undefined") state.env.references = {};
  if (typeof state.env.references[label] === "undefined") state.env.references[label] = value;
  const from = collector.lineStarts[startLine], to = collector.lineStarts[state.line];
  if (from === void 0 || to === void 0 || to <= from) throw new UnsupportedSourceCapture();
  const raw = rawRange(collector.trace, from, to);
  if (raw) {
    const previous = collector.protectedSources[collector.protectedSources.length - 1];
    if (previous && previous.sourceTo > raw.from) throw new UnsupportedSourceCapture();
    collector.protectedSources.push(Object.freeze({ kind: "reference-definition", sourceFrom: raw.from, sourceTo: raw.to, scope }));
    collector.file?.definitions.push({
      kind: "reference",
      label,
      href: value.href,
      title: value.title,
      sourceFrom: raw.from,
      sourceTo: raw.to,
      scope
    });
  }
  return result;
});
function bindInlineTrace(token, collector, trace, kind) {
  if (trace.text !== token.content || !Array.isArray(token.children)) throw new UnsupportedSourceCapture();
  owners.set(token.children, trace);
  tokenArrays.set(token, token.children);
  inlineFacts.set(token, { collector, trace, kind });
}
for (const name of ["paragraph", "lheading"]) wrapCaptureRule(md.block.ruler, name, (original, state, ...args) => {
  const collector = collectorFor(state);
  if (!collector) return original(state, ...args);
  const level = state.level, originalGetLines = state.getLines, start = state.tokens.length;
  if (typeof originalGetLines !== "function" || !Array.isArray(state.bMarks) || !Array.isArray(state.eMarks)) throw new UnsupportedSourceCapture();
  let capturedLines, terminal;
  state.getLines = function(begin, end, indent, keepLastLF) {
    const read = { begin, end, indent, keepLastLF, rows: Array.from({ length: end - begin }, (_, i) => {
      const line = begin + i;
      return { b: this.bMarks[line], e: this.eMarks[line], t: this.tShift[line], bs: this.bsCount[line] };
    }) };
    const value = originalGetLines.call(this, begin, end, indent, keepLastLF);
    let part = traceConsumedLines(collector.trace, read, value);
    if (!part) throw new UnsupportedSourceCapture();
    const endOfLine = read.rows[read.rows.length - 1]?.e;
    let slashes = 0;
    for (let i = value.length - 1; i >= 0 && value[i] === "\\"; i--) slashes++;
    const restore = name === "paragraph" && !keepLastLF && endOfLine !== void 0 && this.src[endOfLine] === "\n" && (value.endsWith("  ") || slashes % 2 === 1);
    const left = value.length - value.trimStart().length;
    if (restore) {
      const eol = sliceTrace(collector.trace, endOfLine, endOfLine + 1);
      part = { text: part.text + eol.text, pieces: [...part.pieces, ...eol.pieces.map((p) => ({ ...p, from: p.from + value.length, to: p.to + value.length }))] };
      terminal = value.trimStart() + "\n";
    }
    capturedLines = sliceTrace(part, left, restore ? part.text.length : left + value.trim().length);
    return value;
  };
  let result;
  try {
    result = original(state, ...args);
  } finally {
    state.getLines = originalGetLines;
  }
  if (result) for (const token of state.tokens.slice(start)) {
    if (token.type !== "inline" || token.level !== level + 1) continue;
    if (terminal !== void 0) token.content = terminal;
    if (!capturedLines) throw new UnsupportedSourceCapture();
    bindInlineTrace(token, collector, capturedLines, name === "paragraph" ? "paragraph" : "heading");
  }
  return result;
}, true);
wrapCaptureRule(md.block.ruler, "heading", (original, state, startLine, endLine, silent) => {
  const collector = collectorFor(state);
  if (!collector || silent) return original(state, startLine, endLine, silent);
  const start = state.tokens.length;
  const spaces = state.skipSpacesBack, chars = state.skipCharsBack;
  let spacesEnd, charsEnd, bodyFrom;
  state.skipSpacesBack = function(...args) {
    bodyFrom = args[1];
    return spacesEnd = spaces.apply(this, args);
  };
  state.skipCharsBack = function(...args) {
    return charsEnd = chars.apply(this, args);
  };
  let result;
  try {
    result = original(state, startLine, endLine, silent);
  } finally {
    state.skipSpacesBack = spaces;
    state.skipCharsBack = chars;
  }
  if (result) {
    const [open, token] = state.tokens.slice(start), from = bodyFrom;
    if (open.type !== "heading_open" || token.type !== "inline" || token.level !== open.level + 1 || spacesEnd === void 0 || charsEnd === void 0 || bodyFrom === void 0) throw new UnsupportedSourceCapture();
    const end = charsEnd > from && /[ \t]/.test(state.src[charsEnd - 1]) ? charsEnd : spacesEnd;
    const part = sliceTrace(collector.trace, from, end), left = part.text.length - part.text.trimStart().length;
    bindInlineTrace(token, collector, sliceTrace(part, left, left + part.text.trim().length), "heading");
  }
  return result;
}, true);
wrapCaptureRule(md.core.ruler, "inline", (original, state) => {
  if (!collectorFor(state)) return original(state);
  const collector = collectorFor(state);
  if (collector.file) collector.file.blockTokens = cloneTokenBatch(state.tokens, collector);
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
  const supported = state.stack[state.stack.length - 1].marks.every((mark) => capturedTextMarks.includes(mark.type.name));
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
function captureLiteralEmission(state, token, delegate) {
  const fact = literalFacts.get(token);
  if (!fact) {
    delegate();
    return;
  }
  const frame = state.stack[state.stack.length - 1], index = frame.content.length, from = captureCursor(state) + 1;
  delegate();
  if (state.stack[state.stack.length - 1] !== frame || frame.content.length !== index + 1) return;
  const node = frame.content[index], kind = fact.kind === "fence" ? "code_block" : fact.kind === "front_matter" ? "frontmatter" : fact.kind;
  if (node.type.name !== kind || !["code_block", "frontmatter", "html_block"].includes(kind)) return;
  const text2 = token.content.endsWith("\n") ? token.content.slice(0, -1) : token.content;
  if (node.textContent !== text2 || node.content.size !== text2.length || node.marks.length) return;
  let plain = true;
  node.forEach((child) => {
    if (!child.isText || child.marks.length) plain = false;
  });
  if (!plain || fact.trace.text !== token.content) return;
  const trace = sliceTrace(fact.trace, 0, text2.length), runFrom = fact.collector.runs.length;
  for (const p of trace.pieces) if (p.kind !== "generated") fact.collector.runs.push({
    sourceFrom: p.sourceFrom,
    sourceTo: p.sourceTo,
    pmFrom: from + p.from,
    pmTo: from + p.to,
    kind: p.kind === "copy" ? "linear" : "atomic"
  });
  fact.collector.emissions.push({ from, to: from + text2.length, kind, runFrom, runTo: fact.collector.runs.length, node });
}
function captureInlineEmission(state, token, delegate) {
  const fact = inlineFacts.get(token);
  if (!fact) {
    delegate();
    return;
  }
  if (!inlineCloseStates.has(state)) {
    const close = state.closeNode;
    state.closeNode = function() {
      const frame2 = this.stack[this.stack.length - 1], emission2 = inlineFrames.get(frame2), node = close.call(this);
      if (emission2) {
        if (!node || node.type.name !== emission2.kind || node.content.size !== emission2.to - emission2.from || emission2.node) throw new UnsupportedSourceCapture();
        emission2.node = node;
      }
      return node;
    };
    inlineCloseStates.add(state);
  }
  const frame = state.stack[state.stack.length - 1], from = captureCursor(state), runFrom = fact.collector.runs.length;
  delegate();
  const to = captureCursor(state);
  if (state.stack[state.stack.length - 1] !== frame) throw new UnsupportedSourceCapture();
  if (!["paragraph", "heading"].includes(frame.type.name)) return;
  const emission = { from, to, kind: frame.type.name, runFrom, runTo: fact.collector.runs.length };
  fact.collector.emissions.push(emission);
  inlineFrames.set(frame, emission);
  if (fact.trace && fact.kind) {
    const pieces = fact.trace.pieces;
    const contiguous = pieces.length > 0 && pieces.every((p, i) => p.kind !== "generated" && (!i || pieces[i - 1].sourceTo === p.sourceFrom));
    const raw = contiguous ? rawRange(fact.trace, 0, fact.trace.text.length) : void 0;
    if (raw) emission.body = {
      pmFrom: from,
      pmTo: to,
      sourceFrom: raw.from,
      sourceTo: raw.to,
      kind: fact.kind,
      singlePhysicalLine: !/[\r\n]/.test(fact.collector.source.slice(raw.from, raw.to))
    };
  }
}
function consumeCheckboxSource(token, count) {
  const provenance = tokenSources.get(token);
  if (!provenance) return;
  if (provenance.runs.map((run) => run.text).join("") !== token.content) throw new UnsupportedSourceCapture();
  let remaining = Math.min(count, token.content.length);
  const runs = [];
  for (const run of provenance.runs) {
    if (!remaining) {
      runs.push(run);
      continue;
    }
    if (remaining >= run.text.length) {
      remaining -= run.text.length;
      continue;
    }
    if (run.kind === "atomic") throw new UnsupportedSourceCapture();
    const text2 = run.text.slice(remaining);
    if (run.trace) {
      if (run.trace.text !== run.text || run.trace.pieces.some((p) => p.kind === "atomic" && p.from < remaining && remaining < p.to)) throw new UnsupportedSourceCapture();
      runs.push({ text: text2, kind: run.kind, trace: sliceTrace(run.trace, remaining, run.text.length) });
    } else runs.push({ text: text2 });
    remaining = 0;
  }
  if (remaining || runs.map((run) => run.text).join("") !== token.content.slice(count)) throw new UnsupportedSourceCapture();
  tokenSources.set(token, { collector: provenance.collector, runs });
}
var rootStarts = /* @__PURE__ */ new WeakMap();
var rootEnds = /* @__PURE__ */ new WeakMap();
var listStarts = /* @__PURE__ */ new WeakMap();
var listEnds = /* @__PURE__ */ new WeakMap();
function prepareListEvents(tokens, collector) {
  const stack = [];
  for (const token of tokens) {
    if (token.nesting === -1) {
      const open = stack.pop();
      if (!open || open.token.type.replace(/_open$/, "_close") !== token.type) throw new UnsupportedSourceCapture();
      if (open.list) {
        if (token.markup !== open.list.marker) throw new UnsupportedSourceCapture();
        listEnds.set(token, open.list);
      }
      continue;
    }
    let list;
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const kind = token.type === "bullet_list_open" ? "bullet" : "ordered", marker = token.markup;
      if (token.nesting !== 1 || !token.map || token.map.length !== 2 || !token.map.every(Number.isInteger) || !marker || !(kind === "bullet" ? ["-", "+", "*"] : [".", ")"]).includes(marker)) throw new UnsupportedSourceCapture();
      const from = collector.lineStarts[token.map[0]], to = collector.lineStarts[token.map[1]];
      if (from === void 0 || to === void 0 || to <= from) throw new UnsupportedSourceCapture();
      const raw = rawRange(collector.trace, from, to);
      if (!raw || kind === "ordered" && typeof token.attrGet !== "function") throw new UnsupportedSourceCapture();
      list = {
        collector,
        id: collector.lists.length,
        kind,
        marker,
        sourceFrom: raw.from,
        sourceTo: raw.to,
        tight: true,
        ...kind === "ordered" ? { order: Number(token.attrGet("start") ?? 1) } : {}
      };
      collector.lists.push(list);
      listStarts.set(token, list);
    } else if (token.type === "paragraph_open" && stack[stack.length - 1]?.token.type === "list_item_open") {
      const direct = stack[stack.length - 2]?.list;
      if (direct) {
        if (typeof token.hidden !== "boolean") throw new UnsupportedSourceCapture();
        if (!token.hidden) direct.tight = false;
      }
    }
    if (token.nesting === 1) stack.push({ token, list });
  }
  if (stack.length) throw new UnsupportedSourceCapture();
}
function captureListEmission(state, token, delegate) {
  const start = listStarts.get(token), end = listEnds.get(token);
  if (start) {
    const parent = state.stack?.[state.stack.length - 1];
    if (!parent || !Array.isArray(parent.content) || start.parent) throw new UnsupportedSourceCapture();
    start.parent = parent;
    start.slot = parent.content.length;
  }
  delegate();
  if (end) {
    const parent = state.stack?.[state.stack.length - 1];
    if (!parent || parent !== end.parent || end.slot === void 0 || parent.content.length !== end.slot + 1 || end.node) throw new UnsupportedSourceCapture();
    const node = parent.content[end.slot];
    if (node.type.name !== end.kind + "_list" || end.kind === "ordered" && node.attrs.order !== end.order) throw new UnsupportedSourceCapture();
    end.node = node;
  }
}
function finishSourceLists(doc2, collector) {
  const byNode = /* @__PURE__ */ new Map(), facts = [];
  for (const draft of collector.lists) {
    if (!draft.node || byNode.has(draft.node)) throw new UnsupportedSourceCapture();
    byNode.set(draft.node, draft);
  }
  let rootIndex = 0;
  const seen = /* @__PURE__ */ new Set();
  doc2.descendants((node, pmFrom) => {
    const draft = byNode.get(node);
    if (!draft) {
      if (node.type.name === "bullet_list" || node.type.name === "ordered_list") throw new UnsupportedSourceCapture();
      return;
    }
    if (seen.has(draft)) throw new UnsupportedSourceCapture();
    seen.add(draft);
    const pmTo = pmFrom + node.nodeSize;
    while (collector.roots[rootIndex] && collector.roots[rootIndex].pmTo <= pmFrom) rootIndex++;
    const root = collector.roots[rootIndex];
    if (!root || root.pmFrom > pmFrom || root.pmTo < pmTo || root.sourceFrom > draft.sourceFrom || root.sourceTo < draft.sourceTo || node.type.name !== draft.kind + "_list" || draft.kind === "ordered" && node.attrs.order !== draft.order) throw new UnsupportedSourceCapture();
    facts.push(Object.freeze({
      id: draft.id,
      rootId: root.id,
      pmFrom,
      pmTo,
      sourceFrom: draft.sourceFrom,
      sourceTo: draft.sourceTo,
      kind: draft.kind,
      marker: draft.marker,
      tight: draft.tight
    }));
  });
  if (seen.size !== collector.lists.length) throw new UnsupportedSourceCapture();
  return Object.freeze(facts);
}
function prepareRootEvents(tokens, collector) {
  const starts = collector.lineStarts;
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
  const flowTail = /* @__PURE__ */ new Set(["bullet_list_open", "ordered_list_open", "blockquote_open"]);
  const natural = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.level !== 0 || token.nesting === -1 || !token.map) continue;
    let last = i;
    if (token.nesting === 1) {
      last = i + 1;
      while (last < tokens.length && !(tokens[last].level === 0 && tokens[last].nesting === -1)) last++;
      if (last === tokens.length) throw new UnsupportedSourceCapture();
    } else if (token.nesting !== 0) throw new UnsupportedSourceCapture();
    const from = starts[token.map[0]], to = starts[token.map[1]];
    if (from === void 0 || to === void 0 || to <= from) throw new UnsupportedSourceCapture();
    const raw = rawRange(collector.trace, from, to);
    if (!raw) throw new UnsupportedSourceCapture();
    let tailFrom = raw.to, boundaryTo = to;
    if (renderable.has(token.type)) {
      const tailWork = rendererTailStart(collector.trace.text, from, to, token.type);
      const tail = rawRange(collector.trace, tailWork, to);
      if (tail) {
        if (tail.to !== raw.to) throw new UnsupportedSourceCapture();
        tailFrom = tail.from;
      }
      if (flowTail.has(token.type) && collector.trace.text[tailWork] === "\n" && /^[ \t\n]*$/.test(collector.trace.text.slice(tailWork + 1, to))) boundaryTo = tailWork + 1;
    }
    const id = natural.length;
    let closedFences = true;
    for (let at = i; at <= last; at++) if (tokens[at].type === "fence") {
      const closed = capturedFenceClosed.get(tokens[at]);
      if (closed === void 0) throw new UnsupportedSourceCapture();
      if (!closed) closedFences = false;
    }
    const draft = {
      collector,
      kind: "natural",
      gapIndex: id,
      id,
      tokenType: token.type,
      sourceFrom: raw.from,
      sourceTo: raw.to,
      tailFrom,
      closedFences
    };
    rootStarts.set(token, draft);
    rootEnds.set(tokens[last], draft);
    natural.push({ draft, first: i, last, from, to, boundaryTo });
    i = last;
  }
  const regions = [];
  for (let i = 0; i <= natural.length; i++) {
    const previous = natural[i - 1], next = natural[i];
    regions.push({
      from: previous?.boundaryTo ?? 0,
      to: next?.from ?? collector.trace.text.length,
      insertBefore: next?.first ?? tokens.length,
      gapIndex: i,
      left: !!previous,
      right: !!next,
      ...previous ? { previousRoot: previous.draft } : {}
    });
  }
  collector.blankLines = collectBlankDrafts(collector.source, collector.trace, starts, regions, collector.protectedSources);
  const inserts = /* @__PURE__ */ new Map();
  function emit(at, layout) {
    const mk = (type, tag, nesting, extra = {}) => ({
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
    });
    const open = mk("paragraph_open", "p", 1), close = mk("paragraph_close", "p", -1);
    const draft = {
      collector,
      kind: "synthetic",
      gapIndex: 0,
      id: -1,
      tokenType: "paragraph_open",
      sourceFrom: 0,
      sourceTo: 0,
      tailFrom: 0,
      layout
    };
    rootStarts.set(open, draft);
    rootEnds.set(close, draft);
    const items = inserts.get(at) ?? [];
    items.push(open, mk("inline", "", 0, { level: 1, block: false, children: [] }), close);
    inserts.set(at, items);
  }
  if (!natural.length) emit(0, "fallback");
  for (const unit of collector.blankLines) if (unit.role === "empty-paragraph") emit(unit.insertBefore, unit);
  const result = [];
  for (let i = 0; i <= tokens.length; i++) {
    const before = inserts.get(i);
    if (before) for (const token of before) result.push(token);
    if (i < tokens.length) result.push(tokens[i]);
  }
  return result;
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
    if (end.kind === "synthetic") {
      if (end.layout === "fallback") {
        end.collector.fallback = {
          kind: "empty-document-baseline",
          sourceAnchor: end.collector.source.charCodeAt(0) === 65279 ? 1 : 0,
          emission
        };
      } else {
        const unit = end.layout;
        if (!unit || unit.role !== "empty-paragraph" || unit.emission) throw new UnsupportedSourceCapture();
        unit.emission = emission;
        if (unit.container.kind === "gap") end.collector.synthetic.push({ gapIndex: unit.container.gapIndex, emission });
      }
    } else {
      if (end.closedFences === void 0) throw new UnsupportedSourceCapture();
      const root = {
        id: end.id,
        tokenType: end.tokenType,
        sourceFrom: end.sourceFrom,
        sourceTo: end.sourceTo,
        tailFrom: end.tailFrom,
        ...emission
      };
      capturedRootFencesClosed.set(root, end.closedFences);
      end.collector.roots.push(root);
    }
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
  if (collector) prepareListEvents(tokens, collector);
  tokens = collector ? prepareRootEvents(tokens, collector) : preserveBlankLines(tokens);
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
      return { order: Number(token.attrGet("start") ?? 1) };
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
            const fact = inlineFacts.get(t);
            if (fact?.trace) {
              if (fact.trace.text !== t.content) throw new UnsupportedSourceCapture();
              inlineFacts.set(t, { ...fact, trace: sliceTrace(fact.trace, match[0].length, fact.trace.text.length) });
            }
            t.content = t.content.slice(match[0].length);
            const children = t.children;
            if (children && children.length > 0) {
              const firstChild = children[0];
              if (firstChild.type === "text") {
                consumeCheckboxSource(firstChild, match[0].length);
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
      return { language: "" };
    },
    noCloseToken: true
  },
  fence: {
    block: "code_block",
    getAttrs(token) {
      return { language: token.info.trim() };
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
  constructor(schemaArg = defaultSchema, tokenizer = md) {
    super(schemaArg, tokenizer, parserTokens);
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
    for (const key of ["fence", "code_block", "front_matter", "html_block"]) {
      const delegate = h[key];
      h[key] = (state, tok, tokens, i) => captureLiteralEmission(state, tok, () => delegate(state, tok, tokens, i));
    }
    const defaultInline = h["inline"];
    h["inline"] = (state, tok, tokens, i) => captureInlineEmission(state, tok, () => defaultInline(state, tok, tokens, i));
    for (const key of Object.keys(h)) {
      const delegate = h[key];
      h[key] = (state, tok, tokens, i) => captureRootEmission(
        state,
        tok,
        () => captureListEmission(state, tok, () => delegate(state, tok, tokens, i))
      );
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
      state.write(`\`\`\`${lang}
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
      const start = node.attrs.order ?? 1;
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
function writeSourceText(state, node, parent, index) {
  const previous = parent.maybeChild(index - 1), next = parent.maybeChild(index + 1);
  const starts = !previous || previous.type.name === "hardbreak" || node.marks.some((mark) => !previous.marks.some((other) => mark.eq(other)));
  const ends = !next || next.type.name === "hardbreak" || node.marks.some((mark) => !next.marks.some((other) => mark.eq(other)));
  const value = node.text || "";
  const lines = value.split("\n");
  for (let line = 0; line < lines.length; line++) {
    if (line) state.text("\n", false);
    const text2 = lines[line], leading = line > 0 || starts ? /^[ \t]*/.exec(text2)[0].length : 0;
    const trailing = line < lines.length - 1 || ends ? /[ \t]*$/.exec(text2)[0].length : 0;
    const end = Math.max(leading, text2.length - trailing);
    for (let i = 0; i < leading; i++) state.text(text2[i] === "	" ? "&#9;" : "&#32;", false);
    if (end > leading) state.text(text2.slice(leading, end));
    for (let i = end; i < text2.length; i++) state.text(text2[i] === "	" ? "&#9;" : "&#32;", false);
  }
}
function sourceCodeNode(state, node) {
  const language = node.attrs.language;
  if (typeof language !== "string" || /[\r\n]/.test(language)) throw new UnsupportedSourceCapture();
  const info = language, character = info.includes("`") ? "~" : "`";
  const runs = node.textContent.match(character === "`" ? /`+/g : /~+/g) || [];
  let length = 3;
  for (const run of runs) length = Math.max(length, run.length + 1);
  const fence = character.repeat(length);
  state.write(fence + info + "\n");
  state.text(node.textContent, false);
  state.write("\n");
  state.write(fence);
  state.closeBlock(node);
}
function sourceEmDelimiter(mark, parent, index, opening) {
  let from = opening ? index : index - 1, to = from + 1;
  while (from > 0 && mark.isInSet(parent.child(from - 1).marks)) from--;
  while (to < parent.childCount && mark.isInSet(parent.child(to).marks)) to++;
  const left = parent.maybeChild(from - 1), right = parent.maybeChild(to);
  const strong2 = (node) => node?.marks.some((item) => item.type.name === "strong");
  return strong2(left) && /[ \t]$/.test(left.textContent) || strong2(right) && /^[ \t]/.test(right.textContent) ? "_" : "*";
}
function sourceCodeDelimiter(node, opening) {
  const text2 = node.text || "", runs = text2.match(/`+/g) || [];
  let length = 1;
  for (const run of runs) length = Math.max(length, run.length + 1);
  const delimiter = "`".repeat(length);
  const padding = /^`|`$/.test(text2) || /^ .* $/.test(text2) && /[^ ]/.test(text2);
  return opening ? delimiter + (padding ? " " : "") : (padding ? " " : "") + delimiter;
}
var sourceMarks = Object.fromEntries(Object.entries(serializer.marks).map(([name, mark]) => [
  name,
  mark.expelEnclosingWhitespace ? { ...mark, expelEnclosingWhitespace: false } : mark
]));
sourceMarks.em = {
  ...sourceMarks.em,
  open: (_state, mark, parent, index) => sourceEmDelimiter(mark, parent, index, true),
  close: (_state, mark, parent, index) => sourceEmDelimiter(mark, parent, index, false)
};
sourceMarks.code = {
  ...sourceMarks.code,
  open: (_state, _mark, parent, index) => sourceCodeDelimiter(parent.child(index), true),
  close: (_state, _mark, parent, index) => sourceCodeDelimiter(parent.child(index - 1), false)
};
var terminalStarts = /* @__PURE__ */ new WeakMap();
var sourceRootSerializer = new MarkdownSerializer({
  ...serializer.nodes,
  text: writeSourceText,
  code_block: sourceCodeNode,
  list_item(state, node, parent, index) {
    const first = node.firstChild;
    if (node.attrs.checked === null && first?.type.name === "paragraph" && first.content.size === 0 && first.hasMarkup(first.type) && node.childCount > 1 && node.child(1).type.name !== "paragraph") {
      for (let index2 = 1; index2 < node.childCount; index2++) state.render(node.child(index2), node, index2);
    } else serializer.nodes.list_item(state, node, parent, index);
  },
  hardbreak(state, node, parent, index) {
    if (node.attrs.isInline === true) {
      state.write("\n");
      return;
    }
    let start = terminalStarts.get(parent);
    if (start === void 0) {
      start = parent.childCount;
      while (start > 0) {
        const previous = parent.child(start - 1);
        if (previous.type.name !== "hardbreak" || previous.attrs.isInline !== false) break;
        start--;
      }
      terminalStarts.set(parent, start);
    }
    if (index >= start) state.write("\\\n");
    else serializer.nodes.hardbreak(state, node, parent, index);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}, sourceMarks, { hardBreakNodeName: "hardbreak", strict: false });
function serializeSourceInlineBody(node) {
  const inline = new MarkdownSerializer({
    ...sourceRootSerializer.nodes,
    [node.type.name](state, body) {
      state.renderInline(body);
    }
  }, sourceRootSerializer.marks, sourceRootSerializer.options);
  return inline.serialize(node.type.schema.topNodeType.create(null, [node]));
}
function renderSourceList(state, node, style, indent, firstDelim) {
  if (node.attrs.tight !== void 0 && node.attrs.tight !== style.tight) throw new UnsupportedSourceCapture();
  const previous = state.options.tightLists;
  state.options.tightLists = style.tight;
  try {
    state.renderList(node, indent, firstDelim);
  } finally {
    if (previous === void 0) delete state.options.tightLists;
    else state.options.tightLists = previous;
  }
}
function serializeSourceRootMarkdown(doc2, options = {}) {
  const styles = new Map(options.lists?.map((binding) => [binding.node, binding.style]));
  const styleFor = (node) => {
    const style = styles.get(node);
    if (!style) throw new UnsupportedSourceCapture();
    return style;
  };
  const current = new MarkdownSerializer({
    ...sourceRootSerializer.nodes,
    bullet_list(state, node) {
      const style = styleFor(node);
      if (!["-", "+", "*"].includes(style.marker)) throw new UnsupportedSourceCapture();
      renderSourceList(state, node, style, "  ", () => style.marker + " ");
    },
    ordered_list(state, node) {
      const style = styleFor(node), start = node.attrs.order;
      if (![".", ")"].includes(style.marker) || !Number.isInteger(start) || start < 0 || start > 999999999) throw new UnsupportedSourceCapture();
      const number = (i) => start + i <= 999999999 ? start + i : start;
      const width = String(number(node.childCount - 1)).length + 2;
      renderSourceList(state, node, style, " ".repeat(width), (i) => String(number(i)).padStart(width - 2, " ") + style.marker + " ");
    }
  }, sourceRootSerializer.marks, sourceRootSerializer.options);
  const result = current.serialize(doc2, { tightLists: true });
  return result.replace(/\u200B/g, "");
}
function renderTableRow(state, row) {
  const cells = [];
  const s = state;
  row.forEach((cell) => {
    const parts = [];
    cell.forEach((para) => {
      if (para.type.name !== "paragraph") return;
      const savedOut = s.out;
      const savedClosed = s.closed;
      const savedDelim = s.delim;
      s.delim = "";
      s.out = "";
      s.closed = null;
      state.renderInline(para);
      const piece = s.out.replace(/\n/g, " ").trim();
      s.out = savedOut;
      s.closed = savedClosed;
      s.delim = savedDelim;
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
  return captureFilePipeline(source, schema);
}
function finalizeCapturedDocument(collector, doc2) {
  const source = collector.source;
  const text2 = [];
  const occurrences = /* @__PURE__ */ new Set(), emitted = /* @__PURE__ */ new Map();
  for (const emission of collector.emissions) {
    if (!emission.node || emitted.has(emission.node)) throw new UnsupportedSourceCapture();
    emitted.set(emission.node, emission);
  }
  doc2.descendants((parent, offset) => {
    if (!capturedTextParents.includes(parent.type.name)) return;
    const from = offset + 1, emission = emitted.get(parent);
    if (emission) {
      emitted.delete(parent);
      occurrences.add(from);
      if (parent.content.size !== emission.to - emission.from || parent.type.name !== emission.kind) throw new UnsupportedSourceCapture();
      const delta = from - emission.from;
      for (let i = emission.runFrom; i < emission.runTo; i++) {
        const run = collector.runs[i];
        if (run.pmFrom < emission.from || run.pmTo > emission.to) throw new UnsupportedSourceCapture();
        run.pmFrom += delta;
        run.pmTo += delta;
      }
      if (emission.body) collector.bodies.push({ ...emission.body, pmFrom: from, pmTo: from + parent.content.size });
    }
    parent.forEach((node, inner) => {
      if (node.isText) text2.push({ node, parentFrom: from, from: from + inner, to: from + inner + node.nodeSize });
    });
    return false;
  });
  if (emitted.size) throw new UnsupportedSourceCapture();
  let pmEnd = 0, sourceEnd = 0, textIndex = 0;
  for (const run of collector.runs) {
    if (run.pmFrom < pmEnd || run.pmTo <= run.pmFrom || run.pmTo > doc2.content.size || run.sourceFrom < sourceEnd || run.sourceTo <= run.sourceFrom || run.sourceTo > source.length || run.kind === "linear" && run.sourceTo - run.sourceFrom !== run.pmTo - run.pmFrom) {
      throw new UnsupportedSourceCapture();
    }
    while (textIndex < text2.length && text2[textIndex].to <= run.pmFrom) textIndex++;
    const paragraph2 = text2[textIndex]?.parentFrom;
    if (paragraph2 === void 0 || !occurrences.has(paragraph2)) throw new UnsupportedSourceCapture();
    let pos = run.pmFrom;
    while (pos < run.pmTo) {
      const part = text2[textIndex];
      if (!part || part.parentFrom !== paragraph2 || part.from > pos || part.to <= pos || part.node.marks.some((mark) => !capturedTextMarks.includes(mark.type.name))) {
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
  const lists = finishSourceLists(doc2, collector);
  const layout = finishSourceLayout(collector.blankLines, collector.fallback, lists);
  capturedListLayouts.set(layout, { source, doc: doc2, roots: collector.roots, lists, bodies: Object.freeze(collector.bodies.map((body) => Object.freeze(body))) });
  return {
    doc: doc2,
    textRuns: collector.runs,
    protectedSources: Object.freeze(collector.protectedSources),
    layout,
    roots: collector.roots,
    gaps: buildSourceGaps(source, collector.roots, collector.synthetic)
  };
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
function newFileWork() {
  return {
    mode: "unchanged",
    blockWindows: [],
    blockParseCalls: 0,
    topLevelRunnerCalls: 0,
    blockRuleCalls: 0,
    nestedTokenizeCalls: 0,
    blockLinesVisited: 0,
    inlineParseCalls: 0,
    inlineInputUnits: 0,
    inlineRoots: [],
    rawTouchedBeforeRoots: [],
    environmentChanged: false,
    legacyParseCalls: 0,
    fullCaptureCalls: 0,
    pmEmissionTokenCount: 0,
    preprocessedCodeUnits: 0,
    lineTableCodeUnits: 0,
    rawSplicedCodeUnits: 0,
    inlineEffectReplayCount: 0
  };
}
function preprocessFileSource(source) {
  let trace = identityTrace(source);
  if (source.charCodeAt(0) === 65279) trace = editTrace(trace, [{ from: 0, to: 1, text: "" }]);
  const mathEdits = [];
  const math = normalizeMathBlocks(trace.text, mathEdits);
  trace = editTrace(trace, mathEdits);
  if (trace.text !== math) throw new UnsupportedSourceCapture();
  normalizeSmartQuotes(math, (before, after, edits) => {
    if (trace.text !== before) throw new UnsupportedSourceCapture();
    trace = editTrace(trace, edits);
    if (trace.text !== after) throw new UnsupportedSourceCapture();
  });
  return trace;
}
function newFileCollector(source, trace, work) {
  return {
    source,
    trace,
    bodies: [],
    emissions: [],
    lineStarts: [],
    protectedSources: [],
    runs: [],
    roots: [],
    synthetic: [],
    blankLines: [],
    lists: [],
    file: { work, checkpoints: [], definitions: [], blockTokens: [], effects: [] }
  };
}
function cloneTokenValue(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") throw new UnsupportedSourceCapture();
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneTokenValue);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new UnsupportedSourceCapture();
  const copy = Object.create(proto);
  for (const [key, item] of Object.entries(value)) copy[key] = cloneTokenValue(item);
  return copy;
}
function shiftTrace(trace, delta) {
  return delta === 0 ? trace : { text: trace.text, pieces: trace.pieces.map((p) => ({
    ...p,
    sourceFrom: p.sourceFrom + delta,
    sourceTo: p.sourceTo + delta
  })) };
}
function cloneTokenBatch(tokens, collector, rawDelta = 0, lineDelta = 0) {
  const clone = (token) => {
    const copy = Object.create(Object.getPrototypeOf(token));
    for (const [key, value] of Object.entries(token)) {
      if (key !== "children") Object.defineProperty(copy, key, { value: cloneTokenValue(value), writable: true, enumerable: true, configurable: true });
    }
    copy.children = token.children ? token.children.map(clone) : null;
    if (copy.map) copy.map = [copy.map[0] + lineDelta, copy.map[1] + lineDelta];
    if (token.children && copy.children) {
      const owner = owners.get(token.children);
      if (owner) owners.set(copy.children, shiftTrace(owner, rawDelta));
      if (tokenArrays.has(token)) tokenArrays.set(copy, copy.children);
    }
    const provenance = tokenSources.get(token);
    if (provenance) tokenSources.set(copy, { collector, runs: provenance.runs.map((run) => run.trace ? { text: run.text, kind: run.kind, trace: shiftTrace(run.trace, rawDelta) } : { text: run.text }) });
    if (token.type === "inline") {
      const fact = inlineFacts.get(token);
      inlineFacts.set(copy, { collector, ...fact?.kind ? { kind: fact.kind } : {}, ...fact?.trace ? { trace: shiftTrace(fact.trace, rawDelta) } : {} });
    }
    const literal = literalFacts.get(token);
    if (literal) literalFacts.set(copy, { collector, trace: shiftTrace(literal.trace, rawDelta), kind: literal.kind });
    const closed = capturedFenceClosed.get(token);
    if (closed !== void 0) capturedFenceClosed.set(copy, closed);
    return copy;
  };
  return tokens.map(clone);
}
function countTokens(tokens) {
  let count = 0;
  const pending = [tokens];
  while (pending.length) for (const token of pending.pop()) {
    count++;
    if (token.children) pending.push(token.children);
  }
  return count;
}
function emitCapturedTokens(tokens, collector, schema) {
  let batch = cloneTokenBatch(tokens, collector);
  tagPairedHtmlInline(batch);
  fixFootnoteDefMaps(batch);
  prepareListEvents(batch, collector);
  batch = prepareRootEvents(batch, collector);
  collector.file.work.pmEmissionTokenCount += countTokens(batch);
  const tokenizer = Object.create(md);
  let used = false;
  tokenizer.parse = () => {
    if (used) throw new UnsupportedSourceCapture();
    used = true;
    return batch;
  };
  const doc2 = new MorayaMarkdownParser(schema, tokenizer).parse(collector.trace.text, { [captureKey]: collector });
  if (!used) throw new UnsupportedSourceCapture();
  return doc2;
}
function captureFailure(error) {
  return { ok: false, reason: error instanceof UnsupportedSourceCapture || error instanceof UnsupportedOwnership ? "unsupported-source" : "parse-error" };
}
function captureFilePipeline(source, schema, work = newFileWork()) {
  if (!captureAvailable || !fileHooksValid()) return { ok: false, reason: "unsupported-source" };
  try {
    work.fullCaptureCalls++;
    work.blockWindows = [...work.blockWindows, { sourceFrom: 0, sourceTo: source.length }];
    work.preprocessedCodeUnits += source.length;
    const collector = newFileCollector(source, preprocessFileSource(source), work);
    const tokens = _origMdParse(collector.trace.text, { [captureKey]: collector });
    const file = collector.file;
    const cache = {
      source,
      trace: collector.trace,
      lineStarts: collector.lineStarts,
      blockTokens: file.blockTokens,
      inlineTokens: cloneTokenBatch(tokens, collector),
      checkpoints: file.checkpoints,
      definitions: file.definitions,
      effects: file.effects
    };
    const doc2 = emitCapturedTokens(cache.inlineTokens, collector, schema);
    return { ok: true, value: finalizeCapturedDocument(collector, doc2), cache };
  } catch (error) {
    return captureFailure(error);
  }
}
function replayFilePipeline(cache, schema, work = newFileWork()) {
  if (!captureAvailable || !fileHooksValid()) return { ok: false, reason: "unsupported-source" };
  try {
    const collector = newFileCollector(cache.source, cache.trace, work);
    collector.lineStarts = [...cache.lineStarts];
    collector.protectedSources = cache.definitions.filter((d) => d.kind === "reference").map((d) => ({
      kind: "reference-definition",
      sourceFrom: d.sourceFrom,
      sourceTo: d.sourceTo,
      scope: d.scope
    }));
    return { ok: true, value: finalizeCapturedDocument(collector, emitCapturedTokens(cache.inlineTokens, collector, schema)), cache };
  } catch (error) {
    return captureFailure(error);
  }
}
function blockScalars(state) {
  return {
    parentType: state.parentType,
    tight: state.tight,
    blkIndent: state.blkIndent,
    level: state.level,
    ddIndent: state.ddIndent,
    listIndent: state.listIndent
  };
}
function newCheckedBlockState(src, env, tokens, work) {
  const state = new md.block.State(src, md, env, tokens);
  work.lineTableCodeUnits += src.length;
  for (const name of ["bMarks", "eMarks", "tShift", "sCount", "bsCount"]) {
    const table2 = state[name];
    if (!Array.isArray(table2) || table2.length !== state.lineMax + 1) throw new UnsupportedSourceCapture();
    state[name] = new Proxy(table2, { get(target, key, receiver) {
      if (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key)) work.blockLinesVisited++;
      return Reflect.get(target, key, receiver);
    } });
  }
  if (state.src !== src || state.tokens !== tokens || state.env !== env || state.line !== 0 || state.parentType !== "root" || state.level !== 0 || state.ddIndent !== -1 || state.listIndent !== -1)
    throw new UnsupportedSourceCapture();
  return state;
}
function runTopLevelWindow(state, cursor, stopAfterEpilogue, work) {
  work.topLevelRunnerCalls++;
  const file = collectorFor(state).file, rules = md.block.ruler.getRules("");
  const checkpoint = () => ({
    line: cursor.line,
    offset: state.bMarks[cursor.line],
    tokenIndex: state.tokens.length,
    definitionIndex: file.definitions.length,
    hasEmptyLines: cursor.hasEmptyLines,
    state: blockScalars(state)
  });
  file.checkpoints.push(checkpoint());
  while (cursor.line < state.lineMax) {
    state.line = cursor.line = state.skipEmptyLines(cursor.line);
    if (cursor.line >= state.lineMax || state.sCount[cursor.line] < state.blkIndent) break;
    const maxNesting = state.md.options.maxNesting;
    if (typeof maxNesting !== "number") throw new UnsupportedSourceCapture();
    if (state.level >= maxNesting) {
      state.line = state.lineMax;
      break;
    }
    const previous = state.line;
    let accepted = false;
    for (const rule of rules) {
      if (rule(state, cursor.line, state.lineMax, false)) {
        accepted = true;
        break;
      }
    }
    if (!accepted || state.line <= previous) throw new UnsupportedSourceCapture();
    state.tight = !cursor.hasEmptyLines;
    if (state.isEmpty(state.line - 1)) cursor.hasEmptyLines = true;
    cursor.line = state.line;
    if (cursor.line < state.lineMax && state.isEmpty(cursor.line)) {
      cursor.hasEmptyLines = true;
      state.line = ++cursor.line;
    }
    const next = checkpoint();
    file.checkpoints.push(next);
    if (stopAfterEpilogue(next)) return;
  }
}
md.block.parse = function(src, engine, env, tokens) {
  const file = env?.[captureKey]?.file;
  if (!file) return Object.getPrototypeOf(md.block).parse.call(this, src, engine, env, tokens);
  file.work.blockParseCalls++;
  if (!src) return;
  runTopLevelWindow(newCheckedBlockState(src, env, tokens, file.work), { line: 0, hasEmptyLines: false }, () => false, file.work);
};
var originalNestedTokenize = md.block.tokenize;
md.block.tokenize = function(state, start, end) {
  const file = collectorFor(state)?.file;
  if (file) file.work.nestedTokenizeCalls++;
  return originalNestedTokenize.call(this, state, start, end);
};
md.inline.parse = function(src, engine, env, tokens) {
  const file = env?.[captureKey]?.file;
  const outer = file && !file.activeEffects;
  if (file) {
    file.work.inlineParseCalls++;
    file.work.inlineInputUnits += src.length;
    if (outer) {
      file.activeEffects = [];
      file.effects.push(file.activeEffects);
    }
  }
  try {
    return Object.getPrototypeOf(md.inline).parse.call(this, src, engine, env, tokens);
  } finally {
    if (outer) delete file.activeEffects;
  }
};
wrapCaptureRule(md.block.ruler, "footnote_def", function observeFootnoteDefinition(original, state, startLine, endLine, silent) {
  const collector = collectorFor(state), before = state.tokens.length;
  const scope = state.level === 0 && state.blkIndent === 0 ? "top-level" : "nested";
  const result = original(state, startLine, endLine, silent);
  if (!result || silent || !collector?.file) return result;
  const token = state.tokens[before];
  if (token?.type !== "footnote_reference_open" || typeof token.meta?.label !== "string") throw new UnsupportedSourceCapture();
  const from = collector.lineStarts[startLine], to = collector.lineStarts[state.line];
  if (from === void 0 || to === void 0) throw new UnsupportedSourceCapture();
  const raw = rawRange(collector.trace, from, to);
  if (!raw) throw new UnsupportedSourceCapture();
  collector.file.definitions.push({ kind: "footnote", label: token.meta.label, sourceFrom: raw.from, sourceTo: raw.to, scope });
  return result;
}, true);
wrapCaptureRule(md.inline.ruler, "footnote_ref", function observeFootnoteRuntime(original, state, silent) {
  const result = original(state, silent), file = collectorFor(state)?.file;
  if (result && !silent && file) {
    const token = state.tokens[state.tokens.length - 1];
    if (token?.type !== "footnote_ref" || typeof token.meta?.label !== "string" || !file.activeEffects) throw new UnsupportedSourceCapture();
    file.activeEffects.push(token.meta.label);
  }
  return result;
});
for (const entry of md.block.ruler.__rules__) {
  const original = entry.fn;
  md.block.ruler.at(entry.name, (state, start, end, silent) => {
    const file = collectorFor(state)?.file;
    if (file) file.work.blockRuleCalls++;
    return original(state, start, end, silent);
  }, { alt: entry.alt.slice() });
}
var fileRuleSnapshot = [md.core.ruler, md.block.ruler, md.inline.ruler, md.inline.ruler2].map((ruler) => ruler.__rules__.map((r) => ({ name: r.name, fn: r.fn, enabled: r.enabled, alt: [...r.alt] })));
function fileHooksValid() {
  return [md.core.ruler, md.block.ruler, md.inline.ruler, md.inline.ruler2].every((ruler, i) => {
    const current = ruler.__rules__;
    if (!Array.isArray(current)) return false;
    const enabled = current.filter((r) => r.enabled), actual = ruler.getRules("");
    if (enabled.length !== actual.length || enabled.some((r, j) => r.fn !== actual[j])) return false;
    return current.length === fileRuleSnapshot[i].length && current.every((r, j) => {
      const previous = fileRuleSnapshot[i][j];
      return r.name === previous.name && r.fn === previous.fn && r.enabled === previous.enabled && sameTokenData(r.alt, previous.alt);
    });
  }) && md.options.html === true && md.options.linkify === false && md.options.typographer === false && md.options.maxNesting === 100;
}
function sameTokenData(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a, right = b, keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameTokenData(left[key], right[key]));
}
function definitionEnvironment(events) {
  const env = {};
  for (const event of [...events].sort((a, b) => a.sourceFrom - b.sourceFrom)) {
    if (event.kind === "reference") {
      env.references ??= {};
      if (typeof env.references[event.label] === "undefined") env.references[event.label] = { href: event.href, title: event.title };
    } else {
      env.footnotes ??= { refs: {} };
      env.footnotes.refs[":" + event.label] = -1;
    }
  }
  return env;
}
function sameDefinitionEnvironment(a, b) {
  const canonical = (events) => {
    const env = definitionEnvironment(events);
    return JSON.stringify({
      references: Object.entries(env.references ?? {}).sort(([a2], [b2]) => a2.localeCompare(b2)),
      footnotes: Object.keys(env.footnotes?.refs ?? {}).sort()
    });
  };
  return canonical(a) === canonical(b);
}
function replayInlineEffects(labels, env, work) {
  for (const label of labels) {
    const refs = env.footnotes?.refs, key = ":" + label;
    if (!refs || typeof refs[key] !== "number") throw new UnsupportedSourceCapture();
    const list = env.footnotes.list ??= [];
    if (refs[key] < 0) {
      refs[key] = list.length;
      list.push({ label, count: 0 });
    }
    const entry = list[refs[key]];
    if (!entry || entry.label !== label) throw new UnsupportedSourceCapture();
    entry.count++;
    work.inlineEffectReplayCount++;
  }
}
function closedWindowSegments(tokens, checkpoints) {
  const allowed = /* @__PURE__ */ new Set([
    "paragraph",
    "heading",
    "blockquote",
    "bullet_list",
    "ordered_list",
    "list_item",
    "footnote_reference",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td"
  ]);
  if (checkpoints.length < 2) return false;
  for (let i = 1; i < checkpoints.length; i++) {
    const left = checkpoints[i - 1], right = checkpoints[i], stack = [];
    if (left.state.level !== 0 || right.state.level !== 0) return false;
    for (const token of tokens.slice(left.tokenIndex, right.tokenIndex)) {
      if (token.map && (token.map[0] < left.line || token.map[1] > right.line || token.map[0] > token.map[1])) return false;
      if (token.nesting === -1) {
        if (!token.type.endsWith("_close") || stack.pop() !== token.type.slice(0, -6)) return false;
      }
      if (token.level !== stack.length) return false;
      if (token.nesting === 1) {
        const kind = token.type.slice(0, -5);
        if (!token.type.endsWith("_open") || !allowed.has(kind)) return false;
        stack.push(kind);
      } else if (token.nesting === 0 && token.type !== "inline") return false;
    }
    if (stack.length) return false;
  }
  return true;
}
function windowTokenFacts(tokens) {
  return tokens.map((token) => {
    const inline = inlineFacts.get(token), literal = literalFacts.get(token);
    return {
      inline: inline ? { kind: inline.kind, trace: inline.trace } : void 0,
      literal: literal ? { kind: literal.kind, trace: literal.trace } : void 0,
      closed: capturedFenceClosed.get(token),
      children: token.children ? windowTokenFacts(token.children) : void 0
    };
  });
}
function captureFileWindow(cache, source, patches, schema, work, selection) {
  if (!fileHooksValid() || !captureAvailable) return { ok: false, reason: "unsupported-source" };
  if (!patches.length || cache.trace.text !== cache.source || !cache.checkpoints.length) return null;
  try {
    work.preprocessedCodeUnits += source.length;
    const trace = preprocessFileSource(source);
    if (trace.text !== source || /[\r\0]/.test(source)) return null;
    const collector = newFileCollector(source, trace, work), file = collector.file;
    collector.lineStarts = lineStarts(source);
    const { leftIndex, rightIndex } = selection, left = cache.checkpoints[leftIndex];
    if (!closedWindowSegments(cache.blockTokens, cache.checkpoints.slice(leftIndex, rightIndex + 1))) return null;
    if (source.slice(0, left.offset) !== cache.source.slice(0, left.offset)) return null;
    const delta = source.length - cache.source.length;
    const tokens = cloneTokenBatch(cache.blockTokens.slice(0, left.tokenIndex), collector);
    file.definitions = cache.definitions.filter((d) => d.sourceTo <= left.offset).map((d) => ({ ...d }));
    const env = { ...definitionEnvironment(file.definitions), [captureKey]: collector };
    const state = newCheckedBlockState(source, env, tokens, work);
    Object.assign(state, left.state, { line: left.line });
    let matched, matchedIndex = -1;
    const checkpointByOffset = new Map(cache.checkpoints.map((checkpoint, index) => [checkpoint.offset, index]));
    work.blockParseCalls++;
    runTopLevelWindow(state, { line: left.line, hasEmptyLines: left.hasEmptyLines }, (checkpoint) => {
      const oldIndex = checkpointByOffset.get(checkpoint.offset - delta) ?? -1;
      if (oldIndex < rightIndex) return false;
      const previous = cache.checkpoints[oldIndex - 1], old = cache.checkpoints[oldIndex];
      if (JSON.stringify(old.state) !== JSON.stringify(checkpoint.state) || old.hasEmptyLines !== checkpoint.hasEmptyLines || source.slice(checkpoint.offset) !== cache.source.slice(old.offset)) return false;
      const newPrevious = file.checkpoints[file.checkpoints.length - 2];
      if (previous && newPrevious && old.offset < cache.source.length) {
        const sentinelOld = cloneTokenBatch(cache.blockTokens.slice(previous.tokenIndex, old.tokenIndex), collector, delta, checkpoint.line - old.line);
        const sentinelNew = tokens.slice(newPrevious.tokenIndex, checkpoint.tokenIndex);
        if (!sameTokenData(sentinelOld, sentinelNew) || !sameTokenData(windowTokenFacts(sentinelOld), windowTokenFacts(sentinelNew))) return false;
        const oldDefinitions = cache.definitions.filter((d) => previous.offset <= d.sourceFrom && d.sourceFrom < old.offset).map((d) => ({ ...d, sourceFrom: d.sourceFrom + delta, sourceTo: d.sourceTo + delta }));
        const newDefinitions = file.definitions.filter((d) => newPrevious.offset <= d.sourceFrom && d.sourceFrom < checkpoint.offset);
        if (!sameTokenData(oldDefinitions, newDefinitions)) return false;
      }
      matched = checkpoint;
      matchedIndex = oldIndex;
      return true;
    }, work);
    work.blockWindows = [...work.blockWindows, { sourceFrom: left.offset, sourceTo: state.bMarks[state.line] }];
    if (!matched || !closedWindowSegments(tokens, file.checkpoints)) return null;
    const right = cache.checkpoints[matchedIndex], lineDelta = matched.line - right.line;
    const tokenDelta = tokens.length - right.tokenIndex;
    const windowEnd = tokens.length;
    for (const token of cloneTokenBatch(cache.blockTokens.slice(right.tokenIndex), collector, delta, lineDelta)) tokens.push(token);
    for (const definition of cache.definitions) if (definition.sourceFrom >= right.offset)
      file.definitions.push({ ...definition, sourceFrom: definition.sourceFrom + delta, sourceTo: definition.sourceTo + delta });
    file.definitions.sort((a, b) => a.sourceFrom - b.sourceFrom);
    collector.protectedSources = file.definitions.filter((d) => d.kind === "reference").map((d) => ({
      kind: "reference-definition",
      sourceFrom: d.sourceFrom,
      sourceTo: d.sourceTo,
      scope: d.scope
    }));
    const newCheckpoints = cache.checkpoints.slice(0, leftIndex).map((c) => ({ ...c }));
    for (const checkpoint of file.checkpoints) newCheckpoints.push(checkpoint);
    const definitionDelta = file.definitions.length - cache.definitions.length;
    for (const checkpoint of cache.checkpoints.slice(matchedIndex + 1)) newCheckpoints.push({
      ...checkpoint,
      offset: checkpoint.offset + delta,
      line: checkpoint.line + lineDelta,
      tokenIndex: checkpoint.tokenIndex + tokenDelta,
      definitionIndex: checkpoint.definitionIndex + definitionDelta
    });
    file.checkpoints = newCheckpoints;
    file.blockTokens = cloneTokenBatch(tokens, collector);
    const semanticChanged = !sameDefinitionEnvironment(cache.definitions, file.definitions);
    const oldEffects = /* @__PURE__ */ new Map();
    let effectOrdinal = 0;
    for (let i = 0; i < cache.blockTokens.length; i++) if (cache.blockTokens[i].type === "inline")
      oldEffects.set(i, cache.effects[effectOrdinal++]);
    const oldWindowEffects = [];
    for (const [index, effects] of oldEffects) if (index >= left.tokenIndex && index < right.tokenIndex)
      for (const label of effects) oldWindowEffects.push(label);
    let parsedIndices = [];
    const parseInlineSlots = (all) => {
      const batch = cloneTokenBatch(file.blockTokens, collector), passEnv = { ...definitionEnvironment(file.definitions), [captureKey]: collector };
      const windowEffects = [];
      file.effects = [];
      for (let i = 0; i < batch.length; i++) {
        const token = batch[i];
        if (token.type !== "inline") continue;
        const oldIndex = i < left.tokenIndex ? i : i >= windowEnd ? i - tokenDelta : void 0;
        if (!all && oldIndex !== void 0) {
          const effects = oldEffects.get(oldIndex);
          if (!effects || !cache.inlineTokens[oldIndex] || cache.inlineTokens[oldIndex].type !== "inline") throw new UnsupportedSourceCapture();
          batch[i] = cloneTokenBatch([cache.inlineTokens[oldIndex]], collector, i >= windowEnd ? delta : 0, i >= windowEnd ? lineDelta : 0)[0];
          replayInlineEffects(effects, passEnv, work);
          file.effects.push([...effects]);
        } else {
          if (!token.children) throw new UnsupportedSourceCapture();
          md.inline.parse(token.content, md, passEnv, token.children);
          parsedIndices.push(i);
          if (i >= left.tokenIndex && i < windowEnd) for (const label of file.effects[file.effects.length - 1]) windowEffects.push(label);
        }
      }
      return { tokens: batch, env: passEnv, windowEffects };
    };
    let pass = parseInlineSlots(semanticChanged);
    if (!semanticChanged && JSON.stringify(pass.windowEffects) !== JSON.stringify(oldWindowEffects)) pass = parseInlineSlots(true);
    const coreState = new md.core.State(source, md, pass.env);
    coreState.tokens = pass.tokens;
    const coreRules = md.core.ruler.getRules("");
    for (const rule of coreRules.slice(3)) rule(coreState);
    const nextCache = {
      source,
      trace,
      lineStarts: collector.lineStarts,
      blockTokens: file.blockTokens,
      inlineTokens: cloneTokenBatch(coreState.tokens, collector),
      checkpoints: file.checkpoints,
      definitions: file.definitions,
      effects: file.effects
    };
    const doc2 = emitCapturedTokens(nextCache.inlineTokens, collector, schema);
    const value = finalizeCapturedDocument(collector, doc2);
    const dirty = /* @__PURE__ */ new Set();
    let rootIndex = 0;
    for (const index of [...new Set(parsedIndices)].sort((a, b) => a - b)) {
      const map = coreState.tokens[index]?.map;
      if (!map) continue;
      const from = collector.lineStarts[map[0]], to = collector.lineStarts[map[1]];
      while (rootIndex < value.roots.length && value.roots[rootIndex].sourceTo <= from) rootIndex++;
      for (let at = rootIndex; at < value.roots.length && value.roots[at].sourceFrom < to; at++) dirty.add(value.roots[at].id);
    }
    work.inlineRoots = [...dirty].sort((a, b) => a - b);
    if (work.mode !== "full-fallback") work.mode = matchedIndex === rightIndex ? "local" : "expanded";
    return { ok: true, value, cache: nextCache };
  } catch (error) {
    return captureFailure(error);
  }
}
export {
  captureFilePipeline,
  captureFileWindow,
  capturedInlineBodies,
  capturedSourceLists,
  parseDocumentWithSourceCapture,
  parseMarkdown,
  parseMarkdownAsync,
  parseParagraphWithSourceCapture,
  preprocessFileSource,
  replayFilePipeline,
  serializeMarkdown,
  serializeSourceInlineBody,
  serializeSourceRootMarkdown,
  sourceRootHasClosedFences
};
//# sourceMappingURL=markdown.js.map