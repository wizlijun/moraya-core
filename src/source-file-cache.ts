import type { Schema, Node as PmNode } from 'prosemirror-model'
import { captureFilePipeline, captureFileWindow, type CapturedDocument, type FileTokenCache, type FileDefinition, type FileWorkAccumulator } from './markdown'
import type { FileSourceResult, SourcePatch, SourceSession, FidelityFailure, FidelityResult, SourceFileUpdate, FileRootCorrespondence } from './source-fidelity'

export function emptyFileParseWork(): FileWorkAccumulator {
  return { mode: 'unchanged', blockWindows: [], blockParseCalls: 0, topLevelRunnerCalls: 0,
    blockRuleCalls: 0, nestedTokenizeCalls: 0, blockLinesVisited: 0, inlineParseCalls: 0,
    inlineInputUnits: 0, inlineRoots: [], rawTouchedBeforeRoots: [], environmentChanged: false,
    legacyParseCalls: 0, fullCaptureCalls: 0, pmEmissionTokenCount: 0, preprocessedCodeUnits: 0,
    lineTableCodeUnits: 0, rawSplicedCodeUnits: 0, inlineEffectReplayCount: 0 }
}

type FileParseCache = Readonly<{ canonical: SourceSession; tokens: FileTokenCache; environmentVersion: number }>
const fileCaches = new WeakMap<SourceSession, FileParseCache>()
export type VerifiedFileBase = Readonly<{ callerBase: SourceSession; verifiedBase: SourceSession; cache: FileParseCache; recovery: boolean }>

function makeSession(source: string, value: CapturedDocument, revision: number): SourceSession {
  return Object.freeze({ revision, source, doc: value.doc, textSpans: value.textRuns,
    roots: value.roots, gaps: value.gaps, protectedSources: value.protectedSources, layout: value.layout })
}
function registerSession(source: string, value: CapturedDocument, revision: number, tokens: FileTokenCache, environmentVersion: number): SourceSession {
  const session = makeSession(source, value, revision)
  fileCaches.set(session, { canonical: session, tokens, environmentVersion })
  return session
}
export function createFileSourceSession(source: string, schema?: Schema): FidelityResult {
  const parsed = captureFilePipeline(source, schema)
  if (!parsed.ok) return parsed
  return { ok: true, session: registerSession(source, parsed.value, 0, parsed.cache, 0) }
}

function sameMetadata(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>, keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(k => Object.hasOwn(right, k) && sameMetadata(left[k], right[k]))
}
export function prepareVerifiedFileBase(callerBase: SourceSession, work: FileWorkAccumulator): VerifiedFileBase | FidelityFailure {
  const hit = fileCaches.get(callerBase)
  if (hit) return { callerBase, verifiedBase: hit.canonical, cache: hit, recovery: false }
  work.mode = 'full-fallback'; work.fallbackReason = 'cache-miss'
  const parsed = captureFilePipeline(callerBase.source, callerBase.doc.type.schema, work)
  if (!parsed.ok) return parsed
  work.inlineRoots = parsed.value.roots.map(root => root.id)
  const actual = makeSession(callerBase.source, parsed.value, callerBase.revision)
  if (actual.doc.type.schema !== callerBase.doc.type.schema || !actual.doc.eq(callerBase.doc)
    || !sameMetadata(actual.roots, callerBase.roots) || !sameMetadata(actual.gaps, callerBase.gaps)
    || !sameMetadata(actual.protectedSources, callerBase.protectedSources) || !sameMetadata(actual.textSpans, callerBase.textSpans)
    || !sameMetadata(actual.layout.blankLines, callerBase.layout.blankLines) || !sameMetadata(actual.layout.fallback, callerBase.layout.fallback)
    || callerBase.layout.lists !== undefined && !sameMetadata(actual.layout.lists, callerBase.layout.lists))
    return { ok: false, reason: 'unsupported-source' }
  return { callerBase, verifiedBase: actual,
    cache: { canonical: actual, tokens: parsed.cache, environmentVersion: 0 }, recovery: true }
}
function commitRecovery(base: VerifiedFileBase): void {
  if (base.recovery) fileCaches.set(base.callerBase, base.cache)
}
export function finishUnchangedFile(base: VerifiedFileBase, work: FileWorkAccumulator): { ok: true; session: SourceSession; file: SourceFileUpdate } {
  commitRecovery(base)
  return { ok: true, session: base.callerBase, file: { environmentVersion: base.cache.environmentVersion,
    correspondence: base.verifiedBase.roots.map(r => ({ beforeRoots: [r.id], afterRoots: [r.id], kind: 'untouched' })), work } }
}

