import {expect,it,vi} from 'vitest'
import {Node as PmNode} from 'prosemirror-model'
import {createSourceSession} from '../source-fidelity'
import {parseMarkdown,parseMarkdownAsync} from '../markdown'
import {projectLineEndings} from '../source-projection'
function open(source:string) {
 const r=createSourceSession(source);expect(r.ok).toBe(true)
 if(!r.ok)throw new Error(r.reason)
 const s=r.session
 expect(s.source).toBe(source)
 expect(s.doc.eq(parseMarkdown(source.startsWith('\uFEFF')?source.slice(1):source,s.doc.type.schema))).toBe(true)
 return s
}
function partition(source:string) {
 const s=open(source);expect(s.gaps).toHaveLength(s.roots.length+1)
 let cursor=0,joined=''
 s.roots.forEach((root,i)=>{
  const gap=s.gaps[i]!
  expect(gap.sourceFrom).toBe(cursor);expect(gap.sourceTo).toBe(root.sourceFrom)
  expect(root.sourceTo).toBeGreaterThan(root.sourceFrom)
  expect(root.tailFrom).toBeGreaterThanOrEqual(root.sourceFrom)
  expect(root.tailFrom).toBeLessThanOrEqual(root.sourceTo)
  expect(root.childTo).toBeGreaterThan(root.childFrom)
  let from=0,to=0
  s.doc.forEach((n,p,index)=>{if(index===root.childFrom)from=p;if(index+1===root.childTo)to=p+n.nodeSize})
  expect([root.pmFrom,root.pmTo]).toEqual([from,to])
  joined+=source.slice(gap.sourceFrom,gap.sourceTo)+source.slice(root.sourceFrom,root.sourceTo)
  cursor=root.sourceTo
 })
 const tail=s.gaps[s.gaps.length-1]!
 expect([tail.sourceFrom,tail.sourceTo]).toEqual([cursor,source.length])
 joined+=source.slice(tail.sourceFrom,tail.sourceTo)
 expect(Buffer.from(joined)).toEqual(Buffer.from(source))
 return s
}
it('keeps root emission nodeSize reads bounded as natural root count doubles',()=>{
 const original=Object.getOwnPropertyDescriptor(PmNode.prototype,'nodeSize')!.get!
 const counts:number[]=[]
 for(const size of [80,160]) {
  let reads=0
  const spy=vi.spyOn(PmNode.prototype,'nodeSize','get').mockImplementation(function(this:PmNode){
   reads++;return original.call(this)
  })
  try {
   const result=createSourceSession(Array(size).fill('甲 &amp; \\* _乙_ 末句').join('\n\n'))
   expect(result.ok).toBe(true)
   if(!result.ok)throw new Error(result.reason)
   expect(result.session.roots).toHaveLength(size)
   expect(result.session.roots.map(r=>[r.childFrom,r.childTo]))
    .toEqual(Array.from({length:size},(_,i)=>[i,i+1]))
  }finally{spy.mockRestore()}
  counts.push(reads)
 }
 expect(counts[1]).toBeLessThan(counts[0]!*2.6)
})
it('pairs mapped roots with actual emission across synthetic blank paragraphs',()=>{
 const s=partition('A\n\n\nB\n')
 expect(s.roots.map(r=>[r.childFrom,r.childTo,r.sourceFrom,r.sourceTo])).toEqual([[0,1,0,2],[2,3,4,6]])
 expect(s.gaps[1]!.synthetic.map(e=>[e.childFrom,e.childTo])).toEqual([[1,2]])
 expect(s.gaps[1]!.kind).toBe('trivia')
})
it('preserves reference definitions as opaque gap, not synthetic ownership',()=>{
 const raw='[x][ref]\n\n[ref]: /url\n\nTail',s=partition(raw)
 expect(s.roots).toHaveLength(2)
 expect(s.roots.map(r=>r.childFrom)).toEqual([0,3])
 const gap=s.gaps[1]!
 expect(gap.kind).toBe('opaque')
 expect(raw.slice(gap.sourceFrom,gap.sourceTo)).toContain('[ref]: /url')
 expect(gap.synthetic).toHaveLength(2)
})
it.each([
 '* A\n  + B\n\nTail',
 '- A\n\n  B\n\nTail',
 '| A | B |\n| :- | -: |\n| x | y |\n\nTail',
 '[^a]: A\n[^b]: B\n\nTail',
 '[^unused]: A\n\nBefore[^used]\n\n[^used]: B\n\nAfter[^used]',
 'Term\n: A\n\nTail',
 '---\r\na: 1\r\n---\r\n\r\nTail',
 '<div>\nA\n</div>\n\nTail',
 '```text\nA\n```\n\nTail',
 'A\n$$\nx\n$$\nB',
 '[x](url “title”)\r\n\rB\0',
 '\n\nA\n\n','',
])('partitions actual roots after preprocess: %j',partition)
it('projects generated math separator and CRLF to real raw boundaries',()=>{
 const raw='A\n$$\nx\n$$\nB',s=partition(raw)
 expect(s.roots.map(r=>raw.slice(r.sourceFrom,r.sourceTo))).toEqual(['A\n','$$\nx\n$$\n','B'])
 const crlf=partition('A\r\n\r\nB\r\n')
 expect(crlf.roots.map(r=>[r.sourceFrom,r.sourceTo])).toEqual([[0,3],[5,8]])
})
it.each([['# H\r\n','heading'],['---\na: 1\n---\n','frontmatter'],['```text\nA\n```\n','code_block']] as const)(
 'BOM prefix remains raw while capture sees syntax: %s',(plain,type)=>{
 const raw='\uFEFF'+plain,s=partition(raw)
 expect(s.doc.firstChild!.type.name).toBe(type)
 expect(s.roots[0]!.sourceFrom).toBe(1)
 expect(s.gaps[0]!.sourceTo).toBe(1)
 expect(parseMarkdown(raw,s.doc.type.schema).eq(s.doc)).toBe(false)
 expect(projectLineEndings(raw).text.charCodeAt(0)).toBe(0xFEFF)
})
it('preserves second and interior BOM, and legacy APIs',async()=>{
 const doubled='\uFEFF\uFEFF# H\n',s=open(doubled)
 expect(s.doc.eq(parseMarkdown(doubled.slice(1),s.doc.type.schema))).toBe(true)
 expect(s.doc.firstChild!.type.name).toBe('paragraph')
 const inner='A\uFEFFB';expect(open(inner).doc.textContent).toBe(inner)
 const raw='\uFEFF# H\n',legacy=parseMarkdown(raw)
 expect(legacy.firstChild!.type.name).toBe('paragraph')
 expect((await parseMarkdownAsync(raw)).eq(legacy)).toBe(true)
})
