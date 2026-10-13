import {Fragment} from 'prosemirror-model'
import type {Mark,Node as PmNode} from 'prosemirror-model'
import type {Transaction} from 'prosemirror-state'
import {AddMarkStep,RemoveMarkStep,ReplaceStep} from 'prosemirror-transform'
import type {SourceSession,TextSourceSpan} from './source-fidelity'
import type {SourceEdit} from './source-ownership'
import type {EmptyBody} from './source-empty-body'
import {capturedEmptyBodies,capturedInlineRecipeFacts,serializeSourceInlineBody,sourceFenceLength,sourceCodeDelimiter,sourceEmDelimiter} from './markdown'
export type InlineRawRange=Readonly<{from:number;to:number}>
export type InlineEdge=Readonly<{id:number;body:number;family:string;pmFrom:number;pmTo:number;open:InlineRawRange;close:InlineRawRange;marks:readonly Mark[]}>
export type InlineOccurrence=Readonly<{body:number;pmFrom:number;pmTo:number;sourceFrom:number;sourceTo:number;kind:'paragraph'|'heading'|'table-cell'}>
export type ClosedFenceBody=Readonly<{pmFrom:number;pmTo:number;sourceFrom:number;sourceTo:number;open:InlineRawRange;close:InlineRawRange;character:'`'|'~';openLength:number;closeLength:number;contentFrom:number;contentTo:number;eol:'\n'|'\r\n'|'\r';contiguousTopLevel:boolean}>
export type InlineRecipeFacts=Readonly<{bodies:readonly InlineOccurrence[];edges:readonly InlineEdge[];fences:readonly ClosedFenceBody[]}>
export type InlineRecipeResult={ok:true;edits:readonly SourceEdit[];changedBodies:readonly number[]}|{ok:false;reason:'unsupported-step'|'unmapped-range'}
export type EmptyInlineContent=Readonly<{kind:'ready';body:string}>|Readonly<{kind:'unsupported';reason:string}>
const families=['em','strong','strike_through','highlight','code','link']
function textOnly(node:PmNode):boolean {let ok=true;node.forEach(n=>{if(!n.isText||n.marks.some(m=>!families.includes(m.type.name)))ok=false});return ok}
function audit(base:SourceSession,tr:Transaction):boolean {
 if(!tr.before.eq(base.doc)||tr.docs.length!==tr.steps.length)return false
 for(let i=0;i<tr.steps.length;i++){
  const step=tr.steps[i]!,before=tr.docs[i]!,after=tr.docs[i+1]??tr.doc,p=Object.getPrototypeOf(step)
  if(p!==ReplaceStep.prototype&&p!==AddMarkStep.prototype&&p!==RemoveMarkStep.prototype)return false
  if(i===0&&!before.eq(base.doc))return false
  const result=step.apply(before);if(result.failed||!result.doc?.eq(after))return false
 }
 return true
}
export function prepareEmptyInlineContent(base:SourceSession,tr:Transaction,fact:EmptyBody):EmptyInlineContent {
 const no=():EmptyInlineContent=>({kind:'unsupported',reason:'empty-inline-chain'})
 try{
  if(!capturedEmptyBodies(base.source,base.doc,base.roots,base.layout)?.includes(fact)||!audit(base,tr))return no()
  const first=tr.steps[0]
  if(!first||Object.getPrototypeOf(first)!==ReplaceStep.prototype)return no()
  const step=first as ReplaceStep
  if((step as ReplaceStep&{structure:boolean}).structure||step.from!==fact.pmAt||step.to!==step.from||step.slice.openStart||step.slice.openEnd||!step.slice.size||fact.parent.content.size||!['paragraph','heading'].includes(fact.parent.type.name)||fact.parent!==base.doc.resolve(step.from).parent)return no()
  for(let i=1;i<tr.steps.length;i++){
   const mark=tr.steps[i]
   if(!(mark instanceof AddMarkStep||mark instanceof RemoveMarkStep)||mark.from<step.from||mark.to>step.from+step.slice.size||!families.includes(mark.mark.type.name))return no()
  }
  const parent=tr.doc.resolve(step.from).parent
  if(!parent.sameMarkup(fact.parent)||!textOnly(parent)||/[\r\n]/.test(parent.textContent))return no()
  const resolved=base.doc.resolve(fact.pmAt),cell=resolved.depth>0&&['table_cell','table_header'].includes(resolved.node(resolved.depth-1).type.name)
  const children:PmNode[]=[]
  parent.forEach(node=>children.push(cell&&node.marks.some(m=>m.type.name==='code')?node.type.schema.text(node.text!.replace(/\|/g,'\\|'),node.marks):node))
  return {kind:'ready',body:serializeSourceInlineBody(parent.copy(Fragment.fromArray(children)),cell)}
 }catch{return no()}
}
function point(span:TextSourceSpan,pos:number):number|undefined {
 return pos===span.pmFrom?span.sourceFrom:pos===span.pmTo?span.sourceTo:span.kind==='linear'?span.sourceFrom+pos-span.pmFrom:undefined
}
function rawRange(base:SourceSession,from:number,to:number):InlineRawRange|undefined {
 const spans=base.textSpans.filter(s=>from===to?s.pmFrom<=from&&s.pmTo>=to:s.pmFrom<to&&s.pmTo>from)
 if(!spans.length)return
 const a=point(spans[0]!,from),b=point(spans.at(-1)!,to)
 if(a===undefined||b===undefined||spans.some((s,i)=>i>0&&(spans[i-1]!.pmTo!==s.pmFrom||spans[i-1]!.sourceTo!==s.sourceFrom)))return
 if(from===to&&spans.some(s=>point(s,from)!==a))return
 return {from:a,to:b}
}
export function prepareClosedFenceRecipe(base:SourceSession,tr:Transaction,facts:InlineRecipeFacts):{ok:true;edits:readonly SourceEdit[]}|{ok:false;reason:'unsupported-step'|'unmapped-range'} {
 const no={ok:false,reason:'unsupported-step'} as const
 if(capturedInlineRecipeFacts(base)!==facts||!audit(base,tr)||tr.steps.length!==1||Object.getPrototypeOf(tr.steps[0])!==ReplaceStep.prototype)return no
 const step=tr.steps[0] as ReplaceStep,a=base.doc.resolve(step.from),b=base.doc.resolve(step.to)
 if(!a.sameParent(b)||a.parent.type.name!=='code_block'||(step as ReplaceStep&{structure:boolean}).structure||step.slice.openStart||step.slice.openEnd)return no
 const target=tr.doc.resolve(step.from).parent
 if(!a.parent.sameMarkup(target)||!a.parent.content.size||!textOnly(a.parent)||!textOnly(target)||target.firstChild?.marks.length)return no
 const fact=facts.fences.find(f=>f.pmFrom===a.before()&&f.pmTo===a.after())
 if(!fact)return no
 const conflict=target.textContent.split('\n').some(line=>{
  const m=/^ {0,3}(`+|~+)[ \t]*$/.exec(line);return m?.[1]?.[0]===fact.character&&m[1].length>=fact.openLength
 })
 if(!conflict)return {ok:true,edits:[]}
 if(!fact.contiguousTopLevel)return no
 const raw=rawRange(base,step.from,step.to)
 if(!raw||raw.from<fact.contentFrom||raw.to>fact.contentTo)return {ok:false,reason:'unmapped-range'}
 let text='';step.slice.content.forEach(n=>{text+=n.text??''})
 const length=sourceFenceLength(target.textContent,fact.character,fact.openLength),edits:SourceEdit[]=[]
 if(length>fact.openLength)edits.push({...fact.open,text:fact.character.repeat(length)})
 edits.push({...raw,text:text.replace(/\n/g,fact.eol)})
 if(length>fact.closeLength)edits.push({...fact.close,text:fact.character.repeat(length)})
 return {ok:true,edits}
}
type InlinePiece=Readonly<{kind:'retained';beforeFrom:number;beforeTo:number;afterFrom:number;afterTo:number}|{kind:'inserted';afterFrom:number;afterTo:number;step:number}>
type BodyWork={body:number;beforeFrom:number;beforeTo:number;afterFrom:number;afterTo:number;pieces:InlinePiece[];dirtyEdges:number[]}
type Unit={text:string;before?:number;step?:number;leaf?:PmNode;marks:readonly Mark[];raw?:InlineRawRange}
type Envelope={from:number;to:number;mark:Mark;old?:InlineEdge;open:string;close:string;keep:boolean;index:number}
type Output={raw:InlineRawRange}|{text:string}
const sameMarks=(a:readonly Mark[],b:readonly Mark[])=>a.length===b.length&&a.every((m,i)=>m.eq(b[i]!))
function escapeText(text:string,cell:boolean):string {
 return text.replace(/[\\`*_[\]{}<>~^=&|]/g,c=>c==='&'?'&amp;':c==='|'?(cell?'&#124;':'\\|'):'\\'+c)
}
function editsFromOutput(base:SourceSession,body:InlineOccurrence,output:Output[]):SourceEdit[]|undefined {
 let cursor=body.sourceFrom,pending='',edits:SourceEdit[]=[]
 for(const part of output){
  if('text' in part){pending+=part.text;continue}
  const {from,to}=part.raw
  if(from<cursor||to<from||to>body.sourceTo)return
  if(from>cursor||pending){edits.push({from:cursor,to:from,text:pending});pending=''}
  cursor=to
 }
 if(cursor<body.sourceTo||pending)edits.push({from:cursor,to:body.sourceTo,text:pending})
 return edits.filter(e=>base.source.slice(e.from,e.to)!==e.text)
}
export function prepareInlineRecipe(base:SourceSession,tr:Transaction,facts:InlineRecipeFacts):InlineRecipeResult {
 const no={ok:false,reason:'unsupported-step'} as const,unmapped={ok:false,reason:'unmapped-range'} as const
 if(capturedInlineRecipeFacts(base)!==facts||!audit(base,tr))return no
 try{
  const work:BodyWork[]=facts.bodies.map(b=>({body:b.body,beforeFrom:b.pmFrom,beforeTo:b.pmTo,afterFrom:b.pmFrom,afterTo:b.pmTo,pieces:[{kind:'retained',beforeFrom:b.pmFrom,beforeTo:b.pmTo,afterFrom:b.pmFrom,afterTo:b.pmTo}],dirtyEdges:[]}))
  const units=new Map<number,Unit[]>(),changed=new Set<number>()
  for(const b of facts.bodies){
   const list:Unit[]=[]
   base.doc.resolve(b.pmFrom).parent.forEach((node,offset)=>{
    for(let i=0;i<node.nodeSize;i++){
     const before=b.pmFrom+offset+i
     const span=base.textSpans.find(s=>s.pmFrom<=before&&s.pmTo>before)
     const from=span&&point(span,before),to=span&&point(span,before+1)
     list.push({text:node.isText?node.text![i]!:'',before,marks:node.marks,...(from!==undefined&&to!==undefined?{raw:{from,to}}:{})})
    }
   });units.set(b.body,list)
  }
  for(let i=0;i<tr.steps.length;i++){
   const step=tr.steps[i] as ReplaceStep|AddMarkStep|RemoveMarkStep,before=tr.docs[i]!,after=tr.docs[i+1]??tr.doc
   if(step instanceof ReplaceStep){
    const a=before.resolve(step.from),z=before.resolve(step.to)
    if(!a.sameParent(z)||!a.parent.inlineContent||step.slice.openStart||step.slice.openEnd||(step as ReplaceStep&{structure:boolean}).structure)return no
    const body=work.find(w=>w.afterFrom<=step.from&&w.afterTo>=step.to)
    if(!body)return no
    let inserted:Unit[]=[],valid=true
    step.slice.content.forEach(n=>{
     if(n.type.name==='hardbreak'&&n.attrs.isInline===true&&!n.marks.length){inserted.push({text:'\n',leaf:n,marks:n.marks,step:i});return}
     if(!n.isText||n.marks.some(m=>!families.includes(m.type.name)))valid=false
     for(const text of (n.text??'').split(''))inserted.push({text,marks:n.marks,step:i})
    })
    if(!valid)return no
    const list=units.get(body.body)!,start=step.from-body.afterFrom,end=step.to-body.afterFrom
    if(list.slice(start,end).some(u=>!u.text))return no
    list.splice(start,end-start,...inserted);changed.add(body.body)
    const map=step.getMap()
    for(const w of work){
     w.afterFrom=map.map(w.afterFrom,-1);w.afterTo=map.map(w.afterTo,1)
     // Standard maps witness retained/inserted ranges; the original coordinates
     // remain attached to each retained unit throughout the complete chain.
     w.pieces=units.get(w.body)!.map((u,k)=>u.before===undefined?{kind:'inserted',afterFrom:w.afterFrom+k,afterTo:w.afterFrom+k+1,step:u.step!}:{kind:'retained',beforeFrom:u.before,beforeTo:u.before+1,afterFrom:w.afterFrom+k,afterTo:w.afterFrom+k+1})
    }
   }else{
    if(!families.includes(step.mark.type.name))return no
    let valid=true
    before.nodesBetween(step.from,step.to,(n,pos)=>{
     if(!n.isInline)return
     if(!n.isText){valid=false;return false}
     const lo=Math.max(pos,step.from),hi=Math.min(pos+n.nodeSize,step.to)
     const w=work.find(w=>w.afterFrom<=lo&&w.afterTo>=hi)
     if(!w){valid=false;return false}
     const list=units.get(w.body)!
     for(let k=lo;k<hi;k++){
      const u=list[k-w.afterFrom]!,next=step instanceof AddMarkStep?step.mark.addToSet(u.marks):step.mark.removeFromSet(u.marks)
      if(!sameMarks(u.marks,next)){u.marks=next;changed.add(w.body)}
     }
    })
    if(!valid)return no
   }
   for(const w of work){
    const node=after.resolve(w.afterFrom).parent,original=base.doc.resolve(w.beforeFrom).parent
    if(!node.sameMarkup(original)||node.content.size!==w.afterTo-w.afterFrom)return no
   }
  }
  const edits:SourceEdit[]=[]
  for(const id of changed){
   const body=facts.bodies.find(b=>b.body===id)!,w=work.find(b=>b.body===id)!,list=units.get(id)!,old=facts.edges.filter(e=>e.body===id)
   const target=tr.doc.resolve(w.afterFrom).parent
   // Verify every projected unit against the actual final document, including
   // full Mark objects and attributes, before constructing source events.
   let offset=0,valid=true
   target.forEach(n=>{for(let j=0;j<n.nodeSize;j++,offset++){const u=list[offset];if(!u||u.text!==(n.isText?n.text![j]!:u.leaf?.eq(n)?'\n':'')||!sameMarks(u.marks,n.marks))valid=false}})
   if(!valid)return no
   const ranges:Envelope[]=[]
   for(let at=0;at<list.length;at++)for(const mark of list[at]!.marks){
    if(!families.includes(mark.type.name)){
     if(list[at]!.before===undefined)return no
     continue
    }
    if(at>0&&mark.isInSet(list[at-1]!.marks))continue
    let end=at+1;while(end<list.length&&mark.isInSet(list[end]!.marks))end++
    const candidates=old.filter(e=>e.family===mark.type.name&&e.marks.some(m=>m.eq(mark)))
    const exact=candidates.find(e=>[-1,1].some(assoc=>tr.mapping.map(e.pmFrom,assoc)===w.afterFrom+at)&&[-1,1].some(assoc=>tr.mapping.map(e.pmTo,assoc)===w.afterFrom+end))
    const ancestor=exact??candidates.find(e=>list.slice(at,end).some(u=>u.before!==undefined&&e.pmFrom<=u.before&&u.before<e.pmTo))
    let open='',close='',keep=!!exact
    if(ancestor){open=base.source.slice(ancestor.open.from,ancestor.open.to);close=base.source.slice(ancestor.close.from,ancestor.close.to)}
    if(!open){
     switch(mark.type.name){
      case 'strong':open=close='**';break
      case 'em':{let index=0,size=0;target.forEach((n,_off,i)=>{if(size<=at)index=i;size+=n.nodeSize});open=close=sourceEmDelimiter(mark,target,index,true);break}
      case 'strike_through':open=close='~~';break
      case 'highlight':open=close=mark.attrs.delimiter==='equals'?'==':'^^';break
      case 'link':open='[';close=']('+String(mark.attrs.href).replace(/[\\()]/g,'\\$&')+(mark.attrs.title?' "'+String(mark.attrs.title).replace(/[\\"]/g,'\\$&')+'"':'')+')';break
      case 'code':break
     }
    }
    if(mark.type.name==='code'){
     const text=list.slice(at,end).map(u=>u.text).join(''),node=target.type.schema.text(text,[mark])
     const generatedOpen=sourceCodeDelimiter(node,true),generatedClose=sourceCodeDelimiter(node,false)
     const currentLength=/^`+/.exec(open)?.[0].length??0,max=Math.max(0,...(text.match(/`+/g)??[]).map(r=>r.length))
     if(!currentLength||max>=currentLength){open=generatedOpen;close=generatedClose;keep=false}
     else{
      const left=open.slice(currentLength),right=close.slice(0,close.length-currentLength)
      const decoded=(left+text+right).replace(/\n/g,' ').replace(/^ (.+) $/,'$1')
      if(decoded!==text){const padding=generatedOpen.endsWith(' ')?' ':'';open='`'.repeat(currentLength)+padding;close=padding+'`'.repeat(currentLength);keep=false}
     }
    }
    if(!keep&&/^_+$/.test(open)&&(!/^[ \t]/.test(list[at]!.text)&&at>0&&/[\p{L}\p{N}]/u.test(list[at-1]!.text)||!/[ \t]$/.test(list[end-1]!.text)&&end<list.length&&/[\p{L}\p{N}]/u.test(list[end]!.text))){open=close='*'.repeat(open.length)}
    ranges.push({from:at,to:end,mark,...(ancestor?{old:ancestor}:{}),open,close,keep,index:ranges.length})
   }
   for(const edge of old)if(!families.includes(edge.family)){
    const mark=edge.marks.find(m=>m.type.name===edge.family),from=tr.mapping.map(edge.pmFrom,-1)-w.afterFrom,to=tr.mapping.map(edge.pmTo,1)-w.afterFrom
    if(!mark||from<0||to>list.length||list.slice(from,to).some(u=>!mark.isInSet(u.marks)))return no
    ranges.push({from,to,mark,old:edge,open:'',close:'',keep:true,index:ranges.length})
   }
   // An unchanged adjacent source occurrence is not coalescing permission.
   // Preserve separate envelopes when a continuous final mark still contains
   // multiple original occurrences with their original attributes and bounds.
   for(let i=ranges.length-1;i>=0;i--){
    const r=ranges[i]!,matches=old.filter(e=>e.family===r.mark.type.name&&e.marks.some(m=>m.eq(r.mark)))
    const parts=matches.map(e=>({e,from:list.findIndex(u=>u.before===e.pmFrom),last:list.findIndex(u=>u.before===e.pmTo-1)})).filter(p=>p.from>=r.from&&p.last<r.to&&p.last>=p.from).sort((a,b)=>a.from-b.from)
    if(parts.length>1&&parts[0]!.from===r.from&&parts.at(-1)!.last+1===r.to&&parts.every((p,j)=>!j||parts[j-1]!.last+1===p.from)){
     ranges.splice(i,1,...parts.map(p=>({...r,from:p.from,to:p.last+1,old:p.e,keep:true,open:base.source.slice(p.e.open.from,p.e.open.to),close:base.source.slice(p.e.close.from,p.e.close.to)})))
    }
   }
   w.dirtyEdges=old.filter(e=>!ranges.some(r=>r.keep&&r.old===e)).map(e=>e.id)
   const claimed=[...old.flatMap(e=>[e.open,e.close]),...list.flatMap(u=>u.raw?[u.raw]:[]),...base.textSpans.filter(s=>s.pmFrom>=body.pmFrom&&s.pmTo<=body.pmTo).map(s=>({from:s.sourceFrom,to:s.sourceTo}))].sort((a,b)=>a.from-b.from)
   const gaps:{raw:InlineRawRange;before:number}[]=[];let cursor=body.sourceFrom
   for(const raw of claimed){if(raw.from>cursor){const next=base.textSpans.find(s=>s.sourceFrom>=raw.from&&s.pmFrom>=body.pmFrom&&s.pmTo<=body.pmTo);gaps.push({raw:{from:cursor,to:raw.from},before:next?.pmFrom??body.pmTo})}cursor=Math.max(cursor,raw.to)}
   if(cursor<body.sourceTo)gaps.push({raw:{from:cursor,to:body.sourceTo},before:body.pmTo})
   const adjacentEntities=new Set<number>()
   for(const r of ranges)if(!r.keep&&['em','strong','strike_through','highlight'].includes(r.mark.type.name)){
    // Encoding an inner boundary space ends in ';' (punctuation). The
    // installed delimiter flanking rule then also needs an outer punctuation
    // neighbour. Encode exactly that adjacent scalar, retaining its PM marks.
    if(/^[ \t]$/.test(list[r.to-1]!.text)&&r.to<list.length&&!/[\s\p{P}\p{S}]/u.test(list[r.to]!.text))adjacentEntities.add(r.to)
    if(/^[ \t]$/.test(list[r.from]!.text)&&r.from>0&&!/[\s\p{P}\p{S}]/u.test(list[r.from-1]!.text)){
     let at=r.from-1;if(/[\uDC00-\uDFFF]/.test(list[at]!.text)&&at>0&&/[\uD800-\uDBFF]/.test(list[at-1]!.text))at--
     adjacentEntities.add(at)
    }
   }
   const output:Output[]=[],emittedGaps=new Set<number>()
   const nesting=(a:Envelope,b:Envelope)=>a.from-b.from||b.to-a.to||(a.old&&b.old?a.old.open.from-b.old.open.from:Object.keys(target.type.schema.marks).indexOf(a.mark.type.name)-Object.keys(target.type.schema.marks).indexOf(b.mark.type.name))
   const ordered=ranges.slice().sort(nesting)
   for(let at=0;at<=list.length;at++){
    for(const r of ordered.filter(r=>r.to===at).reverse())output.push(r.keep?{raw:r.old!.close}:{text:r.close})
    for(let g=0;g<gaps.length;g++)if(!emittedGaps.has(g)&&(at===list.length||list[at]!.before!==undefined&&gaps[g]!.before<=list[at]!.before!)){output.push({raw:gaps[g]!.raw});emittedGaps.add(g)}
    for(const r of ordered.filter(r=>r.from===at))output.push(r.keep?{raw:r.old!.open}:{text:r.open})
    if(at===list.length)break
    const u=list[at]!,code=u.marks.some(m=>m.type.name==='code')
    const edgeSpace=!code&&/^[ \t]$/.test(u.text)&&((u.before===undefined&&(list.slice(list.slice(0,at).map(x=>x.text).lastIndexOf('\n')+1,at+1).every(x=>/^[ \t]$/.test(x.text))||list.slice(at,list.findIndex((x,i)=>i>at&&x.text==='\n')<0?undefined:list.findIndex((x,i)=>i>at&&x.text==='\n')).every(x=>/^[ \t]$/.test(x.text))))||ranges.some(r=>!r.keep&&['em','strong','strike_through','highlight'].includes(r.mark.type.name)&&r.from<=at&&at<r.to&&(list.slice(r.from,at+1).every(x=>/^[ \t]$/.test(x.text))||list.slice(at,r.to).every(x=>/^[ \t]$/.test(x.text)))))
    if(adjacentEntities.has(at)){
     const scalar=(u.text+(list[at+1]?.text??'')).codePointAt(0)!
     output.push({text:'&#'+scalar+';'})
     if(scalar>0xffff)at++
     continue
    }
    if(edgeSpace){output.push({text:u.text===' '?'&#32;':'&#9;'});continue}
    if(u.before!==undefined){
     if(!u.raw){
      const span=base.textSpans.find(s=>s.kind==='atomic'&&s.pmFrom===u.before)
      if(!span)return unmapped
      const count=span.pmTo-span.pmFrom,group=list.slice(at,at+count)
      if(group.length!==count||group.some((x,i)=>x.before!==span.pmFrom+i||!sameMarks(x.marks,u.marks))||ranges.some(r=>r.from>at&&r.from<at+count||r.to>at&&r.to<at+count))return unmapped
      output.push({raw:{from:span.sourceFrom,to:span.sourceTo}});at+=count-1
     }else output.push({raw:u.raw})
    }
    else output.push({text:code?(body.kind==='table-cell'?u.text.replace(/\|/g,'\\|'):u.text):escapeText(u.text,body.kind==='table-cell')})
   }
   const bodyEdits=editsFromOutput(base,body,output)
   if(!bodyEdits)return unmapped
   edits.push(...bodyEdits)
  }
  edits.sort((a,b)=>a.from-b.from||a.to-b.to)
  if(edits.some((e,i)=>i>0&&edits[i-1]!.to>e.from))return no
  return {ok:true,edits,changedBodies:[...changed]}
 }catch{return no}
}
