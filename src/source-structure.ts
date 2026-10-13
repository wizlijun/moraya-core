import type {Node as PMNode} from 'prosemirror-model'
import type {Transaction} from 'prosemirror-state'
import {AddMarkStep,RemoveMarkStep,ReplaceStep,ReplaceAroundStep,AttrStep,AddNodeMarkStep,RemoveNodeMarkStep} from 'prosemirror-transform'
import type {SourceSession} from './source-fidelity'
import type {SourceEdit,SourceRoot} from './source-ownership'

export class UnsupportedSourceStructure extends Error {}
type RawSpan={from:number;to:number}
type ChildRange={from:number;to:number}
type Origin={kind:'root'|'blank';id:number}|{kind:'fallback'}
type Ref={kind:'base';origin:Origin}|{kind:'component';id:number}
type Lane={ref:Ref;node:PMNode;from:number;to:number}
type Boundary=
 |{kind:'base';anchor:number;slotIds:number[]}
 |{kind:'inside-root';rootId:number}
 |{kind:'generated';component:number}
 |{kind:'tombstone';component:number;prior:Boundary}
type Birth={step:number;ordinal:number;anchor:Boundary}
type StepWitness={step:number;kind:'replace'|'around'|'mark'|'attr'|'node-mark';before:RawSpan;after:RawSpan;crossed:Boundary[]}
type Component={id:number;parent:number;origins:Origin[];births:Birth[];witnesses:StepWitness[];finalRuns:ChildRange[]}
type Ledger={children:Lane[];boundaries:Boundary[];components:Component[]}
type Claim=RawSpan & {kind:'body'|'terminator'|'blank'|'separator'|'baseline-conversion'|'anchor';
 step:number;rootId?:number;unitId?:number;survivorChild?:number;birth?:Birth}
type Kept=RawSpan & {kind:'root'|'blank'|'protected'|'envelope';id:number}
type Piece={kind:'raw';span:RawSpan;identity:Kept}|{kind:'generated';text:string}
type Recipe={claims:Claim[];kept:Kept[];pieces:Piece[];edits:SourceEdit[];changedRoots:number[];witnesses:StepWitness[]}
export type StructuralRendered={text:string;ownedBlank?:boolean;continuationIndent?:number;terminal:'none'|'content-eol';family:'flow'|'table'|'closed-literal';eol:'\n'|'\r\n'|'\r'}
type Step=ReplaceStep|ReplaceAroundStep|AddMarkStep|RemoveMarkStep|AttrStep|AddNodeMarkStep|RemoveNodeMarkStep
type Slot=RawSpan & {kind:'body'|'terminator'|'blank'|'separator'|'protected'|'envelope';id:number}
type Atom={kind:'body'|'terminator'|'blank'|'separator'|'protected'|'envelope';piece:Piece;
 anchor:number;step?:number;slot?:Slot;ownedBlank?:boolean;continuationIndent?:number}
// Exact ordinary HTML boundary; defaults include every schema attr and mark.
// Business IDs, if any, must already have passed the caller's approved projection.
export function isSourceListBoundary(node:PMNode):boolean {
 return node.type.name==='html_block'&&node.textContent==='<!-- notemd:list-boundary -->'
  &&node.hasMarkup(node.type)&&node.childCount===1&&node.firstChild!.isText&&node.firstChild!.marks.length===0
}
function fail():never {throw new UnsupportedSourceStructure()}
const sameOrigin=(a:Origin,b:Origin)=>a.kind===b.kind&&(a.kind==='fallback'||b.kind!=='fallback'&&a.id===b.id)
const empty=(n:PMNode)=>n.type.name==='paragraph'&&n.content.size===0&&n.marks.length===0

