import {it,expect,vi} from 'vitest';
import * as markdown from '../markdown';
import {EditorState} from 'prosemirror-state';
import {change,bold,open,at} from './source-nested-test-utils';
import {createEditor} from '../setup';
import {BrowserMediaResolver} from '../adapters/browser-media-resolver';
import {createSourceSession,applySourceBlockTransaction,type SourceBlockResult} from '../source-fidelity';
import type {FrontmatterViewFactory} from '../types';
const bodies=[
 ['table padding','| H | J |\n| :--- | ---: |\n|   甲 | 甲  |\n',[0,1,1,0],0,'| H | J |\n| :--- | ---: |\n|   甲 | 乙  |\n'],
 ['escaped pipe','| H |\n| :--- |\n| a\\|甲 |\n',[0,1,0,0],2,'| H |\n| :--- |\n| a\\|乙 |\n'],
 ['mermaid','~~~~mermaid\ngraph TD; 甲-->B\n~~~~\n',[0],10,'~~~~mermaid\ngraph TD; 乙-->B\n~~~~\n'],
 ['frontmatter','\uFEFF---\r\ntitle: 甲\r\n---\r\n',[0],7,'\uFEFF---\r\ntitle: 乙\r\n---\r\n'],
 ['HTML','<div class="note">\n  甲。\n</div>\n',[0],21,'<div class="note">\n  乙。\n</div>\n'],
 ['indented code','    甲。\n    同句。\n',[0],0,'    乙。\n    同句。\n'],
 ['critic','{==甲。==}{>>原注<<}',[0],0,'{==乙。==}{>>原注<<}'],
 ['header only','| 甲 |\n| :--- |\n',[0,0,0,0],0,'| 乙 |\n| :--- |\n'],
 ['header body','| 甲 |\n| :--- |\n| 甲 |\n',[0,0,0,0],0,'| 乙 |\n| :--- |\n| 甲 |\n'],
 ['extra column','| H |\n| --- |\n|  甲 | 甲 |\n',[0,1,0,0],0,'| H |\n| --- |\n|  乙 | 甲 |\n'],
 ['double backslash','| H |\n| --- |\n| a\\\\|甲 |\n',[0,1,0,0],2,'| H |\n| --- |\n| a\\\\|乙 |\n'],
 ['triple backslash','| H |\n| --- |\n| a\\\\\\|甲 |\n',[0,1,0,0],3,'| H |\n| --- |\n| a\\\\\\|乙 |\n'],
 ['entity','| H |\n| --- |\n| &amp;甲 |\n',[0,1,0,0],1,'| H |\n| --- |\n| &amp;乙 |\n'],
 ['table BOM CRLF','\uFEFF| H |\r\n| :--- |\r\n| 甲 |\r\n',[0,1,0,0],0,'\uFEFF| H |\r\n| :--- |\r\n| 乙 |\r\n'],
 ['quote table','> | H |\n> | :--- |\n> | 甲 |\n',[0,0,1,0,0],0,'> | H |\n> | :--- |\n> | 乙 |\n'],
 ['critic emphasis','{==保留 _甲强调_==}{>>原注<<}',[0],3,'{==保留 _乙强调_==}{>>原注<<}'],
 ['HTML mark','<span>甲</span>',[0],0,'<span>乙</span>'],
 ['highlight','==甲==',[0],0,'==乙=='],
 ['strike','~~甲~~',[0],0,'~~乙~~'],
] as const;
it.each(bodies)('target preflight %s',(_name,raw,path,offset)=>{
 const base=open(raw);expect(base.doc.resolve(at(base.doc,path,offset)).nodeAfter?.text?.[0]).toBe('甲');
});
it.each(bodies)('actual body %s',(_name,raw,path,offset,expected)=>{change(raw,path,offset,expected)});
it('same actual table cell supports full-body strong fragment',()=>{
 const {r}=bold('| H |\n| :--- |\n|  Alpha  |\n',[0,1,0,0]);
 expect(r.ok).toBe(true);if(r.ok){expect(r.mode).toBe('fragment-render');expect(r.session.source).toBe('| H |\n| :--- |\n|  **Alpha**  |\n');}
});
it.each([
 ['| H | J |\n| --- | --- |\n| 甲 |\n','| H | J |\n| --- | --- |\n| 甲 |乙|\n','乙|'],
 ['| H | J |\n| --- | --- |\n| 甲 |   |\n','| H | J |\n| --- | --- |\n| 甲 |乙   |\n','乙'],
])('empty cell insert retains table formatting %j',(raw,expected,text)=>{
 const base=open(raw!),p=at(base.doc,[0,1,1,0]);
 expect(base.doc.resolve(p).parent.content.size).toBe(0);
 expect(base.textSpans.some(s=>s.pmFrom<=p&&s.pmTo>=p)).toBe(false);
 const result=applySourceBlockTransaction(base,EditorState.create({doc:base.doc}).tr.insertText('乙',p));
 expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason);
 expect(result.session.source).toBe(expected);expect(base.source).toBe(raw);
 expect(result.edits).toEqual([{from:29,to:29,text}]);
});
it('legacy raw BOM initialization differs from source capture',async()=>{
 const raw='\uFEFF---\r\ntitle: 甲\r\n---\r\n',container=document.createElement('div');
 const editor=await createEditor({container,initialContent:raw,mediaResolver:new BrowserMediaResolver()});
 try{expect(editor.view.state.doc.eq(open(raw).doc)).toBe(false)}finally{editor.destroy()}
});
it('actual frontmatter onChange retains CRLF and emits one character patch',async()=>{
 const raw='\uFEFF---\r\ntitle: 甲\r\nother: keep\r\n---\r\n';
 const expected='\uFEFF---\r\ntitle: 乙\r\nother: keep\r\n---\r\n';
 let input:((raw:string)=>void)|undefined;
 const factory:FrontmatterViewFactory={render(_container,_raw,onChange){input=onChange;return {destroy(){}};}};
 const container=document.createElement('div');document.body.append(container);
 const editor=await createEditor({container,initialContent:raw.slice(1),mediaResolver:new BrowserMediaResolver(),frontmatterViewFactory:factory});
 try {
  const opened=createSourceSession(raw,editor.view.state.schema);if(!opened.ok)throw Error(opened.reason);
  expect(opened.session.doc.eq(editor.view.state.doc)).toBe(true);
  const seen:SourceBlockResult[]=[],ranges:number[]=[];
  editor.view.setProps({dispatchTransaction(tr){
   let count=0;tr.steps[0]!.getMap().forEach(()=>count++);ranges.push(count);
   seen.push(applySourceBlockTransaction(opened.session,tr));editor.view.updateState(editor.view.state.apply(tr));
  }});
  expect(typeof input).toBe('function');input!('title: 乙\nother: keep');
  expect(seen).toHaveLength(1);const result=seen[0]!;expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason);
  expect(Buffer.from(result.session.source)).toEqual(Buffer.from(expected));expect(result.edits).toHaveLength(1);
  expect(result.edits[0]!.to-result.edits[0]!.from).toBe(1);expect(result.edits[0]!.text).toBe('乙');expect(ranges).toHaveLength(1);
 }finally{editor.destroy();container.remove()}
});

