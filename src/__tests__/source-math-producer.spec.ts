import {applyStructuralTransaction} from '../source-structure';
import {it,expect} from 'vitest';
import {EditorState,TextSelection,NodeSelection,type Transaction} from 'prosemirror-state';
import {Schema,Slice,Fragment} from 'prosemirror-model';
import {ReplaceStep} from 'prosemirror-transform';
import {BrowserMediaResolver} from '../adapters/browser-media-resolver';
import {createSchema} from '../schema';
import {createSourceSession} from '../source-fidelity';
import {parseMarkdown} from '../markdown';
import {insertMathBlock} from '../commands';
import {applySourceBlockTransaction} from '../source-fidelity';
import {open,pos} from './source-inline-test-utils';

function inserted(raw:string,from:number,to=from){
 const b=open(raw),state=EditorState.create({doc:b.doc,
  selection:TextSelection.create(b.doc,from,to)});let tr:Transaction|undefined;
 expect(insertMathBlock(state,t=>{tr=t})).toBe(true);
 if(!tr)throw Error('missing dispatch');
 expect(tr.doc.eq(b.doc)).toBe(false);
 let count=0;tr.doc.descendants(n=>{if(n.type.name==='math_block')count++});
 expect(count).toBeGreaterThan(0);
 return {b,tr};
}
function saved(raw:string,from:number,to:number,expected:string){
 const {b,tr}=inserted(raw,from,to);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);
 if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
 expect(b.source).toBe(raw);return {b,tr,r};
}
it('empty block command produces a real serializable math node',()=>{
 const {tr}=saved('',1,1,'$$ $$');
 expect(tr.steps).toHaveLength(1);
 expect(Object.getPrototypeOf(tr.steps[0]!)).toBe(ReplaceStep.prototype);
 expect(tr.doc.firstChild!.type.name).toBe('math_block');
 expect(tr.doc.firstChild!.attrs.value).toBe('');
 expect(parseMarkdown('$$ $$').eq(tr.doc)).toBe(true);
});
it('mid-paragraph block insertion consumes the actual open slice',()=>{
 const {tr}=saved('A __Keep__ B\n',2,2,'A\n\n$$ $$\n\n&#32;**Keep** B\n');
 const step=tr.steps[0] as ReplaceStep;
 expect([step.from,step.to,step.slice.openStart,step.slice.openEnd]).toEqual([2,2,1,1]);
 expect(tr.doc.child(2).textContent).toBe(' Keep B');
});
it('selected text is replaced without losing remaining leading space',()=>{
 saved('A __Keep__ B\n',1,2,'$$ $$\n\n&#32;**Keep** B\n');
});
it('block insertion preserves every outside root byte',()=>{
 const raw='\uFEFFBefore __raw__\r\n\r\nAB\r\n\r\nTail _raw_',doc=open(raw).doc;
 const at=pos(doc,[1],1);expect(doc.resolve(at).parent.textContent).toBe('AB');
 saved(raw,at,at,'\uFEFFBefore __raw__\r\n\r\nA\n\n$$ $$\n\nB\r\n\r\nTail _raw_');
});
it('nested empty block does not manufacture greater-than payload',()=>{
 saved('> __Keep__ AB\n',8,8,'> **Keep** A\n>\n> $$ $$\n>\n> B\n');
});
it('replacing an existing complete math occurrence is a structural replacement',()=>{
 const b=open('$$\nx\n$$\n\nTail __raw__\n');
 const state=EditorState.create({doc:b.doc,selection:NodeSelection.create(b.doc,0)});
 let tr:Transaction|undefined;insertMathBlock(state,t=>{tr=t});if(!tr)throw Error('dispatch');
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe('$$ $$\n\nTail __raw__\n');
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(b.source).toBe('$$\nx\n$$\n\nTail __raw__\n');
});

