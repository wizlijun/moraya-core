import { Schema, Node } from 'prosemirror-model';

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
/** Internal actual-capture authority. Public readonly metadata grants no permission. */
declare function capturedSourceLists(source: string, doc: Node, roots: readonly SourceRoot[], layout: SourceLayout): readonly SourceListLexeme[] | undefined;
/** Internal source-render guard; a missing capture fact is not permission. */
declare function sourceRootHasClosedFences(root: SourceRoot): boolean;
/** Internal source-root renderer; default serializeMarkdown stays unchanged. */
declare function serializeSourceRootMarkdown(doc: Node): string;
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

export { type BlankLineUnit as B, type CapturedDocument as C, type FallbackEmpty as F, type LayoutContainer as L, type ProtectedSource as P, type SourceRoot as S, type SourceGap as a, type SourceLayout as b, type SourceEdit as c, type SyntheticEmission as d, parseMarkdownAsync as e, type CapturedParagraph as f, type CapturedTextRun as g, capturedSourceLists as h, parseDocumentWithSourceCapture as i, parseParagraphWithSourceCapture as j, serializeSourceRootMarkdown as k, sourceRootHasClosedFences as l, parseMarkdown as p, serializeMarkdown as s };
