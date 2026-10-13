import {expect,it,vi} from 'vitest'
import {Schema} from 'prosemirror-model'
import StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import {EditorState,TextSelection,type Transaction,type Command} from 'prosemirror-state'
import {wrapIn,lift,splitBlock} from 'prosemirror-commands'
import {wrapInList,splitListItem,sinkListItem,liftListItem} from 'prosemirror-schema-list'
import {TableMap,addRowAfter,addColumnAfter,deleteColumn,goToNextCell} from 'prosemirror-tables'
import {AttrStep,AddNodeMarkStep,RemoveNodeMarkStep,ReplaceAroundStep,DocAttrStep} from 'prosemirror-transform'
import {createSourceSession,applySourceBlockTransaction} from '../source-fidelity'
import {wrapInTaskList} from '../commands'
import {defaultSchema} from '../schema'
import {parseMarkdown,parseMarkdownAsync} from '../markdown'
import * as markdown from '../markdown'
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
const tail='\n\nTail __raw__'
const table='| A | B |\n| --- | --- |\n| X | Y |'
it.each(['quote','list'] as const)('actual %s wrap owns both roots',kind=>{
 const b=open('A\n\nB'+tail),tr=command(state(b,1,4),kind==='quote'?wrapIn(b.doc.type.schema.nodes.blockquote!):wrapInList(b.doc.type.schema.nodes.bullet_list!))
 expect(tr.steps.some(s=>s instanceof ReplaceAroundStep)).toBe(true)
 if(kind==='list')expect(tr.steps.length).toBeGreaterThan(1)
 const r=accept(b,tr);expect(r.changedRoots).toEqual([0,1]);expect(r.session.source.endsWith(tail)).toBe(true)
})
it('actual splitListItem preserves external semantic blank',()=>{
 const b=open('- AlphaBeta\n\n\nTail __raw__'),tr=command(state(b,text(b.doc,'AlphaBeta')+5),splitListItem(b.doc.type.schema.nodes.list_item!))
 const r=accept(b,tr);expect(r.changedRoots).toEqual([0]);expect(r.session.source.endsWith('\n\n\nTail __raw__')).toBe(true)
})
it('quote lift makes three roots within its one origin',()=>{
 const b=open('> A\n>\n> B\n>\n> C'+tail),r=accept(b,command(state(b,text(b.doc,'B')),lift))
 expect(r.changedRoots).toEqual([0]);expect(r.session.doc.childCount).toBe(4);expect(r.session.source.endsWith(tail)).toBe(true)
})
it.each(['sink','lift','middle'] as const)('actual list %s command preserves external raw',kind=>{
 const b=open((kind==='lift'?'- A\n  - B':'- A\n- B\n- C')+tail),item=b.doc.type.schema.nodes.list_item!
 const r=accept(b,command(state(b,text(b.doc,'B')),kind==='sink'?sinkListItem(item):liftListItem(item)))
 expect(r.changedRoots).toEqual([0]);expect(r.session.source.endsWith(tail)).toBe(true)
 if(kind==='middle')expect(r.session.doc.childCount).toBe(4)
})
it('ordered start AttrStep is persisted',()=>{
 const b=open('3. A\n4. B'+tail),tr=state(b,3).tr.step(new AttrStep(0,'order',7))
 const r=accept(b,tr);expect(r.session.source.startsWith('7. A')).toBe(true);expect(r.changedRoots).toEqual([0])
})
it('actual task-list producer preserves checkbox attrs and external raw',()=>{
 const b=open('A\n\nB'+tail),tr=command(state(b,1,4),wrapInTaskList)
 expect(tr.doc.child(0).child(0).attrs.checked).toBe(false)
 const r=accept(b,tr,'- [ ] A\n- [ ] B'+tail)
 expect(r.session.doc.child(0).child(1).attrs.checked).toBe(false)
 expect(r.changedRoots).toEqual([0,1]);expect(r.session.source.endsWith(tail)).toBe(true)
})
it('split edit new right child and wrap share one transaction',()=>{
 const b=open('HelloWorld'+tail),tr=command(state(b,6),splitBlock)
 tr.insertText('!',8)
 const s=EditorState.create({doc:tr.doc,selection:TextSelection.create(tr.doc,8)})
 const wrapped=command(s,wrapIn(s.schema.nodes.blockquote!));for(const step of wrapped.steps)tr.step(step)
 const r=accept(b,tr);expect(r.changedRoots).toEqual([0]);expect(r.session.source.endsWith(tail)).toBe(true)
})
it.each([['row',addRowAfter],['column',addColumnAfter],['delete-column',deleteColumn]] as const)('actual table %s stays local',(_name,cmd)=>{
 const b=open(table+tail),r=accept(b,command(state(b,text(b.doc,'X')),cmd))
 expect(r.changedRoots).toEqual([0]);expect(r.session.source.endsWith(tail)).toBe(true)
})
it('two distant table commands keep middle bytes and separate edits',()=>{
 const middle='\r\n \t\r\nMiddle __raw__\n\n',b=open(table+middle+table),tr=command(state(b,text(b.doc,'X')),addRowAfter)
 let last=-1;tr.doc.descendants((n,p)=>{if(n.isText&&n.text==='X')last=p})
 const next=command(EditorState.create({doc:tr.doc,selection:TextSelection.create(tr.doc,last)}),addRowAfter)
 for(const step of next.steps)tr.step(step)
 const r=accept(b,tr);expect(r.changedRoots).toEqual([0,2]);expect(r.edits).toHaveLength(2);expect(r.session.source).toContain(middle)
})
it('equal tables editing only second retains first source identity',()=>{
 const b=open(table+'\n\n'+table+tail);let last=-1;b.doc.descendants((n,p)=>{if(n.isText&&n.text==='X')last=p})
 const r=accept(b,command(state(b,last),addRowAfter));expect(r.changedRoots).toEqual([1]);expect(r.edits.every(e=>e.from>=b.roots[1]!.sourceFrom)).toBe(true)
})
it.each(['right','center'])('unfixed %s aligned addRowAfter producer fails strict equality',align=>{
 const b=open(table.replace('--- | ---',align==='right'?'---: | ---:':':---: | :---:')+tail)
 reject(b,command(state(b,text(b.doc,'X')),addRowAfter))
})
it('header-only deletion remains valid while colwidth attrs fail atomically',()=>{
 const b=open(table+tail),tr=state(b,text(b.doc,'X')).tr,root=b.doc.child(0)
 tr.delete(root.child(0).nodeSize+1,root.nodeSize-1)
 const r=accept(b,tr);expect(r.session.doc.child(0).childCount).toBe(1)
 expect(TableMap.get(r.session.doc.child(0)).problems).toBeNull()
 expect(r.session.source.endsWith(tail)).toBe(true)
 const cell=text(b.doc,'X')-2;reject(b,state(b,text(b.doc,'X')).tr.step(new AttrStep(cell,'colwidth',[120])))
})
it('selection-only table navigation does not revise source',()=>{
 const b=open(table+tail),tr=command(state(b,text(b.doc,'X')),goToNextCell(1)),r=applySourceBlockTransaction(b,tr)
 expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session).toBe(b);expect(r.edits).toEqual([])
})
it('AttrStep code language persists without changing raw neighbors',()=>{
 const b=open('```js\nA\n```'+tail),r=accept(b,state(b,1).tr.step(new AttrStep(0,'language','ts')))
 expect(r.session.source.startsWith('```ts\n')).toBe(true);expect(r.session.source.endsWith(tail)).toBe(true)
})
it('node marks on an inline image are representable',()=>{
 const b=open('![x](image.png)'+tail),mark=b.doc.type.schema.marks.strong!.create()
 const added=accept(b,state(b,1).tr.step(new AddNodeMarkStep(1,mark)))
 const removed=accept(added.session,EditorState.create({doc:added.session.doc}).tr.step(new RemoveNodeMarkStep(1,mark)))
 expect(removed.session.doc.eq(b.doc)).toBe(true);expect(removed.session.source.endsWith(tail)).toBe(true)
})
it('empty language is preserved while unrepresentable block marks and DocAttr are rejected',()=>{
 const b=open('```js\nA\n```'+tail),tr=state(b,1).tr
 const r=accept(b,tr.step(new AttrStep(0,'language','')))
 expect(r.session.doc.child(0).attrs.language).toBe('');expect(r.session.source).toBe('```\nA\n```'+tail)
 const p=open('A'+tail);expect(()=>state(p,1).tr.step(new AddNodeMarkStep(0,p.doc.type.schema.marks.strong!.create()))).toThrow('Invalid content')
 reject(p,state(p,1).tr.step(new DocAttrStep('unsupported','x')))
})
it('leading text space from actual splitBlock is encoded',()=>{
 const b=open('Hello world'+tail),r=accept(b,command(state(b,6),splitBlock))
 expect(r.session.source).toContain('&#32;world')
})
it.each(['plain','strong','em','highlight','adjacent','code','softbreak','list','quote'] as const)('source-only %s whitespace preserves actual text and marks',kind=>{
 const b=open((kind==='list'?'- AB':kind==='quote'?'> AB':'AB')+tail),at=text(b.doc,'AB'),schema=b.doc.type.schema
 const marks=kind==='strong'||kind==='em'||kind==='highlight'||kind==='code'?[schema.marks[kind]!.create()]:[]
 const content='  \tAB \t '
 const tr=state(b,at).tr.replaceWith(at,at+2,kind==='softbreak'?[schema.text('A'),schema.nodes.hardbreak!.create({isInline:true}),schema.text('  \tB')]:schema.text(content,marks))
 if(kind==='adjacent'){tr.addMark(at,at+3,schema.marks.strong!.create());tr.addMark(at+3,at+content.length,schema.marks.em!.create())}
 const r=accept(b,tr);expect(r.session.source.endsWith(tail)).toBe(true)
})
it('fence content terminal LF remains distinct from closing syntax',()=>{
 const b=open('```js\nA\n\n```'+tail),r=accept(b,state(b,1).tr.insertText('B',text(b.doc,'A')+1))
 expect(r.session.doc.child(0).textContent).toBe('AB\n');expect(r.session.source.endsWith(tail)).toBe(true)
})
it('literal body replacement grows only the actual closed fence markers',()=>{
 const b=open('```js\nA\n```'+tail),tr=state(b,1).tr.insertText('\n```\n\n',2),before=JSON.stringify(b)
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown')
 try {
  const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason)
  expect(r.session.source).toBe('````js\nA\n```\n\n\n````'+tail);expect(r.session.doc.eq(tr.doc)).toBe(true)
  expect(r.edits).toEqual([{from:0,to:3,text:'````'},{from:7,to:7,text:'\n```\n\n'},{from:8,to:11,text:'````'}])
  expect(spy).not.toHaveBeenCalled();expect(JSON.stringify(b)).toBe(before)
 }finally{spy.mockRestore()}
})

