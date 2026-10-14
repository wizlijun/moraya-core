import {it,expect} from 'vitest';
import {AttrStep} from 'prosemirror-transform';
import {EditorState,type Transaction} from 'prosemirror-state';
import {applySourceBlockTransaction} from '../source-fidelity';
import {capturedInlineRecipeFacts} from '../markdown';
import {open} from './source-inline-test-utils';
function accept(raw:string,make:(s:EditorState)=>Transaction,expected:string){
 const b=open(raw),tr=make(EditorState.create({doc:b.doc})),steps=tr.steps.slice(),docs=tr.docs.slice();
 expect(open(expected).doc.eq(tr.doc)).toBe(true);
 const r=applySourceBlockTransaction(b,tr);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
 expect(r.session.source).toBe(expected);expect(r.session.doc.eq(tr.doc)).toBe(true);expect(tr.steps).toEqual(steps);expect(tr.docs).toEqual(docs);expect(b.source).toBe(raw);return r;
}
it.each(['replace','attr','node-mark','mark'] as const)('image %s preserves unrelated raw',kind=>{
 accept('__Keep__ ![a][r] tail\r\n\r\n[r]: /old\r\n',s=>{
  const at=6,tr=s.tr,node=s.doc.nodeAt(at)!;
  return kind==='replace'?tr.setNodeMarkup(at,undefined,{...node.attrs,title:'width=50%'}):kind==='attr'?tr.setNodeAttribute(at,'title','width=50%'):kind==='node-mark'?tr.addNodeMark(at,s.schema.marks.strong!.create()):tr.addMark(at,at+1,s.schema.marks.strong!.create());
 },kind==='replace'||kind==='attr'?'__Keep__ ![a](/old "width=50%") tail\r\n\r\n[r]: /old\r\n':'__Keep__ **![a][r]** tail\r\n\r\n[r]: /old\r\n');
});
it.each(['','AB','> AB\n','- AB\n','# AB\n','| H |\n| - |\n| AB |\n'])('canonical image birth in actual body %j',raw=>{
 const b=open(raw);let at=1;b.doc.descendants((n,p)=>{if(n.isText&&n.text==='AB')at=p+1});
 const expected=raw?raw.replace('AB','A![](/x)B'):'![](/x)';
 accept(raw,s=>s.tr.insert(at,s.schema.nodes.image!.create({src:'/x'})),expected);
});
it.each([
 ['![x](/x)',''],['![x](/x)\r\n',''],['**![x](/x)**\n',''],
 ['> A\n>\n>\n>![x](/x)','> A\n>\n>'],
 ['>![x](/x)\n>\n> [r]: /u\n','>\n> [r]: /u\n'],
 ['> [r]: /u\n>\n>![x](/x)\n','> [r]: /u\n>\n>\n'],
] as const)('whole captured image deletion owns only its separator %j',(raw,expected)=>{
 const b=open(raw);let at=0;b.doc.descendants((n,p)=>{if(n.type.name==='image')at=p});accept(raw,s=>s.tr.delete(at,at+1),expected);
});
it('only image endpoint text and temporary empty original chain',()=>{
 accept('![x](/x)',s=>s.tr.insertText('Z',2),'![x](/x)Z');
 accept('__Keep__ AB',s=>s.tr.delete(6,8).insert(6,s.schema.nodes.image!.create({src:'/x'})).setNodeAttribute(6,'title','width=50%'),'__Keep__ ![](/x "width=50%")');
});
it('real captures do not merge same attrs occurrences',()=>{
 const b=open('\uFEFF> ![x](/x) ![x][r] ![r][] ![r]\r\n\r\n[r]: /x\r\n'),facts=capturedInlineRecipeFacts(b)!;
 expect(facts.atoms.map(a=>b.source.slice(a.sourceFrom,a.sourceTo))).toEqual(['![x](/x)','![x][r]','![r][]','![r]']);
 for(const a of facts.atoms)expect(b.doc.nodeAt(a.pmFrom)).toBe(a.node);
});
it.each([
 ['/a%20b.png','a[b]','say "yes"','![a\\[b\\]](</a%20b.png> "say \\\"yes\\\"")'],
 ['/a(b).png','A&B','','![A&B](</a(b).png>)'],
 ['/a%20b%25.png','','','![](</a%20b%25.png>)'],
 ['/中文.png','','','![](/中文.png)'],
 ['C:\\a\\b.png','','','![](<C:%5Ca%5Cb.png>)'],
] as const)('local image callback representation %s',(src,alt,title,syntax)=>{
 accept('__Keep__ AB',s=>s.tr.replaceWith(6,8,s.schema.nodes.image!.create({src,alt,title})),'__Keep__ '+syntax);
});
it.each([
 ['**![x][r]**','![x][r]','remove-node'],['**![x][r]**','![x][r]','remove-range'],
] as const)('image mark projection %s',(raw,expected,kind)=>{
 accept(raw+'\n\n[r]: /x\n',s=>kind==='remove-node'?s.tr.removeNodeMark(1,s.schema.marks.strong!):s.tr.removeMark(1,2,s.schema.marks.strong!),expected+'\n\n[r]: /x\n');
});
it.each(['{==![x][r]==}{>>note<<}','<span>![x][r]</span>'])('kept annotation and HTML envelopes surround updated image %s',raw=>{
 accept(raw+'\n\n[r]: /x\n',s=>s.tr.setNodeAttribute(1,'title','width=50%'),raw.replace('![x][r]','![x](/x "width=50%")')+'\n\n[r]: /x\n');
});
it('image birth uses actual inherited marks; shared node occurrences stay distinct',()=>{
 accept('__Keep__ AB',s=>s.tr.replaceWith(6,8,s.schema.nodes.image!.create({src:'/x'},null,[s.schema.marks.strong!.create()])),'__Keep__ **![](/x)**');
 accept('AB',s=>{const image=s.schema.nodes.image!.create({src:'/x'});return s.tr.replaceWith(1,3,[image,image]).setNodeAttribute(2,'title','width=50%')},'![](/x)![](/x "width=50%")');
 accept('AB',s=>s.tr.replaceWith(1,3,s.schema.nodes.image!.create({src:'/x'})).delete(1,2),'');
});
it.each(['>\n','- \n','# \n','| H |\n| - |\n|  |\n'])('empty owned image body %j',raw=>{
 const b=open(raw);let at=0;b.doc.descendants((n,p)=>{if(n.isTextblock&&!n.content.size)at=p+1});
 const expected=raw==='>\n'?'>![](/x)\n':raw==='- \n'?'- ![](/x)\n':raw==='# \n'?'# ![](/x)\n':'| H |\n| - |\n|![](/x)  |\n';
 accept(raw,s=>s.tr.insert(at,s.schema.nodes.image!.create({src:'/x'})),expected);
});
it('noncanonical attrs and code mark reject without changing source; legal retry succeeds',()=>{
 const b=open('__Keep__ AB'),s=EditorState.create({doc:b.doc}),revision=b.revision;
 for(const attrs of [{src:'/a b.png'},{src:null},{src:'/x',alt:null},{src:'/x',title:12},{src:'/x',title:'a\nb'}])expect(applySourceBlockTransaction(b,s.tr.replaceWith(6,8,s.schema.nodes.image!.create(attrs))).ok).toBe(false);
 const coded=s.schema.nodes.image!.create({src:'/x'},null,[s.schema.marks.code!.create()]);expect(applySourceBlockTransaction(b,s.tr.replaceWith(6,8,coded)).ok).toBe(false);
 expect(b.source).toBe('__Keep__ AB');expect(b.revision).toBe(revision);accept(b.source,s=>s.tr.replaceWith(6,8,s.schema.nodes.image!.create({src:'/x'})),'__Keep__ ![](/x)');
});
it('setNodeMarkup changing only marks retains reference occurrence bytes',()=>{
 accept('__Keep__ ![a][r]\n\n[r]: /x\n',s=>s.tr.setNodeMarkup(6,undefined,s.doc.nodeAt(6)!.attrs,[s.schema.marks.strong!.create()]),'__Keep__ **![a][r]**\n\n[r]: /x\n');
});
it('image table pipes use local callback and maintain table shape',()=>{
 const raw='| H |\n| - |\n| AB |\n',b=open(raw);let at=0;b.doc.descendants((n,p)=>{if(n.text==='AB')at=p});
 accept(raw,s=>s.tr.replaceWith(at,at+2,s.schema.nodes.image!.create({src:'/a%7Cb',alt:'A|B',title:'T|Q'})),'| H |\n| - |\n| ![A\\|B](</a%7Cb> "T\\|Q") |\n');
});
it('blank line image insertion preserves the other empty paragraph',()=>{
 const b=open('\n');expect(b.doc.childCount).toBe(2);accept('\n',s=>s.tr.insert(3,s.schema.nodes.image!.create({src:'/x'})),'\n![](/x)\n');
});

