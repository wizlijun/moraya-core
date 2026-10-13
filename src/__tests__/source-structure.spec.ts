import {expect,it,vi} from 'vitest'
import {Slice,type Node as PMNode} from 'prosemirror-model'
import {Step,StepResult,ReplaceStep,AddMarkStep,RemoveMarkStep,AttrStep} from 'prosemirror-transform'
import * as markdown from '../markdown'
vi.mock('../markdown',async importOriginal=>{
 const real=await importOriginal<typeof import('../markdown')>()
 return {...real,parseDocumentWithSourceCapture:vi.fn(real.parseDocumentWithSourceCapture),
  serializeSourceRootMarkdown:vi.fn(real.serializeSourceRootMarkdown)}
})
import {EditorState,TextSelection,type Transaction,type Command} from 'prosemirror-state'
import {splitBlock,joinBackward} from 'prosemirror-commands'
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity'
function open(raw:string){const r=createSourceSession(raw);if(!r.ok)throw Error(r.reason);return r.session}
function state(b:ReturnType<typeof open>,from:number,to=from){
 return EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,from,to)})
}
function command(s:EditorState,cmd:Command):Transaction {
 let out:Transaction|undefined
 expect(cmd(s,tr=>{out=tr})).toBe(true)
 if(!out)throw Error('command did not dispatch')
 return out
}
function text(doc:EditorState['doc'],needle:string){
 let at=-1;doc.descendants((n,p)=>{if(at<0&&n.isText){const i=n.text!.indexOf(needle);if(i>=0)at=p+i}})
 if(at<0)throw Error('missing fixture text');return at
}
function accept(b:ReturnType<typeof open>,tr:Transaction,expected?:string){
 tr.doc.check();const before=JSON.stringify(b),r=applySourceBlockTransaction(b,tr)
 expect(r.ok,r.ok?'accepted':r.reason).toBe(true);if(!r.ok)throw Error(r.reason)
 expect(JSON.stringify(b)).toBe(before);expect(r.session.doc.eq(tr.doc)).toBe(true)
 expect(open(r.session.source).doc.eq(tr.doc)).toBe(true)
 expect(r.session.revision).toBe(b.revision+1)
 if(expected!==undefined)expect(Buffer.from(r.session.source)).toEqual(Buffer.from(expected))
 let at=0;const parts:string[]=[]
 for(const e of r.edits){expect(e.from).toBeGreaterThanOrEqual(at);parts.push(b.source.slice(at,e.from),e.text);at=e.to}
 parts.push(b.source.slice(at));expect(parts.join('')).toBe(r.session.source)
 return r
}
function reject(b:ReturnType<typeof open>,tr:Transaction){
 const before=JSON.stringify(b),r=applySourceBlockTransaction(b,tr)
 expect(r.ok).toBe(false);expect(r).not.toHaveProperty('session');expect(JSON.stringify(b)).toBe(before)
}
function childPos(doc:EditorState['doc'],index:number){
 let pos=0;for(let i=0;i<index;i++)pos+=doc.child(i).nodeSize;return pos
}
function deleteChild(b:ReturnType<typeof open>,index:number){
 const p=childPos(b.doc,index);return EditorState.create({doc:b.doc}).tr.delete(p,p+b.doc.child(index).nodeSize)
}
it('splitBlock produces two children inside one raw owner',()=>{
 const b=open('HelloWorld\n\nTail __raw__\r\n')
 const tr=command(state(b,6),splitBlock),r=accept(b,tr,'Hello\n\nWorld\n\nTail __raw__\r\n')
 expect(r.changedRoots).toEqual([0]);expect(r.edits).toHaveLength(1)
 expect(r.edits[0]!.from).toBe(0);expect(r.edits[0]!.to).toBeLessThanOrEqual(b.roots[0]!.sourceTo)
})
it('real joinBackward consumes only crossed seam',()=>{
 const b=open('A\n\nB\n\nC __raw__'),tr=command(state(b,text(b.doc,'B')),joinBackward)
 const r=accept(b,tr,'AB\n\nC __raw__');expect(r.changedRoots).toEqual([0,1])
 expect(r.edits.every(e=>e.to<=b.roots[1]!.sourceTo)).toBe(true)
})
it.each([false,true])('left mark does not hide right deletion separator authority (%s)',deleteFirst=>{
 const b=open('A\n\nB'),tr=EditorState.create({doc:b.doc}).tr
 if(deleteFirst){tr.delete(3,6);tr.addMark(1,2,b.doc.type.schema.marks.strong!.create())}
 else {tr.addMark(1,2,b.doc.type.schema.marks.strong!.create());tr.delete(3,6)}
 expect(open('**A**\n').doc.eq(tr.doc)).toBe(true)
 const r=accept(b,tr,'**A**\n')
 expect(r.changedRoots).toEqual([0,1])
})
it('left heading AttrStep does not hide right deletion separator authority',()=>{
 const b=open('# A\n\nB'),tr=EditorState.create({doc:b.doc}).tr
 tr.step(new AttrStep(0,'level',2));tr.delete(3,6)
 expect(open('## A\n').doc.eq(tr.doc)).toBe(true)
 accept(b,tr,'## A\n')
})
it('right mark and left deletion retain the surviving marked root',()=>{
 const b=open('A\n\nB'),tr=EditorState.create({doc:b.doc}).tr
 tr.addMark(4,5,b.doc.type.schema.marks.strong!.create());tr.delete(0,3)
 expect(open('**B**').doc.eq(tr.doc)).toBe(true)
 accept(b,tr,'**B**')
})
it.each([
 ['A\r\n\r\nB','**A**\r\n'],
 ['A\r\rB','**A**\r'],
 ['Keep\r\n \t\r\nA\r\n\r\nB','Keep\r\n \t\r\n**A**\r\n'],
] as const)('left mark with right deletion retains original EOL and untouched blanks %j',(raw,expected)=>{
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr
 const last=b.doc.childCount-1,p=childPos(b.doc,last)
 const a=text(b.doc,'A')
 tr.addMark(a,a+1,b.doc.type.schema.marks.strong!.create())
 tr.delete(p,p+b.doc.child(last).nodeSize)
 expect(open(expected).doc.eq(tr.doc)).toBe(true)
 const r=accept(b,tr,expected)
 if(raw.startsWith('Keep')){
  const blank=b.layout.blankLines.find(u=>u.sourceFrom===6)!
  expect(r.edits.every(e=>e.to<=blank.sourceFrom||e.from>=blank.sourceTo)).toBe(true)
 }
})
it('a mark alone preserves its original separator bytes',()=>{
 const b=open('A\r\n\r\nB'),tr=EditorState.create({doc:b.doc}).tr.addMark(1,2,b.doc.type.schema.marks.strong!.create())
 const r=accept(b,tr,'**A**\r\n\r\nB')
 expect(r.edits.every(e=>e.to<=3||e.from>=5)).toBe(true)
})
it.each([
 ['A\n\nB\n\nC',1,'A\n\nC'],['A\n\nB',0,'B'],['A\n\nB',1,'A\n'],
 ['A\n\nB\n\n',1,'A\n\n'],['A\n\n\nB',1,'A\n\nB'],
 ['- A\n\n\nB',1,'- A\n\nB'],['- A\n\n\nB',0,'\nB'],
 ['A\n\n',0,''],['- A\n\n\n',0,'\n'],
 ['\uFEFFA\r\n \t\r\n\t\r\n',0,'\uFEFF\t\r\n'],
 ['A\n\n[ref]: /u\n\n',0,'\n[ref]: /u\n\n'],
 ['A\n\n\n[ref]: /u\n\n',0,'\n[ref]: /u\n\n'],
] as const)('finite deletion %j',(raw,index,expected)=>{
 const b=open(raw);accept(b,deleteChild(b,index),expected)
})
it('boundary birth keeps changedRoots empty through later edit',()=>{
 const b=open('A\n\nC'),p=childPos(b.doc,1),tr=EditorState.create({doc:b.doc}).tr
 tr.insert(p,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('B')))
 tr.insertText('ee',p+2)
 const r=accept(b,tr,'A\n\nBee\n\nC')
 expect(r.changedRoots).toEqual([]);expect(r.edits).toEqual([{from:3,to:3,text:'Bee\n\n'}])
})
it('same-point births follow final order and produce one edit',()=>{
 const b=open('A\n\nC'),p=childPos(b.doc,1),tr=EditorState.create({doc:b.doc}).tr
 const paragraph=b.doc.type.schema.nodes.paragraph!,word=(s:string)=>paragraph.create(null,b.doc.type.schema.text(s))
 tr.insert(p,word('B'));tr.insert(p,word('X'))
 const r=accept(b,tr,'A\n\nX\n\nB\n\nC')
 expect(r.edits).toEqual([{from:3,to:3,text:'X\n\nB\n\n'}])
})
it('delete tombstone then insert stays at deleted owner',()=>{
 const b=open('A\n\nB\n\nC'),p=childPos(b.doc,1),tr=deleteChild(b,1)
 tr.insert(p,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('X')))
 const r=accept(b,tr,'A\n\nX\n\nC');expect(r.changedRoots).toEqual([1])
 expect(r.edits.every(e=>e.from>=3&&e.to<=6)).toBe(true)
})
it('empty document Enter has one generated blank unit',()=>{
 const b=open(''),tr=command(state(b,1),splitBlock),r=accept(b,tr,'\n')
 expect(r.changedRoots).toEqual([]);expect(r.session.layout.fallback).toBeDefined()
})

