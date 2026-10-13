import {it,expect,vi} from 'vitest';
import {EditorState} from 'prosemirror-state';
import {Fragment,Slice} from 'prosemirror-model';
import {ReplaceStep} from 'prosemirror-transform';
import * as markdown from '../markdown';
import {capturedEmptyBodies,captureFilePipeline,replayFilePipeline} from '../markdown';
import {prepareEmptyBodyTransaction} from '../source-empty-body';
import {applySourceBlockTransaction,prepareFileSourceEdits} from '../source-fidelity';
import {at,open,typeEmpty} from './source-empty-test-utils';

it.each([
 ['| H | J |\r\n| --- | --- |\r\n| A | |\r\n',[1,1,1,0],'| H | J |\r\n| --- | --- |\r\n| A |X |\r\n'],
 ['```js\r\n```\r\n',[1],'```js\r\nX\r\n```\r\n'],
] as const)('shifts later empty facts after prefix raw edit %j',(tail,path,expected)=>{
 const b=open('A\r\n\r\n'+tail),changed=prepareFileSourceEdits(b,{expectedRevision:b.revision,edits:[{from:0,to:1,removed:'A',text:'Longer'}]});
 expect(changed.ok).toBe(true);if(!changed.ok)throw Error(changed.reason);
 const base=changed.session,p=at(base.doc,path),tr=EditorState.create({doc:base.doc}).tr.insertText('X',p);
 const result=applySourceBlockTransaction(base,tr);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason);
 expect(result.session.source).toBe('Longer\r\n\r\n'+expected);expect(result.session.doc.eq(tr.doc)).toBe(true);
});
it('duplicate empty list occurrences and replay facts stay separate',()=>{
 const raw='- \n- \n',initial=captureFilePipeline(raw);expect(initial.ok).toBe(true);if(!initial.ok)throw Error(initial.reason);
 const replay=replayFilePipeline(initial.cache);expect(replay.ok).toBe(true);if(!replay.ok)throw Error(replay.reason);
 const a=capturedEmptyBodies(raw,initial.value.doc,initial.value.roots,initial.value.layout)!;
 const b=capturedEmptyBodies(raw,replay.value.doc,replay.value.roots,replay.value.layout)!;
 expect(a).toHaveLength(2);expect(b.map(f=>f.pmAt)).toEqual(a.map(f=>f.pmAt));expect(b[0]!.parent).not.toBe(a[0]!.parent);
 expect(capturedEmptyBodies(raw,replay.value.doc,initial.value.roots,initial.value.layout)).toBeUndefined();
 const {r,tr}=typeEmpty(raw,[0,1,0],'X','- \n- X\n');
 expect(applySourceBlockTransaction(r.session,tr)).toEqual({ok:false,reason:'stale-document'});
});
it('foreign layout JSON cannot mint authority and rejection does not poison retry',()=>{
 const b=open('A\n\n\nB'),p=at(b.doc,[1]),tr=EditorState.create({doc:b.doc}).tr.insertText('X',p);
 const layout=JSON.parse(JSON.stringify(b.layout)) as typeof b.layout;
 const forged={...b,layout:{...layout,blankLines:layout.blankLines.map(u=>({...u,sourceFrom:u.sourceFrom+1}))}};
 expect(capturedEmptyBodies(forged.source,forged.doc,forged.roots,forged.layout)).toBeUndefined();
 expect(applySourceBlockTransaction(forged,tr).ok).toBe(false);
 const valid=applySourceBlockTransaction({...b},tr);expect(valid.ok).toBe(true);if(valid.ok)expect(valid.session.source).toBe('A\n\nX\n\nB');
});
it('empty body in quote leaves nested definition bytes and translated protected set intact',()=>{
 const raw='> #\n>\n> [ref]: /u\n>\n> Tail\n',b=open(raw),p=at(b.doc,[0,0]);
 const tr=EditorState.create({doc:b.doc}).tr.insertText('X',p),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe('> # X\n>\n> [ref]: /u\n>\n> Tail\n');
 expect(r.session.protectedSources).toEqual(b.protectedSources.map(f=>({...f,sourceFrom:f.sourceFrom+2,sourceTo:f.sourceTo+2})));
});
it('rejects marks, fake Step prototypes, wider ranges and missing authority without root rendering',()=>{
 const b=open('| H | J |\n| --- | --- |\n| A | |\n'),p=at(b.doc,[0,1,1,0]),state=EditorState.create({doc:b.doc});
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 class Fake extends ReplaceStep {}
 try{
  const marked=b.doc.type.schema.text('X',[b.doc.type.schema.marks.strong!.create()]);
  const widened=state.tr.insertText('X',p);Object.assign(widened.steps[0]!,{from:p-1,to:p+1});
  const transactions=[state.tr.step(new Fake(p,p,new Slice(Fragment.from(b.doc.type.schema.text('X')),0,0))),state.tr.replaceWith(p,p,marked),widened];
  for(const tr of transactions)expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
  const tr=state.tr.insertText('X',p),facts=capturedEmptyBodies(b.source,b.doc,b.roots,b.layout)!;
  expect(prepareEmptyBodyTransaction(b,tr,[]).kind).toBe('unsupported');
  expect(prepareEmptyBodyTransaction(b,tr,facts.map(f=>({...f,pmAt:f.pmAt+1}))).kind).toBe('unsupported');
  expect(spy).not.toHaveBeenCalled();
 }finally{spy.mockRestore()}
});
it('unclosed literal and ignored table columns grant no empty authority',()=>{
 const b=open('```js\n'),tr=EditorState.create({doc:b.doc}).tr.insertText('X',1),spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(spy).not.toHaveBeenCalled()}finally{spy.mockRestore()}
 const table=open('| H |\n| --- |\n| A | |\n');
 expect(capturedEmptyBodies(table.source,table.doc,table.roots,table.layout)).toEqual([]);
});

it('parent attribute mutation and inline leaves cannot borrow empty permission',()=>{
 const b=open('#'),p=at(b.doc,[0]),state=EditorState.create({doc:b.doc}),spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{
  const attrs=state.tr.insertText('X',p).setNodeMarkup(0,undefined,{level:2});
  const leaf=state.tr.insert(p,b.doc.type.schema.nodes.hardbreak!.create({isInline:true}));
  const newline=state.tr.insertText('A\nB',p);
  for(const tr of [attrs,leaf,newline])expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
  expect(spy).not.toHaveBeenCalled();
 }finally{spy.mockRestore()}
});
it('ordinary empty input never calls a natural root serializer',()=>{
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{typeEmpty('- # H\n',[0,0,0],'X','- X\n  # H\n');expect(spy).not.toHaveBeenCalled()}finally{spy.mockRestore()}
});

it('partial TAB expansion cannot supply an empty raw insertion point',()=>{
 const b=open('  ```js\n\t\n  ```\n');
 expect(b.doc.firstChild!.textContent).toBe('  ');
 expect(capturedEmptyBodies(b.source,b.doc,b.roots,b.layout)).toEqual([]);
 const tr=EditorState.create({doc:b.doc}).tr.insertText('X',1),spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(spy).not.toHaveBeenCalled()}finally{spy.mockRestore()}
});