function boundaryAt(doc:PMNode,pos:number):number|undefined {
 if(!Number.isInteger(pos)||pos<0||pos>doc.content.size)return undefined
 const p=doc.resolve(pos);return p.depth===0?p.index(0):undefined
}
function childWindow(doc:PMNode,from:number,to:number):ChildRange {
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>doc.content.size)fail()
 const a=doc.resolve(from),b=doc.resolve(to)
 if(from===to&&a.depth===0)return {from:a.index(0),to:a.index(0)}
 return {from:a.index(0),to:b.index(0)+(b.depth===0?0:1)}
}
function splitsText(doc:PMNode,pos:number):boolean {
 const p=doc.resolve(pos),n=p.parent.maybeChild(p.index())
 return !!p.textOffset&&!!n?.isText&&/[\uD800-\uDBFF]/.test(n.text![p.textOffset-1]!)
  &&/[\uDC00-\uDFFF]/.test(n.text![p.textOffset]!)
}
function stepRange(doc:PMNode,step:Step):RawSpan {
 if(step instanceof AttrStep||step instanceof AddNodeMarkStep||step instanceof RemoveNodeMarkStep){
  if(!Number.isInteger(step.pos)||step.pos<0||step.pos>=doc.content.size)fail()
  const node=doc.nodeAt(step.pos);if(!node)fail()
  return {from:step.pos,to:step.pos+node.nodeSize}
 }
 return {from:step.from,to:step.to}
}
const structuralWitness=(w:StepWitness)=>w.kind==='replace'||w.kind==='around'
/** This dispatch pass is local: stable mark chains never replay or scan the doc. */
export function classifyTransaction(base:SourceSession,tr:Transaction):'stable'|'structural' {
 if(tr.docs.length!==tr.steps.length||tr.doc.type.schema!==base.doc.type.schema)fail()
 let structural=false
 for(let i=0;i<tr.steps.length;i++){
  const step=tr.steps[i]!,proto=Object.getPrototypeOf(step),before=tr.docs[i]
  if(!before||before.type.schema!==base.doc.type.schema)fail()
  if(proto!==ReplaceStep.prototype&&proto!==AddMarkStep.prototype&&proto!==RemoveMarkStep.prototype
   &&proto!==ReplaceAroundStep.prototype&&proto!==AttrStep.prototype
   &&proto!==AddNodeMarkStep.prototype&&proto!==RemoveNodeMarkStep.prototype)fail()
  const {from,to}=stepRange(before,step as Step)
  childWindow(before,from,to)
  if(splitsText(before,from)||splitsText(before,to))fail()
  if(proto===ReplaceAroundStep.prototype){
   const around=step as ReplaceAroundStep
   if(!Number.isInteger(around.gapFrom)||!Number.isInteger(around.gapTo)||around.gapFrom<from
    ||around.gapTo<around.gapFrom||around.gapTo>to||!Number.isInteger(around.insert)
    ||around.insert<0||around.insert>around.slice.size
    ||splitsText(before,around.gapFrom)||splitsText(before,around.gapTo))fail()
   structural=true
  }else if(proto===AttrStep.prototype||proto===AddNodeMarkStep.prototype||proto===RemoveNodeMarkStep.prototype)structural=true
  else if(proto===ReplaceStep.prototype){
   const s=step as ReplaceStep,a=before.resolve(from),b=before.resolve(to)
   let inline=true;s.slice.content.forEach(n=>{if(!n.isInline)inline=false})
   if((s as ReplaceStep & {structure:boolean}).structure||!a.sameParent(b)||!a.parent.inlineContent
    ||s.slice.openStart||s.slice.openEnd||!inline)structural=true
  }
 }
 return structural?'structural':'stable'
}
function originSpan(base:SourceSession,origin:Origin):RawSpan {
 if(origin.kind==='root'){const r=base.roots[origin.id];if(!r)fail();return {from:r.sourceFrom,to:r.sourceTo}}
 if(origin.kind==='blank'){const u=base.layout.blankLines[origin.id];if(!u)fail();return {from:u.sourceFrom,to:u.sourceTo}}
 const f=base.layout.fallback;if(!f)fail();return {from:f.sourceAnchor,to:f.sourceAnchor}
}
function createLedger(base:SourceSession):Ledger {
 const children:Lane[]=new Array(base.doc.childCount)
 const assign=(origin:Origin,from:number,to:number,pmFrom:number,pmTo:number)=>{
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<=from||to>children.length)fail()
  let pos=pmFrom
  for(let i=from;i<to;i++){if(children[i])fail();const node=base.doc.child(i);children[i]={ref:{kind:'base',origin},node,from:pos,to:pos+node.nodeSize};pos+=node.nodeSize}
  if(pos!==pmTo)fail()
 }
 base.roots.forEach((r,id)=>{if(r.id!==id)fail();assign({kind:'root',id},r.childFrom,r.childTo,r.pmFrom,r.pmTo)})
 base.layout.blankLines.forEach((u,id)=>{if(u.id!==id)fail();if(u.role==='empty-paragraph')assign({kind:'blank',id},u.emission.childFrom,u.emission.childTo,u.emission.pmFrom,u.emission.pmTo)})
 if(base.layout.fallback){const e=base.layout.fallback.emission;assign({kind:'fallback'},e.childFrom,e.childTo,e.pmFrom,e.pmTo)}
 let pos=0
 for(const lane of children){if(!lane||lane.from!==pos)fail();pos=lane.to}
 if(pos!==base.doc.content.size)fail()
 const boundaries:Boundary[]=[];let blankCursor=0
 for(let i=0;i<=children.length;i++){
  const left=children[i-1]?.ref,right=children[i]?.ref
  if(left?.kind==='base'&&right?.kind==='base'&&sameOrigin(left.origin,right.origin)&&left.origin.kind==='root'){
   boundaries.push({kind:'inside-root',rootId:left.origin.id});continue
  }
  const anchor=right?.kind==='base'?originSpan(base,right.origin).from:base.source.length
  const previous=left?.kind==='base'?originSpan(base,left.origin).to:0
  const units=base.layout.blankLines,slotIds:number[]=[]
  while(blankCursor<units.length&&units[blankCursor]!.sourceTo<=previous)blankCursor++
  while(blankCursor<units.length&&units[blankCursor]!.sourceTo<=anchor){
   const unit=units[blankCursor++]!;if(unit.sourceFrom>=previous)slotIds.push(unit.id)
  }
  boundaries.push({kind:'base',anchor,slotIds})
 }
 return {children,boundaries,components:[]}
}
function representative(ledger:Ledger,id:number):Component {
 let c=ledger.components[id];if(!c)fail()
 while(c.parent!==c.id)c=ledger.components[c.parent]!
 return c
}
function stepWindow(before:PMNode,after:PMNode,step:Step,ledger:Ledger):{before:ChildRange;after:ChildRange;from:number;to:number} {
 const range=stepRange(before,step),window=childWindow(before,range.from,range.to)
 const from=ledger.children[window.from]?.from??before.content.size
 const to=window.to===window.from?from:ledger.children[window.to-1]!.to
 const map=step.getMap(),a=boundaryAt(after,map.map(from,-1)),b=boundaryAt(after,map.map(to,1))
 if(a===undefined||b===undefined||b<a)fail()
 return {before:window,after:{from:a,to:b},from,to}
}
function advanceLedger(ledger:Ledger,before:PMNode,after:PMNode,step:Step,index:number):void {
 const w=stepWindow(before,after,step,ledger),range=stepRange(before,step)
 const isLocal=!(step instanceof ReplaceStep||step instanceof ReplaceAroundStep)
 const kind:StepWitness['kind']=step instanceof ReplaceAroundStep?'around':step instanceof ReplaceStep?'replace':
  step instanceof AttrStep?'attr':step instanceof AddNodeMarkStep||step instanceof RemoveNodeMarkStep?'node-mark':'mark'
 const witness:StepWitness={step:index,kind,before:range,
  after:{from:step.getMap().map(range.from,-1),to:step.getMap().map(range.to,1)},crossed:ledger.boundaries.slice(w.before.from,w.before.to+1)}
 if(w.after.from!==w.before.from||after.childCount-before.childCount!==w.after.to-w.after.from-(w.before.to-w.before.from))fail()
 // Mark ranges authorize each owner independently, never merging unrelated roots.
 if(isLocal){
  for(let i=w.before.from;i<w.before.to;i++){
   const lane=ledger.children[i]!
   if(lane.node.eq(after.child(i)))continue
   const c=touch([lane.ref],ledger.boundaries[i]!,false)
   lane.ref={kind:'component',id:c.id};lane.node=after.child(i)
  }
  return
 }
 const refs=ledger.children.slice(w.before.from,w.before.to).map(l=>l.ref)
 const boundary=ledger.boundaries[w.before.from]!
 // A removed node may leave a boundary component with no surviving lane.
 // Only a real structural range crossing its actual position may absorb it;
 // merely sharing the expanded child window (or touching an endpoint) may not.
 for(let child=w.before.from;child<=w.before.to;child++){
  const position=ledger.children[child]?.from??before.content.size
  if(!(range.from<position&&position<range.to))continue
  let crossed=ledger.boundaries[child]!
  while(crossed.kind==='tombstone'){
   refs.push({kind:'component',id:crossed.component});crossed=crossed.prior
  }
 }
 if(!refs.length){
  if(boundary.kind==='inside-root')refs.push({kind:'base',origin:{kind:'root',id:boundary.rootId}})
  else if(boundary.kind==='generated'||boundary.kind==='tombstone')refs.push({kind:'component',id:boundary.component})
 }
 const c=touch(refs,boundary,refs.length===0),added:Lane[]=[]
 let pos=step.getMap().map(w.from,-1)
 for(let i=w.after.from;i<w.after.to;i++){const node=after.child(i);added.push({ref:{kind:'component',id:c.id},node,from:pos,to:pos+node.nodeSize});pos+=node.nodeSize}
 const left=ledger.boundaries[w.before.from]!,right=ledger.boundaries[w.before.to]!
 ledger.children.splice(w.before.from,w.before.to-w.before.from,...added)
 const seams:Boundary[]=added.length
  ?[left,...Array.from({length:added.length-1},():Boundary=>({kind:'generated',component:c.id})),right]
  :[{kind:'tombstone',component:c.id,prior:left}]
 ledger.boundaries.splice(w.before.from,w.before.to-w.before.from+1,...seams)
 pos=0
 for(const lane of ledger.children){lane.from=pos;pos+=lane.node.nodeSize;lane.to=pos}
 function touch(refs:Ref[],anchor:Boundary,birth:boolean):Component {
  const ids:number[]=[],origins:Origin[]=[]
  for(const ref of refs){
   if(ref.kind==='component'){const id=representative(ledger,ref.id).id;if(!ids.includes(id))ids.push(id)}
   else if(!origins.some(o=>sameOrigin(o,ref.origin)))origins.push(ref.origin)
  }
  // All emissions from one natural root belong to its existing component.
  for(const candidate of ledger.components)if(candidate.parent===candidate.id&&candidate.origins.some(o=>origins.some(p=>sameOrigin(o,p))))ids.push(candidate.id)
  let c=ids.length?representative(ledger,ids[0]!):undefined
  if(!c){const id=ledger.components.length;c={id,parent:id,origins:[],births:[],witnesses:[],finalRuns:[]};ledger.components.push(c)}
  for(const id of ids){const other=representative(ledger,id);if(other===c)continue;other.parent=c.id;c.origins.push(...other.origins);c.births.push(...other.births);c.witnesses.push(...other.witnesses)}
  for(const origin of origins)if(!c.origins.some(o=>sameOrigin(o,origin)))c.origins.push(origin)
  c.witnesses.push(witness)
  if(birth)c.births.push({step:index,ordinal:c.births.length,anchor})
  for(const lane of ledger.children)if(lane.ref.kind==='base'&&c.origins.some(o=>sameOrigin(o,lane.ref.kind==='base'?lane.ref.origin:{kind:'fallback'})))lane.ref={kind:'component',id:c.id}
  return c
 }
}
function finishLedger(base:SourceSession,tr:Transaction,ledger:Ledger):void {
 let i=0
 tr.doc.forEach(node=>{
  const lane=ledger.children[i];if(!lane||!node.eq(lane.node))fail()
  if(lane.ref.kind==='base'){
   const o=lane.ref.origin,e=o.kind==='root'?base.roots[o.id]:o.kind==='blank'?base.layout.blankLines[o.id]:base.layout.fallback
   if(!e)fail()
  }else{
   const c=representative(ledger,lane.ref.id);lane.ref={kind:'component',id:c.id}
   const last=c.finalRuns[c.finalRuns.length-1]
   if(last?.to===i)last.to++;else c.finalRuns.push({from:i,to:i+1})
  }
  i++
 })
 if(i!==ledger.children.length)fail()
}
function partitionSlots(base:SourceSession):Slot[] {
 const slots:Slot[]=[]
 for(const root of base.roots){
  if(root.tailFrom<root.sourceFrom||root.tailFrom>root.sourceTo)fail()
  slots.push({kind:'body',id:root.id,from:root.sourceFrom,to:root.tailFrom})
  const tail=base.source.slice(root.tailFrom,root.sourceTo),eol=/^(?:\r\n|\r|\n)/.exec(tail)?.[0]
  if(eol)slots.push({kind:'terminator',id:root.id,from:root.tailFrom,to:root.tailFrom+eol.length})
 }
 for(const u of base.layout.blankLines)slots.push({kind:u.role==='separator'?'separator':'blank',id:u.id,from:u.sourceFrom,to:u.sourceTo})
 for(let id=0;id<base.protectedSources.length;id++){
  const p=base.protectedSources[id]!
  // Nested definitions are carried inside an untouched root, but no renderer
  // is allowed to take ownership of that root.
  if(p.scope==='top-level')slots.push({kind:'protected',id,from:p.sourceFrom,to:p.sourceTo})
 }
 slots.sort((a,b)=>a.from-b.from||a.to-b.to)
 const result:Slot[]=[];let at=0
 for(const slot of slots){
  if(slot.from<at||slot.to<slot.from||slot.to>base.source.length)fail()
  if(slot.from>at)result.push({kind:'envelope',id:result.length,from:at,to:slot.from})
  if(slot.to>slot.from)result.push(slot)
  at=slot.to
 }
 if(at<base.source.length)result.push({kind:'envelope',id:result.length,from:at,to:base.source.length})
 return result
}
function makeRecipe(base:SourceSession,ledger:Ledger,slots:Slot[],render:(nodes:PMNode[],positions:readonly number[])=>StructuralRendered,
 rootHasClosedFences:(root:SourceRoot)=>boolean):Recipe {
 const claims:Claim[]=[],removed=new Set<Slot>(),insertions=new Map<number,Atom[]>(),changedRoots:number[]=[]
 const dirty=new Map<number,Component>(),blankDirty=new Map<number,Component>()
 // Every component at a shared raw anchor participates, including an edited
 // original owner. Emit its final run once, in the actual document order.
 const components=ledger.components.filter(c=>c.parent===c.id)
  .sort((a,b)=>(a.finalRuns[0]?.from??Infinity)-(b.finalRuns[0]?.from??Infinity))
 const neighbors=new Map<Slot,{left:number|undefined;right:number|undefined}>()
 let leftRoot=-1,rightRoot=0
 for(const slot of slots)if(slot.kind==='separator'){
  while(leftRoot+1<base.roots.length&&base.roots[leftRoot+1]!.tailFrom<=slot.from)leftRoot++
  while(rightRoot<base.roots.length&&base.roots[rightRoot]!.sourceFrom<slot.to)rightRoot++
  neighbors.set(slot,{left:base.roots[leftRoot]?.id,right:base.roots[rightRoot]?.id})
 }
 for(const c of components)for(const o of c.origins){
  if(o.kind==='root'){dirty.set(o.id,c);changedRoots.push(o.id)}
  else if(o.kind==='blank')blankDirty.set(o.id,c)
 }
 const stepOf=(c:Component)=>c.witnesses[0]!.step
 const structuralStep=(c:Component)=>c.witnesses.find(structuralWitness)?.step
 const deletion=components.flatMap(c=>c.witnesses).find(w=>structuralWitness(w)&&w.before.to>w.before.from&&w.after.to-w.after.from<w.before.to-w.before.from)
 const noVisible=ledger.children.every(l=>empty(l.node))
 let baseline=noVisible?ledger.children.findIndex(l=>l.ref.kind==='base'&&l.ref.origin.kind==='fallback'):-1
 if(noVisible&&baseline<0)baseline=0
 const conversion=baseline>=0?ledger.children[baseline]:undefined
 if(conversion?.ref.kind==='base'&&conversion.ref.origin.kind==='blank'){
  if(!deletion)fail()
  const unit=slots.find(s=>s.kind==='blank'&&s.id===(conversion.ref.kind==='base'&&conversion.ref.origin.kind==='blank'?conversion.ref.origin.id:-1));if(!unit)fail()
  removed.add(unit);claims.push({...unit,kind:'baseline-conversion',step:deletion.step,unitId:unit.id,survivorChild:baseline})
 }
 const claim=(slot:Slot,c:Component)=>{
  removed.add(slot)
  claims.push({from:slot.from,to:slot.to,kind:slot.kind==='body'?'body':slot.kind==='terminator'?'terminator':'blank',
   step:slot.kind==='terminator'?(structuralStep(c)??fail()):stepOf(c),...(slot.kind==='blank'?{unitId:slot.id}:{rootId:slot.id})})
 }
 const raw=(slot:Slot):Atom=>{
  const identity:Kept={from:slot.from,to:slot.to,kind:slot.kind==='body'||slot.kind==='terminator'?'root':slot.kind==='separator'||slot.kind==='blank'?'blank':slot.kind,id:slot.id}
  return {kind:slot.kind,piece:{kind:'raw',span:slot,identity},anchor:slot.from,slot}
 }
 const generated=(kind:Atom['kind'],text:string,anchor:number,step:number):Atom=>({kind,piece:{kind:'generated',text},anchor,step})
 for(const c of components){
  if(c.finalRuns.length>1)fail()
  const spans=c.origins.map(o=>originSpan(base,o)),birthAnchors=c.births.map(b=>{if(b.anchor.kind!=='base')return fail();return b.anchor.anchor})
  const anchor=Math.min(...spans.map(s=>s.from),...birthAnchors)
  if(!Number.isFinite(anchor))fail()
  const nodes=c.finalRuns.flatMap(r=>ledger.children.slice(r.from,r.to).map(l=>l.node))
  const origins=c.origins.filter((o):o is {kind:'root';id:number}=>o.kind==='root')
  const originIds=new Set(origins.map(o=>o.id))
  // Independent pre-serializer guard. Final edit guards do not replace this.
  for(const o of origins){const r=base.roots[o.id]!;if(base.protectedSources.some(p=>p.sourceFrom<r.sourceTo&&p.sourceTo>r.sourceFrom))fail()
   if(!rootHasClosedFences(r))fail()
   if(!['paragraph_open','heading_open','bullet_list_open','ordered_list_open','blockquote_open','table_open','hr','fence'].includes(r.tokenType)
    &&!(r.tokenType==='html_block'&&r.childTo===r.childFrom+1&&isSourceListBoundary(base.doc.child(r.childFrom))))fail()}
  const rootSlots=slots.filter(s=>(s.kind==='body'||s.kind==='terminator')&&originIds.has(s.id))
  const terminal=rootSlots.filter(s=>s.kind==='terminator').at(-1)
  let lastVisible=nodes.length-1
  while(lastVisible>=0&&empty(nodes[lastVisible]!))lastVisible--
  const keepTerminal=lastVisible>=0?terminal:undefined
  for(const s of rootSlots)if(s!==keepTerminal)claim(s,c)
  for(const s of slots)if(s.kind==='blank'&&blankDirty.get(s.id)===c)claim(s,c)
  // A seam crossed by a structural window is internal to this component.
  // It is not the incoming separator of the component's next outside run.
  for(const s of slots)if(s.kind==='separator'){
   const {left,right}=neighbors.get(s)!
   if(left!==undefined&&right!==undefined&&dirty.get(left)===c&&dirty.get(right)===c){
    removed.add(s);claims.push({from:s.from,to:s.to,kind:'separator',unitId:s.id,step:structuralStep(c)??fail()})
   }
  }
  const atoms:Atom[]=[]
  for(let n=0;n<nodes.length;n++){
   const node=nodes[n]!,finalIndex=c.finalRuns[0]!.from+n
   if(empty(node)){if(finalIndex!==baseline)atoms.push(generated('blank','\n',anchor,stepOf(c)));continue}
   const output=render([node],[ledger.children[finalIndex]!.from])
   if(output.family==='closed-literal'&&node.type.name!=='code_block'&&!isSourceListBoundary(node))fail()
   let text=output.text
   if(output.terminal==='content-eol'){if(!text.endsWith(output.eol))fail();text=text.slice(0,-output.eol.length)}
   atoms.push({...generated('body',text,anchor,stepOf(c)),ownedBlank:!!output.ownedBlank,...(output.continuationIndent!==undefined?{continuationIndent:output.continuationIndent}:{})})
   if(n===lastVisible&&keepTerminal){
    atoms.push(raw(keepTerminal));removed.add(keepTerminal)
    if(n<nodes.length-1)claims.push({from:keepTerminal.to,to:keepTerminal.to,kind:'anchor',step:stepOf(c)})
   }else{
    // A one-to-one edit of the final table inherits its original absent EOL.
    // Births and multi-node replacements have no such terminal provenance.
    const original=origins.length===1&&c.origins.length===1&&!c.births.length&&nodes.length===1?base.roots[origins[0]!.id]:undefined
    const keepAbsentTableEol=output.family==='table'&&finalIndex===ledger.children.length-1&&!terminal
     &&original?.tokenType==='table_open'&&original.childTo===base.doc.childCount
     &&original.sourceTo===base.source.length&&original.tailFrom===original.sourceTo
    atoms.push(generated('terminator',output.terminal==='content-eol'&&!keepAbsentTableEol?'\n':'',anchor,stepOf(c)))
   }
  }
  // A component without surviving origins or nodes is a cancelled pure birth.
  if(!nodes.length&&!c.origins.length)continue
  const previous=insertions.get(anchor)??[]
  insertions.set(anchor,[...previous,...atoms])
  const birth=c.births[0]
  claims.push({from:anchor,to:anchor,kind:'anchor',step:stepOf(c),...(birth?{birth}:{})})
 }
 const atoms:Atom[]=[]
 for(const slot of slots){const added=insertions.get(slot.from);if(added){atoms.push(...added);insertions.delete(slot.from)}
  if(!removed.has(slot))atoms.push(raw(slot))}
 const rest=[...insertions].sort((a,b)=>a[0]-b[0])
 for(const [anchor,added]of rest){
  const i=atoms.findIndex(a=>a.anchor>anchor);if(i<0)atoms.push(...added);else atoms.splice(i,0,...added)
 }
 // Only runs beside a touched origin or a true birth may change separators.
 const authorizedSeparator=(slot:Slot):number|undefined=>{
  const {left,right}=neighbors.get(slot)!
  for(const root of [left,right]){
   const c=root===undefined?undefined:dirty.get(root)
   if(c){const step=structuralStep(c);if(step!==undefined)return step}
  }
  for(const component of components)for(const birth of component.births)
   if(birth.anchor.kind==='base'&&birth.anchor.slotIds.includes(slot.id))return birth.step
  return undefined
 }
 const entity=(a:Atom)=>a.kind==='body'||a.kind==='protected'
 const entities=atoms.map((a,i)=>entity(a)?i:-1).filter(i=>i>=0)
 const drop=new Set<Atom>(),before=new Map<Atom,Atom[]>()
 for(let n=0;n<=entities.length;n++){
  const l=n?entities[n-1]!:-1,r=n<entities.length?entities[n]!:atoms.length
  const left=atoms[l],right=atoms[r],run=atoms.slice(l+1,r)
  const separators=run.filter(a=>a.kind==='separator')
  const needed=!!left&&!!right||left?.kind==='protected'||right?.kind==='protected'
  // Existing incoming separator wins; semantic blank units are never candidates.
  const keep=needed?separators[0]:undefined
  for(const a of separators)if(a!==keep){
   const step=a.slot&&authorizedSeparator(a.slot);if(step===undefined)fail()
   drop.add(a);claims.push({from:a.slot!.from,to:a.slot!.to,kind:'separator',unitId:a.slot!.id,step})
  }
  if(keep?.slot&&left?.continuationIndent!==undefined){
   const text=base.source.slice(keep.slot.from,keep.slot.to),eol=/(\r\n|\r|\n)$/.exec(text)?.[0]
   const neighbor=neighbors.get(keep.slot)?.left,component=neighbor===undefined?undefined:dirty.get(neighbor)
   const step=component&&structuralStep(component)
   if(step!==undefined&&left.step!==undefined&&eol){
    const padding=text.slice(0,-eol.length);let width=0,at=0
    while(at<padding.length&&width<left.continuationIndent){width+=padding[at++]==='\t'?4-width%4:1}
    if(width===left.continuationIndent){
     drop.add(keep);before.set(keep,[generated('separator',eol,keep.anchor,step)])
     claims.push({from:keep.slot.from,to:keep.slot.to,kind:'separator',unitId:keep.slot.id,step})
    }
   }
  }
  if(needed&&!keep&&!left?.ownedBlank){
   const step=left?.step??right?.step
   if(step===undefined)fail()
   const target=run.find(a=>a.kind==='blank')??right
   if(!target)fail()
   before.set(target,[generated('separator','\n',target.anchor,step)])
   claims.push({from:target.anchor,to:target.anchor,kind:'anchor',step})
  }
  // A body terminal is physical content syntax, separate from blank units.
  if(left?.kind==='body'){
   const term=run.find(a=>a.kind==='terminator')
   const needTerm=!!right||run.some(a=>a.kind==='blank')
   if(term?.piece.kind==='generated'){
    term.piece.text=needTerm||term.piece.text?'\n':''
   }else if(!term&&needTerm){
    const target=atoms[l+1]
    const anchor=left.slot?.to??left.anchor,step=left.step??right?.step??run.find(a=>a.step!==undefined)?.step
    if(step===undefined)fail()
    const termAtom=generated('terminator','\n',anchor,step)
    if(target)before.set(target,[termAtom,...before.get(target)??[]]);else atoms.push(termAtom)
    claims.push({from:anchor,to:anchor,kind:'anchor',step})
   }
  }
 }
 const pieces:Piece[]=[]
 for(const atom of atoms){for(const extra of before.get(atom)??[])pieces.push(extra.piece);if(!drop.has(atom))pieces.push(atom.piece)}
 const kept=pieces.flatMap(p=>p.kind==='raw'?[p.identity]:[])
 return {claims,kept,pieces,edits:[],changedRoots:[...new Set(changedRoots)].sort((a,b)=>a-b),
  witnesses:components.flatMap(c=>c.witnesses)}
}
function verifyRecipe(base:SourceSession,recipe:Recipe):void {
 let at=0,text='',lastRaw=0
 const edits:SourceEdit[]=[]
 const boundary=(p:number)=>{
  if(p<0||p>base.source.length||!Number.isInteger(p))fail()
  if(p>0&&p<base.source.length&&((base.source[p-1]==='\r'&&base.source[p]==='\n')
   ||(/[\uD800-\uDBFF]/.test(base.source[p-1]!)&&/[\uDC00-\uDFFF]/.test(base.source[p]!))))fail()
 }
 const flush=(to:number)=>{
  if(to!==at||text){
   boundary(at);boundary(to)
   // Protected ranges cannot be rewritten even with byte-identical pieces.
   if(base.protectedSources.some(p=>at===to?p.sourceFrom<at&&at<p.sourceTo:p.sourceFrom<to&&p.sourceTo>at))fail()
   let covered=at
   for(const c of recipe.claims.filter(c=>c.to>c.from).sort((a,b)=>a.from-b.from)){
    if(c.from>covered)break
    if(c.to>covered)covered=c.to
   }
   if(covered<to)fail()
   if(to===at&&!recipe.claims.some(c=>c.from<=at&&c.to>=at))fail()
   edits.push({from:at,to,text})
  }
  at=to;text=''
 }
 for(const p of recipe.pieces){
  if(p.kind==='generated'){text+=p.text;continue}
  if(p.span.from<lastRaw||p.span.from!==p.identity.from||p.span.to!==p.identity.to)fail()
  flush(p.span.from);at=p.span.to;lastRaw=at
 }
 flush(base.source.length)
 for(const c of recipe.claims){
  const witness=recipe.witnesses.find(w=>w.step===c.step)
  if(!Number.isInteger(c.step)||!witness)fail()
  if(c.kind==='separator'||c.kind==='baseline-conversion'||c.kind==='terminator'){
   if(!structuralWitness(witness))fail()
  }
  if(c.kind==='blank'||c.kind==='separator'||c.kind==='baseline-conversion'){
   const unit=c.unitId===undefined?undefined:base.layout.blankLines[c.unitId]
   if(!unit||unit.sourceFrom!==c.from||unit.sourceTo!==c.to)fail()
   if((c.kind==='separator')!==(unit.role==='separator'))fail()
   if(c.kind==='baseline-conversion'&&(c.survivorChild===undefined||witness.before.to-witness.before.from<=witness.after.to-witness.after.from))fail()
  }
 }
 recipe.edits=edits
}
function applyRecipe(base:SourceSession,recipe:Recipe):string {
 const chunks:string[]=[];let at=0
 for(const edit of recipe.edits){chunks.push(base.source.slice(at,edit.from),edit.text);at=edit.to}
 chunks.push(base.source.slice(at));return chunks.join('')
}
export function applyStructuralTransaction(base:SourceSession,tr:Transaction,render:(nodes:PMNode[],positions:readonly number[])=>StructuralRendered,
 rootHasClosedFences:(root:SourceRoot)=>boolean):
 {source:string;edits:SourceEdit[];changedRoots:number[];unchanged:boolean} {
 const ledger=createLedger(base)
 for(let i=0;i<tr.steps.length;i++){
  const before=tr.docs[i]!,after=tr.docs[i+1]??tr.doc,step=tr.steps[i] as Step
  const result=step.apply(before)
  if(result.failed||!result.doc||after.type.schema!==base.doc.type.schema||!after.eq(result.doc))fail()
  advanceLedger(ledger,before,after,step,i)
 }
 tr.doc.check();finishLedger(base,tr,ledger)
 if(tr.doc.eq(base.doc)){
  const emission=(o:Origin):ChildRange=>{
   const e=o.kind==='root'?base.roots[o.id]!:o.kind==='fallback'?base.layout.fallback!.emission:
    base.layout.blankLines[o.id]!.role==='empty-paragraph'?(base.layout.blankLines[o.id] as {emission:{childFrom:number;childTo:number}}).emission:fail()
   return {from:e.childFrom,to:e.childTo}
  }
  const stable=ledger.children.every((lane,i)=>{
   if(lane.ref.kind==='base'){const e=emission(lane.ref.origin);return e.from<=i&&i<e.to}
   return true
  })
  const cancelled=ledger.components.filter(c=>c.parent===c.id).every(c=>{
   if(!c.origins.length)return !c.finalRuns.length
   const ranges=c.origins.map(emission).sort((a,b)=>a.from-b.from)
   return c.finalRuns.length===1&&c.finalRuns[0]!.from===ranges[0]!.from&&c.finalRuns[0]!.to===ranges.at(-1)!.to
    &&ranges.every((r,i)=>i===0||ranges[i-1]!.to===r.from)
  })
  if(stable&&cancelled)return {source:base.source,edits:[],changedRoots:[],unchanged:true}
 }
 const recipe=makeRecipe(base,ledger,partitionSlots(base),render,rootHasClosedFences)
 verifyRecipe(base,recipe)
 return {source:applyRecipe(base,recipe),edits:recipe.edits,changedRoots:recipe.changedRoots,unchanged:false}
}

