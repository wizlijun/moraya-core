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
      const empty2 = emptyLiteral(state, startLine, nextLine, 0, token.content);
      literalFacts.set(token, { collector, trace: sliceTrace(collector.trace, contentStart, contentEnd), kind: "front_matter", ...empty2 ? { empty: empty2 } : {} });
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
function capturedInlineRecipeFacts(base) {
  const bound = capturedListLayouts.get(base.layout);
  return bound && bound.source === base.source && bound.doc === base.doc && bound.roots === base.roots && bound.lists === base.layout.lists ? bound.recipe : void 0;
}
function capturedEmptyBodies(source, doc2, roots, layout) {
  const bound = capturedListLayouts.get(layout);
  return bound && bound.source === source && bound.doc === doc2 && bound.roots === roots && bound.lists === layout.lists ? bound.emptyBodies : void 0;
}
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
  let contentEnd, bodyTrace, empty2, bodyUnstripped = false;
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
      empty2 = emptyLiteral(state, startLine, end, indent, value);
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
    if (bodyTrace) literalFacts.set(token, { collector: collectorFor(state), trace: bodyTrace, kind: token.type, ...state.line === contentEnd + 1 && empty2 ? { empty: empty2 } : {} });
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
      const empty2 = slot.missing ? { kind: "missing-cell", at, row: line, slot: slot.slot, present: slot.present, closingPipe: slot.closingPipe } : { kind: "inline", range: { from: at, to: at }, before: "", after: "" };
      inlineFacts.set(slots[slot.slot], { collector, empty: empty2 });
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
      const empty2 = emptyInline(collector, at, at, at === from ? " " : "", closing && at === charsEnd ? " " : "");
      if (empty2) inlineFacts.set(token, { ...inlineFacts.get(token), empty: empty2 });
    }
  }
  return result;
}, true);
wrapCaptureRule(md.core.ruler, "inline", (original, state) => {
  if (!collectorFor(state)) return original(state);
  const collector = collectorFor(state);
  if (collector.file) collector.file.blockTokens = cloneTokenBatch(state.tokens, collector);
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
for (const name of ["math_inline", "math_inline_double", "footnote_ref", "footnote_ref_orphan", "image"]) wrapCaptureRule(md.inline.ruler, name, (original, state, silent) => {
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
  if (state.stack.at(-1) !== frame || frame.content.length !== slot + 1 || !node || !["math_inline", "note_anchor", "hardbreak", "footnote_ref", "image"].includes(node.type.name) || !node.isAtom || node.nodeSize !== pmTo - pmFrom) return;
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
              const at = rawPoint(fact.trace, match[0].length);
              const empty2 = match[0].length === fact.trace.text.length && at !== void 0 ? { kind: "inline", range: { from: fact.trimEnd ?? at, to: fact.trimEnd ?? at }, before: (fact.trimEnd ?? at) > at || /\s$/.test(match[0]) ? "" : " ", after: "" } : void 0;
              inlineFacts.set(t, { ...fact, trace: sliceTrace(fact.trace, match[0].length, fact.trace.text.length), ...empty2 ? { empty: empty2 } : {} });
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
        const encoded = serializeImageTitle(title);
        state.write(`![${alt}](${destination} "${state.options.escapeExtraCharacters ? encoded.replace(/\|/g, "\\|") : encoded}")`);
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
  const empty2 = (n) => n.type.name === "paragraph" && n.content.size === 0 && n.hasMarkup(n.type);
  let hasEmpty = false;
  for (let i = first; i < parent.childCount; i++) if (empty2(parent.child(i))) hasEmpty = true;
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
    if (empty2(child)) {
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
function serializeSourceInlineBody(node, tableCell = false) {
  const inline = new MarkdownSerializer({
    ...sourceRootSerializer.nodes,
    [node.type.name](state, body) {
      state.renderInline(body);
    }
  }, sourceRootSerializer.marks, tableCell ? { ...sourceRootSerializer.options, escapeExtraCharacters: /\|/g } : sourceRootSerializer.options);
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
  let lastState;
  for (const [name, render] of Object.entries(current.nodes)) current.nodes[name] = (state, node, parent, index) => {
    lastState = state;
    sourceBlankTails.delete(state);
    sourceContinuationIndents.delete(state);
    render(state, node, parent, index);
  };
  const result = current.serialize(doc2, { tightLists: true });
  const blank = lastState && sourceBlankTails.get(lastState);
  if (blank) options.onOwnedBlank?.(blank.terminal);
  const indent = lastState && sourceContinuationIndents.get(lastState);
  if (indent !== void 0) options.onContinuationIndent?.(indent);
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
function finalizeCapturedDocument(collector, doc2) {
  const source = collector.source;
  const text2 = [];
  const occurrences = /* @__PURE__ */ new Set(), emitted = /* @__PURE__ */ new Map();
  for (const emission of collector.emissions) {
    if (!emission.node || emitted.has(emission.node)) throw new UnsupportedSourceCapture();
    emitted.set(emission.node, emission);
  }
  const emptyParents = /* @__PURE__ */ new Map();
  let rootIndex = 0;
  doc2.descendants((parent, offset) => {
    if (!capturedTextParents.includes(parent.type.name)) return;
    const from = offset + 1, emission = emitted.get(parent);
    if (parent.content.size === 0) emptyParents.set(from, parent);
    while (collector.roots[rootIndex] && collector.roots[rootIndex].pmTo <= from) rootIndex++;
    const root = collector.roots[rootIndex];
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
      if (emission.empty && parent.content.size === 0) collector.emptyBodies.push({ pmAt: from, parent, place: emission.empty, ...root && root.pmFrom < from && from < root.pmTo ? { rootId: root.id } : {} });
      if (emission.body) {
        const body = collector.bodies.length;
        collector.bodies.push({ ...emission.body, pmFrom: from, pmTo: from + parent.content.size });
        for (let i = emission.atomFrom ?? 0; i < (emission.atomTo ?? 0); i++) {
          const atom = collector.atoms[i], pmFrom = atom.pmFrom + delta, pmTo = atom.pmTo + delta;
          if (pmFrom < from || pmTo > from + parent.content.size || doc2.nodeAt(pmFrom) !== atom.node || pmTo - pmFrom !== atom.node.nodeSize) throw new UnsupportedSourceCapture();
          collector.atoms[i] = { ...atom, body, pmFrom, pmTo };
        }
        for (const separator of emission.separators ?? []) {
          let entry = collector.separators.find((s) => s.range.from === separator.range.from && s.range.to === separator.range.to);
          if (!entry) {
            entry = { range: separator.range, ...separator.definition ? { definition: separator.definition } : {} };
            collector.separators.push(entry);
          }
          if (entry[separator.side] !== void 0) throw new UnsupportedSourceCapture();
          entry[separator.side] = body;
        }
        for (let i = emission.criticFrom ?? 0; i < (emission.criticTo ?? 0); i++) {
          const critic = collector.critic[i];
          collector.critic[i] = { ...critic, body, pmFrom: critic.pmFrom + delta, pmTo: critic.pmTo + delta };
        }
        for (let i = emission.edgeFrom ?? 0; i < (emission.edgeTo ?? 0); i++) {
          const edge = collector.edges[i];
          collector.edges[i] = { ...edge, body, pmFrom: edge.pmFrom + delta, pmTo: edge.pmTo + delta };
        }
      }
      if (emission.fence) collector.fences.push({ ...emission.fence, pmFrom: offset, pmTo: offset + parent.nodeSize });
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
  const layoutBody = (pmFrom, place) => {
    const parent = emptyParents.get(pmFrom + 1);
    if (parent && parent.type.name === "paragraph" && parent.hasMarkup(parent.type) && !parent.content.size)
      collector.emptyBodies.push({ pmAt: pmFrom + 1, parent, place });
  };
  for (const u of layout.blankLines) if (u.role === "empty-paragraph") layoutBody(u.emission.pmFrom, { kind: "layout", origin: { kind: "blank", id: u.id } });
  if (layout.fallback) layoutBody(layout.fallback.emission.pmFrom, { kind: "layout", origin: { kind: "fallback" } });
  capturedListLayouts.set(layout, { recipe: Object.freeze({ definitionSeparators: Object.freeze(collector.separators.filter((s) => s.definition && (s.left !== void 0 || s.right !== void 0) && collector.protectedSources.some((p) => p.kind === s.definition.kind && p.scope === s.definition.scope && p.sourceFrom === s.definition.sourceFrom && p.sourceTo === s.definition.sourceTo)).map((s) => Object.freeze({ body: s.left ?? s.right, side: s.left !== void 0 ? "after" : "before", definition: Object.freeze(s.definition), range: Object.freeze(s.range) }))), separators: Object.freeze(collector.separators.filter((s) => s.left !== void 0 && s.right !== void 0).map((s) => Object.freeze({ left: s.left, right: s.right, range: Object.freeze(s.range) }))), critic: Object.freeze(collector.critic.filter((c2) => c2.body >= 0).map((c2) => Object.freeze(c2))), atoms: Object.freeze(collector.atoms.filter((a) => a.body >= 0).map((a) => Object.freeze(a))), bodies: Object.freeze(collector.bodies.map((b, body) => Object.freeze({ ...b, body }))), edges: Object.freeze(collector.edges.filter((e) => e.body >= 0).map((e) => Object.freeze(e))), fences: Object.freeze(collector.fences.map((f) => Object.freeze(f))) }), emptyBodies: Object.freeze(collector.emptyBodies.map((f) => Object.freeze(f))), source, doc: doc2, roots: collector.roots, lists, bodies: Object.freeze(collector.bodies.map((body) => Object.freeze(body))) });
  return {
    doc: doc2,
    textRuns: collector.runs,
    protectedSources: Object.freeze(collector.protectedSources),
    layout,
    roots: collector.roots,
    gaps: buildSourceGaps(source, collector.roots, collector.synthetic)
  };
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
    separators: [],
    critic: [],
    atoms: [],
    edges: [],
    fences: [],
    emptyBodies: [],
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
function countTokens(tokens) {
  let count = 0;
  const pending = [tokens];
  while (pending.length) for (const token of pending.pop()) {
    count++;
    if (token.children) pending.push(token.children);
  }
  return count;
}
function injectNestedBlanks(tokens, collector) {
  const result = [];
  for (const token of tokens) {
    for (const pending of nestedBlanks.get(token) ?? []) {
      const make = (type, tag, nesting, level) => ({
        type,
        tag,
        nesting,
        level,
        content: "",
        children: null,
        attrs: null,
        info: "",
        meta: null,
        map: null,
        block: true,
        hidden: false,
        markup: ""
      });
      const open = make("paragraph_open", "p", 1, pending.level), inline = make("inline", "", 0, pending.level + 1), close = make("paragraph_close", "p", -1, pending.level);
      inline.children = [];
      inline.block = false;
      inlineFacts.set(inline, { collector, empty: pending.place });
      result.push(open, inline, close);
    }
    result.push(token);
  }
  return result;
}
function emitCapturedTokens(tokens, collector, schema2) {
  let batch = cloneTokenBatch(tokens, collector);
  tagPairedHtmlInline(batch);
  fixFootnoteDefMaps(batch);
  prepareListEvents(batch, collector);
  batch = injectNestedBlanks(batch, collector);
  batch = prepareRootEvents(batch, collector);
  collector.file.work.pmEmissionTokenCount += countTokens(batch);
  const tokenizer = Object.create(md);
  let used = false;
  tokenizer.parse = () => {
    if (used) throw new UnsupportedSourceCapture();
    used = true;
    return batch;
  };
  const doc2 = new MorayaMarkdownParser(schema2, tokenizer).parse(collector.trace.text, { [captureKey]: collector });
  if (!used) throw new UnsupportedSourceCapture();
  return doc2;
}
function captureFailure(error) {
  return { ok: false, reason: error instanceof UnsupportedSourceCapture || error instanceof UnsupportedOwnership ? "unsupported-source" : "parse-error" };
}
function captureFilePipeline(source, schema2, work = newFileWork()) {
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
    const doc2 = emitCapturedTokens(cache.inlineTokens, collector, schema2);
    return { ok: true, value: finalizeCapturedDocument(collector, doc2), cache };
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
var fileRuleSnapshot = [md.core.ruler, md.block.ruler, md.inline.ruler, md.inline.ruler2].map((ruler) => ruler.__rules__.map((r2) => ({ name: r2.name, fn: r2.fn, enabled: r2.enabled, alt: [...r2.alt] })));
function fileHooksValid() {
  return [md.core.ruler, md.block.ruler, md.inline.ruler, md.inline.ruler2].every((ruler, i) => {
    const current = ruler.__rules__;
    if (!Array.isArray(current)) return false;
    const enabled = current.filter((r2) => r2.enabled), actual = ruler.getRules("");
    if (enabled.length !== actual.length || enabled.some((r2, j) => r2.fn !== actual[j])) return false;
    return current.length === fileRuleSnapshot[i].length && current.every((r2, j) => {
      const previous = fileRuleSnapshot[i][j];
      return r2.name === previous.name && r2.fn === previous.fn && r2.enabled === previous.enabled && sameTokenData(r2.alt, previous.alt);
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
function captureFileWindow(cache, source, patches, schema2, work, selection) {
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
    const newCheckpoints = cache.checkpoints.slice(0, leftIndex).map((c2) => ({ ...c2 }));
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
    const doc2 = emitCapturedTokens(nextCache.inlineTokens, collector, schema2);
    const value = finalizeCapturedDocument(collector, doc2);
    const dirty = /* @__PURE__ */ new Set(), parsed = new Set(parsedIndices);
    const enclosingMaps = [];
    let rootIndex = 0;
    for (const [index, token] of coreState.tokens.entries()) {
      if (token.nesting === -1) enclosingMaps.pop();
      if (token.nesting === 1) enclosingMaps.push(token.map ?? enclosingMaps[enclosingMaps.length - 1] ?? null);
      if (!parsed.has(index)) continue;
      const map = token.map ?? enclosingMaps[enclosingMaps.length - 1];
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

// src/plugins/definition-list.ts
import { wrappingInputRule } from "prosemirror-inputrules";
function createDefListInputRule(schema2) {
  return wrappingInputRule(
    /^:\s{3}$/,
    schema2.nodes.defListDescription
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
  const baseSchema = createSchema(schemaConfig);
  const schema2 = opts.configureSchema ? opts.configureSchema(baseSchema) : baseSchema;
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
  const state = opts.createState ? opts.createState(schema2, plugins) : EditorState.create({
    schema: schema2,
    doc: opts.initialContent ? parseMarkdown(opts.initialContent, schema2) : schema2.topNodeType.createAndFill(),
    plugins
  });
  if (state.schema !== schema2) {
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
      const newDoc = parseMarkdown(md2, schema2);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
      view.dispatch(tr);
    },
    destroy() {
      view.destroy();
    }
  };
}

// src/source-inline-recipe.ts
import { Fragment as Fragment3 } from "prosemirror-model";
import { AddMarkStep, RemoveMarkStep, ReplaceStep, AttrStep, AddNodeMarkStep, RemoveNodeMarkStep } from "prosemirror-transform";
var families = ["em", "strong", "strike_through", "highlight", "code", "link", "annotation"];
function canonicalNote(node) {
  return node.type === node.type.schema.nodes.note_anchor && node.isLeaf && node.nodeSize === 1 && typeof node.attrs.note === "string" && !/[\r\n]|<<}/.test(node.attrs.note) && node.eq(node.type.create({ note: node.attrs.note }, null, node.marks));
}
function canonicalMath(node) {
  return node.type === node.type.schema.nodes.math_inline && node.hasMarkup(node.type) && node.childCount === 1 && node.firstChild.isText && !node.firstChild.marks.length && !!node.textContent && !/[\r\n$]/.test(node.textContent);
}
function canonicalImage(node) {
  return node.type === node.type.schema.nodes.image && node.isInline && node.isLeaf && node.nodeSize === 1 && ["src", "alt", "title"].every((key) => typeof node.attrs[key] === "string" && !/[\r\n]/.test(node.attrs[key])) && node.eq(node.type.create({ src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }, null, node.marks));
}
function imageStepRange(doc2, step) {
  const p = Object.getPrototypeOf(step);
  if (p !== AttrStep.prototype && p !== AddNodeMarkStep.prototype && p !== RemoveNodeMarkStep.prototype) return;
  const s = step;
  if (!Number.isInteger(s.pos) || s.pos < 0 || s.pos >= doc2.content.size) return;
  const node = doc2.nodeAt(s.pos);
  if (node && canonicalImage(node) && (!(s instanceof AttrStep) || ["src", "alt", "title"].includes(s.attr))) return { from: s.pos, to: s.pos + 1 };
}
function canonicalAnnotation(mark) {
  return mark.type.name !== "annotation" || typeof mark.attrs.note === "string" && !/[\r\n]|<<}/.test(mark.attrs.note) && mark.eq(mark.type.create({ note: mark.attrs.note }));
}
function textOnly(node, images = false) {
  let ok = true;
  node.forEach((n) => {
    if (!(n.isText || images && canonicalImage(n)) || n.marks.some((m) => !families.includes(m.type.name))) ok = false;
  });
  return ok;
}
function audit(base, tr) {
  if (!tr.before.eq(base.doc) || tr.docs.length !== tr.steps.length) return false;
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i], before = tr.docs[i], after = tr.docs[i + 1] ?? tr.doc, p = Object.getPrototypeOf(step);
    if (p !== ReplaceStep.prototype && p !== AddMarkStep.prototype && p !== RemoveMarkStep.prototype && !imageStepRange(before, step)) return false;
    if (i === 0 && !before.eq(base.doc)) return false;
    const result = step.apply(before);
    if (result.failed || !result.doc?.eq(after)) return false;
  }
  return true;
}
function prepareEmptyInlineContent(base, tr, fact) {
  const no = () => ({ kind: "unsupported", reason: "empty-inline-chain" });
  try {
    if (!capturedEmptyBodies(base.source, base.doc, base.roots, base.layout)?.includes(fact) || !audit(base, tr)) return no();
    const first = tr.steps[0];
    if (!first || Object.getPrototypeOf(first) !== ReplaceStep.prototype) return no();
    const step = first;
    if (step.structure || step.from !== fact.pmAt || step.to !== step.from || step.slice.openStart || step.slice.openEnd || !step.slice.size || fact.parent.content.size || !["paragraph", "heading"].includes(fact.parent.type.name) || fact.parent !== base.doc.resolve(step.from).parent) return no();
    for (let i = 1; i < tr.steps.length; i++) {
      const mark = tr.steps[i];
      if (!(mark instanceof AddMarkStep || mark instanceof RemoveMarkStep) || mark.from < step.from || mark.to > step.from + step.slice.size || !families.includes(mark.mark.type.name)) return no();
    }
    const parent = tr.doc.resolve(step.from).parent;
    if (tr.steps.length === 1 && step.slice.content.childCount === 1 && canonicalNote(step.slice.content.firstChild) && !step.slice.content.firstChild.marks.length && parent.sameMarkup(fact.parent) && parent.content.eq(step.slice.content)) return { kind: "ready", body: "{>>" + parent.firstChild.attrs.note + "<<}" };
    if (!parent.sameMarkup(fact.parent) || !textOnly(parent, true) || /[\r\n]/.test(parent.textContent)) return no();
    const resolved = base.doc.resolve(fact.pmAt), cell = resolved.depth > 0 && ["table_cell", "table_header"].includes(resolved.node(resolved.depth - 1).type.name);
    const children2 = [];
    parent.forEach((node) => children2.push(cell && node.marks.some((m) => m.type.name === "code") ? node.type.schema.text(node.text.replace(/\|/g, "\\|"), node.marks) : node));
    return { kind: "ready", body: serializeSourceInlineBody(parent.copy(Fragment3.fromArray(children2)), cell) };
  } catch {
    return no();
  }
}
function point(span, pos) {
  return pos === span.pmFrom ? span.sourceFrom : pos === span.pmTo ? span.sourceTo : span.kind === "linear" ? span.sourceFrom + pos - span.pmFrom : void 0;
}
function rawRange2(base, from, to) {
  const spans = base.textSpans.filter((s) => from === to ? s.pmFrom <= from && s.pmTo >= to : s.pmFrom < to && s.pmTo > from);
  if (!spans.length) return;
  const a = point(spans[0], from), b = point(spans.at(-1), to);
  if (a === void 0 || b === void 0 || spans.some((s, i) => i > 0 && (spans[i - 1].pmTo !== s.pmFrom || spans[i - 1].sourceTo !== s.sourceFrom))) return;
  if (from === to && spans.some((s) => point(s, from) !== a)) return;
  return { from: a, to: b };
}
function prepareClosedFenceRecipe(base, tr, facts) {
  const no = { ok: false, reason: "unsupported-step" };
  if (capturedInlineRecipeFacts(base) !== facts || !audit(base, tr) || tr.steps.length !== 1 || Object.getPrototypeOf(tr.steps[0]) !== ReplaceStep.prototype) return no;
  const step = tr.steps[0], a = base.doc.resolve(step.from), b = base.doc.resolve(step.to);
  if (!a.sameParent(b) || a.parent.type.name !== "code_block" || step.structure || step.slice.openStart || step.slice.openEnd) return no;
  const target = tr.doc.resolve(step.from).parent;
  if (!a.parent.sameMarkup(target) || !a.parent.content.size || !textOnly(a.parent) || !textOnly(target) || target.firstChild?.marks.length) return no;
  const fact = facts.fences.find((f) => f.pmFrom === a.before() && f.pmTo === a.after());
  if (!fact) return no;
  const conflict = target.textContent.split("\n").some((line) => {
    const m = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
    return m?.[1]?.[0] === fact.character && m[1].length >= fact.openLength;
  });
  if (!conflict) return { ok: true, edits: [] };
  if (!fact.contiguousTopLevel) return no;
  const raw = rawRange2(base, step.from, step.to);
  if (!raw || raw.from < fact.contentFrom || raw.to > fact.contentTo) return { ok: false, reason: "unmapped-range" };
  let text2 = "";
  step.slice.content.forEach((n) => {
    text2 += n.text ?? "";
  });
  const length = sourceFenceLength(target.textContent, fact.character, fact.openLength), edits = [];
  if (length > fact.openLength) edits.push({ ...fact.open, text: fact.character.repeat(length) });
  edits.push({ ...raw, text: text2.replace(/\n/g, fact.eol) });
  if (length > fact.closeLength) edits.push({ ...fact.close, text: fact.character.repeat(length) });
  return { ok: true, edits };
}
var sameMarks = (a, b) => a.length === b.length && a.every((m, i) => m.eq(b[i]));
function escapeText2(text2, cell, fromCode = false) {
  return text2.replace(fromCode ? /[\\`*_[\]{}<>~^=&|#$+.)-]/g : /[\\`*_[\]{}<>~^=&|]/g, (c2) => c2 === "&" ? "&amp;" : c2 === "|" ? cell ? "&#124;" : "\\|" : "\\" + c2);
}
function encodeCodeContext(text2, code2, cell) {
  return code2 ? cell ? text2.replace(/\|/g, "\\|") : text2 : escapeText2(text2, cell, true);
}
function editsFromOutput(base, body, output) {
  let cursor = body.sourceFrom, pending = "", edits = [];
  for (const part of output) {
    if ("text" in part) {
      pending += part.text;
      continue;
    }
    const { from, to } = part.raw;
    if (from < cursor || to < from || to > body.sourceTo) return;
    if (from > cursor || pending) {
      edits.push({ from: cursor, to: from, text: pending });
      pending = "";
    }
    cursor = to;
  }
  if (cursor < body.sourceTo || pending) edits.push({ from: cursor, to: body.sourceTo, text: pending });
  return edits.filter((e) => base.source.slice(e.from, e.to) !== e.text);
}
function noteEdit(base, fact, note) {
  const old = base.source.slice(fact.noteFrom, fact.noteTo);
  let left = 0, right = 0;
  while (left < old.length && left < note.length && old[left] === note[left]) left++;
  if (left > 0 && /[\uD800-\uDBFF]/.test(old[left - 1]) && /[\uDC00-\uDFFF]/.test(old[left] ?? "")) left--;
  while (right < old.length - left && right < note.length - left && old[old.length - 1 - right] === note[note.length - 1 - right]) right++;
  if (right > 0 && /[\uD800-\uDBFF]/.test(old[old.length - right - 1] ?? "") && /[\uDC00-\uDFFF]/.test(old[old.length - right] ?? "")) right--;
  return { from: fact.noteFrom + left, to: fact.noteTo - right, text: note.slice(left, note.length - right) };
}
function emptyBodyEdits(base, facts, body, contentTo) {
  const edits = [];
  const separator = facts.separators.find((s) => s.right === body.body) ?? facts.separators.find((s) => s.left === body.body);
  const definitionSeparator = facts.definitionSeparators.find((s) => s.body === body.body && s.side === "after");
  if (separator) edits.push({ ...separator.range, text: "" });
  else if (definitionSeparator) edits.push({ ...definitionSeparator.range, text: "" });
  const root = base.roots.find((r2) => r2.tokenType === "paragraph_open" && r2.pmFrom + 1 === body.pmFrom && r2.pmTo - 1 === body.pmTo && r2.tailFrom === body.sourceTo && contentTo === r2.tailFrom);
  if (root && /^(?:\r\n|\r|\n)$/.test(base.source.slice(root.tailFrom, root.sourceTo))) edits.push({ from: root.tailFrom, to: root.sourceTo, text: "" });
  return edits;
}
function preparePointRecipe(base, tr, facts) {
  const no = { ok: false, reason: "unsupported-step" };
  const touches = tr.steps.some((s) => s instanceof ReplaceStep && (facts.critic.some((c2) => c2.kind === "note_anchor" && s.from < c2.pmTo && s.to > c2.pmFrom) || s.slice.content.firstChild?.type.name === "note_anchor"));
  if (!touches) return;
  if (tr.steps.length !== 1 || Object.getPrototypeOf(tr.steps[0]) !== ReplaceStep.prototype) return no;
  const step = tr.steps[0], a = base.doc.resolve(step.from), b = base.doc.resolve(step.to);
  if (!a.sameParent(b) || step.slice.openStart || step.slice.openEnd || step.structure) return no;
  const fact = facts.critic.find((c2) => c2.kind === "note_anchor" && c2.pmFrom === step.from && c2.pmTo === step.to);
  const next = step.slice.content.firstChild;
  if (fact) {
    const old = base.doc.nodeAt(step.from);
    if (!canonicalNote(old)) return no;
    if (!step.slice.size) {
      const body2 = facts.bodies.find((b2) => b2.body === fact.body);
      const emptyEdges = facts.edges.filter((e) => e.body === fact.body && e.pmFrom === fact.pmFrom && e.pmTo === fact.pmTo && e.marks.some((m) => m.type.name === e.family && m.isInSet(old.marks)));
      const edits = [{ from: fact.syntaxFrom, to: fact.syntaxTo, text: "" }, ...emptyEdges.flatMap((e) => [{ ...e.open, text: "" }, { ...e.close, text: "" }])];
      const contentTo = Math.max(fact.syntaxTo, ...emptyEdges.map((e) => e.close.to));
      if (body2.pmFrom === fact.pmFrom && body2.pmTo === fact.pmTo && a.parent.type.name === "paragraph") {
        edits.push(...emptyBodyEdits(base, facts, body2, contentTo));
      }
      edits.sort((x, y) => x.from - y.from);
      return { ok: true, edits, changedBodies: [fact.body] };
    }
    if (step.slice.content.childCount !== 1 || !next || !canonicalNote(next) || next.type !== old.type || !sameMarks(next.marks, old.marks)) return no;
    return { ok: true, edits: [noteEdit(base, fact, next.attrs.note)], changedBodies: [fact.body] };
  }
  if (step.slice.content.childCount !== 1 || !next || !canonicalNote(next) || next.marks.length) return no;
  if (step.from !== step.to) {
    let plain = true;
    a.parent.nodesBetween(a.parentOffset, b.parentOffset, (node) => {
      if (!node.isText || node.marks.length) plain = false;
    });
    if (!plain || facts.critic.some((c2) => step.from < c2.pmTo && step.to > c2.pmFrom) || facts.atoms.some((c2) => step.from < c2.pmTo && step.to > c2.pmFrom)) return no;
  }
  const body = facts.bodies.find((f) => f.pmFrom <= step.from && f.pmTo >= step.to), range = rawRange2(base, step.from, step.to);
  if (!body || !range || range.from < body.sourceFrom || range.to > body.sourceTo) return no;
  return { ok: true, edits: [{ ...range, text: "{>>" + next.attrs.note + "<<}" }], changedBodies: [body.body] };
}
function prepareInlineRecipe(base, tr, facts) {
  const no = { ok: false, reason: "unsupported-step" }, unmapped = { ok: false, reason: "unmapped-range" };
  if (capturedInlineRecipeFacts(base) !== facts || !audit(base, tr)) return no;
  try {
    const pointRecipe = preparePointRecipe(base, tr, facts);
    if (pointRecipe) return pointRecipe;
    const work = facts.bodies.map((b) => ({ body: b.body, beforeFrom: b.pmFrom, beforeTo: b.pmTo, afterFrom: b.pmFrom, afterTo: b.pmTo, pieces: [{ kind: "retained", beforeFrom: b.pmFrom, beforeTo: b.pmTo, afterFrom: b.pmFrom, afterTo: b.pmTo }], dirtyEdges: [] }));
    const units = /* @__PURE__ */ new Map(), changed = /* @__PURE__ */ new Set(), removedImages = /* @__PURE__ */ new Set(), removedImageAtoms = /* @__PURE__ */ new Set();
    for (const b of facts.bodies) {
      const list = [];
      base.doc.resolve(b.pmFrom).parent.forEach((node, offset) => {
        const atom = facts.atoms.find((a) => a.body === b.body && a.pmFrom === b.pmFrom + offset && a.pmTo === b.pmFrom + offset + node.nodeSize && a.node === node);
        for (let i = 0; i < node.nodeSize; i++) {
          const before = b.pmFrom + offset + i;
          const span = base.textSpans.find((s) => s.pmFrom <= before && s.pmTo > before);
          const from = span && point(span, before), to = span && point(span, before + 1);
          list.push({ text: node.isText ? node.text[i] : "", before, beforeCode: node.marks.some((m) => m.type.name === "code"), marks: node.marks, ...atom ? { atom, ...canonicalImage(node) ? { image: node } : {} } : {}, ...from !== void 0 && to !== void 0 ? { raw: { from, to } } : {} });
        }
      });
      units.set(b.body, list);
    }
    for (let i = 0; i < tr.steps.length; i++) {
      const step = tr.steps[i], before = tr.docs[i];
      const imageRange = imageStepRange(before, step);
      if (imageRange) {
        const w = work.find((w2) => w2.afterFrom <= imageRange.from && w2.afterTo >= imageRange.to), after = tr.docs[i + 1] ?? tr.doc, node = after.nodeAt(imageRange.from);
        if (!w || !node || !canonicalImage(node)) return no;
        const u = units.get(w.body)[imageRange.from - w.afterFrom];
        if (!u.image) return no;
        u.image = node;
        u.marks = node.marks;
        changed.add(w.body);
      } else if (step instanceof ReplaceStep) {
        const a = before.resolve(step.from), z = before.resolve(step.to);
        if (!a.sameParent(z) || !a.parent.inlineContent || step.slice.openStart || step.slice.openEnd || step.structure) return no;
        const body = work.find((w) => w.afterFrom <= step.from && w.afterTo >= step.to);
        if (!body) return no;
        let inserted = [], valid = true;
        step.slice.content.forEach((n) => {
          if (canonicalImage(n)) {
            inserted.push({ text: "", image: n, marks: n.marks, step: i });
            return;
          }
          if (canonicalMath(n)) {
            const math = { node: n };
            for (let k = 0; k < n.nodeSize; k++) inserted.push({ text: "", math, marks: n.marks, step: i });
            return;
          }
          if (n.type === n.type.schema.nodes.hardbreak && typeof n.attrs.isInline === "boolean" && !n.marks.length && n.eq(n.type.create({ isInline: n.attrs.isInline }))) {
            inserted.push({ text: "\n", leaf: n, marks: n.marks, step: i });
            return;
          }
          if (!n.isText || n.marks.some((m) => !families.includes(m.type.name))) valid = false;
          for (const text2 of (n.text ?? "").split("")) inserted.push({ text: text2, marks: n.marks, step: i });
        });
        if (!valid) return no;
        const list = units.get(body.body), start = step.from - body.afterFrom, end = step.to - body.afterFrom;
        for (let k = start; k < end; k++) {
          const u = list[k];
          if (u.image) {
            removedImages.add(body.body);
            if (u.atom) removedImageAtoms.add(u.atom);
            continue;
          }
          if (u.text) continue;
          if (u.atom?.node.type.name !== "math_inline" && !u.math) return no;
          const first = list.findIndex((x) => u.atom ? x.atom === u.atom : x.math === u.math), size = u.atom ? u.atom.pmTo - u.atom.pmFrom : u.math.node.nodeSize;
          if (first < start || first + size > end) return no;
        }
        if (start === end && (list[start]?.atom && list[start].atom === list[start - 1]?.atom || list[start]?.math && list[start].math === list[start - 1]?.math)) return no;
        const replaced = list[start], replacement = inserted[0];
        if (end === start + 1 && inserted.length === 1 && replacement?.image && replaced?.image && replaced.atom && replaced.before !== void 0 && replacement.image.hasMarkup(replaced.image.type, replaced.image.attrs, replacement.marks)) {
          replacement.atom = replaced.atom;
          replacement.before = replaced.before;
        }
        list.splice(start, end - start, ...inserted);
        changed.add(body.body);
        const map = step.getMap();
        for (const w of work) {
          w.afterFrom = map.map(w.afterFrom, -1);
          w.afterTo = map.map(w.afterTo, 1);
          w.pieces = units.get(w.body).map((u, k) => u.before === void 0 ? { kind: "inserted", afterFrom: w.afterFrom + k, afterTo: w.afterFrom + k + 1, step: u.step } : { kind: "retained", beforeFrom: u.before, beforeTo: u.before + 1, afterFrom: w.afterFrom + k, afterTo: w.afterFrom + k + 1 });
        }
      } else {
        if (!(step instanceof AddMarkStep || step instanceof RemoveMarkStep)) return no;
        if (!families.includes(step.mark.type.name) || !canonicalAnnotation(step.mark)) return no;
        let valid = true;
        before.nodesBetween(step.from, step.to, (n, pos) => {
          if (!n.isInline) return;
          if (!n.isText && !canonicalImage(n)) {
            valid = false;
            return false;
          }
          const lo = Math.max(pos, step.from), hi = Math.min(pos + n.nodeSize, step.to);
          const w = work.find((w2) => w2.afterFrom <= lo && w2.afterTo >= hi);
          if (!w) {
            valid = false;
            return false;
          }
          const list = units.get(w.body);
          for (let k = lo; k < hi; k++) {
            const u = list[k - w.afterFrom], next = step instanceof AddMarkStep ? step.mark.addToSet(u.marks) : step.mark.removeFromSet(u.marks);
            if (!sameMarks(u.marks, next)) {
              u.marks = next;
              changed.add(w.body);
            }
          }
        });
        if (!valid) return no;
      }
    }
    for (const w of work) {
      const node = tr.doc.resolve(w.afterFrom).parent, original = base.doc.resolve(w.beforeFrom).parent;
      if (!node.sameMarkup(original) || node.content.size !== w.afterTo - w.afterFrom) return no;
    }
    const edits = [];
    for (const id of changed) {
      const body = facts.bodies.find((b) => b.body === id), w = work.find((b) => b.body === id), list = units.get(id), old = facts.edges.filter((e) => e.body === id);
      const target = tr.doc.resolve(w.afterFrom).parent;
      let offset = 0, valid = true;
      target.forEach((n) => {
        for (let j = 0; j < n.nodeSize; j++, offset++) {
          const u = list[offset];
          if (!u || (u.image ? !u.image.mark(u.marks).eq(n) : u.atom && !u.atom.node.eq(n)) || u.math && !u.math.node.eq(n) || u.text !== (n.isText ? n.text[j] : u.leaf?.eq(n) ? "\n" : "") || !sameMarks(u.marks, n.marks)) valid = false;
        }
      });
      if (!valid) return no;
      const ranges = [];
      for (let at = 0; at < list.length; at++) for (const mark of list[at].marks) {
        if (!families.includes(mark.type.name)) {
          if (list[at].before === void 0) return no;
          continue;
        }
        if (at > 0 && mark.isInSet(list[at - 1].marks)) continue;
        let end = at + 1;
        while (end < list.length && mark.isInSet(list[end].marks)) end++;
        const candidates = old.filter((e) => e.family === mark.type.name && (mark.type.name === "annotation" || e.marks.some((m) => m.eq(mark))));
        const exact = candidates.find((e) => [-1, 1].some((assoc) => tr.mapping.map(e.pmFrom, assoc) === w.afterFrom + at) && [-1, 1].some((assoc) => tr.mapping.map(e.pmTo, assoc) === w.afterFrom + end));
        const ancestor = exact ?? candidates.find((e) => list.slice(at, end).some((u) => u.before !== void 0 && e.pmFrom <= u.before && u.before < e.pmTo));
        let open = "", close = "", keep = !!exact;
        if (ancestor) {
          open = base.source.slice(ancestor.open.from, ancestor.open.to);
          close = base.source.slice(ancestor.close.from, ancestor.close.to);
        }
        if (mark.type.name === "annotation" && !canonicalAnnotation(mark)) return no;
        if (mark.type.name === "annotation") {
          open = "{==";
          close = "==}{>>" + mark.attrs.note + "<<}";
        }
        if (!open) {
          switch (mark.type.name) {
            case "strong":
              open = close = "**";
              break;
            case "em": {
              let index = 0, size = 0;
              target.forEach((n, _off, i) => {
                if (size <= at) index = i;
                size += n.nodeSize;
              });
              open = close = sourceEmDelimiter(mark, target, index, true);
              break;
            }
            case "strike_through":
              open = close = "~~";
              break;
            case "highlight":
              open = close = mark.attrs.delimiter === "equals" ? "==" : "^^";
              break;
            case "link":
              open = "[";
              close = "](" + String(mark.attrs.href).replace(/[\\()]/g, "\\$&") + (mark.attrs.title ? ' "' + String(mark.attrs.title).replace(/[\\"]/g, "\\$&") + '"' : "") + ")";
              break;
            case "code":
              break;
          }
        }
        if (!keep && /^_+$/.test(open) && (!/^[ \t]/.test(list[at].text) && at > 0 && /[\p{L}\p{N}]/u.test(list[at - 1].text) || !/[ \t]$/.test(list[end - 1].text) && end < list.length && /[\p{L}\p{N}]/u.test(list[end].text))) {
          open = close = "*".repeat(open.length);
        }
        ranges.push({ from: at, to: end, mark, ...ancestor ? { old: ancestor } : {}, open, close, keep, index: ranges.length });
      }
      for (const edge of old) if (!families.includes(edge.family)) {
        const mark = edge.marks.find((m) => m.type.name === edge.family), from = tr.mapping.map(edge.pmFrom, -1) - w.afterFrom, to = tr.mapping.map(edge.pmTo, 1) - w.afterFrom;
        if (!mark || from < 0 || to > list.length || list.slice(from, to).some((u) => !mark.isInSet(u.marks))) return no;
        ranges.push({ from, to, mark, old: edge, open: "", close: "", keep: true, index: ranges.length });
      }
      for (let i = ranges.length - 1; i >= 0; i--) {
        const r2 = ranges[i], matches = old.filter((e) => e.family === r2.mark.type.name && (r2.mark.type.name === "annotation" || e.marks.some((m) => m.eq(r2.mark))));
        const parts = matches.map((e) => ({ e, from: list.findIndex((u) => u.before === e.pmFrom), last: list.findIndex((u) => u.before === e.pmTo - 1) })).filter((p) => p.from >= r2.from && p.last < r2.to && p.last >= p.from).sort((a, b) => a.from - b.from);
        if (parts.length > 1 && parts[0].from === r2.from && parts.at(-1).last + 1 === r2.to && parts.every((p, j) => !j || parts[j - 1].last + 1 === p.from)) {
          ranges.splice(i, 1, ...parts.map((p) => ({ ...r2, from: p.from, to: p.last + 1, old: p.e, keep: true, open: base.source.slice(p.e.open.from, p.e.open.to), close: r2.mark.type.name === "annotation" ? "==}{>>" + r2.mark.attrs.note + "<<}" : base.source.slice(p.e.close.from, p.e.close.to) })));
        }
      }
      for (let i = ranges.length - 1; i >= 0; i--) {
        const r2 = ranges[i];
        if (r2.mark.type.name !== "code") continue;
        const cuts = [...new Set(ranges.filter((other) => other !== r2).flatMap((other) => [other.from, other.to]).filter((at) => r2.from < at && at < r2.to))].sort((a, b) => a - b);
        if (cuts.length) {
          const points = [r2.from, ...cuts, r2.to];
          ranges.splice(i, 1, ...points.slice(0, -1).map((from, j) => ({ ...r2, from, to: points[j + 1], keep: false })));
        }
      }
      let crossing = true;
      while (crossing) {
        crossing = false;
        ranges.sort((a, b) => a.from - b.from || b.to - a.to);
        outer: for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length; j++) {
          const a = ranges[i], b = ranges[j];
          if (!(a.from < b.from && b.from < a.to && a.to < b.to)) continue;
          if (a.keep && b.keep) return no;
          const split = b.keep ? a : b, cut = b.keep ? b.from : a.to, index = ranges.indexOf(split);
          if (!families.includes(split.mark.type.name)) return no;
          ranges.splice(index, 1, { ...split, to: cut, keep: false }, { ...split, from: cut, keep: false });
          crossing = true;
          break outer;
        }
      }
      for (const r2 of ranges) if (r2.mark.type.name === "code") {
        let { open, close, keep } = r2;
        const { mark } = r2;
        const text2 = list.slice(r2.from, r2.to).map((u) => u.text).join(""), node = target.type.schema.text(text2, [mark]);
        const generatedOpen = sourceCodeDelimiter(node, true), generatedClose = sourceCodeDelimiter(node, false);
        const currentLength = /^`+/.exec(open)?.[0].length ?? 0, max = Math.max(0, ...(text2.match(/`+/g) ?? []).map((r3) => r3.length));
        if (!currentLength || max >= currentLength) {
          open = generatedOpen;
          close = generatedClose;
          keep = false;
        } else {
          const left = open.slice(currentLength), right = close.slice(0, close.length - currentLength);
          const decoded = (left + text2 + right).replace(/\n/g, " ").replace(/^ (.+) $/, "$1");
          if (decoded !== text2) {
            const padding = generatedOpen.endsWith(" ") ? " " : "";
            open = "`".repeat(currentLength) + padding;
            close = padding + "`".repeat(currentLength);
            keep = false;
          }
        }
        r2.open = open;
        r2.close = close;
        r2.keep = keep;
      }
      w.dirtyEdges = old.filter((e) => !ranges.some((r2) => r2.keep && r2.old === e)).map((e) => e.id);
      const claimed = [...facts.atoms.filter((a) => a.body === id).map((a) => ({ from: a.sourceFrom, to: a.sourceTo })), ...old.flatMap((e) => [e.open, e.close]), ...list.flatMap((u) => u.raw ? [u.raw] : []), ...base.textSpans.filter((s) => s.pmFrom >= body.pmFrom && s.pmTo <= body.pmTo).map((s) => ({ from: s.sourceFrom, to: s.sourceTo }))].sort((a, b) => a.from - b.from);
      const gaps = [];
      let cursor = body.sourceFrom;
      for (const raw of claimed) {
        if (raw.from > cursor) {
          const next = [...base.textSpans, ...facts.atoms.filter((a) => a.body === id)].filter((s) => s.sourceFrom >= raw.from && s.pmFrom >= body.pmFrom && s.pmTo <= body.pmTo).sort((a, b) => a.sourceFrom - b.sourceFrom)[0];
          gaps.push({ raw: { from: cursor, to: raw.from }, before: next?.pmFrom ?? body.pmTo });
        }
        cursor = Math.max(cursor, raw.to);
      }
      if (cursor < body.sourceTo) gaps.push({ raw: { from: cursor, to: body.sourceTo }, before: body.pmTo });
      const adjacentEntities = /* @__PURE__ */ new Set();
      for (const r2 of ranges) if (r2.keep && ["em", "strong"].includes(r2.mark.type.name)) {
        for (const [outer, inner] of [[r2.from - 1, r2.from], [r2.to, r2.to - 1]]) {
          if (outer < 0 || outer >= list.length) continue;
          const start = (at2) => at2 > 0 && /[\uDC00-\uDFFF]/.test(list[at2].text) && /[\uD800-\uDBFF]/.test(list[at2 - 1].text) ? at2 - 1 : at2;
          const at = start(outer), inside = start(inner), scalar = String.fromCodePoint((list[at].text + (list[at + 1]?.text ?? "")).codePointAt(0) ?? 0);
          const innerScalar = String.fromCodePoint((list[inside].text + (list[inside + 1]?.text ?? "")).codePointAt(0) ?? 0);
          const units2 = list.slice(at, at + scalar.length);
          if (units2.length === scalar.length && units2.every((u) => u.before === void 0 && !u.marks.length && !!u.text) && list[inside].before !== void 0 && /[\p{P}\p{S}]/u.test(innerScalar) && !/[\s\p{P}\p{S}]/u.test(scalar)) adjacentEntities.add(at);
        }
      }
      for (const r2 of ranges) if (!r2.keep && ["em", "strong", "strike_through", "highlight"].includes(r2.mark.type.name)) {
        if (!ranges.some((other) => other !== r2 && other.from === r2.to) && /^[ \t]$/.test(list[r2.to - 1].text) && r2.to < list.length && !/[\s\p{P}\p{S}]/u.test(list[r2.to].text)) adjacentEntities.add(r2.to);
        if (!ranges.some((other) => other !== r2 && other.to === r2.from) && /^[ \t]$/.test(list[r2.from].text) && r2.from > 0 && !/[\s\p{P}\p{S}]/u.test(list[r2.from - 1].text)) {
          let at = r2.from - 1;
          if (/[\uDC00-\uDFFF]/.test(list[at].text) && at > 0 && /[\uD800-\uDBFF]/.test(list[at - 1].text)) at--;
          adjacentEntities.add(at);
        }
      }
      const output = [], emittedGaps = /* @__PURE__ */ new Set();
      const nesting = (a, b) => a.from - b.from || b.to - a.to || Number(a.mark.type.name === "code") - Number(b.mark.type.name === "code") || Number(b.keep) - Number(a.keep) || (a.old && b.old ? a.old.open.from - b.old.open.from : Object.keys(target.type.schema.marks).indexOf(a.mark.type.name) - Object.keys(target.type.schema.marks).indexOf(b.mark.type.name));
      const ordered = ranges.slice().sort(nesting);
      for (let at = 0; at <= list.length; at++) {
        for (const r2 of ordered.filter((r3) => r3.to === at).reverse()) {
          const critic = r2.keep && r2.mark.type.name === "annotation" ? facts.critic.find((c2) => c2.kind === "annotation" && c2.syntaxFrom === r2.old.open.from) : void 0;
          if (critic && critic.note !== r2.mark.attrs.note) {
            const edit = noteEdit(base, critic, r2.mark.attrs.note);
            output.push({ raw: { from: r2.old.close.from, to: edit.from } }, { text: edit.text }, { raw: { from: edit.to, to: r2.old.close.to } });
          } else output.push(r2.keep ? { raw: r2.old.close } : { text: r2.close });
        }
        for (let g = 0; g < gaps.length; g++) if (!emittedGaps.has(g) && (at === list.length || list[at].before !== void 0 && gaps[g].before <= list[at].before)) {
          output.push({ raw: gaps[g].raw });
          emittedGaps.add(g);
        }
        for (const r2 of ordered.filter((r3) => r3.from === at)) output.push(r2.keep ? { raw: r2.old.open } : { text: r2.open });
        if (at === list.length) break;
        const u = list[at], code2 = u.marks.some((m) => m.type.name === "code"), changedCode = u.before !== void 0 && u.beforeCode !== code2;
        if (u.before === void 0 && !u.marks.length && u.text === "!" && ordered.some((r2) => r2.keep && r2.mark.type.name === "link" && r2.from === at + 1 && base.source.slice(r2.old.open.from, r2.old.open.to) === "[")) {
          output.push({ text: "\\!" });
          continue;
        }
        const exposedSpace = u.before !== void 0 && u.raw && /^[ \t]$/.test(base.source.slice(u.raw.from, u.raw.to)) && [...removedImageAtoms].some((a) => a.body === id && (a.pmTo <= u.before && list.slice(0, at + 1).every((x) => /^[ \t]$/.test(x.text)) || a.pmFrom > u.before && list.slice(at).every((x) => /^[ \t]$/.test(x.text))));
        const edgeSpace = !code2 && /^[ \t]$/.test(u.text) && (exposedSpace || (u.before === void 0 || changedCode) && (list.slice(list.slice(0, at).map((x) => x.text).lastIndexOf("\n") + 1, at + 1).every((x) => /^[ \t]$/.test(x.text)) || list.slice(at, list.findIndex((x, i) => i > at && x.text === "\n") < 0 ? void 0 : list.findIndex((x, i) => i > at && x.text === "\n")).every((x) => /^[ \t]$/.test(x.text))) || ranges.some((r2) => !r2.keep && ["em", "strong", "strike_through", "highlight"].includes(r2.mark.type.name) && r2.from <= at && at < r2.to && (list.slice(r2.from, at + 1).every((x) => /^[ \t]$/.test(x.text)) || list.slice(at, r2.to).every((x) => /^[ \t]$/.test(x.text)))));
        if (adjacentEntities.has(at)) {
          const scalar = (u.text + (list[at + 1]?.text ?? "")).codePointAt(0);
          output.push({ text: "&#" + scalar + ";" });
          if (scalar > 65535) at++;
          continue;
        }
        if (edgeSpace) {
          output.push({ text: u.text === " " ? "&#32;" : "&#9;" });
          continue;
        }
        if (u.image) {
          if (code2) return no;
          if (u.atom && u.image.hasMarkup(u.atom.node.type, u.atom.node.attrs, u.image.marks)) output.push({ raw: { from: u.atom.sourceFrom, to: u.atom.sourceTo } });
          else output.push({ text: serializeSourceInlineBody(target.copy(Fragment3.from(u.image.mark([]))), body.kind === "table-cell") });
          continue;
        }
        if (u.before !== void 0) {
          if (u.atom) {
            const atom = u.atom, count = atom.pmTo - atom.pmFrom, group = list.slice(at, at + count);
            if (u.before !== atom.pmFrom || group.length !== count || group.some((x, i) => x.atom !== atom || x.before !== atom.pmFrom + i || !sameMarks(x.marks, atom.node.marks)) || ranges.some((r2) => r2.from > at && r2.from < at + count || r2.to > at && r2.to < at + count)) return unmapped;
            output.push({ raw: { from: atom.sourceFrom, to: atom.sourceTo } });
            at += count - 1;
            continue;
          }
          if (!u.raw) {
            const span = base.textSpans.find((s) => s.kind === "atomic" && s.pmFrom === u.before);
            if (!span) return unmapped;
            const count = span.pmTo - span.pmFrom, group = list.slice(at, at + count);
            if (group.length !== count || group.some((x, i) => x.before !== span.pmFrom + i || !sameMarks(x.marks, u.marks)) || ranges.some((r2) => r2.from > at && r2.from < at + count || r2.to > at && r2.to < at + count)) return unmapped;
            const raw = { from: span.sourceFrom, to: span.sourceTo }, text2 = group.map((x) => x.text).join("");
            const encoded = changedCode ? encodeCodeContext(text2, code2, body.kind === "table-cell") : void 0;
            output.push(encoded !== void 0 && encoded !== base.source.slice(raw.from, raw.to) ? { text: encoded } : { raw });
            at += count - 1;
          } else {
            const encoded = changedCode ? encodeCodeContext(u.text, code2, body.kind === "table-cell") : void 0;
            output.push(encoded !== void 0 && encoded !== base.source.slice(u.raw.from, u.raw.to) ? { text: encoded } : { raw: u.raw });
          }
        } else if (u.math) {
          const math = u.math, count = math.node.nodeSize, group = list.slice(at, at + count);
          if (group.length !== count || group.some((x) => x.math !== math) || ranges.some((r2) => r2.from > at && r2.from < at + count || r2.to > at && r2.to < at + count)) return no;
          output.push({ text: "$" + (body.kind === "table-cell" ? math.node.textContent.replace(/\|/g, "\\|") : math.node.textContent) + "$" });
          at += count - 1;
        } else if (u.leaf) output.push({ text: u.leaf.attrs.isInline ? "\n" : "\\\n" });
        else output.push({ text: code2 ? body.kind === "table-cell" ? u.text.replace(/\|/g, "\\|") : u.text : escapeText2(u.text, body.kind === "table-cell") });
      }
      const bodyEdits = editsFromOutput(base, body, output);
      if (!bodyEdits) return unmapped;
      edits.push(...bodyEdits);
      if (!list.length && target.type.name === "paragraph" && removedImages.has(id)) edits.push(...emptyBodyEdits(base, facts, body, body.sourceTo));
    }
    edits.sort((a, b) => a.from - b.from || a.to - b.to);
    if (edits.some((e, i) => i > 0 && edits[i - 1].to > e.from)) return no;
    return { ok: true, edits, changedBodies: [...changed] };
  } catch {
    return no;
  }
}

// src/source-empty-body.ts
import { ReplaceStep as ReplaceStep3, AddMarkStep as AddMarkStep3, RemoveMarkStep as RemoveMarkStep3 } from "prosemirror-transform";

// src/source-structure.ts
import { AddMarkStep as AddMarkStep2, RemoveMarkStep as RemoveMarkStep2, ReplaceStep as ReplaceStep2, ReplaceAroundStep, AttrStep as AttrStep2, AddNodeMarkStep as AddNodeMarkStep2, RemoveNodeMarkStep as RemoveNodeMarkStep2 } from "prosemirror-transform";
var UnsupportedSourceStructure = class extends Error {
};
function isSourceListBoundary(node) {
  return node.type.name === "html_block" && node.textContent === "<!-- notemd:list-boundary -->" && node.hasMarkup(node.type) && node.childCount === 1 && node.firstChild.isText && node.firstChild.marks.length === 0;
}
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
function stepRange(doc2, step) {
  if (step instanceof AttrStep2 || step instanceof AddNodeMarkStep2 || step instanceof RemoveNodeMarkStep2) {
    if (!Number.isInteger(step.pos) || step.pos < 0 || step.pos >= doc2.content.size) fail();
    const node = doc2.nodeAt(step.pos);
    if (!node) fail();
    return { from: step.pos, to: step.pos + node.nodeSize };
  }
  return { from: step.from, to: step.to };
}
var structuralWitness = (w) => w.kind === "replace" || w.kind === "around";
function classifyTransaction(base, tr) {
  if (tr.docs.length !== tr.steps.length || tr.doc.type.schema !== base.doc.type.schema) fail();
  let structural = false;
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i], proto = Object.getPrototypeOf(step), before = tr.docs[i];
    if (!before || before.type.schema !== base.doc.type.schema) fail();
    if (proto !== ReplaceStep2.prototype && proto !== AddMarkStep2.prototype && proto !== RemoveMarkStep2.prototype && proto !== ReplaceAroundStep.prototype && proto !== AttrStep2.prototype && proto !== AddNodeMarkStep2.prototype && proto !== RemoveNodeMarkStep2.prototype) fail();
    const { from, to } = stepRange(before, step);
    childWindow(before, from, to);
    if (splitsText(before, from) || splitsText(before, to)) fail();
    if (proto === ReplaceAroundStep.prototype) {
      const around = step;
      if (!Number.isInteger(around.gapFrom) || !Number.isInteger(around.gapTo) || around.gapFrom < from || around.gapTo < around.gapFrom || around.gapTo > to || !Number.isInteger(around.insert) || around.insert < 0 || around.insert > around.slice.size || splitsText(before, around.gapFrom) || splitsText(before, around.gapTo)) fail();
      structural = true;
    } else if (proto === AttrStep2.prototype || proto === AddNodeMarkStep2.prototype || proto === RemoveNodeMarkStep2.prototype) {
      if (!imageStepRange(before, step)) structural = true;
    } else if (proto === ReplaceStep2.prototype) {
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
  const children2 = new Array(base.doc.childCount);
  const assign = (origin, from, to, pmFrom, pmTo) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > children2.length) fail();
    let pos2 = pmFrom;
    for (let i = from; i < to; i++) {
      if (children2[i]) fail();
      const node = base.doc.child(i);
      children2[i] = { ref: { kind: "base", origin }, node, from: pos2, to: pos2 + node.nodeSize };
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
  for (const lane of children2) {
    if (!lane || lane.from !== pos) fail();
    pos = lane.to;
  }
  if (pos !== base.doc.content.size) fail();
  const boundaries = [];
  let blankCursor = 0;
  for (let i = 0; i <= children2.length; i++) {
    const left = children2[i - 1]?.ref, right = children2[i]?.ref;
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
  return { children: children2, boundaries, components: [] };
}
function representative(ledger, id) {
  let c2 = ledger.components[id];
  if (!c2) fail();
  while (c2.parent !== c2.id) c2 = ledger.components[c2.parent];
  return c2;
}
function stepWindow(before, after, step, ledger) {
  const range = stepRange(before, step), window2 = childWindow(before, range.from, range.to);
  const from = ledger.children[window2.from]?.from ?? before.content.size;
  const to = window2.to === window2.from ? from : ledger.children[window2.to - 1].to;
  const map = step.getMap(), a = boundaryAt(after, map.map(from, -1)), b = boundaryAt(after, map.map(to, 1));
  if (a === void 0 || b === void 0 || b < a) fail();
  return { before: window2, after: { from: a, to: b }, from, to };
}
function advanceLedger(ledger, before, after, step, index) {
  const w = stepWindow(before, after, step, ledger), range = stepRange(before, step);
  const isLocal = !(step instanceof ReplaceStep2 || step instanceof ReplaceAroundStep);
  const kind = step instanceof ReplaceAroundStep ? "around" : step instanceof ReplaceStep2 ? "replace" : step instanceof AttrStep2 ? "attr" : step instanceof AddNodeMarkStep2 || step instanceof RemoveNodeMarkStep2 ? "node-mark" : "mark";
  const witness = {
    step: index,
    kind,
    before: range,
    after: { from: step.getMap().map(range.from, -1), to: step.getMap().map(range.to, 1) },
    crossed: ledger.boundaries.slice(w.before.from, w.before.to + 1)
  };
  if (w.after.from !== w.before.from || after.childCount - before.childCount !== w.after.to - w.after.from - (w.before.to - w.before.from)) fail();
  if (isLocal) {
    for (let i = w.before.from; i < w.before.to; i++) {
      const lane = ledger.children[i];
      if (lane.node.eq(after.child(i))) continue;
      const c3 = touch([lane.ref], ledger.boundaries[i], false);
      lane.ref = { kind: "component", id: c3.id };
      lane.node = after.child(i);
    }
    return;
  }
  const refs = ledger.children.slice(w.before.from, w.before.to).map((l) => l.ref);
  const boundary2 = ledger.boundaries[w.before.from];
  for (let child = w.before.from; child <= w.before.to; child++) {
    const position = ledger.children[child]?.from ?? before.content.size;
    if (!(range.from < position && position < range.to)) continue;
    let crossed = ledger.boundaries[child];
    while (crossed.kind === "tombstone") {
      refs.push({ kind: "component", id: crossed.component });
      crossed = crossed.prior;
    }
  }
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
function mathWitnesses(base, tr) {
  let occurrences = [];
  base.doc.descendants((node, pos) => {
    if (node.type.name !== "math_block") return;
    const root = base.roots.find((r2) => r2.tokenType === "math_block" && r2.childTo === r2.childFrom + 1 && r2.pmFrom === pos && r2.pmTo === pos + node.nodeSize);
    occurrences.push({ pos, node, born: false, ...root ? { root: root.id } : {} });
    return false;
  });
  const removedRoots = /* @__PURE__ */ new Set();
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i], before = tr.docs[i], range = stepRange(before, step), next = [];
    for (const occurrence of occurrences) {
      const end = occurrence.pos + occurrence.node.nodeSize;
      const touched = range.from < end && range.to > occurrence.pos || range.from === range.to && occurrence.pos < range.from && range.from < end;
      if (touched) {
        if (!(step instanceof ReplaceStep2 || step instanceof ReplaceAroundStep) || range.from > occurrence.pos || range.to < end || step instanceof ReplaceAroundStep && step.gapFrom < end && step.gapTo > occurrence.pos || !occurrence.born && occurrence.root === void 0) fail();
        if (occurrence.root !== void 0) removedRoots.add(occurrence.root);
      } else next.push({ ...occurrence, pos: step.getMap().map(occurrence.pos, 1) });
    }
    if (step instanceof ReplaceStep2 || step instanceof ReplaceAroundStep) step.slice.content.descendants((node, pos) => {
      if (node.type.name !== "math_block") return;
      if (node.type !== before.type.schema.nodes.math_block || node.attrs.value !== "" || !node.hasMarkup(node.type) || node.content.size) fail();
      if (step instanceof ReplaceAroundStep) {
        const previous = tr.steps[i - 1], paragraph2 = before.nodeAt(step.from);
        if (step.slice.openStart || step.slice.openEnd || step.slice.content.childCount !== 1 || pos !== 0 || step.insert !== 1 || step.gapFrom !== step.from + 1 || step.gapTo !== step.gapFrom || step.to !== step.from + 2 || !paragraph2 || !empty(paragraph2) || !paragraph2.hasMarkup(paragraph2.type) || !previous || Object.getPrototypeOf(previous) !== ReplaceStep2.prototype) fail();
        const deletion = previous;
        if (deletion.slice.size || deletion.from !== step.from + 1 || deletion.to !== deletion.from + 2 || tr.docs[i - 1].textBetween(deletion.from, deletion.to) !== "$$") fail();
      }
      const absolute = step.from + pos - step.slice.openStart, after = tr.docs[i + 1] ?? tr.doc;
      if (!after.nodeAt(absolute)?.eq(node)) fail();
      next.push({ pos: absolute, node, born: true });
      return false;
    });
    occurrences = next;
  }
  return { births: new Set(occurrences.filter((o) => o.born).map((o) => o.pos)), removedRoots };
}
function makeRecipe(base, ledger, slots, math, render, rootHasClosedFences) {
  const claims = [], removed = /* @__PURE__ */ new Set(), insertions = /* @__PURE__ */ new Map(), changedRoots = [];
  const dirty = /* @__PURE__ */ new Map(), blankDirty = /* @__PURE__ */ new Map();
  const components = ledger.components.filter((c2) => c2.parent === c2.id).sort((a, b) => (a.finalRuns[0]?.from ?? Infinity) - (b.finalRuns[0]?.from ?? Infinity));
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
  const structuralStep = (c2) => c2.witnesses.find(structuralWitness)?.step;
  const deletion = components.flatMap((c2) => c2.witnesses).find((w) => structuralWitness(w) && w.before.to > w.before.from && w.after.to - w.after.from < w.before.to - w.before.from);
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
      if (!rootHasClosedFences(r2)) fail();
      if (!["paragraph_open", "heading_open", "bullet_list_open", "ordered_list_open", "blockquote_open", "table_open", "hr", "fence"].includes(r2.tokenType) && !(r2.tokenType === "math_block" && math.removedRoots.has(r2.id)) && !(r2.tokenType === "html_block" && r2.childTo === r2.childFrom + 1 && isSourceListBoundary(base.doc.child(r2.childFrom)))) fail();
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
      const position = ledger.children[finalIndex].from;
      const allowMath = (n2, p) => {
        if (n2.type.name === "math_block" && !math.births.has(p)) fail();
      };
      allowMath(node, position);
      node.descendants((n2, p) => allowMath(n2, position + p + 1));
      if (!["paragraph", "heading", "bullet_list", "ordered_list", "blockquote", "horizontal_rule", "table", "code_block"].includes(node.type.name) && !isSourceListBoundary(node) && !(node.type.name === "math_block" && math.births.has(position))) fail();
      const output = render([node], [position]);
      if (output.family === "closed-literal" && node.type.name !== "code_block" && !isSourceListBoundary(node) && !(node.type.name === "math_block" && math.births.has(position))) fail();
      let text2 = output.text;
      if (output.terminal === "content-eol") {
        if (!text2.endsWith(output.eol)) fail();
        text2 = text2.slice(0, -output.eol.length);
      }
      atoms2.push({ ...generated("body", text2, anchor, stepOf(c2)), ownedBlank: !!output.ownedBlank, ...output.continuationIndent !== void 0 ? { continuationIndent: output.continuationIndent } : {} });
      if (n === lastVisible && keepTerminal) {
        atoms2.push(raw(keepTerminal));
        removed.add(keepTerminal);
        if (n < nodes.length - 1) claims.push({ from: keepTerminal.to, to: keepTerminal.to, kind: "anchor", step: stepOf(c2) });
      } else {
        const original = origins.length === 1 && c2.origins.length === 1 && !c2.births.length && nodes.length === 1 ? base.roots[origins[0].id] : void 0;
        const keepAbsentTableEol = output.family === "table" && finalIndex === ledger.children.length - 1 && !terminal && original?.tokenType === "table_open" && original.childTo === base.doc.childCount && original.sourceTo === base.source.length && original.tailFrom === original.sourceTo;
        atoms2.push(generated("terminator", output.terminal === "content-eol" && !keepAbsentTableEol ? "\n" : "", anchor, stepOf(c2)));
      }
    }
    if (!nodes.length && !c2.origins.length) continue;
    const previous = insertions.get(anchor) ?? [];
    insertions.set(anchor, [...previous, ...atoms2]);
    const birth = c2.births[0];
    claims.push({ from: anchor, to: anchor, kind: "anchor", step: stepOf(c2), ...birth ? { birth } : {} });
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
    for (const root of [left, right]) {
      const c2 = root === void 0 ? void 0 : dirty.get(root);
      if (c2) {
        const step = structuralStep(c2);
        if (step !== void 0) return step;
      }
    }
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
    if (keep?.slot && left?.continuationIndent !== void 0) {
      const text2 = base.source.slice(keep.slot.from, keep.slot.to), eol = /(\r\n|\r|\n)$/.exec(text2)?.[0];
      const neighbor = neighbors.get(keep.slot)?.left, component = neighbor === void 0 ? void 0 : dirty.get(neighbor);
      const step = component && structuralStep(component);
      if (step !== void 0 && left.step !== void 0 && eol) {
        const padding = text2.slice(0, -eol.length);
        let width = 0, at = 0;
        while (at < padding.length && width < left.continuationIndent) {
          width += padding[at++] === "	" ? 4 - width % 4 : 1;
        }
        if (width === left.continuationIndent) {
          drop.add(keep);
          before.set(keep, [generated("separator", eol, keep.anchor, step)]);
          claims.push({ from: keep.slot.from, to: keep.slot.to, kind: "separator", unitId: keep.slot.id, step });
        }
      }
    }
    if (needed && !keep && !left?.ownedBlank) {
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
      if (!structuralWitness(witness)) fail();
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
function applyStructuralTransaction(base, tr, render, rootHasClosedFences) {
  const ledger = createLedger(base);
  for (let i = 0; i < tr.steps.length; i++) {
    const before = tr.docs[i], after = tr.docs[i + 1] ?? tr.doc, step = tr.steps[i];
    const result = step.apply(before);
    if (result.failed || !result.doc || after.type.schema !== base.doc.type.schema || !after.eq(result.doc)) fail();
    advanceLedger(ledger, before, after, step, i);
  }
  tr.doc.check();
  finishLedger(base, tr, ledger);
  const math = mathWitnesses(base, tr);
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
  const recipe = makeRecipe(base, ledger, partitionSlots(base), math, render, rootHasClosedFences);
  verifyRecipe(base, recipe);
  return { source: applyRecipe(base, recipe), edits: recipe.edits, changedRoots: recipe.changedRoots, unchanged: false };
}
function prepareEmptyParagraphEdits(base, tr, origin, body) {
  const ledger = createLedger(base), first = tr.steps[0];
  if (!first || Object.getPrototypeOf(first) !== ReplaceStep2.prototype || tr.steps.length !== tr.docs.length || !tr.before.eq(base.doc)) fail();
  const initial = first, parent = base.doc.resolve(initial.from).parent;
  initial.slice.content.forEach((node) => {
    if (!node.isText && !canonicalImage(node) && (tr.steps.length !== 1 || initial.slice.content.childCount !== 1 || node.type !== base.doc.type.schema.nodes.note_anchor || !node.isLeaf || node.nodeSize !== 1 || node.marks.length || typeof node.attrs.note !== "string" || /[\r\n]|<<}/.test(node.attrs.note) || !node.eq(node.type.create({ note: node.attrs.note })))) fail();
  });
  if (initial.from !== initial.to || initial.slice.openStart || initial.slice.openEnd || !initial.slice.size || initial.structure || parent.type.name !== "paragraph" || parent.content.size) fail();
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i], before = tr.docs[i], after = tr.docs[i + 1] ?? tr.doc;
    if (i === 0 && !before.eq(base.doc)) fail();
    if (i > 0) {
      const prototype = Object.getPrototypeOf(step);
      if (prototype !== AddMarkStep2.prototype && prototype !== RemoveMarkStep2.prototype) fail();
      const mark = step;
      if (mark.from < initial.from || mark.to > initial.from + initial.slice.size) fail();
    }
    const result = step.apply(before);
    if (result.failed || !result.doc?.eq(after)) fail();
    advanceLedger(ledger, before, after, step, i);
  }
  finishLedger(base, tr, ledger);
  const components = ledger.components.filter((c3) => c3.parent === c3.id), c2 = components[0];
  if (components.length !== 1 || !c2 || c2.origins.length !== 1 || !sameOrigin(c2.origins[0], origin) || c2.births.length || c2.finalRuns.length !== 1 || c2.finalRuns[0].to - c2.finalRuns[0].from !== 1) fail();
  const slots = partitionSlots(base), span = originSpan(base, origin);
  const chosen = origin.kind === "blank" ? slots.find((s) => s.kind === "blank" && s.id === origin.id) : void 0;
  if (origin.kind === "blank" && !chosen) fail();
  const original = base.source.slice(span.from, span.to);
  const eol = /(\r\n|\r|\n)$/.exec(original)?.[0] ?? slots.map((s) => /(\r\n|\r|\n)$/.exec(base.source.slice(s.from, s.to))?.[0]).find(Boolean) ?? "\n";
  const tail = base.source.slice(span.to), next = slots.find((s) => s.from >= span.to && ["body", "protected"].includes(s.kind));
  const between = next ? base.source.slice(span.to, next.from) : tail;
  const previous = slots.filter((s) => s.to <= span.from && ["body", "protected"].includes(s.kind)).at(-1);
  const unit = chosen && base.layout.blankLines[chosen.id], fallback = base.layout.fallback;
  const prefix = chosen && (previous && !/[\r\n][ \t]*(?:\r\n|\r|\n)$/.test(base.source.slice(previous.from, span.from)) || unit?.role === "empty-paragraph" && fallback && fallback.emission.childTo <= unit.emission.childFrom) ? eol : "";
  const suffix = origin.kind === "blank" ? next && !/[\r\n]/.test(between) ? eol : "" : tail ? next && next.from === span.to ? eol + eol : eol : "";
  const claims = [{ ...span, kind: chosen ? "blank" : "anchor", step: 0, ...chosen ? { unitId: chosen.id } : {} }];
  const pieces = [], kept = [];
  const keep = (from, to) => {
    if (from === to) return;
    const identity = { from, to, kind: "envelope", id: kept.length };
    kept.push(identity);
    pieces.push({ kind: "raw", span: { from, to }, identity });
  };
  keep(0, span.from);
  pieces.push({ kind: "generated", text: prefix + body });
  if (chosen) {
    const terminal = /(\r\n|\r|\n)$/.exec(original)?.[0];
    if (!terminal) fail();
    keep(span.to - terminal.length, span.to);
  }
  pieces.push({ kind: "generated", text: suffix });
  keep(span.to, base.source.length);
  if (suffix && chosen) claims.push({ from: span.to, to: span.to, kind: "anchor", step: 0 });
  const recipe = { claims, kept, pieces, edits: [], changedRoots: [], witnesses: c2.witnesses };
  verifyRecipe(base, recipe);
  return recipe.edits;
}

// src/source-empty-body.ts
function renderPrefix(source, prefix) {
  return prefix.map((p) => "spaces" in p ? " ".repeat(p.spaces) : source.slice(p.from, p.to)).join("");
}
function escapeEmptyText(node) {
  return serializeSourceInlineBody(node);
}
function previouslyNonemptyBody(base, tr) {
  const first = tr.steps[0];
  if (!first || ![ReplaceStep3.prototype, AddMarkStep3.prototype, RemoveMarkStep3.prototype].includes(Object.getPrototypeOf(first))) return false;
  const range = first, a = base.doc.resolve(range.from), parent = a.parent;
  if (!["paragraph", "heading"].includes(parent.type.name) || !parent.content.size || !a.depth) return false;
  let from = a.start(), to = a.end();
  if (!base.roots.some((root) => root.pmFrom <= a.before() && root.pmTo >= to + 1)) return false;
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i];
    if (![ReplaceStep3.prototype, AddMarkStep3.prototype, RemoveMarkStep3.prototype].includes(Object.getPrototypeOf(step))) return false;
    const before = tr.docs[i];
    if (!before) return false;
    const left = before.resolve(step.from), right = before.resolve(step.to);
    if (step.from < from || step.to > to || !left.sameParent(right) || left.start() !== from || left.end() !== to || !parent.sameMarkup(left.parent)) return false;
    if (step instanceof ReplaceStep3) {
      if (step.slice.openStart || step.slice.openEnd || step.structure) return false;
      let inline = true;
      step.slice.content.forEach((node) => {
        if (!node.isInline) inline = false;
      });
      if (!inline) return false;
    }
    const map = step.getMap();
    from = map.map(from, -1);
    to = map.map(to, 1);
  }
  return true;
}
function prepareEmptyBodyTransaction(base, tr, facts) {
  const reject = (reason) => ({ kind: "unsupported", reason });
  let emptyInput = false;
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i];
    if (!(step instanceof ReplaceStep3)) continue;
    let blocks = false;
    step.slice.content.forEach((n) => {
      if (n.isBlock) blocks = true;
    });
    if (blocks) continue;
    const before = tr.docs[i];
    if (!before) return reject("empty-chain");
    try {
      const parent = before.resolve(step.from).parent;
      if (parent.isTextblock && parent.content.size === 0) emptyInput = true;
    } catch {
      return reject("invalid-range");
    }
  }
  if (!emptyInput || previouslyNonemptyBody(base, tr)) return { kind: "not-empty" };
  const first = tr.steps[0];
  try {
    if (tr.docs.length !== tr.steps.length || Object.getPrototypeOf(first) !== ReplaceStep3.prototype || !tr.before.eq(base.doc) || !tr.docs[0].eq(base.doc) || first.structure || first.from !== first.to || first.slice.openStart || first.slice.openEnd || !first.slice.size) return reject("empty-step");
    const applied = first.apply(tr.docs[0]);
    if (applied.failed || !applied.doc?.eq(tr.docs[1] ?? tr.doc)) return reject("empty-chain");
    tr.doc.check();
    const certified = capturedEmptyBodies(base.source, base.doc, base.roots, base.layout);
    if (certified !== facts) return reject("empty-binding");
    const matches = facts.filter((f) => f.pmAt === first.from && f.parent === base.doc.resolve(first.from).parent);
    if (matches.length !== 1) return reject("empty-fact");
    const fact = matches[0], after = tr.doc.resolve(first.from).parent;
    if (!["paragraph", "heading", "code_block", "frontmatter"].includes(fact.parent.type.name) || !fact.parent.sameMarkup(after) || fact.parent.marks.length) return reject("empty-markup");
    let plain = true;
    first.slice.content.forEach((n) => {
      if (!n.isText || n.marks.length) plain = false;
    });
    const generated = prepareEmptyInlineContent(base, tr, fact);
    if ((!plain || tr.steps.length !== 1) && generated.kind !== "ready") return reject("empty-content");
    const place = fact.place, literal = place.kind === "literal", text2 = after.textContent;
    if (!literal && /[\r\n]/.test(text2)) return reject("empty-newline");
    const root = fact.rootId === void 0 ? void 0 : base.roots[fact.rootId];
    if (place.kind !== "layout") {
      if (!root || !sourceRootHasClosedFences(root)) return reject("empty-owner");
      const range = place.kind === "inline" || place.kind === "nested-blank" ? place.range : { from: place.at, to: place.at };
      if (range.from < root.sourceFrom || range.to > root.sourceTo) return reject("empty-owner-range");
      if (base.protectedSources.some((p) => range.from === range.to ? p.sourceFrom < range.from && range.from < p.sourceTo : p.sourceFrom < range.to && p.sourceTo > range.from)) return reject("empty-protected");
    }
    const body = literal ? text2 : generated.kind === "ready" ? generated.body : escapeEmptyText(after);
    let edits;
    switch (place.kind) {
      case "inline":
        edits = [{ ...place.range, text: place.before + body + place.after }];
        break;
      case "missing-cell": {
        const j = place.slot - place.present;
        if (j < 0) return reject("empty-slot");
        edits = [{ from: place.at, to: place.at, text: place.closingPipe ? "|".repeat(j) + body + "|" : "|".repeat(j + 1) + body }];
        break;
      }
      case "prepend":
        edits = [{ from: place.at, to: place.at, text: body + (place.eol ? base.source.slice(place.eol.from, place.eol.to) : "\n") + renderPrefix(base.source, place.continuation) }];
        break;
      case "literal": {
        const eol = base.source.slice(place.eol.from, place.eol.to), prefix = renderPrefix(base.source, place.prefix);
        const payload = text2.split("\n").join(eol + prefix);
        edits = [{ from: place.at, to: place.at, text: place.terminal ? payload : prefix + payload + eol }];
        break;
      }
      case "nested-blank": {
        const eol = place.eol ? base.source.slice(place.eol.from, place.eol.to) : base.source.slice(root.sourceFrom, place.range.from).match(/\r\n|\r|\n/g)?.at(-1) ?? "\n";
        const prefix = renderPrefix(base.source, place.prefix);
        const before = place.leftBody && !place.rightBody && !place.leftSeparator ? eol + prefix : "";
        const after2 = place.rightBody ? eol + prefix : "";
        edits = [{ ...place.range, text: before + body + after2 }];
        break;
      }
      case "layout":
        edits = prepareEmptyParagraphEdits(base, tr, place.origin, body);
        break;
      default:
        return reject("empty-place");
    }
    let end = -1;
    for (const e of edits) {
      if (!Number.isInteger(e.from) || !Number.isInteger(e.to) || e.from < end || e.to < e.from || e.to > base.source.length) return reject("empty-range");
      if (root && (e.from < root.sourceFrom || e.to > root.sourceTo)) return reject("empty-owner-range");
      if (base.protectedSources.some((p) => e.from === e.to ? p.sourceFrom < e.from && e.from < p.sourceTo : p.sourceFrom < e.to && p.sourceTo > e.from)) return reject("empty-protected");
      end = e.to;
    }
    return { kind: "ready", recipe: { edits, changedRoots: root ? [root.id] : [] } };
  } catch {
    return reject("empty-invalid");
  }
}

// src/source-file-cache.ts
function emptyFileParseWork() {
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
var fileCaches = /* @__PURE__ */ new WeakMap();
function makeSession(source, value, revision) {
  return Object.freeze({
    revision,
    source,
    doc: value.doc,
    textSpans: value.textRuns,
    roots: value.roots,
    gaps: value.gaps,
    protectedSources: value.protectedSources,
    layout: value.layout
  });
}
function registerSession(source, value, revision, tokens, environmentVersion) {
  const session = makeSession(source, value, revision);
  fileCaches.set(session, { canonical: session, tokens, environmentVersion });
  return session;
}
function createFileSourceSession(source, schema2) {
  const parsed = captureFilePipeline(source, schema2);
  if (!parsed.ok) return parsed;
  return { ok: true, session: registerSession(source, parsed.value, 0, parsed.cache, 0) };
}
function sameMetadata(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a, right = b, keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((k) => Object.hasOwn(right, k) && sameMetadata(left[k], right[k]));
}
function prepareVerifiedFileBase(callerBase, work) {
  const hit = fileCaches.get(callerBase);
  if (hit) return { callerBase, verifiedBase: hit.canonical, cache: hit, recovery: false };
  work.mode = "full-fallback";
  work.fallbackReason = "cache-miss";
  const parsed = captureFilePipeline(callerBase.source, callerBase.doc.type.schema, work);
  if (!parsed.ok) return parsed;
  work.inlineRoots = parsed.value.roots.map((root) => root.id);
  const actual = makeSession(callerBase.source, parsed.value, callerBase.revision);
  if (actual.doc.type.schema !== callerBase.doc.type.schema || !actual.doc.eq(callerBase.doc) || !sameMetadata(actual.roots, callerBase.roots) || !sameMetadata(actual.gaps, callerBase.gaps) || !sameMetadata(actual.protectedSources, callerBase.protectedSources) || !sameMetadata(actual.textSpans, callerBase.textSpans) || !sameMetadata(actual.layout.blankLines, callerBase.layout.blankLines) || !sameMetadata(actual.layout.fallback, callerBase.layout.fallback) || callerBase.layout.lists !== void 0 && !sameMetadata(actual.layout.lists, callerBase.layout.lists))
    return { ok: false, reason: "unsupported-source" };
  return {
    callerBase,
    verifiedBase: actual,
    cache: { canonical: actual, tokens: parsed.cache, environmentVersion: 0 },
    recovery: true
  };
}
function commitRecovery(base) {
  if (base.recovery) fileCaches.set(base.callerBase, base.cache);
}
function finishUnchangedFile(base, work) {
  commitRecovery(base);
  return { ok: true, session: base.callerBase, file: {
    environmentVersion: base.cache.environmentVersion,
    correspondence: base.verifiedBase.roots.map((r2) => ({ beforeRoots: [r2.id], afterRoots: [r2.id], kind: "untouched" })),
    work
  } };
}
function splitsBoundary(source, offset) {
  if (offset <= 0 || offset >= source.length) return false;
  return source[offset - 1] === "\r" && source[offset] === "\n" || /[\uD800-\uDBFF]/.test(source[offset - 1]) && /[\uDC00-\uDFFF]/.test(source[offset]);
}
function validateSourcePatches(base, input) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== base.revision) return { ok: false, reason: "stale-document" };
  let end = 0, previous;
  const patches = [];
  for (const patch of input.edits) {
    if (!Number.isSafeInteger(patch.from) || !Number.isSafeInteger(patch.to) || typeof patch.removed !== "string" || typeof patch.text !== "string" || patch.from < end || patch.to < patch.from || patch.to > base.source.length || previous && previous.from === patch.from || splitsBoundary(base.source, patch.from) || splitsBoundary(base.source, patch.to) || base.source.slice(patch.from, patch.to) !== patch.removed) return { ok: false, reason: "unmapped-range" };
    previous = patch;
    end = patch.to;
    if (patch.text !== patch.removed) patches.push({ ...patch });
  }
  return patches;
}
function spliceSource(base, patches, work) {
  const chunks = [], pieces = [];
  let before = 0, after = 0;
  const keep = (to) => {
    if (to > before) {
      const text2 = base.source.slice(before, to);
      chunks.push(text2);
      pieces.push({ beforeFrom: before, beforeTo: to, afterFrom: after, afterTo: after + text2.length, generated: false });
      after += text2.length;
    }
  };
  for (const patch of patches) {
    keep(patch.from);
    chunks.push(patch.text);
    pieces.push({
      beforeFrom: patch.from,
      beforeTo: patch.to,
      afterFrom: after,
      afterTo: after + patch.text.length,
      generated: true
    });
    before = patch.to;
    after += patch.text.length;
  }
  keep(base.source.length);
  const source = chunks.join("");
  work.rawSplicedCodeUnits += source.length;
  return { source, pieces };
}
function foldDefinitionEvents(events) {
  const references = {};
  const footnotes = /* @__PURE__ */ new Set();
  for (const event of [...events].sort((a, b) => a.sourceFrom - b.sourceFrom)) {
    if (event.kind === "reference") {
      if (typeof references[event.label] === "undefined") references[event.label] = { href: event.href, title: event.title };
    } else footnotes.add(event.label);
  }
  return { references, footnotes: [...footnotes].sort() };
}
function rawTouchedRoots(base, patches) {
  const ids = /* @__PURE__ */ new Set();
  for (const patch of patches) {
    let low = 0, high = base.roots.length;
    while (low < high) {
      const mid = low + high >>> 1;
      if (base.roots[mid].sourceTo <= patch.from) low = mid + 1;
      else high = mid;
    }
    for (let at = low; at < base.roots.length; at++) {
      const root = base.roots[at];
      if (patch.from === patch.to) {
        if (root.sourceFrom < patch.from && patch.from < root.sourceTo) ids.add(root.id);
        break;
      }
      if (root.sourceFrom >= patch.to) break;
      ids.add(root.id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}
function deriveRootCorrespondence(base, next, pieces, touchedRoots) {
  const total = base.roots.length + next.roots.length, parent = Array.from({ length: total }, (_, i) => i);
  const find = (n) => {
    while (parent[n] !== n) {
      parent[n] = parent[parent[n]];
      n = parent[n];
    }
    return n;
  };
  const join = (a, b) => {
    parent[find(a)] = find(b);
  };
  const touchedSet = new Set(touchedRoots);
  const firstRoot = (roots, from) => {
    let low = 0, high = roots.length;
    while (low < high) {
      const mid = low + high >>> 1;
      if (roots[mid].sourceTo <= from) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  for (const piece of pieces) {
    let oldIndex = firstRoot(base.roots, piece.beforeFrom), nextIndex = firstRoot(next.roots, piece.afterFrom);
    if (piece.generated) {
      const before = [], after = [];
      for (; oldIndex < base.roots.length; oldIndex++) {
        const root = base.roots[oldIndex];
        if (piece.beforeFrom === piece.beforeTo) {
          if (root.sourceFrom < piece.beforeFrom && piece.beforeFrom < root.sourceTo) before.push(root.id);
          break;
        }
        if (root.sourceFrom >= piece.beforeTo) break;
        before.push(root.id);
      }
      for (; nextIndex < next.roots.length && next.roots[nextIndex].sourceFrom < piece.afterTo; nextIndex++)
        if (piece.afterFrom < piece.afterTo) after.push(nextIndex);
      if (before.length && after.length) {
        const representative2 = before[0];
        for (const id of before) join(representative2, id);
        for (const id of after) join(representative2, base.roots.length + id);
      }
      continue;
    }
    for (; oldIndex < base.roots.length && base.roots[oldIndex].sourceFrom < piece.beforeTo; oldIndex++) {
      const old = base.roots[oldIndex];
      const from = Math.max(old.sourceFrom, piece.beforeFrom) - piece.beforeFrom + piece.afterFrom;
      const to = Math.min(old.sourceTo, piece.beforeTo) - piece.beforeFrom + piece.afterFrom;
      while (nextIndex < next.roots.length && next.roots[nextIndex].sourceTo <= from) nextIndex++;
      for (let index = nextIndex; index < next.roots.length && next.roots[index].sourceFrom < to; index++)
        join(old.id, base.roots.length + index);
    }
  }
  const groups = /* @__PURE__ */ new Map();
  for (let i = 0; i < total; i++) {
    const key = find(i), group = groups.get(key) ?? { beforeRoots: [], afterRoots: [] };
    if (i < base.roots.length) group.beforeRoots.push(i);
    else group.afterRoots.push(i - base.roots.length);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const a = group.beforeRoots.length, b = group.afterRoots.length;
    let kind = !a ? "birth" : !b ? "deleted" : a === 1 && b === 1 ? "retained" : a === 1 ? "split" : b === 1 ? "join" : "repartition";
    if (kind === "retained") {
      const old = base.roots[group.beforeRoots[0]], root = next.roots[group.afterRoots[0]];
      const touched = touchedSet.has(old.id);
      if (!touched && old.tokenType === root.tokenType && old.tailFrom - old.sourceFrom === root.tailFrom - root.sourceFrom && base.source.slice(old.sourceFrom, old.sourceTo) === next.source.slice(root.sourceFrom, root.sourceTo)) kind = "untouched";
    }
    return { ...group, kind };
  });
}
function selectBlockWindow(cache, patches) {
  const first = patches[0], last = patches[patches.length - 1];
  let containing = 0;
  while (containing + 1 < cache.checkpoints.length && cache.checkpoints[containing + 1].offset <= first.from) containing++;
  const leftIndex = Math.max(0, containing - 1);
  let rightIndex = containing + 1;
  while (rightIndex < cache.checkpoints.length && cache.checkpoints[rightIndex].offset < last.to) rightIndex++;
  rightIndex = Math.min(cache.checkpoints.length - 1, rightIndex + 1);
  return { leftIndex, rightIndex };
}
function prepareCandidate(base, patches, work, expectedDoc) {
  return prepareCandidateInternal(base, patches, work, expectedDoc, false);
}
function preparePreservingSourceCandidate(base, patches, work, expectedDoc) {
  return prepareCandidateInternal(base, patches, work, expectedDoc, true);
}
function prepareCandidateInternal(base, patches, work, expectedDoc, preserveProtected) {
  if (!patches.length) {
    if (expectedDoc && !expectedDoc.eq(base.verifiedBase.doc)) return { ok: false, reason: "semantic-mismatch", work };
    return { ...finishUnchangedFile(base, work), edits: [] };
  }
  const { source, pieces } = spliceSource(base.verifiedBase, patches, work);
  if (source === base.verifiedBase.source) {
    if (expectedDoc && !expectedDoc.eq(base.verifiedBase.doc)) return { ok: false, reason: "semantic-mismatch", work };
    return { ...finishUnchangedFile(base, work), edits: [] };
  }
  let parsed = captureFileWindow(base.cache.tokens, source, patches, base.verifiedBase.doc.type.schema, work, selectBlockWindow(base.cache.tokens, patches));
  if (!parsed) {
    work.mode = "full-fallback";
    work.fallbackReason ??= "checkpoint-unproven";
    parsed = captureFilePipeline(source, base.verifiedBase.doc.type.schema, work);
  }
  if (!parsed.ok) return { ...parsed, work };
  if (expectedDoc && !parsed.value.doc.eq(expectedDoc)) return { ok: false, reason: "semantic-mismatch", work };
  if (preserveProtected) {
    const expected = [];
    let index = 0;
    for (const old of base.verifiedBase.protectedSources) {
      while (index < pieces.length && pieces[index].beforeTo <= old.sourceFrom) index++;
      const piece = pieces[index];
      if (!piece || piece.generated || piece.beforeFrom > old.sourceFrom || piece.beforeTo < old.sourceTo)
        return { ok: false, reason: "unsupported-step", work };
      const delta = piece.afterFrom - piece.beforeFrom, sourceFrom = old.sourceFrom + delta, sourceTo = old.sourceTo + delta;
      if (source.slice(sourceFrom, sourceTo) !== base.verifiedBase.source.slice(old.sourceFrom, old.sourceTo))
        return { ok: false, reason: "unsupported-step", work };
      expected.push({ ...old, sourceFrom, sourceTo });
    }
    if (!sameMetadata(expected, parsed.value.protectedSources)) return { ok: false, reason: "unsupported-step", work };
  }
  work.environmentChanged = !sameMetadata(foldDefinitionEvents(base.cache.tokens.definitions), foldDefinitionEvents(parsed.cache.definitions));
  const environmentVersion = base.cache.environmentVersion + Number(work.environmentChanged);
  const next = makeSession(source, parsed.value, base.verifiedBase.revision + 1);
  work.rawTouchedBeforeRoots = rawTouchedRoots(base.verifiedBase, patches);
  if (work.mode === "full-fallback") work.inlineRoots = next.roots.map((r2) => r2.id);
  const correspondence = deriveRootCorrespondence(base.verifiedBase, next, pieces, work.rawTouchedBeforeRoots);
  const session = registerSession(source, parsed.value, next.revision, parsed.cache, environmentVersion);
  commitRecovery(base);
  return { ok: true, session, edits: patches, file: { environmentVersion, correspondence, work } };
}
function prepareRawFileSourceEdits(base, input) {
  const work = emptyFileParseWork();
  const patches = validateSourcePatches(base, input);
  if ("ok" in patches) return { ...patches, work };
  const verified = prepareVerifiedFileBase(base, work);
  if ("ok" in verified) return { ...verified, work };
  return prepareCandidate(verified, patches, work);
}

// src/source-fidelity.ts
import { Fragment as Fragment4, Slice as Slice2 } from "prosemirror-model";
import { EditorState as EditorState2 } from "prosemirror-state";
import { AddMarkStep as AddMarkStep4, RemoveMarkStep as RemoveMarkStep4, ReplaceStep as ReplaceStep4, Mapping } from "prosemirror-transform";
function prepareFileSourceEdits(base, input) {
  return prepareRawFileSourceEdits(base, input);
}
function createSourceSession(source, schema2) {
  return createFileSourceSession(source, schema2);
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
function applySourceTextTransactionWithEdit(base, tr, context) {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: "stale-document" };
  if (tr.steps.length !== 1) return { ok: false, reason: "unsupported-step" };
  if (tr.storedMarksSet) return { ok: false, reason: "unsupported-step" };
  const actual = tr.steps[0];
  if (Object.getPrototypeOf(actual) !== ReplaceStep4.prototype || tr.docs.length !== 1 || !tr.docs[0].eq(base.doc)) return { ok: false, reason: "unsupported-step" };
  const applied = actual.apply(base.doc);
  if (applied.failed || !applied.doc?.eq(tr.doc)) return { ok: false, reason: "unsupported-step" };
  const step = actual;
  if (step.structure) return { ok: false, reason: "unsupported-step" };
  const work = context?.work ?? emptyFileParseWork();
  const verified = context?.verified ?? prepareVerifiedFileBase(base, work);
  if ("ok" in verified) return verified;
  base = verified.verifiedBase;
  let { from, to } = step;
  let textOnly2 = true;
  step.slice.content.forEach((node) => {
    if (!node.isText) textOnly2 = false;
  });
  const owner = base.roots.find((root) => root.pmFrom <= from && root.pmTo >= to);
  if (!owner || !sourceRootHasClosedFences(owner)) return { ok: false, reason: "unsupported-step" };
  const $from = base.doc.resolve(from), $to = base.doc.resolve(to);
  if (!$from.sameParent($to) || !["paragraph", "heading", "code_block", "frontmatter", "html_block"].includes($from.parent.type.name) || to < from || step.slice.openStart || step.slice.openEnd || !textOnly2) {
    return { ok: false, reason: "unsupported-step" };
  }
  if (splitsTextAt(base.doc, from) || splitsTextAt(base.doc, to)) {
    return { ok: false, reason: "unmapped-range" };
  }
  let spans = base.textSpans.filter((span) => from === to ? span.pmFrom <= from && span.pmTo >= to : span.pmTo > from && span.pmFrom < to);
  if (!spans.length) return { ok: false, reason: "unmapped-range" };
  if (from < to && (spans[0].pmFrom > from || spans[spans.length - 1].pmTo < to || spans.some((span, i) => i > 0 && spans[i - 1].pmTo !== span.pmFrom))) {
    return { ok: false, reason: "unmapped-range" };
  }
  let insert = "";
  step.slice.content.forEach((node) => {
    insert += node.text;
  });
  const literal = ["code_block", "frontmatter", "html_block"].includes($from.parent.type.name);
  let plain = literal;
  step.slice.content.forEach((node) => {
    if (node.marks.length) plain = false;
  });
  if (plain) base.doc.nodesBetween(from, to, (node) => {
    if (node.isText && node.marks.length) plain = false;
  });
  if (plain && from < to) {
    const originalFrom = boundary(spans[0], from), originalTo = boundary(spans[spans.length - 1], to);
    if (originalFrom === void 0 || originalTo === void 0 || overlapsProtectedSource(base, originalFrom, originalTo))
      return { ok: false, reason: "unmapped-range" };
    const before = base.doc.textBetween(from, to);
    let prefix = 0, suffix = 0;
    while (prefix < before.length && prefix < insert.length && before[prefix] === insert[prefix]) prefix++;
    while (splitsSurrogate(before, prefix) || splitsSurrogate(insert, prefix)) prefix--;
    while (suffix < before.length - prefix && suffix < insert.length - prefix && before[before.length - 1 - suffix] === insert[insert.length - 1 - suffix]) suffix++;
    while (splitsSurrogate(before, before.length - suffix) || splitsSurrogate(insert, insert.length - suffix)) suffix--;
    from += prefix;
    to -= suffix;
    insert = insert.slice(prefix, insert.length - suffix);
    spans = base.textSpans.filter((span) => from === to ? span.pmFrom <= from && span.pmTo >= to : span.pmTo > from && span.pmFrom < to);
    if (!spans.length) return { ok: false, reason: "unmapped-range" };
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
  context?.verifyEdit?.({ from: sourceFrom, to: sourceTo, text: insert });
  const result = preparePreservingSourceCandidate(verified, [{
    from: sourceFrom,
    to: sourceTo,
    removed: base.source.slice(sourceFrom, sourceTo),
    text: insert
  }], work, tr.doc);
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    session: result.session,
    file: result.file,
    edit: { from: sourceFrom, to: sourceTo, text: insert }
  };
}
function applySourceTextTransaction(base, tr) {
  const result = applySourceTextTransactionWithEdit(base, tr);
  return result.ok ? { ok: true, session: result.session, file: result.file } : result;
}
var UnsupportedBlockTransaction = class extends Error {
};
var isList = (node) => node.type.name === "bullet_list" || node.type.name === "ordered_list";
function transactionListStyles(tr, facts, targets) {
  const ranges = [];
  for (const { node, pos } of targets) {
    if (tr.doc.nodeAt(pos) !== node) throw new UnsupportedBlockTransaction();
    if (isList(node)) ranges.push({ from: pos, to: pos + node.nodeSize });
    node.descendants((child, offset) => {
      if (isList(child)) ranges.push({ from: pos + 1 + offset, to: pos + 1 + offset + child.nodeSize });
    });
  }
  if (!ranges.length) return /* @__PURE__ */ new Map();
  const chainMapping = new Mapping(tr.steps.map((step) => step.getMap()));
  const relevant = (pos, size, step) => {
    const mapping = chainMapping.slice(step), from = mapping.map(pos, -1), to = mapping.map(pos + size, 1);
    return ranges.some((r2) => from < r2.to && to > r2.from);
  };
  let shells = facts.filter((f) => relevant(f.pmFrom, f.pmTo - f.pmFrom, 0)).map((f) => {
    const node = tr.before.nodeAt(f.pmFrom);
    if (!node || node.type.name !== f.kind + "_list" || node.nodeSize !== f.pmTo - f.pmFrom) throw new UnsupportedBlockTransaction();
    return { node, pos: f.pmFrom, origins: [{ kind: node.type.name, style: { marker: f.marker, tight: f.tight } }] };
  });
  let items = shells.flatMap((shell2) => {
    const result = [];
    shell2.node.forEach((node, offset) => result.push({ node, pos: shell2.pos + 1 + offset, origins: shell2.origins }));
    return result;
  });
  for (let i = 0; i < tr.steps.length; i++) {
    const after = tr.docs[i + 1] ?? tr.doc, map = tr.steps[i].getMap();
    const shellOrigins = /* @__PURE__ */ new Map(), itemOrigins = /* @__PURE__ */ new Map();
    for (const shell2 of shells) {
      const start = map.mapResult(shell2.pos, 1), end = map.mapResult(shell2.pos + shell2.node.nodeSize, -1), node = after.nodeAt(start.pos);
      if (!start.deleted && !end.deleted && !start.deletedAcross && !end.deletedAcross && node?.type === shell2.node.type && start.pos + node.nodeSize === end.pos)
        shellOrigins.set(start.pos, shell2.origins);
    }
    for (const item of items) for (const [pos, assoc] of [[item.pos + 1, 1], [item.pos + item.node.nodeSize - 1, -1]]) {
      const mapped = map.mapResult(pos, assoc);
      if (mapped.deletedAcross || mapped.deleted) continue;
      {
        const resolved = after.resolve(mapped.pos);
        for (let depth = resolved.depth; depth > 0; depth--) if (resolved.node(depth).type.name === "list_item") {
          const itemPos = resolved.before(depth), origins = itemOrigins.get(itemPos) ?? [];
          for (const origin of item.origins) if (!origins.includes(origin)) origins.push(origin);
          itemOrigins.set(itemPos, origins);
          break;
        }
      }
    }
    shells = [];
    items = [];
    after.descendants((node, pos) => {
      if (!isList(node) || !relevant(pos, node.nodeSize, i + 1)) return;
      const origins = [...shellOrigins.get(pos) ?? []];
      if (!origins.length) node.forEach((_item, offset) => {
        for (const origin of itemOrigins.get(pos + 1 + offset) ?? []) if (origin.kind === node.type.name && !origins.includes(origin)) origins.push(origin);
      });
      if (!origins.length) origins.push({ kind: node.type.name, style: { marker: node.type.name === "bullet_list" ? "-" : ".", tight: true } });
      const current = { kind: node.type.name, style: { marker: origins[0].style.marker, tight: origins.every((o) => o.style.tight) } };
      shells.push({ node, pos, origins: [current] });
      node.forEach((item, offset) => items.push({ node: item, pos: pos + 1 + offset, origins: [current] }));
    });
  }
  return new Map(shells.map((s) => [s.pos, { marker: s.origins[0].style.marker, tight: s.origins.every((o) => o.style.tight) }]));
}
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
function authorizeStepRoots(before, step, ownership, authorized, base, after) {
  const { from, to } = imageStepRange(before, step) ?? step;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > before.content.size)
    throw new UnsupportedBlockTransaction();
  const a = before.resolve(from), b = before.resolve(to);
  if (splitsInlineText(a) || splitsInlineText(b)) throw new UnsupportedBlockTransaction();
  if (step instanceof ReplaceStep4) {
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
    if (!root) {
      const covers = (e) => e.childFrom <= child && child < e.childTo;
      const known = base.gaps.some((g) => g.synthetic.some(covers)) || base.layout.blankLines.some((u) => u.role === "empty-paragraph" && covers(u.emission)) || !!base.layout.fallback && covers(base.layout.fallback.emission);
      if (step instanceof ReplaceStep4 || !known || after.childCount !== before.childCount || !before.child(child).eq(base.doc.child(child)) || !after.child(child).eq(before.child(child))) throw new UnsupportedBlockTransaction();
      continue;
    }
    authorized.add(root.id);
  }
}
function changedNaturalRoots(base, tr, ownership) {
  const authorized = /* @__PURE__ */ new Set();
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i], prototype = Object.getPrototypeOf(step);
    if (prototype !== ReplaceStep4.prototype && prototype !== AddMarkStep4.prototype && prototype !== RemoveMarkStep4.prototype && !imageStepRange(tr.docs[i], step))
      throw new UnsupportedBlockTransaction();
    const before = tr.docs[i];
    if (before.childCount !== base.doc.childCount) throw new UnsupportedBlockTransaction();
    authorizeStepRoots(before, step, ownership, authorized, base, tr.docs[i + 1] ?? tr.doc);
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
function rootRenderNode(node, pos, styles, bindings) {
  const children2 = [];
  node.forEach((child, offset) => children2.push(rootRenderNode(child, pos + 1 + offset, styles, bindings)));
  const rendered = node.isLeaf ? node : isList(node) ? node.type.create(node.attrs, Fragment4.fromArray(children2), node.marks) : node.copy(Fragment4.fromArray(children2));
  if (isList(node)) {
    const style = styles.get(pos);
    if (!style) throw new UnsupportedBlockTransaction();
    bindings.push({ node: rendered, style });
  }
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
function renderChangedRoot(base, doc2, root, styles) {
  if (overlapsProtectedSource(base, root.sourceFrom, root.sourceTo) || !renderableRoots.has(root.tokenType)) throw new UnsupportedBlockTransaction();
  if (!sourceRootHasClosedFences(root)) throw new UnsupportedBlockTransaction();
  const nodes = [], lists = [];
  doc2.forEach((node, pos, index) => {
    if (index >= root.childFrom && index < root.childTo) nodes.push(rootRenderNode(node, pos, styles, lists));
  });
  let generated = serializeSourceRootMarkdown(doc2.type.create(doc2.attrs, Fragment4.fromArray(nodes)), { lists });
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
function plainMarkBody(base, tr) {
  if (tr.steps.length !== 1) return void 0;
  const step = tr.steps[0];
  if (!(step instanceof AddMarkStep4 || step instanceof RemoveMarkStep4) || !["strong", "em"].includes(step.mark.type.name)) return void 0;
  const from = base.doc.resolve(step.from), to = base.doc.resolve(step.to);
  if (!from.sameParent(to) || !["paragraph", "heading"].includes(from.parent.type.name)) return void 0;
  const plain = (node) => {
    let ok = true;
    node.forEach((child) => {
      if (!child.isText || child.marks.some((mark) => !["strong", "em"].includes(mark.type.name))) ok = false;
    });
    return ok;
  };
  if (!plain(from.parent)) return void 0;
  if (from.parentOffset !== 0 || to.parentOffset !== from.parent.content.size) return void 0;
  const after = tr.doc.resolve(step.from), end = tr.doc.resolve(step.to);
  if (!after.sameParent(end) || from.depth !== after.depth || !plain(after.parent)) throw new UnsupportedBlockTransaction();
  for (let depth = 0; depth <= from.depth; depth++) if (!from.node(depth).sameMarkup(after.node(depth))) throw new UnsupportedBlockTransaction();
  const body = capturedInlineBodies(base.source, base.doc, base.roots, base.layout)?.find((b) => b.pmFrom === step.from && b.pmTo === step.to);
  if (!body) return void 0;
  if (!body.singlePhysicalLine || overlapsProtectedSource(base, body.sourceFrom, body.sourceTo)) throw new UnsupportedBlockTransaction();
  return { from: body.sourceFrom, to: body.sourceTo, text: serializeSourceInlineBody(after.parent) };
}
function applySourceBlockTransaction(base, tr) {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: "stale-document" };
  try {
    const work = emptyFileParseWork(), verified = prepareVerifiedFileBase(base, work);
    if ("ok" in verified) throw new UnsupportedBlockTransaction();
    base = verified.verifiedBase;
    const facts = capturedSourceLists(base.source, base.doc, base.roots, base.layout);
    if (!facts) throw new UnsupportedBlockTransaction();
    const authority = { facts };
    if (tr.docs.length !== tr.steps.length) throw new UnsupportedBlockTransaction();
    const classification = classifyTransaction(base, tr);
    for (let i = 0; i < tr.steps.length; i++) {
      const before = tr.docs[i], after = tr.docs[i + 1] ?? tr.doc;
      if (i === 0 && !before.eq(base.doc)) throw new UnsupportedBlockTransaction();
      const result = tr.steps[i].apply(before);
      if (result.failed || !result.doc || !result.doc.eq(after)) throw new UnsupportedBlockTransaction();
    }
    tr.doc.check();
    const empty2 = prepareEmptyBodyTransaction(base, tr, capturedEmptyBodies(base.source, base.doc, base.roots, base.layout) ?? []);
    if (empty2.kind === "unsupported") throw new UnsupportedBlockTransaction();
    if (empty2.kind === "ready") {
      const edits2 = [...empty2.recipe.edits], changedRoots2 = [...empty2.recipe.changedRoots];
      const parsed2 = preparePreservingSourceCandidate(verified, edits2.map((edit) => ({ ...edit, removed: base.source.slice(edit.from, edit.to) })), work, tr.doc);
      if (!parsed2.ok) return { ok: false, reason: parsed2.reason };
      return { ok: true, session: parsed2.session, file: parsed2.file, mode: "fragment-render", edits: edits2, changedRoots: changedRoots2 };
    }
    if (classification === "structural") {
      const render = (nodes, positions) => {
        const lists = [], styles2 = transactionListStyles(tr, authority.facts, nodes.map((node, i) => ({ node, pos: positions[i] }))), rendered = nodes.map((node, i) => rootRenderNode(node, positions[i], styles2, lists)), doc2 = tr.doc.type.create(tr.doc.attrs, Fragment4.fromArray(rendered));
        let ownedBlank = false, blankTerminal = false, continuationIndent;
        const text2 = serializeSourceRootMarkdown(doc2, { lists, onContinuationIndent: (indent) => {
          continuationIndent = indent;
        }, onOwnedBlank: (terminal) => {
          ownedBlank = true;
          blankTerminal = terminal;
        } }), last = rendered[rendered.length - 1];
        return {
          text: text2,
          ownedBlank,
          ...continuationIndent !== void 0 ? { continuationIndent } : {},
          terminal: last.type.name === "table" || endsInTerminalHardbreak(last) || blankTerminal ? "content-eol" : "none",
          family: last.type.name === "table" ? "table" : ["paragraph", "heading", "bullet_list", "ordered_list", "blockquote", "horizontal_rule"].includes(last.type.name) ? "flow" : "closed-literal",
          eol: "\n"
        };
      };
      const result = applyStructuralTransaction(base, tr, render, sourceRootHasClosedFences);
      if (result.unchanged) return { ...finishUnchangedFile(verified, work), mode: "unchanged", edits: [], changedRoots: [] };
      const parsed2 = prepareCandidate(verified, result.edits.map((edit) => ({ ...edit, removed: base.source.slice(edit.from, edit.to) })), work, tr.doc);
      if (!parsed2.ok) return { ok: false, reason: parsed2.reason };
      return { ok: true, session: parsed2.session, file: parsed2.file, mode: "root-render", edits: result.edits, changedRoots: result.changedRoots };
    }
    const ownership = indexSourceRoots(base);
    const changedRoots = changedNaturalRoots(base, tr, ownership);
    if (!changedRoots.length) {
      if (!tr.doc.eq(base.doc)) return { ok: false, reason: "unsupported-step" };
      return { ...finishUnchangedFile(verified, work), mode: "unchanged", edits: [], changedRoots: [] };
    }
    if (changedRoots.some((id) => !sourceRootHasClosedFences(ownership.rootById[id]))) throw new UnsupportedBlockTransaction();
    const inlineFacts2 = capturedInlineRecipeFacts(base);
    const preserving = (edits2) => {
      applySourceEdits(base, edits2, changedRoots, ownership);
      const parsed2 = preparePreservingSourceCandidate(verified, edits2.map((edit) => ({ ...edit, removed: base.source.slice(edit.from, edit.to) })), work, tr.doc);
      return parsed2.ok ? { ok: true, session: parsed2.session, file: parsed2.file, mode: "fragment-render", edits: edits2, changedRoots } : { ok: false, reason: parsed2.reason };
    };
    if (inlineFacts2 && tr.steps.length === 1 && tr.steps[0] instanceof ReplaceStep4 && base.doc.resolve(tr.steps[0].from).parent.type.name === "code_block") {
      const fence = prepareClosedFenceRecipe(base, tr, inlineFacts2);
      if (fence.ok && fence.edits.length) return preserving(fence.edits);
      if (!fence.ok && inlineFacts2.fences.some((f) => f.pmFrom === base.doc.resolve(tr.steps[0].from).before())) return fence;
    }
    let needsInline = tr.steps.length !== 1 || !(tr.steps[0] instanceof ReplaceStep4);
    if (!needsInline) {
      const step = tr.steps[0], from = base.doc.resolve(step.from);
      if (["paragraph", "heading"].includes(from.parent.type.name)) {
        if (step.from === step.to && inlineFacts2?.edges.some((e) => e.family === "link" && (e.pmFrom === step.from || e.pmTo === step.from))) needsInline = true;
        if (inlineFacts2?.atoms.some((a) => (a.node.type.name === "math_inline" || a.node.type.name === "image") && step.from < a.pmTo && step.to > a.pmFrom || a.node.type.name === "image" && step.from === step.to && (step.from === a.pmFrom || step.from === a.pmTo))) needsInline = true;
        if (inlineFacts2?.critic.some((c2) => c2.kind === "note_anchor" && step.from < c2.pmTo && step.to > c2.pmFrom)) needsInline = true;
        step.slice.content.forEach((n) => {
          if (!n.isText || !n.hasMarkup(n.type, null, step.from < step.to ? from.nodeAfter?.marks ?? from.marks() : from.marks())) needsInline = true;
        });
        if (from.marks().some((m) => m.type.name === "code") && step.slice.content.textBetween(0, step.slice.content.size).includes("`")) needsInline = true;
        const inserted = step.slice.content.textBetween(0, step.slice.content.size), to = base.doc.resolve(step.to);
        if (/[\\`*_[\]{}<>~^=&|]/.test(inserted)) needsInline = true;
        if (from.parentOffset === 0 && /^[ \t]/.test(inserted) || to.parentOffset === to.parent.content.size && /[ \t]$/.test(inserted)) needsInline = true;
      }
    }
    if (needsInline && inlineFacts2) {
      const inline = prepareInlineRecipe(base, tr, inlineFacts2);
      return inline.ok ? preserving(inline.edits) : inline;
    }
    if (tr.steps.length === 1 && tr.steps[0] instanceof ReplaceStep4) {
      const replay = EditorState2.create({ doc: base.doc }).tr.step(tr.steps[0]);
      if (!replay.doc.eq(tr.doc)) return { ok: false, reason: "unsupported-step" };
      const exact = applySourceTextTransactionWithEdit(base, replay, { verified, work, verifyEdit: (edit) => {
        applySourceEdits(base, [edit], changedRoots, ownership);
      } });
      if (exact.ok) {
        const edits2 = [exact.edit];
        return { ok: true, session: exact.session, file: exact.file, mode: "exact-text", edits: edits2, changedRoots };
      }
      if (exact.reason !== "unmapped-range" && exact.reason !== "unsupported-step") return exact;
      const step = tr.steps[0], from = base.doc.resolve(step.from), to = base.doc.resolve(step.to);
      let ordinary = true;
      step.slice.content.forEach((node) => {
        if (!node.isText || !node.hasMarkup(node.type, null, from.marks())) ordinary = false;
      });
      const supportedMarks = from.marks().every((mark) => ["strong", "em", "link", "annotation", "html_mark", "highlight", "strike_through"].includes(mark.type.name));
      if (from.sameParent(to) && ["paragraph", "heading", "code_block", "frontmatter", "html_block"].includes(from.parent.type.name) && ordinary && supportedMarks && (["code_block", "frontmatter", "html_block"].includes(from.parent.type.name) || exact.reason === "unmapped-range" || step.to - step.from <= 1 && step.slice.size <= 1)) return exact;
    }
    if (inlineFacts2) {
      const inline = prepareInlineRecipe(base, tr, inlineFacts2);
      if (inline.ok) return preserving(inline.edits);
      return inline;
    }
    const fragment = plainMarkBody(base, tr);
    if (fragment) {
      applySourceEdits(base, [fragment], changedRoots, ownership);
      const parsed2 = preparePreservingSourceCandidate(verified, [{ ...fragment, removed: base.source.slice(fragment.from, fragment.to) }], work, tr.doc);
      if (!parsed2.ok) return { ok: false, reason: parsed2.reason };
      return { ok: true, session: parsed2.session, file: parsed2.file, mode: "fragment-render", edits: [fragment], changedRoots };
    }
    const targets = [];
    tr.doc.forEach((node, pos, index) => {
      if (changedRoots.some((id) => {
        const root = ownership.rootById[id];
        return index >= root.childFrom && index < root.childTo;
      })) targets.push({ node, pos });
    });
    const styles = transactionListStyles(tr, authority.facts, targets);
    const edits = changedRoots.map((id) => {
      const root = ownership.rootById[id];
      return { from: root.sourceFrom, to: root.sourceTo, text: renderChangedRoot(base, tr.doc, root, styles) };
    });
    applySourceEdits(base, edits, changedRoots, ownership);
    const parsed = prepareCandidate(verified, edits.map((edit) => ({ ...edit, removed: base.source.slice(edit.from, edit.to) })), work, tr.doc);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    return { ok: true, session: parsed.session, file: parsed.file, mode: "root-render", edits, changedRoots };
  } catch (error) {
    if (error instanceof UnsupportedBlockTransaction || error instanceof UnsupportedSourceStructure) return { ok: false, reason: "unsupported-step" };
    return { ok: false, reason: "parse-error" };
  }
}
function prepareSourceListBoundarySteps(base, tr) {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: "stale-document" };
  try {
    classifyTransaction(base, tr);
    for (let i = 0; i < tr.steps.length; i++) {
      const result = tr.steps[i].apply(tr.docs[i]);
      if (!result.doc?.eq(tr.docs[i + 1] ?? tr.doc)) throw new UnsupportedBlockTransaction();
    }
    tr.doc.check();
    const facts = capturedSourceLists(base.source, base.doc, base.roots, base.layout);
    if (!facts) throw new UnsupportedBlockTransaction();
    const targets = [];
    tr.doc.forEach((node, pos) => targets.push({ node, pos }));
    const styles = transactionListStyles(tr, facts, targets), positions = [];
    const visit = (parent, start) => {
      parent.forEach((node, offset, index) => {
        const pos = start + offset, previous = parent.maybeChild(index - 1);
        if (previous && isList(node) && previous.type === node.type) {
          const left = styles.get(pos - previous.nodeSize), right = styles.get(pos);
          if (!left || !right) throw new UnsupportedBlockTransaction();
          if (left.marker === right.marker) positions.push(pos);
        }
        if (!node.isLeaf) visit(node, pos + 1);
      });
    };
    visit(tr.doc, 0);
    const steps = [];
    for (const pos of positions.sort((a, b) => b - a)) {
      const node = base.doc.type.schema.nodes.html_block.create(null, base.doc.type.schema.text("<!-- notemd:list-boundary -->"));
      const at = tr.doc.resolve(pos), slice = new Slice2(Fragment4.from(node), 0, 0);
      if (!at.parent.canReplace(at.index(), at.index(), slice.content)) throw new UnsupportedBlockTransaction();
      steps.push(new ReplaceStep4(pos, pos, slice));
    }
    return { ok: true, steps };
  } catch {
    return { ok: false, reason: "unsupported-step" };
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
  gfmTableCommand,
  insertHorizontalRule,
  insertImage,
  insertMathBlock,
  insertTable,
  parseMarkdown,
  parseMarkdownAsync,
  preloadEnhancementPlugins,
  prepareFileSourceEdits,
  prepareSourceListBoundarySteps,
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