it('code-mark internal space stays on its native serialization branch',()=>{
 const b=open('AB'+tail),tr=state(b,1).tr.replaceWith(1,3,b.doc.type.schema.text('A B',[b.doc.type.schema.marks.code!.create()]))
 const r=accept(b,tr);expect(r.session.source.startsWith('`A B`')).toBe(true)
})
it('unclosed fence cannot gain structural terminal authority',()=>{
 const b=open('```js\nA'),tr=state(b,1).tr.step(new AttrStep(0,'language','ts'));reject(b,tr)
})
it('unknown subclasses of newly supported steps remain rejected',()=>{
 const b=open('A'+tail),schema=b.doc.type.schema
 class InheritedAttr extends AttrStep {}
 class InheritedNodeMark extends AddNodeMarkStep {}
 class InheritedAround extends ReplaceAroundStep {}
 reject(b,state(b,1).tr.step(new InheritedAttr(0,'unrepresented','x')))
 const image=open('![x](image.png)'+tail);reject(image,state(image,1).tr.step(new InheritedNodeMark(1,schema.marks.strong!.create())))
 const actual=command(state(b,1),wrapIn(schema.nodes.blockquote!)),s=actual.steps[0] as ReplaceAroundStep
 reject(b,state(b,1).tr.step(new InheritedAround(s.from,s.to,s.gapFrom,s.gapTo,s.slice,s.insert)))
})
it('malformed around gaps and changed replay chain fail atomically',()=>{
 const b=open('A\n\nB'+tail),tr=command(state(b,1,4),wrapIn(b.doc.type.schema.nodes.blockquote!))
 const step=tr.steps[0] as ReplaceAroundStep;Object.assign(step,{gapFrom:0.5});reject(b,tr)
 const valid=command(state(b,1,4),wrapIn(b.doc.type.schema.nodes.blockquote!));valid.insertText('X',2)
 valid.docs[1]=open('Bad'+tail).doc;reject(b,valid)
})
it('structural wrap never moves nested definitions',()=>{
 const b=open('> A\n>\n> [ref]: /u'+tail),tr=command(state(b,text(b.doc,'A')),lift);reject(b,tr)
})
it('adjacent same-type list birth stays strict instead of expanding neighbor ownership',()=>{
 const b=open('- A'+tail),tr=state(b,text(b.doc,'A')).tr.insert(b.doc.child(0).nodeSize,b.doc.child(0));reject(b,tr)
})
it('EOF insertion after unclosed fence cannot swallow the new paragraph',()=>{
 const b=open('```js\nA'),tr=state(b,1).tr.insert(b.doc.content.size,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('B')));reject(b,tr)
})
it('closed code AttrStep preserves CRLF terminal and semantic blank identities',()=>{
 const b=open('```js\r\nA\r\n```\r\n \t\r\n\t\r\nTail'),tr=state(b,1).tr.step(new AttrStep(0,'language','ts'))
 const r=accept(b,tr);expect(r.session.source.endsWith('```\r\n \t\r\n\t\r\nTail')).toBe(true)
 expect(r.edits.every(e=>e.to<=b.roots[0]!.tailFrom)).toBe(true)
})

