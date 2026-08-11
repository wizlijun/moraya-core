import { describe, test, expect } from 'vitest'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { parseMarkdown, serializeMarkdown } from '../markdown'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })

describe('footnote schema', () => {
  test('footnote_ref is an inline atom carrying a label', () => {
    const type = schema.nodes.footnote_ref
    expect(type).toBeDefined()
    expect(type.isInline).toBe(true)
    expect(type.isAtom).toBe(true)
    const node = type.create({ label: 'loop' })
    expect(node.attrs.label).toBe('loop')
  })

  test('footnote_ref renders as <sup> with data-label', () => {
    const node = schema.nodes.footnote_ref.create({ label: 'loop' })
    const [tag, attrs] = schema.nodes.footnote_ref.spec.toDOM!(node) as [string, Record<string, string>]
    expect(tag).toBe('sup')
    expect(attrs['data-label']).toBe('loop')
    expect(attrs.class).toBe('moraya-footnote-ref')
  })

  test('footnote_definition is a block node accepting block content', () => {
    const type = schema.nodes.footnote_definition
    expect(type).toBeDefined()
    expect(type.isBlock).toBe(true)
    const para = schema.nodes.paragraph.create(null, schema.text('循环的注释。'))
    const def = type.create({ label: 'loop' }, para)
    expect(def.attrs.label).toBe('loop')
    expect(def.childCount).toBe(1)
  })
})

/** 往返必须字节相等 —— 这是本功能存在的理由。 */
function expectByteStable(src: string) {
  expect(serializeMarkdown(parseMarkdown(src))).toBe(src.trimEnd())
}

/** 不产生任何 footnote_ref 节点,且二次往返稳定。 */
function expectNoFootnoteRef(src: string) {
  const doc = parseMarkdown(src)
  const labels: string[] = []
  doc.descendants((n) => {
    if (n.type.name === 'footnote_ref') labels.push(n.attrs.label as string)
  })
  expect(labels).toEqual([])

  const once = serializeMarkdown(doc)
  expect(serializeMarkdown(parseMarkdown(once))).toBe(once)
}

describe('footnote roundtrip byte-fidelity', () => {
  test('中文定义(无空格) —— 曾被当作链接引用定义吃掉', () => {
    expectByteStable('脚注[^loop]。\n\n[^loop]: 循环的注释。\n')
  })

  test('英文定义(有空格) —— 曾被加反斜杠', () => {
    expectByteStable('text[^loop] here.\n\n[^loop]: This is a loop note.\n')
  })

  test('裸引用无定义 —— 曾被加反斜杠', () => {
    expectByteStable('只有引用[^loop]，没有定义。\n')
  })

  test('孤儿定义 —— markdown-it-footnote 的 footnote_tail 会删掉它', () => {
    expectByteStable('正文没有引用。\n\n[^orphan]: 孤儿定义内容。\n')
  })

  test('定义写在引用之前 —— 位置必须原地不动', () => {
    expectByteStable('[^a]: 先定义。\n\n后引用[^a]。\n')
  })

  test('同一 label 引用两次', () => {
    expectByteStable('一[^x] 二[^x]。\n\n[^x]: 内容。\n')
  })

  test('多段缩进续行 —— 不得退化成缩进代码块', () => {
    expectByteStable('引用[^m]。\n\n[^m]: 第一段。\n\n    第二段续行。\n')
  })

  test('连续定义(中间无空行)不得被撑开', () => {
    expectByteStable('甲[^a] 乙[^b] 丙[^c]。\n\n[^a]: A。\n[^b]: B。\n[^c]: C。\n')
  })

  test('空行分隔的定义保持空行', () => {
    expectByteStable('甲[^a] 乙[^b]。\n\n[^a]: A。\n\n[^b]: B。\n')
  })

  test('紧凑与空行混排各自保持原样', () => {
    expectByteStable('甲[^a] 乙[^b] 丙[^c]。\n\n[^a]: A。\n[^b]: B。\n\n[^c]: C。\n')
  })

  // 下面两例不能断言"一次往返字节相等":prosemirror-markdown 的 esc() 会转义文本里
  // 所有的 `[` `]`,这与脚注无关(`数组 a[0]` 同样会变成 `a\[0\]`)。那是既有全局行为,
  // 且符合既有 roundtrip.spec.ts 的标准 —— 允许首次归一化,二次往返必须稳定。
  // 这里要钉住的是它们**不被识别成脚注节点**,外加二次稳定。

  test('转义逃逸的字面量不被识别为脚注', () => {
    expectNoFootnoteRef('字面量 \\[^notafootnote] 保持原样。\n')
  })

  test('内联脚注 ^[...] 按纯文本处理,不产生无 label 的 ref', () => {
    expectNoFootnoteRef('内联 ^[行内内容] 当纯文本。\n')
  })
})

describe('footnote parse structure', () => {
  test('引用解析为 footnote_ref 并保留原始 label', () => {
    const doc = parseMarkdown('脚注[^loop]。\n\n[^loop]: 循环的注释。\n')
    const refs: string[] = []
    doc.descendants((n) => {
      if (n.type.name === 'footnote_ref') refs.push(n.attrs.label as string)
    })
    expect(refs).toEqual(['loop'])
  })

  test('定义解析为 footnote_definition 且留在原位(不搬到文末)', () => {
    const doc = parseMarkdown('引用[^a]。\n\n[^a]: A 的内容。\n\n后面还有一段正文。\n')
    const types = doc.content.content.map((n) => n.type.name)
    expect(types).toEqual(['paragraph', 'footnote_definition', 'paragraph'])
  })

  test('多段定义包含两个 paragraph 子节点', () => {
    const doc = parseMarkdown('引用[^m]。\n\n[^m]: 第一段。\n\n    第二段续行。\n')
    let def: import('prosemirror-model').Node | null = null
    doc.descendants((n) => { if (n.type.name === 'footnote_definition') def = n })
    expect(def).not.toBeNull()
    expect(def!.childCount).toBe(2)
  })
})
