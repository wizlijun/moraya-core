/**
 * 过度转义回归测试。
 *
 * prosemirror-markdown 的 esc() 无条件转义 `` ` * \ ~ [ ] _ ``,于是正文里任何
 * 方括号/星号在 rich 模式打开保存后都会被加上反斜杠 —— `数组 a[0]` 变成 `a\[0\]`。
 * 这是对源文件的实打实改写,违反 file-over-app。
 *
 * 修复策略是自证式的:去掉转义后重新解析,只有当结果与原文档等价时才采纳。
 * 因此本文件既要钉住"该去的转义去掉了",也要钉住"该留的一个都不能少"——
 * 后者比前者严重得多,转义少了会让文本被误解析成语法,是语义级破坏。
 */
import { describe, test, expect } from 'vitest'
import { parseMarkdown, serializeMarkdown } from '../markdown'

/** 一次往返后字节不变。 */
function stable(src: string) {
  expect(serializeMarkdown(parseMarkdown(src))).toBe(src.trimEnd())
}

describe('不该转义的,不要转义', () => {
  test('普通方括号', () => {
    stable('数组 a[0] 和 b[1] 与脚注无关。\n')
  })

  test('孤立星号', () => {
    stable('乘法 2*3 与通配 *.md 都不是强调。\n')
  })

  test('句中井号', () => {
    stable('议题 #42 与标签 #tag 在句中。\n')
  })

  test('方括号包裹的非链接文本', () => {
    stable('引用格式 [Watkins 2008] 不是链接。\n')
  })

  test('中括号紧跟圆括号但不是链接的情况仍保持可读', () => {
    // `[a](b)` 是真链接语法,解析成 link mark 后序列化回来仍是 `[a](b)`
    stable('见 [文档](https://example.com)。\n')
  })
})

describe('该转义的,一个都不能少', () => {
  test('字面量方括号脚注:去掉转义会变成真脚注,必须保留', () => {
    const src = '字面量 \\[^notafootnote] 保持原样。\n'
    const out = serializeMarkdown(parseMarkdown(src))
    // 不论转义形态如何归一化,重新解析都不得产生 footnote_ref
    const doc = parseMarkdown(out)
    const labels: string[] = []
    doc.descendants((n) => {
      if (n.type.name === 'footnote_ref') labels.push(n.attrs.label as string)
    })
    expect(labels).toEqual([])
  })

  test('字面量强调:去掉转义会变成 em,必须保留', () => {
    const src = '字面量 \\*不是强调\\* 保持文本。\n'
    const out = serializeMarkdown(parseMarkdown(src))
    const doc = parseMarkdown(out)
    let hasEm = false
    doc.descendants((n) => {
      if (n.marks.some((m) => m.type.name === 'em')) hasEm = true
    })
    expect(hasEm).toBe(false)
  })

  test('字面量链接:去掉转义会变成 link,必须保留', () => {
    const src = '字面量 \\[文档](https://example.com) 不是链接。\n'
    const out = serializeMarkdown(parseMarkdown(src))
    const doc = parseMarkdown(out)
    let hasLink = false
    doc.descendants((n) => {
      if (n.marks.some((m) => m.type.name === 'link')) hasLink = true
    })
    expect(hasLink).toBe(false)
  })

  test('行首井号:去掉转义会变成标题,必须保留', () => {
    const src = '\\# 这不是标题\n'
    const doc = parseMarkdown(serializeMarkdown(parseMarkdown(src)))
    expect(doc.firstChild!.type.name).toBe('paragraph')
  })

  test('行首减号:去掉转义会变成列表,必须保留', () => {
    const src = '\\- 这不是列表项\n'
    const doc = parseMarkdown(serializeMarkdown(parseMarkdown(src)))
    expect(doc.firstChild!.type.name).toBe('paragraph')
  })
})

describe('二次往返始终稳定', () => {
  const cases = [
    '数组 a[0] 和 b[1]。\n',
    '字面量 \\[^x] 与 \\*star\\*。\n',
    '混合 [链接](u) 和 a[0] 与 *em* 与 \\*lit\\*。\n',
    '脚注[^f] 与方括号 a[0]。\n\n[^f]: 定义。\n',
  ]
  for (const src of cases) {
    test(JSON.stringify(src.slice(0, 28)), () => {
      const once = serializeMarkdown(parseMarkdown(src))
      const twice = serializeMarkdown(parseMarkdown(once))
      expect(twice).toBe(once)
    })
  }
})
