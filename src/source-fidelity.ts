import { Fragment, type Node as PmNode, type ResolvedPos, type Schema } from 'prosemirror-model'
import { EditorState, type Transaction } from 'prosemirror-state'
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from 'prosemirror-transform'
import { parseDocumentWithSourceCapture, serializeMarkdown } from './markdown'
import type { SourceLayout } from './source-layout'
import type { SourceRoot, SourceGap, SourceEdit, ProtectedSource } from './source-ownership'

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
export type FidelityResult = { ok: true; session: SourceSession } | FidelityFailure

/** Experimental: complete raw document with sparse writable paragraph spans. */
export function createSourceSession(source: string, schema?: Schema): FidelityResult {
  const parsed = parseDocumentWithSourceCapture(source, schema)
  if (!parsed.ok) return parsed
  return { ok: true, session: { revision: 0, source, doc: parsed.value.doc, textSpans: parsed.value.textRuns,
    roots: parsed.value.roots, gaps: parsed.value.gaps, protectedSources: parsed.value.protectedSources, layout: parsed.value.layout } }
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

type ExactTextResult = { ok: true; session: SourceSession; edit: SourceEdit } | FidelityFailure

/** Pure preparation: a failure never supplies output or mutates the base session. */
function applySourceTextTransactionWithEdit(base: SourceSession, tr: Transaction): ExactTextResult {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: 'stale-document' }
  if (tr.steps.length !== 1) return { ok: false, reason: 'unsupported-step' }
  if (tr.storedMarksSet) return { ok: false, reason: 'unsupported-step' }
  const step = tr.steps[0]!.toJSON()
  if (step.stepType !== 'replace' || step.structure) return { ok: false, reason: 'unsupported-step' }
  const { from, to } = step as { from: number; to: number }
  const $from = base.doc.resolve(from), $to = base.doc.resolve(to)
  if ($from.depth !== 1 || !$from.sameParent($to) || $from.parent.type.name !== 'paragraph'
    || to < from || step.slice?.openStart || step.slice?.openEnd
    || step.slice?.content?.some((node: { type: string }) => node.type !== 'text')) {
    return { ok: false, reason: 'unsupported-step' }
  }
  if (splitsTextAt(base.doc, from) || splitsTextAt(base.doc, to)) {
    return { ok: false, reason: 'unmapped-range' }
  }
  const spans = base.textSpans.filter(span => from === to
    ? span.pmFrom <= from && span.pmTo >= to : span.pmTo > from && span.pmFrom < to)
  if (!spans.length) return { ok: false, reason: 'unmapped-range' }
  if (from < to && (spans[0]!.pmFrom > from || spans[spans.length - 1]!.pmTo < to
    || spans.some((span, i) => i > 0 && spans[i - 1]!.pmTo !== span.pmFrom))) {
    return { ok: false, reason: 'unmapped-range' }
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
  const insert = (step.slice?.content ?? []).map((node: { text: string }) => node.text).join('')
  const candidate = base.source.slice(0, sourceFrom) + insert + base.source.slice(sourceTo)
  const result = createSourceSession(candidate, base.doc.type.schema)
  if (!result.ok || !result.session.doc.eq(tr.doc)) return { ok: false, reason: 'semantic-mismatch' }
  return { ok: true, session: { ...result.session, revision: base.revision + 1 },
    edit: { from: sourceFrom, to: sourceTo, text: insert } }
}

export function applySourceTextTransaction(base:SourceSession,tr:Transaction):FidelityResult {
 const result=applySourceTextTransactionWithEdit(base,tr)
 return result.ok?{ok:true,session:result.session}:result
}

export type SourceBlockResult =
 | {ok:true;session:SourceSession;mode:'unchanged'|'exact-text'|'root-render';
    edits:readonly SourceEdit[];changedRoots:readonly number[]}
 | FidelityFailure
class UnsupportedBlockTransaction extends Error {}
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
function rootRenderNode(node: PmNode): PmNode {
  const children: PmNode[] = []
  node.forEach(child => children.push(rootRenderNode(child)))
  const rendered = node.isLeaf ? node : node.copy(Fragment.fromArray(children))
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
function renderChangedRoot(base:SourceSession,doc:PmNode,root:SourceRoot):string {
 if(overlapsProtectedSource(base,root.sourceFrom,root.sourceTo)||!renderableRoots.has(root.tokenType))throw new UnsupportedBlockTransaction()
 const nodes:PmNode[]=[]
 for(let i=root.childFrom;i<root.childTo;i++)nodes.push(rootRenderNode(doc.child(i)))
 let generated=serializeMarkdown(doc.type.create(doc.attrs,Fragment.fromArray(nodes)))
 const last=nodes[nodes.length-1]!
 if(last.type.name==='table') {
  // Contract of the existing renderTableRow/table serializer, generated text only.
  if(!generated.endsWith('\n')||generated.endsWith('\n\n'))throw new UnsupportedBlockTransaction()
  generated=generated.slice(0,-1)
 }
 return generated+base.source.slice(root.tailFrom,root.sourceTo)
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
export function applySourceBlockTransaction(base:SourceSession,tr:Transaction):SourceBlockResult {
 if(!tr.before.eq(base.doc))return {ok:false,reason:'stale-document'}
 try {
  const ownership=indexSourceRoots(base)
  const changedRoots=changedNaturalRoots(base,tr,ownership)
  if(!changedRoots.length) {
   if(!tr.doc.eq(base.doc))return {ok:false,reason:'unsupported-step'}
   return {ok:true,session:base,mode:'unchanged',edits:[],changedRoots:[]}
  }
  // Only a single ReplaceStep can satisfy the old exact API. Replay this one
  // document step to remove stored-mark bookkeeping without touching the caller.
  if(tr.steps.length===1&&tr.steps[0] instanceof ReplaceStep) {
   const replay=EditorState.create({doc:base.doc}).tr.step(tr.steps[0]!)
   if(!replay.doc.eq(tr.doc))return {ok:false,reason:'unsupported-step'}
   const exact=applySourceTextTransactionWithEdit(base,replay)
   if(exact.ok) {
    const edits=[exact.edit]
    if(applySourceEdits(base,edits,changedRoots,ownership)!==exact.session.source)
     return {ok:false,reason:'semantic-mismatch'}
    return {ok:true,session:exact.session,mode:'exact-text',edits,changedRoots}
   }
  }
  // Exact rejection is not authorization: changedNaturalRoots has already
  // proved step kinds, real ranges, stable root identity and ownership.
  const edits=changedRoots.map(id=>{
   const root=ownership.rootById[id]!
   return {from:root.sourceFrom,to:root.sourceTo,text:renderChangedRoot(base,tr.doc,root)}
  })
  const source=applySourceEdits(base,edits,changedRoots,ownership)
  const parsed=createSourceSession(source,base.doc.type.schema)
  if(!parsed.ok||!parsed.session.doc.eq(tr.doc))return {ok:false,reason:'semantic-mismatch'}
  return {ok:true,session:{...parsed.session,revision:base.revision+1},
   mode:'root-render',edits,changedRoots}
 }catch(error) {
  if(error instanceof UnsupportedBlockTransaction)return {ok:false,reason:'unsupported-step'}
  return {ok:false,reason:'parse-error'}
 }
}
