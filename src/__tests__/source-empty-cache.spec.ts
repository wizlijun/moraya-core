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
  const transactions=[state.tr.step(new Fake(p,p,new Slice(Fragment.from(b.doc.type.schema.text('X')),0,0))),widened];
  for(const tr of transactions)expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
  const markedResult=applySourceBlockTransaction(b,state.tr.replaceWith(p,p,marked));expect(markedResult.ok).toBe(true)
  if(markedResult.ok)expect(markedResult.session.source).toBe('| H | J |\n| --- | --- |\n| A |**X** |\n')
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

it.each(['later-empty','emptied-earlier','created-earlier'] as const)('audits every actual step before empty-body fallback: %s',kind=>{
 const raw='| H | J |\n| --- | --- |\n| A |   |\n',b=open(raw),snapshot=JSON.stringify(b);
 const state=EditorState.create({doc:b.doc});
 const tr=kind==='later-empty'?state.tr.insertText('B',16,17).insertText('X',21):
  kind==='emptied-earlier'?state.tr.delete(16,17).insertText('X',16):
  state.tr.insert(b.doc.content.size,b.doc.type.schema.nodes.paragraph!.create()).insertText('X',b.doc.content.size+1);
 expect(tr.steps).toHaveLength(2);
 expect(tr.docs[0]!.resolve((tr.steps[0] as ReplaceStep).from).parent.content.size).toBeGreaterThan(0);
 expect(tr.docs[1]!.resolve((tr.steps[1] as ReplaceStep).from).parent.content.size).toBe(0);
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{
  const steps=[...tr.steps],docs=[...tr.docs],result=applySourceBlockTransaction(b,tr);
  if(kind==='emptied-earlier'){
   expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason);
   expect(result.session.source).toBe('| H | J |\n| --- | --- |\n| X |   |\n');
   expect(result.edits).toEqual([{from:26,to:27,text:'X'}]);
   expect(result.session.doc.eq(tr.doc)).toBe(true);expect(tr.steps).toEqual(steps);expect(tr.docs).toEqual(docs);
  }else expect(result).toEqual({ok:false,reason:'unsupported-step'});
  expect(spy).not.toHaveBeenCalled();expect(JSON.stringify(b)).toBe(snapshot);
 }finally{spy.mockRestore()}
});

it('pure structural block-slice chains retain the existing empty paragraph behavior',()=>{
 const b=open(''),tr=EditorState.create({doc:b.doc}).tr.split(1).split(3);
 expect(tr.steps).toHaveLength(2);
 for(const step of tr.steps){
  expect(Object.getPrototypeOf(step)).toBe(ReplaceStep.prototype);
  expect((step as ReplaceStep).slice.content.firstChild!.isBlock).toBe(true);
 }
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe('\n\n');expect(r.session.doc.eq(tr.doc)).toBe(true);expect(b.source).toBe('');
});

