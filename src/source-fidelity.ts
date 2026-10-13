import type { Node as PmNode, Schema } from 'prosemirror-model'
import type { Transaction } from 'prosemirror-state'
import { parseDocumentWithSourceCapture } from './markdown'
import type { SourceRoot, SourceGap } from './source-ownership'

export type TextSourceSpan = Readonly<{
  sourceFrom: number; sourceTo: number
  pmFrom: number; pmTo: number
  kind: 'linear' | 'atomic'
}>
export type SourceSession = Readonly<{
  revision: number; source: string; doc: PmNode
  textSpans: readonly TextSourceSpan[]
  roots: readonly SourceRoot[]; gaps: readonly SourceGap[]
}>
export type FidelityFailure = Readonly<{
  ok: false
  reason: 'unsupported-source' | 'parse-error' | 'stale-document'
    | 'unsupported-step' | 'unmapped-range' | 'semantic-mismatch'
}>
export type FidelityResult = { ok: true; session: SourceSession } | FidelityFailure

/** Experimental: complete raw document with sparse writable paragraph spans. */
export function createSourceSession(source: string, schema?: Schema): FidelityResult {
  const parsed = parseDocumentWithSourceCapture(source, schema)
  if (!parsed.ok) return parsed
  return { ok: true, session: { revision: 0, source, doc: parsed.value.doc, textSpans: parsed.value.textRuns,
    roots: parsed.value.roots, gaps: parsed.value.gaps } }
}

function splitsSurrogate(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length
    && /[\uD800-\uDBFF]/.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/.test(text[offset]!)
}

// Inline atoms contribute PM positions but no textContent characters.
function splitsTextAt(doc: PmNode, pos: number): boolean {
  const resolved = doc.resolve(pos)
  let split = false
  resolved.parent.forEach((node, offset) => {
    if (node.isText && resolved.parentOffset > offset && resolved.parentOffset < offset + node.nodeSize) {
      split = split || splitsSurrogate(node.text!, resolved.parentOffset - offset)
    }
  })
  return split
}

function boundary(span: TextSourceSpan, pos: number): number | undefined {
  if (pos === span.pmFrom) return span.sourceFrom
  if (pos === span.pmTo) return span.sourceTo
  if (span.kind === 'linear') return span.sourceFrom + pos - span.pmFrom
  return undefined
}

/** Pure preparation: a failure never supplies output or mutates the base session. */
export function applySourceTextTransaction(base: SourceSession, tr: Transaction): FidelityResult {
  if (!tr.before.eq(base.doc)) return { ok: false, reason: 'stale-document' }
  if (tr.steps.length !== 1) return { ok: false, reason: 'unsupported-step' }
  if (tr.storedMarksSet) return { ok: false, reason: 'unsupported-step' }
  const step = tr.steps[0]!.toJSON()
  if (step.stepType !== 'replace' || step.structure) return { ok: false, reason: 'unsupported-step' }
  const { from, to } = step as { from: number; to: number }
  const $from = base.doc.resolve(from), $to = base.doc.resolve(to)
  if ($from.depth !== 1 || !$from.sameParent($to) || $from.parent.type.name !== 'paragraph'
    || to < from || step.slice?.openStart || step.slice?.openEnd
    || step.slice?.content?.some((node: { type: string }) => node.type !== 'text')) {
    return { ok: false, reason: 'unsupported-step' }
  }
  if (splitsTextAt(base.doc, from) || splitsTextAt(base.doc, to)) {
    return { ok: false, reason: 'unmapped-range' }
  }
  const spans = base.textSpans.filter(span => from === to
    ? span.pmFrom <= from && span.pmTo >= to : span.pmTo > from && span.pmFrom < to)
  if (!spans.length) return { ok: false, reason: 'unmapped-range' }
  if (from < to && (spans[0]!.pmFrom > from || spans[spans.length - 1]!.pmTo < to
    || spans.some((span, i) => i > 0 && spans[i - 1]!.pmTo !== span.pmFrom))) {
    return { ok: false, reason: 'unmapped-range' }
  }
  // An insertion at a syntax boundary is ambiguous.
  if (from === to && spans.some(span => boundary(span, from) !== boundary(spans[0]!, from))) {
    return { ok: false, reason: 'unmapped-range' }
  }
  const sourceFrom = boundary(spans[0]!, from)
  const sourceTo = boundary(spans[spans.length - 1]!, to)
  if (sourceFrom === undefined || sourceTo === undefined
    || spans.some((span, i) => i > 0 && spans[i - 1]!.sourceTo !== span.sourceFrom)
    || splitsSurrogate(base.source, sourceFrom) || splitsSurrogate(base.source, sourceTo)) {
    return { ok: false, reason: 'unmapped-range' }
  }
  const insert = (step.slice?.content ?? []).map((node: { text: string }) => node.text).join('')
  const candidate = base.source.slice(0, sourceFrom) + insert + base.source.slice(sourceTo)
  const result = createSourceSession(candidate, base.doc.type.schema)
  if (!result.ok || !result.session.doc.eq(tr.doc)) return { ok: false, reason: 'semantic-mismatch' }
  return { ok: true, session: { ...result.session, revision: base.revision + 1 } }
}
