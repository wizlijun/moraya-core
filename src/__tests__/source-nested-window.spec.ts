import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {applySourceBlockTransaction} from '../source-fidelity'
import {open,at} from './source-nested-test-utils'

const families=[
 ['quote','> [r]: /u\n>\n> 甲。\n','> [r]: /u\n>\n> 乙。\n',[0],true],
 ['list','*   甲。\n','*   乙。\n',[0,0],true],
 ['footnote','[^n]: 甲。\n','[^n]: 乙。\n',[0],true],
 ['table','| H | J |\n| :--- | ---: |\n| 甲 | keep |\n','| H | J |\n| :--- | ---: |\n| 乙 | keep |\n',[1,0,0],false],
 ['ATX','###   甲。   ###\n','###   乙。   ###\n',[],false],
 ['setext','甲。\n====\n','乙。\n====\n',[],false],
] as const
for(const [name,body,changed,path,nested] of families)it(`bounds actual ${name} parsing equally for 100/1000 roots`,()=>{
 const counters=[]
 for(const count of [100,1000]){
  const prefix=Array.from({length:count},(_,i)=>`P${i}。\n\n`).join('')
  const tail='\nTail。\n\n[r2]: /far\n',raw=prefix+body+tail,expected=prefix+changed+tail
  const b=open(raw),p=at(b.doc,[count,...path])
  expect(b.doc.textBetween(p,p+1)).toBe('甲')
  const tr=EditorState.create({doc:b.doc}).tr.insertText('乙',p,p+1)
  const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
  expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true)
  expect(r.session.protectedSources).toEqual(b.protectedSources)
  const w=r.file!.work
  console.log(JSON.stringify({name,count,work:w}))
  expect(['local','expanded']).toContain(w.mode)
  expect(w.fullCaptureCalls).toBe(0);expect(w.legacyParseCalls).toBe(0)
  expect(w.blockParseCalls).toBe(1);expect(w.topLevelRunnerCalls).toBe(1)
  expect(w.rawTouchedBeforeRoots).toEqual([count]);expect(w.inlineRoots.length).toBeLessThanOrEqual(3)
  if(nested)expect(w.nestedTokenizeCalls).toBeGreaterThan(0)
  expect(w.blockRuleCalls).toBeLessThanOrEqual(250);expect(w.blockLinesVisited).toBeLessThanOrEqual(1500)
  counters.push([w.blockRuleCalls,w.blockLinesVisited])
 }
 expect(counters[0]).toEqual(counters[1])
})
