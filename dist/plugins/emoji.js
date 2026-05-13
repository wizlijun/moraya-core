// src/plugins/emoji.ts
import { Plugin, PluginKey } from "prosemirror-state";
import { get as getEmoji } from "node-emoji";
var emojiPluginKey = new PluginKey("moraya-emoji");
function createEmojiPlugin() {
  return new Plugin({
    key: emojiPluginKey,
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== ":") return false;
        const { state } = view;
        const $pos = state.doc.resolve(from);
        const textBefore = $pos.parent.textBetween(
          0,
          $pos.parentOffset,
          void 0,
          "\uFFFC"
        );
        const lastColon = textBefore.lastIndexOf(":");
        if (lastColon === -1) return false;
        const shortcode = textBefore.slice(lastColon + 1);
        if (!shortcode || !/^[a-zA-Z0-9_+-]+$/.test(shortcode)) return false;
        const emoji = getEmoji(shortcode);
        if (!emoji) return false;
        const openColonOffset = textBefore.length - lastColon;
        const replaceFrom = from - openColonOffset;
        const tr = state.tr.replaceWith(
          replaceFrom,
          to,
          // `to` is where the closing ":" would be inserted
          state.schema.text(emoji)
        );
        view.dispatch(tr);
        return true;
      }
    }
  });
}
export {
  createEmojiPlugin
};
//# sourceMappingURL=emoji.js.map