it('command uses each actual state schema',()=>{
 for(const schema of [undefined,createSchema({mediaResolver:new BrowserMediaResolver()})]){
  const o=createSourceSession('',schema);if(!o.ok)throw Error(o.reason);const state=EditorState.create({doc:o.session.doc});let tr:Transaction|undefined;
  expect(insertMathBlock(state,t=>{tr=t})).toBe(true);if(!tr)throw Error('dispatch');expect(tr.doc.firstChild!.type).toBe(state.schema.nodes.math_block);
  const r=applySourceBlockTransaction(o.session,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('$$ $$');
 }
});

it.each(['$x$','$$x$$'])('whole inline atom deletion preserves neighbouring spelling: %s',math=>{
 const raw='__Keep__ '+math+' tail\n',b=open(raw);let from=0,to=0;
 b.doc.descendants((n,p)=>{if(n.type.name==='math_inline'){from=p;to=p+n.nodeSize;return false}});
 const tr=EditorState.create({doc:b.doc}).tr.delete(from,to),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('__Keep__  tail\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('complete old block deletion is permitted but payload attr changes are not',()=>{
 const b=open('$$\nx\n$$\n\nTail __raw__\n'),state=EditorState.create({doc:b.doc});
 for(const tr of [state.tr.setNodeAttribute(0,'value','y'),state.tr.setNodeMarkup(0,undefined,{value:'y'})])expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
 const tr=state.tr.delete(0,b.doc.firstChild!.nodeSize),r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok){expect(r.session.source).toBe('Tail __raw__\n');expect(r.session.doc.eq(tr.doc)).toBe(true)}
});
it('noncanonical new math blocks and protected structural roots reject before render',()=>{
 const b=open('AB'),s=b.doc.type.schema;
 for(const node of [s.nodes.math_block!.create({value:'x'}),s.nodes.math_block!.create(null,s.text('x'))]){
  const tr=EditorState.create({doc:b.doc}).tr.step(new ReplaceStep(0,b.doc.content.size,new Slice(Fragment.from(node),0,0)));let renders=0;
  expect(()=>applyStructuralTransaction(b,tr,()=>{renders++;throw Error('renderer reached')},()=>true)).toThrow();expect(renders).toBe(0);
  expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(b.source).toBe('AB');
 }
 const marked=new ReplaceStep(0,b.doc.content.size,new Slice(Fragment.from(s.nodes.math_block!.create(null,null,[s.marks.strong!.create()])),0,0));
 expect(marked.slice.content.firstChild!.marks).toHaveLength(1);expect(()=>EditorState.create({doc:b.doc}).tr.step(marked)).toThrow('Invalid content');
 const protectedBase=open('> AB\n>\n> [r]: /u\n'),state=EditorState.create({doc:protectedBase.doc,selection:TextSelection.create(protectedBase.doc,3)});let tr:Transaction|undefined;insertMathBlock(state,t=>{tr=t});expect(tr).toBeDefined();expect(applySourceBlockTransaction(protectedBase,tr!).ok).toBe(false);
});
it('old math attr and partial payload steps never reach the structural renderer',()=>{
 const b=open('$$\nx\n$$\n'),s=EditorState.create({doc:b.doc});
 for(const tr of [s.tr.setNodeAttribute(0,'value','y'),s.tr.setNodeMarkup(0,undefined,{value:'y'}),s.tr.insertText('x',1)]){
  let renders=0;expect(()=>applyStructuralTransaction(b,tr,()=>{renders++;throw Error('renderer reached')},()=>true)).toThrow();expect(renders).toBe(0);expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
 }
});
it('partial math payload and mixed transactions reject atomically; subsequent legal request succeeds',()=>{
 const raw='__Keep__ $x$\n\nOther\n',b=open(raw),s=b.doc.type.schema,state=EditorState.create({doc:b.doc});let at=0;
 b.doc.descendants((n,p)=>{if(n.type.name==='math_inline'){at=p;return false}});
 const before=b.doc.toJSON(),revision=b.revision;
 const invalid=[state.tr.insertText('z',at+1,at+2),state.tr.addMark(at+1,at+2,s.marks.strong!.create()),state.tr.delete(at+1,at+2),state.tr.addMark(pos(b.doc,[1]),pos(b.doc,[1],2),s.marks.strong!.create()).addMark(at+1,at+2,s.marks.strong!.create())];
 for(const tr of invalid){expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(b.source).toBe(raw);expect(b.doc.toJSON()).toEqual(before);expect(b.revision).toBe(revision)}
 const r=applySourceBlockTransaction(b,state.tr.insertText('Z',1,2));expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('__Zeep__ $x$\n\nOther\n');
});
it('new empty inline and payload mutation after birth reject',()=>{
 const b=open('__Keep__ $x'),s=b.doc.type.schema,state=EditorState.create({doc:b.doc}),from=6,to=8,math=s.nodes.math_inline!.create(null,s.text('x'));
 for(const tr of [state.tr.replaceWith(from,to,s.nodes.math_inline!.create()),state.tr.replaceWith(from,to,math).insertText('y',from+1,from+2)])expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
 expect(b.source).toBe('__Keep__ $x');
});
it('original steps, docs and occurrence bounds cannot be forged',()=>{
 const b=open('__Keep__ $x'),s=b.doc.type.schema,make=()=>EditorState.create({doc:b.doc}).tr.replaceWith(6,8,s.nodes.math_inline!.create(null,s.text('x')));
 class PretendReplace extends ReplaceStep {}
 const forged=make();forged.steps[0]=new PretendReplace(6,8,(forged.steps[0] as ReplaceStep).slice);expect(applySourceBlockTransaction(b,forged).ok).toBe(false);
 const json=make(),real=json.steps[0]!;json.steps[0]={apply:real.apply.bind(real),getMap:real.getMap.bind(real),toJSON:real.toJSON.bind(real)} as typeof real;expect(applySourceBlockTransaction(b,json).ok).toBe(false);
 const missing=make();missing.docs.length=0;expect(applySourceBlockTransaction(b,missing).ok).toBe(false);
 const wrong=make();wrong.docs[0]=open('other').doc;expect(applySourceBlockTransaction(b,wrong).ok).toBe(false);
 const split=open('A😀B $x$'),tr=EditorState.create({doc:split.doc}).tr.insertText('Z',3);expect(applySourceBlockTransaction(split,tr).ok).toBe(false);
 expect(applySourceBlockTransaction(b,make()).ok).toBe(true);
});
it('selection only leaves old raw math and revision unchanged',()=>{
 const raw='__Keep__ $$x$$\n\n$$\ny\n$$\n',b=open(raw),tr=EditorState.create({doc:b.doc}).tr.setSelection(TextSelection.create(b.doc,1)),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(r.ok){expect(r.mode).toBe('unchanged');expect(r.edits).toEqual([]);expect(r.session.source).toBe(raw);expect(r.session.revision).toBe(b.revision)}
});
it('two new blocks sharing the same Node object have distinct witnessed positions',()=>{
 const b=open('AB'),node=b.doc.type.schema.nodes.math_block!.create(),tr=EditorState.create({doc:b.doc}).tr.replaceWith(0,b.doc.content.size,[node,node]);
 expect(tr.doc.child(0)).toBe(tr.doc.child(1));const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok){expect(r.session.source).toBe('$$ $$\n\n$$ $$');expect(r.session.doc.eq(tr.doc)).toBe(true)}
});
it('cross-body new inline atoms commit together while all old spellings remain',()=>{
 const b=open('__Keep__ $x\n\n__Keep__ $x'),s=b.doc.type.schema,node=s.nodes.math_inline!.create(null,s.text('x')),at=pos(b.doc,[1],5);
 const tr=EditorState.create({doc:b.doc}).tr.replaceWith(at,at+2,node).replaceWith(6,8,node),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(r.ok){expect(r.session.source).toBe('__Keep__ $x$\n\n__Keep__ $x$');expect(r.session.doc.eq(tr.doc)).toBe(true)}
});
it('unsupported old root mixed with new block remains atomic',()=>{
 const b=open('AB\n\n<div>x</div>\n'),s=b.doc.type.schema,tr=EditorState.create({doc:b.doc}).tr.replaceWith(0,4,s.nodes.math_block!.create()).insertText('z',3);
 expect(tr.doc.child(1).textContent).not.toBe(b.doc.child(1).textContent);expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(b.source).toBe('AB\n\n<div>x</div>\n');
});

