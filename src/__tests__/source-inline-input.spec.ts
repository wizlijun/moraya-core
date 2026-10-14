import {it,expect} from 'vitest';
import {createEditor} from '../setup';
import {BrowserMediaResolver} from '../adapters/browser-media-resolver';
import {EditorState,TextSelection,type Transaction} from 'prosemirror-state';
import {toggleMark} from 'prosemirror-commands';
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity';
it.each([
 ['**bold**!','strong','bold!'],
 ['*italic*!','em','italic!'],
] as const)('accepts every key of %s in one empty captured session',async(sequence,mark,visible)=>{
 const container=document.createElement('div');document.body.append(container);
 let session:Extract<ReturnType<typeof createSourceSession>,{ok:true}>['session'];
 const seen:string[]=[];
 const editor=await createEditor({container,mediaResolver:new BrowserMediaResolver(),
  createState(schema,plugins){
   const opened=createSourceSession('',schema);if(!opened.ok)throw Error(opened.reason);session=opened.session;
   return EditorState.create({schema,doc:session.doc,plugins:plugins.filter(plugin=>{
    const key=(plugin as unknown as {key:string}).key;
    return !key.startsWith('moraya-link-text$')&&!key.startsWith('moraya-inline-code-convert$');
   })});
  },
  dispatchTransaction(view,tr){
   if(tr.docChanged){
    const result=applySourceBlockTransaction(session,tr);
    expect(result.ok,JSON.stringify({before:session.source,steps:tr.steps.map(s=>s.toJSON()),result})).toBe(true);
    if(!result.ok)throw Error(result.reason);session=result.session;
    expect(session.doc.eq(tr.doc)).toBe(true);seen.push(session.source);
   }
   view.updateState(view.state.apply(tr));
  },
 });
 try{
  for(const key of sequence){
   const {from,to}=editor.view.state.selection;
   const handled=editor.view.someProp('handleTextInput',f=>f(editor.view,from,to,key,()=>editor.view.state.tr.insertText(key,from,to)));
   if(!handled)editor.view.dispatch(editor.view.state.tr.insertText(key,from,to));
  }
  expect(seen).toHaveLength(sequence.length);
  expect(editor.view.state.doc.textContent).toBe(visible);
  expect(editor.view.state.doc.firstChild!.firstChild!.marks.some(m=>m.type.name===mark)).toBe(true);
  expect(session!.source).not.toContain('\u200b');
  toggleMark(editor.view.state.schema.marks[mark]!)(editor.view.state,tr=>editor.view.dispatch(tr));
  const {from,to}=editor.view.state.selection;
  const handled=editor.view.someProp('handleTextInput',f=>f(editor.view,from,to,'x',()=>editor.view.state.tr.insertText('x',from,to)));
  if(!handled)editor.view.dispatch(editor.view.state.tr.insertText('x',from,to));
  expect(editor.view.state.doc.textContent).toBe(visible+'x');
  expect(editor.view.state.doc.firstChild!.lastChild!.marks).toEqual([]);
  expect(session!.source).toBe((mark==='strong'?'**bold!**':'*italic!*')+'&#120;');
 }finally{editor.destroy();container.remove()}
});
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