function splitsBoundary(source: string, offset: number): boolean {
  if (offset <= 0 || offset >= source.length) return false
  return source[offset - 1] === '\r' && source[offset] === '\n'
    || /[\uD800-\uDBFF]/.test(source[offset - 1]!) && /[\uDC00-\uDFFF]/.test(source[offset]!)
}
function validateSourcePatches(base: SourceSession, input: Readonly<{ expectedRevision: number; edits: readonly SourcePatch[] }>): readonly SourcePatch[] | FidelityFailure {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== base.revision) return { ok: false, reason: 'stale-document' }
  let end = 0, previous: SourcePatch | undefined
  const patches: SourcePatch[] = []
  for (const patch of input.edits) {
    if (!Number.isSafeInteger(patch.from) || !Number.isSafeInteger(patch.to)
      || typeof patch.removed !== 'string' || typeof patch.text !== 'string'
      || patch.from < end || patch.to < patch.from || patch.to > base.source.length
      || previous && previous.from === patch.from
      || splitsBoundary(base.source, patch.from) || splitsBoundary(base.source, patch.to)
      || base.source.slice(patch.from, patch.to) !== patch.removed) return { ok: false, reason: 'unmapped-range' }
    previous = patch; end = patch.to
    if (patch.text !== patch.removed) patches.push({ ...patch })
  }
  return patches
}
type SourcePiece = Readonly<{ beforeFrom: number; beforeTo: number; afterFrom: number; afterTo: number; generated: boolean }>
function spliceSource(base: SourceSession, patches: readonly SourcePatch[], work: FileWorkAccumulator): { source: string; pieces: SourcePiece[] } {
  const chunks: string[] = [], pieces: SourcePiece[] = []
  let before = 0, after = 0
  const keep = (to: number) => {
    if (to > before) {
      const text = base.source.slice(before, to)
      chunks.push(text); pieces.push({ beforeFrom: before, beforeTo: to, afterFrom: after, afterTo: after + text.length, generated: false })
      after += text.length
    }
  }
  for (const patch of patches) {
    keep(patch.from)
    chunks.push(patch.text); pieces.push({ beforeFrom: patch.from, beforeTo: patch.to,
      afterFrom: after, afterTo: after + patch.text.length, generated: true })
    before = patch.to; after += patch.text.length
  }
  keep(base.source.length)
  const source = chunks.join('')
  work.rawSplicedCodeUnits += source.length
  return { source, pieces }
}

export function foldDefinitionEvents(events: readonly FileDefinition[]): { references: Record<string, { href: string; title: string }>; footnotes: string[] } {
  const references: Record<string, { href: string; title: string }> = {}
  const footnotes = new Set<string>()
  for (const event of [...events].sort((a, b) => a.sourceFrom - b.sourceFrom)) {
    if (event.kind === 'reference') {
      if (typeof references[event.label] === 'undefined') references[event.label] = { href: event.href!, title: event.title! }
    } else footnotes.add(event.label)
  }
  return { references, footnotes: [...footnotes].sort() }
}