it.each([
 ['A\n\nB',1,'A\n\n\nB',3,'\n'],
 ['A',1,'A\n\n',1,'\n\n'],
 ['A\n',1,'A\n\n',2,'\n'],
 ['A',0,'\nA',0,'\n'],
] as const)('empty birth slot %j',(raw,index,expected,anchor,insert)=>{
 const b=open(raw),tr=EditorState.create({doc:b.doc}).tr.insert(childPos(b.doc,index),b.doc.type.schema.nodes.paragraph!.create())
 expect(accept(b,tr,expected).edits).toEqual([{from:anchor,to:anchor,text:insert}])
})
it('deleting rawless baseline converts exactly the first surviving unit',()=>{
 const b=open('\n\n');expect(accept(b,deleteChild(b,0),'\n').edits).toEqual([{from:0,to:1,text:''}])
})
it('birth then disappearance is unchanged',()=>{
 const b=open('A\n\nC'),p=childPos(b.doc,1),tr=EditorState.create({doc:b.doc}).tr
 tr.insert(p,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('B')));tr.delete(p,p+3)
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true)
 if(!r.ok)throw Error(r.reason);expect(r.session).toBe(b);expect(r.edits).toEqual([])
})
it('duplicate text roots retain identity when deleting only second',()=>{
 const b=open('A\r\n\nA');expect(accept(b,deleteChild(b,1),'A\r\n').changedRoots).toEqual([1])
})
it('nonadjacent splits preserve intervening raw root and gaps',()=>{
 const b=open('HelloWorld\n \t\nMiddle __raw__\r\n\t\r\nByeWorld'),s=state(b,text(b.doc,'ByeWorld')+3)
 const tr=command(s,splitBlock);tr.split(text(b.doc,'HelloWorld')+5)
 const r=accept(b,tr,'Hello\n\nWorld\n \t\nMiddle __raw__\r\n\t\r\nBye\n\nWorld')
 expect(r.changedRoots).toEqual([0,2]);expect(r.edits).toHaveLength(2)
 expect(r.edits[0]!.to).toBeLessThanOrEqual(b.roots[0]!.sourceTo)
 expect(r.edits[1]!.from).toBe(b.roots[2]!.sourceFrom)
})

