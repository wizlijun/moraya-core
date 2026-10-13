import {it,expect} from 'vitest';
import {toggleMark} from 'prosemirror-commands';
import {EditorState} from 'prosemirror-state';
import {applySourceBlockTransaction} from '../source-fidelity';
import {open,pos,command} from './source-inline-test-utils';
it('partial strong preserves nested shell and unrelated syntax',()=>{
 command('>  Alpha Beta _Keep_。\n',[0,0],6,[0,0],10,
  s=>toggleMark(s.schema.marks.strong!),'>  Alpha **Beta** _Keep_。\n');
});
it('only Beta removal preserves the unselected strong space',()=>{
 const {r,tr}=command('> __Alpha Beta__。\n',[0,0],6,[0,0],10,
  s=>toggleMark(s.schema.marks.strong!),'> __Alpha&#32;__&#66;eta。\n');
 expect(r.session.doc.eq(tr.doc)).toBe(true);
 expect(r.session.source).not.toBe('> __Alpha__ Beta。\n');
});
it('one real toggle reaches both paragraphs atomically',()=>{
 command('Alpha。\n\nBeta。\n',[0],0,[1],4,
  s=>toggleMark(s.schema.marks.strong!),'**Alpha。**\n\n**Beta**。\n');
});
it('crosses two nested bodies while retaining definition and prefixes',()=>{
 command('> [r]: /u\n>\n> Alpha。\n>\n>  Beta。\n',[0,0],0,[0,1],4,
  s=>toggleMark(s.schema.marks.strong!),
  '> [r]: /u\n>\n> **Alpha。**\n>\n>  **Beta**。\n');
});
it('two actual cells preserve their separators and spacing',()=>{
 command('| H | J |\n| :--- | ---: |\n|  Alpha | Beta  |\n',[0,1,0,0],0,[0,1,1,0],4,
  s=>toggleMark(s.schema.marks.strong!),
  '| H | J |\n| :--- | ---: |\n|  **Alpha** | **Beta**  |\n');
});
it('actual addMark replacing two hrefs produces a supported multi-Step chain',()=>{
 const {tr}=command('[A](/one)[B](/two) Keep。\n',[0],0,[0],2,
  s=>(state,dispatch)=>{dispatch?.(state.tr.addMark(1,3,s.schema.marks.link!.create({href:'/new'})));return true},
  '[AB](/new) Keep。\n');
 expect(tr.steps.length).toBeGreaterThan(1);
});
it('edits a real successful code token body without reselecting delimiters',()=>{
 const raw='> ``甲`乙``。\n',b=open(raw),p=pos(b.doc,[0,0],0);
 const tr=EditorState.create({doc:b.doc}).tr.insertText('丙',p,p+1);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe('> ``丙`乙``。\n');expect(r.edits).toHaveLength(1);
 expect(r.edits[0]!.to-r.edits[0]!.from).toBe(1);expect(r.session.doc.eq(tr.doc)).toBe(true);
});