function rawTouchedRoots(base: SourceSession, patches: readonly SourcePatch[]): number[] {
  const ids = new Set<number>()
  for (const patch of patches) {
    let low = 0, high = base.roots.length
    while (low < high) { const mid = (low + high) >>> 1; if (base.roots[mid]!.sourceTo <= patch.from) low = mid + 1; else high = mid }
    for (let at = low; at < base.roots.length; at++) {
      const root = base.roots[at]!
      if (patch.from === patch.to) { if (root.sourceFrom < patch.from && patch.from < root.sourceTo) ids.add(root.id); break }
      if (root.sourceFrom >= patch.to) break
      ids.add(root.id)
    }
  }
  return [...ids].sort((a, b) => a - b)
}

function deriveRootCorrespondence(base: SourceSession, next: SourceSession, pieces: readonly SourcePiece[], touchedRoots: readonly number[]): FileRootCorrespondence[] {
  const total = base.roots.length + next.roots.length, parent = Array.from({ length: total }, (_, i) => i)
  const find = (n: number): number => { while (parent[n] !== n) { parent[n] = parent[parent[n]!]!; n = parent[n]! } return n }
  const join = (a: number, b: number) => { parent[find(a)] = find(b) }
  const touchedSet = new Set(touchedRoots)
  const firstRoot = (roots: SourceSession['roots'], from: number) => {
    let low = 0, high = roots.length
    while (low < high) { const mid = (low + high) >>> 1; if (roots[mid]!.sourceTo <= from) low = mid + 1; else high = mid }
    return low
  }
  for (const piece of pieces) {
    let oldIndex = firstRoot(base.roots, piece.beforeFrom), nextIndex = firstRoot(next.roots, piece.afterFrom)
    if (piece.generated) {
      const before: number[] = [], after: number[] = []
      for (; oldIndex < base.roots.length; oldIndex++) {
        const root = base.roots[oldIndex]!
        if (piece.beforeFrom === piece.beforeTo) {
          if (root.sourceFrom < piece.beforeFrom && piece.beforeFrom < root.sourceTo) before.push(root.id)
          break
        }
        if (root.sourceFrom >= piece.beforeTo) break
        before.push(root.id)
      }
      for (; nextIndex < next.roots.length && next.roots[nextIndex]!.sourceFrom < piece.afterTo; nextIndex++)
        if (piece.afterFrom < piece.afterTo) after.push(nextIndex)
      if (before.length && after.length) {
        const representative = before[0]!
        for (const id of before) join(representative, id)
        for (const id of after) join(representative, base.roots.length + id)
      }
      continue
    }
    for (; oldIndex < base.roots.length && base.roots[oldIndex]!.sourceFrom < piece.beforeTo; oldIndex++) {
      const old = base.roots[oldIndex]!
      const from = Math.max(old.sourceFrom, piece.beforeFrom) - piece.beforeFrom + piece.afterFrom
      const to = Math.min(old.sourceTo, piece.beforeTo) - piece.beforeFrom + piece.afterFrom
      while (nextIndex < next.roots.length && next.roots[nextIndex]!.sourceTo <= from) nextIndex++
      for (let index = nextIndex; index < next.roots.length && next.roots[index]!.sourceFrom < to; index++)
        join(old.id, base.roots.length + index)
    }
  }
  const groups = new Map<number, { beforeRoots: number[]; afterRoots: number[] }>()
  for (let i = 0; i < total; i++) {
    const key = find(i), group = groups.get(key) ?? { beforeRoots: [], afterRoots: [] }
    if (i < base.roots.length) group.beforeRoots.push(i); else group.afterRoots.push(i - base.roots.length)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => {
    const a = group.beforeRoots.length, b = group.afterRoots.length
    let kind: FileRootCorrespondence['kind'] = !a ? 'birth' : !b ? 'deleted' : a === 1 && b === 1 ? 'retained' : a === 1 ? 'split' : b === 1 ? 'join' : 'repartition'
    if (kind === 'retained') {
      const old = base.roots[group.beforeRoots[0]!]!, root = next.roots[group.afterRoots[0]!]!
      const touched = touchedSet.has(old.id)
      if (!touched && old.tokenType === root.tokenType && old.tailFrom - old.sourceFrom === root.tailFrom - root.sourceFrom
        && base.source.slice(old.sourceFrom, old.sourceTo) === next.source.slice(root.sourceFrom, root.sourceTo)) kind = 'untouched'
    }
    return { ...group, kind }
  })
}

