import {prepareEmptyBodyTransaction} from './source-empty-body'
import { prepareRawFileSourceEdits, createFileSourceSession, emptyFileParseWork, prepareVerifiedFileBase, finishUnchangedFile, prepareCandidate, preparePreservingSourceCandidate, type VerifiedFileBase } from './source-file-cache'
import { Fragment, type Node as PmNode, type ResolvedPos, type Schema } from 'prosemirror-model'
import { EditorState, type Transaction } from 'prosemirror-state'
import { AddMarkStep, RemoveMarkStep, ReplaceStep, Mapping } from 'prosemirror-transform'
import { serializeSourceRootMarkdown, serializeSourceInlineBody, capturedInlineBodies, capturedEmptyBodies, sourceRootHasClosedFences, capturedSourceLists, type SourceListStyle, type FileWorkAccumulator } from './markdown'
import type { SourceLayout, SourceListLexeme } from './source-layout'
import type { SourceRoot, SourceGap, SourceEdit, ProtectedSource } from './source-ownership'
import {classifyTransaction,applyStructuralTransaction,UnsupportedSourceStructure,type StructuralRendered} from './source-structure'

export type TextSourceSpan = Readonly<{
  sourceFrom: number; sourceTo: number
  pmFrom: number; pmTo: number
  kind: 'linear' | 'atomic'
}>
export type SourceSession = Readonly<{
  revision: number; source: string; doc: PmNode
  textSpans: readonly TextSourceSpan[]
  roots: readonly SourceRoot[]; gaps: readonly SourceGap[]
  protectedSources: readonly ProtectedSource[]
  layout: SourceLayout
}>
export type FidelityFailure = Readonly<{
  ok: false
  reason: 'unsupported-source' | 'parse-error' | 'stale-document'
    | 'unsupported-step' | 'unmapped-range' | 'semantic-mismatch'
}>
export type FidelityResult = { ok: true; session: SourceSession; file?: SourceFileUpdate } | FidelityFailure

export type SourcePatch = Readonly<{
  from: number; to: number; removed: string; text: string
}>
export type FileRootCorrespondence = Readonly<{
  beforeRoots: readonly number[]
  afterRoots: readonly number[]
  kind: 'untouched' | 'retained' | 'split' | 'join' | 'repartition' | 'birth' | 'deleted'
}>
export type FileParseWork = Readonly<{
  mode: 'unchanged' | 'local' | 'expanded' | 'full-fallback'
  fallbackReason?: 'cache-miss' | 'checkpoint-unproven' |
    'preprocess-unproven' | 'private-hook-unavailable'
  blockWindows: readonly Readonly<{sourceFrom:number;sourceTo:number}>[]
  blockParseCalls: number
  topLevelRunnerCalls: number
  blockRuleCalls: number
  nestedTokenizeCalls: number
  blockLinesVisited: number
  inlineParseCalls: number
  inlineInputUnits: number
  inlineRoots: readonly number[]
  rawTouchedBeforeRoots: readonly number[]
  environmentChanged: boolean
  legacyParseCalls: number
  fullCaptureCalls: number
  pmEmissionTokenCount: number
  preprocessedCodeUnits: number
  lineTableCodeUnits: number
  rawSplicedCodeUnits: number
  inlineEffectReplayCount: number
}>
export type SourceFileUpdate = Readonly<{
  environmentVersion: number
  correspondence: readonly FileRootCorrespondence[]
  work: FileParseWork
}>
export type FileSourceResult =
  | {ok:true; session:SourceSession; edits:readonly SourcePatch[]; file:SourceFileUpdate}
  | (FidelityFailure & {work:FileParseWork})
export function prepareFileSourceEdits(
  base:SourceSession,
  input:Readonly<{expectedRevision:number;edits:readonly SourcePatch[]}>
):FileSourceResult {
  return prepareRawFileSourceEdits(base,input)
}

/** Experimental: complete raw document with sparse writable paragraph spans. */
export function createSourceSession(source: string, schema?: Schema): FidelityResult {
  return createFileSourceSession(source, schema)
}

function splitsSurrogate(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length
    && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!)
}

// Inline atoms contribute PM positions but no textContent characters.
function splitsTextAt(doc: PmNode, pos: number): boolean {
  const resolved = doc.resolve(pos)
  let split = false
  resolved.parent.forEach((node, offset) => {
    if (node.isText && resolved.parentOffset > offset && resolved.parentOffset < offset + node.nodeSize) {
      split = split || splitsSurrogate(node.text!, resolved.parentOffset - offset)
    }
  })
  return split
}

