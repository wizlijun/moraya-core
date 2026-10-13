import {it,expect} from 'vitest';
import {EditorState} from 'prosemirror-state';
import {captureFilePipeline,replayFilePipeline,capturedInlineRecipeFacts} from '../markdown';
import {applySourceBlockTransaction,prepareFileSourceEdits,type SourceSession} from '../source-fidelity';
import {prepareInlineRecipe} from '../source-inline-recipe';
import {open,pos} from './source-inline-test-utils';
it('three cache generations bind whole math occurrences and new slice to the actual body',()=>{
 const raw='> __Keep__ $x$ $$x$$ $z\r\n',first=captureFilePipeline(raw);expect(first.ok).toBe(true);if(!first.ok)throw Error(first.reason);
 const session=(v:typeof first.value):SourceSession=>({revision:0,source:raw,doc:v.doc,textSpans:v.textRuns,roots:v.roots,gaps:v.gaps,layout:v.layout,protectedSources:v.protectedSources});
 const original=capturedInlineRecipeFacts(session(first.value))!;let cache=first;
 for(let i=0;i<3;i++){
  const next=replayFilePipeline(cache.cache);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);const b=session(next.value),facts=capturedInlineRecipeFacts(b)!;
  expect(facts.atoms.map(a=>raw.slice(a.sourceFrom,a.sourceTo))).toEqual(['$x$','$$x$$']);
  for(const a of facts.atoms){expect(b.doc.nodeAt(a.pmFrom)).toBe(a.node);expect(a.pmTo-a.pmFrom).toBe(a.node.nodeSize)}
  const end=pos(b.doc,[0,0],b.doc.firstChild!.firstChild!.content.size),s=b.doc.type.schema;
  const tr=EditorState.create({doc:b.doc}).tr.replaceWith(end-2,end,s.nodes.math_inline!.create(null,s.text('z')));
  expect(prepareInlineRecipe(b,tr,original).ok).toBe(false);
  const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.session.source).toBe('> __Keep__ $x$ $$x$$ $z$\r\n');expect(r.session.doc.eq(tr.doc)).toBe(true);cache=next;
 }
});
it('raw and line deltas, foreign recapture, and following adjacent edit preserve old and new atoms',()=>{
 const initial=open('A\n\n> __Keep__ $x$ $$x$$ $z\n'),moved=prepareFileSourceEdits(initial,{expectedRevision:initial.revision,edits:[{from:0,to:1,removed:'A',text:'Long\n\nPrefix'}]});expect(moved.ok).toBe(true);if(!moved.ok)throw Error(moved.reason);
 const b=moved.session,foreign={...b,layout:JSON.parse(JSON.stringify(b.layout)) as typeof b.layout},end=pos(b.doc,[2,0],b.doc.child(2).firstChild!.content.size),s=b.doc.type.schema,tr=EditorState.create({doc:b.doc}).tr.replaceWith(end-2,end,s.nodes.math_inline!.create(null,s.text('z')));
 const facts=capturedInlineRecipeFacts(b)!;expect(prepareInlineRecipe(b,tr,{...facts,atoms:facts.atoms.map(a=>({...a,body:-1}))}).ok).toBe(false);
 const corrupt={...foreign,textSpans:foreign.textSpans.map((x,i)=>i?x:{...x,sourceFrom:x.sourceFrom+1})};expect(applySourceBlockTransaction(corrupt,tr).ok).toBe(false);
 const r=applySourceBlockTransaction(foreign,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.source).toBe('Long\n\nPrefix\n\n> __Keep__ $x$ $$x$$ $z$\n');
 const at=pos(r.session.doc,[2,0]),next=applySourceBlockTransaction(r.session,EditorState.create({doc:r.session.doc}).tr.insertText('Z',at,at+1));expect(next.ok).toBe(true);if(next.ok)expect(next.session.source).toBe('Long\n\nPrefix\n\n> __Zeep__ $x$ $$x$$ $z$\n');
});
