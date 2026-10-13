import {it,expect,vi} from 'vitest';
import {EditorState} from 'prosemirror-state';
import {ReplaceStep,RemoveMarkStep,AddMarkStep} from 'prosemirror-transform';
import {applySourceBlockTransaction,type SourceSession} from '../source-fidelity';
import {open,pos} from './source-inline-test-utils';
function apply(base:SourceSession,tr:ReturnType<typeof EditorState.create>['tr'],expected:string){
 const r=applySourceBlockTransaction(base,tr);expect(r.ok,r.ok?undefined:r.reason+" expected="+JSON.stringify(expected)).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);return r;
}
it('annotation note chain changes only actual payload',()=>{
 const raw='> {==Alpha _Beta_==}{>>原注<<}\n',b=open(raw),from=pos(b.doc,[0,0]),to=from+10;
 const type=b.doc.type.schema.marks.annotation!;
 const tr=EditorState.create({doc:b.doc}).tr.removeMark(from,to,type).addMark(from,to,type.create({note:'新注'}));
 expect(tr.steps.some(s=>Object.getPrototypeOf(s)===RemoveMarkStep.prototype)).toBe(true);
 expect(tr.steps.some(s=>Object.getPrototypeOf(s)===AddMarkStep.prototype)).toBe(true);
 const r=apply(b,tr,'> {==Alpha _Beta_==}{>>新注<<}\n');expect(r.edits).toHaveLength(1);expect(r.edits[0]!.to-r.edits[0]!.from).toBe(1);
});
it('same-note adjacent occurrences retain their separate wrappers',()=>{
 const b=open('{==A==}{>>同<<}{==B==}{>>同<<}\n'),type=b.doc.type.schema.marks.annotation!;
 const r=apply(b,EditorState.create({doc:b.doc}).tr.removeMark(1,3,type).addMark(1,3,type.create({note:'新'})),'{==A==}{>>新<<}{==B==}{>>新<<}\n');expect(r.edits).toHaveLength(2);
});
it('actual setNodeMarkup is a leaf Replace and changes only point-note text',()=>{
 const b=open('{>>原注<<}目标甲。\n'),tr=EditorState.create({doc:b.doc}).tr.setNodeMarkup(1,undefined,{note:'新注'});
 expect(Object.getPrototypeOf(tr.steps[0]!)).toBe(ReplaceStep.prototype);
 const r=apply(b,tr,'{>>新注<<}目标甲。\n');expect(r.edits).toHaveLength(1);expect(r.edits[0]!.text).toBe('新');expect(r.edits[0]!.to-r.edits[0]!.from).toBe(1);
});
const header='| H | J |\n| --- | --- |\n';
it.each([
 ['', [0], '{>>?<<}', '{>>新注<<}', ''],
 ['>\n',[0,0], '>{>>?<<}\n', '>{>>新注<<}\n', '>\n'],
 [header+'| A |   |\n',[0,1,1,0],header+'| A |{>>?<<}   |\n',header+'| A |{>>新注<<}   |\n',header+'| A |   |\n'],
 [header+'| A |\n',[0,1,1,0],header+'| A |{>>?<<}|\n',header+'| A |{>>新注<<}|\n',header+'| A ||\n'],
 ['Alpha。\n',[0],'{>>?<<}Alpha。\n','{>>新注<<}Alpha。\n','Alpha。\n'],
] as const)('point insert/save/remove consumes authoritative session: %s',(raw,path,inserted,saved,removed)=>{
 let b=open(raw);const at=pos(b.doc,path),node=b.doc.type.schema.nodes.note_anchor!.create({note:'?'});
 b=apply(b,EditorState.create({doc:b.doc}).tr.insert(at,node),inserted).session;
 b=apply(b,EditorState.create({doc:b.doc}).tr.setNodeMarkup(at,undefined,{note:'新注'}),saved).session;
 apply(b,EditorState.create({doc:b.doc}).tr.delete(at,at+1),removed);
});
it('range add remove preserves inner marks and crosses bodies atomically',()=>{
 let b=open('Alpha _Beta_。\n\nTail。\n'),type=b.doc.type.schema.marks.annotation!;
 b=apply(b,EditorState.create({doc:b.doc}).tr.addMark(1,pos(b.doc,[1],4),type.create({note:'?'})),'{==Alpha _Beta_。==}{>>?<<}\n\n{==Tail==}{>>?<<}。\n').session;
 apply(b,EditorState.create({doc:b.doc}).tr.removeMark(1,pos(b.doc,[1],4),type),'Alpha _Beta_。\n\nTail。\n');
});
it('partial annotation removal retains unselected notes and other marks',()=>{
 const b=open('{==Alpha _Beta_==}{>>原注<<}\n'),type=b.doc.type.schema.marks.annotation!;
 apply(b,EditorState.create({doc:b.doc}).tr.removeMark(3,5,type),'{==Al==}{>>原注<<}ph{==a _Beta_==}{>>原注<<}\n');
});

