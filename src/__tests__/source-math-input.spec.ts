// @vitest-environment happy-dom
import {it,expect} from 'vitest';
import {EditorState,TextSelection,type Transaction} from 'prosemirror-state';
import {ReplaceStep,ReplaceAroundStep} from 'prosemirror-transform';
import {createEditor} from '../setup';
import {BrowserMediaResolver} from '../adapters/browser-media-resolver';
import {createSourceSession,applySourceBlockTransaction,prepareFileSourceEdits,type SourceSession} from '../source-fidelity';
import {pos} from './source-inline-test-utils';
async function input(raw:string,path:readonly number[],offset:number,text:string,transform?:(base:SourceSession)=>SourceSession){
 const container=document.createElement('div');document.body.append(container);
 const editor=await createEditor({container,initialContent:raw,mediaResolver:new BrowserMediaResolver()});
 try{
  const o=createSourceSession(raw,editor.view.state.schema);if(!o.ok)throw Error(o.reason);
  const b=transform?transform(o.session):o.session,at=pos(b.doc,path,offset);
  editor.view.updateState(EditorState.create({doc:b.doc,plugins:editor.view.state.plugins,
   selection:TextSelection.create(b.doc,at)}));
  const seen:Transaction[]=[];
  editor.view.setProps({dispatchTransaction(tr){seen.push(tr);editor.view.updateState(editor.view.state.apply(tr))}});
  const handled=editor.view.someProp('handleTextInput',f=>f(editor.view,at,at,text,
   ()=>editor.view.state.tr.insertText(text,at)));
  expect(handled).toBe(true);expect(seen).toHaveLength(1);
  return {b,tr:seen[0]!};
 }finally{editor.destroy();container.remove()}
}
it('real dollar-dollar-space retains both original steps',async()=>{
 const {b,tr}=await input('$$',[0],2,' ');
 expect(tr.steps.map(s=>Object.getPrototypeOf(s))).toEqual([ReplaceStep.prototype,ReplaceAroundStep.prototype]);
 const first=tr.steps[0] as ReplaceStep,last=tr.steps[1] as ReplaceAroundStep;
 expect([first.from,first.to,last.from,last.to,last.gapFrom,last.gapTo,last.insert]).toEqual([1,3,0,2,1,1,1]);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe('$$ $$');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it.each([
 ['__Keep__ $x',[0],7,'__Keep__ $x$'],
 ['> __Keep__ $x\n',[0,0],7,'> __Keep__ $x$\n'],
 ['- __Keep__ $x\n',[0,0,0],7,'- __Keep__ $x$\n'],
 ['| H |\n| --- |\n| __Keep__ $x |\n',[0,1,0,0],7,'| H |\n| --- |\n| __Keep__ $x$ |\n'],
 ['> [r]: /u\n>\n> __Keep__ $x\n',[0,0],7,'> [r]: /u\n>\n> __Keep__ $x$\n'],
] as const)('actual inline math preserves raw %j',async(raw,path,offset,expected)=>{
 const {b,tr}=await input(raw,path,offset,'$');
 expect(tr.steps).toHaveLength(1);expect(Object.getPrototypeOf(tr.steps[0]!)).toBe(ReplaceStep.prototype);
 const step=tr.steps[0] as ReplaceStep;
 expect(step.slice.content.firstChild!.type.name).toBe('math_inline');
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.mode).not.toBe('root-render');expect(r.session.source).toBe(expected);
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(b.source).toBe(raw);
 // 本次唯一syntax替换不包含旧__Keep__；可以替换原$x为$x$，不要求伪造只插最后$的Step。
 expect(r.edits.every(e=>!b.source.slice(e.from,e.to).includes('__Keep__'))).toBe(true);
});

it.each([
 ['# __Keep__ $x',[0],7,'# __Keep__ $x$'],
 ['\uFEFF__Keep__ $x\r\n',[0],7,'\uFEFF__Keep__ $x$\r\n'],
 ['> - __Keep__ $x\n',[0,0,0,0],7,'> - __Keep__ $x$\n'],
 ['__Keep__ $x$ $$x$$ $z',[0],15,'__Keep__ $x$ $$x$$ $z$'],
 ['| H |\n| --- |\n| __Keep__ $a\\|b |\n',[0,1,0,0],9,'| H |\n| --- |\n| __Keep__ $a\\|b$ |\n'],
 ['__Keep__ $x\n\n__Keep__ $x',[1],7,'__Keep__ $x\n\n__Keep__ $x$'],
] as const)('more real inline rules preserve exact syntax %j',async(raw,path,offset,expected)=>{
 const {b,tr}=await input(raw,path,offset,'$');const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.mode).toBe('fragment-render');
});
it('rawDelta lineDelta reference environment and foreign recapture precede the real input rule',async()=>{
 const raw='A\n\n> [r]: /u\n>\n> __Keep__ [R][r] $x$ $$x$$ $z\n';
 const {b,tr}=await input(raw,[2,0],17,'$',session=>{
  const moved=prepareFileSourceEdits(session,{expectedRevision:session.revision,edits:[{from:0,to:1,removed:'A',text:'Long\n\nPrefix'}]});expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);
  return {...moved.session,layout:JSON.parse(JSON.stringify(moved.session.layout)) as typeof moved.session.layout};
 });
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe('Long\n\nPrefix\n\n> [r]: /u\n>\n> __Keep__ [R][r] $x$ $$x$$ $z$\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
 expect(r.session.protectedSources).toEqual(b.protectedSources);
});
it.each([
 ['> $$',[0,0],'> $$ $$'],
] as const)('real nested block rule: %s',async(raw,path,expected)=>{
 const {b,tr}=await input(raw,path,2,' ');expect(tr.steps).toHaveLength(2);const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok){expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true)}
});

it.each([['- $$',[0,0,0]],['| H |\n| --- |\n| $$ |\n',[0,1,0,0]]] as const)('schema-forbidden first paragraph block rule dispatches nothing: %s',async(raw,path)=>{
 const container=document.createElement('div');document.body.append(container);const editor=await createEditor({container,initialContent:raw,mediaResolver:new BrowserMediaResolver()});
 try{
  const at=pos(editor.view.state.doc,path,2),resolved=editor.view.state.doc.resolve(at),parent=resolved.node(-1),index=resolved.index(-1);
  expect(parent.canReplaceWith(index,index+1,editor.view.state.schema.nodes.math_block!)).toBe(false);
  editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc,at)));
  const seen:Transaction[]=[];editor.view.setProps({dispatchTransaction(tr){seen.push(tr)}});
  expect(editor.view.someProp('handleTextInput',f=>f(editor.view,at,at,' ',()=>editor.view.state.tr.insertText(' ',at)))).not.toBe(true);expect(seen).toHaveLength(0);
 }finally{editor.destroy();container.remove()}
});
