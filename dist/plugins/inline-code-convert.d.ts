import { Plugin } from 'prosemirror-state';

/**
 * Inline mark convert plugin — three responsibilities:
 *
 * 1. **Backtick collapse**: Auto-converts `` `text` `` patterns to code marks
 *    when the cursor leaves the backtick pair. Handles the workflow where the
 *    user types two backticks first, moves the cursor between them, types
 *    content, then leaves.
 *
 * 2. **Cursor target**: Inserts a zero-width space (U+200B) after formatting
 *    marks (`code`, `strong`, `em`, `strike_through`) at the end of textblocks.
 *    WebKit can't position the caret after certain inline elements when there
 *    is no subsequent text node, so the ZWSP provides a DOM target for both
 *    keyboard navigation and mouse clicks.
 *
 * 3. **Stored marks at code–ZWSP boundary**: code is `inclusive: false` so
 *    `marks()` at the boundary excludes it. The plugin proactively sets stored
 *    marks so typing at the boundary still extends code. ArrowRight clears the
 *    stored marks (handled in `editor-props-plugin.ts` `'code-escape'` meta).
 *    `strong` / `em` / `strike_through` are `inclusive: true` so `marks()`
 *    already includes them at the boundary — no `storedMarks` manipulation
 *    needed for those.
 *
 * The U+200B is stripped during markdown serialization (see `serializeMarkdown`).
 */

/** Zero-width space used as cursor anchor after trailing formatting marks. */
declare const ZWSP = "\u200B";
declare function createInlineCodeConvertPlugin(): Plugin;

export { ZWSP, createInlineCodeConvertPlugin };
