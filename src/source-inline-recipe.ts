import {Fragment} from 'prosemirror-model'
import type {Mark,Node as PmNode} from 'prosemirror-model'
import type {Transaction} from 'prosemirror-state'
import {AddMarkStep,RemoveMarkStep,ReplaceStep,AttrStep,AddNodeMarkStep,RemoveNodeMarkStep} from 'prosemirror-transform'
import type {SourceSession,TextSourceSpan} from './source-fidelity'
import type {SourceEdit,ProtectedSource} from './source-ownership'
import type {EmptyBody} from './source-empty-body'
import {capturedEmptyBodies,capturedInlineRecipeFacts,serializeSourceInlineBody,sourceFenceLength,sourceCodeDelimiter,sourceEmDelimiter} from './markdown'
export type InlineRawRange=Readonly<{from:number;to:number}>
export type InlineEdge=Readonly<{id:number;body:number;family:string;pmFrom:number;pmTo:number;open:InlineRawRange;close:InlineRawRange;marks:readonly Mark[]}>
export type InlineOccurrence=Readonly<{body:number;pmFrom:number;pmTo:number;sourceFrom:number;sourceTo:number;kind:'paragraph'|'heading'|'table-cell'}>
export type ClosedFenceBody=Readonly<{pmFrom:number;pmTo:number;sourceFrom:number;sourceTo:number;open:InlineRawRange;close:InlineRawRange;character:'`'|'~';openLength:number;closeLength:number;contentFrom:number;contentTo:number;eol:'\n'|'\r\n'|'\r';contiguousTopLevel:boolean}>
export type InlineAtomOccurrence=Readonly<{body:number;pmFrom:number;pmTo:number;sourceFrom:number;sourceTo:number;node:PmNode}>
export type CriticPayload=Readonly<{id:number;body:number;kind:'annotation'|'note_anchor';pmFrom:number;pmTo:number;syntaxFrom:number;syntaxTo:number;noteFrom:number;noteTo:number;note:string;open?:InlineRawRange;middle?:InlineRawRange;close:InlineRawRange}>
export type InlineRecipeFacts=Readonly<{definitionSeparators:readonly Readonly<{body:number;side:'before'|'after';definition:ProtectedSource;range:InlineRawRange}>[];separators:readonly Readonly<{left:number;right:number;range:InlineRawRange}>[];critic:readonly CriticPayload[];atoms:readonly InlineAtomOccurrence[];bodies:readonly InlineOccurrence[];edges:readonly InlineEdge[];fences:readonly ClosedFenceBody[]}>
export type InlineRecipeResult={ok:true;edits:readonly SourceEdit[];changedBodies:readonly number[]}|{ok:false;reason:'unsupported-step'|'unmapped-range'}
export type EmptyInlineContent=Readonly<{kind:'ready';body:string}>|Readonly<{kind:'unsupported';reason:string}>
const families=['em','strong','strike_through','highlight','code','link','annotation']
function canonicalNote(node:PmNode):boolean {
 return node.type===node.type.schema.nodes.note_anchor&&node.isLeaf&&node.nodeSize===1&&typeof node.attrs.note==='string'&&!/[\r\n]|<<}/.test(node.attrs.note)&&node.eq(node.type.create({note:node.attrs.note},null,node.marks))
}
function canonicalMath(node:PmNode):boolean {
 return node.type===node.type.schema.nodes.math_inline&&node.hasMarkup(node.type)&&node.childCount===1
  &&node.firstChild!.isText&&!node.firstChild!.marks.length&&!!node.textContent&&!/[\r\n$]/.test(node.textContent)
}
export function canonicalImage(node:PmNode):boolean {
 return node.type===node.type.schema.nodes.image&&node.isInline&&node.isLeaf&&node.nodeSize===1
  &&['src','alt','title'].every(key=>typeof node.attrs[key]==='string'&&!/[\r\n]/.test(node.attrs[key]))
  &&node.eq(node.type.create({src:node.attrs.src,alt:node.attrs.alt,title:node.attrs.title},null,node.marks))
}
export function imageStepRange(doc:PmNode,step:Transaction['steps'][number]):InlineRawRange|undefined {
 const p=Object.getPrototypeOf(step)
 if(p!==AttrStep.prototype&&p!==AddNodeMarkStep.prototype&&p!==RemoveNodeMarkStep.prototype)return
 const s=step as AttrStep|AddNodeMarkStep|RemoveNodeMarkStep
 if(!Number.isInteger(s.pos)||s.pos<0||s.pos>=doc.content.size)return
 const node=doc.nodeAt(s.pos)
 if(node&&canonicalImage(node)&&(!(s instanceof AttrStep)||['src','alt','title'].includes(s.attr)))return {from:s.pos,to:s.pos+1}
}
function canonicalAnnotation(mark:Mark):boolean {return mark.type.name!=='annotation'||typeof mark.attrs.note==='string'&&!/[\r\n]|<<}/.test(mark.attrs.note)&&mark.eq(mark.type.create({note:mark.attrs.note}))}
function textOnly(node:PmNode,images=false):boolean {let ok=true;node.forEach(n=>{if(!(n.isText||images&&canonicalImage(n))||n.marks.some(m=>!families.includes(m.type.name)))ok=false});return ok}
function audit(base:SourceSession,tr:Transaction):boolean {
 if(!tr.before.eq(base.doc)||tr.docs.length!==tr.steps.length)return false
 for(let i=0;i<tr.steps.length;i++){
  const step=tr.steps[i]!,before=tr.docs[i]!,after=tr.docs[i+1]??tr.doc,p=Object.getPrototypeOf(step)
  if(p!==ReplaceStep.prototype&&p!==AddMarkStep.prototype&&p!==RemoveMarkStep.prototype&&!imageStepRange(before,step))return false
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
  if(tr.steps.length===1&&step.slice.content.childCount===1&&canonicalNote(step.slice.content.firstChild!)&&!step.slice.content.firstChild!.marks.length&&parent.sameMarkup(fact.parent)&&parent.content.eq(step.slice.content))return {kind:'ready',body:'{>>'+parent.firstChild!.attrs.note+'<<}'}
  if(!parent.sameMarkup(fact.parent)||!textOnly(parent,true)||/[\r\n]/.test(parent.textContent))return no()
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
type Unit={text:string;before?:number;beforeCode?:boolean;step?:number;leaf?:PmNode;image?:PmNode;math?:{node:PmNode};atom?:InlineAtomOccurrence;marks:readonly Mark[];raw?:InlineRawRange}
type Envelope={from:number;to:number;mark:Mark;old?:InlineEdge;open:string;close:string;keep:boolean;index:number}
type Output={raw:InlineRawRange}|{text:string}
const sameMarks=(a:readonly Mark[],b:readonly Mark[])=>a.length===b.length&&a.every((m,i)=>m.eq(b[i]!))
function escapeText(text:string,cell:boolean,fromCode=false):string {
 return text.replace(fromCode?/[\\`*_[\]{}<>~^=&|#$+.)-]/g:/[\\`*_[\]{}<>~^=&|]/g,c=>c==='&'?'&amp;':c==='|'?(cell?'&#124;':'\\|'):'\\'+c)
}
function encodeCodeContext(text:string,code:boolean,cell:boolean):string {
 // Leaving code also exposes block markers and math delimiters.
 return code?(cell?text.replace(/\|/g,'\\|'):text):escapeText(text,cell,true)
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
function noteEdit(base:SourceSession,fact:CriticPayload,note:string):SourceEdit {
 const old=base.source.slice(fact.noteFrom,fact.noteTo);let left=0,right=0
 while(left<old.length&&left<note.length&&old[left]===note[left])left++
 if(left>0&&/[\uD800-\uDBFF]/.test(old[left-1]!)&&/[\uDC00-\uDFFF]/.test(old[left]??''))left--
 while(right<old.length-left&&right<note.length-left&&old[old.length-1-right]===note[note.length-1-right])right++
 if(right>0&&/[\uD800-\uDBFF]/.test(old[old.length-right-1]??'')&&/[\uDC00-\uDFFF]/.test(old[old.length-right]??''))right--
 return {from:fact.noteFrom+left,to:fact.noteTo-right,text:note.slice(left,note.length-right)}
}
function emptyBodyEdits(base:SourceSession,facts:InlineRecipeFacts,body:InlineOccurrence,contentTo:number):SourceEdit[] {
 const edits:SourceEdit[]=[]
 const separator=facts.separators.find(s=>s.right===body.body)??facts.separators.find(s=>s.left===body.body)
 const definitionSeparator=facts.definitionSeparators.find(s=>s.body===body.body&&s.side==='after')
 if(separator)edits.push({...separator.range,text:''})
 else if(definitionSeparator)edits.push({...definitionSeparator.range,text:''})
 // A top-level paragraph owns this exact terminal EOL. Once its only
 // leaf is gone, retaining that EOL would introduce another empty paragraph.
 const root=base.roots.find(r=>r.tokenType==='paragraph_open'&&r.pmFrom+1===body.pmFrom&&r.pmTo-1===body.pmTo&&r.tailFrom===body.sourceTo&&contentTo===r.tailFrom)
 if(root&&/^(?:\r\n|\r|\n)$/.test(base.source.slice(root.tailFrom,root.sourceTo)))edits.push({from:root.tailFrom,to:root.sourceTo,text:''})
 return edits
}
function preparePointRecipe(base:SourceSession,tr:Transaction,facts:InlineRecipeFacts):InlineRecipeResult|undefined {
 const no={ok:false,reason:'unsupported-step'} as const
 const touches=tr.steps.some(s=>s instanceof ReplaceStep&&(facts.critic.some(c=>c.kind==='note_anchor'&&s.from<c.pmTo&&s.to>c.pmFrom)||s.slice.content.firstChild?.type.name==='note_anchor'))
 if(!touches)return
 if(tr.steps.length!==1||Object.getPrototypeOf(tr.steps[0])!==ReplaceStep.prototype)return no
 const step=tr.steps[0] as ReplaceStep,a=base.doc.resolve(step.from),b=base.doc.resolve(step.to)
 if(!a.sameParent(b)||step.slice.openStart||step.slice.openEnd||(step as ReplaceStep&{structure:boolean}).structure)return no
 const fact=facts.critic.find(c=>c.kind==='note_anchor'&&c.pmFrom===step.from&&c.pmTo===step.to)
 const next=step.slice.content.firstChild
 if(fact){
  const old=base.doc.nodeAt(step.from)!
  if(!canonicalNote(old))return no
  if(!step.slice.size){
   const body=facts.bodies.find(b=>b.body===fact.body)!
   // These actual wrappers covered only the deleted leaf, so none of their
   // content survives. Wrappers shared with neighbouring content stay intact.
   const emptyEdges=facts.edges.filter(e=>e.body===fact.body&&e.pmFrom===fact.pmFrom&&e.pmTo===fact.pmTo&&e.marks.some(m=>m.type.name===e.family&&m.isInSet(old.marks)))
   const edits:SourceEdit[]=[{from:fact.syntaxFrom,to:fact.syntaxTo,text:''},...emptyEdges.flatMap(e=>[{...e.open,text:''},{...e.close,text:''}])]
   const contentTo=Math.max(fact.syntaxTo,...emptyEdges.map(e=>e.close.to))
   if(body.pmFrom===fact.pmFrom&&body.pmTo===fact.pmTo&&a.parent.type.name==='paragraph'){
    edits.push(...emptyBodyEdits(base,facts,body,contentTo))
   }
   edits.sort((x,y)=>x.from-y.from);return {ok:true,edits,changedBodies:[fact.body]}
  }
  if(step.slice.content.childCount!==1||!next||!canonicalNote(next)||next.type!==old.type||!sameMarks(next.marks,old.marks))return no
  return {ok:true,edits:[noteEdit(base,fact,next.attrs.note)],changedBodies:[fact.body]}
 }
 if(step.slice.content.childCount!==1||!next||!canonicalNote(next)||next.marks.length)return no
 if(step.from!==step.to){
  let plain=true
  a.parent.nodesBetween(a.parentOffset,b.parentOffset,node=>{if(!node.isText||node.marks.length)plain=false})
  if(!plain||facts.critic.some(c=>step.from<c.pmTo&&step.to>c.pmFrom)||facts.atoms.some(c=>step.from<c.pmTo&&step.to>c.pmFrom))return no
 }
 const body=facts.bodies.find(f=>f.pmFrom<=step.from&&f.pmTo>=step.to),range=rawRange(base,step.from,step.to)
 if(!body||!range||range.from<body.sourceFrom||range.to>body.sourceTo)return no
 return {ok:true,edits:[{...range,text:'{>>'+next.attrs.note+'<<}'}],changedBodies:[body.body]}
}
export function prepareInlineRecipe(base:SourceSession,tr:Transaction,facts:InlineRecipeFacts):InlineRecipeResult {
 const no={ok:false,reason:'unsupported-step'} as const,unmapped={ok:false,reason:'unmapped-range'} as const
 if(capturedInlineRecipeFacts(base)!==facts||!audit(base,tr))return no
 try{
  const pointRecipe=preparePointRecipe(base,tr,facts)
  if(pointRecipe)return pointRecipe
  const work:BodyWork[]=facts.bodies.map(b=>({body:b.body,beforeFrom:b.pmFrom,beforeTo:b.pmTo,afterFrom:b.pmFrom,afterTo:b.pmTo,pieces:[{kind:'retained',beforeFrom:b.pmFrom,beforeTo:b.pmTo,afterFrom:b.pmFrom,afterTo:b.pmTo}],dirtyEdges:[]}))
  const units=new Map<number,Unit[]>(),changed=new Set<number>(),removedImages=new Set<number>(),removedImageAtoms=new Set<InlineAtomOccurrence>()
  for(const b of facts.bodies){
   const list:Unit[]=[]
   base.doc.resolve(b.pmFrom).parent.forEach((node,offset)=>{
    const atom=facts.atoms.find(a=>a.body===b.body&&a.pmFrom===b.pmFrom+offset&&a.pmTo===b.pmFrom+offset+node.nodeSize&&a.node===node)
    for(let i=0;i<node.nodeSize;i++){
     const before=b.pmFrom+offset+i
     const span=base.textSpans.find(s=>s.pmFrom<=before&&s.pmTo>before)
     const from=span&&point(span,before),to=span&&point(span,before+1)
     list.push({text:node.isText?node.text![i]!:'',before,beforeCode:node.marks.some(m=>m.type.name==='code'),marks:node.marks,...(atom?{atom,...(canonicalImage(node)?{image:node}:{})}:{}),...(from!==undefined&&to!==undefined?{raw:{from,to}}:{})})
    }
   });units.set(b.body,list)
  }
  for(let i=0;i<tr.steps.length;i++){
   const step=tr.steps[i] as ReplaceStep|AddMarkStep|RemoveMarkStep|AttrStep|AddNodeMarkStep|RemoveNodeMarkStep,before=tr.docs[i]!
   const imageRange=imageStepRange(before,step)
   if(imageRange){
    const w=work.find(w=>w.afterFrom<=imageRange.from&&w.afterTo>=imageRange.to),after=tr.docs[i+1]??tr.doc,node=after.nodeAt(imageRange.from)
    if(!w||!node||!canonicalImage(node))return no
    const u=units.get(w.body)![imageRange.from-w.afterFrom]!
    if(!u.image)return no
    u.image=node;u.marks=node.marks;changed.add(w.body)
   }else if(step instanceof ReplaceStep){
    const a=before.resolve(step.from),z=before.resolve(step.to)
    if(!a.sameParent(z)||!a.parent.inlineContent||step.slice.openStart||step.slice.openEnd||(step as ReplaceStep&{structure:boolean}).structure)return no
    const body=work.find(w=>w.afterFrom<=step.from&&w.afterTo>=step.to)
    if(!body)return no
    let inserted:Unit[]=[],valid=true
    step.slice.content.forEach(n=>{
     if(canonicalImage(n)){inserted.push({text:'',image:n,marks:n.marks,step:i});return}
     if(canonicalMath(n)){const math={node:n};for(let k=0;k<n.nodeSize;k++)inserted.push({text:'',math,marks:n.marks,step:i});return}
     if(n.type===n.type.schema.nodes.hardbreak&&typeof n.attrs.isInline==='boolean'&&!n.marks.length&&n.eq(n.type.create({isInline:n.attrs.isInline}))){inserted.push({text:'\n',leaf:n,marks:n.marks,step:i});return}
     if(!n.isText||n.marks.some(m=>!families.includes(m.type.name)))valid=false
     for(const text of (n.text??'').split(''))inserted.push({text,marks:n.marks,step:i})
    })
    if(!valid)return no
    const list=units.get(body.body)!,start=step.from-body.afterFrom,end=step.to-body.afterFrom
    // Only whole mathematical occurrences may be removed; payload positions
    // never acquire text authority, even for an atom born earlier in this chain.
    for(let k=start;k<end;k++){
     const u=list[k]!;if(u.image){removedImages.add(body.body);if(u.atom)removedImageAtoms.add(u.atom);continue}if(u.text)continue
     if(u.atom?.node.type.name!=='math_inline'&&!u.math)return no
     const first=list.findIndex(x=>u.atom?x.atom===u.atom:x.math===u.math),size=u.atom?u.atom.pmTo-u.atom.pmFrom:u.math!.node.nodeSize
     if(first<start||first+size>end)return no
    }
    if(start===end&&(list[start]?.atom&&list[start]!.atom===list[start-1]?.atom||list[start]?.math&&list[start]!.math===list[start-1]?.math))return no
    const replaced=list[start],replacement=inserted[0]
    if(end===start+1&&inserted.length===1&&replacement?.image&&replaced?.image&&replaced.atom&&replaced.before!==undefined&&replacement.image.hasMarkup(replaced.image.type,replaced.image.attrs,replacement.marks)){
     replacement.atom=replaced.atom;replacement.before=replaced.before
    }
    list.splice(start,end-start,...inserted);changed.add(body.body)
    const map=step.getMap()
    for(const w of work){
     w.afterFrom=map.map(w.afterFrom,-1);w.afterTo=map.map(w.afterTo,1)
     // Standard maps witness retained/inserted ranges; the original coordinates
     // remain attached to each retained unit throughout the complete chain.
     w.pieces=units.get(w.body)!.map((u,k)=>u.before===undefined?{kind:'inserted',afterFrom:w.afterFrom+k,afterTo:w.afterFrom+k+1,step:u.step!}:{kind:'retained',beforeFrom:u.before,beforeTo:u.before+1,afterFrom:w.afterFrom+k,afterTo:w.afterFrom+k+1})
    }
   }else{
    if(!(step instanceof AddMarkStep||step instanceof RemoveMarkStep))return no
    if(!families.includes(step.mark.type.name)||!canonicalAnnotation(step.mark))return no
    let valid=true
    before.nodesBetween(step.from,step.to,(n,pos)=>{
     if(!n.isInline)return
     if(!n.isText&&!canonicalImage(n)){valid=false;return false}
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
  }
  // Native mark and closed same-parent Replace steps preserve ancestor markup.
  // Their complete chains were audited above; verify each body once, before
  // source generation, instead of rescanning every old body after every step.
  for(const w of work){
   const node=tr.doc.resolve(w.afterFrom).parent,original=base.doc.resolve(w.beforeFrom).parent
   if(!node.sameMarkup(original)||node.content.size!==w.afterTo-w.afterFrom)return no
  }
  const edits:SourceEdit[]=[]
  for(const id of changed){
   const body=facts.bodies.find(b=>b.body===id)!,w=work.find(b=>b.body===id)!,list=units.get(id)!,old=facts.edges.filter(e=>e.body===id)
   const target=tr.doc.resolve(w.afterFrom).parent
   // Verify every projected unit against the actual final document, including
   // full Mark objects and attributes, before constructing source events.
   let offset=0,valid=true
   target.forEach(n=>{for(let j=0;j<n.nodeSize;j++,offset++){const u=list[offset];if(!u||(u.image?!u.image.mark(u.marks).eq(n):u.atom&&!u.atom.node.eq(n))||u.math&&!u.math.node.eq(n)||u.text!==(n.isText?n.text![j]!:u.leaf?.eq(n)?'\n':'')||!sameMarks(u.marks,n.marks))valid=false}})
   if(!valid)return no
   const ranges:Envelope[]=[]
   for(let at=0;at<list.length;at++)for(const mark of list[at]!.marks){
    if(!families.includes(mark.type.name)){
     if(list[at]!.before===undefined)return no
     continue
    }
    if(at>0&&mark.isInSet(list[at-1]!.marks))continue
    let end=at+1;while(end<list.length&&mark.isInSet(list[end]!.marks))end++
    const candidates=old.filter(e=>e.family===mark.type.name&&(mark.type.name==='annotation'||e.marks.some(m=>m.eq(mark))))
    const exact=candidates.find(e=>[-1,1].some(assoc=>tr.mapping.map(e.pmFrom,assoc)===w.afterFrom+at)&&[-1,1].some(assoc=>tr.mapping.map(e.pmTo,assoc)===w.afterFrom+end))
    const ancestor=exact??candidates.find(e=>list.slice(at,end).some(u=>u.before!==undefined&&e.pmFrom<=u.before&&u.before<e.pmTo))
    let open='',close='',keep=!!exact
    if(ancestor){open=base.source.slice(ancestor.open.from,ancestor.open.to);close=base.source.slice(ancestor.close.from,ancestor.close.to)}
    if(mark.type.name==='annotation'&&!canonicalAnnotation(mark))return no
    if(mark.type.name==='annotation'){open='{==';close='==}{>>'+mark.attrs.note+'<<}'}
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
    const r=ranges[i]!,matches=old.filter(e=>e.family===r.mark.type.name&&(r.mark.type.name==='annotation'||e.marks.some(m=>m.eq(r.mark))))
    const parts=matches.map(e=>({e,from:list.findIndex(u=>u.before===e.pmFrom),last:list.findIndex(u=>u.before===e.pmTo-1)})).filter(p=>p.from>=r.from&&p.last<r.to&&p.last>=p.from).sort((a,b)=>a.from-b.from)
    if(parts.length>1&&parts[0]!.from===r.from&&parts.at(-1)!.last+1===r.to&&parts.every((p,j)=>!j||parts[j-1]!.last+1===p.from)){
     ranges.splice(i,1,...parts.map(p=>({...r,from:p.from,to:p.last+1,old:p.e,keep:true,open:base.source.slice(p.e.open.from,p.e.open.to),close:r.mark.type.name==='annotation'?'==}{>>'+r.mark.attrs.note+'<<}':base.source.slice(p.e.close.from,p.e.close.to)})))
    }
   }
   // Code is lexically opaque: other marks must wrap each code segment,
   // never emit delimiters inside it. Only actual mark boundaries split it.
   for(let i=ranges.length-1;i>=0;i--){
    const r=ranges[i]!;if(r.mark.type.name!=='code')continue
    const cuts=[...new Set(ranges.filter(other=>other!==r).flatMap(other=>[other.from,other.to]).filter(at=>r.from<at&&at<r.to))].sort((a,b)=>a-b)
    if(cuts.length){const points=[r.from,...cuts,r.to];ranges.splice(i,1,...points.slice(0,-1).map((from,j)=>({...r,from,to:points[j+1]!,keep:false})))}
   }
   // A Markdown wrapper must be nested or disjoint, never crossing. Keep
   // an unchanged source wrapper intact and split the changed envelope at
   // that actual boundary. Every split reduces crossings at fixed endpoints.
   let crossing=true
   while(crossing){
    crossing=false;ranges.sort((a,b)=>a.from-b.from||b.to-a.to)
    outer:for(let i=0;i<ranges.length;i++)for(let j=i+1;j<ranges.length;j++){
     const a=ranges[i]!,b=ranges[j]!
     if(!(a.from<b.from&&b.from<a.to&&a.to<b.to))continue
     if(a.keep&&b.keep)return no
     const split=b.keep?a:b,cut=b.keep?b.from:a.to,index=ranges.indexOf(split)
     if(!families.includes(split.mark.type.name))return no
     ranges.splice(index,1,{...split,to:cut,keep:false},{...split,from:cut,keep:false})
     crossing=true;break outer
    }
   }
   for(const r of ranges)if(r.mark.type.name==='code'){
     let {open,close,keep}=r;const {mark}=r
     const text=list.slice(r.from,r.to).map(u=>u.text).join(''),node=target.type.schema.text(text,[mark])
     const generatedOpen=sourceCodeDelimiter(node,true),generatedClose=sourceCodeDelimiter(node,false)
     const currentLength=/^`+/.exec(open)?.[0].length??0,max=Math.max(0,...(text.match(/`+/g)??[]).map(r=>r.length))
     if(!currentLength||max>=currentLength){open=generatedOpen;close=generatedClose;keep=false}
     else{
      const left=open.slice(currentLength),right=close.slice(0,close.length-currentLength)
      const decoded=(left+text+right).replace(/\n/g,' ').replace(/^ (.+) $/,'$1')
      if(decoded!==text){const padding=generatedOpen.endsWith(' ')?' ':'';open='`'.repeat(currentLength)+padding;close=padding+'`'.repeat(currentLength);keep=false}
     }
     r.open=open;r.close=close;r.keep=keep
   }
   w.dirtyEdges=old.filter(e=>!ranges.some(r=>r.keep&&r.old===e)).map(e=>e.id)
   const claimed=[...facts.atoms.filter(a=>a.body===id).map(a=>({from:a.sourceFrom,to:a.sourceTo})),...old.flatMap(e=>[e.open,e.close]),...list.flatMap(u=>u.raw?[u.raw]:[]),...base.textSpans.filter(s=>s.pmFrom>=body.pmFrom&&s.pmTo<=body.pmTo).map(s=>({from:s.sourceFrom,to:s.sourceTo}))].sort((a,b)=>a.from-b.from)
   const gaps:{raw:InlineRawRange;before:number}[]=[];let cursor=body.sourceFrom
   for(const raw of claimed){if(raw.from>cursor){const next=[...base.textSpans,...facts.atoms.filter(a=>a.body===id)].filter(s=>s.sourceFrom>=raw.from&&s.pmFrom>=body.pmFrom&&s.pmTo<=body.pmTo).sort((a,b)=>a.sourceFrom-b.sourceFrom)[0];gaps.push({raw:{from:cursor,to:raw.from},before:next?.pmFrom??body.pmTo})}cursor=Math.max(cursor,raw.to)}
   if(cursor<body.sourceTo)gaps.push({raw:{from:cursor,to:body.sourceTo},before:body.pmTo})
   const adjacentEntities=new Set<number>()
   for(const r of ranges)if(r.keep&&['em','strong'].includes(r.mark.type.name)){
    // A kept delimiter beside inner punctuation needs an outer punctuation
    // neighbour. Encode only a newly inserted, unmarked Unicode scalar;
    // retained text and the original wrapper remain byte-for-byte intact.
    for(const [outer,inner] of [[r.from-1,r.from],[r.to,r.to-1]] as const){
     if(outer<0||outer>=list.length)continue
     const start=(at:number)=>at>0&&/[\uDC00-\uDFFF]/.test(list[at]!.text)&&/[\uD800-\uDBFF]/.test(list[at-1]!.text)?at-1:at
     const at=start(outer),inside=start(inner),scalar=String.fromCodePoint((list[at]!.text+(list[at+1]?.text??'')).codePointAt(0)??0)
     const innerScalar=String.fromCodePoint((list[inside]!.text+(list[inside+1]?.text??'')).codePointAt(0)??0)
     const units=list.slice(at,at+scalar.length)
     if(units.length===scalar.length&&units.every(u=>u.before===undefined&&!u.marks.length&&!!u.text)
       &&list[inside]!.before!==undefined&&/[\p{P}\p{S}]/u.test(innerScalar)&&!/[\s\p{P}\p{S}]/u.test(scalar))adjacentEntities.add(at)
    }
   }
   for(const r of ranges)if(!r.keep&&['em','strong','strike_through','highlight'].includes(r.mark.type.name)){
    // Encoding an inner boundary space ends in ';' (punctuation). The
    // installed delimiter flanking rule then also needs an outer punctuation
    // neighbour. Encode exactly that adjacent scalar, retaining its PM marks.
    if(!ranges.some(other=>other!==r&&other.from===r.to)&&/^[ \t]$/.test(list[r.to-1]!.text)&&r.to<list.length&&!/[\s\p{P}\p{S}]/u.test(list[r.to]!.text))adjacentEntities.add(r.to)
    if(!ranges.some(other=>other!==r&&other.to===r.from)&&/^[ \t]$/.test(list[r.from]!.text)&&r.from>0&&!/[\s\p{P}\p{S}]/u.test(list[r.from-1]!.text)){
     let at=r.from-1;if(/[\uDC00-\uDFFF]/.test(list[at]!.text)&&at>0&&/[\uD800-\uDBFF]/.test(list[at-1]!.text))at--
     adjacentEntities.add(at)
    }
   }
   const output:Output[]=[],emittedGaps=new Set<number>()
   const nesting=(a:Envelope,b:Envelope)=>a.from-b.from||b.to-a.to||(Number(a.mark.type.name==='code')-Number(b.mark.type.name==='code'))||Number(b.keep)-Number(a.keep)||(a.old&&b.old?a.old.open.from-b.old.open.from:Object.keys(target.type.schema.marks).indexOf(a.mark.type.name)-Object.keys(target.type.schema.marks).indexOf(b.mark.type.name))
   const ordered=ranges.slice().sort(nesting)
   for(let at=0;at<=list.length;at++){
    for(const r of ordered.filter(r=>r.to===at).reverse()){
     const critic=r.keep&&r.mark.type.name==='annotation'?facts.critic.find(c=>c.kind==='annotation'&&c.syntaxFrom===r.old!.open.from):undefined
     if(critic&&critic.note!==r.mark.attrs.note){
      const edit=noteEdit(base,critic,r.mark.attrs.note)
      output.push({raw:{from:r.old!.close.from,to:edit.from}},{text:edit.text},{raw:{from:edit.to,to:r.old!.close.to}})
     }else output.push(r.keep?{raw:r.old!.close}:{text:r.close})
    }
    for(let g=0;g<gaps.length;g++)if(!emittedGaps.has(g)&&(at===list.length||list[at]!.before!==undefined&&gaps[g]!.before<=list[at]!.before!)){output.push({raw:gaps[g]!.raw});emittedGaps.add(g)}
    for(const r of ordered.filter(r=>r.from===at))output.push(r.keep?{raw:r.old!.open}:{text:r.open})
    if(at===list.length)break
    const u=list[at]!,code=u.marks.some(m=>m.type.name==='code'),changedCode=u.before!==undefined&&u.beforeCode!==code
    if(u.before===undefined&&!u.marks.length&&u.text==='!'&&ordered.some(r=>r.keep&&r.mark.type.name==='link'&&r.from===at+1&&base.source.slice(r.old!.open.from,r.old!.open.to)==='[')){output.push({text:'\\!'});continue}
    const exposedSpace=u.before!==undefined&&u.raw&&/^[ \t]$/.test(base.source.slice(u.raw.from,u.raw.to))
     &&[...removedImageAtoms].some(a=>a.body===id&&(a.pmTo<=u.before!&&list.slice(0,at+1).every(x=>/^[ \t]$/.test(x.text))||a.pmFrom>u.before!&&list.slice(at).every(x=>/^[ \t]$/.test(x.text))))
    const edgeSpace=!code&&/^[ \t]$/.test(u.text)&&(exposedSpace||((u.before===undefined||changedCode)&&(list.slice(list.slice(0,at).map(x=>x.text).lastIndexOf('\n')+1,at+1).every(x=>/^[ \t]$/.test(x.text))||list.slice(at,list.findIndex((x,i)=>i>at&&x.text==='\n')<0?undefined:list.findIndex((x,i)=>i>at&&x.text==='\n')).every(x=>/^[ \t]$/.test(x.text))))||ranges.some(r=>!r.keep&&['em','strong','strike_through','highlight'].includes(r.mark.type.name)&&r.from<=at&&at<r.to&&(list.slice(r.from,at+1).every(x=>/^[ \t]$/.test(x.text))||list.slice(at,r.to).every(x=>/^[ \t]$/.test(x.text)))))
    if(adjacentEntities.has(at)){
     const scalar=(u.text+(list[at+1]?.text??'')).codePointAt(0)!
     output.push({text:'&#'+scalar+';'})
     if(scalar>0xffff)at++
     continue
    }
    if(edgeSpace){output.push({text:u.text===' '?'&#32;':'&#9;'});continue}
    if(u.image){
     if(code)return no
     if(u.atom&&u.image.hasMarkup(u.atom.node.type,u.atom.node.attrs,u.image.marks))output.push({raw:{from:u.atom.sourceFrom,to:u.atom.sourceTo}})
     else output.push({text:serializeSourceInlineBody(target.copy(Fragment.from(u.image.mark([]))),body.kind==='table-cell')})
     continue
    }
    if(u.before!==undefined){
     if(u.atom){
      const atom=u.atom,count=atom.pmTo-atom.pmFrom,group=list.slice(at,at+count)
      if(u.before!==atom.pmFrom||group.length!==count||group.some((x,i)=>x.atom!==atom||x.before!==atom.pmFrom+i||!sameMarks(x.marks,atom.node.marks))
        ||ranges.some(r=>r.from>at&&r.from<at+count||r.to>at&&r.to<at+count))return unmapped
      output.push({raw:{from:atom.sourceFrom,to:atom.sourceTo}});at+=count-1;continue
     }
     if(!u.raw){
      const span=base.textSpans.find(s=>s.kind==='atomic'&&s.pmFrom===u.before)
      if(!span)return unmapped
      const count=span.pmTo-span.pmFrom,group=list.slice(at,at+count)
      if(group.length!==count||group.some((x,i)=>x.before!==span.pmFrom+i||!sameMarks(x.marks,u.marks))||ranges.some(r=>r.from>at&&r.from<at+count||r.to>at&&r.to<at+count))return unmapped
      const raw={from:span.sourceFrom,to:span.sourceTo},text=group.map(x=>x.text).join('')
      const encoded=changedCode?encodeCodeContext(text,code,body.kind==='table-cell'):undefined
      output.push(encoded!==undefined&&encoded!==base.source.slice(raw.from,raw.to)?{text:encoded}:{raw});at+=count-1
     }else{
      const encoded=changedCode?encodeCodeContext(u.text,code,body.kind==='table-cell'):undefined
      output.push(encoded!==undefined&&encoded!==base.source.slice(u.raw.from,u.raw.to)?{text:encoded}:{raw:u.raw})
     }
    }
    else if(u.math){
     const math=u.math,count=math.node.nodeSize,group=list.slice(at,at+count)
     if(group.length!==count||group.some(x=>x.math!==math)||ranges.some(r=>r.from>at&&r.from<at+count||r.to>at&&r.to<at+count))return no
     output.push({text:'$'+(body.kind==='table-cell'?math.node.textContent.replace(/\|/g,'\\|'):math.node.textContent)+'$'});at+=count-1
    }
    else if(u.leaf)output.push({text:u.leaf.attrs.isInline?'\n':'\\\n'})
    else output.push({text:code?(body.kind==='table-cell'?u.text.replace(/\|/g,'\\|'):u.text):escapeText(u.text,body.kind==='table-cell')})
   }
   const bodyEdits=editsFromOutput(base,body,output)
   if(!bodyEdits)return unmapped
   edits.push(...bodyEdits)
   if(!list.length&&target.type.name==='paragraph'&&removedImages.has(id))edits.push(...emptyBodyEdits(base,facts,body,body.sourceTo))
  }
  edits.sort((a,b)=>a.from-b.from||a.to-b.to)
  if(edits.some((e,i)=>i>0&&edits[i-1]!.to>e.from))return no
  return {ok:true,edits,changedBodies:[...changed]}
 }catch{return no}
}