import {Fragment} from 'prosemirror-model';
import * as markdown from '../markdown';
import {prepareEmptyParagraphEdits} from '../source-structure';
import {prepareInlineRecipe,prepareEmptyInlineContent} from '../source-inline-recipe';
it('BOM CRLF duplicates nested references and definitions retain exact bytes',()=>{
 const raw='\uFEFF> {==[Alpha][r] _Beta_==}{>>原注<<} {==[Alpha][r] _Beta_==}{>>原注<<}\r\n>\r\n> [r]: /u "title"\r\n\r\n[far]: /v\r\n';
 const b=open(raw),facts=markdown.capturedInlineRecipeFacts(b)!,type=b.doc.type.schema.marks.annotation!;
 expect(facts.critic).toHaveLength(2);const f=facts.critic[1]!;
 const r=apply(b,EditorState.create({doc:b.doc}).tr.removeMark(f.pmFrom,f.pmTo,type).addMark(f.pmFrom,f.pmTo,type.create({note:'新说明'})),'\uFEFF> {==[Alpha][r] _Beta_==}{>>原注<<} {==[Alpha][r] _Beta_==}{>>新说明<<}\r\n>\r\n> [r]: /u "title"\r\n\r\n[far]: /v\r\n');
 for(const [i,p] of b.protectedSources.entries()){const delta=r.edits.filter(e=>e.to<=p.sourceFrom).reduce((n,e)=>n+e.text.length-e.to+e.from,0);expect(r.session.protectedSources[i]).toEqual({...p,sourceFrom:p.sourceFrom+delta,sourceTo:p.sourceTo+delta})}
});
it('partial add and note changes preserve actual unselected occurrence',()=>{
 const b=open('{==Alpha _Beta_==}{>>原注<<}\n'),type=b.doc.type.schema.marks.annotation!;
 apply(b,EditorState.create({doc:b.doc}).tr.removeMark(3,5,type).addMark(3,5,type.create({note:'新'})),'{==Al==}{>>原注<<}{==ph==}{>>新<<}{==a _Beta_==}{>>原注<<}\n');
});
it('point deletion refuses widened ranges fake steps changed marks types attrs and bad notes',()=>{
 const b=open('{>>原注<<}A\n'),state=EditorState.create({doc:b.doc}),node=b.doc.firstChild!.firstChild!,schema=b.doc.type.schema;
 class Fake extends ReplaceStep{}
 const replaced=state.tr.setNodeMarkup(1,undefined,{note:'新注'}).steps[0] as ReplaceStep;
 const cases=[state.tr.step(new Fake(replaced.from,replaced.to,replaced.slice)),state.tr.delete(1,3),state.tr.setNodeMarkup(1,schema.nodes.hardbreak,{isInline:true}),state.tr.setNodeMarkup(1,undefined,{note:'新注'},[schema.marks.strong!.create()]),state.tr.setNodeMarkup(1,undefined,{note:'bad\nvalue'}),state.tr.setNodeMarkup(1,undefined,{note:'bad<<}value'})];
 const forged=node.type.create({note:'new'});Object.defineProperty(forged,'attrs',{value:{note:'new',foreign:true}});
 cases.push(state.tr.replaceWith(1,2,forged));
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');try{
  for(const tr of cases){expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(b.source).toBe('{>>原注<<}A\n')}
  expect(spy).not.toHaveBeenCalled();apply(b,state.tr.setNodeMarkup(1,undefined,{note:'新注'}),'{>>新注<<}A\n');
 }finally{spy.mockRestore()}
});
it('empty helper permits only the certified canonical single note leaf',()=>{
 const b=open(''),state=EditorState.create({doc:b.doc}),schema=b.doc.type.schema,fact=markdown.capturedEmptyBodies(b.source,b.doc,b.roots,b.layout)![0]!;
 const tr=state.tr.insert(1,schema.nodes.note_anchor!.create({note:'?'}));
 expect(prepareEmptyParagraphEdits(b,tr,{kind:'fallback'},'{>>?<<}')).toEqual([{from:0,to:0,text:'{>>?<<}'}]);
 expect(prepareEmptyInlineContent(b,tr,{...fact})).toEqual({kind:'unsupported',reason:'empty-inline-chain'});
 const cases=[state.tr.insert(1,schema.nodes.hardbreak!.create({isInline:true})),state.tr.insert(1,schema.nodes.math_inline!.create(null,schema.text('x'))),state.tr.insert(1,schema.nodes.note_anchor!.create({note:'?'},null,[schema.marks.strong!.create()])),state.tr.insert(1,schema.nodes.note_anchor!.create({note:'?'})).addMark(1,2,schema.marks.strong!.create()),state.tr.insert(1,Fragment.fromArray([schema.nodes.note_anchor!.create({note:'?'}),schema.text('X')]))];
 for(const bad of cases){expect(()=>prepareEmptyParagraphEdits(b,bad,{kind:'fallback'},'x')).toThrow();expect(applySourceBlockTransaction(b,bad).ok).toBe(false)}
});
it('foreign tamper fails before rendering and legitimate request remains usable',()=>{
 const b=open('> {==Alpha==}{>>原<<}\n'),type=b.doc.type.schema.marks.annotation!,tr=EditorState.create({doc:b.doc}).tr.removeMark(2,7,type).addMark(2,7,type.create({note:'新'})),facts=markdown.capturedInlineRecipeFacts(b)!;
 expect(prepareInlineRecipe(b,tr,{...facts,critic:facts.critic.map(c=>({...c,noteFrom:c.noteFrom+1}))}).ok).toBe(false);
 const corrupt={...b,textSpans:b.textSpans.map((s,i)=>i?s:{...s,sourceFrom:s.sourceFrom+1})};
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');try{expect(applySourceBlockTransaction(corrupt,tr).ok).toBe(false);expect(spy).not.toHaveBeenCalled();apply(b,tr,'> {==Alpha==}{>>新<<}\n')}finally{spy.mockRestore()}
});
it('neighbour annotation changes retain existing inline and block math raw',()=>{
 const b=open('Alpha $x+y$\n\n$$\nx^2\n$$\n'),type=b.doc.type.schema.marks.annotation!;
 apply(b,EditorState.create({doc:b.doc}).tr.addMark(1,6,type.create({note:'?'})),'{==Alpha==}{>>?<<} $x+y$\n\n$$\nx^2\n$$\n');
});
it('a mixed supported range and unsupported atom remains atomic',()=>{
 const b=open('Alpha\n\n$x$\n'),state=EditorState.create({doc:b.doc});
 const tr=state.tr.addMark(1,6,b.doc.type.schema.marks.annotation!.create({note:'?'})).insertText('y',pos(b.doc,[1])+1);
 expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(b.source).toBe('Alpha\n\n$x$\n');
});
it('source-only repeated blank and third missing cell select one occurrence',()=>{
 const h='| H | J | K |\n| --- | --- | --- |\n',cases=[
  [h+'| A |\n',[0,1,2,0],h+'| A ||{>>?<<}|\n',h+'| A ||{>>新注<<}|\n',h+'| A |||\n'],
  ['> A\n>\n>',[0,2],'> A\n>\n>\n>{>>?<<}','> A\n>\n>\n>{>>新注<<}','> A\n>\n>'],
 ] as const;
 for(const [raw,path,inserted,saved,removed] of cases){let b=open(raw);const at=pos(b.doc,path);b=apply(b,EditorState.create({doc:b.doc}).tr.insert(at,b.doc.type.schema.nodes.note_anchor!.create({note:'?'})),inserted).session;b=apply(b,EditorState.create({doc:b.doc}).tr.setNodeMarkup(at,undefined,{note:'新注'}),saved).session;apply(b,EditorState.create({doc:b.doc}).tr.delete(at,at+1),removed)}
});