it.each([
 ['em underscore','**&#32;&#32;&#9;**_AB&#32;&#9;&#32;_'],
 ['strong underscore','__&#32;&#32;&#9;__*AB&#32;&#9;&#32;*'],
] as const)('candidate adjacent delimiter %s preserves strict marks',(_name,source)=>{
 const b=open('AB'),schema=b.doc.type.schema
 const want=state(b,1).tr.replaceWith(1,3,[schema.text('  \t',[schema.marks.strong!.create()]),schema.text('AB \t ',[schema.marks.em!.create()])]).doc
 expect(open(source).doc.eq(want)).toBe(true)
})
it('candidate native code padding preserves surrounding whitespace',()=>{
 const b=open('AB'),schema=b.doc.type.schema,want=state(b,1).tr.replaceWith(1,3,schema.text('  \tAB \t ',[schema.marks.code!.create()])).doc
 expect(open('`   \tAB \t  `').doc.eq(want)).toBe(true)
})

it.each([' A ', '  ', 'A`B', '`A`', 'A B', '  \tAB \t '])('native code delimiter preserves %j',content=>{
 const b=open('AB'+tail),tr=state(b,1).tr.replaceWith(1,3,b.doc.type.schema.text(content,[b.doc.type.schema.marks.code!.create()]))
 accept(b,tr)
})
it.each(['strong-em','em-strong','plain-em'] as const)('adjacent delimiters preserve %s without adding text',order=>{
 const b=open('AB'+tail),schema=b.doc.type.schema
 const first=order==='strong-em'?schema.marks.strong!.create():order==='em-strong'?schema.marks.em!.create():undefined
 const second=order==='em-strong'?schema.marks.strong!.create():schema.marks.em!.create()
 const tr=state(b,1).tr.replaceWith(1,3,[schema.text('A',first?[first]:[]),schema.text('B',[second])]);accept(b,tr)
})