/** Materialize one certified top-level empty origin without rendering any root. */
export function prepareEmptyParagraphEdits(base:SourceSession,tr:Transaction,
 origin:{kind:'blank';id:number}|{kind:'fallback'},body:string):readonly SourceEdit[] {
 const ledger=createLedger(base),first=tr.steps[0];
 if(!first||Object.getPrototypeOf(first)!==ReplaceStep.prototype||tr.steps.length!==tr.docs.length||!tr.before.eq(base.doc))fail()
 const initial=first as ReplaceStep,parent=base.doc.resolve(initial.from).parent
 initial.slice.content.forEach(node=>{if(!node.isText&&(tr.steps.length!==1||initial.slice.content.childCount!==1||node.type!==base.doc.type.schema.nodes.note_anchor||!node.isLeaf||node.nodeSize!==1||node.marks.length||typeof node.attrs.note!=='string'||/[\r\n]|<<}/.test(node.attrs.note)||!node.eq(node.type.create({note:node.attrs.note}))))fail()})
 if(initial.from!==initial.to||initial.slice.openStart||initial.slice.openEnd||!initial.slice.size||(initial as ReplaceStep&{structure:boolean}).structure||parent.type.name!=='paragraph'||parent.content.size)fail()
 for(let i=0;i<tr.steps.length;i++){
  const step=tr.steps[i]!,before=tr.docs[i]!,after=tr.docs[i+1]??tr.doc
  if(i===0&&!before.eq(base.doc))fail()
  if(i>0){
   const prototype=Object.getPrototypeOf(step)
   if(prototype!==AddMarkStep.prototype&&prototype!==RemoveMarkStep.prototype)fail()
   const mark=step as AddMarkStep|RemoveMarkStep
   if(mark.from<initial.from||mark.to>initial.from+initial.slice.size)fail()
  }
  const result=step.apply(before)
  if(result.failed||!result.doc?.eq(after))fail()
  advanceLedger(ledger,before,after,step as ReplaceStep|AddMarkStep|RemoveMarkStep,i)
 }
 finishLedger(base,tr,ledger)
 const components=ledger.components.filter(c=>c.parent===c.id),c=components[0]
 if(components.length!==1||!c||c.origins.length!==1||!sameOrigin(c.origins[0]!,origin)
  ||c.births.length||c.finalRuns.length!==1||c.finalRuns[0]!.to-c.finalRuns[0]!.from!==1)fail()
 const slots=partitionSlots(base),span=originSpan(base,origin)
 const chosen=origin.kind==='blank'?slots.find(s=>s.kind==='blank'&&s.id===origin.id):undefined
 if(origin.kind==='blank'&&!chosen)fail()
 const original=base.source.slice(span.from,span.to)
 const eol=/(\r\n|\r|\n)$/.exec(original)?.[0]
  ?? slots.map(s=>/(\r\n|\r|\n)$/.exec(base.source.slice(s.from,s.to))?.[0]).find(Boolean)??'\n'
 const tail=base.source.slice(span.to),next=slots.find(s=>s.from>=span.to&&['body','protected'].includes(s.kind))
 const between=next?base.source.slice(span.to,next.from):tail
 const previous=slots.filter(s=>s.to<=span.from&&['body','protected'].includes(s.kind)).at(-1)
 const prefix=chosen&&previous&&!/[\r\n][ \t]*(?:\r\n|\r|\n)$/.test(base.source.slice(previous.from,span.from))?eol:''
 const suffix=origin.kind==='blank'?(next&&!/[\r\n]/.test(between)?eol:''):
  (tail?(next&&next.from===span.to?eol+eol:eol):'')
 const claims:Claim[]=[{...span,kind:chosen?'blank':'anchor',step:0,...(chosen?{unitId:chosen.id}:{})}]
 const pieces:Piece[]=[],kept:Kept[]=[]
 const keep=(from:number,to:number)=>{
  if(from===to)return
  const identity:Kept={from,to,kind:'envelope',id:kept.length};kept.push(identity);pieces.push({kind:'raw',span:{from,to},identity})
 }
 keep(0,span.from)
 pieces.push({kind:'generated',text:prefix+body})
 if(chosen){
  const terminal=/(\r\n|\r|\n)$/.exec(original)?.[0];if(!terminal)fail()
  keep(span.to-terminal.length,span.to)
 }
 pieces.push({kind:'generated',text:suffix});keep(span.to,base.source.length)
 // The second insertion is witnessed at the selected origin's terminal edge.
 if(suffix&&chosen)claims.push({from:span.to,to:span.to,kind:'anchor',step:0})
 const recipe:Recipe={claims,kept,pieces,edits:[],changedRoots:[],witnesses:c.witnesses}
 verifyRecipe(base,recipe);return recipe.edits
}