function boundary(span: TextSourceSpan, pos: number): number | undefined {
  if (pos === span.pmFrom) return span.sourceFrom
  if (pos === span.pmTo) return span.sourceTo
  if (span.kind === 'linear') return span.sourceFrom + pos - span.pmFrom
  return undefined
}

// Sorted disjoint parser-consumed ranges permit one binary lookup per edit.
// Insertions at either boundary are allowed; strictly interior insertions are not.
function overlapsProtectedSource(base: SourceSession, from: number, to: number): boolean {
  const ranges = base.protectedSources
  let low = 0, high = ranges.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (ranges[middle]!.sourceTo <= from) low = middle + 1
    else high = middle
  }
  const range = ranges[low]
  return !!range && (from === to ? range.sourceFrom < from : range.sourceFrom < to)
}

type ExactTextResult = { ok: true; session: SourceSession; edit: SourceEdit; file: SourceFileUpdate } | FidelityFailure

/** Pure preparation: a failure never supplies output or mutates the base session. */
function applySourceTextTransactionWithEdit(base: SourceSession, tr: Transaction, context?: { verified: VerifiedFileBase; work: FileWorkAccumulator; verifyEdit?: (edit: SourceEdit) => void }): ExactTextResult {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: 'stale-document' }
  if (tr.steps.length !== 1) return { ok: false, reason: 'unsupported-step' }
  if (tr.storedMarksSet) return { ok: false, reason: 'unsupported-step' }
  const actual=tr.steps[0]!
  if(Object.getPrototypeOf(actual)!==ReplaceStep.prototype||tr.docs.length!==1||!tr.docs[0]!.eq(base.doc))return {ok:false,reason:'unsupported-step'}
  const applied=actual.apply(base.doc)
  if(applied.failed||!applied.doc?.eq(tr.doc))return {ok:false,reason:'unsupported-step'}
  const step=actual as ReplaceStep & {readonly structure:boolean}
  if (step.structure) return { ok: false, reason: 'unsupported-step' }
  const work = context?.work ?? emptyFileParseWork()
  const verified = context?.verified ?? prepareVerifiedFileBase(base, work)
  if ('ok' in verified) return verified
  base = verified.verifiedBase
  let { from, to } = step
  let textOnly=true;step.slice.content.forEach(node=>{if(!node.isText)textOnly=false})
  const owner=base.roots.find(root=>root.pmFrom<=from&&root.pmTo>=to)
  if(!owner||!sourceRootHasClosedFences(owner))return {ok:false,reason:'unsupported-step'}
  const $from = base.doc.resolve(from), $to = base.doc.resolve(to)
  if (!$from.sameParent($to) || !['paragraph','heading','code_block','frontmatter','html_block'].includes($from.parent.type.name)
    || to < from || step.slice.openStart || step.slice.openEnd || !textOnly) {
    return { ok: false, reason: 'unsupported-step' }
  }
  if (splitsTextAt(base.doc, from) || splitsTextAt(base.doc, to)) {
    return { ok: false, reason: 'unmapped-range' }
  }
  let spans = base.textSpans.filter(span => from === to
    ? span.pmFrom <= from && span.pmTo >= to : span.pmTo > from && span.pmFrom < to)
  if (!spans.length) return { ok: false, reason: 'unmapped-range' }
  if (from < to && (spans[0]!.pmFrom > from || spans[spans.length - 1]!.pmTo < to
    || spans.some((span, i) => i > 0 && spans[i - 1]!.pmTo !== span.pmFrom))) {
    return { ok: false, reason: 'unmapped-range' }
  }
  let insert='';step.slice.content.forEach(node=>{insert+=node.text!})
  // Audit the original replacement before reducing a literal consumer's whole-body Step.
  // Prefix/suffix comparison concerns only this already-authorized plain body.
  const literal=['code_block','frontmatter','html_block'].includes($from.parent.type.name)
  let plain=literal
  step.slice.content.forEach(node=>{if(node.marks.length)plain=false})
  if(plain)base.doc.nodesBetween(from,to,node=>{if(node.isText&&node.marks.length)plain=false})
  if(plain&&from<to){
    const originalFrom=boundary(spans[0]!,from),originalTo=boundary(spans[spans.length-1]!,to)
    if(originalFrom===undefined||originalTo===undefined||overlapsProtectedSource(base,originalFrom,originalTo))
      return {ok:false,reason:'unmapped-range'}
    const before=base.doc.textBetween(from,to)
    let prefix=0,suffix=0
    while(prefix<before.length&&prefix<insert.length&&before[prefix]===insert[prefix])prefix++
    while(splitsSurrogate(before,prefix)||splitsSurrogate(insert,prefix))prefix--
    while(suffix<before.length-prefix&&suffix<insert.length-prefix
      &&before[before.length-1-suffix]===insert[insert.length-1-suffix])suffix++
    while(splitsSurrogate(before,before.length-suffix)||splitsSurrogate(insert,insert.length-suffix))suffix--
    from+=prefix;to-=suffix;insert=insert.slice(prefix,insert.length-suffix)
    spans=base.textSpans.filter(span=>from===to?span.pmFrom<=from&&span.pmTo>=to:span.pmTo>from&&span.pmFrom<to)
    if(!spans.length)return {ok:false,reason:'unmapped-range'}
  }
  // An insertion at a syntax boundary is ambiguous.
  if (from === to && spans.some(span => boundary(span, from) !== boundary(spans[0]!, from))) {
    return { ok: false, reason: 'unmapped-range' }
  }
  const sourceFrom = boundary(spans[0]!, from)
  const sourceTo = boundary(spans[spans.length - 1]!, to)
  if (sourceFrom === undefined || sourceTo === undefined
    || spans.some((span, i) => i > 0 && spans[i - 1]!.sourceTo !== span.sourceFrom)
    || splitsSurrogate(base.source, sourceFrom) || splitsSurrogate(base.source, sourceTo)) {
    return { ok: false, reason: 'unmapped-range' }
  }
  if (overlapsProtectedSource(base, sourceFrom, sourceTo)) return { ok: false, reason: 'unsupported-step' }
  context?.verifyEdit?.({ from: sourceFrom, to: sourceTo, text: insert })
  const result = preparePreservingSourceCandidate(verified, [{ from: sourceFrom, to: sourceTo,
    removed: base.source.slice(sourceFrom, sourceTo), text: insert }], work, tr.doc)
  if (!result.ok) return { ok: false, reason: result.reason }
  return { ok: true, session: result.session, file: result.file,
    edit: { from: sourceFrom, to: sourceTo, text: insert } }
}

