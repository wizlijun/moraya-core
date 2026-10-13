import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {createSourceSession,applySourceBlockTransaction,applySourceTextTransaction} from '../source-fidelity'
function position(doc:any,needle:string) {
 let result:number|undefined
 doc.descendants((n:any,p:number)=>{if(n.isText&&result===undefined){const i=n.text.indexOf(needle);if(i>=0)result=p+i}})
 if(result===undefined)throw new Error('fixture text missing')
 return result
}

for(const source of ['- [ref]: /url\n\n  Alpha\n\nTail','> [ref]: /url\n>\n> Alpha\n\nTail']) {
 it(`marks the complete reference-covered body atomically: ${JSON.stringify(source)}`,()=>{
  const opened=createSourceSession(source);expect(opened.ok).toBe(true)
  if(!opened.ok)throw new Error(opened.reason)
  const base=opened.session,p=position(base.doc,'Alpha')
  const before=JSON.stringify(base),bytes=Buffer.from(base.source)
  const tr=EditorState.create({doc:base.doc}).tr.addMark(p,p+5,base.doc.type.schema.marks.strong!.create())
  const result=applySourceBlockTransaction(base,tr)
  expect(result.ok).toBe(true)
  if(!result.ok)throw Error(result.reason)
  expect(result.mode).toBe('fragment-render')
  expect(result.session.source).toBe(source.replace('Alpha','**Alpha**'))
  expect(result.session.doc.eq(tr.doc)).toBe(true)
  const tail=position(base.doc,'Tail')
  const outside=EditorState.create({doc:base.doc}).tr.addMark(p,tail+4,base.doc.type.schema.marks.strong!.create())
  expect(applySourceBlockTransaction(base,outside)).toEqual({ok:false,reason:'unsupported-step'})
  expect(Buffer.from(base.source)).toEqual(bytes)
  expect(JSON.stringify(base)).toBe(before)
 })
}

