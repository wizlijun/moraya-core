import {it,expect} from 'vitest';
import {createEditor} from '../setup';
import {BrowserMediaResolver} from '../adapters/browser-media-resolver';
import {TextSelection,type Transaction} from 'prosemirror-state';
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity';
it('actual closing-backtick input rule preserves unrelated raw',async()=>{
 const raw='> `Alpha\n',expected='> `Alpha`\n';
 const container=document.createElement('div');document.body.append(container);
 const editor=await createEditor({container,initialContent:raw,mediaResolver:new BrowserMediaResolver()});
 try {
  const opened=createSourceSession(raw,editor.view.state.schema);if(!opened.ok)throw Error(opened.reason);
  const b=opened.session;expect(editor.view.state.doc.eq(b.doc)).toBe(true);
  const end=2+6;editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc,end)));
  const seen:Transaction[]=[];
  editor.view.setProps({dispatchTransaction(tr){seen.push(tr);editor.view.updateState(editor.view.state.apply(tr))}});
  const handled=editor.view.someProp('handleTextInput',f=>f(editor.view,end,end,'`',()=>editor.view.state.tr.insertText('`',end)));
  expect(handled).toBe(true);expect(seen).toHaveLength(1);
  const tr=seen[0]!;expect(tr.steps.length).toBeGreaterThan(1);
  const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
 }finally{editor.destroy();container.remove()}
});
it.each([
 ['strong','\\*\\*Alpha\\*','*','**Alpha**'],
 ['em','*Alpha','*','*Alpha*'],
 ['strike_through','~~Alpha~','~','~~Alpha~~'],
 ['highlight','^^Alpha^','^','^^Alpha^^'],
 ['highlight','==Alpha=','=','==Alpha=='],
] as const)('actual %s rule keeps quote prefix and neighboring syntax',async(family,seed,last,body)=>{
 const raw='>  '+seed+'\n\nTail _raw_。\n',container=document.createElement('div');document.body.append(container);
 const editor=await createEditor({container,initialContent:raw,mediaResolver:new BrowserMediaResolver()});
 try{
  const opened=createSourceSession(raw,editor.view.state.schema);if(!opened.ok)throw Error(opened.reason);const base=opened.session;
  expect(editor.view.state.doc.eq(base.doc)).toBe(true);
  const end=2+base.doc.child(0).child(0).content.size;
  editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc,end)));
  const seen:Transaction[]=[];editor.view.setProps({dispatchTransaction(tr){seen.push(tr);editor.view.updateState(editor.view.state.apply(tr))}});
  expect(editor.view.someProp('handleTextInput',f=>f(editor.view,end,end,last,()=>editor.view.state.tr.insertText(last,end)))).toBe(true);
  expect(seen).toHaveLength(1);const tr=seen[0]!;expect(tr.steps.length).toBeGreaterThan(1);
  expect(tr.doc.child(0).child(0).firstChild!.marks.some(m=>m.type.name===family)).toBe(true);
  const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.session.source).toBe('>  '+body+'\n\nTail _raw_。\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
 }finally{editor.destroy();container.remove()}
});