export function applySourceTextTransaction(base:SourceSession,tr:Transaction):FidelityResult {
 const result=applySourceTextTransactionWithEdit(base,tr)
 return result.ok?{ok:true,session:result.session,file:result.file}:result
}

export type SourceBlockResult =
 | {ok:true;session:SourceSession;mode:'unchanged'|'exact-text'|'fragment-render'|'root-render';
    edits:readonly SourceEdit[];changedRoots:readonly number[];file?:SourceFileUpdate}
 | FidelityFailure
class UnsupportedBlockTransaction extends Error {}
type ListOrigin={kind:string;style:SourceListStyle}
type ListShell={node:PmNode;pos:number;origins:readonly ListOrigin[]}
type ListItem={node:PmNode;pos:number;origins:readonly ListOrigin[]}
const isList=(node:PmNode)=>node.type.name==='bullet_list'||node.type.name==='ordered_list'
/** Pure lexical lineage, never root/slot authorization. Called only after the
 * standard step chain has been validated. Full replacements have no witnesses. */
function transactionListStyles(tr:Transaction,facts:readonly SourceListLexeme[],targets:readonly {node:PmNode;pos:number}[]):Map<number,SourceListStyle> {
 const ranges:{from:number;to:number}[]=[]
 for(const {node,pos} of targets){
  if(tr.doc.nodeAt(pos)!==node)throw new UnsupportedBlockTransaction()
  if(isList(node))ranges.push({from:pos,to:pos+node.nodeSize})
  node.descendants((child,offset)=>{if(isList(child))ranges.push({from:pos+1+offset,to:pos+1+offset+child.nodeSize})})
 }
 if(!ranges.length)return new Map()
 // This range filter only limits lexical work. It cannot authorize rendering;
 // the caller's natural-root or structural recipe guard does that separately.
 const chainMapping=new Mapping(tr.steps.map(step=>step.getMap()))
 const relevant=(pos:number,size:number,step:number)=>{
  const mapping=chainMapping.slice(step),from=mapping.map(pos,-1),to=mapping.map(pos+size,1)
  return ranges.some(r=>from<r.to&&to>r.from)
 }
 let shells:ListShell[]=facts.filter(f=>relevant(f.pmFrom,f.pmTo-f.pmFrom,0)).map(f=>{
  const node=tr.before.nodeAt(f.pmFrom)
  if(!node||node.type.name!==f.kind+'_list'||node.nodeSize!==f.pmTo-f.pmFrom)throw new UnsupportedBlockTransaction()
  return {node,pos:f.pmFrom,origins:[{kind:node.type.name,style:{marker:f.marker,tight:f.tight}}]}
 })
 let items:ListItem[]=shells.flatMap(shell=>{
  const result:ListItem[]=[];shell.node.forEach((node,offset)=>result.push({node,pos:shell.pos+1+offset,origins:shell.origins}));return result
 })
 for(let i=0;i<tr.steps.length;i++){
  const after=tr.docs[i+1]??tr.doc,map=tr.steps[i]!.getMap()
  const shellOrigins=new Map<number,readonly ListOrigin[]>(),itemOrigins=new Map<number,ListOrigin[]>()
  for(const shell of shells){
   const start=map.mapResult(shell.pos,1),end=map.mapResult(shell.pos+shell.node.nodeSize,-1),node=after.nodeAt(start.pos)
   if(!start.deleted&&!end.deleted&&!start.deletedAcross&&!end.deletedAcross&&node?.type===shell.node.type&&start.pos+node.nodeSize===end.pos)
    shellOrigins.set(start.pos,shell.origins)
  }
  // The two content boundaries are real retained fragments of a direct item.
  // Split maps them into separate items; join maps them into the surviving item.
  // Resolve the immediate list_item ancestry, never an ancestor list by ordinal.
  for(const item of items)for(const [pos,assoc] of [[item.pos+1,1],[item.pos+item.node.nodeSize-1,-1]] as const){
   const mapped=map.mapResult(pos,assoc)
   if(mapped.deletedAcross||mapped.deleted)continue
   {
    const resolved=after.resolve(mapped.pos)
    for(let depth=resolved.depth;depth>0;depth--)if(resolved.node(depth).type.name==='list_item'){
     const itemPos=resolved.before(depth),origins=itemOrigins.get(itemPos)??[]
     for(const origin of item.origins)if(!origins.includes(origin))origins.push(origin)
     itemOrigins.set(itemPos,origins);break
    }
   }
  }
  shells=[];items=[]
  after.descendants((node,pos)=>{
   if(!isList(node)||!relevant(pos,node.nodeSize,i+1))return
   const origins:ListOrigin[]=[...shellOrigins.get(pos)??[]]
   // A fully surviving container keeps its own lexical style when a child is
   // lifted into it. A real sibling join has no complete old shell boundary,
   // so its ordered direct-item witnesses still select left marker/looseness.
   if(!origins.length)node.forEach((_item,offset)=>{for(const origin of itemOrigins.get(pos+1+offset)??[])if(origin.kind===node.type.name&&!origins.includes(origin))origins.push(origin)})
   if(!origins.length)origins.push({kind:node.type.name,style:{marker:node.type.name==='bullet_list'?'-':'.',tight:true}})
   const current:ListOrigin={kind:node.type.name,style:{marker:origins[0]!.style.marker,tight:origins.every(o=>o.style.tight)}}
   shells.push({node,pos,origins:[current]})
   // Further steps split/join this actual container, not an item's former
   // ancestor. Rebind after each proven transition rather than carrying a
   // lifted child's old inner style through a subsequent outer split.
   node.forEach((item,offset)=>items.push({node:item,pos:pos+1+offset,origins:[current]}))
  })
 }
 return new Map(shells.map(s=>[s.pos,{marker:s.origins[0]!.style.marker,tight:s.origins.every(o=>o.style.tight)}]))
}
type RootIndex={rootById:readonly SourceRoot[];ownerByChild:readonly (SourceRoot|undefined)[]}
function indexSourceRoots(base:SourceSession):RootIndex {
 const rootById=base.roots
 const ownerByChild:(SourceRoot|undefined)[]=new Array(base.doc.childCount)
 let previousChildTo=0
 for(let id=0;id<rootById.length;id++) {
  const root=rootById[id]!
  if(root.id!==id||!Number.isInteger(root.childFrom)||!Number.isInteger(root.childTo)
   ||root.childFrom<previousChildTo||root.childTo<=root.childFrom||root.childTo>base.doc.childCount)
   throw new UnsupportedBlockTransaction()
  for(let child=root.childFrom;child<root.childTo;child++)ownerByChild[child]=root
  previousChildTo=root.childTo
 }
 return {rootById,ownerByChild}
}
function splitsInlineText(position:ResolvedPos):boolean {
 if(!position.textOffset)return false
 const node=position.parent.child(position.index())
 return node.isText&&splitsSurrogate(node.text!,position.textOffset)
}
function authorizeStepRoots(before:PmNode,step:AddMarkStep|RemoveMarkStep|ReplaceStep,
 ownership:RootIndex,authorized:Set<number>):void {
 const {from,to}=step
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>before.content.size)
  throw new UnsupportedBlockTransaction()
 const a=before.resolve(from),b=before.resolve(to)
 if(splitsInlineText(a)||splitsInlineText(b))throw new UnsupportedBlockTransaction()
 if(step instanceof ReplaceStep) {
  if((step as ReplaceStep & {readonly structure:boolean}).structure||!a.sameParent(b)||!a.parent.inlineContent||step.slice.openStart||step.slice.openEnd)
   throw new UnsupportedBlockTransaction()
  let inline=true;step.slice.content.forEach(node=>{if(!node.isInline)inline=false})
  if(!inline)throw new UnsupportedBlockTransaction()
 }else if(from===to)return
 // index(0) is resolved by PM in this step's actual before doc. A nonempty
 // half-open range ending at a doc-level boundary excludes the next child.
 const first=a.index(0)
 const last=from===to?first:b.index(0)-(b.depth===0?1:0)
 if(first<0||last<first||last>=before.childCount)throw new UnsupportedBlockTransaction()
 for(let child=first;child<=last;child++) {
  const root=ownership.ownerByChild[child]
  if(!root)throw new UnsupportedBlockTransaction()
  authorized.add(root.id)
 }
}
function changedNaturalRoots(base:SourceSession,tr:Transaction,ownership:RootIndex):number[] {
 const authorized=new Set<number>()
 for(let i=0;i<tr.steps.length;i++) {
  const step=tr.steps[i]!,prototype=Object.getPrototypeOf(step)
  // Exact prototypes exclude custom Step subclasses whose apply() need not
  // obey the range or structure guarantees of their inherited JSON format.
  if(prototype!==ReplaceStep.prototype&&prototype!==AddMarkStep.prototype&&prototype!==RemoveMarkStep.prototype)
   throw new UnsupportedBlockTransaction()
  const before=tr.docs[i]!
  if(before.childCount!==base.doc.childCount)throw new UnsupportedBlockTransaction()
  authorizeStepRoots(before,step as ReplaceStep|AddMarkStep|RemoveMarkStep,ownership,authorized)
 }
 // Standard mark steps preserve structure. A same-inline-parent ReplaceStep
 // with a closed inline slice preserves all top-child boundaries by induction.
 // Final document markup and actual changed ownership are checked once.
 if(!base.doc.sameMarkup(tr.doc)||base.doc.childCount!==tr.doc.childCount)
  throw new UnsupportedBlockTransaction()
 const changed=new Set<number>()
 base.doc.forEach((node,_offset,child)=>{
  const next=tr.doc.child(child)
  if(!node.sameMarkup(next))throw new UnsupportedBlockTransaction()
  if(node.eq(next))return
  const root=ownership.ownerByChild[child]
  if(!root||!authorized.has(root.id))throw new UnsupportedBlockTransaction()
  changed.add(root.id)
 })
 return ownership.rootById.filter(root=>changed.has(root.id)).map(root=>root.id)
}
const renderableRoots=new Set(['paragraph_open','heading_open','bullet_list_open','ordered_list_open',
 'blockquote_open','table_open','footnote_reference_open','dl_open','hr',
 'fence','code_block','front_matter','html_block','math_block','math_block_eqno'])