it.each(['strong-em','em-strong'] as const)('encoded whitespace delimiter handles %s with punctuation content',order=>{
 const b=open('AB'+tail),schema=b.doc.type.schema,strong=schema.marks.strong!.create(),em=schema.marks.em!.create()
 const nodes=order==='strong-em'?[schema.text(' \t ',[strong]),schema.text('A_B`C \t ',[em])]:[schema.text(' \t A_B`C',[em]),schema.text(' \t ',[strong])]
 accept(b,state(b,1).tr.replaceWith(1,3,nodes))
})
it('nested strong em and highlight retain all marks around whitespace',()=>{
 const b=open('AB'+tail),schema=b.doc.type.schema,marks=[schema.marks.strong!.create(),schema.marks.em!.create(),schema.marks.highlight!.create({delimiter:'equals'})]
 accept(b,state(b,1).tr.replaceWith(1,3,schema.text(' \t A_B`C \t ',marks)))
})
it('fence info with backtick uses tilde and longer content delimiter',()=>{
 const b=open('```js\nA\n```'+tail),tr=state(b,1).tr.step(new AttrStep(0,'language','lang`x')).insertText('\n~~~~\n',2)
 const r=accept(b,tr);expect(r.session.source.startsWith('~~~~~lang`x\n')).toBe(true)
})
it('newline in fence info is rejected without dropping attrs',()=>{
 const b=open('```js\nA\n```'+tail);reject(b,state(b,1).tr.step(new AttrStep(0,'language','js\nunsafe')))
})
it('literal content with multiple terminal LFs is retained on AttrStep',()=>{
 const b=open('```js\nA\n\n\n```'+tail),r=accept(b,state(b,1).tr.step(new AttrStep(0,'language','ts')))
 expect(r.session.doc.child(0).textContent).toBe('A\n\n')
})

