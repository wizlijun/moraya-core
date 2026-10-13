export { createSchema, getDocumentBaseDir, setDocumentBaseDir } from './schema.js';
import { S as SourceRoot, a as SourceGap, P as ProtectedSource, b as SourceLayout, c as SourceEdit } from './markdown-D8Wa1GtD.js';
export { B as BlankLineUnit, F as FallbackEmpty, L as LayoutContainer, d as SyntheticEmission, p as parseMarkdown, e as parseMarkdownAsync, s as serializeMarkdown } from './markdown-D8Wa1GtD.js';
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
    roots: readonly SourceRoot[];
    gaps: readonly SourceGap[];
    protectedSources: readonly ProtectedSource[];
    layout: SourceLayout;
}>;
type FidelityFailure = Readonly<{
    ok: false;
    reason: 'unsupported-source' | 'parse-error' | 'stale-document' | 'unsupported-step' | 'unmapped-range' | 'semantic-mismatch';
}>;
type FidelityResult = {
    ok: true;
    session: SourceSession;
} | FidelityFailure;
/** Experimental: complete raw document with sparse writable paragraph spans. */
declare function createSourceSession(source: string, schema?: Schema): FidelityResult;
declare function applySourceTextTransaction(base: SourceSession, tr: Transaction): FidelityResult;
type SourceBlockResult = {
    ok: true;
    session: SourceSession;
    mode: 'unchanged' | 'exact-text' | 'root-render';
    edits: readonly SourceEdit[];
    changedRoots: readonly number[];
} | FidelityFailure;
declare function applySourceBlockTransaction(base: SourceSession, tr: Transaction): SourceBlockResult;

type EolChange = Readonly<{
    sourceFrom: number;
    sourceTo: number;
    viewFrom: number;
    viewTo: number;
}>;
type EolProjection = Readonly<{
    text: string;
    sourceLength: number;
    changes: readonly EolChange[];
}>;
declare function projectLineEndings(source: string): EolProjection;
declare function sourceOffsetAt(p: EolProjection, n: number): number;
declare function viewOffsetAt(p: EolProjection, n: number, bias: -1 | 1): number;

export { type EolChange, type EolProjection, type FidelityFailure, type FidelityResult, ProtectedSource, type SourceBlockResult, SourceEdit, SourceGap, SourceLayout, SourceRoot, type SourceSession, type TextSourceSpan, applySourceBlockTransaction, applySourceTextTransaction, createSourceSession, projectLineEndings, sourceOffsetAt, viewOffsetAt };
