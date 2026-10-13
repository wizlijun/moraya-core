export type TracePiece = Readonly<{
  from: number; to: number; sourceFrom: number; sourceTo: number
  kind: 'copy' | 'atomic' | 'generated'
}>
export type SourceTrace = Readonly<{ text: string; pieces: readonly TracePiece[] }>
export type TraceEdit = Readonly<{ from: number; to: number; text: string }>

export function identityTrace(text: string): SourceTrace {
  return { text, pieces: text.length ? [{ from: 0, to: text.length, sourceFrom: 0, sourceTo: text.length, kind: 'copy' }] : [] }
}

export function sliceTrace(t: SourceTrace, from: number, to: number): SourceTrace {
  const pieces: TracePiece[] = []
  for (const p of t.pieces) {
    const a = Math.max(from, p.from), b = Math.min(to, p.to)
    if (a >= b) continue
    const whole = a === p.from && b === p.to
    pieces.push({ from: a - from, to: b - from,
      sourceFrom: p.kind === 'copy' ? p.sourceFrom + a - p.from : p.sourceFrom,
      sourceTo: p.kind === 'copy' ? p.sourceFrom + b - p.from : p.sourceTo,
      kind: p.kind === 'atomic' && !whole ? 'generated' : p.kind })
  }
  return { text: t.text.slice(from, to), pieces }
}

export function editTrace(t: SourceTrace, edits: readonly TraceEdit[]): SourceTrace {
  let at = 0, text = ''
  const pieces: TracePiece[] = []
  const append = (part: SourceTrace) => {
    const shift = text.length
    text += part.text
    pieces.push(...part.pieces.map(p => ({ ...p, from: p.from + shift, to: p.to + shift })))
  }
  for (const e of edits) {
    if (e.from < at || e.to < e.from || e.to > t.text.length) throw new RangeError('trace edit')
    append(sliceTrace(t, at, e.from))
    if (e.text) {
      const old = sliceTrace(t, e.from, e.to).pieces
      const anchor = t.pieces.find(p => p.from <= e.from && p.to >= e.from)
      const raw = anchor ? (anchor.kind === 'copy' ? anchor.sourceFrom + e.from - anchor.from : anchor.sourceFrom) : 0
      const contiguous = old.length > 0 && old.every((p, i) => p.kind !== 'generated' && (!i || old[i - 1]!.sourceTo === p.sourceFrom))
      append({ text: e.text, pieces: [{ from: 0, to: e.text.length,
        sourceFrom: contiguous ? old[0]!.sourceFrom : raw,
        sourceTo: contiguous ? old[old.length - 1]!.sourceTo : raw,
        kind: contiguous ? 'atomic' : 'generated' }] })
    }
    at = e.to
  }
  append(sliceTrace(t, at, t.text.length))
  return { text, pieces }
}
