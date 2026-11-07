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
function createDiagramStatePlugin() {
  return new Plugin({
    key: stateKey,
    view: (view) => ({ update: () => {
      for (const check of attachmentChecks.get(view) ?? []) check();
    } }),
    state: {
      init: () => /* @__PURE__ */ new Map(),
      apply(tr, previous) {
        if (!tr.docChanged) return previous;
        const next = /* @__PURE__ */ new Map();
        for (const [pos, snapshot] of previous) {
          const mapped = tr.mapping.mapResult(pos, 1);
          const node = tr.doc.nodeAt(mapped.pos);
          if (!mapped.deleted && node?.type.name === "code_block" && node.textContent === snapshot.source && node.attrs.language === snapshot.language) next.set(mapped.pos, snapshot);
        }
        return next;
      }
    }
  });
}
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
export {
  createDiagramController,
  createDiagramStatePlugin,
  diagramLabels,
  diagramSnapshot
};
//# sourceMappingURL=diagram-interaction.js.map