import MarkdownIt from 'markdown-it';
import StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import { Node, Schema } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';

type TracePiece = Readonly<{
    from: number;
    to: number;
    sourceFrom: number;
    sourceTo: number;
    kind: 'copy' | 'atomic' | 'generated';
}>;
type SourceTrace = Readonly<{
    text: string;
    pieces: readonly TracePiece[];
}>;

type SourceRoot = Readonly<{
    id: number;
    tokenType: string;
    sourceFrom: number;
    sourceTo: number;
    tailFrom: number;
    pmFrom: number;
    pmTo: number;
    childFrom: number;
    childTo: number;
}>;
type SyntheticEmission = Readonly<{
    pmFrom: number;
    pmTo: number;
    childFrom: number;
    childTo: number;
}>;
type SourceGap = Readonly<{
    sourceFrom: number;
    sourceTo: number;
    kind: 'trivia' | 'opaque';
    synthetic: readonly SyntheticEmission[];
}>;
type ProtectedSource = Readonly<{
    kind: 'reference-definition';
    sourceFrom: number;
    sourceTo: number;
    scope: 'top-level' | 'nested';
}>;
type SourceEdit = Readonly<{
    from: number;
    to: number;
    text: string;
}>;

type LayoutContainer = Readonly<{
    kind: 'gap';
    gapIndex: number;
} | {
    kind: 'root-tail';
    rootId: number;
}>;
type BlankLineUnit = Readonly<{
    id: number;
    sourceFrom: number;
    sourceTo: number;
    container: LayoutContainer;
}> & (Readonly<{
    role: 'separator';
}> | Readonly<{
    role: 'empty-paragraph';
    emission: SyntheticEmission;
}>);
type FallbackEmpty = Readonly<{
    kind: 'empty-document-baseline';
    sourceAnchor: number;
    emission: SyntheticEmission;
}>;
type ListMarker = '-' | '+' | '*' | '.' | ')';
type SourceListLexeme = Readonly<{
    id: number;
    rootId: number;
    pmFrom: number;
    pmTo: number;
    sourceFrom: number;
    sourceTo: number;
    kind: 'bullet' | 'ordered';
    marker: ListMarker;
    tight: boolean;
}>;
type SourceLayout = Readonly<{
    blankLines: readonly BlankLineUnit[];
    fallback?: FallbackEmpty;
    lists?: readonly SourceListLexeme[];
}>;

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
    file?: SourceFileUpdate;
} | FidelityFailure;
type SourcePatch = Readonly<{
    from: number;
    to: number;
    removed: string;
    text: string;
}>;
type FileRootCorrespondence = Readonly<{
    beforeRoots: readonly number[];
    afterRoots: readonly number[];
    kind: 'untouched' | 'retained' | 'split' | 'join' | 'repartition' | 'birth' | 'deleted';
}>;
type FileParseWork = Readonly<{
    mode: 'unchanged' | 'local' | 'expanded' | 'full-fallback';
    fallbackReason?: 'cache-miss' | 'checkpoint-unproven' | 'preprocess-unproven' | 'private-hook-unavailable';
    blockWindows: readonly Readonly<{
        sourceFrom: number;
        sourceTo: number;
    }>[];
    blockParseCalls: number;
    topLevelRunnerCalls: number;
    blockRuleCalls: number;
    nestedTokenizeCalls: number;
    blockLinesVisited: number;
    inlineParseCalls: number;
    inlineInputUnits: number;
    inlineRoots: readonly number[];
    rawTouchedBeforeRoots: readonly number[];
    environmentChanged: boolean;
    legacyParseCalls: number;
    fullCaptureCalls: number;
    pmEmissionTokenCount: number;
    preprocessedCodeUnits: number;
    lineTableCodeUnits: number;
    rawSplicedCodeUnits: number;
    inlineEffectReplayCount: number;
}>;
type SourceFileUpdate = Readonly<{
    environmentVersion: number;
    correspondence: readonly FileRootCorrespondence[];
    work: FileParseWork;
}>;
type FileSourceResult = {
    ok: true;
    session: SourceSession;
    edits: readonly SourcePatch[];
    file: SourceFileUpdate;
} | (FidelityFailure & {
    work: FileParseWork;
});
declare function prepareFileSourceEdits(base: SourceSession, input: Readonly<{
    expectedRevision: number;
    edits: readonly SourcePatch[];
}>): FileSourceResult;
/** Experimental: complete raw document with sparse writable paragraph spans. */
declare function createSourceSession(source: string, schema?: Schema): FidelityResult;
declare function applySourceTextTransaction(base: SourceSession, tr: Transaction): FidelityResult;
type SourceBlockResult = {
    ok: true;
    session: SourceSession;
    mode: 'unchanged' | 'exact-text' | 'fragment-render' | 'root-render';
    edits: readonly SourceEdit[];
    changedRoots: readonly number[];
    file?: SourceFileUpdate;
} | FidelityFailure;
declare function applySourceBlockTransaction(base: SourceSession, tr: Transaction): SourceBlockResult;

