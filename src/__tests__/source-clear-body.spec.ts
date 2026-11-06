import {expect,it} from 'vitest'
import {EditorState,TextSelection} from 'prosemirror-state'
import {applySourceBlockTransaction,createSourceSession} from '../source-fidelity'
function open(source:string){const r=createSourceSession(source);if(!r.ok)throw Error(r.reason);return r.session}
const bodies=['hello\nworld\n','[r]: /target\n\nhello\n','hello\n\n[r]: /target\n','hello[^n]\n\n[^n]: footnote\n','<div>HTML</div>\n','$$\nx+y\n$$\n','- item\n  - nested\n']
it.each(bodies)('clears a complete document range: %j',body=>{
 const base=open(body),snapshot=JSON.stringify(base),tr=EditorState.create({doc:base.doc}).tr
 tr.replaceWith(0,base.doc.content.size,base.doc.type.schema.nodes.paragraph!.create())
 const r=applySourceBlockTransaction(base,tr)
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason)
 if(base.protectedSources.length)expect(r.session.source).toContain('[r]: /target')
 else expect(r.session.source).toBe('')
 expect(r.session.doc.eq(tr.doc)).toBe(true)
 expect(JSON.stringify(base)).toBe(snapshot)
})
it.each(bodies)('clears a complete body range preserving frontmatter bytes: %j',body=>{
 const prefix='---\r\ntitle: "keep"\r\n---\r\n',base=open(prefix+'\r\n'+body),fm=base.doc.firstChild!
 const tr=EditorState.create({doc:base.doc}).tr.replaceWith(fm.nodeSize,base.doc.content.size,base.doc.type.schema.nodes.paragraph!.create())
 const r=applySourceBlockTransaction(base,tr)
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.session.source.startsWith(prefix)).toBe(true)
 if(base.protectedSources.length)expect(r.session.source).toContain('[r]: /target')
 expect(r.session.doc.eq(tr.doc)).toBe(true)
 expect(r.session.doc.firstChild!.eq(fm)).toBe(true)
})
it('accepts a complete plain-text body deletion spanning an unmapped soft break',()=>{
 const prefix='---\ntitle: keep\n---\n',base=open(prefix+'\nhello\nworld\n'),from=base.doc.firstChild!.nodeSize+1
 const state=EditorState.create({doc:base.doc,selection:TextSelection.create(base.doc,from,base.doc.content.size-1)})
 const tr=state.tr.deleteSelection(),r=applySourceBlockTransaction(base,tr)
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.session.source).toBe(prefix+'\n');expect(r.session.doc.eq(tr.doc)).toBe(true)
})
it('does not authorize removing hidden definitions by deleting the final character',()=>{
 const base=open('x\n\n[r]: /keep\n'),tr=EditorState.create({doc:base.doc}).tr.delete(1,2),r=applySourceBlockTransaction(base,tr)
 if(r.ok)expect(r.session.source).toContain('[r]: /keep')
 expect(base.source).toBe('x\n\n[r]: /keep\n')
})
it('does not expand a partial deletion into clearing unselected content',()=>{
 const base=open('hello world'),tr=EditorState.create({doc:base.doc}).tr.delete(1,6),r=applySourceBlockTransaction(base,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.session.doc.textContent).toBe(' world')
})

import {SourceHistoryStep,type RawEdit} from '../source-history'
it('complete deletion at a definition EOF produces invertible source history',()=>{
 const base=open('正文\n\n[r]: /target\n'),tr=EditorState.create({doc:base.doc}).tr.replaceWith(0,base.doc.content.size,base.doc.type.schema.nodes.paragraph!.create())
 const r=applySourceBlockTransaction(base,tr)
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason)
 const edits=SourceHistoryStep.canonicalEdits(r.edits.map(edit=>({...edit,removed:base.source.slice(edit.from,edit.to)})))
 const step=new SourceHistoryStep([{beforeLineage:'before',afterLineage:'after',beforeHash:'a'.repeat(64),afterHash:'b'.repeat(64),edits}])
 const apply=(source:string,changes:readonly RawEdit[])=>{
  let at=0,output=''
  for(const edit of changes){expect(source.slice(edit.from,edit.to)).toBe(edit.removed);output+=source.slice(at,edit.from)+edit.text;at=edit.to}
  return output+source.slice(at)
 }
 expect(apply(base.source,step.deltas[0]!.edits)).toBe(r.session.source)
 const undo=step.invert()
 expect(apply(r.session.source,undo.deltas[0]!.edits)).toBe(base.source)
 expect(apply(base.source,undo.invert().deltas[0]!.edits)).toBe(r.session.source)
})
