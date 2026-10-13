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
 'renders consecutive terminal hardbreaks only through local root serializer %j',source=>{
 const s=open(source);expect(breaks(s.doc)).toEqual([{isInline:false},{isInline:false}])
 const p=textPos(s.doc),tr=EditorState.create({doc:s.doc}).tr.addMark(p,p+1,s.doc.type.schema.marks.strong!.create())
 const result=applySourceBlockTransaction(s,tr);expect(result.ok).toBe(true)
 if(!result.ok)throw new Error(result.reason)
 expect(result.mode).toBe('root-render');expect(result.session.doc.eq(tr.doc)).toBe(true)
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
 expect(r.edits[0]!.text.endsWith(tail)).toBe(true)
 expect(r.session.layout.blankLines.map(u=>r.session.source.slice(u.sourceFrom,u.sourceTo)))
  .toEqual(s.layout.blankLines.map(u=>source.slice(u.sourceFrom,u.sourceTo)))
})
it('keeps sparse text provenance and terminal semantics separate',()=>{
 const s=open('甲  \r\n\r\n')
 expect(s.textSpans).toEqual([{sourceFrom:0,sourceTo:1,pmFrom:1,pmTo:2,kind:'linear'}])
 const tr=EditorState.create({doc:s.doc}).tr.insertText('乙',1,2),r=applySourceBlockTransaction(s,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.reason)
 expect(r.mode).toBe('exact-text');expect(r.session.source).toBe('乙  \r\n\r\n')
 expect(open('- 甲  \n').textSpans).toEqual([])
 expect(open('> 甲  \n').textSpans).toEqual([])
})
it('does not change public serializer or authorize invisible definition deletion',()=>{
 const s=open('A\\\n\\\n')
 expect(serializeMarkdown(s.doc)).toBe('A  \n  \n')
 const nested=open('> [ref]: /url\n>\n> A  \n'),p=textPos(nested.doc)
 const r=applySourceBlockTransaction(nested,EditorState.create({doc:nested.doc}).tr.addMark(p,p+1,nested.doc.type.schema.marks.strong!.create()))
 expect(r.ok).toBe(false);expect(nested.source).toContain('[ref]: /url')
})
