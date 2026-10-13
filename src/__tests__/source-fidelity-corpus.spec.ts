// @vitest-environment node
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import type {Node as PmNode} from 'prosemirror-model'
import {createSourceSession,applySourceTextTransaction} from '../source-fidelity'
const dir=fileURLToPath(new URL('./fixtures/source-fidelity/',import.meta.url))
const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')) as {name:string;sha256:string;bytes:number;target:number}[]
function open(source:string) { const r=createSourceSession(source); if(!r.ok)throw new Error(r.reason);return r.session }
function target(doc:PmNode) {
 const found:number[]=[]
 doc.descendants((n,p)=>{if(n.isText){const at=n.text!.indexOf('目标甲');if(at>=0)found.push(p+at+2)}})
 expect(found).toHaveLength(1);return found[0]!
}
for(const f of manifest) it(`${f.name}: core reopen bytes and exact one-char splice`,()=>{
 const raw=readFileSync(join(dir,f.name+'.md')), source=raw.toString('utf8')
 expect(raw.length).toBe(f.bytes)
 expect(createHash('sha256').update(raw).digest('hex')).toBe(f.sha256)
 let current=source
 for(let n=0;n<3;n++){current=open(current).source;expect(Buffer.from(current)).toEqual(raw)}
 const base=open(source),p=target(base.doc)
 const tr=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1)
 const next=applySourceTextTransaction(base,tr)
 expect(next.ok).toBe(true);if(!next.ok)throw new Error(next.reason)
 const expected=source.slice(0,f.target)+'乙'+source.slice(f.target+1)
 expect(Buffer.from(next.session.source)).toEqual(Buffer.from(expected))
 expect(next.session.doc.eq(tr.doc)).toBe(true)
 expect(next.session.revision).toBe(1)
 expect(base.source).toBe(source)
})