it('actual wrapIn keeps a closed fence closing line inside the quote',()=>{
 const b=open('```js\nA\n```'+tail),tr=command(state(b,1),wrapIn(b.doc.type.schema.nodes.blockquote!))
 const r=accept(b,tr,'> ```js\n> A\n> ```'+tail)
 expect(r.changedRoots).toEqual([0]);expect(r.edits.every(e=>e.to<=b.roots[0]!.tailFrom)).toBe(true)
})
it.each([
 ['quote','> ```js\n> A\n> ```','> ```ts\n> A\n> ```'],
 ['list','- ```js\n  A\n  ```','- ```ts\n  A\n  ```'],
 ['quote-tail-lf','> ```js\n> A\n>\n> ```','> ```ts\n> A\n> \n> ```'],
 ['list-tail-lf','- ```js\n  A\n\n  ```','- ```ts\n  A\n  \n  ```'],
] as const)('closed container fence AttrStep preserves %s syntax and content',(_kind,raw,expected)=>{
 const b=open(raw+'\r\n \t\r\nTail __raw__'),at=text(b.doc,'A')-1
 const tr=state(b,text(b.doc,'A')).tr.step(new AttrStep(at,'language','ts'))
 const r=accept(b,tr,expected+'\r\n \t\r\nTail __raw__')
 expect(r.changedRoots).toEqual([0]);expect(r.edits.every(e=>e.to<=b.roots[0]!.tailFrom)).toBe(true)
})
it.each(['```js\nA','> ```js\n> A','- ```js\n  A'])(
 'unclosed literal cannot gain a closing marker on Attr or text edit: %j',raw=>{
  const b=open(raw),at=text(b.doc,'A')
  reject(b,state(b,at).tr.step(new AttrStep(at-1,'language','ts')))
  reject(b,state(b,at).tr.insertText('Z',at,at+1))
 })
it.each(['> > ```js\n> > A\n> > ```','> - ```js\n>   A\n>   ```'])(
 'closed multiply nested fence keeps its container on AttrStep: %j',raw=>{
  const b=open(raw+tail),at=text(b.doc,'A')
  accept(b,state(b,at).tr.step(new AttrStep(at-1,'language','ts')),raw.replace('```js','```ts')+tail)
 })
it('quote-first list recreates its schema-filled paragraph around a closed literal',()=>{
 const b=open('- > ```js\n  > A\n  > ```'+tail),at=text(b.doc,'A')
 accept(b,state(b,at).tr.step(new AttrStep(at-1,'language','ts')),'- > ```ts\n  > A\n  > ```'+tail)
})
it('heading-first list recreates the same schema-filled paragraph without literal-specific rules',()=>{
 const b=open('- # H'+tail),at=text(b.doc,'H')
 expect(b.doc.child(0).child(0).firstChild!.type.name).toBe('paragraph')
 expect(b.doc.child(0).child(0).firstChild!.content.size).toBe(0)
 accept(b,state(b,at).tr.step(new AttrStep(at-1,'level',2)),'- ## H'+tail)
})
it.each(['> > ```js\n> > A','- > ```js\n  > A'])(
 'multiply nested unclosed fence stays atomic: %j',raw=>{
  const b=open(raw),at=text(b.doc,'A');reject(b,state(b,at).tr.step(new AttrStep(at-1,'language','ts')))
 })
