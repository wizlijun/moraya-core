import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {ReplaceStep,AttrStep} from 'prosemirror-transform'
import {Slice,Fragment} from 'prosemirror-model'
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity'
it.each([
 ['/highlight','^^^^','\\^\\^\\^\\^'],['/wikilink','[[]]','\\[\\[\\]\\]'],['/abc','ZZ','ZZ'],
 ['\uFEFF/abc\r\n\r\n[id]: /u\r\n','ZZ','\uFEFFZZ\r\n\r\n[id]: /u\r\n'],
 ['/abc\n\n[id]: /u\n','ZZ','ZZ\n\n[id]: /u\n'],
])('natural body temporarily emptied by original steps remains owned: %s',(raw,text,want)=>{
 const parsed=createSourceSession(raw);if(!parsed.ok)throw Error(parsed.reason)
 const state=EditorState.create({doc:parsed.session.doc}),size=state.doc.firstChild!.content.size
 const tr=state.tr.delete(1,size+1).insertText(text,1),steps=[...tr.steps],docs=[...tr.docs]
 const result=applySourceBlockTransaction(parsed.session,tr)
 expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason)
 expect(result.session.source).toBe(want);expect(result.session.doc.eq(tr.doc)).toBe(true)
 expect(tr.steps).toEqual(steps);expect(tr.docs).toEqual(docs)
})
it('temporary empty chain does not authorize unknown steps or newly born structural bodies',()=>{
 const parsed=createSourceSession('A');if(!parsed.ok)throw Error(parsed.reason)
 const state=EditorState.create({doc:parsed.session.doc})
 class Foreign extends ReplaceStep{}
 const foreign=state.tr.delete(1,2).step(new Foreign(1,1,new Slice(Fragment.from(state.schema.text('B')),0,0)))
 expect(applySourceBlockTransaction(parsed.session,foreign).ok).toBe(false)
 const attr=state.tr.delete(1,2).step(new AttrStep(0,'unknown','x')).insertText('B',1)
 expect(applySourceBlockTransaction(parsed.session,attr).ok).toBe(false)
})
