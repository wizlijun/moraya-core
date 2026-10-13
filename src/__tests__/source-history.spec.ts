import {expect,it} from 'vitest'
import {Step} from 'prosemirror-transform'
import {defaultSchema} from '../schema'
import {SourceHistoryStep} from '../source-history'
const delta=()=>({beforeLineage:'a',afterLineage:'b',beforeHash:'a'.repeat(64),afterHash:'b'.repeat(64),edits:[{from:0,to:3,removed:'_甲_',text:'*甲*'}]})
it('raw-only is a real registered reversible Step without document changes',()=>{
 const s=new SourceHistoryStep([delta()]),doc=defaultSchema.topNodeType.createAndFill()!
 expect(s.apply(doc).doc).toBe(doc)
 const r=Step.fromJSON(defaultSchema,s.toJSON()) as SourceHistoryStep
 expect(Object.getPrototypeOf(r)).toBe(SourceHistoryStep.prototype)
 expect(r.invert().invert().toJSON()).toEqual(s.toJSON())
 expect(r.invert().deltas[0]!.beforeLineage).toBe('b')
 expect(r.getMap().map(7)).toBe(7)
})
it('adjacent deletions normalize before inversion',()=>{
 const e=SourceHistoryStep.canonicalEdits([{from:1,to:2,removed:'甲',text:''},{from:2,to:3,removed:'乙',text:''}])
 expect(e).toEqual([{from:1,to:3,removed:'甲乙',text:''}])
 expect(SourceHistoryStep.invertEdits(e)).toEqual([{from:1,to:1,removed:'',text:'甲乙'}])
})
it('invalid delta is rejected before becoming a history event',()=>{
 expect(()=>new SourceHistoryStep([{...delta(),beforeLineage:'b'}])).toThrow()
 expect(()=>new SourceHistoryStep([])).toThrow()
})

