import { Plugin } from 'prosemirror-state';

/**
 * Link text plugin — Typora-style inline link editing:
 *
 * 1. **Decoration**: Scans text nodes for `[...](...)` literal patterns and
 *    applies a muted CSS class so users can distinguish link syntax from text.
 *
 * 2. **Collapse**: When cursor leaves a `[text](url)` pattern (both non-empty),
 *    auto-convert to a ProseMirror link mark (rendered as clickable link).
 *
 * 3. **Expand**: When cursor enters a rendered link mark, replace the mark
 *    with literal text `[text](url)` so the user can edit both text and URL
 *    directly inline.
 *
 * Schema-agnostic: uses `state.schema.marks.link` rather than an imported
 * singleton, so the plugin works against any consumer-injected schema.
 */

declare function createLinkTextPlugin(): Plugin;

export { createLinkTextPlugin };
