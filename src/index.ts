/**
 * @moraya/core — public API surface.
 *
 * v0.60.0-pre §3.2 Public API Contract v0.1.0:
 * - schema (createSchema + SchemaConfig)
 * - markdown (parseMarkdown / parseMarkdownAsync / serializeMarkdown)
 * - setup (createEditor / createEditorPlugins + Options/Instance interfaces)
 * - commands (14 core editing commands)
 * - doc-cache (createDocCache + DocCache interface)
 * - types (4 DI interfaces + RendererPluginModule)
 *
 * Breaking-change definition: removing or renaming any exported symbol below,
 * changing parameter types/optionality, or modifying roundtrip serialization
 * behavior all require a major bump (or a deprecation-warning minor +
 * migration window).
 */

// schema
export {
  createSchema,
  setDocumentBaseDir,
  getDocumentBaseDir,
  type SchemaConfig,
} from './schema'

// markdown
export { parseMarkdown, parseMarkdownAsync, serializeMarkdown } from './markdown'

// setup
export {
  createEditor,
  createEditorPlugins,
  preloadEnhancementPlugins,
  type EditorPluginOptions,
  type CreateEditorOptions,
  type MorayaEditorInstance,
} from './setup'

// commands
export {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleCode,
  toggleHighlight,
  setHeading,
  toggleBlockquote,
  toggleOrderedList,
  toggleBulletList,
  toggleCodeBlock,
  insertTable,
  gfmTableCommand,
  type GfmTableAction,
  insertHorizontalRule,
  insertMathBlock,
  toggleLink,
  insertImage,
} from './commands'

// doc cache
export { createDocCache, djb2Hash, type DocCache } from './doc-cache'

// DI interfaces
export type {
  LocalMediaSource,
  MediaResolver,
  LinkOpener,
  RendererRegistry,
  RendererPluginModule,
  Platform,
  SpreadsheetViewFactory,
  FrontmatterViewFactory,
} from './types'

// NOTE: defaultSchema is intentionally NOT exported. Per §6.1.1, consumers must
// always go through createSchema(config) to ensure proper DI of MediaResolver.

// Experimental source-preserving paragraph editing (explicit opt-in consumers).
export { createSourceSession, applySourceTextTransaction, applySourceBlockTransaction, prepareFileSourceEdits } from './source-fidelity'
export type { TextSourceSpan, SourceSession, FidelityFailure, FidelityResult, SourceBlockResult, SourcePatch, FileRootCorrespondence, FileParseWork, SourceFileUpdate, FileSourceResult } from './source-fidelity'

// Shared source/view line-ending projection.
export { projectLineEndings, sourceOffsetAt, viewOffsetAt } from './source-projection'
export type { EolChange, EolProjection } from './source-projection'

export type { SourceRoot, SourceGap, SyntheticEmission, SourceEdit, ProtectedSource } from './source-ownership'

export type { LayoutContainer, BlankLineUnit, FallbackEmpty, SourceLayout } from './source-layout'

export { prepareSourceListBoundarySteps, type SourceListBoundaryResult } from './source-fidelity'
