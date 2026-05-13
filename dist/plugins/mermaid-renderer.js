// src/plugins/mermaid-renderer.ts
var mermaidModule = null;
var loadingPromise = null;
var renderCounter = 0;
var renderQueue = Promise.resolve();
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
export {
  ensureMermaidLoaded,
  renderMermaid,
  updateMermaidTheme
};
//# sourceMappingURL=mermaid-renderer.js.map