it.each([
 ['> A\r\n>\r\n',[2,1],'> A\r\n>\r\n>X\r\n'],
 ['- # H\r\n',[2,0,0],'- X\r\n  # H\r\n'],
 ['[^e]:\r\n',[2,0],'[^e]:X\r\n'],
 ['> A\n>\n> [ref]: /u\n>\n>\n',[2,1],'> A\n>\n> [ref]: /u\n>\n>X\n'],
 ['> A\n>\n>\n> [ref]: /u\n',[2,1],'> A\n>\n>X\n>\n> [ref]: /u\n'],
 ['> [ref]: /u\n>\n>\n',[2,0],'> [ref]: /u\n>\n>X\n'],
] as const)('replays empty facts after prefix byte and line changes %j',(tail,path,expected)=>{
 const b=open('A\r\n\r\n'+tail),r=prepareFileSourceEdits(b,{expectedRevision:b.revision,edits:[{from:0,to:1,removed:'A',text:'Longer\r\n\r\nNew'}]});
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 const s=r.session,tr=EditorState.create({doc:s.doc}).tr.insertText('X',at(s.doc,path)),typed=applySourceBlockTransaction(s,tr);
 expect(typed.ok,typed.ok?undefined:typed.reason).toBe(true);if(!typed.ok)throw Error(typed.reason);
 expect(typed.session.source).toBe('Longer\r\n\r\nNew\r\n\r\n'+expected);expect(typed.session.doc.eq(tr.doc)).toBe(true);
});
it('pending nested facts replay once and never transfer across equal parses',()=>{
 const raw='> A\n>\n>',a=captureFilePipeline(raw);expect(a.ok).toBe(true);if(!a.ok)throw Error(a.reason);
 const first=replayFilePipeline(a.cache),second=replayFilePipeline(a.cache);expect(first.ok&&second.ok).toBe(true);if(!first.ok||!second.ok)throw Error('replay');
 expect(first.value.doc.firstChild!.childCount).toBe(3);expect(second.value.doc.eq(first.value.doc)).toBe(true);
 const fa=capturedEmptyBodies(raw,first.value.doc,first.value.roots,first.value.layout)!;
 const fb=capturedEmptyBodies(raw,second.value.doc,second.value.roots,second.value.layout)!;
 expect(fa).toHaveLength(2);expect(fb).toHaveLength(2);expect(fa[0]!.parent).not.toBe(fb[0]!.parent);
 expect(capturedEmptyBodies(raw,second.value.doc,first.value.roots,first.value.layout)).toBeUndefined();
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr.insertText('X',at(b.doc,[0,2]));
 expect(prepareEmptyBodyTransaction(b,tr,fa).kind).toBe('unsupported');
 const copied={...b,layout:JSON.parse(JSON.stringify(b.layout)) as typeof b.layout};
 expect(capturedEmptyBodies(raw,copied.doc,copied.roots,copied.layout)).toBeUndefined();
 const recaptured=applySourceBlockTransaction(copied,tr);expect(recaptured.ok).toBe(true);
 const marked=EditorState.create({doc:b.doc}).tr.insertText('X',at(b.doc,[0,2])).addMark(at(b.doc,[0,2]),at(b.doc,[0,2])+1,b.doc.type.schema.marks.strong!.create());
 const markedResult=applySourceBlockTransaction(b,marked);expect(markedResult.ok).toBe(true);if(markedResult.ok){expect(markedResult.session.source).toBe('> A\n>\n>\n>**X**');expect(markedResult.session.doc.eq(marked.doc)).toBe(true)}
 const valid=applySourceBlockTransaction(b,tr);expect(valid.ok).toBe(true);if(valid.ok)expect(valid.session.source).toBe('> A\n>\n>\n>X');
});
it('nested selected blank preserves protected scopes and exact translated raw ranges',()=>{
 const raw='> A\n>\n>\n> [ref]: /u\n>\n> B\n\n[top]: /v\n',b=open(raw);
 const facts=capturedEmptyBodies(raw,b.doc,b.roots,b.layout)!,f=facts.find(x=>x.place.kind==='nested-blank')!;
 expect(f).toBeDefined();const tr=EditorState.create({doc:b.doc}).tr.insertText('X',f.pmAt),r=applySourceBlockTransaction(b,tr);
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.doc.eq(tr.doc)).toBe(true);
 for(const [i,p] of b.protectedSources.entries()){
  const shift=r.edits.filter(e=>e.to<=p.sourceFrom).reduce((n,e)=>n+e.text.length-(e.to-e.from),0),next=r.session.protectedSources[i]!;
  expect(next).toEqual({...p,sourceFrom:p.sourceFrom+shift,sourceTo:p.sourceTo+shift});
  expect(r.session.source.slice(next.sourceFrom,next.sourceTo)).toBe(raw.slice(p.sourceFrom,p.sourceTo));
 }
 expect(b.protectedSources.map(p=>p.scope)).toEqual(['nested','top-level']);
});
it('legacy sync and async never adopt source-only nested blank semantics',async()=>{
 for(const raw of ['> A\n>\n>','[^e]:\n']){
  const sync=markdown.parseMarkdown(raw),asyncDoc=await markdown.parseMarkdownAsync(raw);
  expect(sync.eq(asyncDoc)).toBe(true);
  if(raw.startsWith('>')){expect(sync.firstChild!.childCount).toBe(1);expect(open(raw).doc.firstChild!.childCount).toBe(3)}
  else {expect(sync.firstChild!.type.name).toBe('footnote_definition');expect(sync.firstChild!.childCount).toBe(1)}
 }
});

