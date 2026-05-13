import { Plugin } from 'prosemirror-state';

/**
 * Cursor syntax plugin — Typora-style source-syntax overlay.
 *
 * Shows the source markdown delimiters (`# `, `> `, `**`, `*`, `` ` ``, `~~`)
 * around the cursor position so users see the underlying syntax while editing
 * rendered prose. Uses ProseMirror Decoration widgets with `side: ±1` so the
 * widgets sit visually adjacent to the cursor without becoming part of the
 * editable text.
 *
 * Block-level prefixes shown:
 *   - heading 1-6 → `# `, `## `, ... `###### `
 *   - blockquote → `> `
 *
 * Inline mark delimiters shown when cursor is inside the mark:
 *   - strong → `**` ... `**`
 *   - em → `*` ... `*`
 *   - code → `` ` `` ... `` ` ``
 *   - strike_through → `~~` ... `~~`
 *   - highlight → `^^` ... `^^`
 *
 * Link marks are handled by `link-text-plugin` (expand/collapse pattern).
 */

declare function createCursorSyntaxPlugin(): Plugin;

export { createCursorSyntaxPlugin };
