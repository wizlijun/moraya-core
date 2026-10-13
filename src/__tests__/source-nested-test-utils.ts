import {expect} from 'vitest';
import {EditorState, TextSelection, type Transaction} from 'prosemirror-state';
import {toggleMark} from 'prosemirror-commands';
import type {Node as PmNode} from 'prosemirror-model';
import {createSourceSession, applySourceBlockTransaction} from '../source-fidelity';
export function open(raw:string) {
  const r=createSourceSession(raw); expect(r.ok).toBe(true);
  if(!r.ok)throw new Error(r.reason); return r.session;
}
export function at(doc:PmNode,path:readonly number[],offset=0):number {
  let n=doc, contentStart=0;
  for(const index of path){
    let skip=0; for(let i=0;i<index;i++)skip+=n.child(i).nodeSize;
    contentStart+=skip+1; n=n.child(index);
  }
  if(offset<0||offset>n.content.size)throw new Error('invalid test offset');
  return contentStart+offset;
}
export function change(raw:string,path:readonly number[],offset:number,expected:string) {
  const b=open(raw),p=at(b.doc,path,offset);
  expect(b.doc.textBetween(p,p+1)).toBe('甲');
  const tr=EditorState.create({doc:b.doc}).tr.insertText('乙',p,p+1);
  const r=applySourceBlockTransaction(b,tr); expect(r.ok).toBe(true);
  if(!r.ok)throw new Error(r.reason);
  expect(Buffer.from(r.session.source)).toEqual(Buffer.from(expected));
  expect(r.mode).toBe('exact-text'); expect(r.edits).toHaveLength(1);
  expect(r.edits[0]!.to-r.edits[0]!.from).toBe(1); expect(r.edits[0]!.text).toBe('乙');
  expect(r.session.doc.eq(tr.doc)).toBe(true); expect(b.source).toBe(raw);
  return {b,r,tr};
}
export function bold(raw:string,path:readonly number[]) {
  const b=open(raw),p=at(b.doc,path),n=b.doc.resolve(p).parent;
  const s=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,p,p+n.content.size)});
  let tr:Transaction|undefined;
  expect(toggleMark(s.schema.marks.strong!)(s,t=>{tr=t})).toBe(true);
  if(!tr)throw new Error('command did not dispatch');
  return {b,tr,r:applySourceBlockTransaction(b,tr)};
}
