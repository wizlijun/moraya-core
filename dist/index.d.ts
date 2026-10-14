export { createSchema, getDocumentBaseDir, setDocumentBaseDir } from './schema.js';
export { B as BlankLineUnit, F as FallbackEmpty, a as FidelityFailure, b as FidelityResult, c as FileParseWork, d as FileRootCorrespondence, e as FileSourceResult, L as LayoutContainer, P as ProtectedSource, S as SourceBlockResult, f as SourceEdit, g as SourceFileUpdate, h as SourceGap, i as SourceLayout, j as SourceListBoundaryResult, k as SourcePatch, l as SourceRoot, m as SourceSession, n as SyntheticEmission, T as TextSourceSpan, o as applySourceBlockTransaction, p as applySourceTextTransaction, q as createSourceSession, r as parseMarkdown, s as parseMarkdownAsync, t as prepareFileSourceEdits, u as prepareSourceListBoundarySteps, v as serializeMarkdown } from './markdown-C7EqV8NR.js';
export { CreateEditorOptions, EditorPluginOptions, MorayaEditorInstance, createEditor, createEditorPlugins, preloadEnhancementPlugins } from './setup.js';
export { GfmTableAction, gfmTableCommand, insertHorizontalRule, insertImage, insertMathBlock, insertTable, setHeading, toggleBlockquote, toggleBold, toggleBulletList, toggleCode, toggleCodeBlock, toggleHighlight, toggleItalic, toggleLink, toggleOrderedList, toggleStrikethrough } from './commands.js';
export { DocCache, createDocCache, djb2Hash } from './doc-cache.js';
export { FrontmatterViewFactory, LinkOpener, LocalMediaSource, MediaResolver, MermaidApi, MermaidLoader, Platform, RendererPluginModule, RendererRegistry, SchemaConfig, SpreadsheetViewFactory } from './types.js';
import 'prosemirror-model';
import 'prosemirror-state';
import 'prosemirror-transform';
import 'markdown-it';
import 'markdown-it/lib/rules_block/state_block.mjs';
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
