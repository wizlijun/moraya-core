import {expect,it,vi} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {captureFilePipeline,replayFilePipeline,capturedInlineBodies} from '../markdown'
import * as markdown from '../markdown'
import {applySourceBlockTransaction} from '../source-fidelity'
import {at,open} from './source-nested-test-utils'

it('re-emits all nested provenance for three cached generations',()=>{
 const raw='> [ref]: /u\r\n>\r\n> 甲。\r\n\r\n*   甲。\r\n'
 const initial=captureFilePipeline(raw);expect(initial.ok).toBe(true)
 if(!initial.ok)throw Error(initial.reason)
 let cached=initial
 for(let i=0;i<3;i++){
  const replay=replayFilePipeline(cached.cache);expect(replay.ok).toBe(true)
  if(!replay.ok)throw Error(replay.reason)
  expect(replay.value.doc.eq(initial.value.doc)).toBe(true)
  for(const key of ['textRuns','roots','protectedSources','layout'] as const)
   expect(replay.value[key]).toEqual(initial.value[key])
  expect(capturedInlineBodies(raw,replay.value.doc,replay.value.roots,replay.value.layout))
   .toEqual(capturedInlineBodies(raw,initial.value.doc,initial.value.roots,initial.value.layout))
  cached=replay
 }
 const base=open(raw),p=at(base.doc,[0,0])
 const result=applySourceBlockTransaction({...base},EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1))
 expect(result.ok).toBe(true)
 if(result.ok){expect(result.mode).toBe('exact-text');expect(result.session.source).toBe(raw.replace('甲','乙'))}
})
for(const key of ['sourceFrom','sourceTo','pmFrom','pmTo','kind'] as const)it(`rejects foreign tampered textSpans.${key} before rendering, then retries`,()=>{
 const base=open('> 甲。\n'),p=at(base.doc,[0,0]),tr=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1)
 const spans=base.textSpans.map((span,i)=>i?span:{...span,[key]:key==='kind'?'atomic':span[key]+1})
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown')
 try{
  expect(applySourceBlockTransaction({...base,textSpans:spans},tr).ok).toBe(false)
  expect(spy).not.toHaveBeenCalled()
  const valid=applySourceBlockTransaction({...base},tr);expect(valid.ok).toBe(true)
  if(valid.ok){expect(valid.mode).toBe('exact-text');expect(valid.session.source).toBe('> 乙。\n')}
 }finally{spy.mockRestore()}
})

import {emptyFileParseWork,prepareVerifiedFileBase,preparePreservingSourceCandidate} from '../source-file-cache'
import {parseMarkdown} from '../markdown'
it.each([
 ['[ref]: /u\n\nAlpha','Alpha'],
 ['Alpha','[ref]: /u\n\nAlpha'],
 ['[ref]: /u\n\nAlpha','[ref]: /u\n[ref]: /u\n\nAlpha'],
 ['> [ref]: /u\n>\n> Alpha','[ref]: /u\n\n> Alpha'],
])('rejects protected collection loss/addition/duplicate/scope changes %j',(raw,target)=>{
 const base=open(raw),before=JSON.stringify(base),work=emptyFileParseWork(),verified=prepareVerifiedFileBase(base,work)
 if('ok' in verified)throw Error(verified.reason)
 const result=preparePreservingSourceCandidate(verified,[{from:0,to:raw.length,removed:raw,text:target}],work,parseMarkdown(target))
 expect(result.ok).toBe(false);expect(JSON.stringify(base)).toBe(before)
})
it('preserves unused duplicate definitions at shifted kept-piece positions',()=>{
 const raw='> Alpha\n>\n> [ref]: /u\n> [ref]: /v\n\nTail',base=open(raw),p=at(base.doc,[0,0])
 expect(base.protectedSources).toHaveLength(2)
 const tr=EditorState.create({doc:base.doc}).tr.addMark(p,p+5,base.doc.type.schema.marks.strong!.create())
 const result=applySourceBlockTransaction(base,tr);expect(result.ok).toBe(true)
 if(!result.ok)throw Error(result.reason)
 expect(result.mode).toBe('fragment-render');expect(result.session.source).toBe(raw.replace('Alpha','**Alpha**'))
 expect(result.session.protectedSources).toEqual(base.protectedSources.map(r=>({...r,sourceFrom:r.sourceFrom+4,sourceTo:r.sourceTo+4})))
})
it('rejects a newly consumed duplicate even when every old protected byte is kept',()=>{
 const raw='[ref]: /u\n\nAlpha',base=open(raw),work=emptyFileParseWork(),verified=prepareVerifiedFileBase(base,work)
 if('ok' in verified)throw Error(verified.reason)
 const text='[ref]: /v\n',from=raw.indexOf('\n')+1,target=raw.slice(0,from)+text+raw.slice(from)
 const result=preparePreservingSourceCandidate(verified,[{from,to:from,removed:'',text}],work,parseMarkdown(target))
 expect(result.ok).toBe(false);expect(base.source).toBe(raw)
})
