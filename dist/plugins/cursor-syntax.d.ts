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
 * Inline mark delimiters:
 *   - strong → `**` ... `**`
 *   - em → `*` ... `*`
 *   - code → `` ` `` ... `` ` ``
 *   - strike_through → `~~` ... `~~`
 *   - highlight → `^^` ... `^^`
 *
 * The `inlineScope` controls how much inline syntax is revealed:
 *   - `'cursor'` (default): only the single mark the cursor sits inside.
 *   - `'line'`: every inline mark in the cursor's textblock, so the whole
 *     current line reads as markdown source (Obsidian Live-Preview style);
 *     moving the cursor to another line re-renders this one.
 *
 * Link marks are handled by `link-text-plugin` (expand/collapse pattern).
 */

/** How much inline markdown syntax the plugin reveals around the cursor. */
type InlineSyntaxScope = 'cursor' | 'line';
declare function createCursorSyntaxPlugin(inlineScope?: InlineSyntaxScope): Plugin;

export { type InlineSyntaxScope, createCursorSyntaxPlugin };
