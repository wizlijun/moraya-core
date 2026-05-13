/**
 * Mermaid renderer — lazy-loads the mermaid library and provides a render API.
 *
 * This is a utility module imported on-demand by `code-block-view.ts`,
 * NOT itself a ProseMirror plugin. The mermaid library (~2.4 MB) is loaded
 * only when the first mermaid code block is encountered, via dynamic
 * `import('mermaid')`. Consumers that want mermaid support must install
 * `mermaid` as a peer dependency.
 *
 * IMPORTANT: `mermaid.render()` manipulates global DOM state and is NOT safe
 * to call concurrently. All renders go through a serial queue.
 */
declare function ensureMermaidLoaded(): Promise<void>;
declare function renderMermaid(code: string): Promise<{
    svg: string;
} | {
    error: string;
}>;
/**
 * Re-initialize mermaid with updated theme. Called when theme changes.
 */
declare function updateMermaidTheme(): void;

export { ensureMermaidLoaded, renderMermaid, updateMermaidTheme };
