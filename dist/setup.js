var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/plugins/highlight.ts
var highlight_exports = {};
__export(highlight_exports, {
  createHighlightPlugin: () => createHighlightPlugin
});
import { Plugin as Plugin7, PluginKey as PluginKey7 } from "prosemirror-state";
import { Decoration as Decoration4, DecorationSet as DecorationSet4 } from "prosemirror-view";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import go from "highlight.js/lib/languages/go";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import lua from "highlight.js/lib/languages/lua";
import scss from "highlight.js/lib/languages/scss";
import csharp from "highlight.js/lib/languages/csharp";
import dart from "highlight.js/lib/languages/dart";
import r from "highlight.js/lib/languages/r";
import perl from "highlight.js/lib/languages/perl";
import scala from "highlight.js/lib/languages/scala";
import objectivec from "highlight.js/lib/languages/objectivec";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import ini from "highlight.js/lib/languages/ini";
import powershell from "highlight.js/lib/languages/powershell";
import makefile from "highlight.js/lib/languages/makefile";
import groovy from "highlight.js/lib/languages/groovy";
import elixir from "highlight.js/lib/languages/elixir";
import haskell from "highlight.js/lib/languages/haskell";
import protobuf from "highlight.js/lib/languages/protobuf";
import graphql from "highlight.js/lib/languages/graphql";
import latex from "highlight.js/lib/languages/latex";
import nginx from "highlight.js/lib/languages/nginx";
import shell from "highlight.js/lib/languages/shell";
function scopeToClasses(scope) {
  const parts = scope.split(".");
  const classes = [`hljs-${parts[0]}`];
  for (let i = 1; i < parts.length; i++) {
    classes.push(`${parts[i]}_`);
  }
  return classes;
}
function flattenHljsTree(nodes, parentClasses = []) {
  const result = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      if (node.length > 0) {
        result.push({ text: node, classes: parentClasses });
      }
    } else {
      const classes = node.scope ? [...parentClasses, ...scopeToClasses(node.scope)] : parentClasses;
      if (node.children) {
        result.push(...flattenHljsTree(node.children, classes));
      }
    }
  }
  return result;
}
function hljsCacheKey(language, code2) {
  return language + "\0" + code2;
}
function getDecorations(doc2) {
  const decorations = [];
  doc2.descendants((node, pos) => {
    if (node.type.name !== "code_block") return;
    const language = node.attrs.language || "";
    const code2 = node.textContent;
    if (!code2) return;
    if (!language) return;
    if (!hljs.getLanguage(language)) return;
    const cKey = hljsCacheKey(language, code2);
    const blockStart = pos + 1;
    const cachedSpans = hljsCache.get(cKey);
    if (cachedSpans) {
      for (const span of cachedSpans) {
        const from = blockStart + span.relOffset;
        const to = from + span.length;
        if (from < to) {
          decorations.push(Decoration4.inline(from, to, { class: span.classes }));
        }
      }
      return;
    }
    let result;
    try {
      result = hljs.highlight(code2, { language, ignoreIllegals: true });
    } catch {
      return;
    }
    const emitter = result;
    const rootNode = emitter._emitter?.rootNode ?? emitter._emitter?.root;
    if (!rootNode?.children) return;
    const spans = flattenHljsTree(rootNode.children);
    const toCache = [];
    let offset = 0;
    for (const span of spans) {
      const relOffset = offset;
      const length = span.text.length;
      offset += length;
      if (span.classes.length > 0 && length > 0) {
        const classes = span.classes.join(" ");
        toCache.push({ relOffset, length, classes });
        decorations.push(
          Decoration4.inline(blockStart + relOffset, blockStart + relOffset + length, { class: classes })
        );
      }
    }
    if (hljsCache.size >= HLJS_CACHE_MAX) {
      const oldest = hljsCache.keys().next().value;
      if (oldest !== void 0) hljsCache.delete(oldest);
    }
    hljsCache.set(cKey, toCache);
  });
  return DecorationSet4.create(doc2, decorations);
}
function createHighlightPlugin() {
  let debounceTimer = null;
  let needsRefresh = false;
  let currentView = null;
  return new Plugin7({
    key: highlightPluginKey,
    state: {
      init(_, state) {
        return getDecorations(state.doc);
      },
      apply(tr, decorationSet, _oldState, newState) {
        if (!tr.docChanged) {
          if (needsRefresh) {
            needsRefresh = false;
            return getDecorations(newState.doc);
          }
          return decorationSet;
        }
        if (tr.getMeta("file-switch")) {
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          return getDecorations(newState.doc);
        }
        if (tr.getMeta("full-delete")) {
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          needsRefresh = false;
          return getDecorations(newState.doc);
        }
        const mapped = decorationSet.map(tr.mapping, newState.doc);
        let affectsCodeBlock = false;
        const docSize = newState.doc.content.size;
        tr.mapping.maps.forEach((stepMap) => {
          if (affectsCodeBlock) return;
          stepMap.forEach((from, to) => {
            if (affectsCodeBlock) return;
            newState.doc.nodesBetween(
              Math.max(0, from),
              Math.min(to, docSize),
              (node) => {
                if (node.type.name === "code_block") affectsCodeBlock = true;
                return !affectsCodeBlock;
              }
            );
          });
        });
        if (!affectsCodeBlock) return mapped;
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          needsRefresh = true;
          try {
            if (currentView && !currentView.isDestroyed) {
              currentView.dispatch(currentView.state.tr.setMeta("highlight-refresh", true));
            }
          } catch {
          }
        }, 300);
        return mapped;
      }
    },
    props: {
      decorations(state) {
        return this.getState(state);
      }
    },
    view(editorView) {
      currentView = editorView;
      return {
        destroy() {
          currentView = null;
          if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
        }
      };
    }
  });
}
var highlightPluginKey, HLJS_CACHE_MAX, hljsCache;
var init_highlight = __esm({
  "src/plugins/highlight.ts"() {
    "use strict";
    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("js", javascript);
    hljs.registerLanguage("typescript", typescript);
    hljs.registerLanguage("ts", typescript);
    hljs.registerLanguage("python", python);
    hljs.registerLanguage("py", python);
    hljs.registerLanguage("rust", rust);
    hljs.registerLanguage("rs", rust);
    hljs.registerLanguage("css", css);
    hljs.registerLanguage("html", xml);
    hljs.registerLanguage("xml", xml);
    hljs.registerLanguage("json", json);
    hljs.registerLanguage("bash", bash);
    hljs.registerLanguage("sh", bash);
    hljs.registerLanguage("sql", sql);
    hljs.registerLanguage("java", java);
    hljs.registerLanguage("cpp", cpp);
    hljs.registerLanguage("c", c);
    hljs.registerLanguage("go", go);
    hljs.registerLanguage("ruby", ruby);
    hljs.registerLanguage("rb", ruby);
    hljs.registerLanguage("php", php);
    hljs.registerLanguage("swift", swift);
    hljs.registerLanguage("kotlin", kotlin);
    hljs.registerLanguage("kt", kotlin);
    hljs.registerLanguage("yaml", yaml);
    hljs.registerLanguage("yml", yaml);
    hljs.registerLanguage("markdown", markdown);
    hljs.registerLanguage("md", markdown);
    hljs.registerLanguage("diff", diff);
    hljs.registerLanguage("lua", lua);
    hljs.registerLanguage("scss", scss);
    hljs.registerLanguage("svelte", xml);
    hljs.registerLanguage("jsx", javascript);
    hljs.registerLanguage("tsx", typescript);
    hljs.registerLanguage("csharp", csharp);
    hljs.registerLanguage("cs", csharp);
    hljs.registerLanguage("dart", dart);
    hljs.registerLanguage("r", r);
    hljs.registerLanguage("perl", perl);
    hljs.registerLanguage("pl", perl);
    hljs.registerLanguage("scala", scala);
    hljs.registerLanguage("objectivec", objectivec);
    hljs.registerLanguage("objc", objectivec);
    hljs.registerLanguage("dockerfile", dockerfile);
    hljs.registerLanguage("docker", dockerfile);
    hljs.registerLanguage("ini", ini);
    hljs.registerLanguage("toml", ini);
    hljs.registerLanguage("powershell", powershell);
    hljs.registerLanguage("ps", powershell);
    hljs.registerLanguage("ps1", powershell);
    hljs.registerLanguage("makefile", makefile);
    hljs.registerLanguage("make", makefile);
    hljs.registerLanguage("groovy", groovy);
    hljs.registerLanguage("elixir", elixir);
    hljs.registerLanguage("ex", elixir);
    hljs.registerLanguage("haskell", haskell);
    hljs.registerLanguage("hs", haskell);
    hljs.registerLanguage("protobuf", protobuf);
    hljs.registerLanguage("proto", protobuf);
    hljs.registerLanguage("graphql", graphql);
    hljs.registerLanguage("gql", graphql);
    hljs.registerLanguage("latex", latex);
    hljs.registerLanguage("tex", latex);
    hljs.registerLanguage("nginx", nginx);
    hljs.registerLanguage("nginxconf", nginx);
    hljs.registerLanguage("shell", shell);
    highlightPluginKey = new PluginKey7("moraya-syntax-highlight");
    HLJS_CACHE_MAX = 100;
    hljsCache = /* @__PURE__ */ new Map();
  }
});

// src/plugins/emoji.ts
var emoji_exports = {};
__export(emoji_exports, {
  createEmojiPlugin: () => createEmojiPlugin
});
import { Plugin as Plugin8, PluginKey as PluginKey8 } from "prosemirror-state";
import { get as getEmoji } from "node-emoji";
function createEmojiPlugin() {
  return new Plugin8({
    key: emojiPluginKey,
    props: {
      handleTextInput(view, from, to, text2) {
        if (text2 !== ":") return false;
        const { state } = view;
        const $pos = state.doc.resolve(from);
        const textBefore = $pos.parent.textBetween(
          0,
          $pos.parentOffset,
          void 0,
          "\uFFFC"
        );
        const lastColon = textBefore.lastIndexOf(":");
        if (lastColon === -1) return false;
        const shortcode = textBefore.slice(lastColon + 1);
        if (!shortcode || !/^[a-zA-Z0-9_+-]+$/.test(shortcode)) return false;
        const emoji = getEmoji(shortcode);
        if (!emoji) return false;
        const openColonOffset = textBefore.length - lastColon;
        const replaceFrom = from - openColonOffset;
        const tr = state.tr.replaceWith(
          replaceFrom,
          to,
          // `to` is where the closing ":" would be inserted
          state.schema.text(emoji)
        );
        view.dispatch(tr);
        return true;
      }
    }
  });
}
var emojiPluginKey;
var init_emoji = __esm({
  "src/plugins/emoji.ts"() {
    "use strict";
    emojiPluginKey = new PluginKey8("moraya-emoji");
  }
});

// src/plugins/mermaid-renderer.ts
var mermaid_renderer_exports = {};
__export(mermaid_renderer_exports, {
  ensureMermaidLoaded: () => ensureMermaidLoaded,
  renderMermaid: () => renderMermaid,
  updateMermaidTheme: () => updateMermaidTheme
});
function isDark() {
  if (typeof document === "undefined") return false;
  const dt = document.documentElement.getAttribute("data-theme");
  if (dt === "dark") return true;
  if (dt === "light") return false;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function resolveThemeColors() {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") {
    return {
      primaryColor: "#4a90d9",
      primaryTextColor: "#333",
      primaryBorderColor: "#ccc",
      lineColor: "#666",
      secondaryColor: "#f5f5f5",
      tertiaryColor: "#eee"
    };
  }
  const s = getComputedStyle(document.documentElement);
  return {
    primaryColor: s.getPropertyValue("--accent-color").trim() || "#4a90d9",
    primaryTextColor: s.getPropertyValue("--text-primary").trim() || "#333",
    primaryBorderColor: s.getPropertyValue("--border-color").trim() || "#ccc",
    lineColor: s.getPropertyValue("--text-secondary").trim() || "#666",
    secondaryColor: s.getPropertyValue("--bg-secondary").trim() || "#f5f5f5",
    tertiaryColor: s.getPropertyValue("--bg-hover").trim() || "#eee"
  };
}
async function ensureMermaidLoaded() {
  if (mermaidModule) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const mod = await import(
      /* @vite-ignore */
      "mermaid"
    );
    mermaidModule = mod.default;
    mermaidModule.initialize({
      startOnLoad: false,
      theme: isDark() ? "dark" : "default",
      themeVariables: resolveThemeColors()
    });
  })();
  return loadingPromise;
}
async function renderMermaid(code2) {
  await ensureMermaidLoaded();
  const result = new Promise((resolve) => {
    renderQueue = renderQueue.then(async () => {
      const id = `mermaid-${++renderCounter}`;
      try {
        const { svg } = await mermaidModule.render(id, code2);
        resolve({ svg });
      } catch (e) {
        resolve({ error: e instanceof Error ? e.message : "Render failed" });
      }
    });
  });
  return result;
}
function updateMermaidTheme() {
  if (!mermaidModule) return;
  mermaidModule.initialize({
    startOnLoad: false,
    theme: isDark() ? "dark" : "default",
    themeVariables: resolveThemeColors()
  });
}
var mermaidModule, loadingPromise, renderCounter, renderQueue;
var init_mermaid_renderer = __esm({
  "src/plugins/mermaid-renderer.ts"() {
    "use strict";
    mermaidModule = null;
    loadingPromise = null;
    renderCounter = 0;
    renderQueue = Promise.resolve();
  }
});

