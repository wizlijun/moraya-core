export { createSchema, getDocumentBaseDir, setDocumentBaseDir } from './schema.js';
export { parseMarkdown, parseMarkdownAsync, serializeMarkdown } from './markdown.js';
export { CreateEditorOptions, EditorPluginOptions, MorayaEditorInstance, createEditor, createEditorPlugins, preloadEnhancementPlugins } from './setup.js';
export { insertHorizontalRule, insertImage, insertMathBlock, insertTable, setHeading, toggleBlockquote, toggleBold, toggleBulletList, toggleCode, toggleCodeBlock, toggleHighlight, toggleItalic, toggleLink, toggleOrderedList, toggleStrikethrough } from './commands.js';
export { DocCache, createDocCache, djb2Hash } from './doc-cache.js';
export { FrontmatterViewFactory, LinkOpener, LocalMediaSource, MediaResolver, Platform, RendererPluginModule, RendererRegistry, SchemaConfig, SpreadsheetViewFactory } from './types.js';
import { Node, Schema } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';
import 'prosemirror-view';
import 'prosemirror-inputrules';
import './plugins/cursor-syntax.js';

type TextSourceSpan = Readonly<{
    sourceFrom: number;
    sourceTo: number;
    pmFrom: number;
    pmTo: number;
    kind: 'linear' | 'atomic';
}>;
type SourceSession = Readonly<{
    revision: number;
    source: string;
    doc: Node;
    textSpans: readonly TextSourceSpan[];
}>;
type FidelityFailure = Readonly<{
    ok: false;
    reason: 'unsupported-source' | 'parse-error' | 'stale-document' | 'unsupported-step' | 'unmapped-range' | 'semantic-mismatch';
}>;
type FidelityResult = {
    ok: true;
    session: SourceSession;
} | FidelityFailure;
/** Experimental: one ordinary paragraph, with no work-text normalization. */
declare function createSourceSession(source: string, schema?: Schema): FidelityResult;
/** Pure preparation: a failure never supplies output or mutates the base session. */
declare function applySourceTextTransaction(base: SourceSession, tr: Transaction): FidelityResult;

export { type FidelityFailure, type FidelityResult, type SourceSession, type TextSourceSpan, applySourceTextTransaction, createSourceSession };
