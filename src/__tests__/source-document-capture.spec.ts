import { expect, it, vi } from 'vitest'
import { Node as PmNode, Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { createSourceSession, applySourceTextTransaction } from '../source-fidelity'
import { defaultSchema } from '../schema'
import { parseMarkdown, parseDocumentWithSourceCapture, parseParagraphWithSourceCapture } from '../markdown'

function captured(source: string) {
  const r = parseDocumentWithSourceCapture(source)
  if (!r.ok) throw new Error(r.reason)
  expect(r.value.doc.eq(parseMarkdown(source.startsWith('\uFEFF') ? source.slice(1) : source))).toBe(true)
  for (const s of r.value.textRuns) {
    expect(s.pmTo).toBeGreaterThan(s.pmFrom)
    expect(s.sourceFrom).toBeGreaterThanOrEqual(0)
    expect(s.sourceTo).toBeLessThanOrEqual(source.length)
    const from = r.value.doc.resolve(s.pmFrom)
    expect(from.sameParent(r.value.doc.resolve(s.pmTo))).toBe(true)
    expect(['paragraph','heading','code_block','frontmatter','html_block']).toContain(from.parent.type.name)
    if (s.kind === 'linear') expect(source.slice(s.sourceFrom, s.sourceTo))
      .toBe(r.value.doc.textBetween(s.pmFrom, s.pmTo))
  }
  return r.value
}

it('bounds PM traversal growth across many paragraphs and merged text', () => {
  const counts: number[] = []
  const original = Object.getOwnPropertyDescriptor(PmNode.prototype, 'nodeSize')!.get!
  for (const size of [80, 160]) {
    let reads = 0
    const spy = vi.spyOn(PmNode.prototype, 'nodeSize', 'get').mockImplementation(function (this: PmNode) {
      reads++
      return original.call(this)
    })
    try {
      const result = parseDocumentWithSourceCapture(Array(size).fill('甲 &amp; \\* _乙_ 末句').join('\n\n'))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.textRuns.length).toBeGreaterThan(size * 3)
    } finally { spy.mockRestore() }
    counts.push(reads)
  }
  expect(counts[1]).toBeLessThan(counts[0]! * 2.6)
})

it('retains sequential math/quote/NUL transformations and edits after containers', () => {
  const unit = '> 引用\r\n\r\n首段\r\n$$\r\nx\r\n$$\r\n[甲](url “标题”) [乙](url ‘标题’)\0 \\* &amp; 目标甲。'
  const source = Array(60).fill(unit).join('\r\n\r\n')
  const opened = createSourceSession(source)
  expect(opened.ok).toBe(true)
  if (!opened.ok) throw new Error(opened.reason)
  expect(opened.session.doc.eq(parseMarkdown(source))).toBe(true)
  const raw = source.lastIndexOf('目标甲') + 2
  const span = opened.session.textSpans.find(s => s.sourceFrom <= raw && s.sourceTo > raw)!
  expect(span?.kind).toBe('linear')
  const pos = span.pmFrom + raw - span.sourceFrom
  const tr = EditorState.create({ doc: opened.session.doc }).tr.insertText('乙', pos, pos + 1)
  const result = applySourceTextTransaction(opened.session, tr)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  expect(result.session.source).toBe(source.slice(0, raw) + '乙' + source.slice(raw + 1))
  expect(result.session.doc.eq(tr.doc)).toBe(true)
  expect(result.session.doc.eq(parseMarkdown(result.session.source))).toBe(true)
  const reopened = createSourceSession(result.session.source)
  expect(reopened.ok && reopened.session.textSpans).toEqual(result.session.textSpans)
})

it('joins long adjacent text-special runs once while preserving all surviving provenance', () => {
  const source = '甲 &amp; \\* '.repeat(160) + '_乙_ 末句'
  const result = captured(source)
  expect(result.textRuns.filter(run => run.kind === 'atomic')).toHaveLength(320)
  expect(result.textRuns[0]?.sourceFrom).toBe(0)
  expect(result.textRuns.at(-1)?.sourceTo).toBe(source.length)
  const opened = createSourceSession(source)
  if (!opened.ok) throw new Error(opened.reason)
  const raw = source.lastIndexOf('甲')
  const span = opened.session.textSpans.find(s => s.sourceFrom <= raw && s.sourceTo > raw)!
  const pos = span.pmFrom + raw - span.sourceFrom
  const resultEdit = applySourceTextTransaction(opened.session,
    EditorState.create({ doc: opened.session.doc }).tr.insertText('丙', pos, pos + 1))
  expect(resultEdit.ok && resultEdit.session.source).toBe(source.slice(0, raw) + '丙' + source.slice(raw + 1))
})
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
it('maps actual container and literal text', () => {
  for(const [source,pmFrom] of [['> 甲。',2],['* 甲。',3]] as const)
    expect(captured(source).textRuns).toEqual([{sourceFrom:2,sourceTo:4,pmFrom,pmTo:pmFrom+2,kind:'linear'}])
  for (const [source,sourceFrom,sourceTo,pmTo] of [['```js\n甲\n```',6,7,2], ['---\nx: 甲\n---',4,8,5]] as const) {
    expect(captured(source).textRuns).toEqual([{sourceFrom,sourceTo,pmFrom:1,pmTo,kind:'linear'}])
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
it('maps actual text marks and code bodies without mapping their delimiters', () => {
  for (const source of [
    '甲 `code` 目标乙', '甲 ~~删除~~ 目标乙', '甲 <u>下划线</u> 目标乙',
    '甲 [标签][ref] 目标乙\n\n[ref]: /path “标题”',
  ]) {
    const r = captured(source)
    expect(r.textRuns.some(s => s.sourceFrom <= source.indexOf('目标乙') && s.sourceTo > source.indexOf('目标乙'))).toBe(true)
    if(source.includes('`code`')){
      const at=source.indexOf('code');expect(r.textRuns.filter(span=>span.sourceFrom>=at&&span.sourceTo<=at+4).map(span=>source.slice(span.sourceFrom,span.sourceTo)).join('')).toBe('code')
      expect(r.textRuns.some(span=>span.sourceFrom<=at-1&&span.sourceTo>at-1||span.sourceFrom<=at+4&&span.sourceTo>at+4)).toBe(false)
    }
    for (const span of r.textRuns) r.doc.nodesBetween(span.pmFrom, span.pmTo, node => {
      if (node.isText) expect(node.marks.every(mark => ['em', 'strong', 'link', 'strike_through', 'html_mark', 'code'].includes(mark.type.name))).toBe(true)
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

it.each([
  '甲 ` 目标乙', '甲 `` 目标乙', '甲 `\n目标乙',
  '甲 ` 目标乙\n\n独立目标丙', '甲 ` 目标乙 `` 目标丙',
])('captures declared unclosed backtick markers without losing neighboring text: %j', source => {
  const r = captured(source)
  // These fixtures have one paragraph or a single two-LF paragraph separator,
  // so source and PM positions differ by the initial paragraph boundary only.
  for (let raw = 0; raw < source.length; raw++) {
    if (source[raw] === '\n') continue
    const span = r.textRuns.find(s => s.sourceFrom <= raw && s.sourceTo > raw)
    expect(span, `raw UTF-16 offset ${raw}`).toBeDefined()
    expect(span!.kind).toBe('linear')
    expect(span!.pmFrom + raw - span!.sourceFrom).toBe(raw + 1)
    expect(r.doc.textBetween(raw + 1, raw + 2)).toBe(source[raw])
  }
})