function session(source:string) {
 const opened=createSourceSession(source)
 expect(opened.ok).toBe(true)
 if(!opened.ok)throw new Error(opened.reason)
 return opened.session
}
for(const eol of ['\n','\r\n','\r'])for(const bom of ['', '\uFEFF'])for(const prefix of ['', '- ', '> ']) {
 const definition=`${prefix}[ref]: /url${eol}`
 const source=bom+definition+(prefix==='> '?`>${eol}> Alpha`:prefix==='- '?`${eol}  Alpha`:'Alpha')
 it(`captures physical reference bytes: ${JSON.stringify(source)}`,()=>{
  const base=session(source)
  expect(base.protectedSources).toEqual([{kind:'reference-definition',sourceFrom:bom.length,
   sourceTo:bom.length+definition.length,scope:prefix?'nested':'top-level'}])
  expect(Object.isFrozen(base.protectedSources)).toBe(true)
  expect(Object.isFrozen(base.protectedSources[0])).toBe(true)
  expect(Buffer.from(source.slice(base.protectedSources[0]!.sourceFrom,base.protectedSources[0]!.sourceTo)))
   .toEqual(Buffer.from(definition))
  if(prefix) {
   expect(base.roots[0]!.sourceFrom).toBe(bom.length)
   expect(base.roots[0]!.sourceTo).toBe(source.length)
  }
 })
}
for(const [source,parts] of [
 ['[ref]: /url', ['[ref]: /url']],
 ['> [ref]: /url', ['> [ref]: /url']],
 ['- [ref]: /url', ['- [ref]: /url']],
 ['[ref]:\n  /url\n  "multi\n  title"\n\nAlpha', ['[ref]:\n  /url\n  "multi\n  title"\n']],
 ['> [ref]:\n> /url\n> "title"\n>\n> Alpha', ['> [ref]:\n> /url\n> "title"\n']],
 ['- [ref]:\n    /url\n    "title"\n\n  Alpha', ['- [ref]:\n    /url\n    "title"\n']],
 ['[ref]: /one\r\n[ref]: /two\r\n\r\nAlpha', ['[ref]: /one\r\n','[ref]: /two\r\n']],
 ['> [ref]: /one\n> [ref]: /two\n>\n> Alpha', ['> [ref]: /one\n','> [ref]: /two\n']],
 ['- [ref]: /one\n  [ref]: /two\n\n  Alpha', ['- [ref]: /one\n','  [ref]: /two\n']],
 ['[ref]: /one\r\n\r\n> [other]: /two\r>\r> Alpha\n\nTail', ['[ref]: /one\r\n','> [other]: /two\r']],
 ['[ref]: /url\n"unfinished\nAlpha', ['[ref]: /url\n']],
 ['[ref]: /url\n"title" garbage\nAlpha', ['[ref]: /url\n']],
 ['> [ref]: /url\n> "unfinished\n> Alpha', ['> [ref]: /url\n']],
 ['[bad]: javascript:alert(1)\n\nAlpha', []],
 ['[bad]: /url garbage\n\nAlpha', []],
 ['```\n[ref]: /url\n```\n\nAlpha', []],
] as const)it(`captures actual successful consumption only: ${JSON.stringify(source)}`,()=>{
 const base=session(source)
 expect(base.protectedSources.map(r=>source.slice(r.sourceFrom,r.sourceTo))).toEqual(parts)
 for(let i=1;i<base.protectedSources.length;i++)expect(base.protectedSources[i-1]!.sourceTo).toBeLessThanOrEqual(base.protectedSources[i]!.sourceFrom)
})
for(const source of ['- [ref]: /url\n\n  Alpha\n\nTail','> [ref]: /url\n>\n> Alpha\n\nTail']) {
 it(`preserves definition when editing adjacent owner: ${JSON.stringify(source)}`,()=>{
  const base=session(source),p=position(base.doc,'Tail')
  const result=applySourceBlockTransaction(base,EditorState.create({doc:base.doc}).tr.addMark(p,p+4,base.doc.type.schema.marks.strong!.create()))
  expect(result.ok).toBe(true)
  if(!result.ok)throw new Error(result.reason)
  expect(result.session.source).toBe(source.replace('Tail','**Tail**'))
  expect(result.session.protectedSources).toEqual(base.protectedSources)
 })
 it(`rejects multi-root transaction atomically: ${JSON.stringify(source)}`,()=>{
  const base=session(source),before=JSON.stringify(base)
  const tr=EditorState.create({doc:base.doc}).tr
  for(const needle of ['Tail','Alpha']) {
   const p=position(tr.doc,needle)
   tr.addMark(p,p+needle.length,base.doc.type.schema.marks.strong!.create())
  }
  expect(applySourceBlockTransaction(base,tr)).toEqual({ok:false,reason:'unsupported-step'})
  expect(JSON.stringify(base)).toBe(before)
 })
}
for(const source of ['\uFEFF[ref]: /url\r\nAlpha\r\n','[ref]: /url\n"title" garbage\nAlpha',
 '> [ref]: /url\n>\n> Alpha\n\nTail']) {
 it(`legacy and block exact edits preserve definitions: ${JSON.stringify(source)}`,()=>{
  const base=session(source),needle=source.includes('Tail')?'Tail':'Alpha',p=position(base.doc,needle)
  const tr=EditorState.create({doc:base.doc}).tr.insertText('Z',p,p+1)
  for(const apply of [applySourceTextTransaction,applySourceBlockTransaction]) {
   const result=apply(base,tr)
   expect(result.ok).toBe(true)
   if(!result.ok)throw new Error(result.reason)
   expect(result.session.source).toBe(source.replace(needle,'Z'+needle.slice(1)))
   expect(result.session.protectedSources).toEqual(base.protectedSources)
  }
  const exact=applySourceTextTransaction(base,tr)
  expect(Object.keys(exact).sort()).toEqual(['file','ok','session'])
  if(exact.ok)expect(exact.file!.work.legacyParseCalls).toBe(0)
 })
}
it('allows insertion exactly after consumed reference and protects title rollback paragraph edits',()=>{
 const source='[ref]: /url\nAlpha',base=session(source),p=position(base.doc,'Alpha')
 const result=applySourceTextTransaction(base,EditorState.create({doc:base.doc}).tr.insertText('Z',p))
 expect(result.ok).toBe(true)
 if(!result.ok)throw new Error(result.reason)
 expect(result.session.source).toBe('[ref]: /url\nZAlpha')
 const rollback=session('[ref]: /url\n"title" garbage'),a=position(rollback.doc,'garbage')
 const marked=applySourceBlockTransaction(rollback,EditorState.create({doc:rollback.doc}).tr.addMark(a,a+5,rollback.doc.type.schema.marks.strong!.create()))
 expect(marked.ok).toBe(true)
 if(!marked.ok)throw new Error(marked.reason)
 expect(marked.session.source.startsWith('[ref]: /url\n')).toBe(true)
})
