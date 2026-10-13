import {expect,it} from 'vitest'
import {EditorState} from 'prosemirror-state'
import {EditorView} from 'prosemirror-view'
import {parseMarkdown} from '../markdown'
import {defaultSchema} from '../schema'
import {createSessionTableView,type SessionTablePainter} from '../plugins/session-table-view'

it('paints real TableView columns on read, preview, update and unregisters on destroy',()=>{
 const doc=parseMarkdown('| A | B |\n| --- | --- |\n| C | D |',defaultSchema)
 let widths:readonly (number|null)[]=[80,null],painter:SessionTablePainter|undefined,destroyed=0
 const view=new EditorView(document.createElement('div'),{state:EditorState.create({doc}),nodeViews:{
  table:createSessionTableView({readWidths:(pos,node)=>{expect(pos).toBe(0);expect(node.type.name).toBe('table');return widths},register:p=>{painter=p;return ()=>{destroyed++}}}),
 }})
 const table=view.dom.querySelector('table')!,cols=table.querySelectorAll('col')
 expect(painter).toBeDefined();expect(cols).toHaveLength(2)
 expect(cols[0]!.style.width).toBe('80px');expect(cols[1]!.style.width).toBe('')
 expect(table.style.minWidth).toBe('105px');expect(table.style.width).toBe('')
 painter!.paint([90,100]);expect(table.style.width).toBe('190px');expect(table.style.minWidth).toBe('')
 widths=[110,120];view.updateState(view.state.apply(view.state.tr.insertText('Z',4)))
 expect(table.querySelector('col')).toBe(cols[0]);expect(table.style.width).toBe('230px')
 painter!.paint(null);expect(cols[0]!.style.width).toBe('');expect(table.style.minWidth).toBe('50px')
 view.destroy();expect(destroyed).toBe(1)
})