// src/plugins/code-block-view.ts
var code_block_view_exports = {};
__export(code_block_view_exports, {
  createCodeBlockNodeViewFactory: () => createCodeBlockNodeViewFactory
});
function loadMermaidApi() {
  if (mermaidApi) return Promise.resolve(mermaidApi);
  if (mermaidLoading) return mermaidLoading;
  mermaidLoading = Promise.resolve().then(() => (init_mermaid_renderer(), mermaid_renderer_exports)).then((mod) => {
    mermaidApi = mod;
    return mermaidApi;
  });
  return mermaidLoading;
}
function installThemeObserver() {
  if (themeObserverInstalled) return;
  themeObserverInstalled = true;
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  const notifyThemeChange = () => {
    if (mermaidApi) mermaidApi.updateMermaidTheme();
    for (const cb of mermaidReRenderCallbacks) cb();
  };
  const observer = new MutationObserver(notifyThemeChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });
  if (typeof window !== "undefined" && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", notifyThemeChange);
  }
}
function buildLanguageLists(registry) {
  const rendererLangIds = registry ? new Set(Object.keys(registry.versions)) : /* @__PURE__ */ new Set();
  const rendererPlugins = registry ? Object.keys(registry.versions).sort().map((id) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    aliases: []
  })) : [];
  const all = [
    ...POPULAR_LANGUAGES,
    ...BASE_OTHER_LANGUAGES,
    ...rendererPlugins
  ].sort((a, b) => a.label.localeCompare(b.label));
  return { popular: POPULAR_LANGUAGES, rendererPlugins, all, rendererLangIds };
}
function findLanguageLabel(langId, all) {
  if (!langId) return "text";
  const entry = all.find(
    (l) => l.id === langId || l.aliases.includes(langId)
  );
  return entry ? entry.label : langId;
}
async function getAutoDetect() {
  if (hljsAutoDetect) return hljsAutoDetect;
  try {
    const hljs2 = (await import("highlight.js/lib/core")).default;
    hljsAutoDetect = (code2) => {
      if (!code2.trim() || code2.length < 10) return null;
      try {
        const result = hljs2.highlightAuto(code2);
        if (result.language && result.relevance > 5) {
          return result.language;
        }
      } catch {
      }
      return null;
    };
  } catch {
    hljsAutoDetect = () => null;
  }
  return hljsAutoDetect;
}
function createLanguagePicker(container, anchor, currentLang, codeContent, langLists, onSelect, onDismiss) {
  const { popular, rendererPlugins, all } = langLists;
  const picker = document.createElement("div");
  picker.className = "code-lang-picker";
  picker.setAttribute("contenteditable", "false");
  picker.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
  picker.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  const searchWrap = document.createElement("div");
  searchWrap.className = "code-lang-search";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "code-lang-search-input";
  searchInput.placeholder = "Search language...";
  searchInput.autocomplete = "off";
  searchInput.setAttribute("autocorrect", "off");
  searchInput.setAttribute("autocapitalize", "off");
  searchInput.spellcheck = false;
  searchWrap.appendChild(searchInput);
  picker.appendChild(searchWrap);
  const listEl = document.createElement("div");
  listEl.className = "code-lang-list";
  picker.appendChild(listEl);
  let detectedLang = null;
  function renderList(filter) {
    listEl.innerHTML = "";
    const lowerFilter = filter.toLowerCase();
    const matchesFilter = (entry) => {
      if (!lowerFilter) return true;
      return entry.id.includes(lowerFilter) || entry.label.toLowerCase().includes(lowerFilter) || entry.aliases.some((a) => a.includes(lowerFilter));
    };
    if (detectedLang && !lowerFilter && detectedLang !== currentLang) {
      const label = findLanguageLabel(detectedLang, all);
      const suggestEl = document.createElement("div");
      suggestEl.className = "code-lang-suggestion";
      suggestEl.innerHTML = `<span class="suggestion-icon">\u2726</span> ${label} <span class="suggestion-hint">detected</span>`;
      suggestEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(detectedLang);
        destroy();
      });
      listEl.appendChild(suggestEl);
      const divider = document.createElement("div");
      divider.className = "code-lang-divider";
      listEl.appendChild(divider);
    }
    const popularMatches = popular.filter(matchesFilter);
    if (popularMatches.length > 0 && !lowerFilter) {
      const groupLabel = document.createElement("div");
      groupLabel.className = "code-lang-group-label";
      groupLabel.textContent = "Popular";
      listEl.appendChild(groupLabel);
      for (const lang of popularMatches) {
        listEl.appendChild(createOption(lang));
      }
      const rendererIds = new Set(rendererPlugins.map((l) => l.id));
      const others = all.filter(
        (l) => !POPULAR_IDS.has(l.id) && !rendererIds.has(l.id) && matchesFilter(l)
      );
      if (others.length > 0) {
        const divider = document.createElement("div");
        divider.className = "code-lang-divider";
        listEl.appendChild(divider);
        const allLabel = document.createElement("div");
        allLabel.className = "code-lang-group-label";
        allLabel.textContent = "All";
        listEl.appendChild(allLabel);
        for (const lang of others) {
          listEl.appendChild(createOption(lang));
        }
      }
      const rendererMatches = rendererPlugins.filter(matchesFilter);
      if (rendererMatches.length > 0) {
        const divider2 = document.createElement("div");
        divider2.className = "code-lang-divider";
        listEl.appendChild(divider2);
        const rendererLabel = document.createElement("div");
        rendererLabel.className = "code-lang-group-label";
        rendererLabel.textContent = "Renderer Plugins";
        listEl.appendChild(rendererLabel);
        for (const lang of rendererMatches) {
          listEl.appendChild(createOption(lang));
        }
      }
    } else {
      const matches = all.filter(matchesFilter);
      for (const lang of matches) {
        listEl.appendChild(createOption(lang));
      }
      if (matches.length === 0) {
        const empty = document.createElement("div");
        empty.className = "code-lang-empty";
        empty.textContent = "No matches";
        listEl.appendChild(empty);
      }
    }
  }
  function createOption(lang) {
    const option = document.createElement("div");
    option.className = "code-lang-option";
    if (lang.id === currentLang) option.classList.add("selected");
    option.textContent = lang.label;
    option.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(lang.id);
      destroy();
    });
    return option;
  }
  renderList("");
  searchInput.addEventListener("input", () => {
    renderList(searchInput.value);
  });
  searchInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      destroy();
    }
  });
  const pickerHost = container.closest(".editor-wrapper") ?? document.body;
  pickerHost.appendChild(picker);
  (function positionPicker() {
    const rect = anchor.getBoundingClientRect();
    picker.style.position = "fixed";
    picker.style.top = `${rect.bottom + 2}px`;
    picker.style.left = `${rect.left}px`;
  })();
  requestAnimationFrame(() => searchInput.focus());
  getAutoDetect().then((detect) => {
    detectedLang = detect(codeContent);
    if (detectedLang && !searchInput.value) {
      renderList("");
    }
  });
  function handleOutsideClick(e) {
    if (!picker.contains(e.target) && !anchor.contains(e.target)) {
      destroy();
    }
  }
  function handleKeydown(e) {
    if (e.key === "Escape") {
      destroy();
    }
  }
  setTimeout(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeydown, true);
  }, 0);
  function destroy() {
    document.removeEventListener("mousedown", handleOutsideClick);
    document.removeEventListener("keydown", handleKeydown, true);
    picker.remove();
    onDismiss?.();
  }
  return { destroy };
}
function escapeText(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
function markCopied(btn) {
  btn.classList.add("copied");
  btn.title = "Copied!";
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.title = "Copy";
  }, 1500);
}
function handleCopy(btn, codeEl) {
  const text2 = codeEl.textContent || "";
  navigator.clipboard.writeText(text2).then(() => markCopied(btn));
}
function resolveBackground(el) {
  const bg = getComputedStyle(el).backgroundColor;
  if (!bg || bg === "transparent" || /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg)) {
    return "#ffffff";
  }
  return bg;
}
async function svgToPngBlob(svg, background) {
  const scale = 2;
  let w = 0;
  let h = 0;
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    w = vb.width;
    h = vb.height;
  } else {
    const rect = svg.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
  }
  if (!(w > 0 && h > 0)) throw new Error("svg has no measurable size");
  const clone = svg.cloneNode(true);
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const svgStr = new XMLSerializer().serializeToString(clone);
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("svg image load failed"));
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.scale(scale, scale);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("toBlob returned null")), "image/png");
  });
}
function copyPreviewAsImage(btn, preview, codeEl) {
  const svg = preview.querySelector("svg");
  const canWriteImage = typeof ClipboardItem !== "undefined" && !!navigator.clipboard && typeof navigator.clipboard.write === "function";
  if (!svg || !canWriteImage) {
    handleCopy(btn, codeEl);
    return;
  }
  const blobPromise = svgToPngBlob(svg, resolveBackground(preview));
  navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]).then(() => markCopied(btn)).catch(() => handleCopy(btn, codeEl));
}
function createCodeBlockNodeViewFactory(opts = {}) {
  const { rendererRegistry } = opts;
  const langLists = buildLanguageLists(rendererRegistry);
  const { rendererLangIds, all: allLanguages } = langLists;
  return function createCodeBlockNodeView(nodeArg, view, getPos) {
    let node = nodeArg;
    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";
    const toolbar = document.createElement("div");
    toolbar.className = "code-block-toolbar";
    toolbar.setAttribute("contenteditable", "false");
    const langLabel = document.createElement("span");
    langLabel.className = "code-lang-label";
    langLabel.textContent = findLanguageLabel(node.attrs.language || "", allLanguages);
    langLabel.title = "Change language";
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "mermaid-toggle-btn";
    toggleBtn.type = "button";
    const copyBtn = document.createElement("button");
    copyBtn.className = "code-copy-btn";
    copyBtn.title = "Copy";
    copyBtn.type = "button";
    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    const toolbarRight = document.createElement("div");
    toolbarRight.className = "code-toolbar-right";
    toolbarRight.appendChild(toggleBtn);
    toolbarRight.appendChild(copyBtn);
    toolbar.appendChild(langLabel);
    toolbar.appendChild(toolbarRight);
    const pre = document.createElement("pre");
    pre.className = "code-block-pre";
    const code2 = document.createElement("code");
    code2.className = "code-block-code";
    pre.appendChild(code2);
    const mermaidPreview = document.createElement("div");
    mermaidPreview.className = "mermaid-preview";
    mermaidPreview.setAttribute("contenteditable", "false");
    mermaidPreview.style.display = "none";
    const rendererPreview = document.createElement("div");
    rendererPreview.className = "renderer-preview";
    rendererPreview.setAttribute("contenteditable", "false");
    rendererPreview.style.display = "none";
    wrapper.appendChild(toolbar);
    wrapper.appendChild(pre);
    wrapper.appendChild(mermaidPreview);
    wrapper.appendChild(rendererPreview);
    let isEditing = false;
    let isMermaid = node.attrs.language === "mermaid";
    let lastRenderedCode = "";
    let renderTimer = null;
    let isRenderer = rendererLangIds.has(node.attrs.language || "");
    let rendererEditing = false;
    let lastRendererCode = "";
    let rendererTimer = null;
    let currentRendererModule = null;
    function syncMermaidMode() {
      const showPreview = isMermaid && !isEditing;
      pre.style.display = showPreview || isRenderer && !rendererEditing ? "none" : "";
      mermaidPreview.style.display = showPreview ? "flex" : "none";
      toggleBtn.style.display = isMermaid || isRenderer ? "inline-flex" : "none";
      wrapper.classList.toggle("mermaid-preview-mode", showPreview);
      if (isMermaid) {
        toggleBtn.textContent = isEditing ? "\u{1F441} Preview" : "\u270F\uFE0F Edit";
        if (showPreview) triggerMermaidRender();
      }
    }
    function triggerMermaidRender() {
      const codeText = code2.textContent || "";
      if (!codeText.trim()) {
        mermaidPreview.innerHTML = '<div class="mermaid-empty">Empty diagram</div>';
        lastRenderedCode = "";
        return;
      }
      if (codeText === lastRenderedCode) return;
      lastRenderedCode = codeText;
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(async () => {
        mermaidPreview.innerHTML = '<div class="mermaid-loading"><div class="mermaid-spinner"></div>Loading diagram...</div>';
        try {
          const api = await loadMermaidApi();
          if (!api) return;
          const result = await api.renderMermaid(codeText);
          if (code2.textContent !== codeText) return;
          if ("svg" in result) {
            mermaidPreview.innerHTML = result.svg;
          } else {
            mermaidPreview.innerHTML = `<div class="mermaid-error">${escapeText(result.error)}</div>`;
          }
        } catch {
          mermaidPreview.innerHTML = '<div class="mermaid-error">Render failed</div>';
        }
      }, 150);
    }
    function syncRendererMode() {
      const showPreview = isRenderer && !rendererEditing;
      pre.style.display = showPreview || isMermaid && !isEditing ? "none" : "";
      rendererPreview.style.display = showPreview ? "block" : "none";
      toggleBtn.style.display = isMermaid || isRenderer ? "inline-flex" : "none";
      wrapper.classList.toggle("renderer-preview-mode", showPreview);
      if (isRenderer) {
        toggleBtn.textContent = rendererEditing ? "\u{1F441} Preview" : "\u270F\uFE0F Edit";
        if (showPreview) triggerRendererRender();
      }
    }
    function triggerRendererRender() {
      const source = code2.textContent || "";
      const lang = node.attrs.language || "";
      if (!rendererRegistry || !rendererRegistry.has(lang)) return;
      if (!source.trim()) {
        rendererPreview.innerHTML = '<div class="renderer-empty">Empty block</div>';
        lastRendererCode = "";
        return;
      }
      if (source === lastRendererCode) return;
      lastRendererCode = source;
      if (rendererTimer) clearTimeout(rendererTimer);
      rendererTimer = setTimeout(async () => {
        rendererPreview.innerHTML = '<div class="renderer-loading"><div class="renderer-spinner"></div>Rendering...</div>';
        try {
          const module = await rendererRegistry.load(lang);
          if (code2.textContent !== source) return;
          if (currentRendererModule?.destroy) {
            try {
              currentRendererModule.destroy(rendererPreview);
            } catch {
            }
          }
          currentRendererModule = module;
          rendererPreview.innerHTML = "";
          try {
            await module.render(source, rendererPreview);
          } catch (e) {
            rendererPreview.innerHTML = `<div class="renderer-error" data-language="${escapeText(lang)}" data-error="${escapeText(String(e))}">[Renderer ${escapeText(lang)} failed]</div>`;
          }
        } catch (e) {
          rendererPreview.innerHTML = `<div class="renderer-error" data-language="${escapeText(lang)}" data-error="${escapeText(String(e))}">[Renderer ${escapeText(lang)} failed]</div>`;
        }
      }, 150);
    }
    function onThemeChange() {
      if (isMermaid && !isEditing) {
        lastRenderedCode = "";
        triggerMermaidRender();
      }
    }
    if (isMermaid) {
      installThemeObserver();
      mermaidReRenderCallbacks.add(onThemeChange);
      requestAnimationFrame(() => syncMermaidMode());
    } else if (isRenderer) {
      syncRendererMode();
      requestAnimationFrame(() => syncRendererMode());
    } else {
      syncMermaidMode();
    }
    let activePicker = null;
    langLabel.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activePicker) {
        activePicker.destroy();
        activePicker = null;
        wrapper.classList.remove("picker-open");
        return;
      }
      const currentLang = node.attrs.language || "";
      const codeContent = code2.textContent || "";
      wrapper.classList.add("picker-open");
      activePicker = createLanguagePicker(
        wrapper,
        langLabel,
        currentLang,
        codeContent,
        langLists,
        (newLang) => {
          activePicker = null;
          wrapper.classList.remove("picker-open");
          const pos = getPos();
          if (pos === void 0) return;
          view.dispatch(
            view.state.tr.setNodeMarkup(pos, void 0, {
              ...node.attrs,
              language: newLang
            })
          );
          view.focus();
        },
        () => {
          activePicker = null;
          wrapper.classList.remove("picker-open");
        }
      );
    });
    toggleBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMermaid) {
        isEditing = !isEditing;
        syncMermaidMode();
      } else if (isRenderer) {
        rendererEditing = !rendererEditing;
        syncRendererMode();
      }
      if (isEditing || rendererEditing) view.focus();
    });
    mermaidPreview.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      isEditing = true;
      syncMermaidMode();
      view.focus();
    });
    copyBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMermaid && !isEditing) {
        copyPreviewAsImage(copyBtn, mermaidPreview, code2);
      } else if (isRenderer && !rendererEditing) {
        copyPreviewAsImage(copyBtn, rendererPreview, code2);
      } else {
        handleCopy(copyBtn, code2);
      }
    });
    return {
      dom: wrapper,
      contentDOM: code2,
      stopEvent(event) {
        const target = event.target;
        return !code2.contains(target) && wrapper.contains(target) && target !== code2;
      },
      ignoreMutation(mutation) {
        return !code2.contains(mutation.target);
      },
      update(updatedNode) {
        if (updatedNode.type.name !== "code_block") return false;
        node = updatedNode;
        langLabel.textContent = findLanguageLabel(updatedNode.attrs.language || "", allLanguages);
        const wasMermaid = isMermaid;
        isMermaid = updatedNode.attrs.language === "mermaid";
        if (isMermaid !== wasMermaid) {
          isEditing = false;
          if (isMermaid) {
            installThemeObserver();
            mermaidReRenderCallbacks.add(onThemeChange);
          } else {
            mermaidReRenderCallbacks.delete(onThemeChange);
          }
        }
        const wasRenderer = isRenderer;
        isRenderer = rendererLangIds.has(updatedNode.attrs.language || "");
        if (isRenderer !== wasRenderer) {
          rendererEditing = false;
          lastRendererCode = "";
          rendererPreview.innerHTML = "";
          if (!isRenderer && currentRendererModule?.destroy) {
            try {
              currentRendererModule.destroy(rendererPreview);
            } catch {
            }
            currentRendererModule = null;
          }
        }
        if (isRenderer) {
          syncRendererMode();
        } else {
          rendererPreview.style.display = "none";
          wrapper.classList.remove("renderer-preview-mode");
          syncMermaidMode();
        }
        return true;
      },
      selectNode() {
        wrapper.classList.add("ProseMirror-selectednode");
      },
      deselectNode() {
        wrapper.classList.remove("ProseMirror-selectednode");
      },
      destroy() {
        if (activePicker) {
          activePicker.destroy();
          activePicker = null;
        }
        if (renderTimer) clearTimeout(renderTimer);
        if (rendererTimer) clearTimeout(rendererTimer);
        if (currentRendererModule?.destroy) {
          try {
            currentRendererModule.destroy(rendererPreview);
          } catch {
          }
        }
        currentRendererModule = null;
        mermaidReRenderCallbacks.delete(onThemeChange);
      }
    };
  };
}
var mermaidApi, mermaidLoading, themeObserverInstalled, mermaidReRenderCallbacks, POPULAR_LANGUAGES, BASE_OTHER_LANGUAGES, POPULAR_IDS, hljsAutoDetect;
var init_code_block_view = __esm({
  "src/plugins/code-block-view.ts"() {
    "use strict";
    mermaidApi = null;
    mermaidLoading = null;
    themeObserverInstalled = false;
    mermaidReRenderCallbacks = /* @__PURE__ */ new Set();
    POPULAR_LANGUAGES = [
      { id: "javascript", label: "JavaScript", aliases: ["js"] },
      { id: "typescript", label: "TypeScript", aliases: ["ts"] },
      { id: "python", label: "Python", aliases: ["py"] },
      { id: "java", label: "Java", aliases: [] },
      { id: "go", label: "Go", aliases: ["golang"] },
      { id: "rust", label: "Rust", aliases: ["rs"] },
      { id: "c", label: "C", aliases: [] },
      { id: "cpp", label: "C++", aliases: ["c++"] },
      { id: "ruby", label: "Ruby", aliases: ["rb"] },
      { id: "php", label: "PHP", aliases: [] },
      { id: "swift", label: "Swift", aliases: [] },
      { id: "kotlin", label: "Kotlin", aliases: ["kt"] },
      { id: "sql", label: "SQL", aliases: [] },
      { id: "bash", label: "Bash", aliases: ["sh", "shell"] },
      { id: "json", label: "JSON", aliases: [] },
      { id: "yaml", label: "YAML", aliases: ["yml"] },
      { id: "html", label: "HTML", aliases: ["xml"] },
      { id: "css", label: "CSS", aliases: [] },
      { id: "csharp", label: "C#", aliases: ["cs"] },
      { id: "dart", label: "Dart", aliases: [] },
      { id: "r", label: "R", aliases: [] },
      { id: "dockerfile", label: "Dockerfile", aliases: ["docker"] },
      { id: "graphql", label: "GraphQL", aliases: ["gql"] },
      { id: "markdown", label: "Markdown", aliases: ["md"] },
      { id: "text", label: "Plain Text", aliases: ["plaintext", "txt"] },
      { id: "prompt", label: "Prompt", aliases: ["image-prompts", "image-prompt"] },
      { id: "system", label: "System Prompt", aliases: ["system-prompt"] }
    ];
    BASE_OTHER_LANGUAGES = [
      { id: "scss", label: "SCSS", aliases: [] },
      { id: "lua", label: "Lua", aliases: [] },
      { id: "diff", label: "Diff", aliases: [] },
      { id: "perl", label: "Perl", aliases: ["pl"] },
      { id: "scala", label: "Scala", aliases: [] },
      { id: "objectivec", label: "Objective-C", aliases: ["objc"] },
      { id: "ini", label: "TOML / INI", aliases: ["toml"] },
      { id: "powershell", label: "PowerShell", aliases: ["ps", "ps1"] },
      { id: "makefile", label: "Makefile", aliases: ["make"] },
      { id: "groovy", label: "Groovy", aliases: [] },
      { id: "elixir", label: "Elixir", aliases: ["ex"] },
      { id: "haskell", label: "Haskell", aliases: ["hs"] },
      { id: "protobuf", label: "Protobuf", aliases: ["proto"] },
      { id: "latex", label: "LaTeX", aliases: ["tex"] },
      { id: "nginx", label: "Nginx", aliases: ["nginxconf"] },
      { id: "shell", label: "Shell Session", aliases: [] },
      { id: "mermaid", label: "Mermaid", aliases: [] }
    ];
    POPULAR_IDS = new Set(POPULAR_LANGUAGES.map((l) => l.id));
    hljsAutoDetect = null;
  }
});

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
    const send = (tr2, tablePos, column2) => dispatch(tr2.setMeta("moraya:gfm-table-operation", { v: 1, kind: action.kind, tablePos, column: column2 }));
    const freshCell = (header, alignment) => (header ? table_header2 : table_cell2).createAndFill({ alignment, colspan: 1, rowspan: 1, colwidth: null });
    if (action.kind === "insert") {
      if (!dispatch) return true;
      const tableNode = table2.create(null, [
        table_header_row2.create(null, Array.from({ length: 3 }, () => freshCell(true, "left"))),
        ...Array.from({ length: 2 }, () => table_row2.create(null, Array.from({ length: 3 }, () => freshCell(false, "left"))))
      ]);
      const tr2 = state.tr.replaceSelectionWith(tableNode);
      let tablePos = 0;
      tr2.doc.descendants((node, pos) => {
        if (node === tableNode) {
          tr2.setSelection(TextSelection.near(tr2.doc.resolve(pos + 3)));
          tablePos = pos;
          return false;
        }
        return true;
      });
      send(tr2.scrollIntoView(), tablePos, 0);
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
      send(tr2, context.pos, context.column);
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
    send(tr, context.pos, context.column);
    return true;
  };
}

