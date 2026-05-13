import { Plugin } from 'prosemirror-state';

/**
 * Syntax highlighting plugin for `code_block` nodes.
 *
 * Faithful 1:1 migration from Moraya desktop `src/lib/editor/plugins/highlight.ts`
 * (replaces the prior no-op stub). Applies ProseMirror Decoration spans with
 * `hljs-*` CSS classes. Schema-agnostic via `state.schema` lookups.
 *
 * Performance contract (Moraya CLAUDE.md "Performance Coding Standards" §6):
 *   - Per-block cache keyed by `(language, code)` — switching back to a
 *     previously highlighted file skips all hljs calls.
 *   - On doc change: cheap `decorationSet.map(tr.mapping)` keeps positions in
 *     sync without re-highlighting (no hljs calls in the hot path).
 *   - After 300 ms idle: full re-highlight via metadata-only transaction,
 *     re-using the per-block cache where possible.
 *   - File-switch path (`tr.getMeta('file-switch')`): rebuild from scratch.
 *   - Full-delete path (`tr.getMeta('full-delete')`): rebuild on the tiny doc.
 *
 * Tier 1 lazy load: this module bundles hljs + 39 language definitions
 * (~250 KB minified). It is loaded via `dynamic import()` so it forms a
 * separate Vite/Rollup chunk and only ships to consumers that actually use
 * code blocks.
 */

/**
 * Plugin that adds syntax highlighting to code blocks.
 *
 * highlight.js is expensive (especially `highlightAuto` which tests all
 * registered languages). Strategy:
 *  1. On doc change: cheaply map existing decorations through the transaction
 *     (adjust positions for inserts/deletes — no hljs calls).
 *  2. After 300 ms idle: run a full re-highlight and dispatch a metadata-only
 *     transaction to flush new decorations into the view.
 *  3. File-switch / full-delete metas: rebuild from scratch.
 */
declare function createHighlightPlugin(): Plugin;

export { createHighlightPlugin };
