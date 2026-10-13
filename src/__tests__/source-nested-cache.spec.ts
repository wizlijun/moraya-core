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

const actualBodies=[
 ['| H |\n| :--- |\n| 甲 |\n',[0,1,0,0],0],
 ['> | H |\n> | --- |\n> | a\\|甲 |\n',[0,0,1,0,0],2],
 ['~~~~mermaid\ngraph TD; 甲-->B\n~~~~\n',[0],10],
 ['\uFEFF---\r\ntitle: 甲\r\nother: keep\r\n---\r\n',[0],7],
 ['<div class="note">\n  甲。\n</div>\n',[0],21],
 ['    甲。\n    同句。\n',[0],0],
 ['{==保留 _甲强调_==}{>>原注<<}',[0],3],
] as const
it.each(actualBodies)('body facts survive three replay generations and a foreign session %j',(raw,path,offset)=>{
 const initial=captureFilePipeline(raw);expect(initial.ok).toBe(true)
 if(!initial.ok)throw Error(initial.reason)
 let cached=initial
 for(let i=0;i<3;i++){
  const replay=replayFilePipeline(cached.cache);expect(replay.ok).toBe(true)
  if(!replay.ok)throw Error(replay.reason)
  expect(replay.value.doc.eq(initial.value.doc)).toBe(true)
  for(const key of ['textRuns','roots','protectedSources','layout'] as const)expect(replay.value[key]).toEqual(initial.value[key])
  expect(capturedInlineBodies(raw,replay.value.doc,replay.value.roots,replay.value.layout))
   .toEqual(capturedInlineBodies(raw,initial.value.doc,initial.value.roots,initial.value.layout))
  cached=replay
 }
 const base=open(raw),p=at(base.doc,path,offset),tr=EditorState.create({doc:base.doc}).tr.insertText('乙',p,p+1)
 const snapshot=JSON.stringify(base)
 const forged={...base,textSpans:base.textSpans.map(span=>({...span,sourceFrom:span.sourceFrom+1}))}
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown')
 try{
  expect(applySourceBlockTransaction(forged,tr).ok).toBe(false)
  const result=applySourceBlockTransaction({...base},tr);expect(result.ok).toBe(true)
  if(!result.ok)throw Error(result.reason)
  expect(result.mode).toBe('exact-text');expect(result.session.source).toBe(raw.replace('甲','乙'))
  expect(result.session.doc.eq(tr.doc)).toBe(true);expect(JSON.stringify(base)).toBe(snapshot)
  expect(spy).not.toHaveBeenCalled()
 }finally{spy.mockRestore()}
})

import {prepareFileSourceEdits,type SourceSession} from '../source-fidelity'
it('shifts cached nested facts, replays remote reference changes, and never caches a rejected candidate',()=>{
 const tail='\n\nGap。\n\nGap2。\n\n| H |\n| --- |\n| 甲 |\n\n* 甲。\n\n> 甲 [label][r]。\n\n[r]: /old\n'
 const raw='Start。'+tail
 let session=open(raw)
 const verify=(next:SourceSession,expected:string)=>{
  expect(next.source).toBe(expected)
  const actual=open(expected);expect(next.doc.eq(actual.doc)).toBe(true)
  for(const key of ['textSpans','roots','gaps','protectedSources','layout'] as const)expect(next[key]).toEqual(actual[key])
  session=next
 }
 const inserted=prepareFileSourceEdits(session,{expectedRevision:session.revision,edits:[{from:6,to:6,removed:'',text:'\nMore。'}]})
 expect(inserted.ok).toBe(true);if(!inserted.ok)throw Error(inserted.reason)
 expect(['local','expanded']).toContain(inserted.file.work.mode)
 verify(inserted.session,'Start。\nMore。'+tail)
 const edit=(path:readonly number[],expected:string)=>{
  const p=at(session.doc,path),tr=EditorState.create({doc:session.doc}).tr.insertText('乙',p,p+1)
  expect(session.doc.textBetween(p,p+1)).toBe('甲')
  const result=applySourceBlockTransaction(session,tr);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason)
  expect(['local','expanded']).toContain(result.file!.work.mode);expect(result.session.doc.eq(tr.doc)).toBe(true)
  verify(result.session,expected)
 }
 edit([3,1,0,0],'Start。\nMore。\n\nGap。\n\nGap2。\n\n| H |\n| --- |\n| 乙 |\n\n* 甲。\n\n> 甲 [label][r]。\n\n[r]: /old\n')
 edit([4,0,0],'Start。\nMore。\n\nGap。\n\nGap2。\n\n| H |\n| --- |\n| 乙 |\n\n* 乙。\n\n> 甲 [label][r]。\n\n[r]: /old\n')
 const from=session.source.length-5
 expect(session.source.slice(from,from+4)).toBe('/old')
 const updated=prepareFileSourceEdits(session,{expectedRevision:session.revision,edits:[{from,to:from+4,removed:'/old',text:'/new'}]})
 expect(updated.ok).toBe(true);if(!updated.ok)throw Error(updated.reason)
 expect(updated.file.work.environmentChanged).toBe(true)
 verify(updated.session,'Start。\nMore。\n\nGap。\n\nGap2。\n\n| H |\n| --- |\n| 乙 |\n\n* 乙。\n\n> 甲 [label][r]。\n\n[r]: /new\n')
 const p=at(session.doc,[5,0]),before=JSON.stringify(session)
 const rejected=applySourceBlockTransaction(session,EditorState.create({doc:session.doc}).tr.insertText('>',p))
 expect(rejected.ok).toBe(false);expect(JSON.stringify(session)).toBe(before)
 edit([5,0],'Start。\nMore。\n\nGap。\n\nGap2。\n\n| H |\n| --- |\n| 乙 |\n\n* 乙。\n\n> 乙 [label][r]。\n\n[r]: /new\n')
 let href='';session.doc.descendants(n=>{for(const m of n.marks)if(m.type.name==='link')href=m.attrs.href})
 expect(href).toBe('/new')
})