type RawRange = Readonly<{
    from: number;
    to: number;
}>;
type SourcePrefix = readonly (RawRange | Readonly<{
    spaces: number;
}>)[];
type EmptyPlace = Readonly<{
    kind: 'inline';
    range: RawRange;
    before: string;
    after: string;
}> | Readonly<{
    kind: 'missing-cell';
    at: number;
    row: number;
    slot: number;
    present: number;
    closingPipe: boolean;
}> | Readonly<{
    kind: 'literal';
    at: number;
    terminal?: RawRange;
    eol: RawRange;
    prefix: SourcePrefix;
    closed: true;
}> | Readonly<{
    kind: 'prepend';
    at: number;
    eol: RawRange | undefined;
    continuation: SourcePrefix;
}> | Readonly<{
    kind: 'layout';
    origin: {
        kind: 'blank';
        id: number;
    } | {
        kind: 'fallback';
    };
}> | Readonly<{
    kind: 'nested-blank';
    range: RawRange;
    eol?: RawRange;
    prefix: SourcePrefix;
    leftBody: boolean;
    rightBody: boolean;
}>;
type EmptyBody = Readonly<{
    pmAt: number;
    parent: Node;
    rootId?: number;
    place: EmptyPlace;
}>;

/**
 * Markdown ↔ ProseMirror Doc roundtrip for `@moraya/core`.
 *
 * Faithful 1:1 migration from Moraya desktop `src/lib/editor/markdown.ts`.
 * Uses `prosemirror-markdown` with `markdown-it` as the tokenizer.
 *
 * Supports: CommonMark + GFM (tables, strikethrough, task lists) +
 *           math (via markdown-it-texmath) + definition lists +
 *           paired raw-HTML marks + frontmatter / footnote pass-through.
 *
 * Configuration matches Milkdown output conventions:
 *   - bullet: '-'
 *   - horizontal rule: '---'
 *   - strong: '**'
 *   - emphasis: '*'
 *
 * Serializer wraps `defaultSchema` (host-agnostic NullMediaResolver). The
 * schema's structural shape is identical to consumer-injected schemas
 * (same NodeSpec/MarkSpec ids), so a doc parsed against `defaultSchema`
 * round-trips through any consumer schema without rebuilding.
 */

type CapturedTextRun = {
    sourceFrom: number;
    sourceTo: number;
    pmFrom: number;
    pmTo: number;
    kind: 'linear' | 'atomic';
};
type CapturedParagraph = {
    doc: Node;
    textRuns: CapturedTextRun[];
};
type CapturedDocument = CapturedParagraph & {
    roots: SourceRoot[];
    gaps: SourceGap[];
    protectedSources: readonly ProtectedSource[];
    layout: SourceLayout;
};
type InlineBody = Readonly<{
    pmFrom: number;
    pmTo: number;
    sourceFrom: number;
    sourceTo: number;
    kind: 'paragraph' | 'heading' | 'table-cell';
    singlePhysicalLine: boolean;
}>;
/** Internal actual-capture authority. Public readonly metadata grants no permission. */
declare function capturedSourceLists(source: string, doc: Node, roots: readonly SourceRoot[], layout: SourceLayout): readonly SourceListLexeme[] | undefined;
declare function capturedInlineBodies(source: string, doc: Node, roots: readonly SourceRoot[], layout: SourceLayout): readonly InlineBody[] | undefined;
declare function capturedEmptyBodies(source: string, doc: Node, roots: readonly SourceRoot[], layout: SourceLayout): readonly EmptyBody[] | undefined;
/** Internal source-render guard; a missing capture fact is not permission. */
declare function sourceRootHasClosedFences(root: SourceRoot): boolean;
/** Render only inline content with the same conservative callbacks as roots. */
declare function serializeSourceInlineBody(node: Node): string;
/** Internal source-root renderer; default serializeMarkdown stays unchanged. */
type SourceListStyle = Readonly<{
    marker: '-' | '+' | '*' | '.' | ')';
    tight: boolean;
}>;
type SourceRootRenderOptions = Readonly<{
    onContinuationIndent?: (indent: number) => void;
    onOwnedBlank?: (terminal: boolean) => void;
    lists?: readonly Readonly<{
        node: Node;
        style: SourceListStyle;
    }>[];
}>;
declare function serializeSourceRootMarkdown(doc: Node, options?: SourceRootRenderOptions): string;
/**
 * Parse a markdown string into a ProseMirror document node. Never throws (§4.5).
 *
 * @param markdown   Source markdown string (may contain frontmatter, math, html, etc.).
 * @param schemaArg  Optional consumer schema. When provided, the returned doc's
 *                   `node.type` references the consumer's NodeType identities,
 *                   allowing it to be loaded directly into an `EditorState.create`
 *                   built with that same schema. Defaults to {@link defaultSchema}.
 */
