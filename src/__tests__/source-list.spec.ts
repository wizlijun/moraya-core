import {expect,it,vi} from 'vitest'
import {Node as PmNode,NodeType} from 'prosemirror-model'
import {EditorState} from 'prosemirror-state'
import {createSourceSession,applySourceTextTransaction} from '../source-fidelity'
import {parseMarkdown,serializeMarkdown,capturedSourceLists} from '../markdown'
import {defaultSchema} from '../schema'

function open(source:string) {
 const result=createSourceSession(source)
 expect(result.ok,JSON.stringify(result)).toBe(true)
 if(!result.ok)throw Error(result.reason)
 return result.session
}
const cases=[
 ['- A\n- B', ['-']], ['+ A\n+ B', ['+']], ['* A\n* B', ['*']],
 ['3. A\n4. B', ['.']], ['8) A\n9) B', [')']],
 ['> + A\n>   1) B\n>      * C', ['+',')','*']],
 ['- A\n  + B\n\n  + C\n- D', ['-','+']],
 ['- A\n\n- B\n  + C\n  + D', ['-','+']],
 ['- - A', ['-','-']], ['- A\n  - Same\n- A\n  - Same', ['-','-','-']],
 ['-\n-', ['-']], ['> -\n> -', ['-']],
 ['\uFEFF+ A\r\n  * B\r\n', ['+','*']], ['> 0) A\r>    - B', [')','-']],
] as const
it.each(cases)('actual list facts bind final nodes and raw envelopes: %s',(raw,markers)=>{
 const b=open(raw),lists=b.layout.lists
 expect(lists?.map(f=>f.marker)).toEqual(markers)
 expect(Object.isFrozen(lists)).toBe(true)
 const actual:number[]=[]
 b.doc.descendants((node,pos)=>{if(['bullet_list','ordered_list'].includes(node.type.name))actual.push(pos)})
 expect(lists?.map(f=>f.pmFrom)).toEqual(actual)
 for(const f of lists!){
  expect(Object.isFrozen(f)).toBe(true)
  const node=b.doc.nodeAt(f.pmFrom)!,root=b.roots.find(r=>r.id===f.rootId)!
  expect(node.type.name).toBe(f.kind+'_list');expect(node.nodeSize).toBe(f.pmTo-f.pmFrom)
  expect(f.pmFrom).toBeGreaterThanOrEqual(root.pmFrom);expect(f.pmTo).toBeLessThanOrEqual(root.pmTo)
  expect(f.sourceFrom).toBeGreaterThanOrEqual(root.sourceFrom);expect(f.sourceTo).toBeLessThanOrEqual(root.sourceTo)
  expect(raw.slice(f.sourceFrom,f.sourceTo)).toContain(f.marker)
 }
 expect(b.source).toBe(raw);expect(b.doc.eq(parseMarkdown(raw.startsWith('\uFEFF')?raw.slice(1):raw))).toBe(true)
})
it.each([
 ['- A\n  + B\n\n  + C\n- D',[true,false]],
 ['- A\n\n- B\n  + C\n  + D',[false,true]],
 ['-\n-',[true]], ['- - A',[true,true]],
 ['- A\n  + B\n\n  + C\n- D\n  * E\n  * F',[true,false,true]],
] as const)('tight uses only direct item paragraphs: %s',(raw,tight)=>{
 expect(open(raw).layout.lists?.map(f=>f.tight)).toEqual(tight)
})
it('schema-filled first paragraph shifts the actual nested list position',()=>{
 const b=open('- - A'),outer=b.doc.child(0),item=outer.child(0)
 expect(item.child(0).type.name).toBe('paragraph');expect(item.child(0).content.size).toBe(0)
 expect(b.layout.lists?.map(f=>f.pmFrom)).toEqual([0,4])
 expect(b.doc.nodeAt(4)).toBe(item.child(1))
})
it.each(['- [x] A','+ [ ] B','* [X] C','- [x]A','- [ ]\tB','- [x]**B**','- [ ] [B](https://example.com)','- [x] &amp; \\* **bold** [link](https://example.com)',
 '- Parent\n  + [ ] Child','> * [X] A','- [x]','\uFEFF- [x] A\r\n','- [ ] B\r'])('checkbox capture preserves real attrs and text: %s',raw=>{
 const b=open(raw)
 expect(b.doc.eq(parseMarkdown(raw.startsWith('\uFEFF')?raw.slice(1):raw))).toBe(true)
 const checked:boolean[]=[];b.doc.descendants(node=>{if(node.type.name==='list_item'&&node.attrs.checked!==null)checked.push(node.attrs.checked)})
 expect(checked).toHaveLength(1);expect(checked[0]).toBe(/\[[xX]\]/.test(raw))
 expect(b.source).toBe(raw)
 const checkbox=raw.match(/\[[ xX]\]/)!,marker=checkbox.index!
 for(const span of b.textSpans){
  expect(span.sourceTo<=marker||span.sourceFrom>=marker+3).toBe(true)
  const from=b.doc.resolve(span.pmFrom),to=b.doc.resolve(span.pmTo)
  expect(from.sameParent(to)).toBe(true);expect(from.parent.type.name).toBe('paragraph')
  if(span.kind==='linear')expect(raw.slice(span.sourceFrom,span.sourceTo)).toBe(b.doc.textBetween(span.pmFrom,span.pmTo))
 }
 expect(b.textSpans.length>0).toBe(b.doc.textContent.length>0)
 expect(parseMarkdown(serializeMarkdown(b.doc)).eq(b.doc)).toBe(true)
})
it.each([0,1,3,8,999999999])('ordered %s actual attrs and default serializer readback',order=>{
 const b=open(`${order}. A`)
 expect(b.doc.child(0).attrs.order).toBe(order)
 const rendered=serializeMarkdown(b.doc)
 expect(rendered.startsWith(`${order}. `)).toBe(true)
 expect(parseMarkdown(rendered).eq(b.doc)).toBe(true)
})
it('default serializer independently preserves a numeric ordered0 node',()=>{
 const s=defaultSchema,doc=s.node('doc',null,[s.node('ordered_list',{order:0},[
  s.node('list_item',null,[s.node('paragraph',null,[s.text('A')])]),
 ])])
 expect(serializeMarkdown(doc)).toBe('0. A')
 expect(parseMarkdown(serializeMarkdown(doc)).eq(doc)).toBe(true)
})
it('nested checked text has exact authority without touching checkbox or top-level text',()=>{
 const raw='- [x] A\n\nTail &amp; \\*',b=open(raw),before=JSON.stringify(b)
 expect(b.textSpans.some(s=>s.sourceFrom>=raw.indexOf('Tail'))).toBe(true)
 expect(b.doc.textBetween(3,4)).toBe('A')
 const tr=EditorState.create({doc:b.doc}).tr.insertText('B',3,4),result=applySourceTextTransaction(b,tr)
 expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason)
 expect(result.session.source).toBe('- [x] B\n\nTail &amp; \\*')
 expect(result.session.doc.eq(tr.doc)).toBe(true);expect(JSON.stringify(b)).toBe(before)
})
it('only actual source/doc/roots/layout bindings have list authority',()=>{
 const b=open('- A'),get=(source=b.source,doc=b.doc,roots=b.roots,layout=b.layout)=>capturedSourceLists(source,doc,roots,layout)
 expect(get()).toBe(b.layout.lists)
 expect(get(b.source+'\n')).toBeUndefined()
 expect(get(b.source,PmNode.fromJSON(b.doc.type.schema,b.doc.toJSON()))).toBeUndefined()
 expect(get(b.source,b.doc,[...b.roots])).toBeUndefined()
 expect(get(b.source,b.doc,b.roots,{...b.layout})).toBeUndefined()
 expect(get(b.source,b.doc,b.roots,{blankLines:b.layout.blankLines})).toBeUndefined()
 const saved=b.layout.lists
 Object.assign(b.layout,{lists:Object.freeze([])})
 expect(get()).toBeUndefined()
 Object.assign(b.layout,{lists:saved})
 expect(get()).toBe(saved)
 const revised={...b,revision:7}
 expect(capturedSourceLists(revised.source,revised.doc,revised.roots,revised.layout)).toBe(saved)
 const plain=open('Plain');expect(plain.layout.lists).toEqual([]);expect(Object.isFrozen(plain.layout.lists)).toBe(true)
})
it.each(['- A','> + B','- - A','-\n-'])('physical list envelopes include container prefixes and exact EOF: %s',raw=>{
 const b=open(raw)
 for(const f of b.layout.lists!)expect(raw.slice(f.sourceFrom,f.sourceTo)).toBe(raw)
 expect(open(serializeMarkdown(b.doc)).doc.eq(b.doc)).toBe(true)
})
it('BOM and CRLF envelopes retain raw physical lines for nested nodes',()=>{
 const raw='\uFEFF> + A\r\n>   - B\r\n',b=open(raw)
 expect(b.layout.lists?.map(f=>raw.slice(f.sourceFrom,f.sourceTo))).toEqual([raw.slice(1),'>   - B\r\n'])
})
it('capture refuses a schema-fill replacement of the emitted nested node',()=>{
 const original=NodeType.prototype.createAndFill
 const spy=vi.spyOn(NodeType.prototype,'createAndFill').mockImplementation(function(this:NodeType,...args:Parameters<typeof original>){
  const node=original.apply(this,args)
  return this.name==='list_item'&&node?PmNode.fromJSON(this.schema,node.toJSON()):node
 })
 try{expect(createSourceSession('- - A')).toEqual({ok:false,reason:'unsupported-source'})}
 finally{spy.mockRestore()}
 expect(open('- - A').layout.lists).toHaveLength(2)
})
