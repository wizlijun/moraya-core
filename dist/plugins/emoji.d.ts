import { Plugin } from 'prosemirror-state';

/**
 * Lightweight emoji plugin.
 *
 * Converts emoji shortcodes like `:smile:` → 😄 using `node-emoji`.
 * Uses system native emoji rendering (no twemoji images).
 *
 * - Typing `:smile:` auto-converts to 😄 when the closing `:` is typed.
 *
 * `node-emoji` is declared as a peer dep so consumers control its version.
 * The conversion is purely textual via `view.state.schema.text(emoji)` so the
 * plugin works against any consumer-injected schema.
 */

/**
 * ProseMirror plugin that converts `:shortcode:` to native emoji on typing.
 */
declare function createEmojiPlugin(): Plugin;

export { createEmojiPlugin };
