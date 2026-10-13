import {expect,it,vi} from 'vitest'
import {Node as PmNode,Schema} from 'prosemirror-model'
import {EditorState,TextSelection,type Transaction,type Command} from 'prosemirror-state'
import {wrapInList,liftListItem,splitListItem,sinkListItem} from 'prosemirror-schema-list'
import {AttrStep,ReplaceStep} from 'prosemirror-transform'
import {MarkdownSerializer,MarkdownSerializerState} from 'prosemirror-markdown'
import {createSourceSession,applySourceBlockTransaction,type SourceSession} from '../source-fidelity'
import {parseMarkdown,serializeSourceRootMarkdown} from '../markdown'
import {defaultSchema} from '../schema'
const M='<!-- notemd:list-boundary -->'
const tail='\r\n \t\r\nTail __raw__\r\n'
function open(raw:string,schema=defaultSchema){const r=createSourceSession(raw,schema);if(!r.ok)throw Error(r.reason);return r.session}
function text(doc:PmNode,word:string){let at=-1;doc.descendants((n,p)=>{if(at<0&&n.isText&&n.text!.includes(word))at=p+n.text!.indexOf(word)});if(at<0)throw Error('fixture text missing');return at}
function state(b:SourceSession,word:string){return EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,text(b.doc,word))})}
function command(s:EditorState,c:Command){let tr:Transaction|undefined;expect(c(s,t=>tr=t)).toBe(true);if(!tr)throw Error('command not dispatched');return tr}
function accept(b:SourceSession,tr:Transaction,raw:string){const before=JSON.stringify(b);tr.doc.check();const r=applySourceBlockTransaction(b,tr);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error(r.reason);expect(r.session.doc.eq(tr.doc)).toBe(true);expect(open(r.session.source,b.doc.type.schema).doc.eq(tr.doc)).toBe(true);expect(Buffer.from(r.session.source)).toEqual(Buffer.from(raw));expect(JSON.stringify(b)).toBe(before);return r}
function reject(b:SourceSession,tr:Transaction){const before=JSON.stringify(b);const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(false);expect(r).not.toHaveProperty('session');expect(JSON.stringify(b)).toBe(before)}
// Explicit scenario augmentation: no production command adds boundary nodes yet.
function augmentScenarioSeam(tr:Transaction,pos:number){tr.insert(pos,tr.doc.type.schema.nodes.html_block!.create(null,tr.doc.type.schema.text(M)));expect(tr.doc.nodeAt(pos)?.textContent).toBe(M);return tr}
it('actual wrap with scenario M augmentation creates list/html/list/list',()=>{
 const b=open('1. A\n\nP\n\n1) C'+tail),tr=command(state(b,'P'),wrapInList(b.doc.type.schema.nodes.ordered_list!))
 augmentScenarioSeam(tr,tr.doc.child(0).nodeSize)
 expect(Array.from({length:tr.doc.childCount},(_,i)=>tr.doc.child(i).type.name)).toEqual(['ordered_list','html_block','ordered_list','ordered_list','paragraph'])
 accept(b,tr,`1. A\n\n${M}\n\n1. P\n\n1) C`+tail)
})
it('unaugmented same-marker adjacent list target still fails',()=>{
 const b=open('1. A\n\nP\n\n1) C'+tail),tr=command(state(b,'P'),wrapInList(b.doc.type.schema.nodes.ordered_list!));reject(b,tr)
})
it.each([
 ['+ A\n+ B','+ Z\n+ B'],['* A\n\n* B','* Z\n\n* B'],['0) A\n1) B','0) Z\n1) B'],
 ['* outer\n  + A\n\n  + B\n* end','* outer\n  + Z\n\n  + B\n* end'],
 ['* outer\n\n* end\n  + A\n  + B','* outer\n\n* end\n\n  + Z\n  + B'],
 ['0) outer\n\n   3. A\n   4. B\n\n1) end','0) outer\n\n   3. Z\n   4. B\n\n1) end'],
 ['* outer\n  + A\n\n  + B\n* end\n  - C\n  - D','* outer\n  + Z\n\n  + B\n* end\n  - C\n  - D'],
] as const)('source-only styles on nested text edit %s',(raw,expected)=>{const b=open(raw+tail),at=text(b.doc,'A');accept(b,state(b,'A').tr.insertText('Z',at,at+1),expected+tail)})
it.each(['+','*',')'])('marks and checked retain %s marker',marker=>{
 const prefix=marker===')'?'8)':marker,b=open(`${prefix} [ ] A\n${marker===')'?'9)':marker} [x] B`+tail)
 const tr=state(b,'A').tr.addMark(text(b.doc,'A'),text(b.doc,'A')+1,b.doc.type.schema.marks.strong!.create()).step(new AttrStep(1,'checked',true))
 accept(b,tr,`${prefix} [x] **A**\n${marker===')'?'9)':marker} [x] B`+tail)
})
it('splitListItem stays in one styled list without invented M',()=>{const b=open('* AlphaBeta\n\n* C'+tail),s=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,text(b.doc,'AlphaBeta')+5)});accept(b,command(s,splitListItem(s.schema.nodes.list_item!)),'* Alpha\n\n* Beta\n\n* C'+tail)})
it('split source list then explicit scenario boundary inherits both styles',()=>{
 const b=open('+ A\n+ B\n+ C'+tail),tr=command(state(b,'B'),liftListItem(b.doc.type.schema.nodes.list_item!))
 const p=tr.doc.child(0).nodeSize,paragraph=tr.doc.child(1);tr.delete(p,p+paragraph.nodeSize);augmentScenarioSeam(tr,p)
 accept(b,tr,`+ A\n\n${M}\n\n+ C`+tail)
})
it('delete real M then actual join uses left surviving marker',()=>{const b=open(`+ A\n\n${M}\n\n* B`+tail),left=b.doc.child(0).nodeSize,tr=state(b,'A').tr.delete(left,left+b.doc.child(1).nodeSize).join(left);expect(tr.doc.childCount).toBe(2);accept(b,tr,'+ A\n+ B'+tail)})
it.each([
 [`> 1. A\n>\n> ${M}\n>\n> 1. B`,`> 1. Z\n>\n> ${M}\n>\n> 1. B`],
 [`- parent\n\n  1. A\n\n  ${M}\n\n  1. B`,`- parent\n\n  1. Z\n\n  ${M}\n\n  1. B`],
 [`> - parent\n>\n>   1. A\n>\n>   ${M}\n>\n>   1. B`,`> - parent\n>\n>   1. Z\n>\n>   ${M}\n>\n>   1. B`],
 [`- parent\n\n  > 1. A\n  >\n  > ${M}\n  >\n  > 1. B`,`- parent\n\n  > 1. Z\n  >\n  > ${M}\n  >\n  > 1. B`],
] as const)('nested M is actual html and remains in its container %s',(raw,expected)=>{
 const b=open(raw+tail);expect(parseMarkdown(raw+tail).eq(b.doc)).toBe(true);let html=0;b.doc.descendants((n,p)=>{if(n.type.name==='html_block'){html++;expect(n.textContent).toBe(M);expect(b.doc.resolve(p).depth).toBeGreaterThan(0)}});expect(html).toBe(1)
 accept(b,state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1),expected+tail)
})
it.each(['','\n','\r\n','\r'])('M raw lifecycle exact EOL %j',eol=>{for(const bom of ['', '\uFEFF']){const raw=bom+M+eol,b=open(raw);expect(b.doc.firstChild!.type.name).toBe('html_block');expect(b.doc.firstChild!.textContent).toBe(M);expect(b.layout.fallback).toBeUndefined();expect(open(b.source).source).toBe(raw);expect(applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr)).toMatchObject({ok:true,session:b,mode:'unchanged'})}})
it('orphan M survives deleting a list end and insertion of ordinary block',()=>{const b=open(`+ A\n\n${M}\n\n+ B`),tr=state(b,'A').tr.delete(0,b.doc.child(0).nodeSize);tr.insert(0,b.doc.type.schema.nodes.paragraph!.create(null,b.doc.type.schema.text('P')));accept(b,tr,`P\n\n${M}\n\n+ B`)})
it.each([M+' ','<!-- ordinary -->','<!-- notemd:list-boundary-->',M+'\n'])('ordinary or inexact HTML structural birth is rejected %j',raw=>{const b=open('A'+tail),tr=state(b,'A').tr.insert(b.doc.child(0).nodeSize,b.doc.type.schema.nodes.html_block!.create(null,b.doc.type.schema.text(raw)));reject(b,tr)})
it('ordinary top-level HTML deletion stays rejected',()=>{const b=open('<!-- ordinary -->\n\nA');reject(b,state(b,'A').tr.delete(0,b.doc.child(0).nodeSize))})
it.each(['clone','missing'] as const)('foreign %s restores real authority including closed fence before rendering',kind=>{
 const b=open('* A\n\n* B\n\n> ```js\n> F\n> ```'+tail),foreign={...b,doc:PmNode.fromJSON(b.doc.type.schema,b.doc.toJSON()),roots:JSON.parse(JSON.stringify(b.roots)),layout:JSON.parse(JSON.stringify(b.layout))}
 if(kind==='missing')delete foreign.layout.lists
 const tr=state(foreign,'A').tr.insertText('Z',text(foreign.doc,'A'),text(foreign.doc,'A')+1)
 const r=accept(foreign,tr,'* Z\n\n* B\n\n> ```js\n> F\n> ```'+tail);expect(r.session.revision).toBe(1)
 const noop=applySourceBlockTransaction(foreign,EditorState.create({doc:foreign.doc}).tr);expect(noop.ok&&noop.session).toBe(foreign)
 const f=state(foreign,'F').tr.insertText('G',text(foreign.doc,'F'),text(foreign.doc,'F')+1);accept(foreign,f,'* A\n\n* B\n\n> ```js\n> G\n> ```'+tail)
})
it.each(['marker','tight','pmFrom','omit','root','gap','span','blank'] as const)('tampered %s authority fails before serializer',kind=>{
 const b=open('* A\n  + B'+tail),copy=JSON.parse(JSON.stringify(b.layout)),foreign={...b,layout:copy}
 if(kind==='marker')copy.lists[0].marker='-';if(kind==='tight')copy.lists[0].tight=false;if(kind==='pmFrom')copy.lists[0].pmFrom++
 if(kind==='omit')copy.lists.pop();if(kind==='root')foreign.roots=b.roots.map((r,i)=>i? r:{...r,tailFrom:r.tailFrom+1})
 if(kind==='gap')foreign.gaps=[...b.gaps,{sourceFrom:0,sourceTo:1} as never];if(kind==='span')foreign.textSpans=[{sourceFrom:0,sourceTo:1,pmFrom:0,pmTo:1,kind:'linear'}];if(kind==='blank')copy.blankLines=[]
 const spy=vi.spyOn(MarkdownSerializer.prototype,'serialize');try{reject(foreign,state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1));expect(spy).not.toHaveBeenCalled()}finally{spy.mockRestore()}
})
it.each([-1,1.5,1000000000])('illegal ordered start %s is rejected',order=>{const b=open('0) A'+tail);reject(b,state(b,'A').tr.step(new AttrStep(0,'order',order)))})
it('nine-digit ordered continuation never overflows',()=>{const b=open('999999999) A\n999999999) B'+tail);accept(b,state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1),'999999999) Z\n999999999) B'+tail)})
it.each([
 ['* A\n* B','B','sink','* A\n  * B'],
 ['* A\n  + B\n  + C','C','lift','* A\n  + B\n* C'],
 ['0) A\n1) B','B','sink','0) A\n   1) B'],
] as const)('actual nested %s %s %s preserves item lineage',(raw,word,kind,expected)=>{
 const b=open(raw+tail),s=state(b,word),c=kind==='sink'?sinkListItem(s.schema.nodes.list_item!):liftListItem(s.schema.nodes.list_item!)
 accept(b,command(s,c),expected+tail)
})
it('multiple actual wrap births with scenario M steps preserve a long list chain',()=>{
 const b=open('1. A\n\nP\n\n1. B\n\nQ\n\n1. C\n\nR\n\n1. D'+tail),tr=state(b,'P').tr
 for(const word of ['P','Q','R']){
  const s=EditorState.create({doc:tr.doc,selection:TextSelection.create(tr.doc,text(tr.doc,word))}),wrapped=command(s,wrapInList(s.schema.nodes.ordered_list!))
  for(const step of wrapped.steps)tr.step(step)
 }
 const seams:number[]=[];tr.doc.forEach((node,pos,index)=>{if(index&&node.type.name==='ordered_list'&&tr.doc.child(index-1).type.name==='ordered_list')seams.push(pos)})
 for(const pos of seams.reverse())augmentScenarioSeam(tr,pos)
 let html=0;tr.doc.descendants(n=>{if(n.type.name==='html_block')html++});expect(html).toBe(6)
 accept(b,tr,['A','P','B','Q','C','R','D'].map(t=>'1. '+t).join(`\n\n${M}\n\n`)+tail)
})
it.each([
 ['> 1. A\n>\n> P\n>\n> 1. B',`> 1. A\n>\n> ${M}\n>\n> 1. P\n>\n> ${M}\n>\n> 1. B`],
 ['- parent\n\n  1. A\n\n  P\n\n  1. B',`- parent\n\n  1. A\n\n  ${M}\n\n  1. P\n\n  ${M}\n\n  1. B`],
 ['> - parent\n>\n>   1. A\n>\n>   P\n>\n>   1. B',`> - parent\n>\n>   1. A\n>\n>   ${M}\n>\n>   1. P\n>\n>   ${M}\n>\n>   1. B`],
 ['- parent\n\n  > 1. A\n  >\n  > P\n  >\n  > 1. B',`- parent\n\n  > 1. A\n  >\n  > ${M}\n  >\n  > 1. P\n  >\n  > ${M}\n  >\n  > 1. B`],
] as const)('nested actual wrap plus two explicit scenario M inserts %s',(raw,expected)=>{
 const b=open(raw+tail),tr=command(state(b,'P'),wrapInList(b.doc.type.schema.nodes.ordered_list!)),p=tr.doc.resolve(text(tr.doc,'P'))
 const listDepth=p.depth-2,from=p.before(listDepth),to=p.after(listDepth)
 expect(p.node(listDepth).type.name).toBe('ordered_list');augmentScenarioSeam(tr,to);augmentScenarioSeam(tr,from)
 accept(b,tr,expected+tail)
})
it('nested M deletion and join stay inside quote',()=>{
 const b=open(`> 1) A\n>\n> ${M}\n>\n> 1. B`+tail);let pos=-1;b.doc.descendants((n,p)=>{if(n.type.name==='html_block')pos=p})
 const tr=state(b,'A').tr.delete(pos,pos+b.doc.nodeAt(pos)!.nodeSize).join(pos);accept(b,tr,'> 1) A\n> 2) B'+tail)
})
it('Source edits obey ordinary HTML grammar without supplementing a deleted M',()=>{
 const raw=`1. A\n\n${M}\n\n1. B`
 for(const changed of [raw.replace(M,'<!-- ordinary -->'),raw.replace(M,''),raw.replace(M,M+' '),raw.replace(M,'```\n'+M+'\n```')]){
  const b=open(changed);expect(b.doc.eq(parseMarkdown(changed))).toBe(true);expect(open(b.source).source).toBe(changed)
 }
 expect(open(raw.replace(`\n\n${M}`, '')).doc.childCount).toBe(1)
})
it('consecutive real M nodes and orphan retain exact raw on reopen',()=>{for(const raw of [M+'\n\n'+M,M+'\r\n\r\n'+M+'\r\n']){const b=open(raw);expect(b.doc.childCount).toBe(2);expect(b.doc.child(1).type.name).toBe('html_block');expect(b.source).toBe(raw);expect(open(b.source).doc.eq(b.doc)).toBe(true)}})
it.each(['label','listType','spread'])('all list attrs remain strict including %s',attr=>{const b=open('+ A'+tail);reject(b,state(b,'A').tr.step(new AttrStep(1,attr,attr==='spread'?'false':'private')))})
it('a fully replaced identical-body list is new, not a lexical match',()=>{
 const b=open('+ A'+tail),fresh=PmNode.fromJSON(b.doc.type.schema,b.doc.child(0).toJSON()),tr=state(b,'A').tr.replaceWith(0,b.doc.child(0).nodeSize,fresh)
 // Equal final document is a genuine no-op, so include a target change.
 tr.insertText('Z',text(tr.doc,'A'),text(tr.doc,'A')+1);accept(b,tr,'- Z'+tail)
})
it('family change uses default style and keeps target order',()=>{
 const b=open('+ A'+tail),tr=state(b,'A').tr.setNodeMarkup(0,b.doc.type.schema.nodes.ordered_list!,{order:3});accept(b,tr,'3. A'+tail)
})
it.each(['attr','mark','text-mark'])('M cannot gain a structural exemption with extra %s',kind=>{
 const html=defaultSchema.spec.nodes.get('html_block')!,schema=new Schema({nodes:defaultSchema.spec.nodes.update('doc',{...defaultSchema.spec.nodes.get('doc')!,marks:'_'}).update('html_block',{...html,attrs:{privateValue:{default:null}},marks:'_'}),marks:defaultSchema.spec.marks})
 const b=open('A'+tail,schema),strong=schema.marks.strong!.create(),n=schema.nodes.html_block!.create(kind==='attr'?{privateValue:42}:null,schema.text(M,kind==='text-mark'?[strong]:[]),kind==='mark'?[strong]:[])
 reject(b,state(b,'A').tr.insert(b.doc.child(0).nodeSize,n))
})
it('table cell and first list_item paragraph schema contracts remain strict',()=>{
 const s=defaultSchema,n=s.nodes.html_block!.create(null,s.text(M))
 expect(()=>s.nodes.table_cell!.createChecked(null,n)).toThrow()
 expect(()=>s.nodes.list_item!.createChecked(null,n)).toThrow()
})
it.each(['protected','unclosed','subclass','chain','stale'])('R1 and real guards reject %s atomically before serialization',kind=>{
 const b=open(kind==='protected'?'> * A\n>\n> [ref]: /u':kind==='unclosed'?'> * A\n>\n> ```js\n> F':'* A'+tail)
 let tr=state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1)
 if(kind==='subclass'){class Inherited extends ReplaceStep{};const step=tr.steps[0] as ReplaceStep;tr=state(b,'A').tr.step(new Inherited(step.from,step.to,step.slice))}
 if(kind==='chain'){tr.insertText('Q',text(tr.doc,'Z'));tr.docs[1]=open('* bad'+tail).doc}
 if(kind==='stale')tr=state(open('* different'+tail),'different').tr.insertText('Z',3,4)
 const spy=vi.spyOn(MarkdownSerializer.prototype,'serialize');try{reject(b,tr);expect(spy).not.toHaveBeenCalled()}finally{spy.mockRestore()}
})
it('per-list tight is consumed in nesting order and finally restores after exceptions',()=>{
 const b=open('* outer\n  + A\n\n  + B\n* end\n  - C\n  - D'),lists=b.layout.lists!.map(f=>({node:b.doc.nodeAt(f.pmFrom)!,style:{marker:f.marker,tight:f.tight}}))
 const original=MarkdownSerializerState.prototype.renderList,seen:boolean[]=[],states:MarkdownSerializerState[]=[]
 let throws=true
 const spy=vi.spyOn(MarkdownSerializerState.prototype,'renderList').mockImplementation(function(this:MarkdownSerializerState,...args:Parameters<typeof original>){
  states.push(this);seen.push(this.options.tightLists!);if(throws&&args[0]===lists[1]!.node)throw Error('scenario serializer throw')
  return original.apply(this,args)
 })
 try{
  expect(()=>serializeSourceRootMarkdown(b.doc,{lists})).toThrow('scenario serializer throw');expect(seen).toEqual([true,false]);expect(states[0]!.options.tightLists).toBe(true)
  throws=false;seen.length=0
  expect(serializeSourceRootMarkdown(b.doc,{lists})).toBe(b.source);expect(seen).toEqual([true,false,true]);expect(states.at(-1)!.options.tightLists).toBe(true)
 }finally{spy.mockRestore()}
})
it('untouched BOM/EOL/definition bytes remain exact around a styled changed root',()=>{
 const prefix='\uFEFFBefore __raw__\r\n\r\n[ref]: /u "title"\r\n\r\n',suffix='\r\n \t\r\n'+M+'\r\n\r\nTail &amp; \\*\r',b=open(prefix+'+ A\r\n+ B'+suffix)
 accept(b,state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1),prefix+'+ Z\n+ B'+suffix)
})
it('a failed style call does not poison a later independent source transaction',()=>{
 const b=open('0) A'+tail);reject(b,state(b,'A').tr.step(new AttrStep(0,'order',1000000000)))
 accept(b,state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1),'0) Z'+tail)
})
it('foreign unclosed fence is recaptured but remains rejected before rendering',()=>{
 const b=open('> * A\n>\n> ```js\n> F'),foreign={...b,roots:b.roots.map(r=>({...r})),layout:{...b.layout}},tr=state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1)
 const spy=vi.spyOn(MarkdownSerializer.prototype,'serialize');try{reject(foreign,tr);expect(spy).not.toHaveBeenCalled()}finally{spy.mockRestore()}
})
it('repeated list text keeps distinct shell and nested styles',()=>{
 const raw='* Same\n  + Same\n\nSame\n\n+ Same\n  * Same',b=open(raw+tail);let at=-1;b.doc.descendants((n,p)=>{if(n.isText&&n.text==='Same')at=p})
 accept(b,EditorState.create({doc:b.doc}).tr.insertText('Z',at,at+4),'* Same\n  + Same\n\nSame\n\n+ Same\n  * Z'+tail)
})
it('reusing a PM list object at a new seam does not transfer lexical authority',()=>{
 const b=open('+ A'),tr=state(b,'A').tr.insert(b.doc.child(0).nodeSize,b.doc.child(0));augmentScenarioSeam(tr,b.doc.child(0).nodeSize)
 expect(tr.doc.child(0)).toBe(tr.doc.child(2))
 accept(b,tr,`+ A\n\n${M}\n\n- A`)
})
it.each(['text','mark','split'] as const)('unrelated outer tombstone cannot be absorbed by list %s window',kind=>{
 const raw=`${M}\n\n[ref]: /u "title"\n\n+ AlphaBeta`,b=open(raw),tr=state(b,'AlphaBeta').tr.delete(0,b.doc.child(0).nodeSize)
 const at=text(tr.doc,'AlphaBeta')
 if(kind==='text')tr.insertText('Z',at,at+1)
 else if(kind==='mark')tr.addMark(at,at+5,b.doc.type.schema.marks.strong!.create())
 else {const next=command(EditorState.create({doc:tr.doc,selection:TextSelection.create(tr.doc,at+5)}),splitListItem(b.doc.type.schema.nodes.list_item!));for(const step of next.steps)tr.step(step)}
 const list=kind==='text'?'+ ZlphaBeta':kind==='mark'?'+ **Alpha**Beta':'+ Alpha\n+ Beta'
 const r=accept(b,tr,'\n[ref]: /u "title"\n\n'+list)
 expect(r.edits.every(e=>e.to<=b.protectedSources[0]!.sourceFrom||e.from>=b.protectedSources[0]!.sourceTo)).toBe(true)
})
it('delete M plus join cannot claim a protected definition at the crossed seam',()=>{
 const b=open(`+ A\n\n${M}\n\n[ref]: /u\n\n* B`),left=b.doc.child(0).nodeSize,tr=state(b,'A').tr.delete(left,left+b.doc.child(1).nodeSize).join(left)
 reject(b,tr)
})
it('delete M beside a semantic blank does not silently remove that real paragraph',()=>{
 const b=open(`+ A\n\n${M}\n\n\n* B`),left=b.doc.child(0).nodeSize,tr=state(b,'A').tr.delete(left,left+b.doc.child(1).nodeSize)
 expect(tr.doc.child(1).type.name).toBe('paragraph');expect(tr.doc.child(1).content.size).toBe(0)
 expect(()=>tr.join(left)).toThrow()
})
it('joined loose source remains loose with actual left marker',()=>{
 const b=open(`+ A\n\n+ B\n\n${M}\n\n* C\n`),left=b.doc.child(0).nodeSize,tr=state(b,'A').tr.delete(left,left+b.doc.child(1).nodeSize).join(left)
 accept(b,tr,'+ A\n\n+ B\n\n+ C\n')
})
it('nested reused list occurrence receives a distinct render copy and new default',()=>{
 const b=open('> + A'),quote=b.doc.child(0),list=quote.child(0),tr=state(b,'A').tr.insert(1+list.nodeSize,list)
 augmentScenarioSeam(tr,1+list.nodeSize);expect(tr.doc.child(0).child(0)).toBe(tr.doc.child(0).child(2))
 accept(b,tr,`> + A\n>\n> ${M}\n>\n> - A`)
})
it.each(['','Before __raw__\r\n\r\n'])('existing join recipe retains its last available terminal at EOF, prefix=%j',prefix=>{
 const raw=prefix+`+ A\n\n+ B\n\n${M}\n\n* C`,b=open(raw);let at=-1
 b.doc.descendants((n,p)=>{if(n.type.name==='html_block')at=p})
 const tr=state(b,'A').tr.delete(at,at+b.doc.nodeAt(at)!.nodeSize).join(at)
 // Existing recipe takes the last available terminal slot (M's LF), even
 // when the final joined origin had no EOL. This is not a zero-diff EOF claim.
 const r=accept(b,tr,prefix+'+ A\n\n+ B\n\n+ C\n')
 expect(r.session.source.startsWith(prefix)).toBe(true);expect(r.edits.every(e=>e.from>=prefix.length)).toBe(true)
})
it('nested splitListItem preserves independent outer tight and inner loose style',()=>{
 const b=open('* outer\n  + AlphaBeta\n\n  + C\n* end'+tail),s=EditorState.create({doc:b.doc,selection:TextSelection.create(b.doc,text(b.doc,'AlphaBeta')+5)})
 accept(b,command(s,splitListItem(s.schema.nodes.list_item!)),'* outer\n  + Alpha\n\n  + Beta\n\n  + C\n* end'+tail)
})
it('ordered marker width keeps nested continuation at a digit transition',()=>{
 const b=open('9) A\n10) B\n    + C'+tail),tr=state(b,'A').tr.insertText('Z',text(b.doc,'A'),text(b.doc,'A')+1)
 accept(b,tr,' 9) Z\n10) B\n    + C'+tail)
})
