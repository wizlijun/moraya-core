import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity'
import {parseMarkdown,serializeMarkdown} from '../markdown'
function open(source:string){const r=createSourceSession(source);if(!r.ok)throw new Error(r.reason);return r.session}
function breaks(doc:ReturnType<typeof open>['doc']){
 const all:{isInline:unknown}[]=[];doc.descendants(n=>{if(n.type.name==='hardbreak')all.push({isInline:n.attrs.isInline})});return all
}
function textPos(doc:ReturnType<typeof open>['doc']){
 let found=-1;doc.descendants((n,p)=>{if(n.isText&&found<0)found=p});if(found<0)throw new Error('missing text');return found
}
it.each(['A  \n','A\\\n','\uFEFFA  \r\n','- A  \n','> A  \n','A  \n\nB'])(
 'restores actual terminal syntax through original inline parser %j',source=>{
 const s=open(source);s.doc.check();expect(breaks(s.doc)).toEqual([{isInline:false}])
 expect(s.source).toBe(source);expect(breaks(parseMarkdown(source))).toEqual([])
})
it.each(['A\n','A  ','A\\\\\n'])('does not invent terminal atoms %j',source=>{
 expect(breaks(open(source).doc)).toEqual([])
})
it.each(['A\\\n\\\n','A\\\n\\\n\nB','- A\\\n  \\\n'])(
 'preserves consecutive terminal hardbreaks through narrow inline edits %j',source=>{
 const s=open(source);expect(breaks(s.doc)).toEqual([{isInline:false},{isInline:false}])
 const p=textPos(s.doc),tr=EditorState.create({doc:s.doc}).tr.addMark(p,p+1,s.doc.type.schema.marks.strong!.create())
 const result=applySourceBlockTransaction(s,tr);expect(result.ok).toBe(true)
 if(!result.ok)throw new Error(result.reason)
 expect(result.mode).toBe('fragment-render');
 const at=source.indexOf('A');expect(result.edits).toEqual([{from:at,to:at,text:'**'},{from:at+1,to:at+1,text:'**'}]);expect(result.session.source).toBe(source.replace('A','**A**'));expect(result.session.doc.eq(tr.doc)).toBe(true)
 expect(open(result.session.source).doc.eq(tr.doc)).toBe(true)
 expect(result.session.source).toContain('\\\n')
 expect(result.session.source.endsWith(source.slice(s.roots[0]!.tailFrom,s.roots[0]!.sourceTo)+(source.includes('\n\nB')?'\nB':''))).toBe(true)
})
it.each(['A  \n\n','\uFEFFA  \r\n\r\n','- A  \n\n\n'])(
 'does not duplicate envelope EOL or source-tail empty paragraphs %j',source=>{
 const s=open(source),p=textPos(s.doc),tr=EditorState.create({doc:s.doc}).tr.addMark(p,p+1,s.doc.type.schema.marks.strong!.create())
 const r=applySourceBlockTransaction(s,tr);expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.reason)
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.doc.childCount).toBe(s.doc.childCount)
 const tail=source.slice(s.roots[0]!.tailFrom,s.roots[0]!.sourceTo)
 expect(r.session.source).toBe(source.replace('A','**A**'));const at=source.indexOf('A');expect(r.edits).toEqual([{from:at,to:at,text:'**'},{from:at+1,to:at+1,text:'**'}]);expect(r.session.source.slice(s.roots[0]!.tailFrom+4,s.roots[0]!.sourceTo+4)).toBe(tail)
 expect(r.session.layout.blankLines.map(u=>r.session.source.slice(u.sourceFrom,u.sourceTo)))
  .toEqual(s.layout.blankLines.map(u=>source.slice(u.sourceFrom,u.sourceTo)))
})
it('keeps sparse text provenance and terminal semantics separate',()=>{
 const s=open('甲  \r\n\r\n')
 expect(s.textSpans).toEqual([{sourceFrom:0,sourceTo:1,pmFrom:1,pmTo:2,kind:'linear'}])
 const tr=EditorState.create({doc:s.doc}).tr.insertText('乙',1,2),r=applySourceBlockTransaction(s,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.reason)
 expect(r.mode).toBe('exact-text');expect(r.session.source).toBe('乙  \r\n\r\n')
 for(const [raw,pmFrom] of [['- 甲  \n',3],['> 甲  \n',2]] as const){
  const nested=open(raw)
  expect(nested.textSpans).toEqual([{sourceFrom:2,sourceTo:3,pmFrom,pmTo:pmFrom+1,kind:'linear'}])
  expect(nested.doc.nodeAt(pmFrom+1)!.type.name).toBe('hardbreak')
  expect(nested.source).toBe(raw)
  const transaction=EditorState.create({doc:nested.doc}).tr.insertText('乙',pmFrom,pmFrom+1)
  const changed=applySourceBlockTransaction(nested,transaction)
  expect(changed.ok).toBe(true)
  if(changed.ok){expect(changed.mode).toBe('exact-text');expect(changed.session.source).toBe(raw.replace('甲','乙'));expect(changed.session.doc.eq(transaction.doc)).toBe(true)}
 }
})
it('does not change public serializer or authorize invisible definition deletion',()=>{
 const s=open('A\\\n\\\n')
 expect(serializeMarkdown(s.doc)).toBe('A  \n  \n')
 const nested=open('> [ref]: /url\n>\n> A  \n'),p=textPos(nested.doc)
 const tr=EditorState.create({doc:nested.doc}).tr.addMark(p,p+1,nested.doc.type.schema.marks.strong!.create()),r=applySourceBlockTransaction(nested,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('> [ref]: /url\n>\n> **A**  \n');expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.protectedSources).toEqual(nested.protectedSources);for(const p of nested.protectedSources)expect(r.session.source.slice(p.sourceFrom,p.sourceTo)).toBe(nested.source.slice(p.sourceFrom,p.sourceTo))
})
