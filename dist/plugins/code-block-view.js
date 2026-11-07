// src/plugins/code-block-view.ts
import { TextSelection as TextSelection2 } from "prosemirror-state";

// src/plugins/diagram-interaction.ts
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
var diagramLabels = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reset: "Restore default size (100%)",
  fit: "Fit diagram",
  panLeft: "Move left",
  panRight: "Move right",
  panUp: "Move up",
  panDown: "Move down",
  region: "Diagram viewer",
  hint: "Scroll or pinch to zoom; drag to move",
  preview: "Preview",
  edit: "Code",
  copy: "Copy"
};
var stateKey = new PluginKey("moraya-diagram-view");
var attachmentChecks = /* @__PURE__ */ new WeakMap();
var fallbackSnapshots = /* @__PURE__ */ new WeakMap();
function diagramSnapshot(view, pos, source, language) {
  let snapshots = stateKey.getState(view.state);
  if (!snapshots) {
    snapshots = fallbackSnapshots.get(view);
    if (!snapshots) fallbackSnapshots.set(view, snapshots = /* @__PURE__ */ new Map());
  }
  const existing = snapshots.get(pos);
  if (existing?.source === source && existing.language === language) return existing;
  const snapshot = { source, language, scale: 1, x: 0, y: 0 };
  snapshots.set(pos, snapshot);
  return snapshot;
}
var routers = /* @__PURE__ */ new WeakMap();
function scrollRoot(el) {
  let parent = el.parentElement;
  while (parent) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
    parent = parent.parentElement;
  }
  return el.parentElement ?? el;
}
function hit(el, e) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
}
function registerWheel(root, target) {
  let router = routers.get(root);
  if (!router) {
    router = { targets: /* @__PURE__ */ new Set(), last: -Infinity, owner: null, handler: () => {
    }, dispose: () => {
    } };
    const current = router;
    let gestureActive = false, gestureOwner = null, gestureTail = 0;
    const gestureStart = (e) => {
      gestureActive = true;
      gestureOwner = [...current.targets].find((t) => hit(t.viewport, e) || t.viewport.contains(e.target)) ?? null;
      if (gestureOwner && e.cancelable) {
        e.preventDefault();
        gestureOwner.gestureStart(e);
      } else gestureOwner = null;
    };
    const gestureChange = (e) => {
      if (!gestureActive || !gestureOwner || !e.cancelable) return;
      e.preventDefault();
      gestureOwner.gestureChange(e);
    };
    const gestureEnd = (e) => {
      if (!gestureActive) return;
      if (gestureOwner) {
        if (e.cancelable) e.preventDefault();
        gestureOwner.gestureEnd(e);
      }
      gestureActive = false;
      gestureTail = performance.now() + 150;
    };
    const blur = () => {
      gestureActive = false;
      gestureOwner = null;
      gestureTail = 0;
      current.last = -Infinity;
      current.owner = null;
    };
    root.addEventListener("gesturestart", gestureStart, { capture: true, passive: false });
    root.addEventListener("gesturechange", gestureChange, { capture: true, passive: false });
    root.addEventListener("gestureend", gestureEnd, { capture: true, passive: false });
    window.addEventListener("blur", blur);
    router.dispose = () => {
      root.removeEventListener("gesturestart", gestureStart, true);
      root.removeEventListener("gesturechange", gestureChange, true);
      root.removeEventListener("gestureend", gestureEnd, true);
      window.removeEventListener("blur", blur);
    };
    router.handler = (e) => {
      if (!e.deltaY) return;
      const now = performance.now();
      if (gestureActive || now < gestureTail) {
        if (gestureOwner && e.cancelable) e.preventDefault();
        return;
      }
      if (now - current.last > 150) current.owner = [...current.targets].find((t) => hit(t.viewport, e)) ?? null;
      current.last = now;
      const owner = current.owner;
      if (!owner) return;
      if (!e.cancelable) return;
      e.preventDefault();
      if (current.targets.has(owner) && hit(owner.viewport, e) && !owner.nativeActive()) owner.wheel(e);
    };
    root.addEventListener("wheel", router.handler, { capture: true, passive: false });
    routers.set(root, router);
  }
  router.targets.add(target);
  return () => {
    router.targets.delete(target);
    if (!router.targets.size) {
      root.removeEventListener("wheel", router.handler, true);
      router.dispose();
      routers.delete(root);
    }
  };
}
function createDiagramController(args) {
  const { preview, wrapper, toolbar, toolbarRight, view, getPos, snapshot, labels } = args;
  const originalStyle = preview.getAttribute("style");
  const layer = document.createElement("div");
  layer.className = "diagram-transform";
  while (preview.firstChild) layer.appendChild(preview.firstChild);
  preview.appendChild(layer);
  preview.classList.add("diagram-viewport");
  preview.dataset.diagramInteraction = "";
  preview.tabIndex = 0;
  preview.setAttribute("role", "region");
  preview.setAttribute("aria-label", labels.region);
  preview.title = labels.hint;
  Object.assign(preview.style, { display: "block", position: "relative", overflow: "hidden", padding: "0", marginLeft: "24px", marginRight: "24px", touchAction: "none", minHeight: "0" });
  Object.assign(layer.style, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0" });
  wrapper.classList.add("diagram-interactive");
  const controls = document.createElement("div");
  controls.className = "diagram-controls";
  controls.dataset.diagramInteraction = "";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", labels.region);
  toolbarRight.prepend(controls);
  const status = document.createElement("span");
  status.className = "diagram-status";
  status.setAttribute("aria-live", "polite");
  Object.assign(status.style, { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)" });
  controls.appendChild(status);
  let dead = false, frame = 0, activeTimer;
  let width = snapshot.width ?? 0, height = snapshot.height ?? 0, naturalWidth = snapshot.naturalWidth ?? 0, naturalHeight = snapshot.naturalHeight ?? 0, fit = 1;
  let native = false, nativeUntil = 0, nativeScale = 1;
  let pointer;
  let suppressClick = false;
  let lastPoint;
  const cleanup = [];
  function on(el, event, handler, options) {
    el.addEventListener(event, handler, options);
    cleanup.push(() => el.removeEventListener(event, handler, options));
  }
  const buttons = {};
  function button(key, text, label, action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `diagram-control diagram-${key}`;
    b.textContent = text;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
    });
    controls.appendChild(b);
    buttons[key] = b;
  }
  const minimum = () => Math.min(0.5, fit);
  function constrain() {
    snapshot.scale = Math.max(minimum(), Math.min(4, snapshot.scale));
    const w = naturalWidth * snapshot.scale, h = naturalHeight * snapshot.scale;
    snapshot.x = w <= width ? (width - w) / 2 : Math.min(0, Math.max(width - w, snapshot.x));
    snapshot.y = h <= height ? (height - h) / 2 : Math.min(0, Math.max(height - h, snapshot.y));
  }
  function draw() {
    frame = 0;
    if (dead) return;
    constrain();
    layer.style.transform = `translate(${snapshot.x}px, ${snapshot.y}px) scale(${snapshot.scale})`;
    const percent = `${Math.round(snapshot.scale * 100)}%`;
    buttons["zoom-reset"].textContent = percent;
    buttons["zoom-reset"].setAttribute("aria-label", `${labels.reset}: ${percent}`);
    buttons["zoom-out"].disabled = snapshot.scale <= minimum() + 1e-6;
    buttons["zoom-in"].disabled = snapshot.scale >= 4 - 1e-6;
    buttons["pan-left"].disabled = snapshot.x >= 0;
    buttons["pan-right"].disabled = snapshot.x <= width - naturalWidth * snapshot.scale;
    buttons["pan-up"].disabled = snapshot.y >= 0;
    buttons["pan-down"].disabled = snapshot.y <= height - naturalHeight * snapshot.scale;
    preview.style.cursor = pointer?.dragged ? "grabbing" : naturalWidth * snapshot.scale > width || naturalHeight * snapshot.scale > height ? "grab" : "";
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function activity() {
    wrapper.classList.add("diagram-gesture-active");
    clearTimeout(activeTimer);
    activeTimer = setTimeout(() => {
      if (!dead) {
        wrapper.classList.remove("diagram-gesture-active");
        status.textContent = `${Math.round(snapshot.scale * 100)}%`;
      }
    }, 250);
  }
  function zoom(next, x = width / 2, y = height / 2) {
    next = Math.max(minimum(), Math.min(4, next));
    const ratio = next / snapshot.scale;
    snapshot.x = x - (x - snapshot.x) * ratio;
    snapshot.y = y - (y - snapshot.y) * ratio;
    snapshot.scale = next;
    constrain();
    schedule();
    activity();
  }
  function reset(scale) {
    snapshot.scale = scale;
    snapshot.x = (width - naturalWidth * scale) / 2;
    snapshot.y = scale === 1 && naturalHeight > height ? 0 : (height - naturalHeight * scale) / 2;
    constrain();
    schedule();
    activity();
  }
  function pan(x, y) {
    snapshot.x += x;
    snapshot.y += y;
    constrain();
    schedule();
    activity();
  }
  button("zoom-out", "\u2212", labels.zoomOut, () => zoom(snapshot.scale / 1.25));
  button("zoom-reset", "100%", labels.reset, () => reset(1));
  button("zoom-in", "+", labels.zoomIn, () => zoom(snapshot.scale * 1.25));
  button("zoom-fit", "\u2922", labels.fit, () => reset(fit));
  button("pan-left", "\u2190", labels.panLeft, () => pan(40, 0));
  button("pan-right", "\u2192", labels.panRight, () => pan(-40, 0));
  button("pan-up", "\u2191", labels.panUp, () => pan(0, 40));
  button("pan-down", "\u2193", labels.panDown, () => pan(0, -40));
  let root = scrollRoot(view.dom);
  let unregisterWheel;
  function refresh() {
    if (dead) return;
    if (!preview.isConnected) {
      finishPointer();
      native = false;
      unregisterWheel?.();
      unregisterWheel = void 0;
      return;
    }
    const nextRoot = scrollRoot(view.dom);
    if (nextRoot !== root || !unregisterWheel) {
      unregisterWheel?.();
      observer?.unobserve(root);
      root = nextRoot;
      unregisterWheel = registerWheel(root, wheelTarget);
      observer?.observe(root);
    }
    const previousW = width, previousH = height, previousNaturalW = naturalWidth, previousNaturalH = naturalHeight;
    width = preview.clientWidth || Math.max(1, wrapper.clientWidth - 48);
    layer.style.transform = "none";
    layer.style.width = `${width}px`;
    const svg = layer.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    naturalWidth = rect.width || svg.viewBox?.baseVal?.width || Number(svg.getAttribute("width")) || width;
    naturalHeight = rect.height || svg.viewBox?.baseVal?.height || Number(svg.getAttribute("height")) || 60;
    layer.style.width = `${naturalWidth}px`;
    const rootRect = root.getBoundingClientRect();
    const visible = Math.max(1, Math.min(rootRect.bottom || innerHeight, innerHeight) - Math.max(0, rootRect.top));
    height = Math.max(1, Math.min(naturalHeight, Math.min(560, visible * 0.7) - toolbar.getBoundingClientRect().height));
    preview.style.height = `${height}px`;
    fit = Math.min(1, width / naturalWidth, height / naturalHeight);
    if (previousW > 0 && previousNaturalW > 0) {
      snapshot.x = width / 2 - (previousW / 2 - snapshot.x) / (previousNaturalW * snapshot.scale) * naturalWidth * snapshot.scale;
      snapshot.y = height / 2 - (previousH / 2 - snapshot.y) / (previousNaturalH * snapshot.scale) * naturalHeight * snapshot.scale;
    } else if (snapshot.scale === 1 && snapshot.x === 0 && snapshot.y === 0) {
      snapshot.x = (width - naturalWidth) / 2;
      snapshot.y = naturalHeight > height ? 0 : (height - naturalHeight) / 2;
    }
    snapshot.width = width;
    snapshot.height = height;
    snapshot.naturalWidth = naturalWidth;
    snapshot.naturalHeight = naturalHeight;
    draw();
  }
  function point(e) {
    const r = preview.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const wheelTarget = {
    viewport: preview,
    nativeActive: () => native || performance.now() < nativeUntil,
    wheel(e) {
      const p = point(e);
      lastPoint = p;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1);
      zoom(snapshot.scale * Math.exp(-Math.max(-120, Math.min(120, delta)) * 2e-3), p.x, p.y);
    },
    gestureStart,
    gestureChange,
    gestureEnd
  };
  function finishPointer() {
    if (pointer) {
      const ended = pointer;
      suppressClick = ended.dragged;
      pointer = void 0;
      if (preview.hasPointerCapture?.(ended.id)) preview.releasePointerCapture(ended.id);
      schedule();
    }
  }
  on(preview, "focus", () => {
    const pos = getPos();
    if (view.editable && pos !== void 0) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)).setMeta("addToHistory", false));
  });
  on(preview, "pointerdown", ((event) => {
    const e = event;
    if (e.button !== 0) return;
    suppressClick = false;
    preview.focus({ preventScroll: true });
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, dragged: false };
  }));
  on(preview, "pointermove", ((event) => {
    const e = event;
    lastPoint = point(e);
    if (!pointer || pointer.id !== e.pointerId) return;
    if (!pointer.dragged && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 4 && (naturalWidth * snapshot.scale > width || naturalHeight * snapshot.scale > height)) {
      pointer.dragged = true;
      preview.setPointerCapture?.(e.pointerId);
    }
    if (pointer.dragged) {
      e.preventDefault();
      pan(e.clientX - pointer.x, e.clientY - pointer.y);
    }
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }));
  on(window, "pointerup", finishPointer);
  on(window, "pointercancel", finishPointer);
  on(window, "blur", () => {
    finishPointer();
    native = false;
  });
  on(preview, "lostpointercapture", finishPointer);
  on(preview, "click", ((event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }
  }), { capture: true });
  on(preview, "dragstart", (e) => e.preventDefault());
  on(preview, "mousedown", (e) => e.preventDefault());
  function exitViewer() {
    finishPointer();
    native = false;
    const pos = getPos(), node = pos === void 0 ? void 0 : view.state.doc.nodeAt(pos);
    if (view.editable && pos !== void 0 && node) {
      const after = TextSelection.findFrom(view.state.doc.resolve(pos + node.nodeSize), 1, true);
      const before = TextSelection.findFrom(view.state.doc.resolve(pos), -1, true);
      view.dispatch(view.state.tr.setSelection(after || before || TextSelection.create(view.state.doc, pos + 1)).setMeta("addToHistory", false));
    }
    view.focus();
  }
  on(toolbar, "keydown", ((event) => {
    const e = event;
    if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229 && !view.composing && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      exitViewer();
    }
  }));
  on(preview, "keydown", ((event) => {
    const e = event;
    if (e.target !== preview || e.defaultPrevented || e.isComposing || e.keyCode === 229 || view.composing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") zoom(snapshot.scale * 1.25);
    else if (e.key === "-") zoom(snapshot.scale / 1.25);
    else if (e.key === "0") reset(1);
    else if (e.key === "ArrowLeft") pan(40, 0);
    else if (e.key === "ArrowRight") pan(-40, 0);
    else if (e.key === "ArrowUp") pan(0, 40);
    else if (e.key === "ArrowDown") pan(0, -40);
    else if (e.key === "Escape") {
      exitViewer();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }));
  function gestureStart(_event) {
    native = true;
    nativeScale = snapshot.scale;
    activity();
  }
  function gestureChange(event) {
    if (!native) return;
    const e = event;
    const r = preview.getBoundingClientRect();
    const x = typeof e.clientX === "number" && e.clientX >= r.left && e.clientX <= r.right ? e.clientX - r.left : lastPoint?.x ?? width / 2;
    const y = typeof e.clientY === "number" && e.clientY >= r.top && e.clientY <= r.bottom ? e.clientY - r.top : lastPoint?.y ?? height / 2;
    if (e.scale > 0 && Number.isFinite(e.scale)) zoom(nativeScale * e.scale, x, y);
  }
  function gestureEnd(_event) {
    native = false;
    nativeUntil = performance.now() + 150;
    activity();
  }
  let observer;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => refresh());
    observer.observe(wrapper);
    observer.observe(toolbar);
    observer.observe(root);
  }
  on(window, "resize", refresh);
  let checks = attachmentChecks.get(view);
  if (!checks) attachmentChecks.set(view, checks = /* @__PURE__ */ new Set());
  const checkAttachment = () => {
    if (!preview.isConnected || root !== scrollRoot(view.dom) || !unregisterWheel) refresh();
  };
  checks.add(checkAttachment);
  cleanup.push(() => {
    checks.delete(checkAttachment);
    if (!checks.size) attachmentChecks.delete(view);
  });
  refresh();
  return {
    refresh,
    originalSize(svg) {
      if (!layer.contains(svg)) return;
      return { width: naturalWidth, height: naturalHeight };
    },
    destroy() {
      dead = true;
      finishPointer();
      unregisterWheel?.();
      cancelAnimationFrame(frame);
      clearTimeout(activeTimer);
      observer?.disconnect();
      for (const clean of cleanup) clean();
      controls.remove();
      wrapper.classList.remove("diagram-interactive", "diagram-gesture-active");
      preview.classList.remove("diagram-viewport");
      delete preview.dataset.diagramInteraction;
      preview.removeAttribute("tabindex");
      preview.removeAttribute("role");
      preview.removeAttribute("aria-label");
      preview.removeAttribute("title");
      if (originalStyle === null) preview.removeAttribute("style");
      else preview.setAttribute("style", originalStyle);
      while (layer.firstChild) preview.insertBefore(layer.firstChild, layer);
      layer.remove();
    }
  };
}

