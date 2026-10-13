import { expect, it, vi } from 'vitest'
import { Schema } from 'prosemirror-model'
import { defaultSchema } from '../schema'
import { parseMarkdown, parseDocumentWithSourceCapture, parseParagraphWithSourceCapture } from '../markdown'

function captured(source: string) {
  const r = parseDocumentWithSourceCapture(source)
  if (!r.ok) throw new Error(r.reason)
  expect(r.value.doc.eq(parseMarkdown(source))).toBe(true)
  for (const s of r.value.textRuns) {
    expect(s.pmTo).toBeGreaterThan(s.pmFrom)
    expect(s.sourceFrom).toBeGreaterThanOrEqual(0)
    expect(s.sourceTo).toBeLessThanOrEqual(source.length)
    const from = r.value.doc.resolve(s.pmFrom)
    expect(from.depth).toBe(1)
    expect(from.parent.type.name).toBe('paragraph')
    if (s.kind === 'linear') expect(source.slice(s.sourceFrom, s.sourceTo))
      .toBe(r.value.doc.textBetween(s.pmFrom, s.pmTo))
  }
  return r.value
}
it.each([
  '\uFEFF甲。\r\n\r\n乙 &amp; \\* 😀甲。\r末句。',
  '首段。\n$$\nx^2\n$$\n目标甲。',
  '[链接](url “标题”)\n\n目标甲。\0末句。',
  '目标甲。$x$ 后面目标乙。[^n]\n\n[^n]: 原注。',
  '{>>原注<<}目标甲。{==保留==}{>>注释<<}目标乙。',
  '| A | B |\n| --- | --- |\n| x | y |\n\n目标甲。',
  '首段\r$$\rx\r$$\r目标甲',
  '首段\r\n$$\r\nx\r\n$$\r\n目标甲',
  '[链接](url “标题”)\r\n\r\n\0目标甲 [乙](url ‘标题’)\r末句',
])('captures real text around opaque regions: %j', source => {
  const r = captured(source)
  for (const needle of ['目标甲', '目标乙'].filter(x => source.includes(x))) {
    const raw = source.indexOf(needle) + 2
    const span = r.textRuns.find(s => s.sourceFrom <= raw && s.sourceTo > raw)
    expect(span).toBeDefined()
    expect(span!.kind).toBe('linear')
    const pm = span!.pmFrom + raw - span!.sourceFrom
    expect(r.doc.textBetween(pm, pm + 1)).toBe(needle[2])
  }
})
it('does not claim container/literal text as editable', () => {
  for (const source of ['> 甲。', '* 甲。', '```js\n甲\n```', '---\nx: 甲\n---']) {
    expect(captured(source).textRuns).toEqual([])
  }
})
it('keeps repeated paragraph ownership and subsequent captures separate', () => {
  const source = '甲 _甲_。\n\n甲 _甲_。'
  const r = captured(source)
  const second = source.lastIndexOf('甲')
  const span = r.textRuns.find(s => s.sourceFrom === second)
  expect(span).toMatchObject({ sourceFrom: second, sourceTo: second + 1, pmFrom: 9, pmTo: 10 })
  expect(captured('乙').textRuns).toEqual([
    { sourceFrom: 0, sourceTo: 1, pmFrom: 1, pmTo: 2, kind: 'linear' },
  ])
})
it('leaves unsupported marks opaque while capturing surrounding text and reference labels', () => {
  for (const source of [
    '甲 `code` 目标乙', '甲 ~~删除~~ 目标乙', '甲 <u>下划线</u> 目标乙',
    '甲 [标签][ref] 目标乙\n\n[ref]: /path “标题”',
  ]) {
    const r = captured(source)
    expect(r.textRuns.some(s => s.sourceFrom <= source.indexOf('目标乙') && s.sourceTo > source.indexOf('目标乙'))).toBe(true)
    for (const span of r.textRuns) r.doc.nodesBetween(span.pmFrom, span.pmTo, node => {
      if (node.isText) expect(node.marks.every(mark => ['em', 'strong', 'link'].includes(mark.type.name))).toBe(true)
    })
  }
})
it('keeps the legacy hook strict without a second parser', () => {
  expect(parseParagraphWithSourceCapture('甲 _乙_').ok).toBe(true)
  for (const source of ['甲\n\n乙', '甲 $x$ 乙', '甲 `code` 乙']) {
    expect(parseParagraphWithSourceCapture(source)).toEqual({ ok: false, reason: 'unsupported-source' })
  }
})

it.each(['甲 \n目标乙', '甲  \n目标乙', '甲  \r\n目标乙'])('keeps text after a trimmed newline pending buffer writable: %j', source => {
  const r = captured(source)
  expect(r.textRuns[0]).toEqual({ sourceFrom: 0, sourceTo: 1, pmFrom: 1, pmTo: 2, kind: 'linear' })
  expect(r.textRuns.some(s => s.sourceFrom <= source.indexOf('目标乙') && s.sourceTo > source.indexOf('目标乙'))).toBe(true)
})

it('reports parser exceptions without an empty-document fallback', () => {
  const schema = new Schema(defaultSchema.spec)
  const throwingText = vi.spyOn(schema, 'text').mockImplementation(() => { throw new Error('text construction failed') })
  try {
    expect(parseDocumentWithSourceCapture('甲', schema)).toEqual({ ok: false, reason: 'parse-error' })
  } finally { throwingText.mockRestore() }
})