it.each([
 ['A\n\nB\n\nC',1,[{from:3,to:6,text:''}]],
 ['A\n\nB',0,[{from:0,to:3,text:''}]],
 ['A\n\nB',1,[{from:2,to:4,text:''}]],
 ['A\n\nB\n\n',1,[{from:2,to:5,text:''}]],
 ['- A\n\n\nB',1,[{from:5,to:6,text:''}]],
 ['- A\n\n\nB',0,[{from:0,to:5,text:''}]],
] as const)('fixed deletion grants exact slots %j',(raw,index,edits)=>{
 const b=open(raw);expect(accept(b,deleteChild(b,index)).edits).toEqual(edits)
})
it('surviving mixed-EOL units keep their identity bytes through list deletion',()=>{
 const b=open('\uFEFF- A\r\n \t\r\n\t\r\nB')
 const unit=b.layout.blankLines.find(u=>u.role==='empty-paragraph')!
 const r=accept(b,deleteChild(b,0),'\uFEFF\t\r\nB')
 expect(r.edits.every(e=>e.to<=unit.sourceFrom||e.from>=unit.sourceTo)).toBe(true)
})
it('custom replace JSON and ReplaceStep subclass fail atomically',()=>{
 const b=open('A\n\nB')
 class Pretend extends Step {
  apply(doc:PMNode){return StepResult.ok(doc)}
  invert(){return this}
  map(){return this}
  toJSON(){return {stepType:'replace',from:0,to:3}}
 }
 class Inherited extends ReplaceStep {}
 reject(b,EditorState.create({doc:b.doc}).tr.step(new Pretend()))
 reject(b,EditorState.create({doc:b.doc}).tr.step(new Inherited(0,3,Slice.empty)))
})
it('structural replay rejects an altered intermediate docs chain',()=>{
 const b=open('AB\n\nTail'),tr=EditorState.create({doc:b.doc}).tr.split(2)
 tr.insertText('X',1);tr.docs[1]=open('Wrong\n\nTail').doc
 reject(b,tr)
})
it('a source owner collision fails before rendering',()=>{
 const original=open('A\n\nB'),b={...original,roots:[original.roots[0]!,{...original.roots[1]!,childFrom:0}]}
 reject(b,deleteChild(b,0))
})
it('a partial surrogate in a structural chain fails atomically',()=>{
 const b=open('😀Z\n\nTail'),tr=EditorState.create({doc:b.doc}).tr.insertText('X',2,3)
 tr.split(3);reject(b,tr)
})
it('a malformed CRLF slot cannot gain conversion authority',()=>{
 const original=open('A\r\n \t\r\n'),u=original.layout.blankLines[0]!
 const b={...original,layout:{...original.layout,blankLines:[{...u,sourceFrom:u.sourceTo-1}]}}
 reject(b,deleteChild(b,0))
})
it('protected interior anchor is rejected even for reference-only fallback',()=>{
 const original=open('[ref]: /u\n\n'),b={...original,layout:{...original.layout,fallback:{...original.layout.fallback!,sourceAnchor:2}}}
 const tr=EditorState.create({doc:b.doc}).tr.insert(0,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('X')))
 reject(b,tr)
})
it('nested reference guard rejects structural rendering before serializer invocation',()=>{
 const b=open('> A\n>\n> [ref]: /u\n\nTail')
 const tr=deleteChild(b,0)
 vi.mocked(markdown.serializeSourceRootMarkdown).mockClear()
 reject(b,tr);expect(markdown.serializeSourceRootMarkdown).not.toHaveBeenCalled()
})
it('structural preparation captures once and serializes only dirty children',()=>{
 const b=open('HelloWorld\n\nMiddle __raw__\n\nByeWorld')
 const tr=EditorState.create({doc:b.doc}).tr.split(text(b.doc,'ByeWorld')+3).split(6)
 vi.mocked(markdown.parseDocumentWithSourceCapture).mockClear()
 vi.mocked(markdown.serializeSourceRootMarkdown).mockClear()
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true)
 expect(markdown.parseDocumentWithSourceCapture).toHaveBeenCalledTimes(1)
 const inputs=vi.mocked(markdown.serializeSourceRootMarkdown).mock.calls.map(args=>args[0])
 expect(inputs.length).toBeGreaterThan(0)
 expect(inputs.every(doc=>doc.childCount<b.doc.childCount&&!doc.textContent.includes('Middle'))).toBe(true)
})
it('split then join restores original raw spelling without a revision',()=>{
 const b=open('__AB__\r\n\r\nTail'),tr=EditorState.create({doc:b.doc}).tr.split(2).join(3)
 expect(tr.doc.eq(b.doc)).toBe(true)
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true)
 if(!r.ok)throw Error(r.reason);expect(r.session).toBe(b);expect(r.edits).toEqual([])
})
it('birth of a terminal-hardbreak paragraph keeps its semantic EOL at EOF',()=>{
 const b=open('A'),schema=b.doc.type.schema
 const node=schema.nodes.paragraph!.create(null,[schema.text('B'),schema.nodes.hardbreak!.create({isInline:false})])
 const tr=EditorState.create({doc:b.doc}).tr.insert(b.doc.content.size,node)
 accept(b,tr,'A\n\nB\\\n')
})
it('joining mixed EOL roots consumes crossed separator and keeps outgoing raw seam',()=>{
 const b=open('A\r\n \t\r\nB\r\n\t\r\nC'),tr=command(state(b,text(b.doc,'B')),joinBackward)
 accept(b,tr,'AB\r\n\t\r\nC')
})
it('birth before the first root stays after BOM',()=>{
 const b=open('\uFEFFA\r\n'),tr=EditorState.create({doc:b.doc}).tr.insert(0,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('B')))
 expect(accept(b,tr,'\uFEFFB\n\nA\r\n').edits).toEqual([{from:1,to:1,text:'B\n\n'}])
})
it('split at content end keeps the original CRLF terminal before generated empty',()=>{
 const b=open('A\r\n'),tr=command(state(b,2),splitBlock),r=accept(b,tr,'A\r\n\n')
 expect(r.edits.every(e=>e.to<=1||e.from>=3)).toBe(true)
})
it('EOF birth after a surviving suffix empty generates a separator without converting that unit',()=>{
 const b=open('A\r\n \t\r\n'),tr=EditorState.create({doc:b.doc}).tr.insert(b.doc.content.size,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('B')))
 const r=accept(b,tr,'A\r\n\n \t\r\nB')
 expect(r.edits).toEqual([{from:3,to:3,text:'\n'},{from:7,to:7,text:'B'}])
})
it.each([false,true])('same-anchor births and edited origin follow final PM order (%s)',twoBirths=>{
 const b=open('A\n\nC'),tr=EditorState.create({doc:b.doc}).tr
 const paragraph=(word:string)=>b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text(word))
 if(twoBirths){tr.insert(3,paragraph('B'));tr.insert(3,paragraph('X'));tr.insertText('ee',11)}
 else {tr.insertText('ee',5);tr.insert(3,paragraph('B'))}
 const expected=twoBirths?'A\n\nX\n\nB\n\nCee':'A\n\nB\n\nCee'
 expect(open(expected).doc.eq(tr.doc)).toBe(true)
 vi.mocked(markdown.serializeSourceRootMarkdown).mockClear()
 const r=accept(b,tr,expected)
 expect(r.changedRoots).toEqual([1])
 expect(r.edits).toEqual([{from:3,to:4,text:twoBirths?'X\n\nB\n\nCee':'B\n\nCee'}])
 expect(vi.mocked(markdown.serializeSourceRootMarkdown).mock.calls.map(([doc])=>doc.textContent))
  .toEqual(twoBirths?['X','B','Cee']:['B','Cee'])
})
it.each([false,true])('ineffective mark over a raw empty preserves its unit through split (%s)',remove=>{
 const b=open(remove?'**AB**\r\n\r\n \t\r\n**C**':'AB\r\n\r\n \t\r\nC')
 const tr=EditorState.create({doc:b.doc}).tr,strong=b.doc.type.schema.marks.strong!.create()
 tr.step(remove?new RemoveMarkStep(1,b.doc.content.size-1,strong):new AddMarkStep(1,b.doc.content.size-1,strong))
 tr.split(2)
 const expected=remove?'A\n\nB\r\n\r\n \t\r\nC':'**A**\n\n**B**\r\n\r\n \t\r\n**C**'
 expect(open(expected).doc.eq(tr.doc)).toBe(true)
 const r=accept(b,tr,expected),unit=b.layout.blankLines.find(u=>u.role==='empty-paragraph')!
 expect(r.edits.every(e=>e.to<=unit.sourceFrom||e.from>=unit.sourceTo)).toBe(true)
})
