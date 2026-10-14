import {expect,it} from 'vitest'; import {change,bold} from './source-nested-test-utils';
it.each([
 ['>  甲。\n> 第二句。\n',[0,0],0,'>  乙。\n> 第二句。\n'],
 ['*   甲。\n*   甲。\n',[0,1,0],0,'*   甲。\n*   乙。\n'],
 ['[^n]: 甲。\n\n正文[^n]。',[0,0],0,'[^n]: 乙。\n\n正文[^n]。'],
 ['###   甲。   ###\n',[0],0,'###   乙。   ###\n'],
 ['甲。\n====\n',[0],0,'乙。\n====\n'],
 ['\uFEFF>  甲。\r\n> 甲。\r\n',[0,0],0,'\uFEFF>  乙。\r\n> 甲。\r\n'],
 ['> 甲。\nlazy甲。\n',[0,0],7,'> 甲。\nlazy乙。\n'],
] as const)('real nested body %j',(a,path,o,b)=>{change(a,path,o,b)});
it('preserves actual nested definition while real toggleMark edits Alpha',()=>{
 const a='> [ref]: /url\n>\n> Alpha\n\nTail';
 const {r,tr}=bold(a,[0,0]); expect(r.ok).toBe(true); if(!r.ok)throw Error(r.reason);
 expect(r.mode).toBe('fragment-render');
 expect(r.session.source).toBe('> [ref]: /url\n>\n> **Alpha**\n\nTail');
 expect(r.session.doc.eq(tr.doc)).toBe(true); expect(r.edits).toEqual([{from:18,to:18,text:'**'},{from:23,to:23,text:'**'}]);
 const back=bold(r.session.source,[0,0]); expect(back.r.ok).toBe(true);
 if(back.r.ok)expect(back.r.session.source).toBe(a);
});

import {vi} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {ReplaceStep} from 'prosemirror-transform'
import {applySourceBlockTransaction,applySourceTextTransaction} from '../source-fidelity'
import * as markdown from '../markdown'
import {at,open} from './source-nested-test-utils'

