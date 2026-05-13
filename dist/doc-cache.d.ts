import { Node } from 'prosemirror-model';

/**
 * ProseMirror Doc LRU cache (v0.19.0 perf optimization, ported here).
 *
 * Per v0.60.0-pre §3 file tree note:
 *   - Factory `createDocCache(maxEntries?)` (no module-level singleton)
 *   - Consumers inject via `createEditor(opts.docCache)`; default = createDocCache(10)
 *   - Moraya desktop multi-tab: one app-level instance keyed by filePath hash
 *   - Moraya Web note list: shared app-level instance with createDocCache(50)
 */
interface DocCache {
    get(hash: number): Node | undefined;
    set(hash: number, doc: Node): void;
    clear(): void;
    /** Current entry count (read-only). */
    readonly size: number;
}
/**
 * Create an LRU-bounded ProseMirror Doc cache.
 *
 * @param maxEntries Max docs to retain. Default 10 (matches Moraya desktop's
 *   per-Editor instance size; Moraya Web with note list typically uses 50).
 */
declare function createDocCache(maxEntries?: number): DocCache;
/** djb2 hash (matches Moraya desktop's existing hash to keep cache key compat). */
declare function djb2Hash(str: string): number;

export { type DocCache, createDocCache, djb2Hash };