// Render-only nesting: splitting ==highlight== before a leading space emits
// invalid Markdown. Keep it outside adjacent strong/em marks in this fragment;
// the intended document and its schema-ranked marks remain untouched.
function rootRenderNode(node: PmNode, pos:number, styles:ReadonlyMap<number,SourceListStyle>, bindings: {node:PmNode;style:SourceListStyle}[]): PmNode {
  const children: PmNode[] = []
  node.forEach((child,offset) => children.push(rootRenderNode(child,pos+1+offset,styles,bindings)))
  // A list render copy is occurrence-specific, even if the target deliberately
  // reuses the same immutable PM node at multiple positions.
  const rendered = node.isLeaf ? node : isList(node)
    ? node.type.create(node.attrs,Fragment.fromArray(children),node.marks)
    : node.copy(Fragment.fromArray(children))
  if(isList(node)){
    const style=styles.get(pos);if(!style)throw new UnsupportedBlockTransaction()
    bindings.push({node:rendered,style})
  }
  const highlight = rendered.marks.findIndex(mark =>
    mark.type.name === 'highlight' && mark.attrs.delimiter === 'equals')
  if (highlight < 1) return rendered
  let outer = highlight
  while (outer > 0 && ['strong', 'em'].includes(rendered.marks[outer - 1]!.type.name)) outer--
  if (outer === highlight) return rendered
  const marks = [...rendered.marks]
  marks.splice(outer, 0, marks.splice(highlight, 1)[0]!)
  return rendered.mark(marks)
}
function endsInTerminalHardbreak(node:PmNode):boolean {
 if(node.inlineContent){
  const last=node.lastChild
  return last?.type.name==='hardbreak'&&last.attrs.isInline===false
 }
 // Only container endings exercised through actual paragraph block rules.
 if(!['doc','bullet_list','ordered_list','list_item','blockquote'].includes(node.type.name))return false
 const last=node.lastChild;return !!last&&endsInTerminalHardbreak(last)
}
function renderChangedRoot(base:SourceSession,doc:PmNode,root:SourceRoot,styles:ReadonlyMap<number,SourceListStyle>):string {
 if(overlapsProtectedSource(base,root.sourceFrom,root.sourceTo)||!renderableRoots.has(root.tokenType))throw new UnsupportedBlockTransaction()
 if(!sourceRootHasClosedFences(root))throw new UnsupportedBlockTransaction()
 const nodes:PmNode[]=[],lists:{node:PmNode;style:SourceListStyle}[]=[]
 doc.forEach((node,pos,index)=>{if(index>=root.childFrom&&index<root.childTo)nodes.push(rootRenderNode(node,pos,styles,lists))})
 let generated=serializeSourceRootMarkdown(doc.type.create(doc.attrs,Fragment.fromArray(nodes)),{lists})
 const last=nodes[nodes.length-1]!,tail=base.source.slice(root.tailFrom,root.sourceTo)
 if(last.type.name==='table'){
  if(!generated.endsWith('\n')||generated.endsWith('\n\n'))throw new UnsupportedBlockTransaction()
  generated=generated.slice(0,-1)
 }else if(endsInTerminalHardbreak(last)&&/^(?:\r\n|\r|\n)/.test(tail)){
  if(!generated.endsWith('\n'))throw new UnsupportedBlockTransaction()
  // This one generated EOL represents the same final physical content-line
  // terminator already held by the original root tail. Keep original bytes.
  generated=generated.slice(0,-1)
 }
 return generated+tail
}
function applySourceEdits(base:SourceSession,edits:readonly SourceEdit[],ids:readonly number[],ownership:RootIndex):string {
 const authorized=ids.map(id=>ownership.rootById[id]!)
 let at=0,ownerIndex=0
 const chunks:string[]=[]
 for(const edit of edits) {
  // ids and edits are in raw source order; each authorized root is visited at most once.
  while(ownerIndex<authorized.length&&authorized[ownerIndex]!.sourceTo<edit.to)ownerIndex++
  const owner=authorized[ownerIndex]
  if(overlapsProtectedSource(base,edit.from,edit.to)||!owner||owner.sourceFrom>edit.from||owner.sourceTo<edit.to
   ||edit.from<at||edit.to<edit.from||edit.to>base.source.length
   ||splitsSurrogate(base.source,edit.from)||splitsSurrogate(base.source,edit.to))
   throw new UnsupportedBlockTransaction()
  chunks.push(base.source.slice(at,edit.from),edit.text);at=edit.to
 }
 chunks.push(base.source.slice(at))
 return chunks.join('')
}
// Only this declared single-body recipe grants inline render authority.
function plainMarkBody(base:SourceSession,tr:Transaction):SourceEdit|undefined {
 if(tr.steps.length!==1)return undefined
 const step=tr.steps[0]!
 if(!(step instanceof AddMarkStep||step instanceof RemoveMarkStep)||!['strong','em'].includes(step.mark.type.name))return undefined
 const from=base.doc.resolve(step.from),to=base.doc.resolve(step.to)
 if(!from.sameParent(to)||!['paragraph','heading'].includes(from.parent.type.name))return undefined
 const plain=(node:PmNode)=>{let ok=true;node.forEach(child=>{if(!child.isText||child.marks.some(mark=>!['strong','em'].includes(mark.type.name)))ok=false});return ok}
 if(!plain(from.parent))return undefined
 // Plain single-body marks with incomplete/missing authority must fail closed.
 if(from.parentOffset!==0||to.parentOffset!==from.parent.content.size)return undefined
 const after=tr.doc.resolve(step.from),end=tr.doc.resolve(step.to)
 if(!after.sameParent(end)||from.depth!==after.depth||!plain(after.parent))throw new UnsupportedBlockTransaction()
 for(let depth=0;depth<=from.depth;depth++)if(!from.node(depth).sameMarkup(after.node(depth)))throw new UnsupportedBlockTransaction()
 const body=capturedInlineBodies(base.source,base.doc,base.roots,base.layout)?.find(b=>b.pmFrom===step.from&&b.pmTo===step.to)
 if(!body)return undefined
 if(!body.singlePhysicalLine||overlapsProtectedSource(base,body.sourceFrom,body.sourceTo))throw new UnsupportedBlockTransaction()
 return {from:body.sourceFrom,to:body.sourceTo,text:serializeSourceInlineBody(after.parent)}
}

