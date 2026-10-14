## Unreleased — explicit Mermaid capability

- SDK behavior change: Mermaid preview requires `mermaidLoader`; missing loader always shows editable source. `enableMermaid: false` suppresses injection; true does not create a default. See README migration example to restore the previous preview.
- Isolate pending/completed enhancement factories by schema, registry and loader; keep per-loader preview cache and prevent late results after language changes or destruction. Loading and syntax failures retain editable source and Preview retry.

# Changelog

All notable changes to `@moraya/core` are documented here. SemVer.

## Unreleased

- Bold and italic images preserve adjacent Unicode text through local delimiter-flanking entities, including plain typing beside retained image wrappers. / 粗体和斜体图片通过必要的局部实体保留相邻 Unicode 文本语义，既有图片包裹边界外的普通输入不再丢字。

- Captured image occurrences now support local insertion, marks, resize attributes and deletion without rewriting neighbouring Markdown or reference definitions. Deleting an image preserves newly exposed semantic spaces. Empty-line input retains preceding empty paragraphs; table image titles escape pipes through the existing callback. / 图片发生位置支持局部插入、格式、尺寸属性和删除，保留邻文及引用定义原字节；删除图片保留新暴露的边缘空白语义，空行首次输入保留前置空段，表格图片标题通过既有回调转义管道符。

- Ordinary typing at captured link edges now preserves link wrappers and reference definitions; a new literal exclamation before a link is escaped locally. / 链接边界的普通输入保留原链接外壳与引用定义；链接前新增的字面感叹号只作局部转义。

- Typing unmarked letters next to punctuation at a retained bold or italic edge preserves the existing Markdown wrapper and encodes only the new Unicode scalar. / 在既有粗体或斜体标点边界外输入普通文字时，保留原 Markdown 包裹，仅对新增 Unicode 字符作必要实体编码。

- Rich literal punctuation now enters the existing escaped inline recipe before candidate parsing, so continuous `**bold**!` typing retains every intermediate keystroke and reaches the real InputRule. / 富文本字面标点在候选解析前使用既有局部转义配方，连续输入 `**bold**!` 不再丢失中间按键，并正常触发真实输入规则。

- A single point-note replacement can consume a certified, unmarked text range in one source edit, preserving its surrounding bytes. Atom, annotation and unmapped ranges remain rejected. / 点批注可用单个替换步骤消耗已证明、无格式标记的文本范围，保留周围原文；原子节点、批注及无映射范围仍拒绝。

- Editor factories can configure the final schema, provide the first captured state, and own transaction admission without an intermediate legacy parse. Default consumers retain the existing initialization and dispatch behavior. / 编辑器工厂可在首次挂载前配置最终 schema、直接提供捕获状态并接管事务准入，无需先安装旧解析结果；默认调用路径保持原行为。

- Add the isolated `source-history` entry with reversible raw/binding and table-layout Steps, strict JSON payloads, and synchronous failure scopes. Rich list commands can prepare exact boundary comments before source validation, including nested list seams. / 新增独立历史载荷入口与严格可逆校验；富文本列表操作可在保真校验前补充必要边界注释（含嵌套列表）。文件控制器与界面接线后续实现。 Single wide mark Steps may cross certified unchanged synthetic blank paragraphs without shrinking their original range. / 单个宽范围格式步骤可跨越已证明未变的空段，仍完整审计原范围。

- Existing math block commands use the actual editor schema and source-save canonical empty blocks as `$$ $$`. Real math InputRules and whole inline math insertion/deletion preserve neighbouring source spelling; mathematical payload editing remains in Source mode. Structural math permissions follow complete original step witnesses before rendering.

- First input in definition-only empty quote and list paragraphs now keeps the actual reference-definition separator, including marker-only list lines and continued input after deleting a point note. Protected definition bytes remain unchanged.

- Source code-mark toggles now encode only selected text whose code context changes, retaining untouched entity/escape bytes. Deleting a marked point note removes only actual wrappers left without content, including its certified terminal EOL; wrappers covering surviving text remain.

