import {it,expect} from 'vitest';
import {EditorState,TextSelection,type Command} from 'prosemirror-state';
import {splitBlock,wrapIn,setBlockType} from 'prosemirror-commands';
import {splitListItem,wrapInList} from 'prosemirror-schema-list';
import {applySourceBlockTransaction} from '../source-fidelity';
import {open,at} from './source-empty-test-utils';
function chain(raw:string,path:readonly number[],offset:number,command:(s:EditorState)=>Command,
 intermediate:string,expected:string){
 let b=open(raw),p=at(b.doc,path)+offset;
 let s=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,p)}),seen=0;
 expect(command(s)(s,tr=>{
  seen++;const r=applySourceBlockTransaction(b,tr);expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.source).toBe(intermediate);
  b=r.session;s=s.apply(tr);
 })).toBe(true);expect(seen).toBe(1);
 expect(s.selection.$from.parent.content.size).toBe(0);
 const tr=s.tr.insertText('X'),r=applySourceBlockTransaction(b,tr);
 expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.source).toBe(expected);
}
it('Enter then type at top end',()=>chain('A',[0],1,()=>splitBlock,'A\n\n','A\n\nX\n'));
it('Enter then type inside quote',()=>chain('> A',[0,0],1,()=>splitBlock,'> A\n>','> A\n>\n>X'));
it('split list item then type',()=>chain('- A',[0,0,0],1,s=>splitListItem(s.schema.nodes.list_item!),'- A\n- ','- A\n- X'));
it('empty document wrap quote then type',()=>chain('',[0],0,s=>wrapIn(s.schema.nodes.blockquote!),'> ','> X'));
it('empty document wrap list then type',()=>chain('',[0],0,s=>wrapInList(s.schema.nodes.bullet_list!),'- ','- X'));
it('empty document set code then type',()=>chain('',[0],0,s=>setBlockType(s.schema.nodes.code_block!,{language:''}),'```\n\n```','```\nX\n```'));

import {baseKeymap,newlineInCode} from 'prosemirror-commands';
import {typeEmpty} from './source-empty-test-utils';
function sequence(raw:string,path:readonly number[],offset:number,steps:readonly ((s:EditorState)=>Command)[],expected:readonly string[]){
 let b=open(raw),s=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,at(b.doc,path)+offset)});
 steps.forEach((make,i)=>{
  expect(make(s)(s,tr=>{
   const r=applySourceBlockTransaction(b,tr);expect(r.ok,r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
   expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.source).toBe(expected[i]);b=r.session;s=s.apply(tr);
  })).toBe(true);
 });return b;
}
const text=(value:string):Command=>(state,dispatch)=>{expect(state.selection.$from.parent.content.size).toBe(0);dispatch?.(state.tr.insertText(value));return true};
it('two real quote Enter sessions retain all three visible paragraphs',()=>{
 const b=sequence('> A',[0,0],1,[()=>splitBlock,()=>text('X'),()=>splitBlock,()=>text('Y')],
 ['> A\n>','> A\n>\n>X','> A\n>\n> X\n>','> A\n>\n> X\n>\n>Y']);
 expect(b.doc.firstChild!.childCount).toBe(3);
});
it('second real list Enter exits empty item then accepts first text',()=>{
 sequence('- A',[0,0,0],1,[s=>splitListItem(s.schema.nodes.list_item!),()=>baseKeymap.Enter!,()=>text('X')],
 ['- A\n- ','- A\n\n','- A\n\nX\n']);
});
it.each([
 ['```\n```',[0],'```\n\n\n```'],
 ['```\n\n```',[0],'```\n\n\n```'],
 ['> ```\r\n> ```\r\n',[0,0],'> ```\r\n> \r\n> \r\n> ```\r\n'],
] as const)('actual newlineInCode from empty closed body %j',(raw,path,expected)=>{
 const b=sequence(raw,path,0,[()=>newlineInCode],[expected]);expect(b.doc.textContent).toBe('\n');
});
it.each([
 ['> A\n>\n>',[0,2],'> A\n>\n>\n>X'],
 ['> A\n>\n>\n> B',[0,1],'> A\n>\n>X\n>\n> B'],
 ['>\n> A',[0,0],'>X\n>\n> A'],
 ['> > A\r\n> >',[0,0,1],'> > A\r\n> >\r\n> >X'],
 ['- A\n  \n',[0,0,1],'- A\n  \n  X\n'],
 ['[^e]: A\n    \n',[0,1],'[^e]: A\n    \n    X\n'],
] as const)('owned nested blank materializes only its seam %j',(raw,path,expected)=>{typeEmpty(raw,path,'X',expected)});

