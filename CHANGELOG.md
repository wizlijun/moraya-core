# Changelog

All notable changes to `@moraya/markdown-core` are documented here. SemVer.

## [0.1.0] — 2026-05-05 (Initial release)

### Added
- Pure ESM build of Moraya markdown editor core extracted from desktop `src/lib/editor/`
- 4 dependency-injection interfaces: `MediaResolver` / `LinkOpener` / `RendererRegistry` / `Platform`
- ProseMirror schema (23 nodes + 5 marks) via `createSchema(config)` factory
- markdown-it parser + prosemirror-markdown serializer (`parseMarkdown` / `parseMarkdownAsync` / `serializeMarkdown`)
- Editor lifecycle factory (`createEditor` / `createEditorPlugins`)
- 12 plugins: highlight, code-block-view, cursor-syntax, definition-list, editor-props, emoji, enter-handler, inline-code-convert, keybindings, link-text, mermaid-renderer (default disabled)
- `BrowserMediaResolver` reference adapter
- 14 core editing commands
- Doc LRU cache factory (`createDocCache`)
- Roundtrip fixture suite (55 files / 65+ test cases)

### Notes
- Excludes `review-decoration.ts` (Moraya v0.30.0+ team-collab specific; stays in moraya/ desktop repo)
- Tier 1 plugins (highlight / code-block-view / emoji / definition-list) lazy-loaded via dynamic `import()`
- KaTeX rendering errors produce `<span class="math-error" data-tex="..." data-math-type="...">` with byte-stable roundtrip
- Schema requires user-provided `MediaResolver` (no default singleton exported; see v0.60.0-pre §6.1.1)
