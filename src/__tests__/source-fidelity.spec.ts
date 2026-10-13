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
  it('opens opaque source without claiming writable literal/container text', () => {
    for (const source of ['* item\n* item2', '```js\n甲\n```', '$x$', '{>>note<<}']) {
      const opened = session(source)
      expect(opened.source).toBe(source)
      expect(opened.doc.eq(parseMarkdown(source))).toBe(true)
      expect(opened.textSpans).toEqual([])
    }
  })
  it('captures text after CRLF without normalizing raw source', () => {
    const source = '甲\r\n乙', opened = session(source)
    expect(opened.source).toBe(source)
    expect(opened.textSpans.some(s => s.sourceFrom <= 3 && s.sourceTo > 3)).toBe(true)
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

it('rejects stored-mark intent even with an otherwise mapped text step',()=>{
 const base=session('甲乙'),tr=EditorState.create({doc:base.doc}).tr.insertText('丙',1,2)
 tr.setStoredMarks([base.doc.type.schema.marks.strong!.create()])
 const r=applySourceTextTransaction(base,tr)
 expect(r).toEqual({ok:false,reason:'unsupported-step'})
 expect(base.source).toBe('甲乙')
})
function replaceAt(source:string,needle:string,text:string,occurrence=0) {
 const base=session(source);const positions:number[]=[]
 base.doc.descendants((n,p)=>{if(n.isText){let at=-1;while((at=n.text!.indexOf(needle,at+1))>=0)positions.push(p+at)}})
 const from=positions[occurrence]!;expect(from).toBeDefined()
 const tr=EditorState.create({doc:base.doc}).tr.insertText(text,from,from+needle.length)
 return {base,result:applySourceTextTransaction(base,tr)}
}
it('second repeated paragraph maps by PM provenance',()=>{
 const s='甲 &amp; \\* 😀。\r\n\r\n甲 &amp; \\* 😀。'
 const {result}=replaceAt(s,'甲','乙',1)
 expect(result.ok).toBe(true);if(result.ok)expect(result.session.source)
  .toBe('甲 &amp; \\* 😀。\r\n\r\n乙 &amp; \\* 😀。')
})
it.each(['首甲。$x$ 后乙。','首甲。[^n]后乙。\n\n[^n]: 注。',
 '首甲。{>>注<<}后乙。','首甲。<img src="x">后乙。'])('edits before/after inline atom: %s',s=>{
 for(const [needle,text] of [['甲','丙'],['乙','丁']]) {
  const {result}=replaceAt(s,needle!,text!);expect(result.ok).toBe(true)
  if(result.ok)expect(result.session.source).toBe(s.replace(needle!,text!))
 }
})
it('keeps unknown and zero-width bytes around mapped text',()=>{
 const s='保留\u200B。\n\n目标甲。\n\n[ref]: <https://example.com> "原题"\n'
 const {result}=replaceAt(s,'甲','乙');expect(result.ok).toBe(true)
 if(result.ok)expect(result.session.source).toBe(s.replace('甲','乙'))
})
it('opaque literal edit fails without a writable result',()=>{
 const {base,result}=replaceAt('```mermaid\n甲\n```\n\n保持。','甲','乙')
 expect(result.ok).toBe(false);expect('session' in result).toBe(false)
 expect(base.source).toBe('```mermaid\n甲\n```\n\n保持。')
})

it.each(['首甲。$x$ 后乙。', '首甲。[^n]后乙。\n\n[^n]: 注。',
  '首甲。{>>注<<}后乙。', '首甲。<img src="x">后乙。'])('rejects replacement across an inline atom: %s', source => {
  const base = session(source)
  const atoms: number[] = []
  base.doc.descendants((node, pos) => { if (node.isAtom && node.isInline && !node.isText) atoms.push(pos) })
  expect(atoms.length).toBeGreaterThan(0)
  const pos = atoms[0]!
  const tr = EditorState.create({doc: base.doc}).tr.replaceWith(pos - 1, pos + 2, base.doc.type.schema.text('丁'))
  const result = applySourceTextTransaction(base, tr)
  expect(result).toEqual({ok:false,reason:'unmapped-range'})
  expect('session' in result).toBe(false)
  expect(base.source).toBe(source)
})
it('edits text after CRLF with original bytes', () => {
  const {result} = replaceAt('甲\r\n乙', '乙', '丙')
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.session.source).toBe('甲\r\n丙')
})
it('rejects text replacement inside list containers', () => {
  for (const source of ['* 甲\n* 乙']) {
    const {result} = replaceAt(source, '甲', '丙')
    expect(result.ok).toBe(false)
    expect('session' in result).toBe(false)
    if (!result.ok) expect(['unsupported-step', 'unmapped-range']).toContain(result.reason)
  }
})
