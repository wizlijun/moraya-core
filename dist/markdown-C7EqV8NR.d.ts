import { Node, Schema, Mark } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import MarkdownIt from 'markdown-it';
import StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

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
type SourceListBoundaryResult = {
    ok: true;
    steps: readonly ReplaceStep[];
} | FidelityFailure;
declare function prepareSourceListBoundarySteps(base: SourceSession, tr: Transaction): SourceListBoundaryResult;

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
    leftSeparator: boolean;
}>;
type EmptyBody = Readonly<{
    pmAt: number;
    parent: Node;
    rootId?: number;
    place: EmptyPlace;
}>;

type InlineRawRange = Readonly<{
    from: number;
    to: number;
}>;
type InlineEdge = Readonly<{
    id: number;
    body: number;
    family: string;
    pmFrom: number;
    pmTo: number;
    open: InlineRawRange;
    close: InlineRawRange;
    marks: readonly Mark[];
}>;
type InlineOccurrence = Readonly<{
    body: number;
    pmFrom: number;
    pmTo: number;
    sourceFrom: number;
    sourceTo: number;
    kind: 'paragraph' | 'heading' | 'table-cell';
}>;
type ClosedFenceBody = Readonly<{
    pmFrom: number;
    pmTo: number;
    sourceFrom: number;
    sourceTo: number;
    open: InlineRawRange;
    close: InlineRawRange;
    character: '`' | '~';
    openLength: number;
    closeLength: number;
    contentFrom: number;
    contentTo: number;
    eol: '\n' | '\r\n' | '\r';
    contiguousTopLevel: boolean;
}>;
type InlineAtomOccurrence = Readonly<{
    body: number;
    pmFrom: number;
    pmTo: number;
    sourceFrom: number;
    sourceTo: number;
    node: Node;
}>;
type CriticPayload = Readonly<{
    id: number;
    body: number;
    kind: 'annotation' | 'note_anchor';
    pmFrom: number;
    pmTo: number;
    syntaxFrom: number;
    syntaxTo: number;
    noteFrom: number;
    noteTo: number;
    note: string;
    open?: InlineRawRange;
    middle?: InlineRawRange;
    close: InlineRawRange;
}>;
type InlineRecipeFacts = Readonly<{
    definitionSeparators: readonly Readonly<{
        body: number;
        side: 'before' | 'after';
        definition: ProtectedSource;
        range: InlineRawRange;
    }>[];
    separators: readonly Readonly<{
        left: number;
        right: number;
        range: InlineRawRange;
    }>[];
    critic: readonly CriticPayload[];
    atoms: readonly InlineAtomOccurrence[];
    bodies: readonly InlineOccurrence[];
    edges: readonly InlineEdge[];
    fences: readonly ClosedFenceBody[];
}>;

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
declare function capturedInlineRecipeFacts(base: SourceSession): InlineRecipeFacts | undefined;
declare function capturedEmptyBodies(source: string, doc: Node, roots: readonly SourceRoot[], layout: SourceLayout): readonly EmptyBody[] | undefined;
/** Internal source-render guard; a missing capture fact is not permission. */
declare function sourceRootHasClosedFences(root: SourceRoot): boolean;
declare function sourceFenceLength(text: string, character: '`' | '~', minimum: number): number;
declare function sourceEmDelimiter(mark: Mark, parent: Node, index: number, opening: boolean): string;
declare function sourceCodeDelimiter(node: Node, opening: boolean): string;
/** Render only inline content with the same conservative callbacks as roots. */
declare function serializeSourceInlineBody(node: Node, tableCell?: boolean): string;
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

export { sourceRootHasClosedFences as $, type FileDefinition as A, type BlankLineUnit as B, type CapturedDocument as C, type FileTokenCache as D, type FileWorkAccumulator as E, type FallbackEmpty as F, type SourceListStyle as G, type SourceRootRenderOptions as H, captureFilePipeline as I, captureFileWindow as J, capturedEmptyBodies as K, type LayoutContainer as L, capturedInlineBodies as M, capturedInlineRecipeFacts as N, capturedSourceLists as O, type ProtectedSource as P, parseDocumentWithSourceCapture as Q, parseParagraphWithSourceCapture as R, type SourceBlockResult as S, type TextSourceSpan as T, preprocessFileSource as U, replayFilePipeline as V, serializeSourceInlineBody as W, serializeSourceRootMarkdown as X, sourceCodeDelimiter as Y, sourceEmDelimiter as Z, sourceFenceLength as _, type FidelityFailure as a, type FidelityResult as b, type FileParseWork as c, type FileRootCorrespondence as d, type FileSourceResult as e, type SourceEdit as f, type SourceFileUpdate as g, type SourceGap as h, type SourceLayout as i, type SourceListBoundaryResult as j, type SourcePatch as k, type SourceRoot as l, type SourceSession as m, type SyntheticEmission as n, applySourceBlockTransaction as o, applySourceTextTransaction as p, createSourceSession as q, parseMarkdown as r, parseMarkdownAsync as s, prepareFileSourceEdits as t, prepareSourceListBoundarySteps as u, serializeMarkdown as v, type CapturedParagraph as w, type CapturedTextRun as x, type FileCaptureResult as y, type FileCheckpoint as z };
