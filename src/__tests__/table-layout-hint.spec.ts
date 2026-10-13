import {expect,it} from 'vitest'
import {EditorState,TextSelection,type Transaction} from 'prosemirror-state'
import {parseMarkdown} from '../markdown'
import {defaultSchema} from '../schema'
import {gfmTableCommand,type GfmTableAction} from '../table-commands'

it.each(['add-row','delete-row','add-column','delete-column','align-column','next-cell'] as const)('actual %s command emits its table origin only on dispatch',kind=>{
 const doc=parseMarkdown('| A | B |\n| --- | --- |\n| C | D |',defaultSchema)
 const state=EditorState.create({doc,selection:TextSelection.create(doc,4)})
 const action:GfmTableAction=kind==='align-column'?{kind,alignment:'right'}:{kind}
 let tr:Transaction|undefined
 expect(gfmTableCommand(action)(state)).toBe(true)
 expect(state.tr.getMeta('moraya:gfm-table-operation')).toBeUndefined()
 expect(gfmTableCommand(action)(state,t=>{tr=t})).toBe(true)
 expect(tr!.getMeta('moraya:gfm-table-operation')).toEqual({v:1,kind,tablePos:0,column:0})
})
it('insert hint locates the actual inserted table',()=>{
 const state=EditorState.create({doc:parseMarkdown('',defaultSchema)});let tr:Transaction|undefined
 gfmTableCommand({kind:'insert'})(state,t=>{tr=t})
 expect(tr!.getMeta('moraya:gfm-table-operation')).toEqual({v:1,kind:'insert',tablePos:0,column:0})
})
