import { Schema } from 'prosemirror-model';
export { Node as PmNode } from 'prosemirror-model';
import { SchemaConfig } from './types.js';

/**
 * Unified ProseMirror Schema for `@moraya/core`.
 *
 * Faithful 1:1 migration from Moraya desktop `src/lib/editor/schema.ts`
 * with the following DI changes (v0.60.0-pre §F2.5):
 *   - All Tauri IPC `read_file_binary` / `plugin-http` calls in image / media
 *     loaders are replaced by consumer-injected `MediaResolver` methods.
 *   - Schema NodeSpecs that depend on the resolver (image, html_inline) are
 *     built inside `createSchema(config)` factory body, capturing `config`
 *     in closures for `toDOM`. Other NodeSpecs are pure data.
 *   - Module-level `documentBaseDir` + `setDocumentBaseDir` is preserved
 *     (pure string state, not Tauri-coupled).
 *   - Per §6.1.1: this module does NOT export the default schema. It is
 *     used internally by parseMarkdown / serializeMarkdown only.
 *
 * Nodes (24): doc, text, paragraph, heading, blockquote, code_block,
 *   frontmatter, horizontal_rule, bullet_list, ordered_list, list_item, image,
 *   hardbreak, html_block, html_inline, table, table_header_row, table_row,
 *   table_header, table_cell, math_inline, math_block,
 *   defList, defListTerm, defListDescription, note_anchor
 *
 * Marks (8): html_mark, strong, em, code, link, strike_through, highlight,
 *   annotation
 */

/** Update the base directory used to resolve relative image paths. */
declare function setDocumentBaseDir(dir: string): void;
/** Read the current base dir. Exposed for consumers that need to coordinate (e.g. tests). */
declare function getDocumentBaseDir(): string;
/**
 * Internal default schema (uses {@link nullMediaResolver}).
 * Used by parseMarkdown / serializeMarkdown when no real consumer schema
 * is available. Per §6.1.1 NOT exported via index.ts — consumers must call
 * createSchema(config) with a real MediaResolver.
 */
declare const defaultSchema: Schema<string, string>;
/**
 * Create a ProseMirror Schema with consumer-injected dependencies.
 *
 * @throws TypeError if `config.mediaResolver` is missing or is the internal
 *   nullMediaResolver sentinel.
 */
declare function createSchema(config: SchemaConfig): Schema;

export { SchemaConfig, createSchema, defaultSchema, getDocumentBaseDir, setDocumentBaseDir };