it('escaped table pipe is atomic and ignored extra slots receive no span',()=>{
 const base=open('| H |\n| --- |\n| a\\|甲 | discarded |\n');
 const p=at(base.doc,[0,1,0,0],1),span=base.textSpans.find(s=>s.pmFrom===p);
 expect(span).toMatchObject({pmFrom:p,pmTo:p+1,kind:'atomic'});
 expect(base.source.slice(span!.sourceFrom,span!.sourceTo)).toBe('\\|');
 expect(base.textSpans.every(s=>s.sourceTo<=base.source.indexOf('discarded'))).toBe(true);
});
it('literal final EOL and fence are outside actual body permission',()=>{
 const base=open('~~~~text\r\n甲\r\n~~~~\r\n');
 expect(base.textSpans).toEqual([{pmFrom:1,pmTo:2,sourceFrom:10,sourceTo:11,kind:'linear'}]);
});
it.each([
 ['~~~~text\n甲\n~~~~\n','\n~~~~\n'],
 ['---\ntitle: 甲\n---\n','\n---\n'],
 ['<div>\n甲\n</div>\n','\n\nplain\n'],
])('literal changes cannot gain delimiter or block structure authority %j',(raw,insert)=>{
 const base=open(raw);let p=-1;base.doc.descendants((node,pos)=>{if(node.isText&&node.text!.includes('甲'))p=pos+node.text!.indexOf('甲')});
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{const result=applySourceBlockTransaction(base,EditorState.create({doc:base.doc}).tr.insertText(insert,p,p+1));
  if(raw==='~~~~text\n甲\n~~~~\n'){
   expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason)
   expect(result.session.source).toBe('~~~~~text\n\n~~~~\n\n~~~~~\n');expect(result.edits).toHaveLength(3)
  }else expect(result.ok).toBe(false)
  expect(spy).not.toHaveBeenCalled();expect(base.source).toBe(raw);
 }finally{spy.mockRestore()}
});
it('promoted HTML and CSV do not receive literal spans',()=>{
 for(const raw of ['<img src="甲">\n','<video src="甲"></video>\n','<audio src="甲"></audio>\n','```csv\n甲,乙\n```\n'])
  expect(open(raw).textSpans).toEqual([]);
});

it.each([
 ['~~~~text\n甲\n~~~~\n','甲\n~~~~\n'],
 ['---\ntitle: 甲\n---\n','title: 甲\n---\n'],
])('a full literal body replacement cannot bypass delimiter safety %j',(raw,text)=>{
 const base=open(raw),node=base.doc.firstChild!,tr=EditorState.create({doc:base.doc}).tr.replaceWith(1,1+node.content.size,base.doc.type.schema.text(text));
 const spy=vi.spyOn(markdown,'serializeSourceRootMarkdown');
 try{const result=applySourceBlockTransaction(base,tr);
  if(raw==='~~~~text\n甲\n~~~~\n'){
   expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason)
   expect(result.session.source).toBe('~~~~~text\n甲\n~~~~\n\n~~~~~\n');expect(result.edits).toHaveLength(3);expect(result.session.doc.eq(tr.doc)).toBe(true)
  }else{expect(result.ok).toBe(false);expect('session' in result).toBe(false)}
  expect(spy).not.toHaveBeenCalled();expect(base.source).toBe(raw)}finally{spy.mockRestore()}
});
it('literal full replacement does not trim through a UTF-16 surrogate',()=>{
 const raw='---\r\nx: 😀\r\n---\r\n',base=open(raw),node=base.doc.firstChild!;
 const tr=EditorState.create({doc:base.doc}).tr.replaceWith(1,1+node.content.size,base.doc.type.schema.text('x: 😁'));
 const result=applySourceBlockTransaction(base,tr);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason);
 expect(result.session.source).toBe('---\r\nx: 😁\r\n---\r\n');expect(result.edits).toEqual([{from:8,to:10,text:'😁'}]);
});
