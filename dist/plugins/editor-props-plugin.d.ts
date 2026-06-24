import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Platform, LinkOpener } from '../types.js';

/**
 * Unified editor props plugin — merges 5 separate ProseMirror plugins into one.
 *
 * Faithful 1:1 migration from Moraya desktop `src/lib/editor/plugins/editor-props-plugin.ts`
 * with the following DI changes (v0.60.0-pre §F2.6):
 *   - `editorStore.getState().currentFilePath` → `platform.getCurrentFilePath()`
 *   - `isMacOS` from `$lib/utils/platform` → `platform.isMacOS`
 *   - `import('@tauri-apps/plugin-opener').{openPath,openUrl}` → `linkOpener.open(href)`
 *     (the consumer's LinkOpener implementation routes to the right platform API)
 *
 * Consolidated props:
 *  - `clipboardTextParser`: parse pasted plain text as Markdown (render instead of escape)
 *  - `transformPastedHTML`: paste language fix (copy `class="language-xxx"` → `data-language`)
 *  - `handleDOMEvents.mousedown`: math_block click → prevent WebKit broken selection;
 *    Cmd/Ctrl+click on links → open externally via LinkOpener
 *  - `handleDOMEvents.keydown/keyup`: toggle link-hover cursor class on Cmd/Ctrl;
 *    fast AllSelection delete; WKWebView end-of-textblock Backspace fix
 *  - `handleClick`: click below content → append paragraph + place cursor
 *  - `handleClickOn`: image click → TextSelection (prevent NodeSelection blue highlight)
 *  - `handleKeyDown`: ArrowRight escape; fast AllSelection delete (fallback)
 *  - `decorations`: WKWebView caret fix for empty paragraphs (macOS only)
 *  - `view` lifecycle: scroll-after-paste; empty-doc focus recovery
 *
 * Reducing 5 plugin instances to 1 saves ~4 apply() traversals per transaction.
 */

/**
 * Toggle a task-list checkbox when the user clicks its marker. The schema emits
 * no <input> — the checkbox is a CSS `::before` pseudo-element drawn in the list
 * item's left padding band (see editor-base.css). So we hit-test the click
 * against that band rather than a real element, then flip the `checked` attr,
 * which re-serialises the Markdown to `[x]` / `[ ]`.
 *
 * Returns true when a checkbox was toggled (so the caller suppresses the default
 * click handling), false otherwise.
 */
declare function toggleTaskCheckboxAtClick(view: EditorView, event: MouseEvent): boolean;
interface EditorPropsPluginOptions {
    platform: Platform;
    linkOpener: LinkOpener;
}
declare function createEditorPropsPlugin(opts: EditorPropsPluginOptions): Plugin;

export { type EditorPropsPluginOptions, createEditorPropsPlugin, toggleTaskCheckboxAtClick };
