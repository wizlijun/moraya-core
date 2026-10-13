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
        const empty2 = document.createElement("div");
        empty2.className = "code-lang-empty";
        empty2.textContent = "No matches";
        listEl.appendChild(empty2);
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
function setDocumentBaseDir(dir) {
  documentBaseDir = dir;
}
function getDocumentBaseDir() {
  return documentBaseDir;
}
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
  const schema2 = new Schema({
    nodes: buildNodes(config.mediaResolver),
    marks
  });
  schemaCache.set(config.mediaResolver, schema2);
  return schema2;
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
function check(n, max) {
  if (!Number.isInteger(n) || n < 0 || n > max) throw new RangeError("offset");
}
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
function completed(p, n, key) {
  let lo = 0;
  let hi = p.changes.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (p.changes[mid][key] <= n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function sourceOffsetAt(p, n) {
  check(n, p.text.length);
  const k = completed(p, n, "viewTo");
  const c2 = p.changes[k - 1];
  return n + (c2 ? c2.sourceTo - c2.viewTo : 0);
}
function viewOffsetAt(p, n, bias) {
  check(n, p.sourceLength);
  const k = completed(p, n, "sourceTo");
  const next = p.changes[k];
  const prev = p.changes[k - 1];
  if (next && n > next.sourceFrom) return bias < 0 ? next.viewFrom : next.viewTo;
  return n - (prev ? prev.sourceTo - prev.viewTo : 0);
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
function finishSourceLayout(blankLines, fallback) {
  const units = blankLines.map((u) => {
    const base = { id: u.id, sourceFrom: u.sourceFrom, sourceTo: u.sourceTo, container: u.container };
    if (u.role === "separator") return { ...base, role: "separator" };
    if (!u.emission) throw new UnsupportedOwnership();
    return { ...base, role: "empty-paragraph", emission: u.emission };
  });
  return fallback ? { blankLines: units, fallback } : { blankLines: units };
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
wrapCaptureRule(md.block.ruler, "reference", (original, state, startLine, endLine, silent) => {
  const collector = collectorFor(state);
  const scope = state.level === 0 && state.blkIndent === 0 ? "top-level" : "nested";
  const result = original(state, startLine, endLine, silent);
  if (!collector || !result || silent) return result;
  const from = collector.lineStarts[startLine], to = collector.lineStarts[state.line];
  if (from === void 0 || to === void 0 || to <= from) throw new UnsupportedSourceCapture();
  const raw = rawRange(collector.trace, from, to);
  if (raw) {
    const previous = collector.protectedSources[collector.protectedSources.length - 1];
    if (previous && previous.sourceTo > raw.from) throw new UnsupportedSourceCapture();
    collector.protectedSources.push(Object.freeze({
      kind: "reference-definition",
      sourceFrom: raw.from,
      sourceTo: raw.to,
      scope
    }));
  }
  return result;
});
wrapCaptureRule(md.block.ruler, "paragraph", (original, state, ...args) => {
  const collector = collectorFor(state);
  if (!collector) return original(state, ...args);
  const top = state.level === 0 && state.blkIndent === 0, level = state.level;
  const originalGetLines = state.getLines;
  if (typeof originalGetLines !== "function" || !Array.isArray(state.bMarks) || !Array.isArray(state.eMarks)) throw new UnsupportedSourceCapture();
  const start = state.tokens.length;
  let capturedLines;
  let terminal;
  state.getLines = function(begin, end, indent, keepLastLF) {
    const value = originalGetLines.call(this, begin, end, indent, keepLastLF);
    const endOfLine = this.eMarks[end - 1];
    let slashes = 0;
    for (let i = value.length - 1; i >= 0 && value[i] === "\\"; i--) slashes++;
    const restore = !keepLastLF && this.src[endOfLine] === "\n" && (value.endsWith("  ") || slashes % 2 === 1);
    const left = value.length - value.trimStart().length;
    if (restore) terminal = {
      content: value.trimStart() + "\n",
      from: this.bMarks[begin] + left,
      to: endOfLine + 1
    };
    if (top) {
      if (indent !== 0) throw new UnsupportedSourceCapture();
      const from = this.bMarks[begin], to = keepLastLF ? Math.min(this.src.length, endOfLine + 1) : endOfLine;
      const part = sliceTrace(collector.trace, from, to);
      if (part.text !== value) throw new UnsupportedSourceCapture();
      capturedLines = restore ? sliceTrace(collector.trace, terminal.from, terminal.to) : sliceTrace(part, left, left + value.trim().length);
    }
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
    if (terminal) token.content = terminal.content;
    if (top) {
      if (!capturedLines || capturedLines.text !== token.content || !Array.isArray(token.children)) {
        throw new UnsupportedSourceCapture();
      }
      owners.set(token.children, capturedLines);
      tokenArrays.set(token, token.children);
    }
  }
  return result;
});
wrapCaptureRule(md.core.ruler, "inline", (original, state) => {
  if (!collectorFor(state)) return original(state);
  const mapped = state.tokens.filter((token) => tokenArrays.has(token));
  const check2 = () => {
    for (const token of mapped) {
      if (!Array.isArray(token.children) || token.children !== tokenArrays.get(token)) throw new UnsupportedSourceCapture();
    }
  };
  check2();
  const result = original(state);
  check2();
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
var rootStarts = /* @__PURE__ */ new WeakMap();
var rootEnds = /* @__PURE__ */ new WeakMap();
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
    const draft = {
      collector,
      kind: "natural",
      gapIndex: id,
      id,
      tokenType: token.type,
      sourceFrom: raw.from,
      sourceTo: raw.to,
      tailFrom
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
    } else end.collector.roots.push({
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
function getParserFor(schema2) {
  if (!schema2 || schema2 === defaultSchema) return defaultParser;
  let p = parserCache.get(schema2);
  if (!p) {
    p = new MorayaMarkdownParser(schema2);
    parserCache.set(schema2, p);
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
var terminalStarts = /* @__PURE__ */ new WeakMap();
var sourceRootSerializer = new MarkdownSerializer({
  ...serializer.nodes,
  hardbreak(state, node, parent, index) {
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
}, serializer.marks, { hardBreakNodeName: "hardbreak", strict: false });
function serializeSourceRootMarkdown(doc2) {
  let result = sourceRootSerializer.serialize(doc2, { tightLists: true });
  result = relaxEscapes(result, doc2);
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
var ASYNC_PARSE_THRESHOLD = 5e4;
function parseMarkdownAsync(markdown2, schemaArg) {
  const p = getParserFor(schemaArg);
  const normalized = normalizeSmartQuotes(normalizeMathBlocks(markdown2));
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
function parseDocumentWithSourceCapture(source, schema2) {
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
    const collector = { source, trace, lineStarts: [], protectedSources: [], runs: [], roots: [], synthetic: [], blankLines: [] };
    const doc2 = getParserFor(schema2).parse(work, { [captureKey]: collector });
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
      protectedSources: Object.freeze(collector.protectedSources),
      layout: finishSourceLayout(collector.blankLines, collector.fallback),
      roots: collector.roots,
      gaps: buildSourceGaps(source, collector.roots, collector.synthetic)
    } };
  } catch (error) {
    return { ok: false, reason: error instanceof UnsupportedSourceCapture || error instanceof UnsupportedOwnership ? "unsupported-source" : "parse-error" };
  }
}

// src/setup.ts
import {
  AllSelection as AllSelection2,
  EditorState,
  NodeSelection,
  Plugin as Plugin9,
  PluginKey as PluginKey9,
  Selection,
  TextSelection as TextSelection4
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

// src/commands.ts
import {
  toggleMark,
  setBlockType,
  wrapIn,
  lift
} from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
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
  const cb = nodeType("code_block");
  if (state.selection.$from.parent.type === cb) {
    return setBlockType(nodeType("paragraph"))(state, dispatch);
  }
  return setBlockType(cb)(state, dispatch);
};
var insertHorizontalRule = (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.replaceSelectionWith(nodeType("horizontal_rule").create()));
  }
  return true;
};
var insertTable = (state, dispatch) => {
  const tableType = schema.nodes.table;
  if (!tableType) {
    if (dispatch) {
      const text2 = "\n\n| Col 1 | Col 2 | Col 3 |\n|---|---|---|\n|   |   |   |\n|   |   |   |\n\n";
      dispatch(state.tr.insertText(text2));
    }
    return true;
  }
  return false;
};
var insertMathBlock = (state, dispatch) => {
  const mathBlock = schema.nodes.math_block;
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

// src/plugins/definition-list.ts
import { wrappingInputRule } from "prosemirror-inputrules";
function createDefListInputRule(schema2) {
  return wrappingInputRule(
    /^:\s{3}$/,
    schema2.nodes.defListDescription
  );
}

// src/plugins/enter-handler.ts
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import {
  splitBlock,
  chainCommands,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock
} from "prosemirror-commands";
import { addRowAfter } from "prosemirror-tables";
var enterHandlerKey = new PluginKey("moraya-enter-handler");
function parsePipeTableHeader(text2) {
  if (!/^\|(.+\|)+\s*$/.test(text2)) return null;
  const cells = text2.split("|").slice(1, -1).map((s) => s.trim());
  if (cells.length < 2) return null;
  if (cells.every((c2) => /^:?-+:?$/.test(c2))) return null;
  return cells;
}
function buildTableFromHeaders(schema2, headers) {
  const tableType = schema2.nodes.table;
  const headerRowType = schema2.nodes.table_header_row;
  const dataRowType = schema2.nodes.table_row;
  const headerCellType = schema2.nodes.table_header;
  const dataCellType = schema2.nodes.table_cell;
  const paragraphType = schema2.nodes.paragraph;
  if (!tableType || !headerRowType || !dataRowType || !headerCellType || !dataCellType || !paragraphType) {
    return null;
  }
  const headerCells = headers.map((text2) => {
    const para = text2 ? paragraphType.create(null, schema2.text(text2)) : paragraphType.create();
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
            event.preventDefault();
            addRowAfter(view.state, view.dispatch);
            const { $from: $cur } = view.state.selection;
            for (let d = $cur.depth; d > 0; d--) {
              const name = $cur.node(d).type.name;
              if (name === "table_row" || name === "table_header_row") {
                try {
                  const rowEnd = $cur.after(d);
                  const $newRow = view.state.doc.resolve(rowEnd + 1);
                  view.dispatch(
                    view.state.tr.setSelection(TextSelection.near($newRow)).scrollIntoView()
                  );
                } catch {
                }
                break;
              }
            }
            return true;
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
                view.dispatch(view.state.tr.setSelection(TextSelection.near($target)).scrollIntoView());
              } else {
                const paragraph2 = view.state.schema.nodes.paragraph;
                if (paragraph2) {
                  const tr = view.state.tr.insert(tableEnd, paragraph2.create());
                  const $target = tr.doc.resolve(tableEnd + 1);
                  tr.setSelection(TextSelection.near($target));
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
              view.dispatch(view.state.tr.setSelection(TextSelection.near($target)).scrollIntoView());
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
                    tr.setSelection(TextSelection.near($dataRow));
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
function getMarkRuns(state, pos, markType2) {
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
    const mark = markType2.isInSet(child.marks) ? child.marks.find((m) => m.type === markType2) : null;
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
    const markType2 = state.schema.marks[markName];
    if (!markType2) continue;
    const runs = getMarkRuns(state, pos, markType2);
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
import { Plugin as Plugin3, PluginKey as PluginKey3, TextSelection as TextSelection2 } from "prosemirror-state";
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
            tr2.setSelection(TextSelection2.create(tr2.doc, cursorPos));
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
import { AllSelection, Plugin as Plugin5, PluginKey as PluginKey5, TextSelection as TextSelection3 } from "prosemirror-state";
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
function markdownSlice(text2, schema2) {
  const doc2 = parseMarkdown(text2, schema2);
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
        const schema2 = view.state.schema;
        const insertPlain = () => {
          const md2 = markdownSlice(plain, schema2);
          const content = md2 ?? new Slice(Fragment2.from(schema2.text(plain)), 0, 0);
          const tr = view.state.tr.replaceSelection(content);
          if (!tr.docChanged) return false;
          view.dispatch(tr);
          pendingPaste = true;
          return true;
        };
        const trimmed = plain.trim();
        if (/^!\[/.test(trimmed)) {
          const imgSlice = markdownSlice(trimmed, schema2);
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
          const textNode = schema2.text(plain);
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
            const sel = TextSelection3.near(view.state.doc.resolve(beforePos), -1);
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
              tr.setSelection(TextSelection3.create(tr.doc, 1));
              tr.setMeta("full-delete", true);
              view.dispatch(tr);
              return true;
            }
            if (event.key === "Backspace") {
              if (sel instanceof TextSelection3 && sel.empty && sel.$cursor) {
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
        tr.setSelection(TextSelection3.create(tr.doc, endPos + 1));
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
        const sel = TextSelection3.near($pos);
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
          if (sel.empty && sel instanceof TextSelection3 && sel.$cursor) {
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
              const nextSel = TextSelection3.near($next, 1);
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
            tr.setSelection(TextSelection3.create(tr.doc, 1));
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
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = hash * 33 ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

// src/setup.ts
var tier1Cache = null;
var tier1Loading = null;
function preloadEnhancementPlugins(schema2, rendererRegistry) {
  if (tier1Cache && tier1Cache.key.schema === schema2 && tier1Cache.key.rendererRegistry === rendererRegistry) {
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
    plugins.defListInputRule = createDefListInputRule(schema2);
    tier1Cache = { key: { schema: schema2, ...rendererRegistry ? { rendererRegistry } : {} }, plugins };
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
function buildInputRules(schema2, tier1, enableInlineMarks = true) {
  const rules = [];
  const N = schema2.nodes;
  const M = schema2.marks;
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
      const node = N.math_inline.create(null, schema2.text(content));
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
        return state.tr.replaceWith(start, end, schema2.text(text2, [linkMark]));
      }
    ));
  }
  if (tier1.defListInputRule) {
    rules.push(tier1.defListInputRule);
  }
  return inputRules({ rules });
}
function buildKeymap(schema2) {
  const N = schema2.nodes;
  const M = schema2.marks;
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
    bindings["Tab"] = (state, dispatch) => {
      if (sinkListItem(listItemType)(state)) return sinkListItem(listItemType)(state, dispatch);
      if (dispatch) dispatch(state.tr.insertText("    "));
      return true;
    };
    bindings["Mod-]"] = sinkListItem(listItemType);
    bindings["Shift-Tab"] = liftListItem2(listItemType);
    bindings["Mod-["] = liftListItem2(listItemType);
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
          dispatch(state.tr.setSelection(TextSelection4.create(state.doc, $from.start(d), $from.end(d))));
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
        tr.setSelection(TextSelection4.create(tr.doc, 1));
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
    if (!sel.empty || !(sel instanceof TextSelection4)) return false;
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
    if (sel.empty && sel instanceof TextSelection4 && sel.$cursor) {
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
  const schema2 = schemaArg ?? createSchema(schemaConfig);
  const linkOpener = opts.linkOpener ?? {
    open(url) {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  };
  const tier1 = await preloadEnhancementPlugins(schema2, opts.rendererRegistry);
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
    buildInputRules(schema2, tier1, opts.enableInlineMarkInputRules !== false),
    // Custom Enter handler MUST come before keymaps so pipe-table and
    // code-fence detection run before baseKeymap's splitBlock intercepts Enter.
    createEnterHandlerPlugin(),
    // Keymaps
    buildKeymap(schema2),
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
  const schema2 = createSchema(schemaConfig);
  const docCache = opts.docCache ?? createDocCache(10);
  void docCache;
  const plugins = await createEditorPlugins(opts, schema2);
  const tier1 = await preloadEnhancementPlugins(schema2, opts.rendererRegistry);
  const nodeViews = {};
  if (tier1.codeBlockView) {
    nodeViews.code_block = tier1.codeBlockView;
  }
  const svFactory = opts.spreadsheetViewFactory;
  if (svFactory && schema2.nodes.spreadsheet) {
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
  if (!svFactory && schema2.nodes.spreadsheet) {
    nodeViews.spreadsheet = (node) => {
      const dom = document.createElement("pre");
      dom.className = "spreadsheet-fallback";
      dom.textContent = node.attrs.source;
      return { dom };
    };
  }
  const fmFactory = opts.frontmatterViewFactory;
  if (fmFactory && schema2.nodes.frontmatter) {
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
  const initialDoc = opts.initialContent ? parseMarkdown(opts.initialContent, schema2) : schema2.topNodeType.createAndFill();
  const state = EditorState.create({ schema: schema2, doc: initialDoc, plugins });
  const view = new EditorView(opts.container, {
    state,
    nodeViews,
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
      const newDoc = parseMarkdown(md2, schema2);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
      view.dispatch(tr);
    },
    destroy() {
      view.destroy();
    }
  };
}

// src/source-fidelity.ts
import { Fragment as Fragment3 } from "prosemirror-model";
import { EditorState as EditorState2 } from "prosemirror-state";
import { AddMarkStep as AddMarkStep2, RemoveMarkStep as RemoveMarkStep2, ReplaceStep as ReplaceStep2 } from "prosemirror-transform";

// src/source-structure.ts
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from "prosemirror-transform";
var UnsupportedSourceStructure = class extends Error {
};
function fail() {
  throw new UnsupportedSourceStructure();
}
var sameOrigin = (a, b) => a.kind === b.kind && (a.kind === "fallback" || b.kind !== "fallback" && a.id === b.id);
var empty = (n) => n.type.name === "paragraph" && n.content.size === 0 && n.marks.length === 0;
function boundaryAt(doc2, pos) {
  if (!Number.isInteger(pos) || pos < 0 || pos > doc2.content.size) return void 0;
  const p = doc2.resolve(pos);
  return p.depth === 0 ? p.index(0) : void 0;
}
function childWindow(doc2, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > doc2.content.size) fail();
  const a = doc2.resolve(from), b = doc2.resolve(to);
  if (from === to && a.depth === 0) return { from: a.index(0), to: a.index(0) };
  return { from: a.index(0), to: b.index(0) + (b.depth === 0 ? 0 : 1) };
}
function splitsText(doc2, pos) {
  const p = doc2.resolve(pos), n = p.parent.maybeChild(p.index());
  return !!p.textOffset && !!n?.isText && /[\uD800-\uDBFF]/.test(n.text[p.textOffset - 1]) && /[\uDC00-\uDFFF]/.test(n.text[p.textOffset]);
}
function classifyTransaction(base, tr) {
  if (tr.docs.length !== tr.steps.length || tr.doc.type.schema !== base.doc.type.schema) fail();
  let structural = false;
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i], proto = Object.getPrototypeOf(step), before = tr.docs[i];
    if (!before || before.type.schema !== base.doc.type.schema) fail();
    if (proto !== ReplaceStep.prototype && proto !== AddMarkStep.prototype && proto !== RemoveMarkStep.prototype) fail();
    const { from, to } = step;
    childWindow(before, from, to);
    if (splitsText(before, from) || splitsText(before, to)) fail();
    if (proto === ReplaceStep.prototype) {
      const s = step, a = before.resolve(from), b = before.resolve(to);
      let inline = true;
      s.slice.content.forEach((n) => {
        if (!n.isInline) inline = false;
      });
      if (s.structure || !a.sameParent(b) || !a.parent.inlineContent || s.slice.openStart || s.slice.openEnd || !inline) structural = true;
    }
  }
  return structural ? "structural" : "stable";
}
function originSpan(base, origin) {
  if (origin.kind === "root") {
    const r2 = base.roots[origin.id];
    if (!r2) fail();
    return { from: r2.sourceFrom, to: r2.sourceTo };
  }
  if (origin.kind === "blank") {
    const u = base.layout.blankLines[origin.id];
    if (!u) fail();
    return { from: u.sourceFrom, to: u.sourceTo };
  }
  const f = base.layout.fallback;
  if (!f) fail();
  return { from: f.sourceAnchor, to: f.sourceAnchor };
}
function createLedger(base) {
  const children = new Array(base.doc.childCount);
  const assign = (origin, from, to, pmFrom, pmTo) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > children.length) fail();
    let pos2 = pmFrom;
    for (let i = from; i < to; i++) {
      if (children[i]) fail();
      const node = base.doc.child(i);
      children[i] = { ref: { kind: "base", origin }, node, from: pos2, to: pos2 + node.nodeSize };
      pos2 += node.nodeSize;
    }
    if (pos2 !== pmTo) fail();
  };
  base.roots.forEach((r2, id) => {
    if (r2.id !== id) fail();
    assign({ kind: "root", id }, r2.childFrom, r2.childTo, r2.pmFrom, r2.pmTo);
  });
  base.layout.blankLines.forEach((u, id) => {
    if (u.id !== id) fail();
    if (u.role === "empty-paragraph") assign({ kind: "blank", id }, u.emission.childFrom, u.emission.childTo, u.emission.pmFrom, u.emission.pmTo);
  });
  if (base.layout.fallback) {
    const e = base.layout.fallback.emission;
    assign({ kind: "fallback" }, e.childFrom, e.childTo, e.pmFrom, e.pmTo);
  }
  let pos = 0;
  for (const lane of children) {
    if (!lane || lane.from !== pos) fail();
    pos = lane.to;
  }
  if (pos !== base.doc.content.size) fail();
  const boundaries = [];
  let blankCursor = 0;
  for (let i = 0; i <= children.length; i++) {
    const left = children[i - 1]?.ref, right = children[i]?.ref;
    if (left?.kind === "base" && right?.kind === "base" && sameOrigin(left.origin, right.origin) && left.origin.kind === "root") {
      boundaries.push({ kind: "inside-root", rootId: left.origin.id });
      continue;
    }
    const anchor = right?.kind === "base" ? originSpan(base, right.origin).from : base.source.length;
    const previous = left?.kind === "base" ? originSpan(base, left.origin).to : 0;
    const units = base.layout.blankLines, slotIds = [];
    while (blankCursor < units.length && units[blankCursor].sourceTo <= previous) blankCursor++;
    while (blankCursor < units.length && units[blankCursor].sourceTo <= anchor) {
      const unit = units[blankCursor++];
      if (unit.sourceFrom >= previous) slotIds.push(unit.id);
    }
    boundaries.push({ kind: "base", anchor, slotIds });
  }
  return { children, boundaries, components: [] };
}
function representative(ledger, id) {
  let c2 = ledger.components[id];
  if (!c2) fail();
  while (c2.parent !== c2.id) c2 = ledger.components[c2.parent];
  return c2;
}
function stepWindow(before, after, step, ledger) {
  const window2 = childWindow(before, step.from, step.to);
  const from = ledger.children[window2.from]?.from ?? before.content.size;
  const to = window2.to === window2.from ? from : ledger.children[window2.to - 1].to;
  const map = step.getMap(), a = boundaryAt(after, map.map(from, -1)), b = boundaryAt(after, map.map(to, 1));
  if (a === void 0 || b === void 0 || b < a) fail();
  return { before: window2, after: { from: a, to: b }, from, to };
}
function advanceLedger(ledger, before, after, step, index) {
  const w = stepWindow(before, after, step, ledger), isMark = !(step instanceof ReplaceStep);
  const witness = {
    step: index,
    kind: isMark ? "mark" : "replace",
    before: { from: step.from, to: step.to },
    after: { from: step.getMap().map(step.from, -1), to: step.getMap().map(step.to, 1) },
    crossed: ledger.boundaries.slice(w.before.from, w.before.to + 1)
  };
  if (w.after.from !== w.before.from || after.childCount - before.childCount !== w.after.to - w.after.from - (w.before.to - w.before.from)) fail();
  if (isMark) {
    for (let i = w.before.from; i < w.before.to; i++) {
      const lane = ledger.children[i];
      const c3 = touch([lane.ref], ledger.boundaries[i], false);
      lane.ref = { kind: "component", id: c3.id };
      lane.node = after.child(i);
    }
    return;
  }
  const refs = ledger.children.slice(w.before.from, w.before.to).map((l) => l.ref);
  const boundary2 = ledger.boundaries[w.before.from];
  if (!refs.length) {
    if (boundary2.kind === "inside-root") refs.push({ kind: "base", origin: { kind: "root", id: boundary2.rootId } });
    else if (boundary2.kind === "generated" || boundary2.kind === "tombstone") refs.push({ kind: "component", id: boundary2.component });
  }
  const c2 = touch(refs, boundary2, refs.length === 0), added = [];
  let pos = step.getMap().map(w.from, -1);
  for (let i = w.after.from; i < w.after.to; i++) {
    const node = after.child(i);
    added.push({ ref: { kind: "component", id: c2.id }, node, from: pos, to: pos + node.nodeSize });
    pos += node.nodeSize;
  }
  const left = ledger.boundaries[w.before.from], right = ledger.boundaries[w.before.to];
  ledger.children.splice(w.before.from, w.before.to - w.before.from, ...added);
  const seams = added.length ? [left, ...Array.from({ length: added.length - 1 }, () => ({ kind: "generated", component: c2.id })), right] : [{ kind: "tombstone", component: c2.id, prior: left }];
  ledger.boundaries.splice(w.before.from, w.before.to - w.before.from + 1, ...seams);
  pos = 0;
  for (const lane of ledger.children) {
    lane.from = pos;
    pos += lane.node.nodeSize;
    lane.to = pos;
  }
  function touch(refs2, anchor, birth) {
    const ids = [], origins = [];
    for (const ref of refs2) {
      if (ref.kind === "component") {
        const id = representative(ledger, ref.id).id;
        if (!ids.includes(id)) ids.push(id);
      } else if (!origins.some((o) => sameOrigin(o, ref.origin))) origins.push(ref.origin);
    }
    for (const candidate of ledger.components) if (candidate.parent === candidate.id && candidate.origins.some((o) => origins.some((p) => sameOrigin(o, p)))) ids.push(candidate.id);
    let c3 = ids.length ? representative(ledger, ids[0]) : void 0;
    if (!c3) {
      const id = ledger.components.length;
      c3 = { id, parent: id, origins: [], births: [], witnesses: [], finalRuns: [] };
      ledger.components.push(c3);
    }
    for (const id of ids) {
      const other = representative(ledger, id);
      if (other === c3) continue;
      other.parent = c3.id;
      c3.origins.push(...other.origins);
      c3.births.push(...other.births);
      c3.witnesses.push(...other.witnesses);
    }
    for (const origin of origins) if (!c3.origins.some((o) => sameOrigin(o, origin))) c3.origins.push(origin);
    c3.witnesses.push(witness);
    if (birth) c3.births.push({ step: index, ordinal: c3.births.length, anchor });
    for (const lane of ledger.children) if (lane.ref.kind === "base" && c3.origins.some((o) => sameOrigin(o, lane.ref.kind === "base" ? lane.ref.origin : { kind: "fallback" }))) lane.ref = { kind: "component", id: c3.id };
    return c3;
  }
}
function finishLedger(base, tr, ledger) {
  let i = 0;
  tr.doc.forEach((node) => {
    const lane = ledger.children[i];
    if (!lane || !node.eq(lane.node)) fail();
    if (lane.ref.kind === "base") {
      const o = lane.ref.origin, e = o.kind === "root" ? base.roots[o.id] : o.kind === "blank" ? base.layout.blankLines[o.id] : base.layout.fallback;
      if (!e) fail();
    } else {
      const c2 = representative(ledger, lane.ref.id);
      lane.ref = { kind: "component", id: c2.id };
      const last = c2.finalRuns[c2.finalRuns.length - 1];
      if (last?.to === i) last.to++;
      else c2.finalRuns.push({ from: i, to: i + 1 });
    }
    i++;
  });
  if (i !== ledger.children.length) fail();
}
function partitionSlots(base) {
  const slots = [];
  for (const root of base.roots) {
    if (root.tailFrom < root.sourceFrom || root.tailFrom > root.sourceTo) fail();
    slots.push({ kind: "body", id: root.id, from: root.sourceFrom, to: root.tailFrom });
    const tail = base.source.slice(root.tailFrom, root.sourceTo), eol = /^(?:\r\n|\r|\n)/.exec(tail)?.[0];
    if (eol) slots.push({ kind: "terminator", id: root.id, from: root.tailFrom, to: root.tailFrom + eol.length });
  }
  for (const u of base.layout.blankLines) slots.push({ kind: u.role === "separator" ? "separator" : "blank", id: u.id, from: u.sourceFrom, to: u.sourceTo });
  for (let id = 0; id < base.protectedSources.length; id++) {
    const p = base.protectedSources[id];
    if (p.scope === "top-level") slots.push({ kind: "protected", id, from: p.sourceFrom, to: p.sourceTo });
  }
  slots.sort((a, b) => a.from - b.from || a.to - b.to);
  const result = [];
  let at = 0;
  for (const slot of slots) {
    if (slot.from < at || slot.to < slot.from || slot.to > base.source.length) fail();
    if (slot.from > at) result.push({ kind: "envelope", id: result.length, from: at, to: slot.from });
    if (slot.to > slot.from) result.push(slot);
    at = slot.to;
  }
  if (at < base.source.length) result.push({ kind: "envelope", id: result.length, from: at, to: base.source.length });
  return result;
}
function makeRecipe(base, ledger, slots, render) {
  const claims = [], removed = /* @__PURE__ */ new Set(), insertions = /* @__PURE__ */ new Map(), changedRoots = [];
  const dirty = /* @__PURE__ */ new Map(), blankDirty = /* @__PURE__ */ new Map();
  const components = ledger.components.filter((c2) => c2.parent === c2.id);
  const neighbors = /* @__PURE__ */ new Map();
  let leftRoot = -1, rightRoot = 0;
  for (const slot of slots) if (slot.kind === "separator") {
    while (leftRoot + 1 < base.roots.length && base.roots[leftRoot + 1].tailFrom <= slot.from) leftRoot++;
    while (rightRoot < base.roots.length && base.roots[rightRoot].sourceFrom < slot.to) rightRoot++;
    neighbors.set(slot, { left: base.roots[leftRoot]?.id, right: base.roots[rightRoot]?.id });
  }
  for (const c2 of components) for (const o of c2.origins) {
    if (o.kind === "root") {
      dirty.set(o.id, c2);
      changedRoots.push(o.id);
    } else if (o.kind === "blank") blankDirty.set(o.id, c2);
  }
  const stepOf = (c2) => c2.witnesses[0].step;
  const structuralStep = (c2) => c2.witnesses.find((w) => w.kind === "replace")?.step;
  const deletion = components.flatMap((c2) => c2.witnesses).find((w) => w.kind === "replace" && w.before.to > w.before.from && w.after.to - w.after.from < w.before.to - w.before.from);
  const noVisible = ledger.children.every((l) => empty(l.node));
  let baseline = noVisible ? ledger.children.findIndex((l) => l.ref.kind === "base" && l.ref.origin.kind === "fallback") : -1;
  if (noVisible && baseline < 0) baseline = 0;
  const conversion = baseline >= 0 ? ledger.children[baseline] : void 0;
  if (conversion?.ref.kind === "base" && conversion.ref.origin.kind === "blank") {
    if (!deletion) fail();
    const unit = slots.find((s) => s.kind === "blank" && s.id === (conversion.ref.kind === "base" && conversion.ref.origin.kind === "blank" ? conversion.ref.origin.id : -1));
    if (!unit) fail();
    removed.add(unit);
    claims.push({ ...unit, kind: "baseline-conversion", step: deletion.step, unitId: unit.id, survivorChild: baseline });
  }
  const claim = (slot, c2) => {
    removed.add(slot);
    claims.push({
      from: slot.from,
      to: slot.to,
      kind: slot.kind === "body" ? "body" : slot.kind === "terminator" ? "terminator" : "blank",
      step: slot.kind === "terminator" ? structuralStep(c2) ?? fail() : stepOf(c2),
      ...slot.kind === "blank" ? { unitId: slot.id } : { rootId: slot.id }
    });
  };
  const raw = (slot) => {
    const identity = { from: slot.from, to: slot.to, kind: slot.kind === "body" || slot.kind === "terminator" ? "root" : slot.kind === "separator" || slot.kind === "blank" ? "blank" : slot.kind, id: slot.id };
    return { kind: slot.kind, piece: { kind: "raw", span: slot, identity }, anchor: slot.from, slot };
  };
  const generated = (kind, text2, anchor, step) => ({ kind, piece: { kind: "generated", text: text2 }, anchor, step });
  for (const c2 of components) {
    if (c2.finalRuns.length > 1) fail();
    const spans = c2.origins.map((o) => originSpan(base, o)), birthAnchors = c2.births.map((b) => {
      if (b.anchor.kind !== "base") return fail();
      return b.anchor.anchor;
    });
    const anchor = Math.min(...spans.map((s) => s.from), ...birthAnchors);
    if (!Number.isFinite(anchor)) fail();
    const nodes = c2.finalRuns.flatMap((r2) => ledger.children.slice(r2.from, r2.to).map((l) => l.node));
    const origins = c2.origins.filter((o) => o.kind === "root");
    const originIds = new Set(origins.map((o) => o.id));
    for (const o of origins) {
      const r2 = base.roots[o.id];
      if (base.protectedSources.some((p) => p.sourceFrom < r2.sourceTo && p.sourceTo > r2.sourceFrom)) fail();
      if (!["paragraph_open", "heading_open", "bullet_list_open", "ordered_list_open", "blockquote_open", "table_open", "hr"].includes(r2.tokenType)) fail();
    }
    const rootSlots = slots.filter((s) => (s.kind === "body" || s.kind === "terminator") && originIds.has(s.id));
    const terminal = rootSlots.filter((s) => s.kind === "terminator").at(-1);
    let lastVisible = nodes.length - 1;
    while (lastVisible >= 0 && empty(nodes[lastVisible])) lastVisible--;
    const keepTerminal = lastVisible >= 0 ? terminal : void 0;
    for (const s of rootSlots) if (s !== keepTerminal) claim(s, c2);
    for (const s of slots) if (s.kind === "blank" && blankDirty.get(s.id) === c2) claim(s, c2);
    for (const s of slots) if (s.kind === "separator") {
      const { left, right } = neighbors.get(s);
      if (left !== void 0 && right !== void 0 && dirty.get(left) === c2 && dirty.get(right) === c2) {
        removed.add(s);
        claims.push({ from: s.from, to: s.to, kind: "separator", unitId: s.id, step: structuralStep(c2) ?? fail() });
      }
    }
    const atoms2 = [];
    for (let n = 0; n < nodes.length; n++) {
      const node = nodes[n], finalIndex = c2.finalRuns[0].from + n;
      if (empty(node)) {
        if (finalIndex !== baseline) atoms2.push(generated("blank", "\n", anchor, stepOf(c2)));
        continue;
      }
      const output = render([node]);
      if (output.family === "closed-literal") fail();
      let text2 = output.text;
      if (output.terminal === "content-eol") {
        if (!text2.endsWith(output.eol)) fail();
        text2 = text2.slice(0, -output.eol.length);
      }
      atoms2.push(generated("body", text2, anchor, stepOf(c2)));
      if (n === lastVisible && keepTerminal) {
        atoms2.push(raw(keepTerminal));
        removed.add(keepTerminal);
        if (n < nodes.length - 1) claims.push({ from: keepTerminal.to, to: keepTerminal.to, kind: "anchor", step: stepOf(c2) });
      } else atoms2.push(generated("terminator", output.terminal === "content-eol" ? "\n" : "", anchor, stepOf(c2)));
    }
    if (!nodes.length && !c2.origins.length) continue;
    const previous = insertions.get(anchor) ?? [];
    insertions.set(anchor, [...previous, ...atoms2]);
    const birth = c2.births[0];
    claims.push({ from: anchor, to: anchor, kind: "anchor", step: stepOf(c2), ...birth ? { birth } : {} });
  }
  for (const [anchor] of insertions) {
    const at = components.filter((c2) => c2.births.some((b) => b.anchor.kind === "base" && b.anchor.anchor === anchor) && !c2.origins.length);
    if (at.length > 1) {
      at.sort((a, b) => (a.finalRuns[0]?.from ?? Infinity) - (b.finalRuns[0]?.from ?? Infinity));
      const atoms2 = [];
      for (const c2 of at) for (const run of c2.finalRuns) for (let i = run.from; i < run.to; i++) {
        const node = ledger.children[i].node;
        if (empty(node)) {
          if (i !== baseline) atoms2.push(generated("blank", "\n", anchor, stepOf(c2)));
          continue;
        }
        const output = render([node]);
        let text2 = output.text;
        if (output.terminal === "content-eol") text2 = text2.slice(0, -output.eol.length);
        atoms2.push(generated("body", text2, anchor, stepOf(c2)), generated("terminator", output.terminal === "content-eol" ? "\n" : "", anchor, stepOf(c2)));
      }
      insertions.set(anchor, atoms2);
    }
  }
  const atoms = [];
  for (const slot of slots) {
    const added = insertions.get(slot.from);
    if (added) {
      atoms.push(...added);
      insertions.delete(slot.from);
    }
    if (!removed.has(slot)) atoms.push(raw(slot));
  }
  const rest = [...insertions].sort((a, b) => a[0] - b[0]);
  for (const [anchor, added] of rest) {
    const i = atoms.findIndex((a) => a.anchor > anchor);
    if (i < 0) atoms.push(...added);
    else atoms.splice(i, 0, ...added);
  }
  const authorizedSeparator = (slot) => {
    const { left, right } = neighbors.get(slot);
    const c2 = (left === void 0 ? void 0 : dirty.get(left)) ?? (right === void 0 ? void 0 : dirty.get(right));
    if (c2) return structuralStep(c2);
    for (const component of components) for (const birth of component.births)
      if (birth.anchor.kind === "base" && birth.anchor.slotIds.includes(slot.id)) return birth.step;
    return void 0;
  };
  const entity = (a) => a.kind === "body" || a.kind === "protected";
  const entities = atoms.map((a, i) => entity(a) ? i : -1).filter((i) => i >= 0);
  const drop = /* @__PURE__ */ new Set(), before = /* @__PURE__ */ new Map();
  for (let n = 0; n <= entities.length; n++) {
    const l = n ? entities[n - 1] : -1, r2 = n < entities.length ? entities[n] : atoms.length;
    const left = atoms[l], right = atoms[r2], run = atoms.slice(l + 1, r2);
    const separators = run.filter((a) => a.kind === "separator");
    const needed = !!left && !!right || left?.kind === "protected" || right?.kind === "protected";
    const keep = needed ? separators[0] : void 0;
    for (const a of separators) if (a !== keep) {
      const step = a.slot && authorizedSeparator(a.slot);
      if (step === void 0) fail();
      drop.add(a);
      claims.push({ from: a.slot.from, to: a.slot.to, kind: "separator", unitId: a.slot.id, step });
    }
    if (needed && !keep) {
      const step = left?.step ?? right?.step;
      if (step === void 0) fail();
      const target = run.find((a) => a.kind === "blank") ?? right;
      if (!target) fail();
      before.set(target, [generated("separator", "\n", target.anchor, step)]);
      claims.push({ from: target.anchor, to: target.anchor, kind: "anchor", step });
    }
    if (left?.kind === "body") {
      const term = run.find((a) => a.kind === "terminator");
      const needTerm = !!right || run.some((a) => a.kind === "blank");
      if (term?.piece.kind === "generated") {
        term.piece.text = needTerm || term.piece.text ? "\n" : "";
      } else if (!term && needTerm) {
        const target = atoms[l + 1];
        const anchor = left.slot?.to ?? left.anchor, step = left.step ?? right?.step ?? run.find((a) => a.step !== void 0)?.step;
        if (step === void 0) fail();
        const termAtom = generated("terminator", "\n", anchor, step);
        if (target) before.set(target, [termAtom, ...before.get(target) ?? []]);
        else atoms.push(termAtom);
        claims.push({ from: anchor, to: anchor, kind: "anchor", step });
      }
    }
  }
  const pieces = [];
  for (const atom of atoms) {
    for (const extra of before.get(atom) ?? []) pieces.push(extra.piece);
    if (!drop.has(atom)) pieces.push(atom.piece);
  }
  const kept = pieces.flatMap((p) => p.kind === "raw" ? [p.identity] : []);
  return {
    claims,
    kept,
    pieces,
    edits: [],
    changedRoots: [...new Set(changedRoots)].sort((a, b) => a - b),
    witnesses: components.flatMap((c2) => c2.witnesses)
  };
}
function verifyRecipe(base, recipe) {
  let at = 0, text2 = "", lastRaw = 0;
  const edits = [];
  const boundary2 = (p) => {
    if (p < 0 || p > base.source.length || !Number.isInteger(p)) fail();
    if (p > 0 && p < base.source.length && (base.source[p - 1] === "\r" && base.source[p] === "\n" || /[\uD800-\uDBFF]/.test(base.source[p - 1]) && /[\uDC00-\uDFFF]/.test(base.source[p]))) fail();
  };
  const flush = (to) => {
    if (to !== at || text2) {
      boundary2(at);
      boundary2(to);
      if (base.protectedSources.some((p) => at === to ? p.sourceFrom < at && at < p.sourceTo : p.sourceFrom < to && p.sourceTo > at)) fail();
      let covered = at;
      for (const c2 of recipe.claims.filter((c3) => c3.to > c3.from).sort((a, b) => a.from - b.from)) {
        if (c2.from > covered) break;
        if (c2.to > covered) covered = c2.to;
      }
      if (covered < to) fail();
      if (to === at && !recipe.claims.some((c2) => c2.from <= at && c2.to >= at)) fail();
      edits.push({ from: at, to, text: text2 });
    }
    at = to;
    text2 = "";
  };
  for (const p of recipe.pieces) {
    if (p.kind === "generated") {
      text2 += p.text;
      continue;
    }
    if (p.span.from < lastRaw || p.span.from !== p.identity.from || p.span.to !== p.identity.to) fail();
    flush(p.span.from);
    at = p.span.to;
    lastRaw = at;
  }
  flush(base.source.length);
  for (const c2 of recipe.claims) {
    const witness = recipe.witnesses.find((w) => w.step === c2.step);
    if (!Number.isInteger(c2.step) || !witness) fail();
    if (c2.kind === "separator" || c2.kind === "baseline-conversion" || c2.kind === "terminator") {
      if (witness.kind !== "replace") fail();
    }
    if (c2.kind === "blank" || c2.kind === "separator" || c2.kind === "baseline-conversion") {
      const unit = c2.unitId === void 0 ? void 0 : base.layout.blankLines[c2.unitId];
      if (!unit || unit.sourceFrom !== c2.from || unit.sourceTo !== c2.to) fail();
      if (c2.kind === "separator" !== (unit.role === "separator")) fail();
      if (c2.kind === "baseline-conversion" && (c2.survivorChild === void 0 || witness.before.to - witness.before.from <= witness.after.to - witness.after.from)) fail();
    }
  }
  recipe.edits = edits;
}
function applyRecipe(base, recipe) {
  const chunks = [];
  let at = 0;
  for (const edit of recipe.edits) {
    chunks.push(base.source.slice(at, edit.from), edit.text);
    at = edit.to;
  }
  chunks.push(base.source.slice(at));
  return chunks.join("");
}
function applyStructuralTransaction(base, tr, render) {
  const ledger = createLedger(base);
  for (let i = 0; i < tr.steps.length; i++) {
    const before = tr.docs[i], after = tr.docs[i + 1] ?? tr.doc, step = tr.steps[i];
    const result = step.apply(before);
    if (result.failed || !result.doc || after.type.schema !== base.doc.type.schema || !after.eq(result.doc)) fail();
    advanceLedger(ledger, before, after, step, i);
  }
  tr.doc.check();
  finishLedger(base, tr, ledger);
  if (tr.doc.eq(base.doc)) {
    const emission = (o) => {
      const e = o.kind === "root" ? base.roots[o.id] : o.kind === "fallback" ? base.layout.fallback.emission : base.layout.blankLines[o.id].role === "empty-paragraph" ? base.layout.blankLines[o.id].emission : fail();
      return { from: e.childFrom, to: e.childTo };
    };
    const stable = ledger.children.every((lane, i) => {
      if (lane.ref.kind === "base") {
        const e = emission(lane.ref.origin);
        return e.from <= i && i < e.to;
      }
      return true;
    });
    const cancelled = ledger.components.filter((c2) => c2.parent === c2.id).every((c2) => {
      if (!c2.origins.length) return !c2.finalRuns.length;
      const ranges = c2.origins.map(emission).sort((a, b) => a.from - b.from);
      return c2.finalRuns.length === 1 && c2.finalRuns[0].from === ranges[0].from && c2.finalRuns[0].to === ranges.at(-1).to && ranges.every((r2, i) => i === 0 || ranges[i - 1].to === r2.from);
    });
    if (stable && cancelled) return { source: base.source, edits: [], changedRoots: [], unchanged: true };
  }
  const recipe = makeRecipe(base, ledger, partitionSlots(base), render);
  verifyRecipe(base, recipe);
  return { source: applyRecipe(base, recipe), edits: recipe.edits, changedRoots: recipe.changedRoots, unchanged: false };
}

// src/source-fidelity.ts
function createSourceSession(source, schema2) {
  const parsed = parseDocumentWithSourceCapture(source, schema2);
  if (!parsed.ok) return parsed;
  return { ok: true, session: {
    revision: 0,
    source,
    doc: parsed.value.doc,
    textSpans: parsed.value.textRuns,
    roots: parsed.value.roots,
    gaps: parsed.value.gaps,
    protectedSources: parsed.value.protectedSources,
    layout: parsed.value.layout
  } };
}
function splitsSurrogate(text2, offset) {
  return offset > 0 && offset < text2.length && /[\uD800-\uDBFF]/.test(text2[offset - 1]) && /[\uDC00-\uDFFF]/.test(text2[offset]);
}
function splitsTextAt(doc2, pos) {
  const resolved = doc2.resolve(pos);
  let split = false;
  resolved.parent.forEach((node, offset) => {
    if (node.isText && resolved.parentOffset > offset && resolved.parentOffset < offset + node.nodeSize) {
      split = split || splitsSurrogate(node.text, resolved.parentOffset - offset);
    }
  });
  return split;
}
function boundary(span, pos) {
  if (pos === span.pmFrom) return span.sourceFrom;
  if (pos === span.pmTo) return span.sourceTo;
  if (span.kind === "linear") return span.sourceFrom + pos - span.pmFrom;
  return void 0;
}
function overlapsProtectedSource(base, from, to) {
  const ranges = base.protectedSources;
  let low = 0, high = ranges.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if (ranges[middle].sourceTo <= from) low = middle + 1;
    else high = middle;
  }
  const range = ranges[low];
  return !!range && (from === to ? range.sourceFrom < from : range.sourceFrom < to);
}
function applySourceTextTransactionWithEdit(base, tr) {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: "stale-document" };
  if (tr.steps.length !== 1) return { ok: false, reason: "unsupported-step" };
  if (tr.storedMarksSet) return { ok: false, reason: "unsupported-step" };
  const step = tr.steps[0].toJSON();
  if (step.stepType !== "replace" || step.structure) return { ok: false, reason: "unsupported-step" };
  const { from, to } = step;
  const $from = base.doc.resolve(from), $to = base.doc.resolve(to);
  if ($from.depth !== 1 || !$from.sameParent($to) || $from.parent.type.name !== "paragraph" || to < from || step.slice?.openStart || step.slice?.openEnd || step.slice?.content?.some((node) => node.type !== "text")) {
    return { ok: false, reason: "unsupported-step" };
  }
  if (splitsTextAt(base.doc, from) || splitsTextAt(base.doc, to)) {
    return { ok: false, reason: "unmapped-range" };
  }
  const spans = base.textSpans.filter((span) => from === to ? span.pmFrom <= from && span.pmTo >= to : span.pmTo > from && span.pmFrom < to);
  if (!spans.length) return { ok: false, reason: "unmapped-range" };
  if (from < to && (spans[0].pmFrom > from || spans[spans.length - 1].pmTo < to || spans.some((span, i) => i > 0 && spans[i - 1].pmTo !== span.pmFrom))) {
    return { ok: false, reason: "unmapped-range" };
  }
  if (from === to && spans.some((span) => boundary(span, from) !== boundary(spans[0], from))) {
    return { ok: false, reason: "unmapped-range" };
  }
  const sourceFrom = boundary(spans[0], from);
  const sourceTo = boundary(spans[spans.length - 1], to);
  if (sourceFrom === void 0 || sourceTo === void 0 || spans.some((span, i) => i > 0 && spans[i - 1].sourceTo !== span.sourceFrom) || splitsSurrogate(base.source, sourceFrom) || splitsSurrogate(base.source, sourceTo)) {
    return { ok: false, reason: "unmapped-range" };
  }
  if (overlapsProtectedSource(base, sourceFrom, sourceTo)) return { ok: false, reason: "unsupported-step" };
  const insert = (step.slice?.content ?? []).map((node) => node.text).join("");
  const candidate = base.source.slice(0, sourceFrom) + insert + base.source.slice(sourceTo);
  const result = createSourceSession(candidate, base.doc.type.schema);
  if (!result.ok || !result.session.doc.eq(tr.doc)) return { ok: false, reason: "semantic-mismatch" };
  return {
    ok: true,
    session: { ...result.session, revision: base.revision + 1 },
    edit: { from: sourceFrom, to: sourceTo, text: insert }
  };
}
function applySourceTextTransaction(base, tr) {
  const result = applySourceTextTransactionWithEdit(base, tr);
  return result.ok ? { ok: true, session: result.session } : result;
}
var UnsupportedBlockTransaction = class extends Error {
};
function indexSourceRoots(base) {
  const rootById = base.roots;
  const ownerByChild = new Array(base.doc.childCount);
  let previousChildTo = 0;
  for (let id = 0; id < rootById.length; id++) {
    const root = rootById[id];
    if (root.id !== id || !Number.isInteger(root.childFrom) || !Number.isInteger(root.childTo) || root.childFrom < previousChildTo || root.childTo <= root.childFrom || root.childTo > base.doc.childCount)
      throw new UnsupportedBlockTransaction();
    for (let child = root.childFrom; child < root.childTo; child++) ownerByChild[child] = root;
    previousChildTo = root.childTo;
  }
  return { rootById, ownerByChild };
}
function splitsInlineText(position) {
  if (!position.textOffset) return false;
  const node = position.parent.child(position.index());
  return node.isText && splitsSurrogate(node.text, position.textOffset);
}
function authorizeStepRoots(before, step, ownership, authorized) {
  const { from, to } = step;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > before.content.size)
    throw new UnsupportedBlockTransaction();
  const a = before.resolve(from), b = before.resolve(to);
  if (splitsInlineText(a) || splitsInlineText(b)) throw new UnsupportedBlockTransaction();
  if (step instanceof ReplaceStep2) {
    if (step.structure || !a.sameParent(b) || !a.parent.inlineContent || step.slice.openStart || step.slice.openEnd)
      throw new UnsupportedBlockTransaction();
    let inline = true;
    step.slice.content.forEach((node) => {
      if (!node.isInline) inline = false;
    });
    if (!inline) throw new UnsupportedBlockTransaction();
  } else if (from === to) return;
  const first = a.index(0);
  const last = from === to ? first : b.index(0) - (b.depth === 0 ? 1 : 0);
  if (first < 0 || last < first || last >= before.childCount) throw new UnsupportedBlockTransaction();
  for (let child = first; child <= last; child++) {
    const root = ownership.ownerByChild[child];
    if (!root) throw new UnsupportedBlockTransaction();
    authorized.add(root.id);
  }
}
function changedNaturalRoots(base, tr, ownership) {
  const authorized = /* @__PURE__ */ new Set();
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i], prototype = Object.getPrototypeOf(step);
    if (prototype !== ReplaceStep2.prototype && prototype !== AddMarkStep2.prototype && prototype !== RemoveMarkStep2.prototype)
      throw new UnsupportedBlockTransaction();
    const before = tr.docs[i];
    if (before.childCount !== base.doc.childCount) throw new UnsupportedBlockTransaction();
    authorizeStepRoots(before, step, ownership, authorized);
  }
  if (!base.doc.sameMarkup(tr.doc) || base.doc.childCount !== tr.doc.childCount)
    throw new UnsupportedBlockTransaction();
  const changed = /* @__PURE__ */ new Set();
  base.doc.forEach((node, _offset, child) => {
    const next = tr.doc.child(child);
    if (!node.sameMarkup(next)) throw new UnsupportedBlockTransaction();
    if (node.eq(next)) return;
    const root = ownership.ownerByChild[child];
    if (!root || !authorized.has(root.id)) throw new UnsupportedBlockTransaction();
    changed.add(root.id);
  });
  return ownership.rootById.filter((root) => changed.has(root.id)).map((root) => root.id);
}
var renderableRoots = /* @__PURE__ */ new Set([
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
function rootRenderNode(node) {
  const children = [];
  node.forEach((child) => children.push(rootRenderNode(child)));
  const rendered = node.isLeaf ? node : node.copy(Fragment3.fromArray(children));
  const highlight2 = rendered.marks.findIndex((mark) => mark.type.name === "highlight" && mark.attrs.delimiter === "equals");
  if (highlight2 < 1) return rendered;
  let outer = highlight2;
  while (outer > 0 && ["strong", "em"].includes(rendered.marks[outer - 1].type.name)) outer--;
  if (outer === highlight2) return rendered;
  const marks2 = [...rendered.marks];
  marks2.splice(outer, 0, marks2.splice(highlight2, 1)[0]);
  return rendered.mark(marks2);
}
function endsInTerminalHardbreak(node) {
  if (node.inlineContent) {
    const last2 = node.lastChild;
    return last2?.type.name === "hardbreak" && last2.attrs.isInline === false;
  }
  if (!["doc", "bullet_list", "ordered_list", "list_item", "blockquote"].includes(node.type.name)) return false;
  const last = node.lastChild;
  return !!last && endsInTerminalHardbreak(last);
}
function renderChangedRoot(base, doc2, root) {
  if (overlapsProtectedSource(base, root.sourceFrom, root.sourceTo) || !renderableRoots.has(root.tokenType)) throw new UnsupportedBlockTransaction();
  const nodes = [];
  for (let i = root.childFrom; i < root.childTo; i++) nodes.push(rootRenderNode(doc2.child(i)));
  let generated = serializeSourceRootMarkdown(doc2.type.create(doc2.attrs, Fragment3.fromArray(nodes)));
  const last = nodes[nodes.length - 1], tail = base.source.slice(root.tailFrom, root.sourceTo);
  if (last.type.name === "table") {
    if (!generated.endsWith("\n") || generated.endsWith("\n\n")) throw new UnsupportedBlockTransaction();
    generated = generated.slice(0, -1);
  } else if (endsInTerminalHardbreak(last) && /^(?:\r\n|\r|\n)/.test(tail)) {
    if (!generated.endsWith("\n")) throw new UnsupportedBlockTransaction();
    generated = generated.slice(0, -1);
  }
  return generated + tail;
}
function applySourceEdits(base, edits, ids, ownership) {
  const authorized = ids.map((id) => ownership.rootById[id]);
  let at = 0, ownerIndex = 0;
  const chunks = [];
  for (const edit of edits) {
    while (ownerIndex < authorized.length && authorized[ownerIndex].sourceTo < edit.to) ownerIndex++;
    const owner = authorized[ownerIndex];
    if (overlapsProtectedSource(base, edit.from, edit.to) || !owner || owner.sourceFrom > edit.from || owner.sourceTo < edit.to || edit.from < at || edit.to < edit.from || edit.to > base.source.length || splitsSurrogate(base.source, edit.from) || splitsSurrogate(base.source, edit.to))
      throw new UnsupportedBlockTransaction();
    chunks.push(base.source.slice(at, edit.from), edit.text);
    at = edit.to;
  }
  chunks.push(base.source.slice(at));
  return chunks.join("");
}
function applySourceBlockTransaction(base, tr) {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: "stale-document" };
  try {
    if (classifyTransaction(base, tr) === "structural") {
      const render = (nodes) => {
        const rendered = nodes.map(rootRenderNode), doc2 = tr.doc.type.create(tr.doc.attrs, Fragment3.fromArray(rendered));
        const text2 = serializeSourceRootMarkdown(doc2), last = rendered[rendered.length - 1];
        return {
          text: text2,
          terminal: last.type.name === "table" || endsInTerminalHardbreak(last) ? "content-eol" : "none",
          family: last.type.name === "table" ? "table" : ["paragraph", "heading", "bullet_list", "ordered_list", "blockquote", "horizontal_rule"].includes(last.type.name) ? "flow" : "closed-literal",
          eol: "\n"
        };
      };
      const result = applyStructuralTransaction(base, tr, render);
      if (result.unchanged) return { ok: true, session: base, mode: "unchanged", edits: [], changedRoots: [] };
      const parsed2 = createSourceSession(result.source, base.doc.type.schema);
      if (!parsed2.ok || !parsed2.session.doc.eq(tr.doc)) return { ok: false, reason: "semantic-mismatch" };
      return {
        ok: true,
        session: { ...parsed2.session, revision: base.revision + 1 },
        mode: "root-render",
        edits: result.edits,
        changedRoots: result.changedRoots
      };
    }
    const ownership = indexSourceRoots(base);
    const changedRoots = changedNaturalRoots(base, tr, ownership);
    if (!changedRoots.length) {
      if (!tr.doc.eq(base.doc)) return { ok: false, reason: "unsupported-step" };
      return { ok: true, session: base, mode: "unchanged", edits: [], changedRoots: [] };
    }
    if (tr.steps.length === 1 && tr.steps[0] instanceof ReplaceStep2) {
      const replay = EditorState2.create({ doc: base.doc }).tr.step(tr.steps[0]);
      if (!replay.doc.eq(tr.doc)) return { ok: false, reason: "unsupported-step" };
      const exact = applySourceTextTransactionWithEdit(base, replay);
      if (exact.ok) {
        const edits2 = [exact.edit];
        if (applySourceEdits(base, edits2, changedRoots, ownership) !== exact.session.source)
          return { ok: false, reason: "semantic-mismatch" };
        return { ok: true, session: exact.session, mode: "exact-text", edits: edits2, changedRoots };
      }
    }
    const edits = changedRoots.map((id) => {
      const root = ownership.rootById[id];
      return { from: root.sourceFrom, to: root.sourceTo, text: renderChangedRoot(base, tr.doc, root) };
    });
    const source = applySourceEdits(base, edits, changedRoots, ownership);
    const parsed = createSourceSession(source, base.doc.type.schema);
    if (!parsed.ok || !parsed.session.doc.eq(tr.doc)) return { ok: false, reason: "semantic-mismatch" };
    return {
      ok: true,
      session: { ...parsed.session, revision: base.revision + 1 },
      mode: "root-render",
      edits,
      changedRoots
    };
  } catch (error) {
    if (error instanceof UnsupportedBlockTransaction || error instanceof UnsupportedSourceStructure) return { ok: false, reason: "unsupported-step" };
    return { ok: false, reason: "parse-error" };
  }
}
export {
  applySourceBlockTransaction,
  applySourceTextTransaction,
  createDocCache,
  createEditor,
  createEditorPlugins,
  createSchema,
  createSourceSession,
  djb2Hash,
  getDocumentBaseDir,
  insertHorizontalRule,
  insertImage,
  insertMathBlock,
  insertTable,
  parseMarkdown,
  parseMarkdownAsync,
  preloadEnhancementPlugins,
  projectLineEndings,
  serializeMarkdown,
  setDocumentBaseDir,
  setHeading,
  sourceOffsetAt,
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
  viewOffsetAt
};
//# sourceMappingURL=index.js.map