export type TracePiece = Readonly<{
  from: number; to: number; sourceFrom: number; sourceTo: number
  kind: 'copy' | 'atomic' | 'generated'
}>
export type SourceTrace = Readonly<{ text: string; pieces: readonly TracePiece[] }>
export type TraceEdit = Readonly<{ from: number; to: number; text: string }>

export function identityTrace(text: string): SourceTrace {
  return { text, pieces: text.length ? [{ from: 0, to: text.length, sourceFrom: 0, sourceTo: text.length, kind: 'copy' }] : [] }
}

// Pieces are ordered and non-overlapping; find only the first possible overlap.
function firstPiece(t: SourceTrace, from: number): number {
  let lo = 0, hi = t.pieces.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (t.pieces[mid]!.to <= from) lo = mid + 1
    else hi = mid
  }
  return lo
}

function slicePieces(t: SourceTrace, from: number, to: number, start: number): TracePiece[] {
  const pieces: TracePiece[] = []
  for (let i = start; i < t.pieces.length; i++) {
    const p = t.pieces[i]!
    if (p.from >= to) break
    const a = Math.max(from, p.from), b = Math.min(to, p.to)
    if (a >= b) continue
    const whole = a === p.from && b === p.to
    pieces.push({ from: a - from, to: b - from,
      sourceFrom: p.kind === 'copy' ? p.sourceFrom + a - p.from : p.sourceFrom,
      sourceTo: p.kind === 'copy' ? p.sourceFrom + b - p.from : p.sourceTo,
      kind: p.kind === 'atomic' && !whole ? 'generated' : p.kind })
  }
  return pieces
}

export function sliceTrace(t: SourceTrace, from: number, to: number): SourceTrace {
  return { text: t.text.slice(from, to), pieces: slicePieces(t, from, to, firstPiece(t, from)) }
}

export function editTrace(t: SourceTrace, edits: readonly TraceEdit[]): SourceTrace {
  let at = 0, length = 0, pieceIndex = 0, anchorIndex = 0
  const chunks: string[] = [], pieces: TracePiece[] = []
  // Both cursors only advance. Keep a separate inclusive cursor for insertion
  // anchors: at a boundary the preceding piece owns the original anchor.
  const slice = (from: number, to: number): SourceTrace => {
    while (pieceIndex < t.pieces.length && t.pieces[pieceIndex]!.to <= from) pieceIndex++
    return { text: t.text.slice(from, to), pieces: slicePieces(t, from, to, pieceIndex) }
  }
  const append = (part: SourceTrace) => {
    for (const p of part.pieces) pieces.push({ ...p, from: p.from + length, to: p.to + length })
    chunks.push(part.text)
    length += part.text.length
  }
  for (const e of edits) {
    if (e.from < at || e.to < e.from || e.to > t.text.length) throw new RangeError('trace edit')
    append(slice(at, e.from))
    if (e.text) {
      const old = slice(e.from, e.to).pieces
      while (anchorIndex < t.pieces.length && t.pieces[anchorIndex]!.to < e.from) anchorIndex++
      const candidate = t.pieces[anchorIndex]
      const anchor = candidate && candidate.from <= e.from ? candidate : undefined
      const raw = anchor ? (anchor.kind === 'copy' ? anchor.sourceFrom + e.from - anchor.from : anchor.sourceFrom) : 0
      const contiguous = old.length > 0 && old.every((p, i) => p.kind !== 'generated' && (!i || old[i - 1]!.sourceTo === p.sourceFrom))
      append({ text: e.text, pieces: [{ from: 0, to: e.text.length,
        sourceFrom: contiguous ? old[0]!.sourceFrom : raw,
        sourceTo: contiguous ? old[old.length - 1]!.sourceTo : raw,
        kind: contiguous ? 'atomic' : 'generated' }] })
    }
    at = e.to
  }
  append(slice(at, t.text.length))
  return { text: chunks.join(''), pieces }
}