// src/setup.ts
import {
  AllSelection as AllSelection2,
  EditorState,
  NodeSelection,
  Plugin as Plugin9,
  PluginKey as PluginKey9,
  Selection,
  TextSelection as TextSelection5
} from "prosemirror-state";
import { Decoration as Decoration5, DecorationSet as DecorationSet5, EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { history, redo, undo } from "prosemirror-history";
import {
  baseKeymap,
  joinForward,
  setBlockType as setBlockType2,
  toggleMark as toggleMark2,
  wrapIn as wrapIn2
} from "prosemirror-commands";
import {
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule as wrappingInputRule2,
  InputRule
} from "prosemirror-inputrules";
import {
  liftListItem as liftListItem2,
  sinkListItem,
  splitListItem
} from "prosemirror-schema-list";
import { dropCursor } from "prosemirror-dropcursor";
import { columnResizing } from "prosemirror-tables";

// src/schema.ts
import { Schema, Fragment } from "prosemirror-model";
import katex from "katex";

// src/types.ts
var NULL_MEDIA_RESOLVER_SENTINEL = /* @__PURE__ */ Symbol("@moraya/core:null-media-resolver");
function isNullMediaResolver(r2) {
  return r2[NULL_MEDIA_RESOLVER_SENTINEL] === true;
}

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
var schemaCache = /* @__PURE__ */ new WeakMap();
function createSchema(config) {
  if (!config || typeof config !== "object") {
    throw new TypeError("@moraya/core: createSchema() requires a config object with a MediaResolver");
  }
  if (!config.mediaResolver) {
    throw new TypeError("@moraya/core: createSchema() requires a MediaResolver");
  }
  if (isNullMediaResolver(config.mediaResolver)) {
    throw new TypeError(
      "@moraya/core: do not pass nullMediaResolver to createSchema(). That instance is reserved for parseMarkdown/serializeMarkdown internal use only. Provide a real MediaResolver implementation (e.g. BrowserMediaResolver from '@moraya/core/adapters/browser-media-resolver')."
    );
  }
  const cached = schemaCache.get(config.mediaResolver);
  if (cached) return cached;
  const schema = new Schema({
    nodes: buildNodes(config.mediaResolver),
    marks
  });
  schemaCache.set(config.mediaResolver, schema);
  return schema;
}

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
function traceTableRow(trace, from, to, actual, onEmpty) {
  const row = sliceTrace(trace, from, to), left = row.text.length - row.text.trimStart().length;
  const trimmed = sliceTrace(row, left, left + row.text.trim().length);
  const cells = [], bounds = [];
  let start = 0, escaped = false;
  let edits = [];
  const append = (end) => {
    bounds.push({ from: from + left + start, to: from + left + end });
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
  if (cells[0]?.text === "") {
    cells.shift();
    bounds.shift();
  }
  const closingPipe = cells[cells.length - 1]?.text === "";
  if (closingPipe) {
    cells.pop();
    bounds.pop();
  }
  const projected = actual.map((value, i) => {
    const cell = cells[i];
    if (!cell) return void 0;
    const leading = cell.text.length - cell.text.trimStart().length;
    return sliceTrace(cell, leading, leading + cell.text.trim().length);
  });
  if (projected.some((cell, i) => (cell?.text ?? "") !== actual[i])) return void 0;
  for (let slot = 0; slot < actual.length; slot++) if (actual[slot] === "") {
    const bound = bounds[slot], rowEnd = from + left + trimmed.text.length;
    onEmpty?.({ slot, from: bound?.from ?? rowEnd, to: bound?.to ?? rowEnd, missing: !bound, present: cells.length, closingPipe, rowEnd });
  }
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
    const opened = state.push("caret_highlight_open", "mark", 1);
    opened.markup = "^^";
    const oldPos = state.pos;
    const oldMax = state.posMax;
    state.pos = contentStart;
    state.posMax = closeIdx;
    state.md.inline.tokenize(state);
    state.pos = oldPos;
    state.posMax = oldMax;
    const closed = state.push("caret_highlight_close", "mark", -1);
    closed.markup = "^^";
    const trace = inlineStateOwners.get(state);
    if (trace) registerEdge(opened, closed, trace, start, contentStart, closeIdx, closeIdx + 2);
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
      const trace = inlineStateOwners.get(state);
      if (trace) registerCritic(tok, trace, start, start + 3, close, close + 3);
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
    const close = state.push("critic_anno_close", "span", -1);
    const trace = inlineStateOwners.get(state);
    if (trace) {
      registerEdge(open, close, trace, start, start + 3, hlClose, noteClose + 3);
      registerCritic(close, trace, start, noteStart, noteClose, noteClose + 3, hlClose);
    }
  }
  state.pos = noteClose + 3;
  return true;
});
function tagPairedHtmlInline(tokens) {
  const VOID_RE = /^<(?:br|hr|img|input|wbr|area|base|col|embed|link|meta|param|source|track)[\s/>]/i;
  for (const token of tokens) {
    if (token.type !== "inline" || !token.children) continue;
    const children2 = token.children;
    const stack = [];
    for (let i = 0; i < children2.length; i++) {
      const child = children2[i];
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
            const opener = children2[entry.index];
            if (opener) {
              opener.meta = { ...opener.meta || {}, htmlPaired: true };
              const open = htmlTokenRanges.get(opener), close = htmlTokenRanges.get(child);
              if (open && close) {
                edgeTokens.set(opener, { open, close, side: "open" });
                edgeTokens.set(child, { open, close, side: "close" });
              }
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
    open.map = open.map ? [Math.min(open.map[0], start), Math.max(open.map[1], end)] : [start, end];
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
      const empty = emptyLiteral(state, startLine, nextLine, 0, token.content);
      literalFacts.set(token, { collector, trace: sliceTrace(collector.trace, contentStart, contentEnd), kind: "front_matter", ...empty ? { empty } : {} });
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
var capturedTextMarks = ["em", "strong", "link", "annotation", "html_mark", "highlight", "strike_through", "code"];
var tokenArrays = /* @__PURE__ */ new WeakMap();
var inlineStateOwners = /* @__PURE__ */ new WeakMap();
var tokenSources = /* @__PURE__ */ new WeakMap();
var pendingSources = /* @__PURE__ */ new WeakMap();
var criticTokens = /* @__PURE__ */ new WeakMap();
function registerCritic(token, trace, start, noteStart, noteEnd, end, middleStart) {
  const syntax = rawRange(trace, start, end), note = rawRange(trace, noteStart, noteEnd), close = rawRange(trace, noteEnd, end);
  const open = middleStart === void 0 ? void 0 : rawRange(trace, start, start + 3), middle = middleStart === void 0 ? void 0 : rawRange(trace, middleStart, noteStart);
  const noteFrom = note?.from ?? rawPoint(trace, noteStart), noteTo = note?.to ?? rawPoint(trace, noteEnd);
  if (syntax && close && noteFrom !== void 0 && noteTo !== void 0 && (middleStart === void 0 || open && middle)) criticTokens.set(token, { kind: middleStart === void 0 ? "note_anchor" : "annotation", syntaxFrom: syntax.from, syntaxTo: syntax.to, noteFrom, noteTo, close, ...open && middle ? { open, middle } : {} });
}
var atomTokenRanges = /* @__PURE__ */ new WeakMap();
var htmlTokenRanges = /* @__PURE__ */ new WeakMap();
var edgeTokens = /* @__PURE__ */ new WeakMap();
var fenceTokens = /* @__PURE__ */ new WeakMap();
var currentInlineCollector = /* @__PURE__ */ new WeakMap();
var activeEdges = /* @__PURE__ */ new WeakMap();
var capturedFenceClosed = /* @__PURE__ */ new WeakMap();
var capturedRootFencesClosed = /* @__PURE__ */ new WeakMap();
var captureAvailable = true;
function rawPoint(trace, at) {
  const points = /* @__PURE__ */ new Set();
  const index = firstPiece(trace, at);
  for (const p of [trace.pieces[index - 1], trace.pieces[index]]) {
    if (!p) continue;
    if (p.kind === "generated") continue;
    if (p.kind === "copy" && p.from <= at && at <= p.to) points.add(p.sourceFrom + at - p.from);
    else {
      if (p.from === at) points.add(p.sourceFrom);
      if (p.to === at) points.add(p.sourceTo);
    }
  }
  return points.size === 1 ? [...points][0] : void 0;
}
function emptyInline(collector, from, to = from, before = "", after = "") {
  const a = rawPoint(collector.trace, from), b = rawPoint(collector.trace, to);
  return a === void 0 || b === void 0 ? void 0 : { kind: "inline", range: { from: a, to: b }, before, after };
}
function actualEol(collector, end) {
  return collector.trace.text[end] === "\n" ? rawRange(collector.trace, end, end + 1) : void 0;
}
function wrapCaptureRule(ruler, name, wrapper, preserveAlternates = false) {
  const original = ruler.__rules__?.find((rule) => rule.name === name)?.fn;
  if (typeof original !== "function") {
    captureAvailable = false;
    return;
  }
  const alt = preserveAlternates ? ruler.__rules__.find((rule) => rule.name === name).alt.slice() : [];
  ruler.at(name, (...args) => {
    const [state, line, , silent] = args, frame = containerFrames.get(state)?.at(-1);
    const read = ruler === md.block.ruler && !silent && frame?.kind === "list" ? frame.current : void 0;
    const index = state.tokens?.length;
    const entry = read && index === read.index + 1 ? { from: state.bMarks[line] + state.tShift[line], end: state.eMarks[line] } : void 0;
    const result = wrapper(original, ...args);
    if (result && entry && state.tokens[index] && state.tokens[index].map?.[0] === line) {
      read.body = entry.from;
      read.e = entry.end;
    }
    return result;
  }, { alt });
}
var collectorFor = (state) => state.env?.[captureKey];
var separatorTokens = /* @__PURE__ */ new WeakMap();
var nestedBlanks = /* @__PURE__ */ new WeakMap();
var containerFrames = /* @__PURE__ */ new WeakMap();
var containerEnds = /* @__PURE__ */ new WeakMap();
function activePrefix(state) {
  const frames = containerFrames.get(state), frame = frames?.[frames.length - 1];
  return frame?.current?.prefix ?? frame?.prefix ?? [];
}
function observeOwnedBlank(actual, frame, collector, line) {
  if (line >= actual.lineMax) return;
  const b = actual.bMarks[line], e = actual.eMarks[line], t = actual.tShift[line], s = actual.sCount[line], bs = actual.bsCount[line];
  const physical = collector.lineStarts[line];
  if (physical === void 0 || b + t < e) return;
  if (frame.kind === "blockquote" ? b <= physical || !actual.src.slice(physical, b).includes(">") : s < actual.blkIndent) return;
  let body = b, width = 0;
  while (body < e && width < actual.blkIndent) {
    const ch = actual.src[body];
    if (ch === " ") width++;
    else if (ch === "	") width += 4 - (width + bs) % 4;
    else if (body - b < t) width++;
    else break;
    body++;
  }
  if (width > actual.blkIndent) return;
  const prefix = rawRange(collector.trace, physical, body), range = emptyInline(collector, body, e);
  if (!prefix || range?.kind !== "inline") return;
  const eol = actualEol(collector, e);
  if (!eol && e !== collector.trace.text.length) return;
  return {
    line,
    b,
    e,
    t,
    s,
    bs,
    lineMax: actual.lineMax,
    insertBefore: actual.tokens.length,
    prefix: [prefix],
    range: range.range,
    ...eol ? { eol } : {}
  };
}
function observeContainerTokenize(state) {
  const engine = state.md, block = engine.block, facade = Object.create(engine), localBlock = Object.create(block);
  localBlock.tokenize = function(actual, start, end, ...rest) {
    const frames = containerFrames.get(actual), frame = frames?.[frames.length - 1], collector = collectorFor(actual);
    if (frame && collector) {
      let read = frame.current;
      if (frame.kind === "footnote_def") {
        const token = actual.tokens[actual.tokens.length - 1];
        if (token?.type !== "footnote_reference_open") throw new UnsupportedSourceCapture();
        read = { token, index: actual.tokens.length - 1, line: start, b: actual.bMarks[start], t: actual.tShift[start], e: actual.eMarks[start] };
        frame.reads.push(read);
        frame.current = read;
      }
      if (read) {
        if (start !== read.line) throw new UnsupportedSourceCapture();
        read.body = actual.bMarks[start] + actual.tShift[start];
        if (frame.kind === "blockquote") {
          const raw = rawRange(collector.trace, frame.marker, actual.bMarks[start]);
          if (raw) read.prefix = [...frame.prefix, raw];
        } else read.prefix = [...frame.prefix, { spaces: actual.blkIndent - frame.entryIndent }];
        const first = actual.tokens.length;
        const skip = actual.skipEmptyLines, isEmpty = actual.isEmpty, blanks = /* @__PURE__ */ new Map();
        const observe = (line) => {
          if (frames?.at(-1)?.current !== read) return;
          const blank = observeOwnedBlank(actual, frame, collector, line);
          if (blank) blanks.set(line, blank);
        };
        actual.skipEmptyLines = function(line) {
          const result2 = skip.call(this, line);
          for (let n = line; n < result2; n++) observe(n);
          return result2;
        };
        actual.isEmpty = function(line) {
          const result2 = isEmpty.call(this, line);
          if (result2) observe(line);
          return result2;
        };
        let result;
        read.tokenizing = true;
        try {
          result = block.tokenize.call(block, actual, start, end, ...rest);
        } finally {
          actual.skipEmptyLines = skip;
          actual.isEmpty = isEmpty;
          read.tokenizing = false;
        }
        read.blanks = [...blanks.values()].filter((blank) => blank.line < actual.line);
        read.first = actual.tokens[first];
        return result;
      }
    }
    return block.tokenize.call(block, actual, start, end, ...rest);
  };
  facade.block = localBlock;
  state.md = facade;
}
for (const name of ["list", "blockquote", "footnote_def"]) wrapCaptureRule(md.block.ruler, name, (original, state, startLine, endLine, silent) => {
  const collector = collectorFor(state);
  if (!collector || silent) return original(state, startLine, endLine, silent);
  let frames = containerFrames.get(state);
  if (!frames) {
    frames = [];
    containerFrames.set(state, frames);
  }
  const frame = { kind: name, entryIndent: state.blkIndent, marker: name === "blockquote" ? state.bMarks[startLine] + state.tShift[startLine] : 0, prefix: activePrefix(state), reads: [] };
  const push = state.push, engine = state.md, isEmpty = state.isEmpty, outer = frames.length === 0;
  if (outer) observeContainerTokenize(state);
  frames.push(frame);
  state.push = function(type, ...args) {
    const token = push.call(this, type, ...args);
    if (frames[frames.length - 1] === frame && (name === "list" && type === "list_item_open" || name === "blockquote" && type === "blockquote_open")) {
      const line = name === "blockquote" ? startLine : this.line;
      const read = { token, index: this.tokens.length - 1, line, b: this.bMarks[line], t: this.tShift[line], e: this.eMarks[line] };
      frame.reads.push(read);
      frame.current = read;
    }
    return token;
  };
  state.isEmpty = function(line) {
    const result2 = isEmpty.call(this, line), read = frame.current;
    if (result2 && name === "list" && frames.at(-1) === frame && read && !read.tokenizing) {
      const blank = observeOwnedBlank(this, frame, collector, line);
      if (blank) read.blanks = [...(read.blanks ?? []).filter((item) => item.line !== line), blank];
    }
    return result2;
  };
  let result;
  try {
    result = original(state, startLine, endLine, silent);
  } finally {
    state.isEmpty = isEmpty;
    state.push = push;
    frames.pop();
    if (outer) state.md = engine;
  }
  if (!result) return result;
  for (const read of frame.reads) {
    const token = read.token, index = read.index;
    if (name === "footnote_def") token.map = [startLine, state.line];
    if (token.map?.[0] !== read.line || state.tokens[index] !== token) throw new UnsupportedSourceCapture();
    let close = index + 1, depth = 1;
    for (; close < state.tokens.length; close++) {
      depth += state.tokens[close].nesting;
      if (depth === 0) break;
    }
    const last = state.tokens[close];
    if (last?.type !== token.type.replace("_open", "_close")) throw new UnsupportedSourceCapture();
    let place;
    if (close === index + 1) {
      let from = read.b;
      if (name === "list") {
        const marker = String(token.info ?? "") + token.markup, start = read.b + read.t;
        if (state.src.slice(start, start + marker.length) !== marker) throw new UnsupportedSourceCapture();
        from = start + marker.length;
        const padding = state.src.slice(from, read.e);
        if (/^[ \t]*$/.test(padding)) {
          if (padding[0] === " ") from++;
          place = emptyInline(collector, from, read.e, from === start + marker.length ? " " : "");
        }
      } else {
        from = name === "blockquote" ? read.b : read.body ?? read.b;
        if (/^[ \t]*$/.test(state.src.slice(from, read.e))) place = emptyInline(collector, from, read.e);
      }
    } else if (name === "list" && read.first && read.first === state.tokens[index + 1] && read.first.type !== "paragraph_open" && read.body !== void 0 && read.prefix) {
      const at = rawPoint(collector.trace, read.body);
      if (at !== void 0) place = { kind: "prepend", at, eol: actualEol(collector, read.e), continuation: read.prefix };
    }
    if (name === "list" && place?.kind === "inline" && place.before && read.prefix) {
      const eol = actualEol(collector, read.e);
      if (eol && place.range.to === eol.from && collector.protectedSources.some((p) => p.sourceFrom === eol.to)) {
        const prefix = read.prefix.map((p) => "spaces" in p ? " ".repeat(p.spaces) : collector.source.slice(p.from, p.to)).join("");
        place = { ...place, after: collector.source.slice(eol.from, eol.to) + prefix };
      }
    }
    if (place) containerEnds.set(last, { collector, place, kind: name === "list" ? "list_item" : name === "blockquote" ? "blockquote" : "footnote_definition" });
    const children2 = [];
    for (let i = index + 1; i < close; i++) {
      const child = state.tokens[i];
      if (child.level !== token.level + 1 || child.nesting === -1 || !child.map) continue;
      children2.push({ from: child.map[0], to: child.map[1], index: i });
    }
    const blanks = (read.blanks ?? []).filter((blank) => blank.line >= token.map[0] && blank.line < token.map[1] && !children2.some((child) => child.from <= blank.line && blank.line < child.to) && !collector.protectedSources.some((p) => p.sourceFrom < (blank.eol?.to ?? blank.range.to) && p.sourceTo > blank.range.from));
    if (!children2.length && blanks.some((blank) => blank.line !== read.line) && place) {
      nestedBlanks.set(last, [{ level: token.level + 1, place, line: read.line }]);
      containerEnds.delete(last);
    }
    let priorRight, definitionLeft = false, definitionRight = false;
    for (const [blankIndex, blank] of blanks.entries()) {
      const previous = blanks[blankIndex - 1];
      const firstInRun = !previous || previous.line + 1 !== blank.line;
      let lastInRun = blank;
      for (let next = blankIndex + 1; firstInRun && blanks[next]?.line === lastInRun.line + 1; next++) lastInRun = blanks[next];
      const begin = blank.prefix[0], end = lastInRun.eol?.to ?? lastInRun.range.to;
      if (firstInRun) {
        definitionLeft = !!begin && "from" in begin && collector.protectedSources.some((p) => p.sourceTo === begin.from);
        definitionRight = collector.protectedSources.some((p) => p.sourceFrom === end);
      }
      const touchesDefinition = firstInRun && (definitionLeft || definitionRight);
      const left = children2.filter((child) => child.to <= blank.line).at(-1), right = children2.find((child) => child.from > blank.line);
      if (touchesDefinition) {
        if (!children2.length && blank.line === read.line && place?.kind === "inline" && place.range.from === blank.range.from && place.range.to === blank.range.to) {
          const baseline = {
            kind: "nested-blank",
            range: blank.range,
            prefix: name !== "blockquote" && read.prefix ? read.prefix : blank.prefix,
            ...blank.eol ? { eol: blank.eol } : {},
            leftBody: definitionLeft,
            rightBody: definitionRight,
            leftSeparator: true
          };
          const pending = nestedBlanks.get(last);
          if (pending) nestedBlanks.set(last, pending.map((item) => item.place === place ? { ...item, place: baseline } : item));
          else containerEnds.set(last, { collector, place: baseline, kind: name === "list" ? "list_item" : name === "blockquote" ? "blockquote" : "footnote_definition" });
        }
        const begin2 = blank.prefix[0];
        const definition = definitionRight && !definitionLeft ? collector.protectedSources.find((p) => p.sourceFrom === end) : definitionLeft && !definitionRight && begin2 && "from" in begin2 ? collector.protectedSources.find((p) => p.sourceTo === begin2.from) : void 0;
        const side = definitionRight ? "left" : "right", child = definitionRight ? left : right, target2 = child && state.tokens[child.index + 1];
        if (definition && target2?.type === "inline" && blank.prefix.length === 1 && begin2 && "from" in begin2 && begin2.to === blank.range.from && blank.eol?.from === blank.range.to) {
          const range = { from: begin2.from, to: blank.eol.to };
          separatorTokens.set(target2, [...separatorTokens.get(target2) ?? [], { range, side, definition }]);
        }
        priorRight = right?.index;
        continue;
      }
      if (name === "list" && place?.kind === "prepend" && !left && blank === blanks[0]) continue;
      if (left && right && priorRight !== right.index) {
        const leftInline = state.tokens[left.index + 1], rightInline = state.tokens[right.index + 1], begin2 = blank.prefix[0];
        if (leftInline?.type === "inline" && rightInline?.type === "inline" && blank.prefix.length === 1 && begin2 && "from" in begin2 && begin2.to === blank.range.from && blank.eol?.from === blank.range.to) {
          const range = { from: begin2.from, to: blank.eol.to };
          for (const [target2, side] of [[leftInline, "left"], [rightInline, "right"]]) separatorTokens.set(target2, [...separatorTokens.get(target2) ?? [], { range, side }]);
        }
        priorRight = right.index;
        continue;
      }
      if (!children2.length && blank.line === read.line) continue;
      const before = right?.index ?? close, target = state.tokens[before];
      const items = [...nestedBlanks.get(target) ?? []];
      items.push({ level: token.level + 1, line: blank.line, place: {
        kind: "nested-blank",
        range: blank.range,
        prefix: blank.line === read.line && name !== "blockquote" && read.prefix ? read.prefix : blank.prefix,
        ...blank.eol ? { eol: blank.eol } : {},
        leftBody: !!left || definitionLeft,
        rightBody: !!right || definitionRight,
        leftSeparator: definitionLeft || definitionRight
      } });
      nestedBlanks.set(target, items);
    }
  }
  return result;
}, true);
function captureContainerEmission(state, token, delegate) {
  const fact = containerEnds.get(token);
  if (!fact) {
    delegate();
    return;
  }
  const outer = state.stack[state.stack.length - 2], slot = outer?.content.length;
  delegate();
  const node = outer?.content[slot];
  if (!node || node.type.name !== fact.kind) return;
  const parent = node.firstChild;
  if (!parent || parent.type.name !== "paragraph" || parent.content.size || !parent.hasMarkup(parent.type)) return;
  fact.collector.emissions.push({ from: 0, to: 0, kind: "paragraph", runFrom: fact.collector.runs.length, runTo: fact.collector.runs.length, node: parent, empty: fact.place });
}
wrapCaptureRule(md.block.ruler, "fence", (original, state, startLine, endLine, silent) => {
  if (!collectorFor(state) || silent) return original(state, startLine, endLine, silent);
  const originalGetLines = state.getLines, descriptor = Object.getOwnPropertyDescriptor(state, "getLines");
  if (typeof originalGetLines !== "function" || descriptor?.configurable === false) throw new UnsupportedSourceCapture();
  const tokenStart = state.tokens.length;
  let contentEnd, bodyTrace, empty, bodyUnstripped = false;
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
      bodyUnstripped = !!bodyTrace && bodyTrace.pieces.length > 0 && bodyTrace.pieces[0].sourceFrom === rawPoint(collectorFor(state).trace, state.bMarks[begin]) && bodyTrace.pieces.every((p, i) => p.kind !== "generated" && (!i || bodyTrace.pieces[i - 1].sourceTo === p.sourceFrom));
      empty = emptyLiteral(state, startLine, end, indent, value);
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
    if (state.line === contentEnd + 1) {
      const collector = collectorFor(state), a = state.bMarks[startLine] + state.tShift[startLine], b = state.bMarks[contentEnd] + state.tShift[contentEnd];
      const character = token.markup[0];
      let end = b;
      while (state.src[end] === character) end++;
      const open = rawRange(collector.trace, a, a + token.markup.length), close = rawRange(collector.trace, b, end);
      const whole = rawRange(collector.trace, collector.lineStarts[startLine], collector.lineStarts[state.line]), eol = actualEol(collector, state.eMarks[startLine]);
      if (open && close && whole && eol && close.to - close.from >= token.markup.length)
        fenceTokens.set(token, { sourceFrom: whole.from, sourceTo: whole.to, open, close, character, openLength: token.markup.length, closeLength: close.to - close.from, eol: collector.source.slice(eol.from, eol.to), contiguousTopLevel: token.level === 0 && bodyUnstripped });
    }
    if (bodyTrace) literalFacts.set(token, { collector: collectorFor(state), trace: bodyTrace, kind: token.type, ...state.line === contentEnd + 1 && empty ? { empty } : {} });
  } else if (contentEnd !== void 0) throw new UnsupportedSourceCapture();
  return result;
}, true);
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
    const projected = traceTableRow(collector.trace, state.bMarks[line] + state.tShift[line], state.eMarks[line], slots.map((t) => t.content), (slot) => {
      const at = rawPoint(collector.trace, slot.missing ? slot.rowEnd : slot.from);
      if (at === void 0) return;
      const empty = slot.missing ? { kind: "missing-cell", at, row: line, slot: slot.slot, present: slot.present, closingPipe: slot.closingPipe } : { kind: "inline", range: { from: at, to: at }, before: "", after: "" };
      inlineFacts.set(slots[slot.slot], { collector, empty });
    });
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
  collector.trace = editTrace(collector.trace, projection.changes.map((c2) => ({
    from: c2.sourceFrom,
    to: c2.sourceTo,
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
  inlineFacts.set(token, { ...inlineFacts.get(token), collector, trace, kind });
}
for (const name of ["paragraph", "lheading"]) wrapCaptureRule(md.block.ruler, name, (original, state, ...args) => {
  const collector = collectorFor(state);
  if (!collector) return original(state, ...args);
  const level = state.level, originalGetLines = state.getLines, start = state.tokens.length;
  if (typeof originalGetLines !== "function" || !Array.isArray(state.bMarks) || !Array.isArray(state.eMarks)) throw new UnsupportedSourceCapture();
  let capturedLines, terminal, trimEnd;
  state.getLines = function(begin, end, indent, keepLastLF) {
    const read = { begin, end, indent, keepLastLF, rows: Array.from({ length: end - begin }, (_, i) => {
      const line = begin + i;
      return { b: this.bMarks[line], e: this.eMarks[line], t: this.tShift[line], bs: this.bsCount[line] };
    }) };
    const value = originalGetLines.call(this, begin, end, indent, keepLastLF);
    let part = traceConsumedLines(collector.trace, read, value);
    if (!part) throw new UnsupportedSourceCapture();
    const endOfLine = read.rows[read.rows.length - 1]?.e;
    if (endOfLine !== void 0) trimEnd = rawPoint(collector.trace, endOfLine);
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
    if (trimEnd !== void 0) inlineFacts.set(token, { ...inlineFacts.get(token), trimEnd });
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
    if (token.content === "") {
      const closing = charsEnd < spacesEnd, at = closing ? Math.min(from + 1, charsEnd) : state.eMarks[startLine];
      const empty = emptyInline(collector, at, at, at === from ? " " : "", closing && at === charsEnd ? " " : "");
      if (empty) inlineFacts.set(token, { ...inlineFacts.get(token), empty });
    }
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
  const syntaxFrom = state.pos - trim, syntaxTo = state.pos + 1;
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
  const token = state.tokens.at(-1), owner = inlineStateOwners.get(state);
  if (token?.type === "hardbreak" || token?.type === "softbreak") {
    const raw = rawRange(owner, syntaxFrom, syntaxTo);
    if (raw) atomTokenRanges.set(token, raw);
  }
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
  if (state.pos > end) {
    const token = state.tokens.at(-1);
    if (token?.type !== "code_inline") throw new UnsupportedSourceCapture();
    let a = end, b = state.pos - marker.length;
    const normalized = state.src.slice(a, b).replace(/\n/g, " ");
    if (/^ (.+) $/.test(normalized)) {
      a++;
      b--;
    }
    const runs = [];
    for (let i = a; i < b; i++) runs.push({ text: state.src[i] === "\n" ? " " : state.src[i], kind: state.src[i] === "\n" ? "atomic" : "linear", trace: sliceTrace(owner, i, i + 1) });
    if (runs.map((r2) => r2.text).join("") !== token.content) throw new UnsupportedSourceCapture();
    tokenSources.set(token, { collector: collectorFor(state), runs });
    const open = rawRange(owner, from, a), close = rawRange(owner, b, state.pos);
    if (open && close) edgeTokens.set(token, { open, close, side: "code" });
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
      if (name === "escape" && token.type === "hardbreak") {
        const raw = rawRange(owner, from, from + 2);
        if (raw) atomTokenRanges.set(token, raw);
      }
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
function registerEdge(opened, closed, trace, a, b, c2, d) {
  const open = rawRange(trace, a, b), close = rawRange(trace, c2, d);
  if (open && close) {
    edgeTokens.set(opened, { open, close, side: "open" });
    edgeTokens.set(closed, { open, close, side: "close" });
  }
}
for (const name of ["strikethrough", "mark"]) wrapCaptureRule(md.inline.ruler, name, (original, state, silent) => {
  const from = state.pos, before = state.tokens.length, ok = original(state, silent), trace = inlineStateOwners.get(state), collector = collectorFor(state);
  if (ok && !silent && trace && collector) {
    let at = from;
    for (const token of state.tokens.slice(before)) if (token.type === "text" && token.content && /^[~=]+$/.test(token.content)) {
      tokenSources.set(token, { collector, runs: [{ text: token.content, kind: "linear", trace: sliceTrace(trace, at, at + token.content.length) }] });
      at += token.content.length;
    }
  }
  return ok;
});
for (const name of ["emphasis", "strikethrough", "mark"]) wrapCaptureRule(md.inline.ruler2, name, (original, state) => {
  const collector = collectorFor(state);
  if (!collector) return original(state);
  const pairs = [];
  for (const ds of [state.delimiters, ...state.tokens_meta.map((m) => m?.delimiters).filter(Boolean)]) for (const d of ds) {
    if (d.end < 0) continue;
    const o = state.tokens[d.token], c2 = state.tokens[ds[d.end].token];
    const a = tokenSources.get(o)?.runs[0]?.trace, b = tokenSources.get(c2)?.runs[0]?.trace;
    const open = a && rawRange(a, 0, a.text.length), close = b && rawRange(b, 0, b.text.length);
    if (open && close) pairs.push({ o, c: c2, open, close });
  }
  const result = original(state);
  for (const p of pairs) if (p.o.nesting === 1 && p.c.nesting === -1) {
    let open = p.open, close = p.close;
    if (p.o.type === "strong_open") {
      const neighbor = pairs.find((q) => q.open.to === open.from && q.close.from === close.to && q.o.content === "");
      if (!neighbor) continue;
      open = { from: neighbor.open.from, to: open.to };
      close = { from: close.from, to: neighbor.close.to };
    }
    edgeTokens.set(p.o, { open, close, side: "open" });
    edgeTokens.set(p.c, { open, close, side: "close" });
  }
  return result;
});
for (const name of ["math_inline", "math_inline_double", "footnote_ref", "footnote_ref_orphan"]) wrapCaptureRule(md.inline.ruler, name, (original, state, silent) => {
  const from = state.pos, result = original(state, silent), trace = inlineStateOwners.get(state);
  if (result && !silent && trace) {
    const token = state.tokens.at(-1), view = sliceTrace(trace, from, state.pos);
    if (token?.type === (name === "footnote_ref_orphan" ? "footnote_ref" : name) && view.pieces.length && view.pieces.every((p, i) => p.kind !== "generated" && (!i || view.pieces[i - 1].sourceTo === p.sourceFrom))) {
      const raw = rawRange(trace, from, state.pos);
      if (raw) atomTokenRanges.set(token, raw);
    }
  }
  return result;
});
wrapCaptureRule(md.inline.ruler, "html_inline", (original, state, silent) => {
  const start = state.pos, result = original(state, silent), trace = inlineStateOwners.get(state);
  if (result && !silent && trace) {
    const token = state.tokens.at(-1), range = rawRange(trace, start, state.pos);
    if (token?.type === "html_inline" && range) htmlTokenRanges.set(token, range);
  }
  return result;
});
wrapCaptureRule(md.inline.ruler, "link", (original, state, silent) => {
  const trace = inlineStateOwners.get(state);
  if (silent || !trace) return original(state, silent);
  const start = state.pos, before = state.tokens.length, tokenize = state.md.inline.tokenize;
  let label;
  state.md.inline.tokenize = function(current) {
    if (current === state && !label) label = { from: current.pos, to: current.posMax };
    return tokenize.call(this, current);
  };
  let result;
  try {
    result = original(state, silent);
  } finally {
    state.md.inline.tokenize = tokenize;
  }
  if (result && label) {
    const opened = state.tokens.slice(before).find((t) => t.type === "link_open"), closed = state.tokens.at(-1);
    if (opened && closed?.type === "link_close") registerEdge(opened, closed, trace, start, label.from, label.to, state.pos);
  }
  return result;
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
function captureAtomEmission(state, token, delegate) {
  const critic = criticTokens.get(token), raw = atomTokenRanges.get(token) ?? (critic?.kind === "note_anchor" ? { from: critic.syntaxFrom, to: critic.syntaxTo } : void 0), collector = currentInlineCollector.get(state);
  if (!raw || !collector) {
    delegate();
    return;
  }
  const frame = state.stack.at(-1), slot = frame.content.length, pmFrom = captureCursor(state);
  delegate();
  const node = frame.content[slot], pmTo = captureCursor(state);
  if (state.stack.at(-1) !== frame || frame.content.length !== slot + 1 || !node || !["math_inline", "note_anchor", "hardbreak", "footnote_ref"].includes(node.type.name) || !node.isAtom || node.nodeSize !== pmTo - pmFrom) return;
  collector.atoms.push({ body: -1, pmFrom, pmTo, sourceFrom: raw.from, sourceTo: raw.to, node });
  if (critic?.kind === "note_anchor" && node.type.name === "note_anchor") collector.critic.push({ ...critic, id: collector.critic.length, body: -1, pmFrom, pmTo, note: node.attrs.note });
}
function captureEdgeEmission(state, token, delegate) {
  const edge = edgeTokens.get(token), collector = currentInlineCollector.get(state);
  if (!edge) {
    delegate();
    return;
  }
  const position = captureCursor(state), frame = state.stack.at(-1);
  let active = activeEdges.get(state);
  if (!active) {
    active = /* @__PURE__ */ new Map();
    activeEdges.set(state, active);
  }
  if (edge.side === "code") {
    if (!collector) {
      delegate();
      return;
    }
    captureText(state, token, delegate);
    const mark = state.schema.marks.code.create(), marks2 = mark.addToSet(frame.marks);
    collector.edges.push({ id: collector.edges.length, body: -1, family: "code", pmFrom: position, pmTo: captureCursor(state), open: edge.open, close: edge.close, marks: marks2 });
    return;
  }
  if (edge.side === "close") {
    const opened = active.get(edge.open.from);
    delegate();
    if (opened && collector) {
      const mark = opened.marks.find((m) => !m.isInSet(frame.marks));
      if (mark) {
        collector.edges.push({ id: collector.edges.length, body: -1, family: mark.type.name, pmFrom: opened.pmFrom, pmTo: position, open: edge.open, close: edge.close, marks: opened.marks });
        const critic = criticTokens.get(token);
        if (critic?.kind === "annotation" && mark.type.name === "annotation") collector.critic.push({ ...critic, id: collector.critic.length, body: -1, pmFrom: opened.pmFrom, pmTo: position, note: mark.attrs.note });
      }
    }
    active.delete(edge.open.from);
    return;
  }
  delegate();
  active.set(edge.open.from, { pmFrom: position, marks: frame.marks.slice() });
}
function emptyLiteral(state, start, end, indent, content) {
  const collector = collectorFor(state);
  if (content !== "" && content !== "\n") return void 0;
  const eol = actualEol(collector, state.eMarks[start]);
  if (!eol) return void 0;
  const prefix = [...activePrefix(state), ...indent > state.blkIndent ? [{ spaces: indent - state.blkIndent }] : []];
  if (content === "\n") {
    const terminal = actualEol(collector, state.eMarks[start + 1]), at2 = rawPoint(collector.trace, state.eMarks[start + 1]);
    if (!terminal || at2 === void 0) return void 0;
    return { kind: "literal", at: at2, terminal, eol, prefix, closed: true };
  }
  const at = rawPoint(collector.trace, collector.lineStarts[end]);
  return at === void 0 ? void 0 : { kind: "literal", at, eol, prefix, closed: true };
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
  const fence = fenceTokens.get(token);
  const contiguous = trace.pieces.length > 0 && trace.pieces.every((p, i) => p.kind !== "generated" && (!i || trace.pieces[i - 1].sourceTo === p.sourceFrom));
  const raw = fence && trace.pieces.length ? { from: trace.pieces[0].sourceFrom, to: trace.pieces.at(-1).sourceTo } : void 0;
  fact.collector.emissions.push({
    from,
    to: from + text2.length,
    kind,
    runFrom,
    runTo: fact.collector.runs.length,
    node,
    ...fact.empty ? { empty: fact.empty } : {},
    ...fence && raw ? { fence: { ...fence, contiguousTopLevel: fence.contiguousTopLevel && contiguous, pmFrom: from - 1, pmTo: from + text2.length + 1, contentFrom: raw.from, contentTo: raw.to } } : {}
  });
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
  currentInlineCollector.set(state, fact.collector);
  const edgeFrom = fact.collector.edges.length, atomFrom = fact.collector.atoms.length, criticFrom = fact.collector.critic.length;
  delegate();
  const edgeTo = fact.collector.edges.length, atomTo = fact.collector.atoms.length, criticTo = fact.collector.critic.length, to = captureCursor(state);
  if (state.stack[state.stack.length - 1] !== frame) throw new UnsupportedSourceCapture();
  if (!["paragraph", "heading"].includes(frame.type.name)) return;
  const emission = { from, to, edgeFrom, edgeTo, atomFrom, atomTo, criticFrom, criticTo, separators: separatorTokens.get(token) ?? [], kind: frame.type.name, runFrom, runTo: fact.collector.runs.length, ...fact.empty ? { empty: fact.empty } : {} };
  fact.collector.emissions.push(emission);
  inlineFrames.set(frame, emission);
  if (fact.trace && fact.kind) {
    const pieces = fact.trace.pieces;
    const actual = pieces.length > 0 && pieces.every((p) => p.kind !== "generated");
    const raw = actual ? { from: pieces[0].sourceFrom, to: pieces.at(-1).sourceTo } : void 0;
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
    for (let at = i; at <= last; at++) for (const pending of nestedBlanks.get(tokens[at]) ?? []) {
      const place = pending.place;
      if (place.kind === "nested-blank") {
        tailFrom = Math.max(tailFrom, place.range.to);
        boundaryTo = Math.max(boundaryTo, starts[pending.line + 1]);
      }
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
              const at = rawPoint(fact.trace, match[0].length);
              const empty = match[0].length === fact.trace.text.length && at !== void 0 ? { kind: "inline", range: { from: fact.trimEnd ?? at, to: fact.trimEnd ?? at }, before: (fact.trimEnd ?? at) > at || /\s$/.test(match[0]) ? "" : " ", after: "" } : void 0;
              inlineFacts.set(t, { ...fact, trace: sliceTrace(fact.trace, match[0].length, fact.trace.text.length), ...empty ? { empty } : {} });
            }
            t.content = t.content.slice(match[0].length);
            const children2 = t.children;
            if (children2 && children2.length > 0) {
              const firstChild = children2[0];
              if (firstChild.type === "text") {
                consumeCheckboxSource(firstChild, match[0].length);
                firstChild.content = firstChild.content.slice(match[0].length);
                if (!firstChild.content) {
                  children2.shift();
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
        alt: (token.children || []).map((c2) => c2.content).join("") || "",
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
      h[key] = (state, tok, tokens, i) => captureAtomEmission(state, tok, () => captureEdgeEmission(state, tok, () => delegate(state, tok, tokens, i)));
    }
    for (const key of Object.keys(h)) {
      const delegate = h[key];
      h[key] = (state, tok, tokens, i) => captureRootEmission(
        state,
        tok,
        () => captureListEmission(state, tok, () => captureContainerEmission(state, tok, () => delegate(state, tok, tokens, i)))
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
function sourceFenceLength(text2, character, minimum) {
  let length = Math.max(3, minimum);
  for (const run of text2.match(character === "`" ? /`+/g : /~+/g) ?? []) length = Math.max(length, run.length + 1);
  return length;
}
function sourceCodeNode(state, node) {
  const language = node.attrs.language;
  if (typeof language !== "string" || /[\r\n]/.test(language)) throw new UnsupportedSourceCapture();
  const info = language, character = info.includes("`") ? "~" : "`";
  const length = sourceFenceLength(node.textContent, character, 3);
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
var sourceContinuationIndents = /* @__PURE__ */ new WeakMap();
var sourceBlankTails = /* @__PURE__ */ new WeakMap();
function renderSourceContainerChildren(state, parent, skipSchemaPrefix) {
  const first = skipSchemaPrefix ? 1 : 0;
  const empty = (n) => n.type.name === "paragraph" && n.content.size === 0 && n.hasMarkup(n.type);
  let hasEmpty = false;
  for (let i = first; i < parent.childCount; i++) if (empty(parent.child(i))) hasEmpty = true;
  const current = state;
  const end = () => {
    if (!sourceContinuationIndents.has(state) && current.delim && /^[ ]+$/.test(current.delim)) sourceContinuationIndents.set(state, current.delim.length);
  };
  if (!hasEmpty) {
    for (let i = first; i < parent.childCount; i++) state.render(parent.child(i), parent, i);
    end();
    return;
  }
  const prefix = () => current.delim.includes(">") ? current.delim.trimEnd() : current.delim;
  let leftBody = false, afterEmpty = false;
  for (let i = first; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (empty(child)) {
      if (i === first) {
        state.write("");
        current.closed = null;
      } else {
        current.flushClose(1);
        state.ensureNewLine();
        current.out += prefix();
        current.closed = null;
      }
      if (i === parent.childCount - 1 && !current.delim.includes(">") && i > first) state.ensureNewLine();
      sourceBlankTails.set(state, { terminal: current.out.endsWith("\n") });
      afterEmpty = true;
    } else {
      if (afterEmpty) {
        state.ensureNewLine();
        if (leftBody) current.out += prefix() + "\n";
        current.closed = null;
      }
      state.render(child, parent, i);
      leftBody = true;
      afterEmpty = false;
    }
  }
  end();
}
var sourceRootSerializer = new MarkdownSerializer({
  ...serializer.nodes,
  text: writeSourceText,
  code_block: sourceCodeNode,
  math_block(state, node) {
    if (node.type === node.type.schema.nodes.math_block && node.attrs.value === "" && node.hasMarkup(node.type) && !node.content.size) {
      state.write("$$ $$");
      state.closeBlock(node);
    } else serializer.nodes.math_block(state, node, node, 0);
  },
  blockquote(state, node) {
    state.wrapBlock("> ", null, node, () => renderSourceContainerChildren(state, node, false));
  },
  footnote_definition(state, node) {
    if (node.attrs.tight) state.flushClose(1);
    state.write(`[^${node.attrs.label}]: `);
    state.wrapBlock("    ", "", node, () => renderSourceContainerChildren(state, node, false));
  },
  list_item(state, node) {
    if (node.attrs.checked != null) state.write(node.attrs.checked ? "[x] " : "[ ] ");
    const first = node.firstChild;
    const skip = node.attrs.checked === null && first?.type.name === "paragraph" && first.content.size === 0 && first.hasMarkup(first.type) && node.childCount > 1 && node.child(1).type.name !== "paragraph";
    renderSourceContainerChildren(state, node, !!skip);
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
function parseMarkdown(markdown2, schemaArg) {
  const p = getParserFor(schemaArg);
  try {
    return p.parse(normalizeSmartQuotes(normalizeMathBlocks(markdown2)));
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[parseMarkdown] best-effort fallback for malformed input:", err);
    }
    return p.schema.topNodeType.createAndFill();
  }
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
function shiftEmpty(place, delta, lines) {
  const range = (r2) => ({ from: r2.from + delta, to: r2.to + delta });
  const prefix = (p) => p.map((r2) => "spaces" in r2 ? r2 : range(r2));
  switch (place.kind) {
    case "inline":
      return { ...place, range: range(place.range) };
    case "missing-cell":
      return { ...place, at: place.at + delta, row: place.row + lines };
    case "literal":
      return { ...place, at: place.at + delta, eol: range(place.eol), prefix: prefix(place.prefix), ...place.terminal ? { terminal: range(place.terminal) } : {} };
    case "prepend":
      return { ...place, at: place.at + delta, continuation: prefix(place.continuation), eol: place.eol ? range(place.eol) : void 0 };
    case "nested-blank":
      return { ...place, range: range(place.range), prefix: prefix(place.prefix), ...place.eol ? { eol: range(place.eol) } : {} };
    case "layout":
      return place;
  }
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
      inlineFacts.set(copy, { collector, ...fact?.empty ? { empty: shiftEmpty(fact.empty, rawDelta, lineDelta) } : {}, ...fact?.trimEnd !== void 0 ? { trimEnd: fact.trimEnd + rawDelta } : {}, ...fact?.kind ? { kind: fact.kind } : {}, ...fact?.trace ? { trace: shiftTrace(fact.trace, rawDelta) } : {} });
    }
    const literal = literalFacts.get(token);
    if (literal) literalFacts.set(copy, { collector, trace: shiftTrace(literal.trace, rawDelta), kind: literal.kind, ...literal.empty ? { empty: shiftEmpty(literal.empty, rawDelta, lineDelta) } : {} });
    const container = containerEnds.get(token);
    if (container) containerEnds.set(copy, { collector, kind: container.kind, place: shiftEmpty(container.place, rawDelta, lineDelta) });
    const pending = nestedBlanks.get(token);
    if (pending) nestedBlanks.set(copy, pending.map((p) => ({ ...p, line: p.line + lineDelta, place: shiftEmpty(p.place, rawDelta, lineDelta) })));
    const edge = edgeTokens.get(token);
    const shift = (r2) => ({ from: r2.from + rawDelta, to: r2.to + rawDelta });
    const separators = separatorTokens.get(token);
    if (separators) separatorTokens.set(copy, separators.map((s) => ({ ...s, range: shift(s.range), ...s.definition ? { definition: { ...s.definition, sourceFrom: s.definition.sourceFrom + rawDelta, sourceTo: s.definition.sourceTo + rawDelta } } : {} })));
    const critic = criticTokens.get(token);
    if (critic) criticTokens.set(copy, { ...critic, syntaxFrom: critic.syntaxFrom + rawDelta, syntaxTo: critic.syntaxTo + rawDelta, noteFrom: critic.noteFrom + rawDelta, noteTo: critic.noteTo + rawDelta, close: shift(critic.close), ...critic.open ? { open: shift(critic.open) } : {}, ...critic.middle ? { middle: shift(critic.middle) } : {} });
    const atom = atomTokenRanges.get(token);
    if (atom) atomTokenRanges.set(copy, shift(atom));
    const html = htmlTokenRanges.get(token);
    if (html) htmlTokenRanges.set(copy, shift(html));
    if (edge) edgeTokens.set(copy, { ...edge, open: shift(edge.open), close: shift(edge.close) });
    const fence = fenceTokens.get(token);
    if (fence) fenceTokens.set(copy, { ...fence, sourceFrom: fence.sourceFrom + rawDelta, sourceTo: fence.sourceTo + rawDelta, open: shift(fence.open), close: shift(fence.close) });
    const closed = capturedFenceClosed.get(token);
    if (closed !== void 0) capturedFenceClosed.set(copy, closed);
    return copy;
  };
  return tokens.map(clone);
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
var fileRuleSnapshot = [md.core.ruler, md.block.ruler, md.inline.ruler, md.inline.ruler2].map((ruler) => ruler.__rules__.map((r2) => ({ name: r2.name, fn: r2.fn, enabled: r2.enabled, alt: [...r2.alt] })));

// src/commands.ts
import {
  toggleMark,
  setBlockType,
  wrapIn,
  lift
} from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
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
var insertTable = gfmTableCommand({ kind: "insert" });

// src/plugins/definition-list.ts
import { wrappingInputRule } from "prosemirror-inputrules";
function createDefListInputRule(schema) {
  return wrappingInputRule(
    /^:\s{3}$/,
    schema.nodes.defListDescription
  );
}

// src/plugins/enter-handler.ts
import { Plugin, PluginKey, TextSelection as TextSelection2 } from "prosemirror-state";
import {
  splitBlock,
  chainCommands,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock
} from "prosemirror-commands";
var enterHandlerKey = new PluginKey("moraya-enter-handler");
function parsePipeTableHeader(text2) {
  if (!/^\|(.+\|)+\s*$/.test(text2)) return null;
  const cells = text2.split("|").slice(1, -1).map((s) => s.trim());
  if (cells.length < 2) return null;
  if (cells.every((c2) => /^:?-+:?$/.test(c2))) return null;
  return cells;
}
function buildTableFromHeaders(schema, headers) {
  const tableType = schema.nodes.table;
  const headerRowType = schema.nodes.table_header_row;
  const dataRowType = schema.nodes.table_row;
  const headerCellType = schema.nodes.table_header;
  const dataCellType = schema.nodes.table_cell;
  const paragraphType = schema.nodes.paragraph;
  if (!tableType || !headerRowType || !dataRowType || !headerCellType || !dataCellType || !paragraphType) {
    return null;
  }
  const headerCells = headers.map((text2) => {
    const para = text2 ? paragraphType.create(null, schema.text(text2)) : paragraphType.create();
    return headerCellType.create({ alignment: "left" }, para);
  });
  const emptyCells = headers.map(
    () => dataCellType.createAndFill({ alignment: "left" })
  );
  const headerRow = headerRowType.create(null, headerCells);
  const dataRow = dataRowType.create(null, emptyCells);
  return tableType.create(null, [headerRow, dataRow]);
}
function createEnterHandlerPlugin() {
  const enterCommand = chainCommands(
    newlineInCode,
    createParagraphNear,
    liftEmptyBlock,
    splitBlock
  );
  return new Plugin({
    key: enterHandlerKey,
    props: {
      handleKeyDown(view, event) {
        if (event.isComposing || event.key !== "Enter") return false;
        const { $from } = view.state.selection;
        let inTable = false;
        let cellDepth = -1;
        let inListItem = false;
        for (let d = $from.depth; d > 0; d--) {
          const nodeName = $from.node(d).type.name;
          if (nodeName === "table_cell" || nodeName === "table_header") {
            inTable = true;
            cellDepth = d;
            break;
          }
          if (nodeName === "list_item") {
            inListItem = true;
            break;
          }
        }
        if (inTable) {
          if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
            const handled = gfmTableCommand({ kind: "add-row" })(view.state, view.dispatch);
            if (handled) event.preventDefault();
            return handled;
          }
          if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            const hardbreak2 = view.state.schema.nodes.hardbreak;
            if (hardbreak2) {
              const tr = view.state.tr.replaceSelectionWith(hardbreak2.create({ isInline: false }));
              view.dispatch(tr.scrollIntoView());
            }
            return true;
          }
          if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            if (cellDepth < 2) return true;
            const rowDepth = cellDepth - 1;
            const tableDepth = cellDepth - 2;
            const colIndex = $from.index(rowDepth);
            const rowIndex = $from.index(tableDepth);
            const tableNode = $from.node(tableDepth);
            const tableStart = $from.start(tableDepth);
            if (rowIndex === tableNode.childCount - 1) {
              const tableEnd = $from.after(tableDepth);
              const afterNode = view.state.doc.nodeAt(tableEnd);
              if (afterNode) {
                const $target = view.state.doc.resolve(tableEnd + 1);
                view.dispatch(view.state.tr.setSelection(TextSelection2.near($target)).scrollIntoView());
              } else {
                const paragraph2 = view.state.schema.nodes.paragraph;
                if (paragraph2) {
                  const tr = view.state.tr.insert(tableEnd, paragraph2.create());
                  const $target = tr.doc.resolve(tableEnd + 1);
                  tr.setSelection(TextSelection2.near($target));
                  view.dispatch(tr.scrollIntoView());
                }
              }
            } else {
              const nextRow = tableNode.child(rowIndex + 1);
              const safeCol = Math.min(colIndex, nextRow.childCount - 1);
              let targetPos = tableStart;
              for (let r2 = 0; r2 <= rowIndex; r2++) {
                targetPos += tableNode.child(r2).nodeSize;
              }
              targetPos += 1;
              for (let c2 = 0; c2 < safeCol; c2++) {
                targetPos += nextRow.child(c2).nodeSize;
              }
              targetPos += 1;
              const $target = view.state.doc.resolve(targetPos);
              view.dispatch(view.state.tr.setSelection(TextSelection2.near($target)).scrollIntoView());
            }
            return true;
          }
          return false;
        }
        if (inListItem) return false;
        if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
          if ($from.parent.type.name === "paragraph") {
            const text2 = $from.parent.textContent;
            const match = $from.parentOffset === text2.length ? text2.match(/^```(\S*)\s*$/) : null;
            if (match) {
              const language = match[1] ?? "";
              const codeBlockType = view.state.schema.nodes.code_block;
              if (codeBlockType) {
                const pos = $from.before();
                const end = $from.after();
                const tr = view.state.tr;
                tr.replaceWith(pos, end, codeBlockType.create({ language }));
                view.dispatch(tr);
                return true;
              }
            }
            const headers = $from.parentOffset === text2.length ? parsePipeTableHeader(text2) : null;
            if (headers) {
              const $para = view.state.doc.resolve($from.before());
              const parentNode = $para.node($para.depth);
              const tableType = view.state.schema.nodes.table;
              if (tableType && parentNode.type.contentMatch.matchType(tableType)) {
                const tableNode = buildTableFromHeaders(view.state.schema, headers);
                if (tableNode) {
                  const pos = $from.before();
                  const end = $from.after();
                  const tr = view.state.tr;
                  tr.replaceWith(pos, end, tableNode);
                  const inserted = tr.doc.nodeAt(pos);
                  if (inserted && inserted.childCount >= 2) {
                    const headerRowSize = inserted.child(0).nodeSize;
                    const $dataRow = tr.doc.resolve(pos + 1 + headerRowSize + 1);
                    tr.setSelection(TextSelection2.near($dataRow));
                  }
                  tr.scrollIntoView();
                  view.dispatch(tr);
                  return true;
                }
              }
            }
          }
          return enterCommand(view.state, view.dispatch, view);
        }
        return false;
      }
    }
  });
}

// src/plugins/cursor-syntax.ts
import { Plugin as Plugin2, PluginKey as PluginKey2 } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
var pluginKey = new PluginKey2("moraya-cursor-syntax");
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
function makeWidget(text2, className) {
  return () => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text2;
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
  const blockIsEmpty = parent.content.size === 0;
  if (!blockIsEmpty && parent.type === state.schema.nodes.heading) {
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
  for (let d = depth - 1; !blockIsEmpty && d >= 1; d--) {
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
    const targets = inlineScope === "line" ? runs : runs.filter((r2) => pos >= r2.from && pos < r2.to);
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
  return new Plugin2({
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

// src/plugins/link-text-plugin.ts
import { Plugin as Plugin3, PluginKey as PluginKey3, TextSelection as TextSelection3 } from "prosemirror-state";
import { Decoration as Decoration2, DecorationSet as DecorationSet2 } from "prosemirror-view";
var pluginKey2 = new PluginKey3("moraya-link-text");
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
function buildDecorations2(state) {
  const matches = findLinkPatterns(state, LINK_PATTERN_DECO);
  if (matches.length === 0) return DecorationSet2.empty;
  const decorations = matches.map(
    (m) => Decoration2.inline(m.from, m.to, { class: "link-text-syntax" })
  );
  return DecorationSet2.create(state.doc, decorations);
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
  return new Plugin3({
    key: pluginKey2,
    state: {
      init(_, state) {
        return buildDecorations2(state);
      },
      apply(tr, old, _, newState) {
        if (!tr.docChanged) return old;
        if (tr.getMeta("full-delete")) return DecorationSet2.empty;
        return buildDecorations2(newState);
      }
    },
    props: {
      decorations(state) {
        return this.getState(state);
      }
    },
    appendTransaction(transactions, oldState, newState) {
      if (transactions.some((tr2) => tr2.getMeta(pluginKey2))) return null;
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
          const { from, to, text: text2, href } = linkInfo;
          const literal = `[${text2}](${href})`;
          const textNode = newState.schema.text(literal);
          const tr2 = newState.tr.replaceWith(from, to, textNode);
          tr2.setMeta(pluginKey2, "expand");
          tr2.setMeta("addToHistory", false);
          const relPos = Math.max(0, Math.min(newPos - from, text2.length));
          const cursorPos = from + 1 + relPos;
          try {
            tr2.setSelection(TextSelection3.create(tr2.doc, cursorPos));
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
      tr.setMeta(pluginKey2, "collapse");
      tr.setMeta("addToHistory", false);
      return tr;
    }
  });
}

// src/plugins/inline-code-convert.ts
import { Plugin as Plugin4, PluginKey as PluginKey4 } from "prosemirror-state";
var pluginKey3 = new PluginKey4("moraya-inline-code-convert");
var ZWSP = "\u200B";
var ZWSP_MARK_NAMES = ["code", "strong", "em", "strike_through"];
function hasZwspTargetMark(marks2, state) {
  return ZWSP_MARK_NAMES.some((name) => {
    const mt = state.schema.marks[name];
    return mt && mt.isInSet(marks2);
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
  return new Plugin4({
    key: pluginKey3,
    appendTransaction(transactions, oldState, newState) {
      if (transactions.some((tr) => tr.getMeta(pluginKey3))) return null;
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
            tr.setMeta(pluginKey3, "collapse");
            tr.setMeta("addToHistory", false);
            return tr;
          }
        }
      }
      const insertPos = needsCursorTarget(newState);
      if (insertPos >= 0) {
        const tr = newState.tr.insertText(ZWSP, insertPos);
        tr.setMeta(pluginKey3, "cursor-target");
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
          const marks2 = [...$head.marks(), codeType.create()];
          const tr = newState.tr.setStoredMarks(marks2);
          tr.setMeta(pluginKey3, "boundary-marks");
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
          tr.setMeta(pluginKey3, "boundary-marks-inclusive");
          tr.setMeta("addToHistory", false);
          return tr;
        }
      }
      return null;
    }
  });
}

// src/plugins/editor-props-plugin.ts
import { Fragment as Fragment2, Slice } from "prosemirror-model";
import { AllSelection, Plugin as Plugin5, PluginKey as PluginKey5, TextSelection as TextSelection4 } from "prosemirror-state";
import { Decoration as Decoration3, DecorationSet as DecorationSet3 } from "prosemirror-view";
var editorPropsKey = new PluginKey5("moraya-editor-props");
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
function toggleTaskCheckboxAtClick(view, event) {
  const target = event.target;
  if (!target) return false;
  const li = target.closest('li[data-item-type="task"]');
  if (!li || !view.dom.contains(li)) return false;
  const rect = li.getBoundingClientRect();
  const padLeft = parseFloat(getComputedStyle(li).paddingLeft) || 0;
  if (event.clientX < rect.left || event.clientX > rect.left + padLeft) return false;
  if (event.clientY < rect.top || event.clientY > rect.bottom) return false;
  const innerPos = view.posAtDOM(li, 0);
  const $pos = view.state.doc.resolve(innerPos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === "list_item" && node.attrs.checked != null) {
      const liPos = $pos.before(depth);
      view.dispatch(
        view.state.tr.setNodeMarkup(liPos, void 0, {
          ...node.attrs,
          checked: !node.attrs.checked
        })
      );
      return true;
    }
  }
  return false;
}
function markdownSlice(text2, schema) {
  const doc2 = parseMarkdown(text2, schema);
  if (doc2.textContent.length === 0 && doc2.content.size <= 2) return null;
  const content = doc2.content;
  if (content.childCount === 1 && content.firstChild.type.name === "paragraph") {
    return new Slice(content.firstChild.content, 0, 0);
  }
  return new Slice(content, 0, 0);
}
function hasNonTextContent(slice) {
  let found = false;
  slice.content.descendants((node) => {
    if (found) return false;
    if (node.isLeaf && !node.isText) found = true;
    return !found;
  });
  return found;
}
function createEditorPropsPlugin(opts) {
  const { platform, linkOpener } = opts;
  const isMacOS = platform.isMacOS;
  let pendingPaste = false;
  return new Plugin5({
    key: editorPropsKey,
    props: {
      /**
       * Parse pasted plain text as Markdown so syntax renders instead of
       * being inserted as escaped literal text.
       */
      clipboardTextParser(text2, $context, plain, view) {
        if (plain || $context.parent.type.spec.code) return void 0;
        const slice = markdownSlice(text2, view.state.schema);
        if (!slice) return void 0;
        return slice;
      },
      /**
       * Safety net for pastes the HTML branch cannot turn into anything usable.
       * Also routes pasted markdown image syntax through the markdown parser.
       *
       * The guiding rule (user-facing): *when the rich content is empty, use the
       * plain text*. "Empty" is judged by outcome, not by looks — a slice can be
       * non-empty and still be a no-op (foreign schema, or block content that
       * cannot be fitted at the caret), which is indistinguishable from an empty
       * paste for the person watching the screen.
       */
      handlePaste(view, event, slice) {
        const plain = event.clipboardData?.getData("text/plain");
        if (!plain) return false;
        const schema = view.state.schema;
        const insertPlain = () => {
          const md2 = markdownSlice(plain, schema);
          const content = md2 ?? new Slice(Fragment2.from(schema.text(plain)), 0, 0);
          const tr = view.state.tr.replaceSelection(content);
          if (!tr.docChanged) return false;
          view.dispatch(tr);
          pendingPaste = true;
          return true;
        };
        const trimmed = plain.trim();
        if (/^!\[/.test(trimmed)) {
          const imgSlice = markdownSlice(trimmed, schema);
          if (imgSlice) {
            const tr = view.state.tr.replaceSelection(imgSlice);
            if (tr.docChanged) {
              view.dispatch(tr);
              pendingPaste = true;
              return true;
            }
          }
        }
        const linkMatch = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(trimmed);
        if (linkMatch && (!linkMatch[1] || !linkMatch[2])) {
          const textNode = schema.text(plain);
          view.dispatch(
            view.state.tr.replaceSelection(new Slice(Fragment2.from(textNode), 0, 0))
          );
          pendingPaste = true;
          return true;
        }
        if (trimmed.length === 0) return false;
        try {
          const sliceText = slice.content.textBetween(0, slice.content.size, "", "");
          const carriesSomething = sliceText.trim().length > 0 || hasNonTextContent(slice);
          const fits = carriesSomething && view.state.tr.replaceSelection(slice).docChanged;
          if (!fits) return insertPlain();
        } catch {
          return insertPlain();
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
          if (toggleTaskCheckboxAtClick(view, me)) {
            me.preventDefault();
            return true;
          }
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
            const sel = TextSelection4.near(view.state.doc.resolve(beforePos), -1);
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
              tr.setSelection(TextSelection4.create(tr.doc, 1));
              tr.setMeta("full-delete", true);
              view.dispatch(tr);
              return true;
            }
            if (event.key === "Backspace") {
              if (sel instanceof TextSelection4 && sel.empty && sel.$cursor) {
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
        tr.setSelection(TextSelection4.create(tr.doc, endPos + 1));
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
        const sel = TextSelection4.near($pos);
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
          if (sel.empty && sel instanceof TextSelection4 && sel.$cursor) {
            const $cursor = sel.$cursor;
            const ZWSP_MARK_NAMES2 = ["code", "strong", "em", "strike_through"];
            const nodeBefore = $cursor.nodeBefore;
            const nodeAfter = $cursor.nodeAfter;
            const hasTargetMarkBefore = nodeBefore != null && ZWSP_MARK_NAMES2.some((name) => {
              const mt = view.state.schema.marks[name];
              return mt && nodeBefore.marks.some((m) => m.type === mt);
            });
            if (hasTargetMarkBefore && nodeAfter?.isText && nodeAfter.text?.startsWith("\u200B")) {
              const nextPos = $cursor.pos + nodeAfter.nodeSize;
              const $next = view.state.doc.resolve(Math.min(nextPos, view.state.doc.content.size));
              const nextSel = TextSelection4.near($next, 1);
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
            tr.setSelection(TextSelection4.create(tr.doc, 1));
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
        if (!isMacOS) return DecorationSet3.empty;
        const { selection } = state;
        if (!selection.empty) return DecorationSet3.empty;
        const { $from } = selection;
        const parent = $from.parent;
        if (parent.type.name === "paragraph" && parent.content.size === 0) {
          const pos = $from.before();
          return DecorationSet3.create(state.doc, [
            Decoration3.node(pos, pos + parent.nodeSize, { class: "caret-empty-para" })
          ]);
        }
        return DecorationSet3.empty;
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

// src/plugins/footnote-plugin.ts
import { Plugin as Plugin6, PluginKey as PluginKey6 } from "prosemirror-state";
var footnotePluginKey = new PluginKey6("moraya-footnote");
function findDefinition(doc2, label) {
  let hit = null;
  doc2.descendants((node, pos) => {
    if (hit) return false;
    if (node.type.name === "footnote_definition" && node.attrs.label === label) {
      hit = { node, pos };
      return false;
    }
    return true;
  });
  return hit;
}
function findFirstRef(doc2, label) {
  let hit = null;
  doc2.descendants((node, pos) => {
    if (hit) return false;
    if (node.type.name === "footnote_ref" && node.attrs.label === label) {
      hit = { node, pos };
      return false;
    }
    return true;
  });
  return hit;
}
function definitionText(doc2, label) {
  const hit = findDefinition(doc2, label);
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
  return new Plugin6({
    key: footnotePluginKey,
    props: {
      handleDOMEvents: {
        mouseover(view, event) {
          const el = event.target;
          const refEl = el?.closest?.("[data-footnote-ref]");
          if (refEl instanceof HTMLElement) {
            const label = refEl.dataset.label ?? "";
            const text2 = definitionText(view.state.doc, label);
            refEl.title = text2 ? `[^${label}] ${text2}` : `[^${label}] (\u672A\u5B9A\u4E49)`;
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

// src/doc-cache.ts
var LRUDocCache = class {
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    if (maxEntries < 1) throw new RangeError("docCache maxEntries must be \u2265 1");
  }
  maxEntries;
  map = /* @__PURE__ */ new Map();
  get size() {
    return this.map.size;
  }
  get(hash) {
    const v = this.map.get(hash);
    if (v !== void 0) {
      this.map.delete(hash);
      this.map.set(hash, v);
    }
    return v;
  }
  set(hash, doc2) {
    if (this.map.has(hash)) {
      this.map.delete(hash);
    }
    this.map.set(hash, doc2);
    if (this.map.size > this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== void 0) {
        this.map.delete(firstKey);
      }
    }
  }
  clear() {
    this.map.clear();
  }
};
function createDocCache(maxEntries = 10) {
  return new LRUDocCache(maxEntries);
}

// src/setup.ts
var tier1Cache = null;
var tier1Loading = null;
function preloadEnhancementPlugins(schema, rendererRegistry) {
  if (tier1Cache && tier1Cache.key.schema === schema && tier1Cache.key.rendererRegistry === rendererRegistry) {
    return Promise.resolve(tier1Cache.plugins);
  }
  if (tier1Loading) return tier1Loading;
  tier1Loading = Promise.allSettled([
    Promise.resolve().then(() => (init_highlight(), highlight_exports)),
    Promise.resolve().then(() => (init_emoji(), emoji_exports)),
    Promise.resolve().then(() => (init_code_block_view(), code_block_view_exports))
  ]).then(([hl, em2, cbv]) => {
    const plugins = {};
    if (hl.status === "fulfilled") {
      plugins.highlight = hl.value.createHighlightPlugin();
    }
    if (em2.status === "fulfilled") {
      plugins.emoji = em2.value.createEmojiPlugin();
    }
    if (cbv.status === "fulfilled") {
      plugins.codeBlockView = cbv.value.createCodeBlockNodeViewFactory({
        ...rendererRegistry ? { rendererRegistry } : {}
      });
    }
    plugins.defListInputRule = createDefListInputRule(schema);
    tier1Cache = { key: { schema, ...rendererRegistry ? { rendererRegistry } : {} }, plugins };
    tier1Loading = null;
    return plugins;
  });
  return tier1Loading;
}
function createImageSelectionPlugin() {
  return new Plugin9({
    key: new PluginKey9("moraya-image-selection"),
    props: {
      decorations(state) {
        const { from, to } = state.selection;
        if (from === to) return DecorationSet5.empty;
        const decos = [];
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === "image") {
            decos.push(Decoration5.node(pos, pos + node.nodeSize, { class: "image-in-selection" }));
          } else if (node.type.name === "html_inline" && /^<img\s/i.test(node.attrs.value || "")) {
            decos.push(Decoration5.node(pos, pos + node.nodeSize, { class: "image-in-selection" }));
          }
        });
        return decos.length ? DecorationSet5.create(state.doc, decos) : DecorationSet5.empty;
      }
    }
  });
}
function buildInputRules(schema, tier1, enableInlineMarks = true) {
  const rules = [];
  const N = schema.nodes;
  const M = schema.marks;
  if (N.code_block) {
    rules.push(textblockTypeInputRule(
      /^```(?<language>[a-zA-Z][a-zA-Z0-9_+#.\-]*)?[\s\n]$/,
      N.code_block,
      (match) => ({ language: match.groups?.language ?? "" })
    ));
  }
  if (N.blockquote) {
    rules.push(wrappingInputRule2(/^\s*>\s$/, N.blockquote));
  }
  if (N.bullet_list) {
    rules.push(wrappingInputRule2(/^\s*[-*]\s$/, N.bullet_list));
  }
  if (N.ordered_list) {
    rules.push(wrappingInputRule2(
      /^\s*(\d+)\.\s$/,
      N.ordered_list,
      (match) => ({ order: +(match[1] ?? "1") }),
      (match, node) => node.childCount + node.attrs.order === +(match[1] ?? "1")
    ));
  }
  if (N.heading) {
    for (let level = 1; level <= 6; level++) {
      const pattern = new RegExp(`^#{${level}}\\s$`);
      rules.push(textblockTypeInputRule(pattern, N.heading, { level }));
    }
  }
  if (N.horizontal_rule) {
    rules.push(new InputRule(/^---$/, (state, _match, start, end) => {
      const hr = N.horizontal_rule.create();
      return state.tr.replaceWith(start - 1, end, hr);
    }));
  }
  if (N.math_block) {
    rules.push(new InputRule(/^\$\$\s$/, (state, _match, start, end) => {
      const $start = state.doc.resolve(start);
      if (!$start.node(-1).canReplaceWith(
        $start.index(-1),
        $start.indexAfter(-1),
        N.math_block
      )) return null;
      return state.tr.delete(start, end).setBlockType(start, start, N.math_block);
    }));
  }
  if (N.math_inline) {
    rules.push(new InputRule(/(?:\$)([^$]+)(?:\$)$/, (state, match, start, end) => {
      const content = match[1];
      if (!content) return null;
      const node = N.math_inline.create(null, schema.text(content));
      return state.tr.replaceWith(start, end, node);
    }));
  }
  if (enableInlineMarks && M.strong) {
    rules.push(new InputRule(
      /(?<![\w:/])(?:\*\*|__)([^*_]+?)(?:\*\*|__)(?![\w/])$/,
      (state, match, start, end) => {
        const tr = state.tr;
        const captured = match[1];
        if (captured) {
          const textStart = start + match[0].indexOf(captured);
          const textEnd = textStart + captured.length;
          if (textEnd < end) tr.delete(textEnd, end);
          if (textStart > start) tr.delete(start, textStart);
          const markFrom = start;
          const markTo = markFrom + captured.length;
          tr.addMark(markFrom, markTo, M.strong.create());
        }
        return tr;
      }
    ));
  }
  if (enableInlineMarks && M.em) {
    rules.push(new InputRule(
      /(?<![\w:/*])(?:\*|_)([^*_]+?)(?:\*|_)(?![\w/])$/,
      (state, match, start, end) => {
        const tr = state.tr;
        const captured = match[1];
        if (captured) {
          const textStart = start + match[0].indexOf(captured);
          const textEnd = textStart + captured.length;
          if (textEnd < end) tr.delete(textEnd, end);
          if (textStart > start) tr.delete(start, textStart);
          const markFrom = start;
          const markTo = markFrom + captured.length;
          tr.addMark(markFrom, markTo, M.em.create());
        }
        return tr;
      }
    ));
  }
  if (enableInlineMarks && M.code) {
    rules.push(new InputRule(
      /(?:`)([^`]+)(?:`)$/,
      (state, match, start, end) => {
        const tr = state.tr;
        const captured = match[1];
        if (captured) {
          const textStart = start + match[0].indexOf(captured);
          const textEnd = textStart + captured.length;
          if (textEnd < end) tr.delete(textEnd, end);
          if (textStart > start) tr.delete(start, textStart);
          const markFrom = start;
          const markTo = markFrom + captured.length;
          tr.addMark(markFrom, markTo, M.code.create());
        }
        return tr;
      }
    ));
  }
  if (enableInlineMarks && M.strike_through) {
    rules.push(new InputRule(
      /~~([^~]+)~~$/,
      (state, match, start, end) => {
        const tr = state.tr;
        const captured = match[1];
        if (captured) {
          const textStart = start + match[0].indexOf(captured);
          const textEnd = textStart + captured.length;
          if (textEnd < end) tr.delete(textEnd, end);
          if (textStart > start) tr.delete(start, textStart);
          const markFrom = start;
          const markTo = markFrom + captured.length;
          tr.addMark(markFrom, markTo, M.strike_through.create());
        }
        return tr;
      }
    ));
  }
  if (enableInlineMarks && M.highlight) {
    const applyHighlight = (delimiter) => (state, match, start, end) => {
      const tr = state.tr;
      const captured = match[1];
      if (captured) {
        const textStart = start + match[0].indexOf(captured);
        const textEnd = textStart + captured.length;
        if (textEnd < end) tr.delete(textEnd, end);
        if (textStart > start) tr.delete(start, textStart);
        const markFrom = start;
        const markTo = markFrom + captured.length;
        tr.addMark(markFrom, markTo, M.highlight.create({ delimiter }));
      }
      return tr;
    };
    rules.push(new InputRule(/(?<!\^)\^\^([^^]+)\^\^$/, applyHighlight("caret")));
    rules.push(new InputRule(/(?<!=)==([^=\n]+)==$/, applyHighlight("equals")));
  }
  rules.push(new InputRule(
    /^\[(?<checked>\s|x)\]\s$/,
    (state, match, start, end) => {
      const pos = state.doc.resolve(start);
      let depth = 0;
      let node = pos.node(depth);
      while (node && node.type.name !== "list_item") {
        depth--;
        try {
          node = pos.node(depth);
        } catch {
          node = null;
        }
      }
      if (!node || node.attrs.checked != null) return null;
      const checked = Boolean(match.groups?.checked === "x");
      const finPos = pos.before(depth);
      return state.tr.deleteRange(start, end).setNodeMarkup(finPos, void 0, {
        ...node.attrs,
        checked
      });
    }
  ));
  if (M.link) {
    rules.push(new InputRule(
      /\[([^\]]+)\]\(([^)]+)\)$/,
      (state, match, start, end) => {
        const text2 = match[1];
        const url = match[2];
        if (!text2 || !url) return null;
        const linkMark = M.link.create({ href: url });
        return state.tr.replaceWith(start, end, schema.text(text2, [linkMark]));
      }
    ));
  }
  if (tier1.defListInputRule) {
    rules.push(tier1.defListInputRule);
  }
  return inputRules({ rules });
}
function buildKeymap(schema) {
  const N = schema.nodes;
  const M = schema.marks;
  const listItemType = N.list_item;
  const bindings = {
    // History
    "Mod-z": undo,
    "Mod-y": redo,
    "Mod-Shift-z": redo,
    // Marks
    ...M.strong ? { "Mod-b": toggleMark2(M.strong) } : {},
    ...M.em ? { "Mod-i": toggleMark2(M.em) } : {},
    ...M.code ? { "Mod-e": toggleMark2(M.code) } : {},
    ...M.strike_through ? { "Mod-Shift-x": toggleMark2(M.strike_through) } : {},
    ...M.highlight ? { "Mod-h": toggleMark2(M.highlight, { delimiter: "caret" }) } : {}
  };
  if (listItemType) {
    bindings["Enter"] = splitListItem(listItemType);
    bindings["Mod-]"] = sinkListItem(listItemType);
    bindings["Mod-["] = liftListItem2(listItemType);
  }
  for (const [key, kind] of [["Tab", "next-cell"], ["Shift-Tab", "previous-cell"]]) {
    bindings[key] = (state, dispatch) => {
      const { $from } = state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === N.table) return gfmTableCommand({ kind })(state, dispatch);
      }
      if (!listItemType) return false;
      if (key === "Shift-Tab") return liftListItem2(listItemType)(state, dispatch);
      if (sinkListItem(listItemType)(state)) return sinkListItem(listItemType)(state, dispatch);
      if (dispatch) dispatch(state.tr.insertText("    "));
      return true;
    };
  }
  if (N.paragraph) bindings["Mod-Alt-0"] = setBlockType2(N.paragraph);
  if (N.heading) {
    for (let level = 1; level <= 6; level++) {
      bindings[`Mod-Alt-${level}`] = setBlockType2(N.heading, { level });
    }
  }
  if (N.code_block) bindings["Mod-Alt-c"] = setBlockType2(N.code_block);
  if (N.blockquote) bindings["Mod-Shift-b"] = wrapIn2(N.blockquote);
  bindings["Mod-a"] = (state, dispatch) => {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === "code_block") {
        if (dispatch) {
          dispatch(state.tr.setSelection(TextSelection5.create(state.doc, $from.start(d), $from.end(d))));
        }
        return true;
      }
    }
    if (dispatch) {
      dispatch(state.tr.setSelection(new AllSelection2(state.doc)));
    }
    return true;
  };
  if (N.hardbreak) {
    bindings["Shift-Enter"] = (state, dispatch) => {
      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(N.hardbreak.create({ isInline: false })).scrollIntoView());
      }
      return true;
    };
  }
  bindings["Backspace"] = (state, dispatch) => {
    const sel = state.selection;
    {
      const docSize = state.doc.content.size;
      const isAllSelected = sel instanceof AllSelection2 || docSize > 0 && sel.from <= 1 && sel.to >= docSize - 1;
      if (isAllSelected && dispatch) {
        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return false;
        const emptyParagraph = paragraphType.create();
        const tr = state.tr.replaceWith(0, docSize, emptyParagraph);
        tr.setSelection(TextSelection5.create(tr.doc, 1));
        tr.setMeta("full-delete", true);
        dispatch(tr);
        return true;
      }
      if (isAllSelected) return true;
    }
    if (sel instanceof NodeSelection && sel.node.isBlock && sel.node.type.spec.atom) {
      const before = Selection.findFrom(state.doc.resolve(sel.from), -1, true);
      if (before && dispatch) {
        dispatch(state.tr.setSelection(before).scrollIntoView());
      }
      return true;
    }
    if (!sel.empty || !(sel instanceof TextSelection5)) return false;
    const $cursor = sel.$cursor;
    if (!$cursor) return false;
    const { parent, parentOffset } = $cursor;
    if (parent.isTextblock && parentOffset === parent.content.size && parent.content.size > 0) {
      const afterPos = $cursor.after();
      if (afterPos < state.doc.content.size) {
        const nextNode = state.doc.resolve(afterPos).nodeAfter;
        if (nextNode && nextNode.isBlock && nextNode.type.spec.atom) {
          if (dispatch) {
            const before = $cursor.nodeBefore;
            if (before) {
              const delSize = before.isText ? 1 : before.nodeSize;
              dispatch(state.tr.delete(sel.from - delSize, sel.from).scrollIntoView());
            }
          }
          return true;
        }
      }
    }
    if (parent.isTextblock && parentOffset === 0) {
      const beforePos = $cursor.before();
      if (beforePos > 0) {
        const prevNode = state.doc.resolve(beforePos).nodeBefore;
        if (prevNode && prevNode.isBlock && prevNode.type.spec.atom) {
          const target = Selection.findFrom(
            state.doc.resolve(beforePos - prevNode.nodeSize),
            -1,
            true
          );
          if (target && dispatch) {
            dispatch(state.tr.setSelection(target).scrollIntoView());
          }
          return true;
        }
      }
    }
    if (parent.type.name === "paragraph" && parentOffset === parent.content.size) {
      const nodeBeforeAtom = $cursor.nodeBefore;
      if (nodeBeforeAtom && nodeBeforeAtom.isAtom) {
        const afterPos2 = $cursor.after();
        if (afterPos2 < state.doc.content.size) {
          const nextNode2 = state.doc.resolve(afterPos2).nodeAfter;
          if (nextNode2 && nextNode2.isBlock) {
            return joinForward(state, dispatch);
          }
        }
      }
    }
    if (parent.isTextblock && parentOffset === parent.content.size && parentOffset > 0) {
      if (dispatch) {
        const nb = $cursor.nodeBefore;
        if (nb && nb.isText && nb.text) {
          const code2 = nb.text.charCodeAt(nb.text.length - 1);
          const delLen = code2 >= 56320 && code2 <= 57343 ? 2 : 1;
          dispatch(state.tr.delete(sel.from - delLen, sel.from).scrollIntoView());
        } else if (nb) {
          dispatch(state.tr.delete(sel.from - nb.nodeSize, sel.from).scrollIntoView());
        }
      }
      return true;
    }
    return false;
  };
  bindings["Delete"] = (state, dispatch) => {
    const sel = state.selection;
    if (sel instanceof NodeSelection && sel.node.isBlock && sel.node.type.spec.atom) {
      const after = Selection.findFrom(state.doc.resolve(sel.to), 1, true);
      if (after && dispatch) {
        dispatch(state.tr.setSelection(after).scrollIntoView());
      }
      return true;
    }
    if (sel.empty && sel instanceof TextSelection5 && sel.$cursor) {
      const $c = sel.$cursor;
      if ($c.parent.isTextblock && $c.parentOffset === $c.parent.content.size) {
        const ap = $c.after();
        if (ap < state.doc.content.size) {
          const nn = state.doc.resolve(ap).nodeAfter;
          if (nn && nn.isBlock && nn.type.spec.atom) {
            return true;
          }
        }
      }
    }
    return false;
  };
  return keymap(bindings);
}
function createDirtyTrackPlugin(onDocChanged) {
  return new Plugin9({
    key: new PluginKey9("moraya-dirty-track"),
    view: () => ({
      update: (view, prevState) => {
        if (!prevState || view.state.doc.eq(prevState.doc)) return;
        onDocChanged(view.state.doc.textContent);
      }
    })
  });
}
function createLazyChangePlugin(onChange, debounceMs = 500) {
  let changeTimer = null;
  return new Plugin9({
    key: new PluginKey9("moraya-lazy-change"),
    view: () => ({
      update: (view, prevState) => {
        if (!prevState || view.state.doc.eq(prevState.doc)) return;
        if (changeTimer !== null) clearTimeout(changeTimer);
        changeTimer = setTimeout(() => {
          try {
            const markdown2 = serializeMarkdown(view.state.doc);
            onChange(markdown2);
          } catch {
          }
          changeTimer = null;
        }, debounceMs);
      },
      destroy: () => {
        if (changeTimer !== null) {
          clearTimeout(changeTimer);
          changeTimer = null;
        }
      }
    })
  });
}
var defaultPlatform = () => ({
  getCurrentFilePath: () => null,
  isMacOS: typeof navigator !== "undefined" && /Mac/i.test(navigator.platform ?? "")
});
async function createEditorPlugins(opts, schemaArg) {
  if (!opts.mediaResolver) {
    throw new TypeError(
      "@moraya/core: createEditorPlugins() requires a MediaResolver in opts.mediaResolver"
    );
  }
  const platform = opts.platform ?? defaultPlatform();
  void platform;
  const schemaConfig = {
    mediaResolver: opts.mediaResolver,
    ...opts.rendererRegistry ? { rendererRegistry: opts.rendererRegistry } : {},
    ...opts.linkOpener ? { linkOpener: opts.linkOpener } : {},
    ...opts.spreadsheetViewFactory ? { spreadsheetViewFactory: opts.spreadsheetViewFactory } : {}
  };
  const schema = schemaArg ?? createSchema(schemaConfig);
  const linkOpener = opts.linkOpener ?? {
    open(url) {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  };
  const tier1 = await preloadEnhancementPlugins(schema, opts.rendererRegistry);
  const plugins = [
    // List shortcuts using event.code (reliable on macOS where Option+key
    // produces special chars). Must come before keymap so this handler has
    // highest priority.
    new Plugin9({
      key: new PluginKey9("moraya-list-shortcuts"),
      props: {
        handleKeyDown(view, event) {
          const mod = event.metaKey || event.ctrlKey;
          if (!mod || !event.altKey || event.shiftKey) return false;
          if (event.code === "KeyO") return wrapInOrderedList(view.state, view.dispatch, view);
          if (event.code === "KeyU") return wrapInBulletList(view.state, view.dispatch, view);
          if (event.code === "KeyX") return wrapInTaskList(view.state, view.dispatch, view);
          return false;
        }
      }
    }),
    // Input rules (must come before keymaps)
    buildInputRules(schema, tier1, opts.enableInlineMarkInputRules !== false),
    // Custom Enter handler MUST come before keymaps so pipe-table and
    // code-fence detection run before baseKeymap's splitBlock intercepts Enter.
    createEnterHandlerPlugin(),
    // Keymaps
    buildKeymap(schema),
    keymap(baseKeymap)
  ];
  if (opts.enableHistory !== false) {
    plugins.push(history());
  }
  plugins.push(dropCursor());
  if (opts.enableTableResize !== false) {
    plugins.push(columnResizing());
  }
  plugins.push(createEditorPropsPlugin({ platform, linkOpener }));
  plugins.push(createCursorSyntaxPlugin(opts.inlineSyntaxScope ?? "cursor"));
  plugins.push(createLinkTextPlugin());
  plugins.push(createInlineCodeConvertPlugin(opts.enableInlineMarkInputRules !== false));
  plugins.push(createFootnotePlugin());
  if (opts.enableImageSelection !== false) {
    plugins.push(createImageSelectionPlugin());
  }
  if (opts.onChange) {
    plugins.push(createLazyChangePlugin(opts.onChange, opts.changeDebounceMs));
  } else if (opts.onDocChanged) {
    plugins.push(createDirtyTrackPlugin(opts.onDocChanged));
  }
  if (tier1.highlight) plugins.push(tier1.highlight);
  if (tier1.emoji) plugins.push(tier1.emoji);
  return plugins;
}
async function createEditor(opts) {
  if (!opts.container) {
    throw new TypeError(
      "@moraya/core: createEditor() requires opts.container (HTMLElement)"
    );
  }
  if (!opts.mediaResolver) {
    throw new TypeError(
      "@moraya/core: createEditor() requires opts.mediaResolver"
    );
  }
  const schemaConfig = {
    mediaResolver: opts.mediaResolver,
    ...opts.rendererRegistry ? { rendererRegistry: opts.rendererRegistry } : {},
    ...opts.linkOpener ? { linkOpener: opts.linkOpener } : {},
    ...opts.spreadsheetViewFactory ? { spreadsheetViewFactory: opts.spreadsheetViewFactory } : {}
  };
  const baseSchema = createSchema(schemaConfig);
  const schema = opts.configureSchema ? opts.configureSchema(baseSchema) : baseSchema;
  const docCache = opts.docCache ?? createDocCache(10);
  void docCache;
  const plugins = await createEditorPlugins(opts, schema);
  const tier1 = await preloadEnhancementPlugins(schema, opts.rendererRegistry);
  const nodeViews = {};
  if (tier1.codeBlockView) {
    nodeViews.code_block = tier1.codeBlockView;
  }
  const svFactory = opts.spreadsheetViewFactory;
  if (svFactory && schema.nodes.spreadsheet) {
    nodeViews.spreadsheet = (node, view2, getPos) => {
      const dom = document.createElement("div");
      dom.className = "spreadsheet-node-view";
      dom.contentEditable = "false";
      let lastSource = node.attrs.source;
      const instance = svFactory.create(dom, lastSource, (csv) => {
        lastSource = csv;
        const pos = getPos();
        if (pos == null) return;
        view2.dispatch(view2.state.tr.setNodeMarkup(pos, void 0, { source: csv }));
      });
      return {
        dom,
        destroy() {
          instance.destroy();
        },
        update(newNode) {
          if (newNode.type.name !== "spreadsheet") return false;
          const newSource = newNode.attrs.source;
          if (newSource === lastSource) return true;
          return false;
        },
        // The spreadsheet is an atom block backed by its own editor (RevoGrid).
        // Tell ProseMirror to keep its hands off events and mutations happening
        // inside the NodeView, otherwise typing into a cell would be intercepted
        // by the outer editor and the spreadsheet block would be overwritten.
        stopEvent() {
          return true;
        },
        ignoreMutation() {
          return true;
        }
      };
    };
  }
  if (!svFactory && schema.nodes.spreadsheet) {
    nodeViews.spreadsheet = (node) => {
      const dom = document.createElement("pre");
      dom.className = "spreadsheet-fallback";
      dom.textContent = node.attrs.source;
      return { dom };
    };
  }
  const fmFactory = opts.frontmatterViewFactory;
  if (fmFactory && schema.nodes.frontmatter) {
    nodeViews.frontmatter = (node, view2, getPos) => {
      const dom = document.createElement("div");
      dom.className = "frontmatter-node-view";
      dom.contentEditable = "false";
      let lastRaw = node.textContent;
      const onChange = (newRaw) => {
        const pos = getPos();
        if (pos == null) return;
        const cur = view2.state.doc.nodeAt(pos);
        if (!cur || cur.type.name !== "frontmatter") return;
        if (newRaw === cur.textContent) return;
        const from = pos + 1;
        const to = pos + cur.nodeSize - 1;
        const tr = newRaw ? view2.state.tr.replaceWith(from, to, view2.state.schema.text(newRaw)) : view2.state.tr.delete(from, to);
        view2.dispatch(tr);
      };
      let inst = fmFactory.render(dom, lastRaw, onChange);
      return {
        dom,
        destroy() {
          inst?.destroy?.();
        },
        update(newNode) {
          if (newNode.type.name !== "frontmatter") return false;
          const raw = newNode.textContent;
          if (raw === lastRaw) return true;
          lastRaw = raw;
          inst?.destroy?.();
          dom.replaceChildren();
          inst = fmFactory.render(dom, raw, onChange);
          return true;
        },
        stopEvent() {
          return true;
        },
        ignoreMutation() {
          return true;
        }
      };
    };
  }
  const state = opts.createState ? opts.createState(schema, plugins) : EditorState.create({
    schema,
    doc: opts.initialContent ? parseMarkdown(opts.initialContent, schema) : schema.topNodeType.createAndFill(),
    plugins
  });
  if (state.schema !== schema) {
    throw new TypeError("@moraya/core: createState() must use the configured schema");
  }
  const view = new EditorView(opts.container, {
    state,
    nodeViews,
    ...opts.dispatchTransaction ? {
      dispatchTransaction(tr) {
        opts.dispatchTransaction(this, tr);
      }
    } : {},
    attributes: {
      class: "moraya-editor",
      spellcheck: "true"
    }
  });
  if (opts.onFocus || opts.onBlur) {
    const editorDom = opts.container.querySelector(".ProseMirror");
    if (editorDom) {
      if (opts.onFocus) editorDom.addEventListener("focus", opts.onFocus);
      if (opts.onBlur) editorDom.addEventListener("blur", opts.onBlur);
    }
  }
  return {
    view,
    getMarkdown() {
      return serializeMarkdown(view.state.doc);
    },
    setContent(md2) {
      const newDoc = parseMarkdown(md2, schema);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
      view.dispatch(tr);
    },
    destroy() {
      view.destroy();
    }
  };
}
export {
  buildInputRules,
  createEditor,
  createEditorPlugins,
  preloadEnhancementPlugins
};
//# sourceMappingURL=setup.js.map