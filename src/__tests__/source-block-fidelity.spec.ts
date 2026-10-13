import {expect,it,vi} from 'vitest'
import {EditorState,type Transaction} from 'prosemirror-state'
import {Node as PmNode,Slice,Fragment,Schema} from 'prosemirror-model'
import {AddMarkStep,RemoveMarkStep,ReplaceStep} from 'prosemirror-transform'
import {applySourceBlockTransaction,createSourceSession,type SourceSession,type SourceBlockResult} from '../source-fidelity'
import {defaultSchema} from '../schema'
function open(source:string):SourceSession {
 const r=createSourceSession(source);expect(r.ok).toBe(true)
 if(!r.ok)throw new Error(r.reason)
 return r.session
}
function pos(doc:PmNode,needle:string,n=0):number {
 const found:number[]=[]
 doc.descendants((node,p)=>{
  if(!node.isText)return
  let i=-1;while((i=node.text!.indexOf(needle,i+1))>=0)found.push(p+i)
 })
 if(found[n]===undefined)throw new Error('fixture text missing: '+needle)
 return found[n]!
}
function transaction(base:SourceSession) {return EditorState.create({doc:base.doc}).tr}
function fingerprint(base:SourceSession) {
 return JSON.stringify({source:base.source,revision:base.revision,doc:base.doc.toJSON(),
  spans:base.textSpans,roots:base.roots,gaps:base.gaps})
}
function accept(base:SourceSession,tr:Transaction) {
 const before=fingerprint(base),r=applySourceBlockTransaction(base,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.reason)
 expect(fingerprint(base)).toBe(before)
 expect(r.session.doc.eq(tr.doc)).toBe(true)
 let raw=0,out=0
 for(const edit of r.edits) {
  const untouched=base.source.slice(raw,edit.from)
  expect(Buffer.from(r.session.source.slice(out,out+untouched.length))).toEqual(Buffer.from(untouched))
  out+=untouched.length
  expect(r.session.source.slice(out,out+edit.text.length)).toBe(edit.text)
  out+=edit.text.length;raw=edit.to
  expect(r.changedRoots.some(id=>{
   const root=base.roots.find(x=>x.id===id)!
   return root.sourceFrom<=edit.from&&root.sourceTo>=edit.to
  })).toBe(true)
 }
 expect(Buffer.from(r.session.source.slice(out))).toEqual(Buffer.from(base.source.slice(raw)))
 expect(r.session.revision).toBe(base.revision+(r.mode==='unchanged'?0:1))
 return r
}
function reject(base:SourceSession,tr:Transaction):SourceBlockResult {
 const before=fingerprint(base),r=applySourceBlockTransaction(base,tr)
 expect(r.ok).toBe(false);expect('session' in r).toBe(false)
 expect(fingerprint(base)).toBe(before)
 return r
}
it('keeps ordinary single-character exact splice before root rendering',()=>{
 const b=open('首段保持。\r\n\r\n目标甲。第二句  __保持__。\r\n'),p=pos(b.doc,'甲')
 const r=accept(b,transaction(b).insertText('乙',p,p+1))
 expect(r.mode).toBe('exact-text')
 expect(r.session.source).toBe(b.source.replace('甲','乙'))
 expect(r.edits).toEqual([{from:b.source.indexOf('甲'),to:b.source.indexOf('甲')+1,text:'乙'}])
})
it.each([
 'Alpha beta','## Alpha beta','* Alpha\n  + nested\n* Beta',
 '> Alpha\n>\n> Beta','| A | B |\n| :- | -: |\n| Alpha | Beta |',
 '[^a]: Alpha','Term\n: Alpha','{==Alpha beta==}{>>owner note<<}',
 '<em>Alpha beta</em>','==Alpha beta==','Alpha $x$ beta',
 'Alpha  \nBeta','[Alpha](/u "title")','  Alpha beta',
])('renders only the changed natural root: %s',head=>{
 const raw=head+'\n\nUntouched *raw* tail\r\n',b=open(raw),p=pos(b.doc,'Alpha')
 const tr=transaction(b).addMark(p,p+5,b.doc.type.schema.marks.strong!.create())
 expect(tr.steps[0]!.getMap().ranges).toEqual([])
 const r=accept(b,tr)
 const wholeBody=['| A | B |\n| :- | -: |\n| Alpha | Beta |','* Alpha\n  + nested\n* Beta','> Alpha\n>\n> Beta','[^a]: Alpha','Term\n: Alpha'].includes(head)
 expect(r.mode).toBe(wholeBody?'fragment-render':'root-render')
 if(wholeBody)expect(r.session.source).toBe(raw.replace('Alpha','**Alpha**'))
 expect(r.changedRoots).toEqual([b.roots[0]!.id])
 expect(r.edits).toHaveLength(1)
 expect(r.session.source.endsWith(raw.slice(b.roots[0]!.sourceTo))).toBe(true)
})
it.each([12,24,48,80,160])('production addMark across %i roots produces per-root steps without per-step document scans',count=>{
 const source=Array.from({length:count},(_,i)=>'P'+i).join('\n\n')
 const base=open(source)
 const tr=transaction(base).addMark(1,base.doc.content.size-1,base.doc.type.schema.marks.strong!.create())
 expect(tr.steps).toHaveLength(count)
 expect(tr.steps.every(step=>Object.getPrototypeOf(step)===AddMarkStep.prototype)).toBe(true)
 expect(tr.steps.every(step=>step.getMap().ranges.length===0)).toBe(true)
 const priorDocs=new Set(tr.docs)
 const originalForEach=PmNode.prototype.forEach,originalChild=PmNode.prototype.child,originalEq=Fragment.prototype.eq
 const priorContents=new Set(tr.docs.map(doc=>doc.content));let wholeDocumentComparisons=0
 const eqSpy=vi.spyOn(Fragment.prototype,'eq').mockImplementation(function(this:Fragment,other){
  if(priorContents.has(this))wholeDocumentComparisons++
  return originalEq.call(this,other)
 })
 let inspectedTopChildren=0
 const eachSpy=vi.spyOn(PmNode.prototype,'forEach').mockImplementation(function(this:PmNode,callback){
  if(priorDocs.has(this))inspectedTopChildren+=this.childCount
  return originalForEach.call(this,callback)
 })
 const childSpy=vi.spyOn(PmNode.prototype,'child').mockImplementation(function(this:PmNode,index){
  if(priorDocs.has(this))inspectedTopChildren++
  return originalChild.call(this,index)
 })
 let result:SourceBlockResult
 try{result=applySourceBlockTransaction(base,tr)}finally{eachSpy.mockRestore();childSpy.mockRestore();eqSpy.mockRestore()}
 expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.reason)
 expect(result.changedRoots).toEqual(Array.from({length:count},(_,i)=>i))
 expect(result.edits).toHaveLength(count)
 expect(result.session.source).toBe(Array.from({length:count},(_,i)=>'**P'+i+'**').join('\n\n'))
 // Count this adapter's old-doc child accesses, not wall time or PM's native findIndex loop.
 expect(inspectedTopChildren).toBeLessThanOrEqual(count*12+32)
 expect(wholeDocumentComparisons).toBeLessThanOrEqual(1)
})
it('allows production multi-step marks around a synthetic gap but rejects a step that claims it',()=>{
 const base=open('A\n\n\nB'),strong=base.doc.type.schema.marks.strong!.create()
 const actual=transaction(base).addMark(1,base.doc.content.size-1,strong)
 expect(actual.steps).toHaveLength(2)
 const accepted=accept(base,actual)
 expect(accepted.session.source).toBe('**A**\n\n\n**B**')
 reject(base,transaction(base).step(new AddMarkStep(1,base.doc.content.size-1,strong)))
})
it('rejects a custom step subclass even if its JSON says addMark',()=>{
 class DisguisedMarkStep extends AddMarkStep {
  override apply(doc:PmNode) {
   const at=pos(doc,'B')
   return new ReplaceStep(at,at+1,new Slice(Fragment.from(doc.type.schema.text('X')),0,0)).apply(doc)
  }
 }
 const base=open('A\n\nB'),from=pos(base.doc,'A')
 const tr=transaction(base).step(new DisguisedMarkStep(from,from+1,base.doc.type.schema.marks.strong!.create()))
 expect(tr.steps[0]!.toJSON().stepType).toBe('addMark')
 expect(tr.doc.textContent).toBe('AX')
 expect(reject(base,tr)).toEqual({ok:false,reason:'unsupported-step'})
})
it('handles removeMark with an empty StepMap',()=>{
 const b=open('__Alpha__\n\nTail'),p=pos(b.doc,'Alpha')
 const tr=transaction(b).removeMark(p,p+5,b.doc.type.schema.marks.strong!)
 expect(tr.steps[0]!.getMap().ranges).toEqual([])
 const r=accept(b,tr)
 expect(r.session.source).toBe('Alpha\n\nTail')
})
it('preserves actual nested, table and literal text with exact spans',()=>{
 for(const raw of ['* 甲\n  + 子项\n\nTail','| A |\n| --- |\n| 甲 |\n\nTail',
  '~~~text\n甲\n~~~\n\nTail','---\ntitle: 甲\n---\n\nTail']) {
  const b=open(raw),p=pos(b.doc,'甲'),r=accept(b,transaction(b).insertText('乙',p,p+1))
  expect(r.mode).toBe('exact-text');expect(r.changedRoots).toEqual([0])
  expect(r.session.source).toBe(raw.replace('甲','乙'))
  expect(r.session.source.endsWith('\n\nTail')).toBe(true)
 }
})
it('does not gain syntax intent from exact semantic-mismatch',()=>{
 const b=open('甲\n\nTail'),p=pos(b.doc,'甲')
 const r=accept(b,transaction(b).insertText('*乙*',p,p+1))
 // Intended PM contains literal stars; local serializer must preserve that intent.
 expect(r.mode).toBe('root-render')
 expect(r.session.doc.firstChild!.textContent).toBe('*乙*')
 expect(r.session.doc.firstChild!.firstChild!.marks).toEqual([])
})
it('maps each step in its actual doc and keeps nonadjacent edits separate',()=>{
 const raw='A\r\n\r\n  Middle __raw__\r\n\r\nC\n',b=open(raw)
 const tr=transaction(b).insertText('Long',pos(b.doc,'A'),pos(b.doc,'A')+1)
 const c=pos(tr.doc,'C');tr.addMark(c,c+1,b.doc.type.schema.marks.strong!.create())
 const r=accept(b,tr)
 expect(r.changedRoots).toEqual([0,2]);expect(r.edits).toHaveLength(2)
 expect(r.session.source).toBe('Long\r\n\r\n  Middle __raw__\r\n\r\n**C**\n')
 const middle=b.roots[1]!
 expect(r.edits.every(e=>e.to<=middle.sourceFrom||e.from>=middle.sourceTo)).toBe(true)
})
it('preserves opaque references and their synthetic paragraphs',()=>{
 const raw='[Alpha][ref]\n\n\n[ref]: /url "T"\n\nTail',b=open(raw),p=pos(b.doc,'Alpha')
 const r=accept(b,transaction(b).addMark(p,p+5,b.doc.type.schema.marks.strong!.create()))
 expect(r.session.source).toContain('[ref]: /url "T"')
 const synthetic=b.gaps[1]!.synthetic[0]!
 const before=fingerprint(b),tr=transaction(b).insertText('X',synthetic.pmFrom+1),inserted=applySourceBlockTransaction(b,tr)
 expect(inserted.ok).toBe(true);if(!inserted.ok)throw new Error(inserted.reason)
 expect(inserted.session.source).toBe('[Alpha][ref]\n\nX\n\n[ref]: /url "T"\n\nTail')
 expect(inserted.session.doc.eq(tr.doc)).toBe(true);expect(fingerprint(b)).toBe(before)
 expect(inserted.edits).toEqual([{from:14,to:14,text:'X'},{from:15,to:15,text:'\n'}])
 expect(inserted.session.protectedSources).toEqual(b.protectedSources.map(p=>({...p,sourceFrom:p.sourceFrom+2,sourceTo:p.sourceTo+2})))
 for(const p of b.protectedSources)expect(inserted.session.source.slice(p.sourceFrom+2,p.sourceTo+2)).toBe(raw.slice(p.sourceFrom,p.sourceTo))
})
it('uses original-position footnote owners, including unused and consecutive definitions',()=>{
 const raw='[^a]: Alpha\n[^unused]: Keep\n\nBefore[^a]\n\n[^z]: Z\n\nAfter[^z]',b=open(raw)
 const p=pos(b.doc,'Alpha'),r=accept(b,transaction(b).addMark(p,p+5,b.doc.type.schema.marks.strong!.create()))
 expect(r.changedRoots).toEqual([0])
 expect(r.session.source.endsWith(raw.slice(b.roots[0]!.sourceTo))).toBe(true)
})
it('removes exactly the generated table terminal LF before preserving original separation',()=>{
 const raw='| A | B |\n| :- | -: |\n| Alpha | Beta |\n\nTail',b=open(raw),p=pos(b.doc,'Alpha')
 const r=accept(b,transaction(b).addMark(p,p+5,b.doc.type.schema.marks.strong!.create()))
 expect(r.session.source.endsWith('| **Alpha** | Beta |\n\nTail')).toBe(true)
 expect(r.session.doc.childCount).toBe(b.doc.childCount)
})
it('preserves BOM and untouched CRLF on a changed heading',()=>{
 const raw='\uFEFF# Alpha\r\n\r\nTail\r\n',b=open(raw),p=pos(b.doc,'Alpha')
 const r=accept(b,transaction(b).addMark(p,p+5,b.doc.type.schema.marks.strong!.create()))
 expect(r.session.source).toBe('\uFEFF# **Alpha**\r\n\r\nTail\r\n')
})
it('stored marks and selection alone do not create a source revision',()=>{
 const b=open('A'),tr=transaction(b).setStoredMarks([b.doc.type.schema.marks.strong!.create()])
 const r=accept(b,tr)
 expect(r.mode).toBe('unchanged');expect(r.session).toBe(b)
 expect(r.edits).toEqual([]);expect(r.changedRoots).toEqual([])
 // This source preparation does not install an EditorState or change the old Kit adapter.
 expect(EditorState.create({doc:b.doc}).apply(tr).storedMarks!.map(x=>x.type.name)).toEqual(['strong'])
})
it('net-zero supported steps keep raw source and revision',()=>{
 const b=open('__A__'),tr=transaction(b).removeMark(1,2,b.doc.type.schema.marks.strong!)
 tr.addMark(1,2,b.doc.type.schema.marks.strong!.create())
 const r=accept(b,tr);expect(r.mode).toBe('unchanged');expect(r.session).toBe(b)
})
it('rejects stale docs and unsupported node attrs without source output',()=>{
 const b=open('A\n\nB')
 reject(b,EditorState.create({doc:open('X\n\nB').doc}).tr.insertText('Y',1,2))
 const heading=accept(b,transaction(b).setNodeMarkup(0,b.doc.type.schema.nodes.heading,{level:2}))
 expect(heading.changedRoots).toEqual([0]);expect(heading.session.source).toBe('## A\n\nB')
 const table=open('| A |\n| --- |\n| B |')
 reject(table,transaction(table).setNodeMarkup(2,undefined,
  {...table.doc.firstChild!.firstChild!.firstChild!.attrs,colwidth:[100]}))
 const code=open('```text\nA\n```')
 const cleared=accept(code,transaction(code).setNodeMarkup(0,undefined,{language:''}))
 expect(cleared.session.source).toBe('```\nA\n```')
 expect(cleared.session.doc.firstChild!.attrs).toEqual({language:''})
})
it('keeps serializer limitations and partial surrogate edits fail closed',()=>{
 const b=open('A'),hardbreak=b.doc.type.schema.nodes.hardbreak!.create({isInline:false})
 const terminal=accept(b,transaction(b).insert(2,hardbreak))
 expect(terminal.session.source).toBe('A\\\n')
 const unclosed=open('~~~text\nA\n\n'),p=pos(unclosed.doc,'A')
 reject(unclosed,transaction(unclosed).insertText('Z',p,p+1))
 const empty=open('')
 const emptyTr=transaction(empty).insertText('A',1),filled=applySourceBlockTransaction(empty,emptyTr)
 expect(filled.ok).toBe(true);if(!filled.ok)throw new Error(filled.reason)
 expect(filled.session.source).toBe('A');expect(filled.session.doc.eq(emptyTr.doc)).toBe(true)
 expect(filled.edits).toEqual([{from:0,to:0,text:'A'}]);expect(empty.source).toBe('')
 const emoji=open('😀'),e=pos(emoji.doc,'😀')
 reject(emoji,transaction(emoji).insertText('X',e+1,e+2))
})

