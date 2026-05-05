import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorState } from 'prosemirror-state'
import type { Node } from 'prosemirror-model'

/**
 * Code block syntax highlighting plugin (Tier 1, lazy-loaded).
 *
 * v0.1.0 ships a no-op stub: the actual highlight.js integration is wired in
 * Moraya desktop's existing impl (995-line schema + 730-line setup) and will be
 * fully ported in T2 follow-up patches. This stub validates the plugin's
 * structural shape (PluginKey + decorations slot) for fingerprint snapshot tests.
 */

export const highlightPluginKey = new PluginKey('moraya-highlight')

export function createHighlightPlugin(): Plugin {
  return new Plugin({
    key: highlightPluginKey,
    state: {
      init: (_, state) => buildDecorations(state.doc),
      apply: (tr, prev) => {
        if (!tr.docChanged) return prev
        return buildDecorations(tr.doc)
      },
    },
    props: {
      decorations(state: EditorState) {
        return this.getState(state)
      },
    },
  })
}

function buildDecorations(doc: Node): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') {
      decos.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: 'moraya-code-block',
          'data-lang': (node.attrs.params as string) || '',
        })
      )
    }
  })
  return DecorationSet.create(doc, decos)
}