it('only a complete raw TAB indent boundary can certify a nested blank',()=>{
 const partial=open('- A\n \t\n'),complete=open('- A\n  - B\n \t\n');
 expect(capturedEmptyBodies(partial.source,partial.doc,partial.roots,partial.layout)!.some(f=>f.place.kind==='nested-blank')).toBe(false);
 expect(markdown.parseMarkdown(partial.source).firstChild!.firstChild!.childCount).toBe(1);
 const fact=capturedEmptyBodies(complete.source,complete.doc,complete.roots,complete.layout)!.find(f=>f.place.kind==='nested-blank');
 expect(fact).toBeDefined();expect(fact!.place.kind).toBe('nested-blank');
 const tr=EditorState.create({doc:complete.doc}).tr.insertText('X',fact!.pmAt),r=applySourceBlockTransaction(complete,tr);
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.source).toBe('- A\n  - B\n \t\n \tX\n');
 expect(markdown.parseMarkdown(complete.source).firstChild!.firstChild!.lastChild!.firstChild!.childCount).toBe(1);
});


it.each([
 ['> A\n>\n> [ref]: /u\n>\n>\n',5,'> A\n>\n> [ref]: /u\n>\n>X\n',21,'X'],
 ['> A\n>\n>\n> [ref]: /u\n',5,'> A\n>\n>X\n>\n> [ref]: /u\n',7,'X\n>'],
 ['> [ref]: /u\n>\n>\n',2,'> [ref]: /u\n>\n>X\n',15,'X'],
] as const)('definition-adjacent empty body preserves exact protected bytes %j',(raw,pos,expected,rawAt,text)=>{
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr.insertText('X',pos),r=applySourceBlockTransaction(b,tr);
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.source).toBe(expected);
 expect(r.edits).toEqual([{from:rawAt,to:rawAt,text}]);expect(b.protectedSources).toHaveLength(1);
 expect(r.session.protectedSources).toEqual(b.protectedSources.map(p=>{
  const shift=rawAt<=p.sourceFrom?text.length:0;
  expect(expected.slice(p.sourceFrom+shift,p.sourceTo+shift)).toBe(raw.slice(p.sourceFrom,p.sourceTo));
  return {...p,sourceFrom:p.sourceFrom+shift,sourceTo:p.sourceTo+shift};
 }));
});


