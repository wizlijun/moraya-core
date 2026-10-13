import {it,expect} from 'vitest';
import {EditorState} from 'prosemirror-state';
import {captureFilePipeline,replayFilePipeline,capturedInlineRecipeFacts} from '../markdown';
import {applySourceBlockTransaction,prepareFileSourceEdits,type SourceSession} from '../source-fidelity';
import {open,pos} from './source-inline-test-utils';
it('edges code and fences re-emit identically for three generations',()=>{
 const raw='> __Alpha__ [B](/u) ``C`D`` ^^E^^\r\n\r\n```js\r\nA\r\n```\r\n';
 const first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);let cached=first;
 const session=(v:typeof first.value):SourceSession=>({revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources});
 const facts=capturedInlineRecipeFacts(session(first.value));expect(facts?.edges.length).toBe(4);expect(facts?.fences).toHaveLength(1);
 for(let i=0;i<3;i++){const next=replayFilePipeline(cached.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);
  expect(next.value.doc.eq(first.value.doc)).toBe(true);expect(next.value.textRuns).toEqual(first.value.textRuns);expect(capturedInlineRecipeFacts(session(next.value))).toEqual(facts);cached=next;
 }
});
it('raw and line deltas preserve later code partial marks and fence collision',()=>{
 const raw='A\n\n> ``甲`乙`` Alpha\n\n```js\nA\n```\n\n[ref]: /u\n',b=open(raw);
 const moved=prepareFileSourceEdits(b,{expectedRevision:b.revision,edits:[{from:0,to:1,removed:'A',text:'Long\n\nPrefix'}]});expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);
 let base=moved.session,p=pos(base.doc,[2,0]);const code=applySourceBlockTransaction(base,EditorState.create({doc:base.doc}).tr.insertText('丙',p,p+1));expect(code.ok).toBe(true);if(!code.ok)throw Error(code.reason);expect(code.edits).toHaveLength(1);expect(code.edits[0]!.to-code.edits[0]!.from).toBe(1);base=code.session;
 p=pos(base.doc,[2,0],5);const mark=applySourceBlockTransaction(base,EditorState.create({doc:base.doc}).tr.addMark(p,p+3,base.doc.type.schema.marks.strong!.create()));expect(mark.ok).toBe(true);if(!mark.ok)throw Error(mark.reason);base=mark.session;
 p=pos(base.doc,[3],1);const tr=EditorState.create({doc:base.doc}).tr.insertText('\n```\n\n',p),fence=applySourceBlockTransaction(base,tr);expect(fence.ok).toBe(true);if(!fence.ok)throw Error(fence.reason);
 expect(fence.session.source).toBe('Long\n\nPrefix\n\n> ``丙`乙`` A**lph**a\n\n````js\nA\n```\n\n\n````\n\n[ref]: /u\n');expect(fence.session.doc.eq(tr.doc)).toBe(true);
 for(const [i,old] of base.protectedSources.entries()){const delta=fence.edits.filter(e=>e.to<=old.sourceFrom).reduce((n,e)=>n+e.text.length-e.to+e.from,0);expect(fence.session.protectedSources[i]).toEqual({...old,sourceFrom:old.sourceFrom+delta,sourceTo:old.sourceTo+delta})}
});
it('reference replay updates old links while retaining labels and definitions',()=>{
 const b=open('[r]: /old\n\n[A&amp;B][r] Keep\n'),r=prepareFileSourceEdits(b,{expectedRevision:b.revision,edits:[{from:5,to:9,removed:'/old',text:'/new'}]});expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 const tr=EditorState.create({doc:r.session.doc}).tr.addMark(1,4,r.session.doc.type.schema.marks.link!.create({href:'/final'})),edited=applySourceBlockTransaction(r.session,tr);expect(edited.ok).toBe(true);if(!edited.ok)throw Error(edited.reason);expect(edited.session.source).toBe('[r]: /new\n\n[A&amp;B](/final) Keep\n');expect(edited.session.doc.eq(tr.doc)).toBe(true);
});
it.each(['sourceFrom','sourceTo','pmFrom','pmTo','kind'] as const)('foreign span %s forgery fails and legitimate clone retries',key=>{
 const b=open('> __Alpha__\n'),tr=EditorState.create({doc:b.doc}).tr.removeMark(3,5,b.doc.type.schema.marks.strong!);
 const spans=b.textSpans.map((s,i)=>i?s:{...s,[key]:key==='kind'?'atomic':s[key]+1});expect(applySourceBlockTransaction({...b,textSpans:spans},tr).ok).toBe(false);
 const plain=open('> Alpha\n'),edit=EditorState.create({doc:plain.doc}).tr.addMark(3,5,plain.doc.type.schema.marks.strong!.create()),clone={...plain,layout:JSON.parse(JSON.stringify(plain.layout)) as typeof plain.layout};
 expect(capturedInlineRecipeFacts(clone)).toBeUndefined();const r=applySourceBlockTransaction(clone,edit);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('> A**lp**ha\n');
});
it('actual annotation and paired HTML retain outer edge facts',()=>{
 const b=open('{==Alpha Beta==}{>>keep<<} <span>Tail</span>\n'),facts=capturedInlineRecipeFacts(b)!;
 expect(facts.edges.map(e=>e.family)).toEqual(['annotation','html_mark']);
 const tr=EditorState.create({doc:b.doc}).tr.addMark(7,11,b.doc.type.schema.marks.strong!.create()),r=applySourceBlockTransaction(b,tr);
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('{==Alpha **Beta**==}{>>keep<<} <span>Tail</span>\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
});
import {prepareInlineRecipe} from '../source-inline-recipe';
it('fix1 actual math occurrences retain identity across three replay generations',()=>{
 const raw='> Alpha $x$ $$x$$ $x$\r\n',first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);
 const session=(v:typeof first.value):SourceSession=>({revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources});
 const original=session(first.value),facts=capturedInlineRecipeFacts(original)!,ranges=facts.atoms.map(a=>({body:a.body,from:a.pmFrom,to:a.pmTo,raw:raw.slice(a.sourceFrom,a.sourceTo),node:a.node.toJSON()}));
 expect(ranges.map(a=>a.raw)).toEqual(['$x$','$$x$$','$x$']);expect(new Set(facts.atoms.map(a=>a.pmFrom)).size).toBe(3);
 let cached=first;
 for(let i=0;i<3;i++){
  const replay=replayFilePipeline(cached.cache);expect(replay.ok).toBe(true);if(!replay.ok)throw Error(replay.reason);
  const base=session(replay.value),next=capturedInlineRecipeFacts(base)!;
  expect(next.atoms.map(a=>({body:a.body,from:a.pmFrom,to:a.pmTo,raw:raw.slice(a.sourceFrom,a.sourceTo),node:a.node.toJSON()}))).toEqual(ranges);
  for(const a of next.atoms)expect(base.doc.nodeAt(a.pmFrom)).toBe(a.node);
  expect(next.atoms[0]!.node).not.toBe(facts.atoms[0]!.node);
  const at=pos(base.doc,[0,0]),tr=EditorState.create({doc:base.doc}).tr.addMark(at,at+2,base.doc.type.schema.marks.strong!.create());
  expect(prepareInlineRecipe(base,tr,facts).ok).toBe(false);
  const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('> **Al**pha $x$ $$x$$ $x$\r\n');cached=replay;
 }
});
it('fix1 raw line deltas and foreign recapture preserve only the actual math occurrences',()=>{
 const raw='A\n\n> Alpha $x$ $$x$$\n',initial=open(raw),moved=prepareFileSourceEdits(initial,{expectedRevision:initial.revision,edits:[{from:0,to:1,removed:'A',text:'Long\n\nPrefix'}]});
 expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);const base=moved.session,facts=capturedInlineRecipeFacts(base)!,before=capturedInlineRecipeFacts(initial)!;
 for(const [i,a] of facts.atoms.entries()){expect(a.sourceFrom-before.atoms[i]!.sourceFrom).toBe(11);expect(base.source.slice(a.sourceFrom,a.sourceTo)).toBe(i?'$$x$$':'$x$')}
 const from=pos(base.doc,[2,0]),tr=EditorState.create({doc:base.doc}).tr.addMark(from,from+2,base.doc.type.schema.marks.strong!.create());
 const foreign={...base,layout:JSON.parse(JSON.stringify(base.layout)) as typeof base.layout};expect(capturedInlineRecipeFacts(foreign)).toBeUndefined();
 const r=applySourceBlockTransaction(foreign,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('Long\n\nPrefix\n\n> **Al**pha $x$ $$x$$\n');expect(r.session.doc.eq(tr.doc)).toBe(true);
 const forgedFacts={...facts,atoms:facts.atoms.map(a=>({...a,sourceFrom:a.sourceFrom+1}))};expect(prepareInlineRecipe(base,tr,forgedFacts).ok).toBe(false);
 const corrupt={...foreign,textSpans:foreign.textSpans.map((s,i)=>i?s:{...s,sourceFrom:s.sourceFrom+1})};expect(applySourceBlockTransaction(corrupt,tr).ok).toBe(false);
 expect(applySourceBlockTransaction(base,tr).ok).toBe(true);expect(base.source).toBe('Long\n\nPrefix\n\n> Alpha $x$ $$x$$\n');
});