it('nonempty schema defaults never authorize an empty-source mathematical birth',()=>{
 const ordinary=createSchema({mediaResolver:new BrowserMediaResolver()}),schema=new Schema({...ordinary.spec,nodes:ordinary.spec.nodes.update('math_block',{...ordinary.nodes.math_block!.spec,attrs:{value:{default:'nonempty'}}})});
 const o=createSourceSession('',schema);if(!o.ok)throw Error(o.reason);const b=o.session,node=schema.nodes.math_block!.create();expect(node.hasMarkup(node.type)).toBe(true);expect(node.attrs.value).toBe('nonempty');
 const tr=EditorState.create({doc:b.doc}).tr.replaceWith(0,b.doc.content.size,node);let renders=0;
 expect(()=>applyStructuralTransaction(b,tr,()=>{renders++;throw Error('renderer reached')},()=>true)).toThrow();expect(renders).toBe(0);expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
});

it('canonical math and image mixed birth preserves raw neighbour',()=>{
 const b=open('__Keep__ $x'),s=b.doc.type.schema,tr=EditorState.create({doc:b.doc}).tr.replaceWith(6,8,[s.nodes.math_inline!.create(null,s.text('x')),s.nodes.image!.create({src:'/x'})]);
 expect(open('__Keep__ $x$![](/x)').doc.eq(tr.doc)).toBe(true);const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok){expect(r.session.source).toBe('__Keep__ $x$![](/x)');expect(r.session.doc.eq(tr.doc)).toBe(true)}
});