it.each([
 ['>\n> [r]: /u\n',2,'>Z\n>\n> [r]: /u\n',1,'Z\n>'],
 ['>\r\n> [r]: /u\r\n',2,'>Z\r\n>\r\n> [r]: /u\r\n',1,'Z\r\n>'],
 ['\uFEFF>\r\n> [r]: /u\r\n',2,'\uFEFF>Z\r\n>\r\n> [r]: /u\r\n',2,'Z\r\n>'],
 ['-\n  [r]: /u\n',3,'- Z\n  \n  [r]: /u\n',1,' Z\n  '],
 ['-\n\n[r]: /u\n',3,'- Z\n\n[r]: /u\n',1,' Z'],
 ['> -\n\n[r]: /u\n',4,'> - Z\n\n[r]: /u\n',3,' Z'],
 ['> -\n>   [r]: /u\n',4,'> - Z\n>   \n>   [r]: /u\n',3,' Z\n>   '],
 ['\uFEFF> -\r\n>   [r]: /u\r\n',4,'\uFEFF> - Z\r\n>   \r\n>   [r]: /u\r\n',4,' Z\r\n>   '],
 ['- \n  [r]: /u\n',3,'- Z\n  \n  [r]: /u\n',2,'Z\n  '],
 ['> - \n>   [r]: /u\n',4,'> - Z\n>   \n>   [r]: /u\n',4,'Z\n>   '],
 ['\uFEFF> - \r\n>   [r]: /u\r\n',4,'\uFEFF> - Z\r\n>   \r\n>   [r]: /u\r\n',5,'Z\r\n>   '],
 ['>\n> [r]: /u\n> [r]: /v\n',2,'>Z\n>\n> [r]: /u\n> [r]: /v\n',1,'Z\n>'],
 ['>\n> [r]: /u\n>\n',2,'>Z\n>\n> [r]: /u\n>\n',1,'Z\n>'],
 ['>\n> [r]: /u\n\nTail __raw__\n',2,'>Z\n>\n> [r]: /u\n\nTail __raw__\n',1,'Z\n>'],
] as const)('definition-only baseline first input retains actual separator %j',(raw,pos,expected,rawAt,text)=>{
 const b=open(raw),snapshot=JSON.stringify(b),tr=EditorState.create({doc:b.doc}).tr.insertText('Z',pos);
 expect(b.doc.resolve(pos).parent.content.size).toBe(0);
 expect(open(expected).doc.eq(tr.doc)).toBe(true);
 const facts=capturedEmptyBodies(raw,b.doc,b.roots,b.layout)!;expect(facts).toHaveLength(1);
 const result=applySourceBlockTransaction(b,tr);expect(result.ok,result.ok?undefined:result.reason).toBe(true);if(!result.ok)throw Error(result.reason);
 expect(result.session.source).toBe(expected);expect(result.session.doc.eq(tr.doc)).toBe(true);
 expect(result.edits).toEqual([{from:rawAt,to:rawAt,text}]);
 expect(result.session.protectedSources).toEqual(b.protectedSources.map(p=>({...p,sourceFrom:p.sourceFrom+text.length,sourceTo:p.sourceTo+text.length})));
 expect(JSON.stringify(b)).toBe(snapshot);
 const next=EditorState.create({doc:result.session.doc}).tr.insertText('Q',pos+1),again=applySourceBlockTransaction(result.session,next);
 expect(again.ok,again.ok?undefined:again.reason).toBe(true);if(!again.ok)throw Error(again.reason);
 expect(again.session.source).toBe(expected.replace('Z','ZQ'));expect(again.session.doc.eq(next.doc)).toBe(true);
 expect(again.session.protectedSources).toEqual(result.session.protectedSources.map(p=>({...p,sourceFrom:p.sourceFrom+1,sourceTo:p.sourceTo+1})));
});


