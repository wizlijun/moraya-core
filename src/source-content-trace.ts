import {editTrace,sliceTrace,type SourceTrace,type TracePiece} from './source-trace'

export type LineRead = Readonly<{
  begin:number; end:number; indent:number; keepLastLF:boolean
  rows:readonly {b:number;e:number;t:number;bs:number}[]
}>

/** Project the installed getLines consumption, including partial tab expansion. */
export function traceConsumedLines(trace:SourceTrace,read:LineRead,actual:string):SourceTrace|undefined {
  const chunks:string[]=[],pieces:TracePiece[]=[]
  let length=0
  for(let i=0;i<read.end-read.begin;i++){
    const row=read.rows[i]
    if(!row)return undefined
    let first=row.b,width=0
    const last=row.e+(i+1<read.end-read.begin||read.keepLastLF?1:0)
    while(first<last&&width<read.indent){
      const ch=trace.text[first]
      if(ch===' ')width++
      else if(ch==='\t')width+=4-(width+row.bs)%4
      else if(first-row.b<row.t)width++
      else break
      first++
    }
    if(width>read.indent){
      const padding=' '.repeat(width-read.indent)
      pieces.push({from:length,to:length+padding.length,sourceFrom:0,sourceTo:0,kind:'generated'})
      chunks.push(padding);length+=padding.length
    }
    const part=sliceTrace(trace,first,last)
    for(const p of part.pieces)pieces.push({...p,from:p.from+length,to:p.to+length})
    chunks.push(part.text);length+=part.text.length
  }
  const text=chunks.join('')
  return text===actual?{text,pieces}:undefined
}

export type EmptyTableSlot={slot:number;from:number;to:number;missing:boolean;present:number;closingPipe:boolean;rowEnd:number}

/** Project only a row already selected by the installed table rule. */
export function traceTableRow(trace:SourceTrace,from:number,to:number,actual:readonly string[],onEmpty?:(slot:EmptyTableSlot)=>void):readonly (SourceTrace|undefined)[]|undefined {
  const row=sliceTrace(trace,from,to),left=row.text.length-row.text.trimStart().length
  const trimmed=sliceTrace(row,left,left+row.text.trim().length)
  const cells:SourceTrace[]=[],bounds:{from:number;to:number}[]=[]
  let start=0,escaped=false
  let edits:{from:number;to:number;text:string}[]=[]
  const append=(end:number)=>{
    bounds.push({from:from+left+start,to:from+left+end});cells.push(editTrace(sliceTrace(trimmed,start,end),edits));edits=[]
  }
  for(let i=0;i<trimmed.text.length;i++){
    const ch=trimmed.text[i]
    if(ch==='|'){
      if(escaped)edits.push({from:i-1-start,to:i+1-start,text:'|'})
      else {append(i);start=i+1}
    }
    escaped=ch==='\\'
  }
  append(trimmed.text.length)
  if(cells[0]?.text===''){cells.shift();bounds.shift()}
  const closingPipe=cells[cells.length-1]?.text===''
  if(closingPipe){cells.pop();bounds.pop()}
  const projected=actual.map((value,i)=>{
    const cell=cells[i]
    if(!cell)return undefined
    const leading=cell.text.length-cell.text.trimStart().length
    return sliceTrace(cell,leading,leading+cell.text.trim().length)
  })
  if(projected.some((cell,i)=>(cell?.text??'')!==actual[i]))return undefined
  for(let slot=0;slot<actual.length;slot++)if(actual[slot]===''){
    const bound=bounds[slot],rowEnd=from+left+trimmed.text.length
    onEmpty?.({slot,from:bound?.from??rowEnd,to:bound?.to??rowEnd,missing:!bound,present:cells.length,closingPipe,rowEnd})
  }
  return projected
}