import {Mapping} from 'prosemirror-transform'
import {TableLayoutStep,withSourceHistoryAttempt,type RawDelta} from '../source-history'
it('keeps invertible adjacent edits and rejects colliding inverse anchors and cancelling groups',()=>{
 const d=delta(),adjacent=[{from:0,to:1,removed:'a',text:'A'},{from:1,to:2,removed:'b',text:'B'}]
 expect(new SourceHistoryStep([{...d,edits:adjacent}]).deltas[0]!.edits).toEqual(adjacent)
 const deletions=[{from:0,to:1,removed:'a',text:''},{from:1,to:2,removed:'b',text:''}]
 expect(()=>new SourceHistoryStep([{...d,edits:deletions}])).toThrow()
 expect(new SourceHistoryStep([{...d,edits:SourceHistoryStep.canonicalEdits(deletions)}]).invert().invert().deltas[0]!.edits).toEqual([{from:0,to:2,removed:'ab',text:''}])
 const cancelling=[{from:0,to:1,removed:'a',text:'ab'},{from:1,to:2,removed:'b',text:''}]
 expect(SourceHistoryStep.canonicalEdits(cancelling)).toEqual([])
 expect(()=>new SourceHistoryStep([{...d,edits:cancelling}])).toThrow()
 expect(SourceHistoryStep.canonicalEdits([{from:0,to:1,removed:'a',text:'A'},{from:2,to:3,removed:'b',text:'B'}])).toHaveLength(2)
})
it('multi-delta ABA preserves events and binding transitions in reverse order',()=>{
 const a={...delta(),bindings:{before:{sourceHash:'a'.repeat(64),roots:[{rootOrdinal:0,id:'one'}]},after:{sourceHash:'b'.repeat(64),roots:[{rootOrdinal:0,id:'two'}]}}}
 const b={...new SourceHistoryStep([a]).invert().deltas[0]!,afterLineage:'c'}
 const s=new SourceHistoryStep([a,b]);expect(s.deltas).toHaveLength(2)
 expect(s.invert().deltas.map(d=>d.beforeLineage)).toEqual(['c','b'])
 expect(s.invert().invert().toJSON()).toEqual(s.toJSON())
 const mapped:Step=s;expect(mapped.map(new Mapping())!.toJSON()).toEqual(s.toJSON())
 expect(mapped.map(new Mapping())).not.toBe(s)
 expect(Object.isFrozen(s.deltas[0]!.bindings!.before.roots[0])).toBe(true)
})
it.each([
 {beforeHash:'A'.repeat(64)},{afterLineage:''},{edits:[]},
 {edits:[{from:NaN,to:1,removed:'a',text:'b'}]},
 {edits:[{from:0,to:2,removed:'a',text:'b'}]},
 {edits:[{from:0,to:1,removed:'a',text:'a'}]},
 {edits:[{from:0,to:0,removed:'',text:'a'},{from:0,to:0,removed:'',text:'b'}]},
 {edits:[{from:1,to:3,removed:'ab',text:'x'},{from:2,to:3,removed:'b',text:'y'}]},
 {unexpected:true},{bindings:undefined},
 {bindings:{before:{sourceHash:'a'.repeat(64),roots:[{rootOrdinal:1,id:'x'},{rootOrdinal:0,id:'y'}]},after:{sourceHash:'b'.repeat(64),roots:[]}}},
 {bindings:{before:{sourceHash:'a'.repeat(64),roots:[{rootOrdinal:0,id:'x'},{rootOrdinal:1,id:'x'}]},after:{sourceHash:'b'.repeat(64),roots:[]}}},
])('rejects invalid atomic payload %j',patch=>expect(()=>new SourceHistoryStep([{...delta(),...patch} as RawDelta])).toThrow())
it('JSON envelope is strict and copies large arrays without argument spread',()=>{
 const s=new SourceHistoryStep([delta()]),json=s.toJSON()
 for(const bad of [{...json,v:2},{...json,unknown:true},{...json,stepType:'wrong'},{...json,deltas:[{...delta(),edits:[{...delta().edits[0],text:()=>''}]}]}])expect(()=>SourceHistoryStep.fromJSON(defaultSchema,bad)).toThrow()
 const changes=Array.from({length:70000},(_,i)=>({from:i*2,to:i*2+1,removed:'a',text:'b'}))
 const large=new SourceHistoryStep([{...delta(),edits:changes}]);changes[0]!.text='z'
 expect(large.deltas[0]!.edits[0]!.text).toBe('b')
 expect(Step.fromJSON(defaultSchema,large.toJSON()).invert(defaultSchema.topNodeType.createAndFill()!).toJSON()).toEqual(large.invert().toJSON())
})
it('table layout only changes its reversible data and refuses malformed images',()=>{
 const doc=defaultSchema.topNodeType.createAndFill()!,s=new TableLayoutStep([{id:'t',before:null,after:{position:0,columns:2,widths:[null,30]}}])
 expect(s.apply(doc).doc).toBe(doc);expect(Step.fromJSON(defaultSchema,s.toJSON()).toJSON()).toEqual(s.toJSON())
 expect(s.invert().invert().toJSON()).toEqual(s.toJSON());expect(s.map().toJSON()).toEqual(s.toJSON());expect(s.merge()).toBeNull()
 for(const after of [null,{position:-1,columns:1,widths:[10]},{position:0,columns:0,widths:[]},{position:0,columns:1,widths:[Infinity]},{position:0,columns:2,widths:[5]}])expect(()=>new TableLayoutStep([{id:'t',before:null,after}])).toThrow()
 expect(()=>new TableLayoutStep([s.deltas[0]!,s.deltas[0]!])).toThrow()
 expect(()=>TableLayoutStep.fromJSON(defaultSchema,{...s.toJSON(),v:0})).toThrow()
})
it('known Step failure marks all nested synchronous attempts, then unwinds',()=>{
 const doc=defaultSchema.topNodeType.createAndFill()!,broken=Object.create(SourceHistoryStep.prototype) as SourceHistoryStep
 Object.defineProperty(broken,'deltas',{value:[]})
 const outer=withSourceHistoryAttempt(()=>withSourceHistoryAttempt(()=>broken.apply(doc)))
 expect(outer.failed).toBe(true);expect(outer.value.failed).toBe(true);expect(outer.value.value.failed).toBeTruthy()
 expect(withSourceHistoryAttempt(()=>1)).toEqual({value:1,failed:false})
 expect(()=>withSourceHistoryAttempt(()=>{throw Error('callback')})).toThrow('callback')
 expect(withSourceHistoryAttempt(()=>2).failed).toBe(false)
})
