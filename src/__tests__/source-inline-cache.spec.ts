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