function selectBlockWindow(cache: FileTokenCache, patches: readonly SourcePatch[]): { leftIndex: number; rightIndex: number } {
  const first = patches[0]!, last = patches[patches.length - 1]!
  let containing = 0
  while (containing + 1 < cache.checkpoints.length && cache.checkpoints[containing + 1]!.offset <= first.from) containing++
  const leftIndex = Math.max(0, containing - 1)
  let rightIndex = containing + 1
  while (rightIndex < cache.checkpoints.length && cache.checkpoints[rightIndex]!.offset < last.to) rightIndex++
  rightIndex = Math.min(cache.checkpoints.length - 1, rightIndex + 1)
  return { leftIndex, rightIndex }
}

export function prepareCandidate(base: VerifiedFileBase, patches: readonly SourcePatch[], work: FileWorkAccumulator, expectedDoc?: PmNode): FileSourceResult {
  if (!patches.length) {
    if (expectedDoc && !expectedDoc.eq(base.verifiedBase.doc)) return { ok: false, reason: 'semantic-mismatch', work }
    return { ...finishUnchangedFile(base, work), edits: [] }
  }
  const { source, pieces } = spliceSource(base.verifiedBase, patches, work)
  if (source === base.verifiedBase.source) {
    if (expectedDoc && !expectedDoc.eq(base.verifiedBase.doc)) return { ok: false, reason: 'semantic-mismatch', work }
    return { ...finishUnchangedFile(base, work), edits: [] }
  }
  let parsed = captureFileWindow(base.cache.tokens, source, patches, base.verifiedBase.doc.type.schema, work, selectBlockWindow(base.cache.tokens, patches))
  if (!parsed) {
    work.mode = 'full-fallback'; work.fallbackReason ??= 'checkpoint-unproven'
    parsed = captureFilePipeline(source, base.verifiedBase.doc.type.schema, work)
  }
  if (!parsed.ok) return { ...parsed, work }
  if (expectedDoc && !parsed.value.doc.eq(expectedDoc)) return { ok: false, reason: 'semantic-mismatch', work }
  work.environmentChanged = !sameMetadata(foldDefinitionEvents(base.cache.tokens.definitions), foldDefinitionEvents(parsed.cache.definitions))
  const environmentVersion = base.cache.environmentVersion + Number(work.environmentChanged)
  const next = makeSession(source, parsed.value, base.verifiedBase.revision + 1)
  work.rawTouchedBeforeRoots = rawTouchedRoots(base.verifiedBase, patches)
  if (work.mode === 'full-fallback') work.inlineRoots = next.roots.map(r => r.id)
  const correspondence = deriveRootCorrespondence(base.verifiedBase, next, pieces, work.rawTouchedBeforeRoots)
  const session = registerSession(source, parsed.value, next.revision, parsed.cache, environmentVersion)
  commitRecovery(base)
  return { ok: true, session, edits: patches, file: { environmentVersion, correspondence, work } }
}
export function prepareRawFileSourceEdits(base: SourceSession,
  input: Readonly<{ expectedRevision: number; edits: readonly SourcePatch[] }>): FileSourceResult {
  const work = emptyFileParseWork()
  const patches = validateSourcePatches(base, input)
  if ('ok' in patches) return { ...patches, work }
  const verified = prepareVerifiedFileBase(base, work)
  if ('ok' in verified) return { ...verified, work }
  return prepareCandidate(verified, patches, work)
}
