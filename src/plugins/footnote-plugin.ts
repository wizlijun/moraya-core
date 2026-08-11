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

/** 按 label 查找首个引用节点,用于从定义块回跳。找不到返回 null。 */
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

/** 定义的纯文本,用于 hover 浮层。多段之间用空格连接。 */
export function definitionText(doc: PmNode, label: string): string {
  const hit = findDefinition(doc, label)
  if (!hit) return ''
  const parts: string[] = []
  hit.node.forEach((child) => { parts.push(child.textContent) })
  return parts.join(' ').trim()
}

/**
 * 按首次出现顺序给每个 label 编号,并把编号发给**引用和定义两边**。
 *
 * 定义块也要编号,否则底部的定义列表只能显示 `[^label]`,长短不一、参差难读;
 * 而编号天然等宽对齐。完整 label 退到 hover 的 tooltip 里。
 *
 * 编号只由**引用**的出现顺序决定,所以要先扫一遍全文建表,再挂 decoration ——
 * 定义可能写在引用之前,一遍边扫边编号会把顺序弄反。
 */
function buildDecorations(doc: PmNode): DecorationSet {
  const numByLabel = new Map<string, number>()
  doc.descendants((node) => {
    if (node.type.name !== 'footnote_ref') return
    const label = (node.attrs.label as string) || ''
    if (!numByLabel.has(label)) numByLabel.set(label, numByLabel.size + 1)
  })

  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    const name = node.type.name
    if (name !== 'footnote_ref' && name !== 'footnote_definition') return
    // 孤儿定义(没有任何引用)拿不到编号,不挂 data-num;CSS 会退回一个等宽的占位
    // 标记,而不是把 label 摊开 —— 否则又回到长短不一。
    const num = numByLabel.get((node.attrs.label as string) || '')
    if (num === undefined) return
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
          const el = event.target as HTMLElement | null
          // 用原生 title 而不是自绘浮层:脚注 hover 是低频只读交互,自绘要处理定位、
          // 边界、滚动跟随、销毁时机,不值当。
          const refEl = el?.closest?.('[data-footnote-ref]')
          if (refEl instanceof HTMLElement) {
            const label = refEl.dataset.label ?? ''
            const text = definitionText(view.state.doc, label)
            // 无定义时明确提示而不是静默空白。
            refEl.title = text ? `[^${label}] ${text}` : `[^${label}] (未定义)`
            return false
          }
          // 定义块显示的是编号,完整 label 只在 hover 时给出 —— 这是编号方案的
          // 代价,不补上就没法从底部列表反查 label 了。
          const defEl = el?.closest?.('[data-footnote-def]')
          if (defEl instanceof HTMLElement) {
            const label = defEl.dataset.label ?? ''
            defEl.title = defEl.hasAttribute('data-num')
              ? `[^${label}]`
              : `[^${label}] (未被引用)`
          }
          return false
        },
        mousedown(view, event) {
          const el = event.target as HTMLElement | null
          const refEl = el?.closest?.('[data-footnote-ref]')
          const defEl = el?.closest?.('[data-footnote-def]')

          // 角标 → 首次引用;自己就是首次则 → 定义。
          //
          // 同一条来源常被引用多次:正文里详述一次,文末的汇总表格里再列一次。
          // 从汇总表格点回去,想看的是正文中论述它的段落,而不是又一串 URL。
          // 所以规则按"是不是首次引用"分流,而不是判断"在不在表格里"——后者是
          // 脉络判断,既脆弱又解释不清。
          if (refEl instanceof HTMLElement) {
            const label = refEl.dataset.label ?? ''
            const first = findFirstRef(view.state.doc, label)
            const isFirst = first !== null && view.nodeDOM(first.pos) === refEl
            const hit = isFirst ? findDefinition(view.state.doc, label) : first
            if (!hit) return false
            event.preventDefault()
            scrollToAndFlash(view, hit.pos)
            return true
          }

          // 定义块 → 回跳到首个引用。只认定义块自己的空白区域(含 ::before 生成的
          // 标记),不拦截其中的文字,否则定义内容没法正常编辑和选中。
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
