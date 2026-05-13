var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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
async function renderMermaid(code) {
  await ensureMermaidLoaded();
  const result = new Promise((resolve) => {
    renderQueue = renderQueue.then(async () => {
      const id = `mermaid-${++renderCounter}`;
      try {
        const { svg } = await mermaidModule.render(id, code);
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
var mermaidApi = null;
var mermaidLoading = null;
function loadMermaidApi() {
  if (mermaidApi) return Promise.resolve(mermaidApi);
  if (mermaidLoading) return mermaidLoading;
  mermaidLoading = Promise.resolve().then(() => (init_mermaid_renderer(), mermaid_renderer_exports)).then((mod) => {
    mermaidApi = mod;
    return mermaidApi;
  });
  return mermaidLoading;
}
var themeObserverInstalled = false;
var mermaidReRenderCallbacks = /* @__PURE__ */ new Set();
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
var POPULAR_LANGUAGES = [
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
var BASE_OTHER_LANGUAGES = [
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
var POPULAR_IDS = new Set(POPULAR_LANGUAGES.map((l) => l.id));
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
var hljsAutoDetect = null;
async function getAutoDetect() {
  if (hljsAutoDetect) return hljsAutoDetect;
  try {
    const hljs = (await import("highlight.js/lib/core")).default;
    hljsAutoDetect = (code) => {
      if (!code.trim() || code.length < 10) return null;
      try {
        const result = hljs.highlightAuto(code);
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
  const text = codeEl.textContent || "";
  navigator.clipboard.writeText(text).then(() => {
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
    const code = document.createElement("code");
    code.className = "code-block-code";
    pre.appendChild(code);
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
      const codeText = code.textContent || "";
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
          if (code.textContent !== codeText) return;
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
      const source = code.textContent || "";
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
          if (code.textContent !== source) return;
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
      const codeContent = code.textContent || "";
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
      handleCopy(copyBtn, code);
    });
    return {
      dom: wrapper,
      contentDOM: code,
      stopEvent(event) {
        const target = event.target;
        return !code.contains(target) && wrapper.contains(target) && target !== code;
      },
      ignoreMutation(mutation) {
        return !code.contains(mutation.target);
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
export {
  createCodeBlockNodeViewFactory
};
//# sourceMappingURL=code-block-view.js.map