it.each([
 ['>\n>',[0,1],'>\n>X'],
 ['> A\n>\n>\n',[0,2],'> A\n>\n>\n>X\n'],
 ['- A\n  \n',[0,0,1],'- A\n  \n  X\n'],
] as const)('repeated actual blank stays one authority per occurrence %j',(raw,path,expected)=>{typeEmpty(raw,path,'X',expected)});

it('owned indent terminal already separates the following external paragraph',()=>{
 for(const body of ['- ```ts\n  A\n  ```','- ```ts\n  A\n  \n  ```']){
  const withExtra=body+'\n  \r\n\nTail __raw__',withoutExtra=body+'\n  \r\nTail __raw__';
  expect(open(withExtra).doc.eq(open(withoutExtra).doc)).toBe(true);
 }
});

import {AttrStep} from 'prosemirror-transform';
it.each([
 ['- ```js\n  A\n  ```','- ```ts\n  A\n  ```\n  \r\nTail __raw__'],
 ['- ```js\n  A\n\n  ```','- ```ts\n  A\n  \n  ```\n  \r\nTail __raw__'],
] as const)('source-only owned list tail stays inside the original body claim %j',(body,expected)=>{
 const raw=body+'\r\n  \r\nTail __raw__',b=open(raw);let p=0;b.doc.descendants((n,pos)=>{if(n.type.name==='code_block')p=pos});
 const tr=EditorState.create({doc:b.doc}).tr.step(new AttrStep(p,'language','ts')),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);
 expect(r.edits).toHaveLength(1);expect(r.edits.every(e=>e.to<=b.roots[0]!.tailFrom)).toBe(true);
});

import {sinkListItem,liftListItem} from 'prosemirror-schema-list';
it('structural list depth changes only its certified body and separator padding',()=>{
 const tail='\r\n \t\r\nTail __raw__\r\n';
 for(const [raw,word,command] of [['* A\n* B'+tail,'B',sinkListItem],['* A\n  + B\n  + C'+tail,'C',liftListItem]] as const){
  const b=open(raw);let pos=0;b.doc.descendants((n,p)=>{if(n.isText&&n.text===word)pos=p});
  const state=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,pos)});let tr:import('prosemirror-state').Transaction|undefined;
  expect(command(state.schema.nodes.list_item!)(state,t=>tr=t)).toBe(true);if(!tr)throw Error('missing tr');
  const r=applySourceBlockTransaction(b,tr),expected=word==='B'?'* A\n  * B\r\n\r\nTail __raw__\r\n':'* A\n  + B\n* C\n  \r\nTail __raw__\r\n';
  expect(open(expected).doc.eq(tr.doc)).toBe(true);
  expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe(expected);
  if(word==='C')expect(r.edits.every(e=>e.to<=b.roots[0]!.tailFrom)).toBe(true);
  else expect(r.edits).toEqual([{from:0,to:7,text:'* A\n  * B'},{from:9,to:13,text:'\r\n'}]);
 }
});

it('empty list item actual continuation retains an additional empty paragraph',()=>{
 const b=open('- \n  \n');expect(b.doc.firstChild!.firstChild!.childCount).toBe(2);
 typeEmpty('- \n  \n',[0,0,1],'X','- \n  X\n');
});

it.each([
 ['- \n  B',[0,0,0],'- X\n  \n  B'],
 ['[^e]:\n    B',[0,0],'[^e]:X\n    \n    B'],
 ['> - \n>   B',[0,0,0,0],'> - X\n>   \n>   B'],
] as const)('first marker blank uses continuation prefix for its new separator %j',(raw,path,expected)=>{typeEmpty(raw,path,'X',expected)});
