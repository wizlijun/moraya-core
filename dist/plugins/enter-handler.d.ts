import { Plugin } from 'prosemirror-state';

/**
 * Enter key handler — unified plugin for all Enter-key variants.
 *
 * In table cells:
 *   - `Ctrl/Cmd+Enter` → add a new row below
 *   - `Shift+Enter` → insert hard break (`<br>`)
 *   - Plain `Enter` → move to same column in next row; exit table from last row
 *
 * In paragraphs:
 *   - `Enter` → split the current block into a new paragraph (no `<br/>`).
 *   - `Enter` after ` ``` ` or ` ```language ` → create code block.
 *   - `Enter` after `| col1 | col2 |` → create GFM table with header + empty data row.
 *
 * Uses `handleKeyDown` (props-level) which has higher priority than keymaps,
 * ensuring this runs before the base keymap's hardbreak / splitBlock handlers.
 */

/**
 * Enter handler plugin. Operates entirely off `view.state.schema`, so it works
 * against any consumer-injected schema produced by `createSchema(config)`.
 */
declare function createEnterHandlerPlugin(): Plugin;

export { createEnterHandlerPlugin };