import {prepareEmptyBodyTransaction} from '../source-empty-body';
it('point insertion cannot reuse missing foreign ignored or generated authority',()=>{
 const b=open(header+'| A |   |\n'),at=pos(b.doc,[0,1,1,0]),tr=EditorState.create({doc:b.doc}).tr.insert(at,b.doc.type.schema.nodes.note_anchor!.create({note:'?'})),facts=markdown.capturedEmptyBodies(b.source,b.doc,b.roots,b.layout)!;
 expect(prepareEmptyBodyTransaction(b,tr,[]).kind).toBe('unsupported');expect(prepareEmptyBodyTransaction(b,tr,facts.map(f=>({...f,pmAt:f.pmAt+1}))).kind).toBe('unsupported');
 const ignored=open('| H |\n| --- |\n| A | |\n');expect(markdown.capturedEmptyBodies(ignored.source,ignored.doc,ignored.roots,ignored.layout)).toEqual([]);
 const generated=open('  ```js\n\t\n  ```\n'),bad=EditorState.create({doc:generated.doc}).tr.insert(1,generated.doc.type.schema.nodes.note_anchor!.create({note:'?'}));expect(prepareInlineRecipe(generated,bad,markdown.capturedInlineRecipeFacts(generated)!).ok).toBe(false);
});
it.each(['later-empty','emptied-earlier','created-earlier'] as const)('point preserves original empty chain guard: %s',kind=>{
 const b=open(header+'| A |   |\n'),s=EditorState.create({doc:b.doc}),schema=b.doc.type.schema,node=schema.nodes.note_anchor!.create({note:'?'});
 const tr=kind==='later-empty'?s.tr.insertText('B',16,17).insert(21,node):kind==='emptied-earlier'?s.tr.delete(16,17).insert(16,node):s.tr.insert(b.doc.content.size,schema.nodes.paragraph!.create()).insert(b.doc.content.size+1,node);
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');try{expect(applySourceBlockTransaction(b,tr).ok).toBe(false);expect(spy).not.toHaveBeenCalled();expect(b.source).toBe(header+'| A |   |\n')}finally{spy.mockRestore()}
});
it('point payload edit retains every existing mark and rejects a changed mark',()=>{
 const b=open('**{>>原注<<}A**\n'),state=EditorState.create({doc:b.doc}),old=b.doc.nodeAt(1)!;
 expect(old.marks).toHaveLength(1);
 apply(b,state.tr.setNodeMarkup(1,undefined,{note:'新注'}),'**{>>新注<<}A**\n');
 expect(applySourceBlockTransaction(b,state.tr.setNodeMarkup(1,undefined,{note:'新注'},[])).ok).toBe(false);
});
it.each([
 ['>{>>原注<<}\n>\n> A\n','>\n> A\n'],
 ['> A\n>\n>{>>原注<<}\n>\n> B\n','> A\n>\n>\n> B\n'],
 ['> A\n>\n>{>>原注<<}\n','> A\n>\n'],
 ['\uFEFF> A\r\n>\r\n>\r\n>{>>原注<<}\r\n','\uFEFF> A\r\n>\r\n>\r\n'],
 ['> [r]: /u\n>\n>{>>原注<<}\n','> [r]: /u\n>\n>\n'],
 ['>{>>原注<<}\n>\n> [r]: /u\n','>\n> [r]: /u\n'],
 ['{>>原注<<}\n',''],
] as const)('point-only deletion consumes only an actual redundant separator: %s',(raw,expected)=>{
 const b=open(raw),facts=markdown.capturedInlineRecipeFacts(b)!,f=facts.critic[0]!,r=apply(b,EditorState.create({doc:b.doc}).tr.delete(f.pmFrom,f.pmTo),expected);
 expect(r.edits.every(e=>e.text==='')).toBe(true);
 for(const [i,p] of b.protectedSources.entries()){const delta=r.edits.filter(e=>e.to<=p.sourceFrom).reduce((n,e)=>n+e.text.length-e.to+e.from,0);expect(r.session.protectedSources[i]).toEqual({...p,sourceFrom:p.sourceFrom+delta,sourceTo:p.sourceTo+delta})}
});
it('point payload shrinking preserves complete Unicode scalars',()=>{
 const b=open('{>>😀尾<<}A\n'),r=apply(b,EditorState.create({doc:b.doc}).tr.setNodeMarkup(1,undefined,{note:'😁尾'}),'{>>😁尾<<}A\n');expect(r.edits).toEqual([{from:3,to:5,text:'😁'}]);
});
it('deleting a point beside retained text never consumes its reserved separator',()=>{
 const b=open('> A\n>\n>{>>原注<<}B\n'),p=markdown.capturedInlineRecipeFacts(b)!.critic[0]!,r=apply(b,EditorState.create({doc:b.doc}).tr.delete(p.pmFrom,p.pmTo),'> A\n>\n>B\n');expect(r.edits).toHaveLength(1);
});
import {splitBlock} from 'prosemirror-commands';
import {TextSelection,type Transaction} from 'prosemirror-state';
it('actual Enter then nested point insert save remove consumes each new generation',()=>{
 let b=open('> A');const state=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,3)});let tr:Transaction|undefined;
 expect(splitBlock(state,t=>{tr=t})).toBe(true);b=apply(b,tr!,'> A\n>').session;
 const at=pos(b.doc,[0,1]);b=apply(b,EditorState.create({doc:b.doc}).tr.insert(at,b.doc.type.schema.nodes.note_anchor!.create({note:'?'})),'> A\n>\n>{>>?<<}').session;
 b=apply(b,EditorState.create({doc:b.doc}).tr.setNodeMarkup(at,undefined,{note:'新注'}),'> A\n>\n>{>>新注<<}').session;apply(b,EditorState.create({doc:b.doc}).tr.delete(at,at+1),'> A\n>');
});