export function applySourceBlockTransaction(base:SourceSession,tr:Transaction):SourceBlockResult {
 if(!tr.before.eq(base.doc))return {ok:false,reason:'stale-document'}
 try {
  const work=emptyFileParseWork(),verified=prepareVerifiedFileBase(base,work)
  if('ok' in verified)throw new UnsupportedBlockTransaction()
  base=verified.verifiedBase
  const facts=capturedSourceLists(base.source,base.doc,base.roots,base.layout)
  if(!facts)throw new UnsupportedBlockTransaction()
  const authority={facts}
  if(tr.docs.length!==tr.steps.length)throw new UnsupportedBlockTransaction()
  const classification=classifyTransaction(base,tr)
  // Validate the actual standard chain before metadata mapping or rendering.
  for(let i=0;i<tr.steps.length;i++){
   const before=tr.docs[i]!,after=tr.docs[i+1]??tr.doc
   if(i===0&&!before.eq(base.doc))throw new UnsupportedBlockTransaction()
   const result=tr.steps[i]!.apply(before)
   if(result.failed||!result.doc||!result.doc.eq(after))throw new UnsupportedBlockTransaction()
  }
  tr.doc.check()
  const empty=prepareEmptyBodyTransaction(base,tr,capturedEmptyBodies(base.source,base.doc,base.roots,base.layout)??[])
  if(empty.kind==='unsupported')throw new UnsupportedBlockTransaction()
  if(empty.kind==='ready'){
   const edits=[...empty.recipe.edits],changedRoots=[...empty.recipe.changedRoots]
   const parsed=preparePreservingSourceCandidate(verified,edits.map(edit=>({...edit,removed:base.source.slice(edit.from,edit.to)})),work,tr.doc)
   if(!parsed.ok)return {ok:false,reason:parsed.reason}
   return {ok:true,session:parsed.session,file:parsed.file,mode:'fragment-render',edits,changedRoots}
  }
  if(classification==='structural'){
   const render=(nodes:PmNode[],positions:readonly number[]):StructuralRendered=>{
    const lists:{node:PmNode;style:SourceListStyle}[]=[],styles=transactionListStyles(tr,authority.facts,nodes.map((node,i)=>({node,pos:positions[i]!}))),rendered=nodes.map((node,i)=>rootRenderNode(node,positions[i]!,styles,lists)),doc=tr.doc.type.create(tr.doc.attrs,Fragment.fromArray(rendered))
    const text=serializeSourceRootMarkdown(doc,{lists}),last=rendered[rendered.length-1]!
    return {text,terminal:last.type.name==='table'||endsInTerminalHardbreak(last)?'content-eol':'none',
     family:last.type.name==='table'?'table':['paragraph','heading','bullet_list','ordered_list','blockquote','horizontal_rule'].includes(last.type.name)?'flow':'closed-literal',eol:'\n'}
   }
   const result=applyStructuralTransaction(base,tr,render,sourceRootHasClosedFences)
   if(result.unchanged)return {...finishUnchangedFile(verified,work),mode:'unchanged',edits:[],changedRoots:[]}
   const parsed=prepareCandidate(verified,result.edits.map(edit=>({...edit,removed:base.source.slice(edit.from,edit.to)})),work,tr.doc)
   if(!parsed.ok)return {ok:false,reason:parsed.reason}
   return {ok:true,session:parsed.session,file:parsed.file,mode:'root-render',edits:result.edits,changedRoots:result.changedRoots}
  }
  const ownership=indexSourceRoots(base)
  const changedRoots=changedNaturalRoots(base,tr,ownership)
  if(!changedRoots.length) {
   if(!tr.doc.eq(base.doc))return {ok:false,reason:'unsupported-step'}
   return {...finishUnchangedFile(verified,work),mode:'unchanged',edits:[],changedRoots:[]}
  }
  if(changedRoots.some(id=>!sourceRootHasClosedFences(ownership.rootById[id]!)))throw new UnsupportedBlockTransaction()
  // Only a single ReplaceStep can satisfy the old exact API. Replay this one
  // document step to remove stored-mark bookkeeping without touching the caller.
  if(tr.steps.length===1&&tr.steps[0] instanceof ReplaceStep) {
   const replay=EditorState.create({doc:base.doc}).tr.step(tr.steps[0]!)
   if(!replay.doc.eq(tr.doc))return {ok:false,reason:'unsupported-step'}
   const exact=applySourceTextTransactionWithEdit(base,replay,{verified,work,verifyEdit:edit=>{applySourceEdits(base,[edit],changedRoots,ownership)}})
   if(exact.ok) {
    const edits=[exact.edit]
    return {ok:true,session:exact.session,file:exact.file,mode:'exact-text',edits,changedRoots}
   }
   const step=tr.steps[0] as ReplaceStep,from=base.doc.resolve(step.from),to=base.doc.resolve(step.to)
   let ordinary=true;step.slice.content.forEach(node=>{if(!node.isText||!node.hasMarkup(node.type,null,from.marks()))ordinary=false})
   const supportedMarks=from.marks().every(mark=>['strong','em','link','annotation','html_mark','highlight','strike_through'].includes(mark.type.name))
   if(from.sameParent(to)&&['paragraph','heading','code_block','frontmatter','html_block'].includes(from.parent.type.name)&&ordinary&&supportedMarks
    &&(['code_block','frontmatter','html_block'].includes(from.parent.type.name)||exact.reason==='unmapped-range'||step.to-step.from<=1&&step.slice.size<=1))return exact
  }
  const fragment=plainMarkBody(base,tr)
  if(fragment){
   applySourceEdits(base,[fragment],changedRoots,ownership)
   const parsed=preparePreservingSourceCandidate(verified,[{...fragment,removed:base.source.slice(fragment.from,fragment.to)}],work,tr.doc)
   if(!parsed.ok)return {ok:false,reason:parsed.reason}
   return {ok:true,session:parsed.session,file:parsed.file,mode:'fragment-render',edits:[fragment],changedRoots}
  }
  // Exact rejection is not authorization: changedNaturalRoots has already
  // proved step kinds, real ranges, stable root identity and ownership.
  const targets:{node:PmNode;pos:number}[]=[]
  tr.doc.forEach((node,pos,index)=>{if(changedRoots.some(id=>{const root=ownership.rootById[id]!;return index>=root.childFrom&&index<root.childTo}))targets.push({node,pos})})
  const styles=transactionListStyles(tr,authority.facts,targets)
  const edits=changedRoots.map(id=>{
   const root=ownership.rootById[id]!
   return {from:root.sourceFrom,to:root.sourceTo,text:renderChangedRoot(base,tr.doc,root,styles)}
  })
  applySourceEdits(base,edits,changedRoots,ownership)
  const parsed=prepareCandidate(verified,edits.map(edit=>({...edit,removed:base.source.slice(edit.from,edit.to)})),work,tr.doc)
  if(!parsed.ok)return {ok:false,reason:parsed.reason}
  return {ok:true,session:parsed.session,file:parsed.file,mode:'root-render',edits,changedRoots}
 }catch(error) {
  if(error instanceof UnsupportedBlockTransaction||error instanceof UnsupportedSourceStructure)return {ok:false,reason:'unsupported-step'}
  return {ok:false,reason:'parse-error'}
 }
}