it('closed fence grows only its two markers and the actual inserted body',()=>{
 const raw='```js\nA\n```\n\nTail __raw__';
 const expected='````js\nA\n```\n\n\n````\n\nTail __raw__';
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr.insertText('\n```\n\n',2);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
 expect(r.session.doc.firstChild!.textContent).toBe('A\n```\n\n');
 expect(r.edits).toHaveLength(3);
 expect(r.edits).toEqual([
  {from:0,to:3,text:'````'},
  {from:7,to:7,text:'\n```\n\n'},
  {from:8,to:11,text:'````'},
 ]);
 expect(b.source).toBe(raw);
});
it('fence growth retains info, close whitespace, BOM and original CRLF',()=>{
 const raw='\uFEFF```  js \r\nA\r\n``` \t\r\n\r\nTail __raw__';
 const expected='\uFEFF````  js \r\nA\r\n```\r\n\r\n\r\n```` \t\r\n\r\nTail __raw__';
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr.insertText('\n```\n\n',2);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(Buffer.from(r.session.source)).toEqual(Buffer.from(expected));
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.edits).toHaveLength(3);
});
it.each([
 ['```js\nA\n```','```','```js\nA```\n```',1],
 ['~~~js\nA\n~~~~~','\n~~~\n\n','~~~~js\nA\n~~~\n\n\n~~~~~',2],
] as const)('only necessary fence markers change: %j',(raw,text,expected,count)=>{
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr.insertText(text,2);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.edits).toHaveLength(count);
 expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('unclosed and stripped-prefix fence growth receives no delimiter authority',()=>{
 for(const raw of ['```js\nA','> ```js\n> A\n> ```\n']){
  const b=open(raw),p=raw.startsWith('>')?pos(b.doc,[0,0],1):pos(b.doc,[0],1);
  const tr=EditorState.create({doc:b.doc}).tr.insertText('\n```\n\n',p);
  const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(false);
  expect(r).not.toHaveProperty('session');expect(b.source).toBe(raw);
 }
});

it.each([['em','*X*'],['strong','**X**'],['strike_through','~~X~~'],['highlight','^^X^^'],['code','`X`']] as const)('stored %s materializes only on first text', (name,expected)=>{
 const base=open('');let state=EditorState.create({doc:base.doc});
 toggleMark(state.schema.marks[name]!)(state,tr=>{const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);if(r.ok){expect(r.session.source).toBe('');expect(r.session.revision).toBe(base.revision)}state=state.apply(tr)});
 const tr=state.tr.insertText('X'),r=applySourceBlockTransaction(base,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('empty real replace plus link marks chain',()=>{
 const base=open(''),state=EditorState.create({doc:base.doc});
 const tr=state.tr.insertText('X',1).addMark(1,2,state.schema.marks.link!.create({href:'/u'}));
 expect(tr.steps).toHaveLength(2);const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);
 if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('[X](/u)');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('code marker collision grows only the selected occurrence',()=>{
 const b=open('> `Alpha` _Keep_\n'),p=pos(b.doc,[0,0],2),tr=EditorState.create({doc:b.doc}).tr.insertText('`',p);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe('> ``Al`pha`` _Keep_\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('partial second repeated body keeps BOM CRLF and distant definitions',()=>{
 command('\uFEFF> Alpha。\r\n>\r\n>  Alpha。\r\n\r\n[unused]: /u\r\n',[0,1],1,[0,1],4,s=>toggleMark(s.schema.marks.strong!),'\uFEFF> Alpha。\r\n>\r\n>  A**lph**a。\r\n\r\n[unused]: /u\r\n');
});
it('crosses two actual nested list items',()=>{
 command('*   Alpha。\n*   Beta。\n',[0,0,0],0,[0,1,0],4,s=>toggleMark(s.schema.marks.strong!),'*   **Alpha。**\n*   **Beta**。\n');
});
it('partial marks retain entity and escaped raw outside the selection',()=>{
 command('A&amp;B \\*Keep\\*\n',[0],0,[0],3,s=>toggleMark(s.schema.marks.strong!),'**A&amp;B** \\*Keep\\*\n');
});
it('mixed supported and math content mark fails atomically',()=>{
 const b=open('Alpha\n\n$x$\n'),tr=EditorState.create({doc:b.doc}).tr.addMark(1,3,b.doc.type.schema.marks.strong!.create());
 let atom=-1;tr.doc.descendants((n,p)=>{if(n.type.name==='math_inline')atom=p});expect(atom).toBeGreaterThan(0);
 tr.addMark(atom,atom+1,b.doc.type.schema.marks.strong!.create());
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(false);expect(r).not.toHaveProperty('session');expect(b.source).toBe('Alpha\n\n$x$\n');
});
import {TextSelection} from 'prosemirror-state';
import {splitBlock} from 'prosemirror-commands';
import {capturedEmptyBodies} from '../markdown';
import {prepareEmptyParagraphEdits} from '../source-structure';
import {prepareEmptyInlineContent} from '../source-inline-recipe';
import {ReplaceStep,AddMarkStep} from 'prosemirror-transform';
import {vi} from 'vitest';
import * as markdown from '../markdown';
it.each([
 ['>\n',[0,0],'em','>*X*\n'],
 ['| H | J |\n| --- | --- |\n| A |   |\n',[0,1,1,0],'strong','| H | J |\n| --- | --- |\n| A |**X**   |\n'],
 ['- # H\n',[0,0,0],'strong','- **X**\n  # H\n'],
] as const)('marked empty placement %j',(raw,path,mark,expected)=>{
 const b=open(raw),at=pos(b.doc,path);let state=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,at)});
 toggleMark(state.schema.marks[mark]!)(state,tr=>{state=state.apply(tr)});
 const tr=state.tr.insertText('X'),r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it.each([
 ['', [0], '[X](/u)'],
 ['A\n\n\nB',[1],'A\n\n[X](/u)\n\nB'],
 ['| H | J |\n| --- | --- |\n| A |\n',[0,1,1,0],'| H | J |\n| --- | --- |\n| A |[X](/u)|\n'],
] as const)('link empty placement and real ledger %j',(raw,path,expected)=>{
 const b=open(raw),at=pos(b.doc,path),tr=EditorState.create({doc:b.doc}).tr.insertText('X',at).addMark(at,at+1,b.doc.type.schema.marks.link!.create({href:'/u'}));
 const fact=capturedEmptyBodies(b.source,b.doc,b.roots,b.layout)!.find(f=>f.pmAt===at)!,content=prepareEmptyInlineContent(b,tr,fact);expect(content.kind).toBe('ready');
 if(fact.place.kind==='layout'&&content.kind==='ready')expect(prepareEmptyParagraphEdits(b,tr,fact.place.origin,content.body).length).toBeGreaterThan(0);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('Enter session keeps certified separator when typing stored strong',()=>{
 let b=open('> A'),state=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,pos(b.doc,[0,0],1))});
 let split:import('prosemirror-state').Transaction|undefined;expect(splitBlock(state,tr=>{split=tr})).toBe(true);
 const first=applySourceBlockTransaction(b,split!);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);expect(first.session.source).toBe('> A\n>');b=first.session;
 state=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,pos(b.doc,[0,1]))});toggleMark(state.schema.marks.strong!)(state,tr=>{state=state.apply(tr)});
 const tr=state.tr.insertText('X'),r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('> A\n>\n>**X**');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('empty literal first ordinary text then real collision grows the next session',()=>{
 const b=open('```js\n```\n'),first=applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.insertText('A',1));expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);
 const tr=EditorState.create({doc:first.session.doc}).tr.insertText('\n```\n\n',2),r=applySourceBlockTransaction(first.session,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('````js\nA\n```\n\n\n````\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('direct empty ledger rejects nonempty first, later replaces, wider marks and forged chains',()=>{
 const b=open('A\n\n\nB'),at=pos(b.doc,[1]),origin=capturedEmptyBodies(b.source,b.doc,b.roots,b.layout)!.find(f=>f.pmAt===at)!.place;
 if(origin.kind!=='layout')throw Error('missing layout');const state=EditorState.create({doc:b.doc}),mark=b.doc.type.schema.marks.link!.create({href:'/u'});
 const forged=state.tr.insertText('X',at).addMark(at,at+1,mark);forged.docs[1]=b.doc;
 class Fake extends AddMarkStep{}
 const fake=state.tr.insertText('X',at).step(new Fake(at,at+1,mark));
 for(const tr of [state.tr.insert(at,b.doc.type.schema.nodes.hardbreak!.create({isInline:true})),state.tr.insertText('Y',1).insertText('X',at+1),state.tr.insertText('X',at).insertText('Y',at+1),state.tr.insertText('X',at).addMark(1,at+1,mark),forged,fake]){
  expect(()=>prepareEmptyParagraphEdits(b,tr,origin.origin,'[X](/u)')).toThrow();expect(applySourceBlockTransaction(b,tr).ok).toBe(false);
 }
 const valid=state.tr.insertText('X',at).addMark(at,at+1,mark);
 expect(()=>prepareEmptyParagraphEdits(b,valid,{kind:'fallback'},'[X](/u)')).toThrow();expect(b.source).toBe('A\n\n\nB');
});
it('source entry rejects disguised prototypes and protects failed retries',()=>{
 class Fake extends ReplaceStep{}
 const b=open('Alpha\n'),state=EditorState.create({doc:b.doc}),s=state.tr.insertText('X',2).steps[0] as ReplaceStep;
 const tr=state.tr.step(new Fake(s.from,s.to,s.slice));const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(spy).not.toHaveBeenCalled();const valid=applySourceBlockTransaction(b,state.tr.insertText('X',2));expect(valid.ok).toBe(true)}finally{spy.mockRestore()}
});
it('delimiter whitespace only encodes the required adjacent scalar',()=>{
 command('> __Alpha Beta__。\n',[0,0],6,[0,0],10,s=>toggleMark(s.schema.marks.strong!),'> __Alpha&#32;__&#66;eta。\n');
 command('> __Alpha Beta__。\n',[0,0],0,[0,0],5,s=>toggleMark(s.schema.marks.strong!),'> Alph&#97;__&#32;Beta__。\n');
 command('> __Alpha Beta__。\n',[0,0],5,[0,0],10,s=>toggleMark(s.schema.marks.strong!),'> __Alpha__ Beta。\n');
});
it('whole multi-code-unit entity is retained outside a partial command',()=>{
 command('A &NotEqualTilde; Beta\n',[0],5,[0],9,s=>toggleMark(s.schema.marks.strong!),'A &NotEqualTilde; **Beta**\n');
});
it('inline code normalized padding and newline remain raw around exact text',()=>{
 const b=open('> `` A\nB ``。\n'),p=pos(b.doc,[0,0],0),tr=EditorState.create({doc:b.doc}).tr.insertText('C',p,p+1),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('> `` C\nB ``。\n');expect(r.edits).toHaveLength(1);expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it('top-level stripped body indent grants no fence growth',()=>{
 const b=open('  ```js\n  A\n  ```\n'),tr=EditorState.create({doc:b.doc}).tr.insertText('\n```\n\n',2),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(false);expect(r).not.toHaveProperty('session');expect(b.source).toBe('  ```js\n  A\n  ```\n');
});
it('mixed Replace and Mark keeps the unchanged code envelope',()=>{
 const b=open('``Alpha`` Keep\n'),tr=EditorState.create({doc:b.doc}).tr.insertText('X',1,2).addMark(7,11,b.doc.type.schema.marks.strong!.create()),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('``Xlpha`` **Keep**\n');expect(r.edits).toEqual([{from:2,to:3,text:'X'},{from:10,to:10,text:'**'},{from:14,to:14,text:'**'}]);expect(r.session.doc.eq(tr.doc)).toBe(true);
});
it.each([['strong','**A\\|B**'],['code','`A\\|B`']] as const)('empty table %s escapes only newly generated pipe content',(name,body)=>{
 const raw='| H | J |\n| --- | --- |\n| A | |\n',b=open(raw),at=pos(b.doc,[0,1,1,0]);let state=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,at)});
 toggleMark(state.schema.marks[name]!)(state,tr=>{state=state.apply(tr)});const tr=state.tr.insertText('A|B'),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('| H | J |\n| --- | --- |\n| A |'+body+' |\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
