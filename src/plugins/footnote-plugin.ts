/**
 * Footnote plugin — 角标编号与交互。
 *
 * 编号是**派生值**:按 `footnote_ref` 在正文中首次出现的顺序给每个 label 分配序号,
 * 同一 label 的多次引用共用一个编号。它不进节点 attrs(那会污染磁盘语义),而是每次
 * 文档变化时重算并以 Decoration 的形式挂上 `data-num`,由 CSS `content: attr(data-num)`
 * 渲染出来。
 *
 * Schema-agnostic:通过 `node.type.name` 判定,不引用 schema 单例。
 */

import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node as PmNode } from 'prosemirror-model'

export const footnotePluginKey = new PluginKey('moraya-footnote')

/** 按首次出现顺序给每个 label 编号,并为每个引用生成一个 data-num decoration。 */
function buildDecorations(doc: PmNode): DecorationSet {
  const numByLabel = new Map<string, number>()
  const decos: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'footnote_ref') return
    const label = (node.attrs.label as string) || ''
    let num = numByLabel.get(label)
    if (num === undefined) {
      num = numByLabel.size + 1
      numByLabel.set(label, num)
    }
    decos.push(Decoration.node(pos, pos + node.nodeSize, { 'data-num': String(num) }))
  })

  return DecorationSet.create(doc, decos)
}

export function createFootnotePlugin(): Plugin {
  return new Plugin({
    key: footnotePluginKey,
    state: {
      init(_config, state: EditorState) {
        return buildDecorations(state.doc)
      },
      apply(tr, old: DecorationSet) {
        // 文档没变就复用,避免每次光标移动都全文扫描。
        return tr.docChanged ? buildDecorations(tr.doc) : old
      },
    },
    props: {
      decorations(state) {
        return footnotePluginKey.getState(state) as DecorationSet
      },
    },
  })
}