- Source-preserving CriticMarkup edits update only actual annotation payloads, retain separate source wrappers and inner formatting, and support range-note addition/removal plus point-note insert/edit/remove in certified empty paragraphs and table cells. Point-only deletion consumes only certified redundant separators or its own terminal EOL. Aggregate inline/annotation artifacts and installed consumer validation accompany this change; full file UI/history and formula editing remain separate.

- Source inline formatting splits crossing mark envelopes into valid nesting, keeps code spans inside other marks, and preserves certified untouched math occurrences in the same body without granting formula editing permission.

- Source transactions preserve original inline syntax during partial and cross-body mark commands, actual inline InputRules, editable code spans, and marked/link first input in certified empty bodies. Closed top-level code fences grow only the necessary markers on collisions. Source and consumer tests are committed; compiled artifacts and installed-host acceptance follow in the annotation integration task.

- Source-preserving ordinary first input now materializes certified empty paragraphs, headings, list/quote/footnote bodies, table cells and closed code/frontmatter bodies while retaining untouched bytes. Restores installed fence interruption rules. Source capture also preserves actual nested blank paragraphs and supports consecutive Enter/first-input transactions, including closed-code newlines and first input beside protected reference definitions. Compiled artifacts and installed-host command coverage accompany this foundation; full file UI/history integration follows separately.

- Source-preserving transactions now map actual nested prose, headings, table cells and supported literal bodies, retaining untouched Markdown bytes and protected definitions. Complete LF container windows can reparse locally with bounded block work and replay remote reference changes. File UI, history, native/IME integration and dedicated literal delimiter changes remain future work.

## [0.1.0] — 2026-05-07

Initial public release on npmjs.com. Faithful 1:1 extraction of Moraya desktop's `src/lib/editor/` markdown editor core into a host-agnostic, dependency-injected ESM package, per the iteration spec at [`v0.60.0-pre-shared-markdown-core.md`](https://github.com/zouwei/moraya/blob/main/docs/iterations/v0.60.0-pre-shared-markdown-core.md).

### Package identity

