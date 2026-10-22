import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {AttrStep} from 'prosemirror-transform'
import {applySourceBlockTransaction,createSourceSession,prepareFileSourceEdits} from '../source-fidelity'
import {capturedTaskCheckboxes} from '../markdown'
import {prepareTaskCheckboxEdits} from '../source-task-checkbox'

function open(raw:string){const r=createSourceSession(raw);if(!r.ok)throw Error(r.reason);return r.session}
function tasks(doc:ReturnType<typeof open>['doc']){const rows:{pos:number;checked:boolean}[]=[];doc.descendants((node,pos)=>{if(node.type.name==='list_item'&&typeof node.attrs.checked==='boolean')rows.push({pos,checked:node.attrs.checked})});return rows}
function toggle(base:ReturnType<typeof open>,index=0){const {pos}=tasks(base.doc)[index]!,node=base.doc.nodeAt(pos)!;return EditorState.create({doc:base.doc}).tr.setNodeMarkup(pos,undefined,{...node.attrs,checked:!node.attrs.checked})}

it.each([
 '- [ ] **任务**\n\n说明[^note]。\n\n[^note]: 脚注说明\n',
 '- [ ] A\n\n[^a]: note\n[^b]: note\n',
 '- [ ] [link][id]\n\n[id]: /target "title"\n',
 '- [ ] A\n\n  | A | B |\n  | --- | --- |\n  | C | D |\n',
 '\uFEFF+ [ ] __keep__ &amp; \\*\r\n\r\nTail  \r\n',
 '> 3) [ ] `A`\r>    + [X] __B__\r',
 '- [ ]\n',
])('checkbox edits only its captured state character: %j',raw=>{
 const b=open(raw),tr=toggle(b),r=applySourceBlockTransaction(b,tr)
 expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return
 const at=raw.indexOf('[ ]')+1
 expect(r.session.source).toBe(raw.slice(0,at)+'x'+raw.slice(at+1))
 expect(r.session.doc.eq(tr.doc)).toBe(true)
 expect(r.edits).toEqual([{from:at,to:at+1,text:'x'}])
 expect(r.file?.correspondence.filter(c=>c.kind!=='untouched').every(c=>c.kind==='retained')).toBe(true)
 // The exact patch is also sufficient for native source history to restore bytes.
 const undo=prepareFileSourceEdits(r.session,{expectedRevision:r.session.revision,edits:r.edits.map(e=>({...e,removed:e.text,text:raw.slice(e.from,e.to)}))})
 expect(undo.ok).toBe(true);if(undo.ok)expect(undo.session.source).toBe(raw)
})
it('nested repeated tasks and successive captures retain their own source occurrence',()=>{
 const raw='- [ ] __same__\n  + [X] __same__\n- [ ] __same__\n\n[^n]: note\n'
 const b=open(raw),r=applySourceBlockTransaction(b,toggle(b,1));expect(r.ok).toBe(true);if(!r.ok)return
 expect(r.session.source).toBe(raw.replace('[X]','[ ]'))
 const next=applySourceBlockTransaction(r.session,toggle(r.session,2));expect(next.ok).toBe(true);if(!next.ok)return
 expect(next.session.source).toBe(raw.replace('[X]','[ ]').replace('- [ ] __same__\n\n','- [x] __same__\n\n'))
})
it('multiple native checkbox steps preserve capital X on a net no-op',()=>{
 const b=open('- [X] A\n- [ ] B\n\n[id]: /x\n'),tr=toggle(b),pos=tasks(b.doc)[0]!.pos
 tr.setNodeMarkup(pos,undefined,{...tr.doc.nodeAt(pos)!.attrs,checked:true})
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)return
 expect(r.session.source).toBe(b.source);expect(r.edits).toEqual([])
})
it('native AttrStep supports the same captured checked-only change',()=>{
 const b=open('- [ ] A\n\n[id]: /x\n'),pos=tasks(b.doc)[0]!.pos
 const r=applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.step(new AttrStep(pos,'checked',true)))
 expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe(b.source.replace('[ ]','[x]'))
})
it('mixed text edits and other attributes do not acquire checkbox-only authority',()=>{
 const b=open('- [ ] A\n\n[id]: /x\n'),pos=tasks(b.doc)[0]!.pos
 const cancelled=toggle(b).setNodeMarkup(pos,undefined,{...b.doc.nodeAt(pos)!.attrs,label:'other'})
 for(const tr of [toggle(b).insertText('Z',pos+2),EditorState.create({doc:b.doc}).tr.setNodeMarkup(pos,undefined,{...b.doc.nodeAt(pos)!.attrs,checked:true,label:'other'}),cancelled]){
  expect(prepareTaskCheckboxEdits(b,tr)).toBeUndefined()
  expect(applySourceBlockTransaction(b,tr)).toMatchObject({ok:false})
 }
 expect(b.source).toBe('- [ ] A\n\n[id]: /x\n')
})
it('one chain changes parent, child and a separate root with independent exact patches',()=>{
 const raw='- [ ] __parent__\n  + [X] __child__\n\nSeparate\n\n> 2) [ ] __other__\n\n[id]: /x\n'
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr
 for(const {pos} of tasks(b.doc)){const node=tr.doc.nodeAt(pos)!;tr.setNodeMarkup(pos,undefined,{...node.attrs,checked:!node.attrs.checked})}
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)return
 expect(r.session.source).toBe(raw.replace(/\[( |X)\]/g,(_m,c)=>c===' '?'[x]':'[ ]'))
 expect(r.edits).toHaveLength(3);expect(r.changedRoots).toHaveLength(2)
 expect(r.edits.every(e=>e.to===e.from+1)).toBe(true);expect(r.session.doc.eq(tr.doc)).toBe(true)
})
it('captured checkbox authority cannot be transplanted onto copied session fields',()=>{
 const b=open('- [ ] A\n'),facts=capturedTaskCheckboxes(b)
 expect(facts).toHaveLength(1);expect(Object.isFrozen(facts)).toBe(true);expect(Object.isFrozen(facts![0])).toBe(true)
 for(const copy of [{...b,source:b.source+'\n'},{...b,doc:b.doc.type.schema.nodeFromJSON(b.doc.toJSON())},{...b,roots:[...b.roots]},{...b,layout:{...b.layout}}]){
  expect(capturedTaskCheckboxes(copy)).toBeUndefined()
  expect(prepareTaskCheckboxEdits(copy,toggle(b))).toBeUndefined()
 }
})