it('rejects unknown node attrs rather than erasing them',()=>{
 const paragraph=defaultSchema.spec.nodes.get('paragraph')!
 const schema=new Schema({
  nodes:defaultSchema.spec.nodes.update('paragraph',{
   ...paragraph,attrs:{...paragraph.attrs,privateLayout:{default:null}},
  }),marks:defaultSchema.spec.marks,
 })
 const opened=createSourceSession('A',schema)
 expect(opened.ok).toBe(true);if(!opened.ok)throw new Error(opened.reason)
 const b=opened.session
 // A node attrs operation is rejected explicitly, never by dropping attrs.
 reject(b,transaction(b).setNodeMarkup(0,undefined,{...b.doc.firstChild!.attrs,privateLayout:42}))
})

it.each([['strong'], ['em'], ['strong', 'em']])(
 'keeps continuous equals highlight outside partial %j marks without touching adjacent raw roots',
 (...names) => {
  const raw='**Before** ==Alpha beta== *After*\r\n\r\nTail __raw__\r\n'
  const base=open(raw),from=pos(base.doc,'Alpha'),tr=transaction(base)
  for(const name of names)tr.addMark(from,from+5,base.doc.type.schema.marks[name]!.create())
  const result=accept(base,tr)
  expect(result.mode).toBe('root-render')
  expect(result.changedRoots).toEqual([0])
  expect(result.edits).toHaveLength(1)
  expect(result.edits[0]!.from).toBe(base.roots[0]!.sourceFrom)
  expect(result.edits[0]!.to).toBe(base.roots[0]!.sourceTo)
  expect(result.session.source).toContain(' beta==')
  expect(Buffer.from(result.session.source.slice(result.edits[0]!.text.length)))
   .toEqual(Buffer.from(raw.slice(base.roots[0]!.sourceTo)))
  expect(result.session.doc.firstChild!.firstChild!.marks.map(mark=>mark.type.name)).toEqual(['strong'])
  expect(result.session.doc.firstChild!.lastChild!.marks.map(mark=>mark.type.name)).toEqual(['em'])
 })
