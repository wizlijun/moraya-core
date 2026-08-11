import { describe, test, expect } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { parseMarkdown } from '../markdown'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import {
  createFootnotePlugin,
  findDefinition,
  findFirstRef,
  definitionText,
} from '../plugins/footnote-plugin'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })

describe('角标渲染:直接用 [^id] 里的 id', () => {
  function mountView(src: string) {
    const doc = parseMarkdown(src, schema)
    return new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createFootnotePlugin()] }),
    })
  }

  test('data-label 带的是原始 id,不是编号', () => {
    const view = mountView('甲[^loop] 乙[^wispr]。\n\n[^loop]: A。\n\n[^wispr]: B。\n')
    const labels = [...view.dom.querySelectorAll('[data-footnote-ref]')].map((e) =>
      e.getAttribute('data-label'),
    )
    expect(labels).toEqual(['loop', 'wispr'])
  })

  test('定义块也带原始 id', () => {
    const view = mountView('甲[^loop]。\n\n[^loop]: A。\n')
    expect(view.dom.querySelector('[data-footnote-def]')?.getAttribute('data-label')).toBe('loop')
  })

  test('不再产生任何编号 decoration', () => {
    const view = mountView('甲[^a] 乙[^b]。\n\n[^a]: A。\n\n[^b]: B。\n')
    expect([...view.dom.querySelectorAll('[data-num]')]).toEqual([])
  })
})

describe('footnote definition lookup', () => {
  test('按 label 找到定义节点及其位置', () => {
    const doc = parseMarkdown('引用[^a]。\n\n[^a]: A 的内容。\n', schema)
    const hit = findDefinition(doc, 'a')
    expect(hit).not.toBeNull()
    expect(hit!.node.type.name).toBe('footnote_definition')
    expect(doc.nodeAt(hit!.pos)!.attrs.label).toBe('a')
  })

  test('label 不存在时返回 null', () => {
    const doc = parseMarkdown('裸引用[^none]。\n', schema)
    expect(findDefinition(doc, 'none')).toBeNull()
  })

  test('definitionText 取出定义的纯文本', () => {
    const doc = parseMarkdown('引用[^m]。\n\n[^m]: 第一段。\n\n    第二段。\n', schema)
    expect(definitionText(doc, 'm')).toBe('第一段。 第二段。')
  })

  test('无定义时 definitionText 返回空串', () => {
    const doc = parseMarkdown('裸[^none]。\n', schema)
    expect(definitionText(doc, 'none')).toBe('')
  })
})

describe('footnote back-reference lookup', () => {
  test('按 label 找到首个引用的位置', () => {
    const doc = parseMarkdown('一[^x] 二[^x]。\n\n[^x]: X。\n', schema)
    const first = findFirstRef(doc, 'x')
    expect(first).not.toBeNull()
    expect(doc.nodeAt(first!.pos)!.type.name).toBe('footnote_ref')
  })

  test('孤儿定义没有引用时返回 null', () => {
    const doc = parseMarkdown('正文。\n\n[^orphan]: 孤儿。\n', schema)
    expect(findFirstRef(doc, 'orphan')).toBeNull()
  })
})

describe('点击跳转(挂真实 EditorView)', () => {
  function mount(src: string) {
    const doc = parseMarkdown(src, schema)
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc, plugins: [createFootnotePlugin()] }),
    })
    const def = view.dom.querySelector('[data-footnote-def]') as HTMLElement
    const refs = [...view.dom.querySelectorAll('[data-footnote-ref]')] as HTMLElement[]
    const scrolled: string[] = []
    refs.forEach((r, i) => {
      r.scrollIntoView = (() => scrolled.push(`ref${i}`)) as never
    })
    if (def) def.scrollIntoView = (() => scrolled.push('def')) as never
    return { view, def, ref: refs[0], refs, scrolled }
  }

  const down = () => new window.MouseEvent('mousedown', { bubbles: true, cancelable: true })

  test('正文角标 → 底部定义,并高亮它', () => {
    const { def, ref, scrolled } = mount('正文引用[^a] 结束。\n\n[^a]: A 的内容。\n')
    const ev = down()
    ref.dispatchEvent(ev)
    expect(scrolled).toEqual(['def'])
    expect(ev.defaultPrevented).toBe(true)
    expect(def.classList.contains('moraya-footnote-flash')).toBe(true)
  })

  test('同一 label 的第二次引用同样跳定义 —— 规则不看引用出现的次序', () => {
    const { def, refs, scrolled } = mount('详述[^a]。\n\n汇总又提[^a]。\n\n[^a]: A。\n')
    expect(refs).toHaveLength(2)
    refs[1].dispatchEvent(down())
    expect(scrolled).toEqual(['def'])
    expect(def.classList.contains('moraya-footnote-flash')).toBe(true)
  })

  test('定义前的标记 → 首次引用,并高亮它', () => {
    const { def, refs, scrolled } = mount('详述[^a]。\n\n汇总又提[^a]。\n\n[^a]: A。\n')
    const ev = down()
    def.dispatchEvent(ev)
    expect(scrolled).toEqual(['ref0'])
    expect(ev.defaultPrevented).toBe(true)
    expect(refs[0].classList.contains('moraya-footnote-flash')).toBe(true)
  })

  test('孤儿定义没有引用可回跳时不拦截事件(否则没法正常编辑)', () => {
    const { def, scrolled } = mount('正文没有引用。\n\n[^orphan]: 孤儿。\n')
    const ev = down()
    def.dispatchEvent(ev)
    expect(scrolled).toEqual([])
    expect(ev.defaultPrevented).toBe(false)
  })

  test('点定义块内的文字不触发回跳 —— 否则没法选中和编辑定义内容', () => {
    const { def, scrolled } = mount('正文引用[^a] 结束。\n\n[^a]: A 的内容。\n')
    const inner = def.querySelector('p') as HTMLElement
    const ev = down()
    inner.dispatchEvent(ev)
    expect(scrolled).toEqual([])
    expect(ev.defaultPrevented).toBe(false)
  })

  test('无定义的裸引用点击时不拦截事件', () => {
    const { ref, scrolled } = mount('裸引用[^none] 没有定义。\n')
    const ev = down()
    ref.dispatchEvent(ev)
    expect(scrolled).toEqual([])
    expect(ev.defaultPrevented).toBe(false)
  })
})
