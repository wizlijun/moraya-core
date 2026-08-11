/**
 * Footnote plugin — 脚注的跳转与悬停提示。
 *
 * 角标显示的就是 `[^id]` 里的 id,直接由 schema 的 `data-label` 属性驱动 CSS,
 * 插件不参与渲染 —— 所以这里没有 decoration,只处理交互:
 *
 *   正文角标   → 底部对应的定义
 *   定义前的标记 → 首次引用处
 *
 * Schema-agnostic:通过 `node.type.name` 判定,不引用 schema 单例。
 */

import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
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

/** 按 label 查找首个引用节点,用于从定义回跳。找不到返回 null。 */
export function findFirstRef(doc: PmNode, label: string): { node: PmNode; pos: number } | null {
  let hit: { node: PmNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (hit) return false
    if (node.type.name === 'footnote_ref' && node.attrs.label === label) {
      hit = { node, pos }
      return false
    }
    return true
  })
  return hit
}

/** 定义的纯文本,用于 hover 提示。多段之间用空格连接。 */
export function definitionText(doc: PmNode, label: string): string {
  const hit = findDefinition(doc, label)
  if (!hit) return ''
  const parts: string[] = []
  hit.node.forEach((child) => { parts.push(child.textContent) })
  return parts.join(' ').trim()
}

/** 滚动到指定位置并短暂高亮。 */
function scrollToAndFlash(view: EditorView, pos: number): void {
  const dom = view.nodeDOM(pos)
  const el = dom instanceof HTMLElement ? dom : (dom as ChildNode | null)?.parentElement
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('moraya-footnote-flash')
  view.dom.ownerDocument.defaultView?.setTimeout(() => {
    el.classList.remove('moraya-footnote-flash')
  }, 1200)
}

export function createFootnotePlugin(): Plugin {
  return new Plugin({
    key: footnotePluginKey,
    props: {
      handleDOMEvents: {
        mouseover(view, event) {
          const el = event.target as HTMLElement | null
          // 用原生 title 而不是自绘浮层:脚注 hover 是低频只读交互,自绘要处理定位、
          // 边界、滚动跟随、销毁时机,不值当。
          const refEl = el?.closest?.('[data-footnote-ref]')
          if (refEl instanceof HTMLElement) {
            const label = refEl.dataset.label ?? ''
            const text = definitionText(view.state.doc, label)
            // 无定义时明确提示而不是静默空白。
            refEl.title = text ? `[^${label}] ${text}` : `[^${label}] (未定义)`
          }
          return false
        },
        mousedown(view, event) {
          const el = event.target as HTMLElement | null
          const refEl = el?.closest?.('[data-footnote-ref]')
          const defEl = el?.closest?.('[data-footnote-def]')

          // 正文角标 → 底部定义
          if (refEl instanceof HTMLElement) {
            const hit = findDefinition(view.state.doc, refEl.dataset.label ?? '')
            if (!hit) return false
            event.preventDefault()
            scrollToAndFlash(view, hit.pos)
            return true
          }

          // 定义前的标记 → 首次引用。只认定义块自己的区域(标记画在左侧 padding
          // 里,那块属于定义块本身),不拦截其中的文字,否则定义内容没法选中编辑。
          if (defEl instanceof HTMLElement && el === defEl) {
            const hit = findFirstRef(view.state.doc, defEl.dataset.label ?? '')
            if (!hit) return false
            event.preventDefault()
            scrollToAndFlash(view, hit.pos)
            return true
          }

          return false
        },
      },
    },
  })
}
