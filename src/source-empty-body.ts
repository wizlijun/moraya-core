// src/source-empty-body.ts；所有raw range仅引用session.source，不存raw副本。
import type {Node as PmNode} from 'prosemirror-model';
import type {Transaction} from 'prosemirror-state';
import type {SourceSession} from './source-fidelity';
import type {SourceEdit} from './source-ownership';
export type RawRange=Readonly<{from:number;to:number}>;
export type SourcePrefix=readonly (RawRange|Readonly<{spaces:number}>)[];
export type EmptyPlace=
 | Readonly<{kind:'inline';range:RawRange;before:string;after:string}>
 | Readonly<{kind:'missing-cell';at:number;row:number;slot:number;present:number;closingPipe:boolean}>
 | Readonly<{kind:'literal';at:number;terminal?:RawRange;eol:RawRange;prefix:SourcePrefix;closed:true}>
 | Readonly<{kind:'prepend';at:number;eol:RawRange|undefined;continuation:SourcePrefix}>
 | Readonly<{kind:'layout';origin:{kind:'blank';id:number}|{kind:'fallback'}}>
 | Readonly<{kind:'nested-blank';range:RawRange;eol?:RawRange;prefix:SourcePrefix;
     leftBody:boolean;rightBody:boolean}>;
export type EmptyBody=Readonly<{
 pmAt:number; parent:PmNode; rootId?:number; place:EmptyPlace;
}>;
export type EmptyRecipe=Readonly<{edits:readonly SourceEdit[];changedRoots:readonly number[]}>;
export type EmptyAttempt =
 | Readonly<{kind:'not-empty'}>
 | Readonly<{kind:'unsupported';reason:string}>
 | Readonly<{kind:'ready';recipe:EmptyRecipe}>;

import {ReplaceStep} from 'prosemirror-transform';
import {capturedEmptyBodies,serializeSourceInlineBody,sourceRootHasClosedFences} from './markdown';
import {prepareEmptyParagraphEdits} from './source-structure';

function renderPrefix(source:string,prefix:SourcePrefix):string {
 return prefix.map(p=>'spaces' in p?' '.repeat(p.spaces):source.slice(p.from,p.to)).join('');
}
function escapeEmptyText(node:PmNode):string {return serializeSourceInlineBody(node)}

export function prepareEmptyBodyTransaction(base:SourceSession,tr:Transaction,facts:readonly EmptyBody[]):EmptyAttempt {
 const reject=(reason:string):EmptyAttempt=>({kind:'unsupported',reason});
 // Decide applicability from the original target, independently of capture facts.
 const first=tr.steps[0];
 if(!(first instanceof ReplaceStep))return {kind:'not-empty'};
 let blocks=false;first.slice.content.forEach(n=>{if(n.isBlock)blocks=true});
 if(blocks)return {kind:'not-empty'};
 let target;
 try{target=tr.before.resolve(first.from)}catch{return reject('invalid-range')}
 if(!target.parent.isTextblock||target.parent.content.size!==0)return {kind:'not-empty'};
 try{
  if(tr.steps.length!==1||tr.docs.length!==1||Object.getPrototypeOf(first)!==ReplaceStep.prototype
   ||!tr.before.eq(base.doc)||!tr.docs[0]!.eq(base.doc)||(first as ReplaceStep & {structure:boolean}).structure
   ||first.from!==first.to||first.slice.openStart||first.slice.openEnd||!first.slice.size)return reject('empty-step');
  const applied=first.apply(tr.docs[0]!);
  if(applied.failed||!applied.doc?.eq(tr.doc))return reject('empty-chain');
  tr.doc.check();
  const certified=capturedEmptyBodies(base.source,base.doc,base.roots,base.layout);
  if(certified!==facts)return reject('empty-binding');
  const matches=facts.filter(f=>f.pmAt===first.from&&f.parent===base.doc.resolve(first.from).parent);
  if(matches.length!==1)return reject('empty-fact');
  const fact=matches[0]!,after=tr.doc.resolve(first.from).parent;
  if(!['paragraph','heading','code_block','frontmatter'].includes(fact.parent.type.name)
   ||!fact.parent.sameMarkup(after)||fact.parent.marks.length)return reject('empty-markup');
  let plain=true;first.slice.content.forEach(n=>{if(!n.isText||n.marks.length)plain=false});
  if(!plain)return reject('empty-content');
  const place=fact.place,literal=place.kind==='literal',text=after.textContent;
  if(!literal&&/[\r\n]/.test(text))return reject('empty-newline');
  const root=fact.rootId===undefined?undefined:base.roots[fact.rootId];
  if(place.kind!=='layout'){
   if(!root||!sourceRootHasClosedFences(root))return reject('empty-owner');
   const range=place.kind==='inline'||place.kind==='nested-blank'?place.range:{from:place.at,to:place.at};
   if(range.from<root.sourceFrom||range.to>root.sourceTo)return reject('empty-owner-range');
   if(base.protectedSources.some(p=>range.from===range.to?p.sourceFrom<range.from&&range.from<p.sourceTo:p.sourceFrom<range.to&&p.sourceTo>range.from))return reject('empty-protected');
  }
  const body=literal?text:escapeEmptyText(after);
  let edits:readonly SourceEdit[];
  switch(place.kind){
   case 'inline':edits=[{...place.range,text:place.before+body+place.after}];break;
   case 'missing-cell':{
    const j=place.slot-place.present;
    if(j<0)return reject('empty-slot');
    edits=[{from:place.at,to:place.at,text:place.closingPipe?'|'.repeat(j)+body+'|':'|'.repeat(j+1)+body}];break;
   }
   case 'prepend':edits=[{from:place.at,to:place.at,text:body+(place.eol?base.source.slice(place.eol.from,place.eol.to):'\n')+renderPrefix(base.source,place.continuation)}];break;
   case 'literal':{
    const eol=base.source.slice(place.eol.from,place.eol.to),prefix=renderPrefix(base.source,place.prefix);
    const payload=text.split('\n').join(eol+prefix);
    edits=[{from:place.at,to:place.at,text:place.terminal?payload:prefix+payload+eol}];break;
   }
   case 'layout':edits=prepareEmptyParagraphEdits(base,tr,place.origin,body);break;
   default:return reject('empty-place');
  }
  let end=-1;
  for(const e of edits){
   if(!Number.isInteger(e.from)||!Number.isInteger(e.to)||e.from<end||e.to<e.from||e.to>base.source.length)return reject('empty-range');
   if(root&&(e.from<root.sourceFrom||e.to>root.sourceTo))return reject('empty-owner-range');
   if(base.protectedSources.some(p=>e.from===e.to?p.sourceFrom<e.from&&e.from<p.sourceTo:p.sourceFrom<e.to&&p.sourceTo>e.from))return reject('empty-protected');
   end=e.to;
  }
  return {kind:'ready',recipe:{edits,changedRoots:root?[root.id]:[]}};
 }catch{return reject('empty-invalid')}
}
