import type {Node} from 'prosemirror-model'
import type {NodeViewConstructor} from 'prosemirror-view'
import {TableView} from 'prosemirror-tables'

export type SessionTableWidths = readonly (number|null)[] | null
export interface SessionTablePainter {
 getPos():number|undefined
 paint(widths:SessionTableWidths):void
}
export interface SessionTableViewOptions {
 readWidths(position:number|undefined,node:Node):SessionTableWidths
 register(painter:SessionTablePainter):()=>void
}
/** Paint session widths on the upstream DOM without changing document attributes. */
export function createSessionTableView(options:SessionTableViewOptions):NodeViewConstructor {
 return (node,_view,getPos)=>{
  const tableView=new TableView(node,25)
  const paint=(widths:SessionTableWidths)=>{
   let total=0,complete=true
   Array.from(tableView.colgroup.children).forEach((element,index)=>{
    const width=widths?.[index]??null
    ;(element as HTMLElement).style.width=width===null?'':`${width}px`
    total+=width??25;complete &&= width!==null
   })
   tableView.table.style.width=complete?`${total}px`:''
   tableView.table.style.minWidth=complete?'':`${total}px`
  }
  const read=()=>paint(options.readWidths(getPos(),tableView.node))
  const unregister=options.register({getPos,paint})
  read()
  return {
   dom:tableView.dom,contentDOM:tableView.contentDOM,
   update(next){if(!tableView.update(next))return false;read();return true},
   ignoreMutation:record=>tableView.ignoreMutation(record),
   destroy:unregister,
  }
 }
}