declare function parseMarkdown(markdown: string, schemaArg?: Schema): Node;
/**
 * Async version of parseMarkdown. For large files (≥50KB), yields to the
 * event loop via setTimeout(0) so the main thread stays responsive.
 * §4.5: never rejects.
 */
declare function parseMarkdownAsync(markdown: string, schemaArg?: Schema): Promise<Node>;
/**
 * Serialize a ProseMirror document node to a markdown string. Never throws (§4.5).
 */
declare function serializeMarkdown(doc: Node): string;
/** Internal experimental hook. Never uses parseMarkdown's empty-doc fallback. */
declare function parseDocumentWithSourceCapture(source: string, schema?: Schema): {
    ok: true;
    value: CapturedDocument;
} | {
    ok: false;
    reason: 'unsupported-source' | 'parse-error';
};
/** Compatibility hook for callers requiring a fully mapped ordinary paragraph. */
declare function parseParagraphWithSourceCapture(source: string, schema?: Schema): {
    ok: true;
    value: CapturedParagraph;
} | {
    ok: false;
    reason: 'unsupported-source' | 'parse-error';
};
type ActualToken = ReturnType<MarkdownIt['parse']>[number];
type FileWorkAccumulator = {
    -readonly [K in keyof FileParseWork]: FileParseWork[K];
};
type FileDefinition = Readonly<{
    kind: 'reference' | 'footnote';
    label: string;
    sourceFrom: number;
    sourceTo: number;
    scope: 'top-level' | 'nested';
    href?: string;
    title?: string;
}>;
type BlockScalars = Pick<StateBlock, 'parentType' | 'tight' | 'blkIndent' | 'level' | 'ddIndent' | 'listIndent'>;
type FileCheckpoint = Readonly<{
    line: number;
    offset: number;
    tokenIndex: number;
    definitionIndex: number;
    hasEmptyLines: boolean;
    state: BlockScalars;
}>;
type FileTokenCache = Readonly<{
    source: string;
    trace: SourceTrace;
    lineStarts: readonly number[];
    blockTokens: readonly ActualToken[];
    inlineTokens: readonly ActualToken[];
    checkpoints: readonly FileCheckpoint[];
    definitions: readonly FileDefinition[];
    effects: readonly (readonly string[])[];
}>;
type FileCaptureResult = {
    ok: true;
    value: CapturedDocument;
    cache: FileTokenCache;
} | {
    ok: false;
    reason: 'unsupported-source' | 'parse-error';
};
declare function preprocessFileSource(source: string): SourceTrace;
declare function captureFilePipeline(source: string, schema?: Schema, work?: FileWorkAccumulator): FileCaptureResult;
declare function replayFilePipeline(cache: FileTokenCache, schema?: Schema, work?: FileWorkAccumulator): FileCaptureResult;
/** All candidate rules still see the complete file and true EOF. */
declare function captureFileWindow(cache: FileTokenCache, source: string, patches: readonly Readonly<{
    from: number;
    to: number;
    text: string;
}>[], schema: Schema, work: FileWorkAccumulator, selection: Readonly<{
    leftIndex: number;
    rightIndex: number;
}>): FileCaptureResult | null;

export { type FileWorkAccumulator as A, type BlankLineUnit as B, type CapturedDocument as C, type SourceListStyle as D, type SourceRootRenderOptions as E, type FallbackEmpty as F, captureFilePipeline as G, captureFileWindow as H, capturedEmptyBodies as I, capturedInlineBodies as J, capturedSourceLists as K, type LayoutContainer as L, parseDocumentWithSourceCapture as M, parseParagraphWithSourceCapture as N, preprocessFileSource as O, type ProtectedSource as P, replayFilePipeline as Q, serializeSourceInlineBody as R, type SourceBlockResult as S, type TextSourceSpan as T, serializeSourceRootMarkdown as U, sourceRootHasClosedFences as V, type FidelityFailure as a, type FidelityResult as b, type FileParseWork as c, type FileRootCorrespondence as d, type FileSourceResult as e, type SourceEdit as f, type SourceFileUpdate as g, type SourceGap as h, type SourceLayout as i, type SourcePatch as j, type SourceRoot as k, type SourceSession as l, type SyntheticEmission as m, applySourceBlockTransaction as n, applySourceTextTransaction as o, createSourceSession as p, parseMarkdown as q, parseMarkdownAsync as r, prepareFileSourceEdits as s, serializeMarkdown as t, type CapturedParagraph as u, type CapturedTextRun as v, type FileCaptureResult as w, type FileCheckpoint as x, type FileDefinition as y, type FileTokenCache as z };
