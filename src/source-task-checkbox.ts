import type {Transaction} from 'prosemirror-state'
import {AttrStep,ReplaceAroundStep} from 'prosemirror-transform'
import {capturedTaskCheckboxes} from './markdown'
import type {SourceSession} from './source-fidelity'
import type {SourceEdit} from './source-ownership'

/** A checked-only chain preserves PM positions and owns one raw character per task. */
export function prepareTaskCheckboxEdits(base:SourceSession,tr:Transaction):{edits:SourceEdit[];changedRoots:number[]}|undefined {
 const facts=capturedTaskCheckboxes(base)
 if(!facts||!tr.steps.length)return
 const byPosition=new Map(facts.map(f=>[f.pmFrom,f])),changes=new Map<number,boolean>()
 for(let i=0;i<tr.steps.length;i++){
  const step=tr.steps[i]!,proto=Object.getPrototypeOf(step)
  if(proto!==ReplaceAroundStep.prototype&&proto!==AttrStep.prototype)return
  const pos=proto===AttrStep.prototype?(step as AttrStep).pos:(step as ReplaceAroundStep).from
  const fact=byPosition.get(pos),before=tr.docs[i]!.nodeAt(pos),after=(tr.docs[i+1]??tr.doc).nodeAt(pos)
  if(!fact||!before||!after||before.type.name!=='list_item'||typeof before.attrs.checked!=='boolean'
   ||typeof after.attrs.checked!=='boolean'||!before.content.eq(after.content)
   ||!after.hasMarkup(before.type,{...before.attrs,checked:after.attrs.checked},before.marks))return
  if(proto===AttrStep.prototype){if((step as AttrStep).attr!=='checked')return}
  else{
   const s=step as ReplaceAroundStep
   // Only the standard setNodeMarkup shell; no moved gap or unrelated content.
   if(s.to!==pos+before.nodeSize||s.gapFrom!==pos+1||s.gapTo!==s.to-1||s.insert!==1
    ||s.slice.openStart||s.slice.openEnd||s.slice.content.childCount!==1
    ||s.slice.content.firstChild!.content.size||!s.slice.content.firstChild!.sameMarkup(after))return
  }
  changes.set(pos,after.attrs.checked)
 }
 const edits:SourceEdit[]=[],roots=new Set<number>()
 for(const [pos,checked] of changes){
  const fact=byPosition.get(pos)!
  if(checked===fact.checked)continue
  const from=fact.sourceFrom,char=base.source[from]
  if(![' ','x','X'].includes(char!)||(char!==' ')!==fact.checked)return
  edits.push({from,to:from+1,text:checked?'x':' '});roots.add(fact.rootId)
 }
 edits.sort((a,b)=>a.from-b.from)
 return {edits,changedRoots:[...roots].sort((a,b)=>a-b)}
}
