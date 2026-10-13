import { describe, it, expect } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { parseMarkdown } from '../markdown'
import { createSourceSession, applySourceTextTransaction, type SourceSession } from '../source-fidelity'

function session(source: string): SourceSession {
  const result = createSourceSession(source)
  if (!result.ok) throw new Error(result.reason)
  return result.session
}
function replace(base: SourceSession, from: number, to: number, text: string) {
  const tr = EditorState.create({doc: base.doc}).tr.insertText(text, from, to)
  return applySourceTextTransaction(base, tr)
}
function output(result: ReturnType<typeof replace>) {
  if (!result.ok) throw new Error(result.reason)
  return result.session
}
const THREE = '这是甲句。中间句保持。末句保持 _斜体_ 与 [链接](<https://example.com>)。'

describe('source fidelity ordinary text session', () => {
  it('three sentences: one character splice preserves later syntax bytes', () => {
    const base = session(THREE)
    const next = output(replace(base, 3, 4, '乙'))
    expect(next.source).toBe(THREE.replace('甲', '乙'))
    expect(next.doc.eq(parseMarkdown(next.source, base.doc.type.schema))).toBe(true)
    expect(base.source).toBe(THREE)
    expect(next.revision).toBe(base.revision + 1)
  })
  it('repeated text uses positions, not text search', () => {
    const source = '甲保持。甲修改。末句 _甲_ 与 [甲](<https://example.com>)。'
    const next = output(replace(session(source), 5, 6, '乙'))
    expect(next.source).toBe('甲保持。乙修改。末句 _甲_ 与 [甲](<https://example.com>)。')
  })
  it('entity, escape and emoji before target do not shift its source offset', () => {
    const source = '开头 &amp; \\* 😀甲。末句 _斜体_。'
    const base = session(source)
    // Visible text has decoded '&', escaped literal '*' and a two-code-unit emoji.
    const pmFrom = 1 + '开头 & * 😀'.length
    const next = output(replace(base, pmFrom, pmFrom + 1, '乙'))
    expect(next.source).toBe(source.replace('甲', '乙'))
    expect(next.textSpans.some(s => s.kind === 'atomic')).toBe(true)
  })
  it('replaces a fully selected entity as a single source atom', () => {
    const next = output(replace(session('甲 &amp; 乙'), 3, 4, '和'))
    expect(next.source).toBe('甲 和 乙')
  })
  it('one ordinary word replacement rebuilds mapping for the next edit', () => {
    const base = session('这是甲句。')
    const next = output(replace(base, 3, 4, '丙丁'))
    expect(next.source).toBe('这是丙丁句。')
    expect(output(replace(next, 4, 5, '乙')).source).toBe('这是丙乙句。')
  })
  it('semantic guard rejects unescaped text becoming Markdown syntax', () => {
    const base = session('甲')
    expect(replace(base, 1, 2, '*乙*')).toEqual({ok:false, reason:'semantic-mismatch'})
    expect(base.source).toBe('甲')
    expect(base.doc.textContent).toBe('甲')
  })
  it('rejects mark intent rather than silently returning original bytes', () => {
    const base = session('甲')
    const tr = EditorState.create({doc:base.doc}).tr.addMark(1,2,base.doc.type.schema.marks.em.create())
    expect(applySourceTextTransaction(base,tr)).toEqual({ok:false,reason:'unsupported-step'})
  })
  it('rejects multi-step and stale document without mutating source', () => {
    const base = session('甲乙')
    const tr = EditorState.create({doc:base.doc}).tr.insertText('丙',1,2).insertText('丁',2,3)
    expect(applySourceTextTransaction(base,tr)).toEqual({ok:false,reason:'unsupported-step'})
    const next = output(replace(base,1,2,'丙'))
    const stale = EditorState.create({doc:base.doc}).tr.insertText('丁',2,3)
    expect(applySourceTextTransaction(next,stale)).toEqual({ok:false,reason:'stale-document'})
  })
  it('does not pretend unsupported source has writable exact mapping', () => {
    for (const source of ['* item\n* item2', '```js\n甲\n```', '甲\r\n乙', '$x$', '{>>note<<}']) {
      expect(createSourceSession(source)).toEqual({ok:false,reason:'unsupported-source'})
    }
  })
  it('preserves BOM and outer whitespace when unchanged by parser work normalization', () => {
    const source = '\uFEFF甲 _斜体_  '
    const next = output(replace(session(source),1,2,'乙'))
    expect(next.source).toBe('\uFEFF乙 _斜体_  ')
  })
})
it('rejects a partial decoded entity or surrogate pair', () => {
  const entity = session('甲 &NotEqualTilde; 乙')
  expect(replace(entity, 3, 4, '和')).toEqual({ok:false,reason:'unmapped-range'})
  expect(replace(session('甲😀乙'), 3, 4, '和')).toEqual({ok:false,reason:'unmapped-range'})
})
it('real capture preserves nested emphasis and link provenance', () => {
  const source = '***加粗斜体*** 与 _普通_ 与 [链接 _斜体_](<https://example.com>)。'
  const base = session(source)
  expect(base.doc.eq(parseMarkdown(source))).toBe(true)
  expect(output(replace(base,1,2,'更')).source).toBe('***更粗斜体*** 与 _普通_ 与 [链接 _斜体_](<https://example.com>)。')
})

it('preserves untouched literal markers and entities, and refuses delimiter-crossing replacement', () => {
  const base = session('甲 * &amp; _乙_ 丙')
  expect(output(replace(base,1,2,'丁')).source).toBe('丁 * &amp; _乙_ 丙')
  expect(replace(base,5,8,'丁')).toEqual({ok:false,reason:'unmapped-range'})
})
it('actual Moraya hook has the same semantics for all five capture fixtures', () => {
  const fixtures = [THREE, '甲保持。甲修改。末句 _甲_ 与 [甲](<https://example.com>)。',
    '开头 &amp; \\* 😀甲。末句 _斜体_。', '这是甲句。',
    '***加粗斜体*** 与 _普通_ 与 [链接 _斜体_](<https://example.com>)。']
  for (const source of fixtures) {
    const base = session(source)
    expect(base.doc.eq(parseMarkdown(source))).toBe(true)
    for (const span of base.textSpans) if (span.kind === 'linear') {
      expect(source.slice(span.sourceFrom,span.sourceTo)).toBe(base.doc.textBetween(span.pmFrom,span.pmTo))
    }
  }
})
