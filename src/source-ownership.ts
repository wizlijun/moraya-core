import { sliceTrace, firstPiece, type SourceTrace } from './source-trace'

export type SourceRoot = Readonly<{
  id: number; tokenType: string
  sourceFrom: number; sourceTo: number; tailFrom: number
  pmFrom: number; pmTo: number; childFrom: number; childTo: number
}>
export type SyntheticEmission = Readonly<{
  pmFrom: number; pmTo: number; childFrom: number; childTo: number
}>
export type SourceGap = Readonly<{
  sourceFrom: number; sourceTo: number
  kind: 'trivia' | 'opaque'
  synthetic: readonly SyntheticEmission[]
}>
export type SourceEdit = Readonly<{ from: number; to: number; text: string }>

export class UnsupportedOwnership extends Error {}

export function rawRange(trace: SourceTrace, from: number, to: number): { from: number; to: number } | undefined {
  const view = sliceTrace(trace, from, to)
  // sliceTrace turns a partial atomic into generated; natural root boundaries
  // must never cut a non-generated atomic interior.
  for (const offset of [from, to]) {
    const piece = trace.pieces[firstPiece(trace, offset)]
    if (piece?.kind === 'atomic' && offset > piece.from && offset < piece.to) {
      throw new UnsupportedOwnership()
    }
  }
  const real = view.pieces.filter(p => p.kind !== 'generated')
  if (!real.length) return undefined
  if (real.some((p, i) => i > 0 && real[i - 1]!.sourceTo !== p.sourceFrom)) throw new UnsupportedOwnership()
  return { from: real[0]!.sourceFrom, to: real[real.length - 1]!.sourceTo }
}

export function lineStarts(text: string): number[] {
  const result = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') result.push(i + 1)
  // markdown-it's map can end on EOF even without final LF.
  if (result[result.length - 1] !== text.length) result.push(text.length)
  return result
}

export function rendererTailStart(text: string, from: number, to: number, tokenType: string): number {
  if (to <= from || text[to - 1] !== '\n') return to
  // Literal content may contain meaningful trailing blank lines: only the
  // final parser line terminator participates in this renderer contract.
  if (['fence', 'code_block', 'front_matter', 'html_block', 'math_block', 'math_block_eqno'].includes(tokenType)) return to - 1
  const flow = new Set(['paragraph_open', 'heading_open', 'bullet_list_open', 'ordered_list_open',
    'blockquote_open', 'table_open', 'footnote_reference_open', 'dl_open', 'hr'])
  if (!flow.has(tokenType)) throw new UnsupportedOwnership()
  let end = to
  while (end > from) {
    const start = Math.max(from, text.lastIndexOf('\n', end - 2) + 1)
    const content = text.slice(start, end - 1)
    if (/^[ \t]*$/.test(content)) { end = start; continue }
    return end - 1
  }
  return from
}
