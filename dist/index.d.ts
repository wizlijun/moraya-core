export { createSchema, getDocumentBaseDir, setDocumentBaseDir } from './schema.js';
export { B as BlankLineUnit, F as FallbackEmpty, a as FidelityFailure, b as FidelityResult, c as FileParseWork, d as FileRootCorrespondence, e as FileSourceResult, L as LayoutContainer, P as ProtectedSource, S as SourceBlockResult, f as SourceEdit, g as SourceFileUpdate, h as SourceGap, i as SourceLayout, j as SourcePatch, k as SourceRoot, l as SourceSession, m as SyntheticEmission, T as TextSourceSpan, n as applySourceBlockTransaction, o as applySourceTextTransaction, p as createSourceSession, q as parseMarkdown, r as parseMarkdownAsync, s as prepareFileSourceEdits, t as serializeMarkdown } from './markdown-CQNWe41X.js';
export { CreateEditorOptions, EditorPluginOptions, MorayaEditorInstance, createEditor, createEditorPlugins, preloadEnhancementPlugins } from './setup.js';
export { GfmTableAction, gfmTableCommand, insertHorizontalRule, insertImage, insertMathBlock, insertTable, setHeading, toggleBlockquote, toggleBold, toggleBulletList, toggleCode, toggleCodeBlock, toggleHighlight, toggleItalic, toggleLink, toggleOrderedList, toggleStrikethrough } from './commands.js';
export { DocCache, createDocCache, djb2Hash } from './doc-cache.js';
export { FrontmatterViewFactory, LinkOpener, LocalMediaSource, MediaResolver, Platform, RendererPluginModule, RendererRegistry, SchemaConfig, SpreadsheetViewFactory } from './types.js';
import 'prosemirror-model';
import 'markdown-it';
import 'markdown-it/lib/rules_block/state_block.mjs';
import 'prosemirror-state';
import 'prosemirror-view';
import 'prosemirror-inputrules';
import './plugins/cursor-syntax.js';

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

export { type EolChange, type EolProjection, projectLineEndings, sourceOffsetAt, viewOffsetAt };