// src/plugins/code-block-view.ts
var mermaidLoads = /* @__PURE__ */ new WeakMap();
function loadMermaidApi(loader) {
  const cached = mermaidLoads.get(loader);
  if (cached) return cached;
  const promise = Promise.resolve().then(loader).catch((error) => {
    mermaidLoads.delete(loader);
    throw error;
  });
  mermaidLoads.set(loader, promise);
  return promise;
}
var themeObserverInstalled = false;
var mermaidReRenderCallbacks = /* @__PURE__ */ new Set();
function installThemeObserver() {
  if (themeObserverInstalled) return;
  themeObserverInstalled = true;
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  const notifyThemeChange = () => {
    for (const cb of mermaidReRenderCallbacks) cb();
  };
  const observer = new MutationObserver(notifyThemeChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
    subtree: true
  });
  if (typeof window !== "undefined" && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", notifyThemeChange);
  }
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
function markCopied(btn) {
  btn.classList.add("copied");
  btn.title = "Copied!";
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.title = "Copy";
  }, 1500);
}
function handleCopy(btn, codeEl) {
  const text = codeEl.textContent || "";
  navigator.clipboard.writeText(text).then(() => markCopied(btn));
}
function resolveBackground(el) {
  const bg = getComputedStyle(el).backgroundColor;
  if (!bg || bg === "transparent" || /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg)) {
    return "#ffffff";
  }
  return bg;
}
async function svgToPngBlob(svg, background, originalSize) {
  const scale = 2;
  let w = 0;
  let h = 0;
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    w = vb.width;
    h = vb.height;
  } else {
    const rect = originalSize ?? svg.getBoundingClientRect();
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
function copyPreviewAsImage(btn, preview, codeEl, controller) {
  const svg = preview.querySelector("svg");
  const canWriteImage = typeof ClipboardItem !== "undefined" && !!navigator.clipboard && typeof navigator.clipboard.write === "function";
  if (!svg || !canWriteImage) {
    handleCopy(btn, codeEl);
    return;
  }
  const blobPromise = svgToPngBlob(svg, resolveBackground(preview), controller?.originalSize(svg));
  navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]).then(() => markCopied(btn)).catch(() => handleCopy(btn, codeEl));
}
function createCodeBlockNodeViewFactory(opts = {}) {
  const { rendererRegistry, mermaidLoader, diagramInteraction } = opts;
  const labels = { ...diagramLabels, ...typeof diagramInteraction === "object" ? diagramInteraction.labels : {} };
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
    copyBtn.title = diagramInteraction ? labels.copy : "Copy";
    copyBtn.setAttribute("aria-label", copyBtn.title);
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
    let isMermaid = Boolean(mermaidLoader) && node.attrs.language === "mermaid";
    let loadedApi;
    let destroyed = false, renderGeneration = 0;
    let resizeObserver;
    let contentWidth = 0;
    let lastRenderedCode = "";
    let renderTimer = null;
    let isRenderer = node.attrs.language !== "mermaid" && rendererLangIds.has(node.attrs.language || "");
    let rendererEditing = false;
    let lastRendererCode = "";
    let rendererTimer = null;
    let currentRendererModule = null;
    let currentRendererContainer = null;
    let rendererGeneration = 0;
    const pendingRenderers = /* @__PURE__ */ new Set();
    function disposePendingRenderer(pending, settled = false) {
      if (pending.finalized || pending.disposed && !settled) return;
      pending.disposed = true;
      pending.finalized = settled;
      if (pending.started) {
        try {
          pending.module?.destroy?.(pending.output);
        } catch {
        }
      }
      pending.staging.remove();
      pendingRenderers.delete(pending);
    }
    function disposePendingRenderers() {
      for (const pending of pendingRenderers) disposePendingRenderer(pending);
    }
    let diagram;
    let focusPreviewAfterRender = false;
    const canInteract = () => Boolean(diagramInteraction) && (isMermaid || ["dot", "graphviz"].includes(String(node.attrs.language)));
    function clearDiagram() {
      diagram?.destroy();
      diagram = void 0;
    }
    function bindDiagram(preview) {
      if (!canInteract() || destroyed || !preview.querySelector("svg")) return;
      clearDiagram();
      const pos = getPos();
      if (pos === void 0) return;
      diagram = createDiagramController({
        preview,
        wrapper,
        toolbar,
        toolbarRight,
        view,
        getPos,
        snapshot: diagramSnapshot(view, pos, node.textContent, String(node.attrs.language)),
        labels
      });
      if (focusPreviewAfterRender) {
        focusPreviewAfterRender = false;
        if (document.activeElement === toggleBtn) preview.focus({ preventScroll: true });
      }
    }
    function focusCode() {
      const pos = getPos();
      if (view.editable && pos !== void 0) view.dispatch(view.state.tr.setSelection(TextSelection2.create(view.state.doc, pos + 1)).setMeta("addToHistory", false));
      view.focus();
    }
    function disposeRenderer() {
      if (currentRendererContainer) {
        try {
          currentRendererModule?.destroy?.(currentRendererContainer);
        } catch {
        }
      }
      currentRendererModule = null;
      currentRendererContainer = null;
    }
    toolbar.addEventListener("focusin", () => {
      if (!diagram || !view.editable) return;
      const pos = getPos();
      if (pos !== void 0) view.dispatch(view.state.tr.setSelection(TextSelection2.create(view.state.doc, pos + 1)).setMeta("addToHistory", false));
    });
    function disconnectMermaidResize() {
      resizeObserver?.disconnect();
      resizeObserver = void 0;
    }
    function observeMermaidWidth() {
      if (resizeObserver) return;
      const style = getComputedStyle(wrapper);
      contentWidth = Math.max(0, wrapper.getBoundingClientRect().width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0));
      if (typeof ResizeObserver === "undefined") return;
      resizeObserver = new ResizeObserver((entries) => {
        if (destroyed || !isMermaid || isEditing) return;
        const width = entries.find((entry) => entry.target === wrapper)?.contentRect.width;
        if (width === void 0 || !Number.isFinite(width) || width <= 0 || width === contentWidth) return;
        contentWidth = width;
        lastRenderedCode = "";
        triggerMermaidRender();
      });
      resizeObserver.observe(wrapper);
    }
    function syncMermaidMode() {
      if (canInteract()) toolbar.dataset.diagramInteraction = "";
      else delete toolbar.dataset.diagramInteraction;
      const showPreview = isMermaid && !isEditing;
      if (!showPreview) {
        clearDiagram();
        disconnectMermaidResize();
      }
      pre.style.display = showPreview || isRenderer && !rendererEditing ? "none" : "";
      mermaidPreview.style.display = showPreview ? diagram ? "block" : "flex" : "none";
      toggleBtn.style.display = isMermaid || isRenderer ? "inline-flex" : "none";
      wrapper.classList.toggle("mermaid-preview-mode", showPreview);
      if (isMermaid) {
        toggleBtn.textContent = diagramInteraction ? isEditing ? labels.preview : labels.edit : isEditing ? "\u{1F441} Preview" : "\u270F\uFE0F Edit";
        if (showPreview) triggerMermaidRender();
      }
    }
    function failMermaid(message) {
      clearDiagram();
      disconnectMermaidResize();
      lastRenderedCode = "";
      isEditing = true;
      pre.style.display = "";
      wrapper.classList.remove("mermaid-preview-mode");
      toggleBtn.textContent = diagramInteraction ? labels.preview : "\u{1F441} Preview";
      mermaidPreview.style.display = "flex";
      mermaidPreview.innerHTML = `<div class="mermaid-error">${escapeText(message)}</div>`;
    }
    function triggerMermaidRender() {
      if (destroyed || !isMermaid || !mermaidLoader) return;
      const codeText = node.textContent;
      if (codeText === lastRenderedCode && codeText.trim()) return;
      const generation = ++renderGeneration;
      if (renderTimer) clearTimeout(renderTimer);
      if (!codeText.trim()) {
        clearDiagram();
        mermaidPreview.innerHTML = '<div class="mermaid-empty">Empty diagram</div>';
        lastRenderedCode = "";
        return;
      }
      lastRenderedCode = codeText;
      const valid = () => !destroyed && isMermaid && !isEditing && generation === renderGeneration && node.textContent === codeText;
      renderTimer = setTimeout(async () => {
        if (!valid()) return;
        clearDiagram();
        mermaidPreview.innerHTML = '<div class="mermaid-loading"><div class="mermaid-spinner"></div>Loading diagram...</div>';
        try {
          const api = await loadMermaidApi(mermaidLoader);
          if (!valid()) return;
          loadedApi = api;
          const responsive = "supportsResponsiveLayout" in api && api.supportsResponsiveLayout;
          if (responsive) {
            observeMermaidWidth();
            if (!Number.isFinite(contentWidth) || contentWidth <= 0) {
              lastRenderedCode = "";
              return;
            }
          }
          const result = responsive ? await api.renderMermaid(codeText, { maxWidth: contentWidth, container: mermaidPreview }) : await api.renderMermaid(codeText);
          if (!valid()) return;
          if ("svg" in result) {
            mermaidPreview.innerHTML = result.svg;
            bindDiagram(mermaidPreview);
          } else failMermaid(result.error);
        } catch {
          if (valid()) failMermaid("Render failed \u2014 try Preview again");
        }
      }, 150);
    }
    function syncRendererMode() {
      if (canInteract()) toolbar.dataset.diagramInteraction = "";
      else delete toolbar.dataset.diagramInteraction;
      const showPreview = isRenderer && !rendererEditing;
      if (!showPreview) clearDiagram();
      pre.style.display = showPreview || isMermaid && !isEditing ? "none" : "";
      rendererPreview.style.display = showPreview ? "block" : "none";
      toggleBtn.style.display = isMermaid || isRenderer ? "inline-flex" : "none";
      wrapper.classList.toggle("renderer-preview-mode", showPreview);
      if (isRenderer) {
        toggleBtn.textContent = diagramInteraction ? rendererEditing ? labels.preview : labels.edit : rendererEditing ? "\u{1F441} Preview" : "\u270F\uFE0F Edit";
        if (showPreview) triggerRendererRender();
      }
    }
    function triggerRendererRender() {
      const source = node.textContent;
      const lang = node.attrs.language || "";
      if (destroyed || rendererEditing || !rendererRegistry || !rendererRegistry.has(lang)) return;
      if (source === lastRendererCode && source.trim()) {
        if (!diagram && currentRendererContainer) bindDiagram(rendererPreview);
        return;
      }
      const generation = ++rendererGeneration;
      disposePendingRenderers();
      if (rendererTimer) clearTimeout(rendererTimer);
      if (!source.trim()) {
        clearDiagram();
        disposeRenderer();
        rendererPreview.innerHTML = '<div class="renderer-empty">Empty block</div>';
        lastRendererCode = "";
        return;
      }
      lastRendererCode = source;
      const valid = () => !destroyed && !rendererEditing && isRenderer && generation === rendererGeneration && node.attrs.language === lang && node.textContent === source;
      rendererTimer = setTimeout(async () => {
        if (!valid()) return;
        clearDiagram();
        disposeRenderer();
        rendererPreview.innerHTML = '<div class="renderer-loading"><div class="renderer-spinner"></div>Rendering...</div>';
        let module;
        const staging = document.createElement("div");
        const output = document.createElement("div");
        staging.appendChild(output);
        const pending = { output, staging, started: false, disposed: false, finalized: false };
        pendingRenderers.add(pending);
        output.className = "renderer-content";
        try {
          module = await rendererRegistry.load(lang);
          if (!valid() || pending.disposed) {
            disposePendingRenderer(pending, true);
            return;
          }
          pending.module = module;
          Object.assign(staging.style, { position: "absolute", left: "0", top: "0", visibility: "hidden", pointerEvents: "none", width: `${rendererPreview.clientWidth || wrapper.clientWidth}px` });
          wrapper.appendChild(staging);
          pending.started = true;
          await module.render(source, output);
          if (!valid() || pending.disposed) {
            disposePendingRenderer(pending, true);
            return;
          }
          pendingRenderers.delete(pending);
          rendererPreview.replaceChildren(output);
          staging.remove();
          currentRendererModule = module;
          currentRendererContainer = output;
          bindDiagram(rendererPreview);
        } catch (e) {
          disposePendingRenderer(pending, true);
          if (!valid()) return;
          lastRendererCode = "";
          rendererPreview.innerHTML = `<div class="renderer-error" data-language="${escapeText(lang)}" data-error="${escapeText(String(e))}">[Renderer ${escapeText(lang)} failed]</div>`;
        }
      }, 150);
    }
    function onThemeChange() {
      if (destroyed) return;
      loadedApi?.updateMermaidTheme();
      if (isMermaid && !isEditing) {
        lastRenderedCode = "";
        triggerMermaidRender();
      }
    }
    if (isMermaid) {
      installThemeObserver();
      mermaidReRenderCallbacks.add(onThemeChange);
      requestAnimationFrame(() => {
        if (!destroyed) syncMermaidMode();
      });
    } else if (isRenderer) {
      syncRendererMode();
      requestAnimationFrame(() => {
        if (!destroyed) syncRendererMode();
      });
    } else {
      syncMermaidMode();
    }
    let activePicker = null;
    langLabel.addEventListener("mousedown", (e) => {
      if (!view.editable) return;
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
    toggleBtn.addEventListener("mousedown", (e) => e.preventDefault());
    toggleBtn.addEventListener(diagramInteraction ? "click" : "mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMermaid) {
        isEditing = !isEditing;
        focusPreviewAfterRender = Boolean(diagramInteraction) && !isEditing;
        if (focusPreviewAfterRender) toggleBtn.focus({ preventScroll: true });
        if (isEditing) {
          renderGeneration++;
          lastRenderedCode = "";
        }
        syncMermaidMode();
      } else if (isRenderer) {
        rendererEditing = !rendererEditing;
        focusPreviewAfterRender = Boolean(diagramInteraction) && !rendererEditing;
        if (focusPreviewAfterRender) toggleBtn.focus({ preventScroll: true });
        if (rendererEditing) {
          rendererGeneration++;
          disposePendingRenderers();
          if (!currentRendererContainer) lastRendererCode = "";
        }
        syncRendererMode();
      }
      if (isEditing || rendererEditing) {
        if (diagramInteraction) focusCode();
        else view.focus();
      }
    });
    mermaidPreview.addEventListener("mousedown", (e) => {
      if (canInteract()) return;
      e.preventDefault();
      e.stopPropagation();
      isEditing = true;
      renderGeneration++;
      lastRenderedCode = "";
      syncMermaidMode();
      view.focus();
    });
    copyBtn.addEventListener("mousedown", (e) => e.preventDefault());
    copyBtn.addEventListener(diagramInteraction ? "click" : "mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMermaid && !isEditing) {
        copyPreviewAsImage(copyBtn, mermaidPreview, code, diagram);
      } else if (isRenderer && !rendererEditing) {
        copyPreviewAsImage(copyBtn, rendererPreview, code, diagram);
      } else {
        handleCopy(copyBtn, code);
      }
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
        const languageChanged = node.attrs.language !== updatedNode.attrs.language;
        const sourceChanged = node.textContent !== updatedNode.textContent;
        if (languageChanged || sourceChanged) {
          clearDiagram();
          rendererGeneration++;
          disposePendingRenderers();
          renderGeneration++;
          lastRendererCode = "";
          lastRenderedCode = "";
        }
        node = updatedNode;
        langLabel.textContent = findLanguageLabel(updatedNode.attrs.language || "", allLanguages);
        const wasMermaid = isMermaid;
        isMermaid = Boolean(mermaidLoader) && updatedNode.attrs.language === "mermaid";
        if (isMermaid !== wasMermaid) {
          renderGeneration++;
          lastRenderedCode = "";
          disconnectMermaidResize();
          isEditing = false;
          if (isMermaid) {
            installThemeObserver();
            mermaidReRenderCallbacks.add(onThemeChange);
          } else {
            mermaidReRenderCallbacks.delete(onThemeChange);
          }
        }
        const wasRenderer = isRenderer;
        isRenderer = updatedNode.attrs.language !== "mermaid" && rendererLangIds.has(updatedNode.attrs.language || "");
        if (isRenderer !== wasRenderer || languageChanged) {
          rendererEditing = false;
          lastRendererCode = "";
          rendererPreview.innerHTML = "";
          disposeRenderer();
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
        destroyed = true;
        renderGeneration++;
        rendererGeneration++;
        disposePendingRenderers();
        clearDiagram();
        disconnectMermaidResize();
        if (activePicker) {
          activePicker.destroy();
          activePicker = null;
        }
        if (renderTimer) clearTimeout(renderTimer);
        if (rendererTimer) clearTimeout(rendererTimer);
        disposeRenderer();
        mermaidReRenderCallbacks.delete(onThemeChange);
      }
    };
  };
}
export {
  createCodeBlockNodeViewFactory
};
//# sourceMappingURL=code-block-view.js.map