it('never renders the protected owner for full-body marks',()=>{
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown')
 try{
  for(const [raw,path] of [['> [ref]: /u\n>\n> Alpha\n\nTail',[0,0]],['- [ref]: /u\n\n  Alpha\n\nTail',[0,0,0]]] as const){
   const {r}=bold(raw,path);expect(r.ok).toBe(true)
   if(r.ok){expect(r.mode).toBe('fragment-render');expect(r.session.source).toBe(raw.replace('Alpha','**Alpha**'))}
  }
  expect(spy).not.toHaveBeenCalled()
 }finally{spy.mockRestore()}
})
it('preserves raw while a real mark spans Alpha and Tail',()=>{
 const raw='> [ref]: /u\n>\n> Alpha\n\nTail',base=open(raw),before=JSON.stringify(base)
 const a=at(base.doc,[0,0]),z=at(base.doc,[1],4)
 expect(base.doc.textBetween(a,a+5)).toBe('Alpha');expect(base.doc.textBetween(z-4,z)).toBe('Tail')
 const tr=EditorState.create({doc:base.doc}).tr.addMark(a,z,base.doc.type.schema.marks.strong!.create())
 const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(r.session.source).toBe('> [ref]: /u\n>\n> **Alpha**\n\n**Tail**');expect(r.session.doc.eq(tr.doc)).toBe(true)
 expect(r.session.protectedSources).toEqual(base.protectedSources);expect(r.edits).toHaveLength(4);expect(JSON.stringify(base)).toBe(before)
})
it('rejects custom ReplaceStep prototypes in both public paths',()=>{
 class FakeReplace extends ReplaceStep{}
 const base=open('> 甲。\n'),p=at(base.doc,[0,0]),original=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1).steps[0] as ReplaceStep
 const tr=EditorState.create({doc:base.doc}).tr.step(new FakeReplace(original.from,original.to,original.slice))
 for(const apply of [applySourceBlockTransaction,applySourceTextTransaction])expect(apply(base,tr).ok).toBe(false)
 expect(base.source).toBe('> 甲。\n')
})
it('rejects a forged tr.docs before chain for both public paths',()=>{
 const base=open('> 甲。\n'),p=at(base.doc,[0,0]),tr=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1)
 tr.docs.push(tr.doc)
 for(const apply of [applySourceBlockTransaction,applySourceTextTransaction])expect(apply(base,tr).ok).toBe(false)
})
for(const [raw,path,offset] of [['> &NotEqualTilde;。\n',[0,0],1],['> 😀。\n',[0,0],1]] as const)it(`rejects partial atomic/surrogate inside ${raw}`,()=>{
 const base=open(raw),p=at(base.doc,path,offset),before=JSON.stringify(base)
 const tr=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1)
 for(const apply of [applySourceBlockTransaction,applySourceTextTransaction])expect(apply(base,tr).ok).toBe(false)
 expect(JSON.stringify(base)).toBe(before)
})
it('rejects one Replace across quote prefix and hardbreak',()=>{
 const base=open('> 甲。\n> 甲。\n'),p=at(base.doc,[0,0]),before=JSON.stringify(base)
 expect(base.doc.textBetween(p,p+1)).toBe('甲');expect(base.doc.textBetween(p+3,p+4)).toBe('甲')
 const tr=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+4)
 expect(applySourceBlockTransaction(base,tr).ok).toBe(false);expect(JSON.stringify(base)).toBe(before)
})
for(const [raw,path,attrs] of [['- [ ] 甲\n',[0,0],{checked:true}],['```js\n甲\n```\n',[0],{language:'ts'}],['### 甲\n',[0],{level:2}]] as const)it(`rejects fake text payload changing attrs in ${raw}`,()=>{
 const base=open(raw),pos=at(base.doc,path)-1,node=base.doc.nodeAt(pos)!,before=JSON.stringify(base)
 const target=EditorState.create({doc:base.doc}).tr.setNodeMarkup(pos,undefined,{...node.attrs,...attrs}).doc
 const p=at(base.doc,raw.startsWith('-')?[0,0,0]:path)
 const tr=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1)
 tr.doc=target
 for(const apply of [applySourceBlockTransaction,applySourceTextTransaction])expect(apply(base,tr).ok).toBe(false)
 expect(JSON.stringify(base)).toBe(before)
})
it('keeps the consumed checkbox prefix outside the marked body',()=>{
 const raw='*   [x] Alpha\r\n',base=open(raw)
 expect(base.doc.child(0).child(0).attrs.checked).toBe(true)
 const {r,tr}=bold(raw,[0,0,0]);expect(r.ok).toBe(true)
 if(r.ok){expect(r.mode).toBe('fragment-render');expect(r.session.source).toBe('*   [x] **Alpha**\r\n');expect(r.session.doc.eq(tr.doc)).toBe(true)}
})
it('emits source spans at final schema-filled nested list positions',()=>{
 change('- - 甲\n',[0,0,1,0,0],0,'- - 乙\n')
})
it.each([
 ['> \t甲。\n',[0,0],'> \t乙。\n'],
 ['* \t甲。\n',[0,0,0],'* \t乙。\n'],
] as const)('projects actual tab-indented body %j',(raw,path,expected)=>{change(raw,path,0,expected)})
it('escapes an inserted literal syntax character without whole-root fallback',()=>{
 const base=open('> Alpha\n'),p=at(base.doc,[0,0]),tr=EditorState.create({doc:base.doc}).tr.insertText('>',p)
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown')
 try{
  const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
  expect(r.edits).toEqual([{from:2,to:2,text:'\\>'}])
  expect(r.session.source).toBe('> \\>Alpha\n')
  expect(r.session.doc.eq(tr.doc)).toBe(true)
  expect(base.source).toBe('> Alpha\n')
  expect(spy).not.toHaveBeenCalled()
 }finally{spy.mockRestore()}
})
