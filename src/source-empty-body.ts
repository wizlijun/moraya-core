import {prepareEmptyInlineContent} from './source-inline-recipe';
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
     leftBody:boolean;rightBody:boolean;leftSeparator:boolean}>;
export type EmptyBody=Readonly<{
 pmAt:number; parent:PmNode; rootId?:number; place:EmptyPlace;
}>;
export type EmptyRecipe=Readonly<{edits:readonly SourceEdit[];changedRoots:readonly number[]}>;
export type EmptyAttempt =
 | Readonly<{kind:'not-empty'}>
 | Readonly<{kind:'unsupported';reason:string}>
 | Readonly<{kind:'ready';recipe:EmptyRecipe}>;

import {ReplaceStep,AddMarkStep,RemoveMarkStep} from 'prosemirror-transform';
import {capturedEmptyBodies,serializeSourceInlineBody,sourceRootHasClosedFences} from './markdown';
import {prepareEmptyParagraphEdits} from './source-structure';

function renderPrefix(source:string,prefix:SourcePrefix):string {
 return prefix.map(p=>'spaces' in p?' '.repeat(p.spaces):source.slice(p.from,p.to)).join('');
}
function escapeEmptyText(node:PmNode):string {return serializeSourceInlineBody(node)}

/** A natural body can become temporarily empty inside one real inline chain.
 * This only declines the baseline-empty producer; the complete chain must still
 * pass the ordinary inline source guard and recipe. */
function previouslyNonemptyBody(base:SourceSession,tr:Transaction):boolean {
 const first=tr.steps[0];
 if(!first||![ReplaceStep.prototype,AddMarkStep.prototype,RemoveMarkStep.prototype].includes(Object.getPrototypeOf(first)))return false;
 const range=first as ReplaceStep,a=base.doc.resolve(range.from),parent=a.parent;
 if(!['paragraph','heading'].includes(parent.type.name)||!parent.content.size||!a.depth)return false;
 let from=a.start(),to=a.end();
 if(!base.roots.some(root=>root.pmFrom<=a.before()&&root.pmTo>=to+1))return false;
 for(let i=0;i<tr.steps.length;i++){
  const step=tr.steps[i] as ReplaceStep|AddMarkStep|RemoveMarkStep;
  if(![ReplaceStep.prototype,AddMarkStep.prototype,RemoveMarkStep.prototype].includes(Object.getPrototypeOf(step)))return false;
  const before=tr.docs[i];if(!before)return false;
  const left=before.resolve(step.from),right=before.resolve(step.to);
  if(step.from<from||step.to>to||!left.sameParent(right)||left.start()!==from||left.end()!==to||!parent.sameMarkup(left.parent))return false;
  if(step instanceof ReplaceStep){
   if(step.slice.openStart||step.slice.openEnd||(step as ReplaceStep & {structure:boolean}).structure)return false;
   let inline=true;step.slice.content.forEach(node=>{if(!node.isInline)inline=false});if(!inline)return false;
  }
  const map=step.getMap();from=map.map(from,-1);to=map.map(to,1);
 }
 return true;
}

export function prepareEmptyBodyTransaction(base:SourceSession,tr:Transaction,facts:readonly EmptyBody[]):EmptyAttempt {
 const reject=(reason:string):EmptyAttempt=>({kind:'unsupported',reason});
 // Applicability belongs to the complete actual chain, including a body
 // emptied or created by an earlier step. Structural block slices remain separate.
 let emptyInput=false;
 for(let i=0;i<tr.steps.length;i++){
  const step=tr.steps[i];
  if(!(step instanceof ReplaceStep))continue;
  let blocks=false;step.slice.content.forEach(n=>{if(n.isBlock)blocks=true});
  if(blocks)continue;
  const before=tr.docs[i];if(!before)return reject('empty-chain');
  try{
   const parent=before.resolve(step.from).parent;
   if(parent.isTextblock&&parent.content.size===0)emptyInput=true;
  }catch{return reject('invalid-range')}
 }
 if(!emptyInput||previouslyNonemptyBody(base,tr))return {kind:'not-empty'};
 const first=tr.steps[0] as ReplaceStep;
 try{
  if(tr.docs.length!==tr.steps.length||Object.getPrototypeOf(first)!==ReplaceStep.prototype
   ||!tr.before.eq(base.doc)||!tr.docs[0]!.eq(base.doc)||(first as ReplaceStep & {structure:boolean}).structure
   ||first.from!==first.to||first.slice.openStart||first.slice.openEnd||!first.slice.size)return reject('empty-step');
  const applied=first.apply(tr.docs[0]!);
  if(applied.failed||!applied.doc?.eq(tr.docs[1]??tr.doc))return reject('empty-chain');
  tr.doc.check();
  const certified=capturedEmptyBodies(base.source,base.doc,base.roots,base.layout);
  if(certified!==facts)return reject('empty-binding');
  const matches=facts.filter(f=>f.pmAt===first.from&&f.parent===base.doc.resolve(first.from).parent);
  if(matches.length!==1)return reject('empty-fact');
  const fact=matches[0]!,after=tr.doc.resolve(first.from).parent;
  if(!['paragraph','heading','code_block','frontmatter'].includes(fact.parent.type.name)
   ||!fact.parent.sameMarkup(after)||fact.parent.marks.length)return reject('empty-markup');
  let plain=true;first.slice.content.forEach(n=>{if(!n.isText||n.marks.length)plain=false});
  const generated=prepareEmptyInlineContent(base,tr,fact);
  if((!plain||tr.steps.length!==1)&&generated.kind!=='ready')return reject('empty-content');
  const place=fact.place,literal=place.kind==='literal',text=after.textContent;
  if(!literal&&/[\r\n]/.test(text))return reject('empty-newline');
  const root=fact.rootId===undefined?undefined:base.roots[fact.rootId];
  if(place.kind!=='layout'){
   if(!root||!sourceRootHasClosedFences(root))return reject('empty-owner');
   const range=place.kind==='inline'||place.kind==='nested-blank'?place.range:{from:place.at,to:place.at};
   if(range.from<root.sourceFrom||range.to>root.sourceTo)return reject('empty-owner-range');
   if(base.protectedSources.some(p=>range.from===range.to?p.sourceFrom<range.from&&range.from<p.sourceTo:p.sourceFrom<range.to&&p.sourceTo>range.from))return reject('empty-protected');
  }
  const body=literal?text:generated.kind==='ready'?generated.body:escapeEmptyText(after);
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
   case 'nested-blank':{
    const eol=place.eol?base.source.slice(place.eol.from,place.eol.to):base.source.slice(root!.sourceFrom,place.range.from).match(/\r\n|\r|\n/g)?.at(-1)??'\n';
    const prefix=renderPrefix(base.source,place.prefix);
    // Actual definition boundaries also reserve the first owned blank as
    // a separator, including definition-only containers without visible children.
    const before=place.leftBody&&!place.rightBody&&!place.leftSeparator?eol+prefix:'';
    const after=place.rightBody?eol+prefix:'';
    edits=[{...place.range,text:before+body+after}];break;
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
