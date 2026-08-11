import { describe, test, expect } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { DecorationSet } from 'prosemirror-view'
import { parseMarkdown } from '../markdown'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { createFootnotePlugin, footnotePluginKey, findDefinition, definitionText, findFirstRef } from '../plugins/footnote-plugin'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })

function numsFor(src: string, typeName: 'footnote_ref' | 'footnote_definition'): string[] {
  const doc = parseMarkdown(src, schema)
  const state = EditorState.create({ doc, plugins: [createFootnotePlugin()] })
  const set = footnotePluginKey.getState(state) as DecorationSet
  return set
    .find()
    .filter((d) => doc.nodeAt(d.from)?.type.name === typeName)
    .map((d) => (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-num'])
}

/** 引用侧的编号。 */
const decosFor = (src: string) => numsFor(src, 'footnote_ref')

describe('footnote numbering', () => {
  test('按首次出现顺序编号', () => {
    expect(decosFor('甲[^a] 乙[^b]。\n\n[^a]: A。\n\n[^b]: B。\n')).toEqual(['1', '2'])
  })

  test('同一 label 多次引用共用同一编号', () => {
    expect(decosFor('一[^x] 二[^x] 三[^y]。\n\n[^x]: X。\n\n[^y]: Y。\n')).toEqual(['1', '1', '2'])
  })

  test('编号按正文出现顺序,与定义书写顺序无关', () => {
    expect(decosFor('先[^second] 后[^first]。\n\n[^first]: 1。\n\n[^second]: 2。\n')).toEqual(['1', '2'])
  })

  test('无定义的裸引用照样参与编号', () => {
    expect(decosFor('裸[^none]。\n')).toEqual(['1'])
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

describe('定义块也带编号(底部列表要等宽对齐)', () => {
  test('定义拿到与其引用相同的编号', () => {
    const src = '甲[^a] 乙[^b]。\n\n[^a]: A。\n\n[^b]: B。\n'
    expect(numsFor(src, 'footnote_definition')).toEqual(['1', '2'])
  })

  test('定义书写顺序与引用顺序不一致时,编号跟引用走', () => {
    // 正文先引 second 后引 first,但定义按 first/second 顺序写
    const src = '先[^second] 后[^first]。\n\n[^first]: 1。\n\n[^second]: 2。\n'
    // 定义按文档位置返回:first 的定义在前,它的编号应是 2
    expect(numsFor(src, 'footnote_definition')).toEqual(['2', '1'])
  })

  test('定义写在引用之前也能拿到正确编号', () => {
    const src = '[^a]: A。\n\n后引用[^a]。\n'
    expect(numsFor(src, 'footnote_definition')).toEqual(['1'])
  })

  test('孤儿定义不挂 data-num(CSS 退回等宽占位)', () => {
    const src = '正文无引用。\n\n[^orphan]: 孤儿。\n'
    expect(numsFor(src, 'footnote_definition')).toEqual([])
  })

  test('同一 label 引用两次,定义仍只有一个编号', () => {
    const src = '一[^x] 二[^x]。\n\n[^x]: X。\n'
    expect(numsFor(src, 'footnote_ref')).toEqual(['1', '1'])
    expect(numsFor(src, 'footnote_definition')).toEqual(['1'])
  })
})
