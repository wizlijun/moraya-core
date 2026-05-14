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
import { Plugin as Plugin6, PluginKey as PluginKey6 } from "prosemirror-state";
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
  return new Plugin6({
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
    highlightPluginKey = new PluginKey6("moraya-syntax-highlight");
    HLJS_CACHE_MAX = 100;
    hljsCache = /* @__PURE__ */ new Map();
  }
});

// src/plugins/emoji.ts
var emoji_exports = {};
__export(emoji_exports, {
  createEmojiPlugin: () => createEmojiPlugin
});
import { Plugin as Plugin7, PluginKey as PluginKey7 } from "prosemirror-state";
import { get as getEmoji } from "node-emoji";
function createEmojiPlugin() {
  return new Plugin7({
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
    emojiPluginKey = new PluginKey7("moraya-emoji");
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
  const observer = new MutationObserver(() => {
    if (mermaidApi) mermaidApi.updateMermaidTheme();
    for (const cb of mermaidReRenderCallbacks) cb();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });
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
function handleCopy(btn, codeEl) {
  const text2 = codeEl.textContent || "";
  navigator.clipboard.writeText(text2).then(() => {
    btn.classList.add("copied");
    btn.title = "Copied!";
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.title = "Copy";
    }, 1500);
  });
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
      handleCopy(copyBtn, code2);
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
    spreadsheet,
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

// src/markdown.ts
import { MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";
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
  caret_highlight: { mark: "highlight", attrs: { delimiter: "caret" } }
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
function serializeMarkdown(doc2) {
  let result = serializer.serialize(doc2, { tightLists: true });
  result = result.replace(/\\\[([^\\\[\]]*)\\\]\(([^)]*)\)/g, "[$1]($2)");
  result = result.replace(/​/g, "");
  return result;
}

// src/setup.ts
import {
  AllSelection as AllSelection2,
  EditorState,
  NodeSelection,
  Plugin as Plugin8,
  PluginKey as PluginKey8,
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
function getMarkRange(state, pos, markType2) {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const base = $pos.start();
  const runs = [];
  let runFrom = -1;
  let nodePos = base;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childEnd = nodePos + child.nodeSize;
    if (markType2.isInSet(child.marks)) {
      if (runFrom === -1) runFrom = nodePos;
    } else {
      if (runFrom !== -1) {
        runs.push({ from: runFrom, to: nodePos });
        runFrom = -1;
      }
    }
    nodePos = childEnd;
  }
  if (runFrom !== -1) runs.push({ from: runFrom, to: nodePos });
  return runs.find((r2) => pos >= r2.from && pos < r2.to) ?? null;
}
function buildDecorations(state) {
  const { selection } = state;
  if (!selection.empty) return DecorationSet.empty;
  const $from = selection.$from;
  const decorations = [];
  const pos = $from.pos;
  const depth = $from.depth;
  const parent = $from.parent;
  if (parent.type === state.schema.nodes.heading) {
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
  for (let d = depth - 1; d >= 1; d--) {
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
    const range = getMarkRange(state, pos, markType2);
    if (!range) continue;
    let openStr = delim.open;
    let closeStr = delim.close;
    if (markName === "highlight") {
      const hMark = state.doc.resolve(pos).marks().find((m) => m.type === markType2);
      if (hMark?.attrs?.delimiter === "equals") {
        openStr = "==";
        closeStr = "==";
      }
    }
    decorations.push(
      Decoration.widget(range.from, makeWidget(openStr, "syntax-md-mark"), {
        side: -1,
        key: `${markName}-open`
      }),
      Decoration.widget(range.to, makeWidget(closeStr, "syntax-md-mark"), {
        side: 1,
        key: `${markName}-close`
      })
    );
  }
  return DecorationSet.create(state.doc, decorations);
}
function createCursorSyntaxPlugin() {
  return new Plugin2({
    key: pluginKey,
    state: {
      init(_, state) {
        return buildDecorations(state);
      },
      apply(tr, old, _, newState) {
        if (!tr.selectionSet && !tr.docChanged) return old;
        return buildDecorations(newState);
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
function createInlineCodeConvertPlugin() {
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
      const oldMatches = findCodePatternsInBlock(oldState, oldPos);
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
  return new Plugin8({
    key: new PluginKey8("moraya-image-selection"),
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
function buildInputRules(schema2, tier1) {
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
  if (M.strong) {
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
  if (M.em) {
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
  if (M.code) {
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
  if (M.strike_through) {
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
  if (M.highlight) {
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
  return new Plugin8({
    key: new PluginKey8("moraya-dirty-track"),
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
  return new Plugin8({
    key: new PluginKey8("moraya-lazy-change"),
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
    new Plugin8({
      key: new PluginKey8("moraya-list-shortcuts"),
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
    buildInputRules(schema2, tier1),
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
  plugins.push(createCursorSyntaxPlugin());
  plugins.push(createLinkTextPlugin());
  plugins.push(createInlineCodeConvertPlugin());
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
export {
  createDocCache,
  createEditor,
  createEditorPlugins,
  createSchema,
  djb2Hash,
  getDocumentBaseDir,
  insertHorizontalRule,
  insertImage,
  insertMathBlock,
  insertTable,
  parseMarkdown,
  parseMarkdownAsync,
  preloadEnhancementPlugins,
  serializeMarkdown,
  setDocumentBaseDir,
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
  toggleStrikethrough
};
//# sourceMappingURL=index.js.map