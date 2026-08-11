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

/** 按 label 查找定义节点。找不到返回 null。 */
export function findDefinition(doc: PmNode, label: string): { node: PmNode; pos: number } | null {
  let hit: { node: PmNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (hit) return false
    if (node.type.name === 'footnote_definition' && node.attrs.label === label) {
      hit = { node, pos }
      return false
    }
    return true
  })
  return hit
}

/** 定义的纯文本,用于 hover 浮层。多段之间用空格连接。 */
export function definitionText(doc: PmNode, label: string): string {
  const hit = findDefinition(doc, label)
  if (!hit) return ''
  const parts: string[] = []
  hit.node.forEach((child) => { parts.push(child.textContent) })
  return parts.join(' ').trim()
}

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
      handleDOMEvents: {
        mouseover(view, event) {
          const target = (event.target as HTMLElement | null)?.closest?.('[data-footnote-ref]')
          if (!(target instanceof HTMLElement)) return false
          const label = target.dataset.label ?? ''
          const text = definitionText(view.state.doc, label)
          // 用原生 title 而不是自绘浮层:脚注 hover 是低频只读交互,自绘要处理定位、
          // 边界、滚动跟随、销毁时机,不值当。无定义时明确提示而不是静默空白。
          target.title = text ? `[^${label}] ${text}` : `[^${label}] (未定义)`
          return false
        },
      },
    },
  })
}
