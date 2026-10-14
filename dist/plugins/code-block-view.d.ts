import { Node as Node$1 } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { MermaidLoader, RendererRegistry } from '../types.js';

/**
 * CodeBlock NodeView — toolbar with language label, language picker, copy button,
 * mermaid preview, and renderer-plugin preview.
 *
 * Faithful 1:1 migration from Moraya desktop `src/lib/editor/plugins/code-block-view.ts`
 * with the following DI changes (v0.60.0-pre §F2.5):
 *   - `RENDERER_PLUGINS` / `loadRendererPlugin` / `rendererVersions` (moraya-internal)
 *     → `RendererRegistry` injected via factory parameter
 *   - `editorStore.getState().currentFilePath` (used by `isFilePathRenderer`)
 *     is no longer accessed here; the consumer's RendererRegistry implementation
 *     closes over its own platform context and surfaces it via the renderer
 *     module's `render(source, container)` call.
 *   - Mermaid keeps its dedicated NodeView, with an explicitly injected loader.
 *     No loader means editable source; registry entries do not enable Mermaid.
 *
 * The render dispose-instance pattern from moraya (CAD viewer etc.) is
 * implemented in core via `RendererPluginModule.destroy(container)` per §3.3:
 *   - On render: call `module.render(source, container, options)` (consumer
 *     stores any disposable in container or via WeakMap closure).
 *   - On lang change / NodeView destroy: call `module.destroy?(container)`.
 */

interface CodeBlockNodeViewOptions {
    mermaidLoader?: MermaidLoader;
    rendererRegistry?: RendererRegistry;
}
/**
 * NodeView factory builder. Returns the function to pass as
 * `nodeViews: { code_block: <returned> }` in EditorView config.
 *
 * Closes over a `RendererRegistry` so dispatched renderer plugins are
 * looked up via the consumer's injected registry rather than a Moraya-only
 * static map.
 */
declare function createCodeBlockNodeViewFactory(opts?: CodeBlockNodeViewOptions): (nodeArg: Node$1, view: EditorView, getPos: () => number | undefined) => {
    dom: HTMLDivElement;
    contentDOM: HTMLElement;
    stopEvent(event: Event): boolean;
    ignoreMutation(mutation: {
        target: Node;
    }): boolean;
    update(updatedNode: Node$1): boolean;
    selectNode(): void;
    deselectNode(): void;
    destroy(): void;
};

export { type CodeBlockNodeViewOptions, createCodeBlockNodeViewFactory };