- **Name**: `@moraya/core` (final name; renamed twice during pre-release: working name `@moraya/markdown-core` → interim `@zouwei/moraya-core` (GitHub Packages attempt) → final `@moraya/core` (npmjs.com public))
- **Repo**: https://github.com/zouwei/moraya-core (public)
- **Registry**: npmjs.com (https://registry.npmjs.org), `access: public` — anyone can `npm install @moraya/core` with no token
- **License**: PolyForm Internal Use 1.0.0

### Distribution rationale

The original spec §5.1 chose GitHub Packages (private) for cost reasons, but GitHub Packages requires authentication even for public packages — incompatible with Moraya's open-source distribution model. The pre-release `@zouwei/moraya-core@0.1.0` published to GitHub Packages on 2026-05-06 was unpublished; `@moraya/core@0.1.0` on npmjs.com supersedes it.

### Surface

- **Schema**: `createSchema(config)` factory + 23 nodes / 6 marks (faithful 1:1 from desktop)
- **Markdown**: `parseMarkdown` / `parseMarkdownAsync` (≥50KB threshold) / `serializeMarkdown` with cross-schema parser cache
- **Editor lifecycle**: `createEditor` / `createEditorPlugins` / `preloadEnhancementPlugins` (Tier 1 chunked dynamic import: highlight + emoji + code-block-view)
- **Plugins** (11 total): 8 base + 3 DI-coupled (highlight / editor-props / code-block-view); `review-decoration` excluded (stays in moraya for v0.30.0+ team-collab)
- **Doc cache**: `createDocCache(maxEntries?)` + `djb2Hash`
- **Commands** (14): bold/italic/strike/code/heading/blockquote/lists/code-block/table/HR/math-block/link/image
- **Adapters**: `BrowserMediaResolver` (Tauri / Electron / Capacitor adapters live in their consumer repos)
- **DI seams**: `MediaResolver` / `LinkOpener` / `RendererRegistry` / `Platform` (4 interfaces, §3.3)

### Engineering contract

- **Pure ESM** — `dist/` contains 0 Node API imports, 0 `require()`, 0 host-specific imports (verified by 4 §1.1.4 CI gates)
- **Bundle**: main entry **34 KB gzipped** (42% of 80 KB budget)
- **Tests**: 106 vitest cases across 4 spec files
  - 72 roundtrip tests (55 fixture files + 17 schema-critical data traps)
  - 23 API contract tests
  - 6 plugin-order fingerprint snapshots
  - 5 adapter unit tests
- **Behavior parity**: §1.2.2 layer 1 (fixture roundtrip) + layer 2 (plugin order snapshot) green; layer 3 (3-note byte-diff) deferred to consumer-side smoke test

### Tarball hygiene

`pnpm pack` produces a 58-entry tarball containing only:
- `package/LICENSE`, `package/package.json`, `package/CHANGELOG.md`, `package/README.md`
- `package/dist/**/*.{js,js.map,d.ts}`

No `*.svelte`, `src-tauri/`, `*.test.ts`, lockfile, or fixtures leak into the published artifact.

---

## [Unreleased / pre-release notes] — schema + markdown + plugins/setup + DI plugins migration batches (2026-05-05 — 2026-05-06)

### DI plugins batch (2026-05-06)

Final batch of plugin migration. All 11 ProseMirror plugins from Moraya desktop's `src/lib/editor/plugins/` (excluding `review-decoration.ts` which stays in moraya/) are now in core.

#### Added (3 DI-coupled plugins migrated faithfully)

**`plugins/highlight.ts`** — full faithful 1:1 migration replaces the prior no-op stub.
- Imports + registers 39 highlight.js languages (javascript / typescript / python / rust / go / c / cpp / java / ruby / php / swift / kotlin / yaml / json / bash / sql / xml / html / css / scss / dart / r / perl / scala / objectivec / dockerfile / ini / powershell / makefile / groovy / elixir / haskell / protobuf / graphql / latex / nginx / shell / markdown / diff / lua + svelte/jsx/tsx aliases + cs / py / sh / rb / kt / yml / md / pl / objc / ex / hs / proto / gql / tex / nginxconf / ps1)
- `flattenHljsTree(rootNode)` + `scopeToClasses` walk hljs v11 emitter tree
- Per-block cache keyed by `(language, code)` with FIFO eviction at 100 entries (Moraya CLAUDE.md "Performance Coding Standards" §6 contract)
- 300 ms debounced full re-highlight via metadata-only transaction
- File-switch (`tr.getMeta('file-switch')`) and full-delete (`tr.getMeta('full-delete')`) paths rebuild from scratch
- Short-circuit when `tr.mapping` doesn't touch any code_block (saves ~90% of keystroke debounces)
- Schema-agnostic (no `$lib/` imports); zero behavior drift from desktop

**`plugins/editor-props-plugin.ts`** — full faithful 1:1 migration with `Platform` + `LinkOpener` DI.
- `editorStore.getState().currentFilePath` → `platform.getCurrentFilePath()`
- `isMacOS` from `$lib/utils/platform` → `platform.isMacOS`
- `import('@tauri-apps/plugin-opener').{openPath,openUrl}` → `linkOpener.open(href)` (consumer's LinkOpener routes URL vs local-file)
- 5-plugin merge preserved: `clipboardTextParser` + `handlePaste` (markdown image / empty link / degenerate slice fallbacks) + `transformPastedHTML` (language- → data-language) + `handleDOMEvents.{click,mousedown,keydown,keyup}` (link-hover class / Cmd+click open / math_block click / fast AllSelection delete / WKWebView Backspace fix) + `handleClick` (click-below-content append paragraph) + `handleClickOn` (image → TextSelection) + `handleKeyDown` (ArrowRight ZWSP escape / fast AllSelection delete fallback) + `decorations` (caret-empty-para macOS) + `view` lifecycle (scroll-after-paste + WKWebView empty-doc focus recovery)
- `isLocalFilePath` / `resolveLocalPath` ported as pure helpers (resolve-against-currentFile uses `platform.getCurrentFilePath()`)

**`plugins/code-block-view.ts`** — full faithful 1:1 migration with `RendererRegistry` DI.
- `RENDERER_PLUGINS` / `loadRendererPlugin` / `rendererVersions` (moraya-internal) → `RendererRegistry` injected via `createCodeBlockNodeViewFactory({ rendererRegistry })`
- Renderer plugin language list + versions derived from `registry.versions` keys
- Mermaid still has built-in special-case path (`language === 'mermaid'`) using core's `plugins/mermaid-renderer.ts`
- `LanguageEntry` registry (POPULAR_LANGUAGES + BASE_OTHER_LANGUAGES + dynamic renderer-plugin entries) + `findLanguageLabel`
- Language picker with auto-detect via `hljs.highlightAuto` (relevance > 5 threshold), grouped Popular / All / Renderer Plugins, keyboard nav, outside-click + Escape dismiss, focus-stealing-prevention via append-to-`.editor-wrapper` (not into ProseMirror DOM)
- Mermaid render path: lazy `loadMermaidApi()` → serial render queue → debounce 150 ms → SVG injection or error fallback → theme-change re-render via MutationObserver on `data-theme`
- Renderer render path: `registry.load(lang).render(source, container)` with §3.3 error contract: `<div class="renderer-error" data-language data-error>` fallback DOM, `module.destroy?(container)` called on lang-change / NodeView destroy
- Copy button + toggle-edit/preview button + `stopEvent` / `ignoreMutation` / `update` / `selectNode` / `deselectNode` / `destroy` lifecycle 1:1 from moraya
- 580 lines → ~700 lines (faithful, no shortcuts; the §1.2.4 "no simplification" rule is honored)

#### Wired into setup.ts (this batch)
- `preloadEnhancementPlugins(schema, rendererRegistry?)` now loads **3 chunks** in parallel: highlight + emoji + **code-block-view** (was 2 in previous batch)
- Cache key extended from `Schema` → `{ schema, rendererRegistry }` so consumers with different registry produce different cached factories
- `createEditorPlugins` adds `createEditorPropsPlugin({ platform, linkOpener })` between `columnResizing` and `cursorSyntax`
- `createEditor` wires `nodeViews.code_block` from `tier1.codeBlockView`
- Default `LinkOpener` (`window.open(href, '_blank', 'noopener,noreferrer')`) added when consumer doesn't inject one

#### Plugin order snapshot updates (§1.2.2)
Snapshot diffs reflect intentional changes:
- New `moraya-editor-props$` plugin added between `tableColumnResizing$` and `moraya-cursor-syntax$` (rank 8 → 9 shift for downstream plugins)
- Highlight key renamed: `moraya-highlight$` (stub) → `moraya-syntax-highlight$` (faithful)
Snapshots regenerated and committed per §1.2.2 reviewer-approval workflow.

#### Verification (this batch)
- ✅ `pnpm typecheck` clean (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- ✅ `pnpm test`: **68/68 pass** (snapshots updated + all roundtrip / api-contract / data-trap / plugin-order tests still passing)
- ✅ `pnpm build`: ESM + .d.ts; `dist/index.js` gzipped = **33.9 KB** (41% of 80 KB budget)
- ✅ §1.1.4 purity gates green (`.js` only): 0 Node API / 0 `require()` / 0 `@tauri-apps`/`@capacitor`/`electron` imports in dist
- ✅ Tier 1 chunks: `highlight.js` 2.4 KB gzipped, `code-block-view.js` 6.1 KB gzipped (hljs + mermaid live in consumer's bundle as peer deps)

#### Plugin migration progress: 11/11 ✅
| Plugin | Status |
|---|---|
| keybindings | Stays in moraya (static data, not a PM plugin) |
| definition-list | ✅ migrated |
| emoji | ✅ migrated |
| cursor-syntax | ✅ migrated |
| enter-handler | ✅ migrated |
| inline-code-convert | ✅ migrated |
| link-text | ✅ migrated |
| mermaid-renderer | ✅ migrated |
| **highlight** | ✅ migrated (this batch) |
| **editor-props-plugin** | ✅ migrated (this batch) |
| **code-block-view** | ✅ migrated (this batch) |
| review-decoration | Stays in moraya (v0.30.0+ team-collab specific) |



### plugins + setup batch (2026-05-06)

#### Added (8 plugins migrated faithfully)
- **`plugins/definition-list.ts`** — `createDefListInputRule(schema)` factory (schema-parameterized)
- **`plugins/emoji.ts`** — `createEmojiPlugin()` converts `:shortcode:` → emoji via `node-emoji` peer dep
- **`plugins/cursor-syntax.ts`** — Typora-style source-syntax overlay (heading/blockquote prefix + paired mark delimiters for strong/em/code/strike_through)
- **`plugins/enter-handler.ts`** — unified Enter-key handler (table cell row navigation + Cmd+Enter add row + Shift+Enter hardbreak + plain Enter exits last row + code-fence detection + pipe-table detection with `parsePipeTableHeader`/`buildTableFromHeaders`)
- **`plugins/inline-code-convert.ts`** — backtick-pair collapse + ZWSP cursor target after trailing `code/strong/em/strike_through` marks + storedMarks management at code-ZWSP boundary
- **`plugins/link-text-plugin.ts`** — `[text](url)` literal-text decoration + cursor-leave collapse to link mark + cursor-enter expand-back-to-literal
- **`plugins/mermaid-renderer.ts`** — lazy-loaded mermaid render utility (serial render queue, theme-color resolution from CSS custom properties); `mermaid` declared as optional peer (`peerDependenciesMeta.mermaid.optional = true`)

All plugin code is **host-agnostic**: zero Tauri / store / DOM-singleton imports. Schema lookups go through `state.schema.nodes[name]` / `state.schema.marks[name]` so each plugin works against any consumer-injected schema produced by `createSchema(config)`.

#### Skipped (intentional — moved out of core scope)
- **`keybindings.ts`** is **NOT a ProseMirror plugin** — it's static `KeyBinding[]` data consumed only by Moraya's CommandPalette UI (file save / zoom / sidebar toggle / etc.). Heavily app-specific shortcut metadata; stays in moraya/. The v0.60.0-pre §3 file-tree listing this in `plugins/` was a documentation artifact.

#### Pending for next batch (3 DI-coupled plugins)
- `editor-props-plugin.ts` (580 lines, needs `Platform.getCurrentFilePath` + `isMacOS` + `LinkOpener.open` injection)
- `code-block-view.ts` (780 lines, needs full `RendererRegistry` integration + mermaid wiring)
- `highlight.ts` faithful hljs integration (current core stub is no-op; full migration requires per-block decoration cache from Moraya CLAUDE.md performance §6/§9 contract)

### setup.ts batch (2026-05-06)

Replaces the 6KB minimum-viable stub with a 21KB faithful migration of Moraya desktop's editor lifecycle (730 lines).

#### Added
- `preloadEnhancementPlugins(schema)` — schema-keyed Tier 1 lazy-load cache (highlight + emoji currently; code-block-view + KaTeX CSS in next batch)
- `createImageSelectionPlugin()` — blue-overlay decoration for selected image / `<img>` html_inline nodes
- **`buildInputRules(schema, tier1)`** — 12 input rules: code-fence, blockquote, bullet/ordered list, heading 1-6, hr, math block + inline, strong (`**` / `__`), em (`*` / `_`), inline code, strike_through (`~~`), task-list checkbox, link `[text](url)`, def-list (Tier 1)
- **`buildKeymap(schema)`** — full keymap from Moraya:
  - `Mod-z/y/Shift-z` → `undo` / `redo` (top-level ESM imports, replaces 3 `require('prosemirror-history')` calls per §1.1.1 Pure ESM)
  - `Mod-b/i/e/Shift-x` → strong / em / code / strike_through marks
  - `Mod-Alt-0..6` → paragraph / heading levels
  - `Mod-Alt-c` → code_block, `Mod-Shift-b` → blockquote
  - `Tab` / `Shift-Tab` / `Mod-]` / `Mod-[` → list indent/outdent
  - `Mod-a` → code-block-local select-all OR doc-wide AllSelection
  - `Shift-Enter` → hardbreak with `isInline: false`
  - `Backspace` → 5-case WebKit contenteditable bug fix (full-doc fast delete + NodeSelection-on-atom + cursor-end-before-atom + cursor-start-after-atom + end-of-paragraph-after-inline-atom + end-of-textblock surrogate-pair-aware delete)
  - `Delete` → block-atom protection (NodeSelection move + textblock-end consume)
- **listShortcutsPlugin** — `Cmd+Alt+O/U/X` → ordered/bullet/task list using `event.code` (macOS Option-key safe, Moraya CLAUDE.md "Option键快捷键处理" feedback memory)
- **`createDirtyTrackPlugin`** + **`createLazyChangePlugin`** — O(1) text-content callback vs debounced markdown-serialization callback
- Full `createEditor(opts)` + `createEditorPlugins(opts, schema?)` — assembles 13 base plugins + Tier 1 lazy-loaded plugins in faithful order:
  1. listShortcuts → 2. inputRules → 3. enter-handler → 4. buildKeymap → 5. baseKeymap →
  6. history (skippable for v0.72 Yjs) → 7. dropCursor → 8. columnResizing →
  9. cursorSyntax → 10. linkText → 11. inlineCodeConvert → 12. imageSelection →
  13. dirty/lazy-change → 14. Tier 1 highlight + emoji
- `wrapInBulletList` / `wrapInOrderedList` / `wrapInTaskList` exported from `commands.ts` (schema-agnostic via `state.schema`)

#### Plugin order fingerprint (§1.2.2)
- New `__tests__/plugin-order.spec.ts`: 6 snapshot/assertion tests covering default Web config, desktop-style config, history disabled (Yjs path), table-resize disabled, onChange/onDocChanged callback variants. **Snapshot is committed** so any reorder/add/remove triggers explicit reviewer review.

#### New peer deps
- `mermaid@^11.0.0` (optional via `peerDependenciesMeta`)
- `node-emoji@^2.0.0`
- `prosemirror-commands@^1.7.0`
- `prosemirror-dropcursor@^1.8.0`
- `prosemirror-inputrules@^1.5.0`
- `prosemirror-keymap@^1.2.0`
- `prosemirror-schema-list@^1.5.0`
- `prosemirror-tables@^1.8.0`

#### Verification (this batch)
- ✅ `pnpm typecheck` clean (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- ✅ `pnpm test`: **68/68 pass** (was 62/62; +6 plugin-order fingerprint tests)
- ✅ `pnpm build`: ESM + .d.ts; `dist/index.js` gzipped = 22.7 KB (28% of 80 KB budget)
- ✅ §1.1.4 purity gates green: 0 Node API / 0 `require()` / 0 host imports in dist
- ✅ All `require()` calls in original Moraya `setup.ts:282/286/290/343` replaced with top-level ESM imports per §1.1.1

### markdown.ts batch (2026-05-06)

### markdown.ts batch (2026-05-06)

#### Added
- Faithful 1:1 migration of Moraya desktop `markdown.ts` (912 lines)
- Full token override `MorayaMarkdownParser` class:
  - `tr_open` dispatches to `table_header_row` (inside `<thead>`) vs `table_row` —
    fixes "thead content lost to auto-inserted empty header row" bug
  - `th_open/close` + `td_open/close` wrap inline content in inner `paragraph`
    so `content: 'paragraph+'` cells aren't dropped by `createAndFill`
  - `link_open` detects empty-text links `[]()` / `[](url)` and inserts the raw
    markdown syntax as literal text instead of an empty (=removed) mark
  - `html_inline` handler:
    - Combines single-line `<audio>` / `<video>` opening + closing into one
      `html_inline` atom node so `toDOM` can render media players
    - Pre-scanned paired tags (`htmlPaired` meta) become `html_mark` open/close
      so paired raw HTML like `<font>...</font>` round-trips as styled marks
    - Unpaired tags stay as `html_inline` atom nodes for byte-stable roundtrip
  - `html_block` handler:
    - Promotes standalone `<img>` / `<video>` / `<audio>` blocks to
      `paragraph(html_inline)` so they render as media instead of code blocks
    - Multiple `<img>` tags in one block are joined with inline hardbreaks
- `tagPairedHtmlInline` pre-processor: scans inline tokens and tags paired
  HTML opening/closing tags with `meta.htmlPaired = true`
- `preserveBlankLines` post-processor: injects empty paragraph tokens for
  consecutive blank lines so multi-Enter spacing roundtrips faithfully
- Math support via `markdown-it-texmath` (peer dep): `math_inline`,
  `math_inline_double` (mapped to `math_inline`), and `math_block`
- Definition list support via `markdown-it-deflist` (peer dep)
- GFM table + strikethrough enabled (`md.enable(['table', 'strikethrough'])`)
- Task list checkbox detection in `list_item` getAttrs:
  - `[x]` / `[ ]` parsed from inline content into `checked: boolean | null`
  - Literal checkbox text stripped from the rendered text
- `image` getAttrs decodes URL-encoded backslashes (`%5C` → `\`) so Windows
  local image paths roundtrip correctly
- `link` getAttrs decodes percent-encoded non-ASCII UTF-8 sequences (e.g.
  Chinese / Japanese / Korean) while leaving ASCII encodings (`%20` etc.) intact
- Pre-parse normalizers:
  - `normalizeMathBlocks`: ensures `$$..$$` is surrounded by blank lines so
    texmath parses it as `math_block` (not `math_inline_double`)
  - `normalizeSmartQuotes`: converts curly quotes in image/link title
    delimiters to straight quotes
- Post-serialize cleanup:
  - Un-escapes over-escaped link syntax (`\[\](url)` → `[](url)`)
  - Strips zero-width spaces (`​`) used as cursor targets

#### Serializer
- 23 node serializers (incl. `table` with alignment-aware separator,
  `renderTableRow` helper using output-buffer capture, `math_inline`,
  `math_block`, `defList` / `defListTerm` / `defListDescription`,
  `html_block`, `html_inline`, `hardbreak` always emitting `'  \n'`)
- 6 mark serializers (incl. `html_mark` writing `mark.attrs.openTag` /
  `closeTag`, autolink-aware `link.open`/`close`, mixable `strike_through`)
- `serialize(doc, { tightLists: true })`

#### New fixtures (8→17)
- `09-table-aligned.md` — pipe table with left/center/right alignment
- `10-table-no-header.md` — pipe table sanity check
- `11-math-inline.md` — `$..$` inline math (KaTeX peer dep)
- `12-math-block.md` — `$$..$$` block math (multi-equation)
- `13-raw-html.md` — `<font>` paired tag (html_mark) + `<sub>` + unpaired `<br>`
- `14-def-list.md` — definition list via markdown-it-deflist
- `15-task-list.md` — GFM task list with checkbox stripping
- `16-cn-punctuation.md` — full-width CJK punctuation + bold/italic/strike on CJK
- `17-strikethrough-nested.md` — strikethrough nested inside bold + with em inside

#### New explicit data-trap tests (§4.4)
- block math `$$..$$` does NOT degrade to inline `$..$` after roundtrip
- raw HTML `<font>` preserved verbatim (no markdown conversion)
- paired `<sub>` round-trips byte-stably as `html_mark`
- table first child IS `table_header_row` (the table parsing fix)
- table cells use paragraph-wrapped content (not bare text)
- task list checkbox attrs recovered + literal `[x]`/`[ ]` stripped
- definition list parses to `defList` / `defListTerm` / `defListDescription`

#### Verification (this batch)
- ✅ `pnpm typecheck` clean
- ✅ `pnpm test`: **62/62 pass** (was 46/46; +9 fixture roundtrips, +7 data-trap tests)
- ✅ `pnpm build`: ESM + .d.ts; `dist/index.js` gzipped = 12.8 KB (16% of 80 KB budget)
- ✅ §1.1.4 purity gates: 0 Node API / 0 `require()` / 0 `@tauri-apps`/`@capacitor`/`electron` in dist
- ✅ New peer deps declared (`markdown-it-deflist@^3`, `markdown-it-texmath@^1`)
  with TS shim declarations in `src/shims.d.ts`

### Schema batch (2026-05-05)

> **Honest status**: previous "0.1.0" CHANGELOG overclaimed scope. The actual
> v0.60.0-pre §1.2 *faithful migration* is in progress and shipped per-batch
> rather than as a single drop. Below is the real state at each batch boundary.
> The package will not be tagged & published until all batches land + Moraya
> desktop bridge layer is wired up + behavior parity (§1.2.2) is verified.

### Schema batch (this batch)

#### Added
- ProseMirror schema 1:1 faithful migration from Moraya desktop `src/lib/editor/schema.ts`:
  - **23 nodes**: doc, text, paragraph, heading, blockquote, code_block,
    horizontal_rule, bullet_list, ordered_list, list_item, image, hardbreak,
    html_block, html_inline, table, table_header_row, table_row,
    table_header, table_cell, math_inline, math_block,
    defList, defListTerm, defListDescription
  - **6 marks**: html_mark, strong, em, code, link, strike_through
  - All node attributes match Moraya exact 1:1 (no rename / no schema simplification)
- KaTeX rendering inside `math_inline` / `math_block` `toDOM` (peer dep; no DI needed)
- HTML helpers (`extractHtmlAttr`, `extractAllHtmlAttrs`, `htmlTagToStyle`,
  `showBrokenImage`, `createMediaElement`) ported as pure DOM helpers
- Path detection helpers (`isAbsoluteFilePath`, `isRelativePath`,
  `resolveRelativePath`) ported as pure string ops
- Tauri `read_file_binary` IPC + `plugin-http` calls in image / video / audio
  loaders are replaced by consumer-injected `MediaResolver` methods
  (`loadLocalImage` / `loadLocalMedia` / `loadRemoteMedia`)
- Module-level `documentBaseDir` state preserved with public
  `setDocumentBaseDir(dir)` / `getDocumentBaseDir()` exports
  (pure string state, not Tauri-coupled)
- KaTeX render-error fallback marks math node with
  `class="math-error" data-math-type="inline|block"` per §4.4 contract

#### Changed
- `code_block.attrs.params` → `code_block.attrs.language` (matches Moraya naming)
- `hard_break` node → `hardbreak` (matches Moraya naming + `leafText()` returns `\n`)
- `strikethrough` mark → `strike_through` (matches Moraya naming)
- `bullet_list` / `ordered_list` no longer have `tight` attr (Moraya schema doesn't track tightness on the list node)
- `image` no longer has `width` attr (Moraya encodes width in `title="width=70%"`)
- `list_item` now carries `label` / `listType` / `spread` / `checked` attrs (task-list support)
- `code_block.attrs.language` defaults to `'text'` (was `''`); fence info `''` → `'text'`
- `defaultSchema` now built from the full faithful 23N+6M, not the prior 15-node stub

### Still pending (subsequent batches)
- 38 fixtures (currently 17): empty-replace / link-input-rule / large-async /
  KaTeX error / frontmatter YAML/TOML/JSON / footnote / wikilink / hashtag /
  Mermaid / blockquote-nested / autolink / hardbreak edge cases / 50KB real doc, etc.
- Moraya desktop bridge layer + `TauriMediaResolver` / `TauriLinkOpener` /
  `MorayaRendererRegistry` injection + bridge schema.ts re-export shim
- Moraya desktop end-to-end smoke (`pnpm tauri dev`, save → disk byte diff vs v0.39.0 baseline)
- `@moraya/markdown-core@0.1.0` first publish to GitHub Packages (only after bridge + behavior parity)
- Behavior parity 3-layer verification (§1.2.2): plugin order fingerprint snapshot,
  fixture roundtrip CI gate dual-run with Moraya desktop, hand-test 3 representative
  notes save → disk byte diff
- Moraya desktop bridge layer + `TauriMediaResolver` / `MorayaRendererRegistry` injection
- `@moraya/markdown-core` first publish to GitHub Packages (only after all of above)

### Verification (this batch)
- ✅ `pnpm typecheck`: clean (`tsc --noEmit`, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- ✅ `pnpm test`: 46/46 pass (3 spec files: api-contract, roundtrip, adapter)
- ✅ `pnpm build`: ESM + .d.ts emit, dist/index.js gzipped = 9.1 KB (89% under 80 KB budget)
- ✅ §1.1.4 purity gates: 0 Node API imports, 0 `require()`, 0 `@tauri-apps`/`@capacitor`/`electron` in dist

### Notes
- Excludes `review-decoration.ts` (Moraya v0.30.0+ team-collab specific; stays in moraya/ desktop repo)
- Schema requires consumer-provided `MediaResolver` (no default singleton exported; see v0.60.0-pre §6.1.1)
- The internal `defaultSchema` (sentinel-tagged null resolver) is used only by
  `parseMarkdown` / `serializeMarkdown` and is NOT exported via `index.ts`