it.each([
 ['A\n\n{>>原注<<}\n','A\n\n'],
 ['{>>原注<<}\n\nB\n','\nB\n'],
 ['A\n\n{>>原注<<}\n\nB\n','A\n\n\nB\n'],
 ['\uFEFF{>>原注<<}\r\n','\uFEFF'],
] as const)('point-only root deletion consumes only its own whole terminal: %s',(raw,expected)=>{
 const b=open(raw),point=markdown.capturedInlineRecipeFacts(b)!.critic[0]!,r=apply(b,EditorState.create({doc:b.doc}).tr.delete(point.pmFrom,point.pmTo),expected);expect(r.edits).toHaveLength(2);
});

it.each([
 ['**{>>原注<<}**\n',''],
 ['**{>>原注<<}A**\n','**A**\n'],
] as const)('final I2 actual marked point deletion: %s',(raw,expected)=>{
 const b=open(raw),p=markdown.capturedInlineRecipeFacts(b)!.critic[0]!;
 expect(b.doc.nodeAt(p.pmFrom)!.marks.map(m=>m.type.name)).toEqual(['strong']);
 const tr=EditorState.create({doc:b.doc}).tr.delete(p.pmFrom,p.pmTo);
 expect(open(expected).doc.eq(tr.doc)).toBe(true);apply(b,tr,expected);expect(b.source).toBe(raw);
});

