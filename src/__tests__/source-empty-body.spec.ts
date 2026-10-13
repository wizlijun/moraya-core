import {EditorState} from 'prosemirror-state';
import {it,expect} from 'vitest';
import {typeEmpty} from './source-empty-test-utils';
const cases=[
 ['', [0], 'X'], ['\uFEFF',[0],'\uFEFFX'],
 ['A\n\n\nB',[1],'A\n\nX\n\nB'],
 ['- A\n\n\nB',[1],'- A\n\nX\n\nB'],
 ['\uFEFF\r\n\r\n',[0],'\uFEFFX\r\n\r\n\r\n'],
 ['[ref]: /u\n\n',[0],'X\n\n[ref]: /u\n\n'],
 ['#',[0],'# X'], ['##  \r\n',[0],'##  X\r\n'],
 ['#   ###\n',[0],'# X  ###\n'],
 ['- \n',[0,0,0],'- X\n'], ['7)\r\n',[0,0,0],'7) X\r\n'],
 ['>\n',[0,0],'>X\n'], ['>   \n',[0,0],'> X\n'],
 ['> - \r\n',[0,0,0,0],'> - X\r\n'],
 ['- [ ] \n',[0,0,0],'- [ ] X\n'],
 ['- # H\n',[0,0,0],'- X\n  # H\n'],
 ['- > A\n',[0,0,0],'- X\n  > A\n'],
 ['- ```js\n  A\n  ```\n',[0,0,0],'- X\n  ```js\n  A\n  ```\n'],
 ['```js\n```\n',[0],'```js\nX\n```\n'],
 ['```js\n\n```\n',[0],'```js\nX\n```\n'],
 ['> ```js\r\n> ```\r\n',[0,0],'> ```js\r\n> X\r\n> ```\r\n'],
 ['- ```js\n  ```\n',[0,0,1],'- ```js\n  X\n  ```\n'],
 ['---\n---\n',[0],'---\nX\n---\n'],
 ['---\r\n\r\n---\r\n',[0],'---\r\nX\r\n---\r\n'],
 ['[^e]:\n',[0,0],'[^e]:X\n'],
] as const;
it.each(cases)('first real body text %j',(raw,path,expected)=>{typeEmpty(raw,path,'X',expected)});
it.each([
 ['| H | J |\n| --- | --- |\n| 甲 |   |\n','| H | J |\n| --- | --- |\n| 甲 |乙   |\n'],
 ['| H | J |\n| --- | --- |\n| 甲 |\n','| H | J |\n| --- | --- |\n| 甲 |乙|\n'],
] as const)('real vs filled empty cell %j',(raw,expected)=>{typeEmpty(raw,[0,1,1,0],'乙',expected)});
it('three columns: materializes only required missing slots',()=>{
 typeEmpty('| H | J | K |\n| --- | --- | --- |\n| 甲 |\n',[0,1,2,0],'乙',
 '| H | J | K |\n| --- | --- | --- |\n| 甲 ||乙|\n');
});

it.each([
 ['| | J |\n| --- | --- |\n',[0,0,0,0],'|X | J |\n| --- | --- |\n'],
 ['| H | J |\n| --- | --- |\n| A | |\n| A | |\n',[0,2,1,0],'| H | J |\n| --- | --- |\n| A | |\n| A |X |\n'],
 ['> | H | J |\r\n> | --- | --- |\r\n> | A | |\r\n',[0,0,1,1,0],'> | H | J |\r\n> | --- | --- |\r\n> | A |X |\r\n'],
 ['> >\n',[0,0,0],'> >X\n'],
 ['-\n',[0,0,0],'- X\n'],
 ['-      \n',[0,0,0],'- X\n'],
 ['- [x]\n',[0,0,0],'- [x] X\n'],
] as const)('additional actual empty occurrence %j',(raw,path,expected)=>{typeEmpty(raw,path,'X',expected)});
it('preserves task checked and ordered list order attrs',()=>{
 const task=typeEmpty('- [ ] \n',[0,0,0],'X','- [ ] X\n');
 expect(task.r.session.doc.firstChild!.firstChild!.attrs.checked).toBe(false);
 const ordered=typeEmpty('7)\r\n',[0,0,0],'X','7) X\r\n');
 expect(ordered.r.session.doc.firstChild!.attrs.order).toBe(7);
});
it.each([
 ['```js\r\n```\r\n',[0],'```js\r\nA\r\nB\r\n```\r\n'],
 ['> ```js\r\n> ```\r\n',[0,0],'> ```js\r\n> A\r\n> B\r\n> ```\r\n'],
 ['- ```js\n  ```\n',[0,0,1],'- ```js\n  A\n  B\n  ```\n'],
 ['---\r\n\r\n---\r\n',[0],'---\r\nA\r\nB\r\n---\r\n'],
] as const)('multiline first literal body %j',(raw,path,expected)=>{typeEmpty(raw,path,'A\nB',expected)});