it('Critic range and point payload occurrences replay for three generations including point-only bodies',()=>{
 const raw='> {==A==}{>>同<<}{==B==}{>>同<<}\r\n\r\n{>>原注<<}\r\n',first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);
 const session=(v:typeof first.value):SourceSession=>({revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources});
 const facts=capturedInlineRecipeFacts(session(first.value))!;expect(facts.critic).toHaveLength(3);expect(new Set(facts.critic.map(c=>c.id)).size).toBe(3);
 expect(facts.critic.map(c=>raw.slice(c.noteFrom,c.noteTo))).toEqual(['同','同','原注']);let cached=first;
 for(let i=0;i<3;i++){const next=replayFilePipeline(cached.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);const base=session(next.value),current=capturedInlineRecipeFacts(base)!;expect(current.critic).toEqual(facts.critic);const at=current.critic[2]!.pmFrom,tr=EditorState.create({doc:base.doc}).tr.setNodeMarkup(at,undefined,{note:'新注'});expect(prepareInlineRecipe(base,tr,facts).ok).toBe(false);const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('> {==A==}{>>同<<}{==B==}{>>同<<}\r\n\r\n{>>新注<<}\r\n');cached=next}
});
it('Critic cache rawDelta and foreign finalizer bind actual payload attrs',()=>{
 const b=open('A\n\n> {==Alpha==}{>>原注<<} {>>原注<<}\n'),moved=prepareFileSourceEdits(b,{expectedRevision:b.revision,edits:[{from:0,to:1,removed:'A',text:'Long\n\nPrefix'}]});expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);
 const base=moved.session,facts=capturedInlineRecipeFacts(base)!,old=capturedInlineRecipeFacts(b)!;
 for(const [i,c] of facts.critic.entries()){expect(c.noteFrom-old.critic[i]!.noteFrom).toBe(11);expect(base.source.slice(c.noteFrom,c.noteTo)).toBe(c.note)}
 const clone={...base,layout:JSON.parse(JSON.stringify(base.layout)) as typeof base.layout},at=facts.critic[1]!.pmFrom,tr=EditorState.create({doc:base.doc}).tr.setNodeMarkup(at,undefined,{note:'新注'}),r=applySourceBlockTransaction(clone,tr);
 expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('Long\n\nPrefix\n\n> {==Alpha==}{>>原注<<} {>>新注<<}\n');
});
it('reserved nested separators replay and shift only with their actual body pair',()=>{
 const raw='> A\r\n>\r\n>\r\n>{>>原注<<}',first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);
 const session=(v:typeof first.value):SourceSession=>({revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources});
 const original=session(first.value),facts=capturedInlineRecipeFacts(original)!;expect(facts.separators).toHaveLength(1);let cache=first;
 for(let i=0;i<3;i++){const next=replayFilePipeline(cache.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);const b=session(next.value),current=capturedInlineRecipeFacts(b)!,point=current.critic[0]!,tr=EditorState.create({doc:b.doc}).tr.delete(point.pmFrom,point.pmTo);expect(current.separators).toEqual(facts.separators);expect(prepareInlineRecipe(b,tr,facts).ok).toBe(false);expect(prepareInlineRecipe(b,tr,{...current,separators:current.separators.map(s=>({...s,range:{from:0,to:5}}))}).ok).toBe(false);const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('> A\r\n>\r\n>');cache=next}
 const prefix=open('P\n\n'+raw),moved=prepareFileSourceEdits(prefix,{expectedRevision:prefix.revision,edits:[{from:0,to:1,removed:'P',text:'Long\n\nPrefix'}]});expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);
 const b=moved.session,point=capturedInlineRecipeFacts(b)!.critic[0]!,foreign={...b,layout:JSON.parse(JSON.stringify(b.layout)) as typeof b.layout},r=applySourceBlockTransaction(foreign,EditorState.create({doc:b.doc}).tr.delete(point.pmFrom,point.pmTo));expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('Long\n\nPrefix\n\n> A\r\n>\r\n>');
});
it.each([
 ['>{>>原注<<}\n>\n> [r]: /u\n','>\n> [r]: /u\n','after'],
 ['> [r]: /u\n>\n>{>>原注<<}\n','> [r]: /u\n>\n>\n','before'],
] as const)('definition separator relationship survives replay and raw delta: %s',(raw,expected,side)=>{
 const first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);let cache=first;
 const session=(v:typeof first.value):SourceSession=>({revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources});
 const facts=capturedInlineRecipeFacts(session(first.value))!;expect(facts.definitionSeparators.map(s=>s.side)).toEqual([side]);
 for(let i=0;i<3;i++){const next=replayFilePipeline(cache.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);const b=session(next.value),current=capturedInlineRecipeFacts(b)!,p=current.critic[0]!;expect(current.definitionSeparators).toEqual(facts.definitionSeparators);const tr=EditorState.create({doc:b.doc}).tr.delete(p.pmFrom,p.pmTo);expect(prepareInlineRecipe(b,tr,facts).ok).toBe(false);const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe(expected);cache=next}
 const prefix=open('P\n\n'+raw),moved=prepareFileSourceEdits(prefix,{expectedRevision:prefix.revision,edits:[{from:0,to:1,removed:'P',text:'Long\n\nPrefix'}]});expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);const b=moved.session,p=capturedInlineRecipeFacts(b)!.critic[0]!,foreign={...b,layout:JSON.parse(JSON.stringify(b.layout)) as typeof b.layout},r=applySourceBlockTransaction(foreign,EditorState.create({doc:b.doc}).tr.delete(p.pmFrom,p.pmTo));expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('Long\n\nPrefix\n\n'+expected);
});
it('empty point lifecycle uses fresh Critic facts after each replayed insertion',()=>{
 const raw='>\n',first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);let cached=first;
 for(let i=0;i<3;i++){const next=replayFilePipeline(cached.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);const v=next.value;let b:SourceSession={revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources};
 const point=b.doc.type.schema.nodes.note_anchor!.create({note:'?'}),insert=applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.insert(2,point));expect(insert.ok).toBe(true);if(!insert.ok)throw Error(insert.reason);b=insert.session;expect(b.source).toBe('>{>>?<<}\n');expect(capturedInlineRecipeFacts(b)!.critic).toHaveLength(1);
 const save=applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.setNodeMarkup(2,undefined,{note:'新注'}));expect(save.ok).toBe(true);if(!save.ok)throw Error(save.reason);b=save.session;expect(b.source).toBe('>{>>新注<<}\n');const remove=applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.delete(2,3));expect(remove.ok).toBe(true);if(remove.ok)expect(remove.session.source).toBe(raw);cached=next;
 }
});
it('actual newline escape and footnote atoms remain read-only through repeated replay',()=>{
 const raw='\uFEFF> A  \r\n> B[^x]\r\n\r\n[^x]: body\r\n',first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);let cache=first;
 for(let i=0;i<3;i++){const next=replayFilePipeline(cache.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);const v=next.value,b:SourceSession={revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources},facts=capturedInlineRecipeFacts(b)!;
 expect(facts.atoms.map(a=>raw.slice(a.sourceFrom,a.sourceTo))).toEqual(['  \r\n','[^x]']);for(const a of facts.atoms)expect(b.doc.nodeAt(a.pmFrom)).toBe(a.node);
 const tr=EditorState.create({doc:b.doc}).tr.addMark(2,3,b.doc.type.schema.marks.strong!.create()),r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('\uFEFF> **A**  \r\n> B[^x]\r\n\r\n[^x]: body\r\n');
 for(const atom of facts.atoms){expect(applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.addMark(atom.pmFrom,atom.pmTo,b.doc.type.schema.marks.strong!.create())).ok).toBe(false);expect(applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.delete(atom.pmFrom,atom.pmTo)).ok).toBe(false)}cache=next;
 }
});
