import {expect} from 'vitest';
import {EditorState,TextSelection} from 'prosemirror-state';
import type {Node as PmNode} from 'prosemirror-model';
import {ReplaceStep} from 'prosemirror-transform';
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity';
export function open(raw:string){const r=createSourceSession(raw);if(!r.ok)throw Error(r.reason);return r.session}
export function at(doc:PmNode,path:readonly number[]){
 let n=doc,pos=0;
 for(let d=0;d<path.length;d++){
  for(let i=0;i<path[d]!;i++)pos+=n.child(i).nodeSize;
  n=n.child(path[d]!);pos++;
 }
 return pos;
}
export function typeEmpty(raw:string,path:readonly number[],text:string,expected:string){
 const b=open(raw),p=at(b.doc,path),s=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,p)});
 expect(s.selection.$from.parent.content.size).toBe(0);
 const tr=s.tr.insertText(text),snapshot=JSON.stringify(b);
 expect(tr.steps).toHaveLength(1);expect(Object.getPrototypeOf(tr.steps[0])).toBe(ReplaceStep.prototype);
 expect((tr.steps[0] as ReplaceStep).from).toBe(p);expect((tr.steps[0] as ReplaceStep).to).toBe(p);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok, r.ok?undefined:r.reason).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(r.session.source).toBe(expected);
 expect(JSON.stringify(b)).toBe(snapshot);expect(r.edits.length).toBeGreaterThan(0);
 return {b,r,tr};
}