it('a dirty root beside an untouched unclosed container keeps that raw neighbor',()=>{
 const b=open('AB\r\n \t\r\n> ```js\n> A'),tr=command(state(b,2),splitBlock)
 const r=accept(b,tr,'A\n\nB\r\n \t\r\n> ```js\n> A')
 expect(r.changedRoots).toEqual([0]);expect(r.edits.every(e=>e.to<=b.roots[0]!.tailFrom)).toBe(true)
})
it('foreign root metadata receives a real capture before either render path',()=>{
 const b=open('A'+tail),unknown={...b,roots:b.roots.map(root=>({...root}))}
 accept(unknown,command(state(b,1),wrapIn(b.doc.type.schema.nodes.blockquote!)),'> A'+tail)
 accept(unknown,state(b,1).tr.addMark(1,2,b.doc.type.schema.marks.strong!.create()),'**A**'+tail)
})
it.each(['attrs','marks'] as const)('literal-first list does not discard an empty paragraph with nondefault %s',kind=>{
 const paragraph=defaultSchema.spec.nodes.get('paragraph')!,item=defaultSchema.spec.nodes.get('list_item')!
 const schema=new Schema({nodes:defaultSchema.spec.nodes
  .update('paragraph',{...paragraph,attrs:{privateLayout:{default:null}}})
  .update('list_item',{...item,marks:'_'}),marks:defaultSchema.spec.marks})
 const opened=createSourceSession('- ```js\n  A\n  ```'+tail,schema)
 expect(opened.ok).toBe(true);if(!opened.ok)throw Error(opened.reason)
 const b=opened.session,tr=EditorState.create({doc:b.doc}).tr
 if(kind==='attrs')tr.step(new AttrStep(2,'privateLayout',42))
 else tr.step(new AddNodeMarkStep(2,schema.marks.strong!.create()))
 tr.doc.check();reject(b,tr)
})
it('a schema without list paragraph filling rejects omission of an explicitly inserted empty paragraph',()=>{
 const item=defaultSchema.spec.nodes.get('list_item')!
 const schema=new Schema({nodes:defaultSchema.spec.nodes.update('list_item',{...item,content:'block+'}),marks:defaultSchema.spec.marks})
 const opened=createSourceSession('- ```js\n  A\n  ```'+tail,schema)
 expect(opened.ok).toBe(true);if(!opened.ok)throw Error(opened.reason)
 const b=opened.session
 expect(b.doc.child(0).child(0).firstChild!.type.name).toBe('code_block')
 const tr=EditorState.create({doc:b.doc}).tr.insert(2,schema.nodes.paragraph!.create())
 tr.doc.check();reject(b,tr)
})
it.each([false,true])('fence observation restores an existing getLines descriptor after throw=%s',throws=>{
 const getLines=StateBlock.prototype.getLines,skip=StateBlock.prototype.skipEmptyLines
 let observed:any,descriptor:PropertyDescriptor|undefined,calls=0
 const owned=function(this:any,...args:any[]){calls++;if(throws)throw Error('fence getLines failed');return getLines.apply(this,args as Parameters<typeof getLines>)}
 const spy=vi.spyOn(StateBlock.prototype,'skipEmptyLines').mockImplementation(function(this:any,...args:any[]){
  if(!observed){observed=this;Object.defineProperty(this,'getLines',{configurable:true,writable:true,enumerable:true,value:owned});descriptor=Object.getOwnPropertyDescriptor(this,'getLines')}
  return skip.apply(this,args as Parameters<typeof skip>)
 })
 try {
  const r=createSourceSession('```js\nA\n```');expect(r.ok).toBe(!throws)
  expect(calls).toBe(1);expect(Object.getOwnPropertyDescriptor(observed,'getLines')).toEqual(descriptor)
 }finally{spy.mockRestore()}
})
it('fence observation deletes only its temporary own method after an inherited getLines throws',()=>{
 let observed:any
 const spy=vi.spyOn(StateBlock.prototype,'getLines').mockImplementation(function(this:any){observed=this;throw Error('fence failed')})
 try {expect(createSourceSession('```js\nA\n```').ok).toBe(false);expect(Object.hasOwn(observed,'getLines')).toBe(false)}
 finally{spy.mockRestore()}
 expect(createSourceSession('```js\nA\n```').ok).toBe(true)
})
it('legacy sync and async fence parses do not install the capture getLines wrapper',async()=>{
 const original=StateBlock.prototype.getLines;let calls=0
 const spy=vi.spyOn(StateBlock.prototype,'getLines').mockImplementation(function(this:any,...args:any[]){
  calls++;expect(Object.hasOwn(this,'getLines')).toBe(false);return original.apply(this,args as Parameters<typeof original>)
 })
 try {
  const raw='> ```js\n> A\n> ```',doc=parseMarkdown(raw)
  expect((await parseMarkdownAsync(raw)).eq(doc)).toBe(true);expect(calls).toBe(2)
 }finally{spy.mockRestore()}
})
