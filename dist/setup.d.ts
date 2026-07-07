import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { InputRule } from 'prosemirror-inputrules';
import { Schema } from 'prosemirror-model';
import { MediaResolver, RendererRegistry, LinkOpener, Platform, SpreadsheetViewFactory } from './types.js';
import { DocCache } from './doc-cache.js';

/**
 * Editor lifecycle factory for `@moraya/core`.
 *
 * Faithful 1:1 migration from Moraya desktop `src/lib/editor/setup.ts`,
 * with the following DI changes (v0.60.0-pre §F2.5 / §F2.6):
 *   - Schema is built per-call from a consumer-injected `MediaResolver`.
 *   - `LinkOpener` / `RendererRegistry` / `Platform` are forwarded to plugins
 *     that need them (RendererRegistry → Tier 1 code-block-view in next batch).
 *   - All `require()` calls in the original (4 sites) are replaced with
 *     top-level ESM imports (§1.1.1 Pure ESM constraint).
 *
 * Public API per §3.2:
 *   - `createEditor(opts)` — returns a `MorayaEditorInstance` ready to mount
 *   - `createEditorPlugins(opts)` — returns the plugin array (for consumers
 *     that want full control over `EditorView` construction)
 *   - `preloadEnhancementPlugins()` — warms the Tier 1 lazy-load cache
 */

type CodeBlockNodeView = any;
interface Tier1Plugins {
    highlight?: Plugin;
    /** NodeView factory: `(node, view, getPos) => NodeView`. Wired into nodeViews at editor mount. */
    codeBlockView?: CodeBlockNodeView;
    emoji?: Plugin;
    defListInputRule?: InputRule;
}
/**
 * Preload Tier 1 enhancement plugins via dynamic `import()`.
 * Each plugin becomes a separate Vite/Rollup chunk (automatic code splitting).
 * Can be called early (e.g. in onMount) to warm the cache.
 *
 * The `defListInputRule` requires a Schema; the `codeBlockView` factory
 * closes over the consumer's `RendererRegistry`. The cache is keyed by
 * (schema, rendererRegistry) so consumers with different injection produce
 * different cached factories.
 */
declare function preloadEnhancementPlugins(schema: Schema, rendererRegistry?: RendererRegistry): Promise<Tier1Plugins>;
declare function buildInputRules(schema: Schema, tier1: Tier1Plugins, enableInlineMarks?: boolean): Plugin;
interface EditorPluginOptions {
    /** Render features */
    enableMath?: boolean;
    enableMermaid?: boolean;
    enableTableResize?: boolean;
    enableImageSelection?: boolean;
    enableHistory?: boolean;
    /**
     * When false, typing inline mark delimiters — `**`/`__` (strong), `*`/`_`
     * (em), `` ` `` (code), `~~` (strike), `^^`/`==` (highlight) — does NOT
     * auto-convert into a rendered mark. The delimiters stay literal so the line
     * reads as source while the user is editing it. Also disables the backtick
     * pair collapse in `inline-code-convert`, for a uniform "inline markers stay
     * literal on type" policy. Block-level shortcuts (headings, lists, quotes,
     * fences, hr, task list) and marks already parsed from the document are
     * unaffected. Default true. */
    enableInlineMarkInputRules?: boolean;
    /** Dependency injection (§3.3) */
    mediaResolver: MediaResolver;
    rendererRegistry?: RendererRegistry;
    linkOpener?: LinkOpener;
    platform?: Platform;
    spreadsheetViewFactory?: SpreadsheetViewFactory;
    /** Change callbacks */
    onDocChanged?: (textContent: string) => void;
    onChange?: (markdown: string) => void;
    changeDebounceMs?: number;
}
interface CreateEditorOptions extends EditorPluginOptions {
    container: HTMLElement;
    initialContent?: string;
    docCache?: DocCache;
    onFocus?: () => void;
    onBlur?: () => void;
}
interface MorayaEditorInstance {
    view: EditorView;
    getMarkdown(): string;
    setContent(md: string): void;
    destroy(): void;
}
/**
 * Build the plugin array per v0.60.0-pre §4.1.
 *
 * Plugin order (with `key`s for fingerprint stability):
 *   1. listShortcutsPlugin (event.code list shortcuts; macOS Option-key safe)
 *   2. buildInputRules (must precede keymap)
 *   3. createEnterHandlerPlugin (must precede keymap so pipe-table / fence detection runs first)
 *   4. buildKeymap
 *   5. keymap(baseKeymap)
 *   6. history (skipped if enableHistory=false; for v0.72 Yjs)
 *   7. dropCursor
 *   8. columnResizing (table)
 *   9. createCursorSyntaxPlugin
 *  10. createLinkTextPlugin
 *  11. createInlineCodeConvertPlugin
 *  12. createImageSelectionPlugin
 *  13. change callback (lazy / dirty)
 *  14. Tier 1 highlight + emoji (lazy-loaded; appended to plugins array)
 *
 * NOTE: editor-props-plugin and code-block-view (RendererRegistry-coupled)
 * land in the next batch.
 */
declare function createEditorPlugins(opts: EditorPluginOptions, schemaArg?: Schema): Promise<Plugin[]>;
/**
 * Create a full editor instance. Convenience wrapper that handles schema +
 * plugins + EditorState + EditorView wiring.
 */
declare function createEditor(opts: CreateEditorOptions): Promise<MorayaEditorInstance>;

export { type CreateEditorOptions, type EditorPluginOptions, type MorayaEditorInstance, buildInputRules, createEditor, createEditorPlugins, preloadEnhancementPlugins };
