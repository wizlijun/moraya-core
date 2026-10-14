import {it,expect} from 'vitest';
import {EditorState} from 'prosemirror-state';
import {captureFilePipeline,replayFilePipeline,capturedInlineRecipeFacts} from '../markdown';
import {applySourceBlockTransaction,prepareFileSourceEdits,type SourceSession} from '../source-fidelity';
import {prepareInlineRecipe} from '../source-inline-recipe';
import {open} from './source-inline-test-utils';
it('actual image occurrence nodes rebind through three generations',()=>{
 const raw='\uFEFF> ![x](/x) ![x][r]\r\n\r\n[r]: /x\r\n',first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);let cache=first;
 const session=(v:typeof first.value):SourceSession=>({revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources});
 const old=capturedInlineRecipeFacts(session(first.value))!;expect(old.atoms).toHaveLength(2);
 for(let i=0;i<3;i++){
  const next=replayFilePipeline(cache.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);const b=session(next.value),facts=capturedInlineRecipeFacts(b)!;
  expect(facts.atoms.map(a=>raw.slice(a.sourceFrom,a.sourceTo))).toEqual(['![x](/x)','![x][r]']);
  for(const a of facts.atoms)expect(b.doc.nodeAt(a.pmFrom)).toBe(a.node);
  expect(facts.atoms[0]!.node).not.toBe(old.atoms[0]!.node);
  const tr=EditorState.create({doc:b.doc}).tr.setNodeAttribute(facts.atoms[1]!.pmFrom,'title','width=50%');
  expect(prepareInlineRecipe(b,tr,old).ok).toBe(false);const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('\uFEFF> ![x](/x) ![x](/x "width=50%")\r\n\r\n[r]: /x\r\n');cache=next;
 }
});
it('raw line delta and foreign layout recapture retain image provenance',()=>{
 const initial=open('A\n\n> ![x][r]\n\n[r]: /x\n'),moved=prepareFileSourceEdits(initial,{expectedRevision:initial.revision,edits:[{from:0,to:1,removed:'A',text:'Long\n\nPrefix'}]});expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);
 const b=moved.session,facts=capturedInlineRecipeFacts(b)!,old=capturedInlineRecipeFacts(initial)!;expect(facts.atoms[0]!.sourceFrom-old.atoms[0]!.sourceFrom).toBe(11);
 const tr=EditorState.create({doc:b.doc}).tr.setNodeAttribute(facts.atoms[0]!.pmFrom,'alt','new'),foreign={...b,layout:JSON.parse(JSON.stringify(b.layout)) as typeof b.layout};expect(capturedInlineRecipeFacts(foreign)).toBeUndefined();
 expect(prepareInlineRecipe(b,tr,{...facts,atoms:facts.atoms.map(a=>({...a,sourceFrom:0}))}).ok).toBe(false);
 const r=applySourceBlockTransaction(foreign,tr);expect(r.ok).toBe(true);if(r.ok)expect(r.session.source).toBe('Long\n\nPrefix\n\n> ![new](/x)\n\n[r]: /x\n');
});