it.each([
 ['\uFEFF**{>>原注<<}**\r\n','\uFEFF'],
 ['*{>>原注<<}*\n',''],
 ['***{>>原注<<}***\n',''],
 ['**_{>>原注<<}_!A**\n','**!A**\n'],
 ['*{>>原注<<}A*\n','*A*\n'],
 ['>**{>>原注<<}**\n','>\n'],
 ['>**{>>原注<<}**\n>\n> [r]: /u\n','>\n> [r]: /u\n'],
 ['> [r]: /u\n>\n>**{>>原注<<}**\n','> [r]: /u\n>\n>\n'],
 ['> A\r\n>\r\n>\r\n>***{>>原注<<}***','> A\r\n>\r\n>'],
 [header+'| A | **{>>原注<<}** |\n',header+'| A |  |\n'],
 ['**{>>原注<<}**\n\nTail &amp;\n','\nTail &amp;\n'],
] as const)('final I2 removes only actual empty enclosing wrappers: %s',(raw,expected)=>{
 const b=open(raw),facts=markdown.capturedInlineRecipeFacts(b)!,p=facts.critic[0]!;
 expect(b.doc.nodeAt(p.pmFrom)!.marks.length).toBeGreaterThan(0);
 const tr=EditorState.create({doc:b.doc}).tr.delete(p.pmFrom,p.pmTo);expect(open(expected).doc.eq(tr.doc)).toBe(true);
 const r=apply(b,tr,expected);expect(b.source).toBe(raw);
 for(const [i,old] of b.protectedSources.entries()){const delta=r.edits.filter(e=>e.to<=old.sourceFrom).reduce((n,e)=>n+e.text.length-e.to+e.from,0);expect(r.session.protectedSources[i]).toEqual({...old,sourceFrom:old.sourceFrom+delta,sourceTo:old.sourceTo+delta})}
 const after=open(r.session.source),at=pos(after.doc,after.doc.firstChild!.type.name==='blockquote'?[0,0]:after.doc.firstChild!.type.name==='table'?[0,1,1,0]:[0]);
 const next=EditorState.create({doc:after.doc}).tr.insertText('Z',at),edited=applySourceBlockTransaction(after,next);if(expected==='>\n> [r]: /u\n'){expect(edited).toEqual({ok:false,reason:'semantic-mismatch'});expect(after.source).toBe(expected)}else{expect(edited.ok).toBe(true);if(edited.ok)expect(edited.session.doc.eq(next.doc)).toBe(true)}
});
it('final I2 code point spelling is text and wider or mixed leaf deletions stay atomic',()=>{
 const literal=open('`{>>原注<<}`\n');expect(markdown.capturedInlineRecipeFacts(literal)!.critic).toHaveLength(0);
 const raw='**{>>原注<<}A**\n\n$x$\n',b=open(raw),p=markdown.capturedInlineRecipeFacts(b)!.critic[0]!,state=EditorState.create({doc:b.doc});
 const atom=markdown.capturedInlineRecipeFacts(b)!.atoms.find(a=>a.node.type.name==='math_inline')!;
 const wide=state.tr.delete(p.pmFrom,p.pmTo+1),mixed=state.tr.delete(p.pmFrom,p.pmTo);mixed.addMark(mixed.mapping.map(atom.pmFrom),mixed.mapping.map(atom.pmTo),b.doc.type.schema.marks.strong!.create());
 expect(applySourceBlockTransaction(b,wide).ok).toBe(false);expect(applySourceBlockTransaction(b,mixed).ok).toBe(false);expect(b.source).toBe(raw);
 expect(applySourceBlockTransaction(b,state.tr.delete(p.pmFrom,p.pmTo)).ok).toBe(true);
});
