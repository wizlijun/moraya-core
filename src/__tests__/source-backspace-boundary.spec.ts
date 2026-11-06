import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {applySourceBlockTransaction,createSourceSession} from '../source-fidelity'

function remove(raw:string,from:number,to:number,expected:string){
 const opened=createSourceSession(raw)
 if(!opened.ok)throw Error(opened.reason)
 const base=opened.session,tr=EditorState.create({doc:base.doc}).tr.delete(from,to)
 const result=applySourceBlockTransaction(base,tr)
 expect(result.ok).toBe(true)
 if(!result.ok)throw Error(result.reason)
 expect(result.session.source).toBe(expected)
 expect(result.session.doc.eq(tr.doc)).toBe(true)
 expect(base.source).toBe(raw)
 return result
}
it.each([
 ['a b',3,4,'a&#32;'],['甲 乙',3,4,'甲&#32;'],
 ['a  b',4,5,'a&#32;&#32;'],['a \tb',4,5,'a&#32;&#9;'],
 ['a b',1,2,'&#32;b'],['a  b',1,2,'&#32;&#32;b'],
 ['# a b\r\n',3,4,'# a&#32;\r\n'],['- a b\n',5,6,'- a&#32;\n'],
 ['> a b\r\n',4,5,'> a&#32;\r\n'],
 ['&#x20;a b\n',4,5,'&#x20;a&#32;\n'],
 ['a b&#x20;\n',1,2,'&#32;b&#x20;\n'],
 ['a&#x20;b\n',3,4,'a&#x20;\n'],
] as const)('deletion keeps newly exposed boundary whitespace: %s',(raw,from,to,expected)=>{remove(raw,from,to,expected)})
it.each(['**','__','*','_','~~','==','^^','`'])('deletes the last character of a %s span',marker=>{
 remove('前 '+marker+'乙'+marker+'\n',3,4,'前&#32;\n')
 remove(marker+'乙'+marker,1,2,'')
})
it('keeps unrelated source spelling and protected definitions when deleting the last word',()=>{
 remove('> __Keep__ x\r\n\r\n[r]: /untouched "Title"\r\n',7,8,'> __Keep__&#32;\r\n\r\n[r]: /untouched "Title"\r\n')
})
it.each([
 ['a b c',3,4,'a  c'],['[ a b ](/url)',4,5,'[ a  ](/url)'],['**ab**',2,3,'**a**'],
] as const)('ordinary internal deletion retains existing bytes: %s',(raw,from,to,expected)=>{remove(raw,from,to,expected)})

it.each(['a b','前 **乙**','前 `乙`'])('continuous backward deletion crosses encoded boundaries: %s',raw=>{
 let opened=createSourceSession(raw)
 if(!opened.ok)throw Error(opened.reason)
 let base=opened.session
 for(let remaining=base.doc.firstChild!.content.size;remaining>0;remaining--){
  const at=base.doc.firstChild!.content.size+1,tr=EditorState.create({doc:base.doc}).tr.delete(at-1,at)
  const result=applySourceBlockTransaction(base,tr)
  expect(result.ok).toBe(true)
  if(!result.ok)throw Error(result.reason)
  expect(result.session.doc.eq(tr.doc)).toBe(true)
  base=result.session
 }
 expect(base.source).toBe('')
})

it('deletes a long marked range without rescanning it for every retained space',()=>{
 const prefix='a '.repeat(1000),body='b'.repeat(10000),raw=prefix+'**'+body+'** c'
 remove(raw,prefix.length+1,prefix.length+body.length+1,prefix+' c')
})