it.each([
 ['>\n>\n> [r]: /u\n',2,'>Z\n>\n>\n> [r]: /u\n',2],
 ['>\n>\n> [r]: /u\n',4,'>\n>Z\n>\n> [r]: /u\n',2],
 ['>\n>\n> A\n>\n> [r]: /u\n',2,'>Z\n>\n>\n> A\n>\n> [r]: /u\n',2],
] as const)('baseline and additional actual blanks emit exactly once %j',(raw,pos,expected,count)=>{
 const b=open(raw),facts=capturedEmptyBodies(raw,b.doc,b.roots,b.layout)!;
 expect(facts).toHaveLength(count);expect(new Set(facts.map(f=>f.pmAt)).size).toBe(count);
 const tr=EditorState.create({doc:b.doc}).tr.insertText('Z',pos);expect(open(expected).doc.eq(tr.doc)).toBe(true);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
 expect(r.session.protectedSources).toEqual(b.protectedSources.map(p=>({...p,sourceFrom:p.sourceFrom+3,sourceTo:p.sourceTo+3})));
});
it.each(['>\r\n> [r]: /u\r\n','- \n  [r]: /u\n','> - \n>   [r]: /u\n','-\n  [r]: /u\n','> -\n>   [r]: /u\n'])('definition-only facts survive three replay generations %j',raw=>{
 const first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);let cached=first;
 const original=capturedEmptyBodies(raw,first.value.doc,first.value.roots,first.value.layout)!;
 const expected=raw.startsWith('> -')?'> - Z\n>   \n>   [r]: /u\n':raw.startsWith('-')?'- Z\n  \n  [r]: /u\n':'>Z\r\n>\r\n> [r]: /u\r\n';
 for(let generation=0;generation<3;generation++){
  const next=replayFilePipeline(cached.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);
  const v=next.value,b={revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources};
  const facts=capturedEmptyBodies(raw,b.doc,b.roots,b.layout)!;expect(facts.map(f=>f.place)).toEqual(original.map(f=>f.place));
  const tr=EditorState.create({doc:b.doc}).tr.insertText('Z',facts[0]!.pmAt);
  expect(prepareEmptyBodyTransaction(b,tr,original).kind).toBe('unsupported');
  expect(prepareEmptyBodyTransaction(b,tr,facts.map(f=>({...f}))).kind).toBe('unsupported');
  expect(open(expected).doc.eq(tr.doc)).toBe(true);
  const r=applySourceBlockTransaction(b,tr);expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
  for(const fresh of [r.session,open(expected)]){
   const second=EditorState.create({doc:fresh.doc}).tr.insertText('Q',facts[0]!.pmAt+1),typed=applySourceBlockTransaction(fresh,second);
   expect(typed.ok,typed.ok?undefined:typed.reason).toBe(true);if(!typed.ok)throw Error(typed.reason);
   expect(typed.session.source).toBe(expected.replace('Z','ZQ'));expect(typed.session.doc.eq(second.doc)).toBe(true);
  }
  cached=next;
 }
});
it('definition-only baseline facts shift through three file-cache generations',()=>{
 let b=open('A\n\n>\n> [r]: /u\n');
 for(const prefix of ['Longer','New\n\nLonger','Newest\n\nLonger']){
  const end=b.source.indexOf('\n\n>'),changed=prepareFileSourceEdits(b,{expectedRevision:b.revision,edits:[{from:0,to:end,removed:b.source.slice(0,end),text:prefix}]});
  expect(changed.ok).toBe(true);if(!changed.ok)throw Error(changed.reason);b=changed.session;
  const facts=capturedEmptyBodies(b.source,b.doc,b.roots,b.layout)!,f=facts[0]!;
  expect(facts).toHaveLength(1);const tr=EditorState.create({doc:b.doc}).tr.insertText('Z',f.pmAt),expected=prefix+'\n\n>Z\n>\n> [r]: /u\n';
  expect(open(expected).doc.eq(tr.doc)).toBe(true);
  const r=applySourceBlockTransaction(b,tr);expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
  expect(r.session.protectedSources).toEqual(b.protectedSources.map(p=>({...p,sourceFrom:p.sourceFrom+3,sourceTo:p.sourceTo+3})));
 }
});
it('baseline definition fact cannot authorize forged steps or crossing its prefix',()=>{
 const raw='>\n> [r]: /u\n',b=open(raw),snapshot=JSON.stringify(b),state=EditorState.create({doc:b.doc});class Fake extends ReplaceStep {}
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{
  const fake=state.tr.step(new Fake(2,2,new Slice(Fragment.from(b.doc.type.schema.text('Z')),0,0)));
  const widened=state.tr.insertText('Z',2);Object.assign(widened.steps[0]!,{from:1,to:2});
  for(const tr of [fake,widened]){expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(JSON.stringify(b)).toBe(snapshot)}
  expect(spy).not.toHaveBeenCalled();
 }finally{spy.mockRestore()}
});
