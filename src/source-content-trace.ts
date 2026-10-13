import {sliceTrace,type SourceTrace,type TracePiece} from './source-trace'

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