it('owned blank materializes its preceding fallback for plain text too',()=>{accept('\n',s=>s.tr.insertText('X',3),'\nX\n')});
it('mixed EOL and same-src reference edits are occurrence-local',()=>{
 const raw='\uFEFFBefore\r\n\r\n__Keep__ ![a](/x) ![a][r]\n\n[r]: /x\r\n\nTail';
 const b=open(raw),atoms=capturedInlineRecipeFacts(b)!.atoms,at=atoms[1]!.pmFrom;
 accept(raw,s=>s.tr.setNodeAttribute(at,'title','width=300'),raw.replace('![a][r]','![a](/x "width=300")'));
});
it('original Step subclasses, docs and source facts never acquire image authority',()=>{
 const b=open('__Keep__ ![a][r]\n\n[r]: /x\n'),make=()=>EditorState.create({doc:b.doc}).tr.setNodeAttribute(6,'title','width=50%');
 class Foreign extends AttrStep {}
 expect(applySourceBlockTransaction(b,EditorState.create({doc:b.doc}).tr.step(new Foreign(6,'title','width=50%'))).ok).toBe(false);
 const wrong=make();wrong.docs[0]=open('Other').doc;expect(applySourceBlockTransaction(b,wrong).ok).toBe(false);
 const missing=make();missing.docs.length=0;expect(applySourceBlockTransaction(b,missing).ok).toBe(false);
 const forged={...b,textSpans:b.textSpans.map((s,i)=>i?s:{...s,sourceFrom:s.sourceFrom+1})};expect(applySourceBlockTransaction(forged,make()).ok).toBe(false);
 expect(b.source).toBe('__Keep__ ![a][r]\n\n[r]: /x\n');accept(b.source,()=>make(),'__Keep__ ![a](/x "width=50%")\n\n[r]: /x\n');
});
it.each([
 ['\n\n\n',0,'\n![](/x)\n\n\n'],['\n\n\n',1,'\n\n![](/x)\n\n'],['\n\n\n',2,'\n\n\n![](/x)\n'],
 ['\uFEFF\r\n\n\r\n',0,'\uFEFF\r\n![](/x)\r\n\n\r\n'],['\uFEFF\r\n\n\r\n',1,'\uFEFF\r\n\n![](/x)\n\r\n'],['\uFEFF\r\n\n\r\n',2,'\uFEFF\r\n\n\r\n![](/x)\r\n'],
 ['[r]: /u\n\n\n',0,'[r]: /u\n\n\n![](/x)\n'],
] as const)('owned blank %j occurrence %i retains remaining source',(raw,index,expected)=>{
 const b=open(raw),unit=b.layout.blankLines.filter(u=>u.role==='empty-paragraph')[index]!;expect(unit.role).toBe('empty-paragraph');if(unit.role!=='empty-paragraph')throw Error('unit');const at=unit.emission.pmFrom+1;
 const r=accept(raw,s=>s.tr.insert(at,s.schema.nodes.image!.create({src:'/x'})),expected);
 for(const protectedSource of b.protectedSources)expect(r.session.source).toContain(raw.slice(protectedSource.sourceFrom,protectedSource.sourceTo));
});
it('neighbour mark preserves a now captured image occurrence',()=>{
 accept('Alpha ![x](/u)\n',s=>s.tr.addMark(1,3,s.schema.marks.strong!.create()),'**Al**pha ![x](/u)\n');
});

