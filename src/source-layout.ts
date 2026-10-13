import type {SyntheticEmission} from './source-ownership'
export type LayoutContainer = Readonly<
  {kind:'gap';gapIndex:number}|{kind:'root-tail';rootId:number}>
export type BlankLineUnit = Readonly<{
  id:number;sourceFrom:number;sourceTo:number;container:LayoutContainer
}> & (Readonly<{role:'separator'}> |
  Readonly<{role:'empty-paragraph';emission:SyntheticEmission}>)
export type FallbackEmpty = Readonly<{
  kind:'empty-document-baseline';sourceAnchor:number;emission:SyntheticEmission
}>
export type SourceLayout = Readonly<{
  blankLines:readonly BlankLineUnit[];fallback?:FallbackEmpty
}>

import {sliceTrace,type SourceTrace} from './source-trace'
import {rawRange,UnsupportedOwnership,type ProtectedSource,type SourceRoot} from './source-ownership'
export type BlankDraft = {
 id:number;sourceFrom:number;sourceTo:number;container:LayoutContainer
 role:'separator'|'empty-paragraph';insertBefore:number;emission?:SyntheticEmission
}
export type LayoutRegion = {
 from:number;to:number;insertBefore:number;gapIndex:number
 left:boolean;right:boolean;previousRoot?:Pick<SourceRoot,'id'|'tailFrom'|'sourceTo'>
}
export function collectBlankDrafts(source:string,trace:SourceTrace,starts:readonly number[],
 regions:readonly LayoutRegion[],protectedSources:readonly ProtectedSource[]):BlankDraft[] {
 const result:BlankDraft[]=[]
 const protectedOrder=protectedSources // 前置collector已按source顺序验证不重叠
 const referenceStarts=new Set(protectedOrder.filter(p=>p.scope==='top-level').map(p=>p.sourceFrom))
 const referenceEnds=new Set(protectedOrder.filter(p=>p.scope==='top-level').map(p=>p.sourceTo))
 let line=0,protectedIndex=0
 for(const region of regions){
  let run:BlankDraft[]=[]
  const flush=()=>{
   if(!run.length)return
   const first=run[0]!,last=run[run.length-1]!
   const touches=referenceEnds.has(first.sourceFrom)||referenceStarts.has(last.sourceTo)
   if((region.left&&region.right)||touches)first.role='separator'
   for(const unit of run)result.push(unit);run=[]
  }
  while(line+1<starts.length&&starts[line]!<region.from)line++
  while(line+1<starts.length&&starts[line+1]!<=region.to){
   const from=starts[line]!,to=starts[line+1]!;line++
   if(to<=from||!/^[ \t]*\n$/.test(trace.text.slice(from,to))){flush();continue}
   const piece=sliceTrace(trace,from,to)
   if(piece.pieces.some(p=>p.kind==='generated')){flush();continue}
   const raw=rawRange(trace,from,to)
   if(!raw||!/^[ \t]*(?:\r\n|\r|\n)$/.test(source.slice(raw.from,raw.to))){flush();continue}
   while(protectedIndex<protectedOrder.length&&protectedOrder[protectedIndex]!.sourceTo<=raw.from)protectedIndex++
   const occupied=protectedOrder[protectedIndex]
   if(occupied&&occupied.sourceFrom<raw.to){flush();continue}
   const prev=region.previousRoot
   let container:LayoutContainer={kind:'gap',gapIndex:region.gapIndex}
   if(prev&&raw.from<prev.sourceTo){
    if(raw.from<prev.tailFrom||raw.to>prev.sourceTo)throw new UnsupportedOwnership()
    container={kind:'root-tail',rootId:prev.id}
   }
   run.push({id:0,sourceFrom:raw.from,sourceTo:raw.to,container,
    role:'empty-paragraph',insertBefore:region.insertBefore})
  }
  flush()
 }
 result.forEach((u,i)=>{u.id=i});return result
}
export function finishSourceLayout(blankLines:readonly BlankDraft[],fallback?:FallbackEmpty):SourceLayout {
 const units:BlankLineUnit[]=blankLines.map(u=>{
  const base={id:u.id,sourceFrom:u.sourceFrom,sourceTo:u.sourceTo,container:u.container}
  if(u.role==='separator')return {...base,role:'separator'}
  if(!u.emission)throw new UnsupportedOwnership()
  return {...base,role:'empty-paragraph',emission:u.emission}
 })
 return fallback?{blankLines:units,fallback}:{blankLines:units}
}