import {parseMarkdown,parseMarkdownAsync} from '../markdown';
import {open} from './source-empty-test-utils';
it.each(['X\n```js\nA\n```\n','- X\n  ```js\n  A\n  ```\n'])('installed fence interruption survives source wrapper %j',async raw=>{
 const docs=[parseMarkdown(raw),await parseMarkdownAsync(raw),open(raw).doc];
 for(const doc of docs){
  const children=raw.startsWith('-')?doc.firstChild!.firstChild!:doc;
  expect(children.childCount).toBe(2);expect(children.child(0).type.name).toBe('paragraph');
  expect(children.child(1).type.name).toBe('code_block');expect(children.child(1).textContent).toBe('A');
 }
});

import {createEditor} from '../setup';
import {BrowserMediaResolver} from '../adapters/browser-media-resolver';
import type {FrontmatterViewFactory} from '../types';
import {applySourceBlockTransaction,type SourceBlockResult} from '../source-fidelity';
it('actual frontmatter NodeView first multiline onChange preserves original CRLF',async()=>{
 const raw='---\r\n---\r\n';let input:((value:string)=>void)|undefined;
 const factory:FrontmatterViewFactory={render(_container,_raw,onChange){input=onChange;return {destroy(){}}}};
 const container=document.createElement('div');document.body.append(container);
 const editor=await createEditor({container,mediaResolver:new BrowserMediaResolver(),frontmatterViewFactory:factory});
 try{
  const b=open(raw),seen:SourceBlockResult[]=[];
  // A fresh NodeView must receive the captured doc, not a legacy initialization callback.
  expect(input).toBeUndefined();
  editor.view.updateState(EditorState.create({doc:b.doc,plugins:editor.view.state.plugins}));
  expect(editor.view.state.doc.eq(b.doc)).toBe(true);
  editor.view.setProps({dispatchTransaction(tr){seen.push(applySourceBlockTransaction(b,tr));editor.view.updateState(editor.view.state.apply(tr))}});
  expect(input).toBeTypeOf('function');input!('a: X\nb: Y');
  expect(seen).toHaveLength(1);const r=seen[0]!;expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.session.source).toBe('---\r\na: X\r\nb: Y\r\n---\r\n');expect(r.session.doc.eq(editor.view.state.doc)).toBe(true);
 }finally{editor.destroy();container.remove()}
});

it.each([
 ['```js\n  ```\n',[0],'```js\nX\n  ```\n'],
 ['- ```js\n    ```\n',[0,0,1],'- ```js\n  X\n    ```\n'],
 ['- > ```js\n  > ```\n',[0,0,1,0],'- > ```js\n  > X\n  > ```\n'],
] as const)('literal prefix does not copy optional closing indentation %j',(raw,path,expected)=>{typeEmpty(raw,path,'X',expected)});
it('escapes only new body whitespace and leading syntax',()=>{
 typeEmpty('#',[0],' X ','# &#32;X&#32;');
 typeEmpty('',[0],'# X','\\# X');
});

it.each([
 ['-\n  # H\n',[0,0,0],'-\n  X\n  # H\n'],
 ['-\n  ```js\n  A\n  ```\n',[0,0,0],'-\n  X\n  ```js\n  A\n  ```\n'],
] as const)('schema prepend uses the first actual child rule line %j',(raw,path,expected)=>{typeEmpty(raw,path,'X',expected)});

it('missing cell without closing pipe inserts only its required delimiter',()=>{
 typeEmpty('| H | J |\n| --- | --- |\n| A\n',[0,1,1,0],'X','| H | J |\n| --- | --- |\n| A|X\n');
});

it('closing ATX hashes retain a required separator after new text',()=>{
 typeEmpty('# ###\n',[0],'X','# X ###\n');
});