it('deleting the terminal image retains the preceding semantic space',()=>{accept('__Keep__ ![](/x)\r\n',s=>s.tr.delete(6,7),'__Keep__&#32;\r\n')});
it('birth and complete removal in one original chain empties only the body and terminal EOL',()=>{
 accept('AB\r\n',s=>s.tr.replaceWith(1,3,s.schema.nodes.image!.create({src:'/x'})).delete(1,2),'');
});
it.each([
 ['![x](/x)  AB\r\n','&#32;&#32;AB\r\n'],
 ['AB \t![x](/x)\r\n','AB&#32;&#9;\r\n'],
 ['![x](/x)\t AB\r\n','&#9;&#32;AB\r\n'],
 ['&#x20;AB ![x](/x)\n','&#x20;AB&#32;\n'],
 ['![x](/x) AB&#x20;\n','&#32;AB&#x20;\n'],
 ['AB&#x20;![x](/x)\n','AB&#x20;\n'],
 ['__Keep__ ![x][r]\r\n\r\n[r]: /x\r\n','__Keep__&#32;\r\n\r\n[r]: /x\r\n'],
] as const)('only literal whitespace newly exposed by deleted captured image is encoded: %s',(raw,expected)=>{
 const b=open(raw),image=capturedInlineRecipeFacts(b)!.atoms.find(a=>a.node.type.name==='image')!;
 accept(raw,s=>s.tr.delete(image.pmFrom,image.pmTo),expected);
});
it('image replacement which retains text does not rewrite existing whitespace',()=>{
 accept('__Keep__ ![](/x) tail',s=>s.tr.insertText('X',6,7),'__Keep__ X tail');
});
it.each(['strong','em'] as const)('new %s image wrapper preserves actual adjacent scalar semantics',kind=>{
 const wrapper=kind==='strong'?'**':'*';
 accept('__Keep__ AB',s=>s.tr.insert(6,s.schema.nodes.image!.create({src:'/x'},null,[s.schema.marks[kind]!.create()])),'__Keep__ '+wrapper+'![](/x)'+wrapper+'&#65;B');
});
it.each(['strong','em'] as const)('changed %s image wrappers classify complete Unicode scalars on both edges',kind=>{
 const wrapper=kind==='strong'?'**':'*';
 for(const scalar of ['A','中','𐐀'])for(const left of [false,true]){
  const raw=left?scalar+'![x](/x)':'![x](/x)'+scalar,at=left?1+scalar.length:1,entity='&#'+scalar.codePointAt(0)+';';
  accept(raw,s=>s.tr.addNodeMark(at,s.schema.marks[kind]!.create()),left?entity+wrapper+'![x](/x)'+wrapper:wrapper+'![x](/x)'+wrapper+entity);
 }
});
it.each(['&#x41;![x](/x)','![x](/x)&#x41;','! ![x](/x) ?','![x](/x) AB'])('existing encoded/punctuation/space neighbours retain their bytes: %s',raw=>{
 const b=open(raw),atom=capturedInlineRecipeFacts(b)!.atoms.find(a=>a.node.type.name==='image')!;
 accept(raw,s=>s.tr.addNodeMark(atom.pmFrom,s.schema.marks.strong!.create()),raw.replace('![x](/x)','**![x](/x)**'));
});
it.each(['strong','em'] as const)('kept %s image endpoint typing owns only its new complete scalar',kind=>{
 const wrapper=kind==='strong'?'**':'*';
 for(const image of ['![x](/x)','![x][r]'])for(const scalar of ['A','中','𐐀'])for(const left of [false,true]){
  const suffix=image.includes('[r]')?'\r\n\r\n[r]: /x\r\n':'',raw=wrapper+image+wrapper+suffix,entity='&#'+scalar.codePointAt(0)+';';
  accept(raw,s=>s.tr.setStoredMarks([]).insertText(scalar,left?1:2),(left?entity:'')+wrapper+image+wrapper+(left?'':entity)+suffix);
 }
});
it.each(['strong','em'] as const)('birth and attrs update %s images keep existing encoded neighbours',kind=>{
 const wrapper=kind==='strong'?'**':'*';
 for(const scalar of ['A','中','𐐀'])for(const left of [false,true])for(const encoded of [false,true]){
  const entity='&#'+scalar.codePointAt(0)+';',text=encoded?entity:scalar,at=left?1+scalar.length:1;
  accept(text,s=>s.tr.insert(at,s.schema.nodes.image!.create({src:'/x'},null,[s.schema.marks[kind]!.create()])),(left?entity:'')+wrapper+'![](/x)'+wrapper+(left?'':entity));
  const raw=(left?entity:'')+wrapper+'![x][r]'+wrapper+(left?'':entity)+'\r\n\r\n[r]: /x\r\n';
  accept(raw,s=>s.tr.setNodeAttribute(at,'title','width=50%'),raw.replace('![x][r]','![x](/x "width=50%")'));
 }
});
