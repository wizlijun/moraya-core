import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity'
import {parseMarkdown,parseMarkdownAsync,serializeMarkdown} from '../markdown'

function open(source:string) {
 const r=createSourceSession(source);expect(r.ok).toBe(true)
 if(!r.ok)throw new Error(r.reason)
 r.session.doc.check();return r.session
}
function childNames(source:string) {
 const s=open(source),names:string[]=[]
 s.doc.forEach(n=>names.push(n.type.name==='paragraph'&&!n.content.size?'empty':n.type.name))
 return names
}
function verify(source:string) {
 const s=open(source);expect(Buffer.from(s.source)).toEqual(Buffer.from(source))
 expect(s.gaps).toHaveLength(s.roots.length+1)
 let raw='',at=0
 for(const [i,r]of s.roots.entries()){
  expect(s.gaps[i]!.sourceFrom).toBe(at);expect(s.gaps[i]!.sourceTo).toBe(r.sourceFrom)
  raw+=source.slice(at,r.sourceFrom)+source.slice(r.sourceFrom,r.sourceTo);at=r.sourceTo
 }
 raw+=source.slice(at);expect(Buffer.from(raw)).toEqual(Buffer.from(source))
 let last=0
 for(const [i,u]of s.layout.blankLines.entries()){
  expect(u.id).toBe(i);expect(u.sourceFrom).toBeGreaterThanOrEqual(last)
  expect(source.slice(u.sourceFrom,u.sourceTo)).toMatch(/^[ \t]*(?:\r\n|\r|\n)$/)
  expect(s.protectedSources.every(p=>u.sourceTo<=p.sourceFrom||u.sourceFrom>=p.sourceTo)).toBe(true)
  const c=u.container,owner=c.kind==='gap'?s.gaps[c.gapIndex]!:s.roots[c.rootId]!
  expect(u.sourceFrom).toBeGreaterThanOrEqual(c.kind==='gap'?owner.sourceFrom:s.roots[c.rootId]!.tailFrom)
  expect(u.sourceTo).toBeLessThanOrEqual(owner.sourceTo)
  if(u.role==='empty-paragraph'){
   expect(u.emission.childTo).toBe(u.emission.childFrom+1)
   const n=s.doc.child(u.emission.childFrom)
   expect(n.type.name).toBe('paragraph');expect(n.content.size).toBe(0)
   expect(u.emission.pmTo-u.emission.pmFrom).toBe(n.nodeSize)
   expect(s.roots.every(r=>u.emission.childTo<=r.childFrom||u.emission.childFrom>=r.childTo)).toBe(true)
  }
  last=u.sourceTo
 }
 return s
}
it.each([
 ['',1,0],['\n',2,1],['\n\n\n',4,3],[' \t\n\t\n',3,2],
 ['\uFEFF\r\n\r\n',3,2],['\r\n\r',3,2],['A\n',1,0],
 ['A\n\n',2,1],['A\n\n\n',3,2],['\nA',2,1],['\n\nA',3,2],
 ['A\n\n\nB',3,2],
] as const)('captures selected blank count %j',(source,count,units)=>{
 const s=verify(source);expect(s.doc.childCount).toBe(count);expect(s.layout.blankLines).toHaveLength(units)
 const round=open(serializeMarkdown(s.doc));expect(round.doc.eq(s.doc)).toBe(true)
 if(!source.replace(/[\uFEFF \t\r\n]/g,''))expect(s.layout.fallback?.emission.childFrom).toBe(0)
})
it.each([
 'A\n\n[ref]: /url\n\nB',
 'A\n\n[ref]:\n /url\n "title"\n\nB',
 'A\n\n[ref]: /first\n[ref]: /second\n\nB',
])('definition lines never emit synthetic paragraphs %j',source=>{
 const s=verify(source);expect(s.doc.childCount).toBe(2)
 expect(s.layout.blankLines.every(u=>u.role==='separator')).toBe(true)
 expect(s.gaps[1]!.kind).toBe('opaque');expect(s.gaps[1]!.synthetic).toHaveLength(0)
})
it('captures a long complete blank run without unbounded argument spreading',()=>{
 const count=140000,source='\n'.repeat(count),s=open(source)
 expect(s.source).toBe(source);expect(s.doc.childCount).toBe(count+1)
 expect(s.layout.blankLines).toHaveLength(count)
 expect(s.layout.blankLines[0]!.sourceFrom).toBe(0)
 expect(s.layout.blankLines[count-1]!.sourceTo).toBe(count)
},15000)
it('applies runs to prefix/reference-only and excess blank lines',()=>{
 expect(childNames('[ref]: /url\n\nB')).toEqual(['paragraph'])
 const only=verify('[ref]: /url\n\n');expect(only.doc.childCount).toBe(1)
 expect(only.layout.fallback).toBeDefined();expect(only.layout.blankLines[0]!.role).toBe('separator')
 const extra=verify('A\n\n\n[ref]: /url\n\n\nB')
 expect(extra.doc.childCount).toBe(4)
 expect(extra.layout.blankLines.map(u=>u.role)).toEqual(['separator','empty-paragraph','separator','empty-paragraph'])
})
it('keeps complete list map, actual handler coordinates and independent tail origins',()=>{
 const source='- A\n\n\nB',s=verify(source)
 expect(s.roots.map(r=>[r.sourceFrom,r.sourceTo,r.tailFrom,r.childFrom,r.childTo,r.pmFrom,r.pmTo]))
  .toEqual([[0,6,3,0,1,0,7],[6,7,7,2,3,9,12]])
 expect(s.layout.blankLines.map(u=>[u.sourceFrom,u.sourceTo,u.container,u.role]))
  .toEqual([[4,5,{kind:'root-tail',rootId:0},'separator'],[5,6,{kind:'root-tail',rootId:0},'empty-paragraph']])
 expect(s.gaps.flatMap(g=>g.synthetic)).toEqual([])
 const empty=s.layout.blankLines[1]!
 if(empty.role!=='empty-paragraph')throw new Error('fixture empty missing')
 expect(empty.emission).toEqual({childFrom:1,childTo:2,pmFrom:7,pmTo:9})
 const state=EditorState.create({doc:s.doc})
 const marked=applySourceBlockTransaction(s,state.tr.addMark(3,4,s.doc.type.schema.marks.strong!.create()))
 expect(marked.ok).toBe(true);if(!marked.ok)throw new Error(marked.reason)
 expect(marked.session.source).toBe('- **A**\n\n\nB')
 expect(marked.session.doc.childCount).toBe(3)
 expect(marked.session.doc.eq(state.tr.addMark(3,4,s.doc.type.schema.marks.strong!.create()).doc)).toBe(true)
 const rejected=applySourceBlockTransaction(s,state.tr.insertText('X',8))
 expect(rejected.ok).toBe(false);expect('session'in rejected).toBe(false)
 const deletion=applySourceBlockTransaction(s,state.tr.delete(0,7))
 expect(deletion.ok).toBe(false);expect(s.source).toBe(source)
})
it('distinguishes suffix and marker-only quote lines',()=>{
 expect(childNames('- A\n\n\n')).toEqual(['bullet_list','empty','empty'])
 const q=verify('> A\n\n\n');expect(q.doc.childCount).toBe(3)
 expect(q.layout.blankLines.every(u=>u.container.kind==='gap')).toBe(true)
 const marker=verify('> A\n>\n>\n');expect(marker.doc.childCount).toBe(1)
 expect(marker.layout.blankLines).toEqual([])
})
it('does not grant generated math separators or opaque reference spans blank authority',()=>{
 const math=verify('A\n$$\nx\n$$\nB');expect(math.layout.blankLines).toEqual([])
 for(const source of ['> [ref]: /url\n>\n> A\n','- [ref]: /url\n\n  A\n']){
  const s=verify(source);expect(s.protectedSources.some(p=>p.scope==='nested')).toBe(true)
  expect(s.layout.blankLines).toEqual([])
 }
})
it('keeps fallback rawless, default sync/async parsing and serializer unchanged',async()=>{
 const source='\uFEFF\r\n\r\n',s=verify(source)
 expect(s.layout.fallback).toEqual({kind:'empty-document-baseline',sourceAnchor:1,
  emission:{childFrom:0,childTo:1,pmFrom:0,pmTo:2}})
 expect(s.layout.blankLines.map(u=>[u.sourceFrom,u.sourceTo])).toEqual([[1,3],[3,5]])
 for(const raw of ['', '\n','\n\n\n','A\n\n\n','A\n\n[ref]: /url\n\nB']){
  const legacy=parseMarkdown(raw);expect((await parseMarkdownAsync(raw)).eq(legacy)).toBe(true)
  expect(legacy.childCount).toBe(raw.includes('[ref]')?4:1)
 }
 expect(serializeMarkdown(parseMarkdown('A  \n'))).toBe('A')
})
