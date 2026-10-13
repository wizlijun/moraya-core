import {expect} from 'vitest';
import {EditorState,TextSelection,type Transaction,type Command} from 'prosemirror-state';
import type {Node as PmNode} from 'prosemirror-model';
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity';
export function open(raw:string){
 const x=createSourceSession(raw);expect(x.ok).toBe(true);
 if(!x.ok)throw Error(x.reason);return x.session;
}
export function pos(doc:PmNode,path:readonly number[],offset=0){
 let n=doc,p=0;
 for(const index of path){for(let i=0;i<index;i++)p+=n.child(i).nodeSize;
  p++;n=n.child(index)}
 if(offset<0||offset>n.content.size)throw Error('test offset outside parent');
 return p+offset;
}
export function command(raw:string,fromPath:readonly number[],fromOffset:number,
 toPath:readonly number[],toOffset:number,make:(s:EditorState)=>Command,expected:string){
 const base=open(raw),from=pos(base.doc,fromPath,fromOffset),to=pos(base.doc,toPath,toOffset);
 const state=EditorState.create({doc:base.doc,selection:TextSelection.create(base.doc,from,to)});
 let tr:Transaction|undefined;
 expect(make(state)(state,t=>{tr=t})).toBe(true);
 if(!tr)throw Error('command did not dispatch');
 const r=applySourceBlockTransaction(base,tr);expect(r.ok).toBe(true);
 if(!r.ok)throw Error(r.reason);
 expect(Buffer.from(r.session.source)).toEqual(Buffer.from(expected));
 expect(r.session.doc.eq(tr.doc)).toBe(true);expect(base.source).toBe(raw);
 return {base,state,tr,r};
}
