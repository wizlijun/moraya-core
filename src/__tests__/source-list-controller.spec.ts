import {expect,it} from 'vitest'
import {EditorState,TextSelection,type Transaction,type Command} from 'prosemirror-state'
import {wrapInList,liftListItem,splitListItem} from 'prosemirror-schema-list'
import {createSourceSession,applySourceBlockTransaction,prepareSourceListBoundarySteps} from '../source-fidelity'
function open(raw:string){const r=createSourceSession(raw);if(!r.ok)throw Error(r.reason);return r.session}
function state(raw:string,word:string){const b=open(raw);let pos=-1;b.doc.descendants((n,p)=>{if(n.isText&&n.text!.includes(word))pos=p+n.text!.indexOf(word)});return {b,s:EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,pos)})}}
function command(s:EditorState,c:Command){let tr:Transaction|undefined;expect(c(s,t=>{tr=t})).toBe(true);return tr!}
it('real wrap generates only the same-marker seam before source consumption',()=>{
 const {b,s}=state('1. A\n\nP\n\n1) C','P'),tr=command(s,wrapInList(s.schema.nodes.ordered_list!)),r=prepareSourceListBoundarySteps(b,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.steps).toHaveLength(1);for(const step of r.steps)tr.step(step)
 const result=applySourceBlockTransaction(b,tr);expect(result.ok).toBe(true)
 if(result.ok)expect(result.session.source).toBe('1. A\n\n<!-- notemd:list-boundary -->\n\n1. P\n\n1) C')
})
it('real lift then delete separates the surviving same-marker lists',()=>{
 const {b,s}=state('+ A\n+ B\n+ C','B'),tr=command(s,liftListItem(s.schema.nodes.list_item!)),at=tr.doc.child(0).nodeSize
 tr.delete(at,at+tr.doc.child(1).nodeSize)
 const r=prepareSourceListBoundarySteps(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.steps).toHaveLength(1);for(const step of r.steps)tr.step(step)
 expect(applySourceBlockTransaction(b,tr).ok).toBe(true)
})
it('splitListItem remains one list without M',()=>{
 const {b,s}=state('* AlphaBeta','Beta'),tr=command(s,splitListItem(s.schema.nodes.list_item!))
 expect(prepareSourceListBoundarySteps(b,tr)).toEqual({ok:true,steps:[]})
})
it.each(['> 1. A\n>\n> P\n>\n> 3. B','- parent\n\n  1. A\n\n  P\n\n  3. B'])('nested real wrap generates descending closed replacements %s',raw=>{
 const {b,s}=state(raw,'P'),tr=command(s,wrapInList(s.schema.nodes.ordered_list!)),r=prepareSourceListBoundarySteps(b,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.steps).toHaveLength(2);expect(r.steps[0]!.from).toBeGreaterThan(r.steps[1]!.from)
 for(const step of r.steps){expect(step.slice.openStart).toBe(0);tr.step(step)}
 expect(applySourceBlockTransaction(b,tr).ok).toBe(true)
 expect(prepareSourceListBoundarySteps(b,tr)).toEqual({ok:true,steps:[]})
})
it('different inherited markers need no M and existing/orphan M is retained',()=>{
 const {b,s}=state('+ A\n\nP\n\n* C','P'),tr=command(s,wrapInList(s.schema.nodes.bullet_list!))
 expect(prepareSourceListBoundarySteps(b,tr)).toEqual({ok:true,steps:[]})
 const other=state('<!-- notemd:list-boundary -->\n\nA','A')
 expect(prepareSourceListBoundarySteps(other.b,other.s.tr.insertText('Z'))).toEqual({ok:true,steps:[]})
})
import {ReplaceStep} from 'prosemirror-transform'
import {Slice} from 'prosemirror-model'
it('subclass and corrupted actual docs chain cannot produce M',()=>{
 const {b,s}=state('A','A');class Foreign extends ReplaceStep {}
 const tr=s.tr.step(new Foreign(1,1,Slice.empty))
 expect(prepareSourceListBoundarySteps(b,tr).ok).toBe(false)
 const bad=s.tr.insertText('X');bad.docs[0]=open('other').doc
 expect(prepareSourceListBoundarySteps(b,bad).ok).toBe(false)
})
import {AddMarkStep,RemoveMarkStep} from 'prosemirror-transform'
it.each(['A\n\n\nB','A\r\n\r\n\r\nB','A\n\n[ref]: /u "kept"\n\n\nB'])('projection boundary: one wide mark crosses only unchanged known synthetic children %j',raw=>{
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr.step(new AddMarkStep(1,b.doc.content.size-1,b.doc.type.schema.marks.em!.create())),step=tr.steps[0],docs=[...tr.docs]
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.session.source).toBe(raw.replace('A','*A*').replace('B','*B*'))
 expect(tr.steps).toEqual([step]);expect(tr.docs).toEqual(docs);expect(tr.steps[0]).toBe(step)
 expect(r.session.doc.eq(tr.doc)).toBe(true)
 const undo=EditorState.create({doc:r.session.doc}).tr.step(new RemoveMarkStep(1,r.session.doc.content.size-1,r.session.doc.type.schema.marks.em!.create()))
 const removed=applySourceBlockTransaction(r.session,undo);expect(removed.ok).toBe(true);if(removed.ok)expect(removed.session.source).toBe(raw)
})
it('projection boundary: layout edits, unknown synthetic metadata and mixed unsupported steps are atomic rejection',()=>{
 const b=open('A\n\n\nB'),s=EditorState.create({doc:b.doc}),mark=()=>new AddMarkStep(1,b.doc.content.size-1,s.schema.marks.em!.create())
 const at=b.doc.child(0).nodeSize
 // Unchanged final content cannot hide an actual unsupported intermediate edit.
 const changed=s.tr.insertText('X',at+1).delete(at+1,at+2).step(mark())
 expect(applySourceBlockTransaction(b,changed).ok).toBe(false)
 const unknown={...b,gaps:b.gaps.map(g=>({...g,synthetic:[]})),layout:{...b.layout,blankLines:[]}}
 expect(applySourceBlockTransaction(unknown,s.tr.step(mark())).ok).toBe(false)
 class ForeignMark extends AddMarkStep {}
 const mixed=s.tr.step(mark()).step(new ForeignMark(1,2,s.schema.marks.strong!.create()))
 expect(applySourceBlockTransaction(b,mixed).ok).toBe(false)
 expect(b.source).toBe('A\n\n\nB');expect(b.doc.eq(s.doc)).toBe(true)
})
