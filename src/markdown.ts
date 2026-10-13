import type {InlineRecipeFacts,InlineEdge,ClosedFenceBody,InlineAtomOccurrence,CriticPayload} from './source-inline-recipe'
import type {SourceSession} from './source-fidelity'
/**
 * Markdown ↔ ProseMirror Doc roundtrip for `@moraya/core`.
 *
 * Faithful 1:1 migration from Moraya desktop `src/lib/editor/markdown.ts`.
 * Uses `prosemirror-markdown` with `markdown-it` as the tokenizer.
 *
 * Supports: CommonMark + GFM (tables, strikethrough, task lists) +
 *           math (via markdown-it-texmath) + definition lists +
 *           paired raw-HTML marks + frontmatter / footnote pass-through.
 *
 * Configuration matches Milkdown output conventions:
 *   - bullet: '-'
 *   - horizontal rule: '---'
 *   - strong: '**'
 *   - emphasis: '*'
 *
 * Serializer wraps `defaultSchema` (host-agnostic NullMediaResolver). The
 * schema's structural shape is identical to consumer-injected schemas
 * (same NodeSpec/MarkSpec ids), so a doc parsed against `defaultSchema`
 * round-trips through any consumer schema without rebuilding.
 */

import MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type { FileParseWork } from './source-fidelity'
import deflistPlugin from 'markdown-it-deflist'
import texmathPlugin from 'markdown-it-texmath'
import markPlugin from 'markdown-it-mark'
import footnotePlugin from 'markdown-it-footnote'
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown'
import type { MarkdownSerializerState } from 'prosemirror-markdown'
import type { Node as PmNode, Mark, Schema } from 'prosemirror-model'
import { defaultSchema } from './schema'
import { projectLineEndings } from './source-projection'
import { rawRange, lineStarts, rendererTailStart, UnsupportedOwnership, type SourceRoot, type SourceGap, type SyntheticEmission, type ProtectedSource } from './source-ownership'
import { collectBlankDrafts, finishSourceLayout, type BlankDraft, type FallbackEmpty, type SourceLayout, type LayoutRegion, type SourceListLexeme, type ListMarker } from './source-layout'
import type {EmptyBody,EmptyPlace,RawRange,SourcePrefix} from './source-empty-body'
import { traceConsumedLines, traceTableRow, type LineRead } from './source-content-trace'
import { identityTrace, sliceTrace, editTrace, firstPiece, type SourceTrace, type TraceEdit } from './source-trace'

// ── markdown-it instance ────────────────────────────────────────

const md = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
})
  .enable(['table', 'strikethrough'])
  .use(deflistPlugin)
  .use(texmathPlugin)
  .use(markPlugin)
  .use(footnotePlugin)

// markdown-it-footnote 默认把所有定义搬到文末、按引用顺序重排、并**删掉未被引用的
// 定义** —— 这三件事全部由 core 规则 `footnote_tail` 一手包办。它的块规则本身是
// 原位产出 token 的,所以禁掉 tail 就得到原位保真 + 孤儿定义保留。
md.core.ruler.disable('footnote_tail')

// 我们不做内联脚注 `^[内容]`。这不是"不支持"而是**必须显式禁用**:留着它会把
// `^[内容]` 解析成没有 label 的 footnote_ref,序列化时无从知道写回什么,等于引入
// 一种新的数据破坏。禁掉后它安分地保持纯文本。
md.inline.ruler.disable('footnote_inline')

// Keep ASCII escapes such as %20/%23/%25 intact so Markdown destinations do
// not lose information, while preserving the existing readable Unicode form.
function decodeMultibytePercentSequences(value: string): string {
  return value.replace(
    /%[C-F][0-9A-F](?:%[89AB][0-9A-F])+/gi,
    (match) => { try { return decodeURIComponent(match) } catch { return match } },
  )
}

function restoreLocalWindowsSeparators(value: string): string {
  const hasUriScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  const isWindowsDrivePath = /^[A-Za-z]:%5C/i.test(value)
  return hasUriScheme && !isWindowsDrivePath ? value : value.replace(/%5C/gi, '\\')
}

function serializeImageDestination(src: string): string {
  const normalized = decodeMultibytePercentSequences(md.normalizeLink(src))
  // Angle destinations are the CommonMark form that safely carries encoded
  // spaces and delimiter characters through another parse.
  return /[%\s()<>]/.test(normalized) ? `<${normalized}>` : normalized
}

function serializeImageTitle(title: string): string {
  return title
    .replace(/\r?\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

// markdown-it-footnote 的 `footnote_ref` 规则要求 label 已在 env.footnotes.refs 里
// 登记过(即定义必须存在),因此无定义的裸引用 `[^loop]` 不成节点,会退回纯文本并被
// 序列化器的 esc() 加上反斜杠。兜底规则在它之后接手,产出同名 token,使有无定义都
// 成节点(与 Obsidian 一致)。
md.inline.ruler.after('footnote_ref', 'footnote_ref_orphan', (state, silent) => {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x5B /* [ */) return false
  if (src.charCodeAt(start + 1) !== 0x5E /* ^ */) return false

  let pos = start + 2
  for (; pos < state.posMax; pos++) {
    const ch = src.charCodeAt(pos)
    // label 内不允许空格/换行 —— 与 markdown-it-footnote 的 label 规则一致
    if (ch === 0x20 || ch === 0x0A) return false
    if (ch === 0x5D /* ] */) break
  }
  if (pos === start + 2) return false      // 空 label
  if (pos >= state.posMax) return false    // 未闭合

  if (!silent) {
    const tok = state.push('footnote_ref', '', 0)
    tok.meta = { label: src.slice(start + 2, pos) }
  }
  state.pos = pos + 1
  return true
})

// ── Caret highlight rule: ^^text^^ → caret_highlight_open/close ──────────────

md.inline.ruler.push('caret_highlight', (state, silent) => {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x5E /* ^ */) return false
  if (state.src.charCodeAt(start + 1) !== 0x5E /* ^ */) return false

  const contentStart = start + 2
  if (contentStart >= state.posMax) return false

  let closeIdx = -1
  for (let i = contentStart; i < state.posMax - 1; i++) {
    if (state.src.charCodeAt(i) === 0x5E && state.src.charCodeAt(i + 1) === 0x5E) {
      closeIdx = i
      break
    }
  }
  if (closeIdx < 0 || closeIdx === contentStart) return false

  if (!silent) {
    const opened=state.push('caret_highlight_open', 'mark', 1);opened.markup = '^^'
    // Recursively tokenize the wrapped text (like the ==…== and {==…==} paths)
    // so escapes (`\*`) are consumed and inner marks (`**bold**`) still work. A
    // raw slice would keep backslash escapes as literal text, which the
    // serializer then re-escapes every round-trip (^^\*\*^^ → ^^\\\*\\\*^^ → …),
    // exploding on repeated save.
    const oldPos = state.pos
    const oldMax = state.posMax
    state.pos = contentStart
    state.posMax = closeIdx
    state.md.inline.tokenize(state)
    state.pos = oldPos
    state.posMax = oldMax
    const closed=state.push('caret_highlight_close', 'mark', -1);closed.markup = '^^'
    const trace=inlineStateOwners.get(state)
    if(trace)registerEdge(opened,closed,trace,start,contentStart,closeIdx,closeIdx+2)
  }
  state.pos = closeIdx + 2
  return true
})

// ── CriticMarkup annotation rules ───────────────────────────────
// {==text==}{>>note<<} → critic_anno_open / inline content / critic_anno_close
// {>>note<<}           → critic_note (self-closing, nesting 0)
// Registered as a plain push: markdown-it's text rule already breaks on `{`,
// and the inner `==…==` never reaches markdown-it-mark because we tokenize
// the slice between the delimiters directly.
md.inline.ruler.push('critic_annotation', (state, silent) => {
  const src = state.src
  const start = state.pos
  if (src.charCodeAt(start) !== 0x7B /* { */) return false

  // Standalone point annotation: {>>note<<}
  if (src.startsWith('{>>', start)) {
    const close = src.indexOf('<<}', start + 3)
    if (close < 0) return false
    const note = src.slice(start + 3, close)
    if (note.includes('\n')) return false
    if (!silent) {
      const tok = state.push('critic_note', '', 0)
      tok.meta = { note }
      const trace=inlineStateOwners.get(state)
      if(trace)registerCritic(tok,trace,start,start+3,close,close+3)
    }
    state.pos = close + 3
    return true
  }

  // Wrapped annotation: {==text==}{>>note<<} (segments must be adjacent)
  if (!src.startsWith('{==', start)) return false
  const hlClose = src.indexOf('==}{>>', start + 3)
  if (hlClose < 0) return false
  const text = src.slice(start + 3, hlClose)
  if (!text || text.includes('\n')) return false
  const noteStart = hlClose + 6
  const noteClose = src.indexOf('<<}', noteStart)
  if (noteClose < 0) return false
  const note = src.slice(noteStart, noteClose)
  if (note.includes('\n')) return false

  if (!silent) {
    const open = state.push('critic_anno_open', 'span', 1)
    open.meta = { note }
    // Recursively tokenize the wrapped text so **bold** etc. still work.
    const oldPos = state.pos
    const oldMax = state.posMax
    state.pos = start + 3
    state.posMax = hlClose
    state.md.inline.tokenize(state)
    state.pos = oldPos
    state.posMax = oldMax
    const close=state.push('critic_anno_close', 'span', -1)
    const trace=inlineStateOwners.get(state)
    if(trace){registerEdge(open,close,trace,start,start+3,hlClose,noteClose+3);registerCritic(close,trace,start,noteStart,noteClose,noteClose+3,hlClose)}
  }
  state.pos = noteClose + 3
  return true
})

// ── Paired HTML tag pre-processing ──────────────────────────────

interface InlineToken {
  type: string
  content: string
  children?: InlineToken[] | null
  meta?: Record<string, unknown> | null
  hidden?: boolean
  level?: number
  block?: boolean
  attrs?: unknown
  info?: string
  map?: [number, number] | null
  markup?: string
  tag?: string
  nesting?: number
  attrGet?: (name: string) => string | null
}

/**
 * Pre-scan inline tokens to identify paired HTML opening/closing tags.
 * Sets `meta.htmlPaired = true` on paired tokens so the parser converts
 * them to marks (styled rendering) instead of atom nodes (invisible).
 * Unpaired tags remain unmarked → atom nodes → exact roundtrip fidelity.
 */
function tagPairedHtmlInline(tokens: InlineToken[]): void {
  const VOID_RE = /^<(?:br|hr|img|input|wbr|area|base|col|embed|link|meta|param|source|track)[\s/>]/i
  for (const token of tokens) {
    if (token.type !== 'inline' || !token.children) continue
    const children = token.children
    const stack: { tagName: string; index: number }[] = []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (!child || child.type !== 'html_inline') continue
      const content: string = child.content
      // Skip void/self-closing elements and comments
      if (VOID_RE.test(content) || /\/>$/.test(content) || /^<!--/.test(content)) continue
      // Closing tag?
      const closeMatch = content.match(/^<\/([a-zA-Z][a-zA-Z0-9]*)\s*>$/)
      if (closeMatch && closeMatch[1]) {
        const tagName = closeMatch[1].toLowerCase()
        for (let j = stack.length - 1; j >= 0; j--) {
          const entry = stack[j]
          if (!entry) continue
          if (entry.tagName === tagName) {
            const opener = children[entry.index]
            if (opener) {
              opener.meta = { ...(opener.meta || {}), htmlPaired: true }
              const open=htmlTokenRanges.get(opener),close=htmlTokenRanges.get(child)
              if(open&&close){edgeTokens.set(opener,{open,close,side:'open'});edgeTokens.set(child,{open,close,side:'close'})}
            }
            child.meta = { ...(child.meta || {}), htmlPaired: true }
            stack.splice(j, 1)
            break
          }
        }
        continue
      }
      // Opening tag?
      const openMatch = content.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>$/)
      if (openMatch && openMatch[1]) {
        stack.push({ tagName: openMatch[1].toLowerCase(), index: i })
      }
    }
  }
}

/**
 * Detect extra blank lines between top-level blocks and inject empty paragraph
 * tokens so ProseMirror preserves them as empty <p> nodes.
 *
 * Standard Markdown collapses consecutive blank lines into one paragraph break.
 * This post-processor restores each extra blank line as an empty paragraph,
 * giving Typora-style round-trip fidelity for multi-Enter spacing.
 */
/**
 * 给 `footnote_reference_open` 补上 `map`。
 *
 * markdown-it-footnote 建这个 token 时不设行号(它原本的 `footnote_tail` 会把定义
 * 整体搬到文末,行号对它没意义)。但我们禁掉了 tail、让定义留在原位,于是
 * {@link preserveBlankLines} 靠 `tok.map` 追踪行号的链条就在这里断掉:定义块占的
 * 行数被当成空行,定义后面每跟一段正文就凭空多出两个空段落,往返多出 `\n\n`。
 *
 * 行范围取自定义内部子 token 的 map 并集。必须在 preserveBlankLines 之前跑。
 */
function fixFootnoteDefMaps(tokens: InlineToken[]): void {
  let prevDefEnd = -1

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]
    if (!open || open.type !== 'footnote_reference_open') continue

    let start = Infinity
    let end = -Infinity
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j]
      if (!t) continue
      if (t.type === 'footnote_reference_close') break
      if (!t.map) continue
      start = Math.min(start, t.map[0] as number)
      end = Math.max(end, t.map[1] as number)
    }

    if (start === Infinity || end === -Infinity) continue
    open.map = open.map ? [Math.min(open.map[0]!,start),Math.max(open.map[1]!,end)] : [start, end]

    // 紧贴上一条定义(中间没有空行)。序列化据此决定要不要插空行,否则连续写的
    // 定义列表每保存一次就被撑开一次。
    const meta: Record<string, unknown> = { ...(open.meta ?? {}) }
    meta.tight = start === prevDefEnd
    open.meta = meta
    prevDefEnd = end
  }
}

function preserveBlankLines(tokens: InlineToken[]): InlineToken[] {
  function mkToken(type: string, tag: string, nesting: number, extra?: Partial<InlineToken>): InlineToken {
    return {
      type, tag, nesting, content: '', children: null, attrs: null, info: '',
      meta: null, map: null, block: true, hidden: false, level: 0, markup: '',
      ...extra,
    }
  }

  const result: InlineToken[] = []
  let lastTopBlockEndLine = 0

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (!tok) continue

    if (tok.map && tok.level === 0 && (tok.nesting === 1 || tok.nesting === 0)) {
      const startLine = tok.map[0] as number
      const gap = startLine - lastTopBlockEndLine

      if (gap > 1 && lastTopBlockEndLine > 0) {
        const extra = gap - 1
        for (let j = 0; j < extra; j++) {
          const open = mkToken('paragraph_open', 'p', 1)
          result.push(
            open,
            mkToken('inline', '', 0, { level: 1, block: false, children: [] }),
            mkToken('paragraph_close', 'p', -1),
          )
        }
      }

      lastTopBlockEndLine = tok.map[1] as number
    }

    result.push(tok)
  }

  return result
}

// ── Frontmatter block rule ──────────────────────────────────────
// markdown-it has no native frontmatter support, so a leading `---\n…\n---`
// gets shredded into hr + paragraphs + a trailing setext heading, collapsing
// the YAML newlines. Capture it up-front as a single `front_matter` token whose
// raw text (newlines intact) maps to the schema's `frontmatter` node.
//
// Runs before every other block rule and only fires on line 0, so it never
// steals a `---` horizontal rule that appears later in the document.
md.block.ruler.before(
  'table',
  'front_matter',
  (state, startLine, endLine, silent): boolean => {
    // Only valid as the very first block of the document.
    if (startLine !== 0 || state.blkIndent !== 0 || state.tShift[startLine] !== 0) return false

    const openStart = state.bMarks[startLine]
    const openMax = state.eMarks[startLine]
    // Opening fence must be exactly `---` on line 0.
    if (state.src.slice(openStart, openMax) !== '---') return false

    // Scan for the closing `---` line.
    let nextLine = startLine
    let closed = false
    for (;;) {
      nextLine++
      if (nextLine >= endLine) break
      const lineStart = state.bMarks[nextLine]
      const lineMax = state.eMarks[nextLine]
      if (state.src.slice(lineStart, lineMax) === '---') { closed = true; break }
    }
    // Unterminated block → not frontmatter; let the default rules handle it.
    if (!closed) return false

    if (silent) return true

    // Raw YAML between the fences (exclusive of both `---` lines), newlines
    // preserved. Ends with the trailing `\n` before the closing fence, which
    // prosemirror-markdown's `withoutTrailingNewline` strips back off.
    const contentStart = state.bMarks[startLine + 1]
    const contentEnd = state.bMarks[nextLine]

    const token = state.push('front_matter', '', 0)
    token.markup = '---'
    token.block = true
    token.map = [startLine, nextLine + 1]
    token.content = state.src.slice(contentStart, contentEnd)
    const collector=collectorFor(state)
    if(collector){
      if(contentStart===undefined||contentEnd===undefined)throw new UnsupportedSourceCapture()
      const empty=emptyLiteral(state,startLine,nextLine,0,token.content)
      literalFacts.set(token,{collector,trace:sliceTrace(collector.trace,contentStart,contentEnd),kind:'front_matter',...(empty?{empty}:{})})
    }

    state.line = nextLine + 1
    return true
  },
  { alt: [] },
)

// Experimental provenance for top-level paragraphs. These wrappers delegate to
// the installed rules; an env-local collector keeps ordinary parses unchanged.
export type CapturedTextRun = {
  sourceFrom: number; sourceTo: number; pmFrom: number; pmTo: number
  kind: 'linear' | 'atomic'
}
export type CapturedParagraph = { doc: PmNode; textRuns: CapturedTextRun[] }
export type CapturedDocument = CapturedParagraph & { roots: SourceRoot[]; gaps: SourceGap[]; protectedSources: readonly ProtectedSource[]; layout: SourceLayout }
type SourceRun = { text: string; kind?: undefined; trace?: undefined }
  | { text: string; kind: 'linear' | 'atomic'; trace: SourceTrace }
type Capture = {
  file?: FileCaptureState
  separators:{left?:number;right?:number;range:RawRange;definition?:ProtectedSource}[]; critic:CriticPayload[]; atoms:InlineAtomOccurrence[]; edges:InlineEdge[]; fences:ClosedFenceBody[]; emptyBodies: EmptyBody[]; bodies: InlineBody[]; emissions: InlineEmission[]
  source: string; blankLines: BlankDraft[]; fallback?: FallbackEmpty; lists: ListDraft[]
  trace: SourceTrace; lineStarts: number[]; protectedSources: ProtectedSource[]; runs: CapturedTextRun[]; roots: SourceRoot[]
  synthetic: { gapIndex: number; emission: SyntheticEmission }[]
}
const captureKey = Symbol('document source capture')
const owners = new WeakMap<object, SourceTrace>()
type InlineBody = Readonly<{
  pmFrom:number; pmTo:number; sourceFrom:number; sourceTo:number
  kind:'paragraph'|'heading'|'table-cell'; singlePhysicalLine:boolean
}>
type InlineEmission = {from:number;to:number;kind:string;runFrom:number;runTo:number;node?:PmNode;body?:InlineBody;empty?:EmptyPlace;edgeFrom?:number;edgeTo?:number;atomFrom?:number;atomTo?:number;criticFrom?:number;criticTo?:number;separators?:readonly SeparatorToken[];fence?:ClosedFenceBody}
const inlineFrames=new WeakMap<object,InlineEmission>()
const inlineCloseStates=new WeakSet<object>()
const inlineFacts = new WeakMap<object, {collector:Capture;trace?:SourceTrace;kind?:InlineBody['kind'];empty?:EmptyPlace;trimEnd?:number}>()
const literalFacts=new WeakMap<object,{collector:Capture;trace:SourceTrace;kind:string;empty?:EmptyPlace}>()
const capturedTextParents=['paragraph','heading','code_block','frontmatter','html_block']
const capturedTextMarks=['em','strong','link','annotation','html_mark','highlight','strike_through','code']
const tokenArrays = new WeakMap<object, object>()
const inlineStateOwners = new WeakMap<object, SourceTrace>()
const tokenSources = new WeakMap<object, { collector: Capture; runs: SourceRun[] }>()
const pendingSources = new WeakMap<object, SourceRun[]>()
type EdgeToken={open:{from:number;to:number};close:{from:number;to:number};side:'open'|'close'|'code'}
type CriticToken=Omit<CriticPayload,'id'|'body'|'pmFrom'|'pmTo'|'note'>
const criticTokens=new WeakMap<object,CriticToken>()
function registerCritic(token:object,trace:SourceTrace,start:number,noteStart:number,noteEnd:number,end:number,middleStart?:number):void {
 const syntax=rawRange(trace,start,end),note=rawRange(trace,noteStart,noteEnd),close=rawRange(trace,noteEnd,end)
 const open=middleStart===undefined?undefined:rawRange(trace,start,start+3),middle=middleStart===undefined?undefined:rawRange(trace,middleStart,noteStart)
 // Empty payload endpoints still come from the actual rule's consumed trace.
 const noteFrom=note?.from??rawPoint(trace,noteStart),noteTo=note?.to??rawPoint(trace,noteEnd)
 if(syntax&&close&&noteFrom!==undefined&&noteTo!==undefined&&(middleStart===undefined||open&&middle))criticTokens.set(token,{kind:middleStart===undefined?'note_anchor':'annotation',syntaxFrom:syntax.from,syntaxTo:syntax.to,noteFrom,noteTo,close,...(open&&middle?{open,middle}:{})})
}
const atomTokenRanges=new WeakMap<object,{from:number;to:number}>()
const htmlTokenRanges=new WeakMap<object,{from:number;to:number}>()
const edgeTokens=new WeakMap<object,EdgeToken>()
const fenceTokens=new WeakMap<object,Omit<ClosedFenceBody,'pmFrom'|'pmTo'|'contentFrom'|'contentTo'>>()
const currentInlineCollector=new WeakMap<object,Capture>()
const activeEdges=new WeakMap<object,Map<number,{pmFrom:number;marks:readonly Mark[]}>>()
const capturedFenceClosed = new WeakMap<object, boolean>()
const capturedRootFencesClosed = new WeakMap<SourceRoot, boolean>()
const capturedListLayouts = new WeakMap<SourceLayout, {
  source: string; doc: PmNode; roots: readonly SourceRoot[]; lists: readonly SourceListLexeme[]; emptyBodies:readonly EmptyBody[]; bodies: readonly InlineBody[]; recipe:InlineRecipeFacts
}>()
let captureAvailable = true

/** Internal actual-capture authority. Public readonly metadata grants no permission. */
export function capturedSourceLists(source: string, doc: PmNode, roots: readonly SourceRoot[], layout: SourceLayout): readonly SourceListLexeme[] | undefined {
  const bound = capturedListLayouts.get(layout)
  return bound && bound.source === source && bound.doc === doc && bound.roots === roots
    && bound.lists === layout.lists ? bound.lists : undefined
}

export function capturedInlineBodies(source:string,doc:PmNode,roots:readonly SourceRoot[],layout:SourceLayout):readonly InlineBody[]|undefined {
  const bound=capturedListLayouts.get(layout)
  return bound&&bound.source===source&&bound.doc===doc&&bound.roots===roots&&bound.lists===layout.lists?bound.bodies:undefined
}

export function capturedInlineRecipeFacts(base:SourceSession):InlineRecipeFacts|undefined {
 const bound=capturedListLayouts.get(base.layout)
 return bound&&bound.source===base.source&&bound.doc===base.doc&&bound.roots===base.roots&&bound.lists===base.layout.lists?bound.recipe:undefined
}

export function capturedEmptyBodies(source:string,doc:PmNode,roots:readonly SourceRoot[],layout:SourceLayout):readonly EmptyBody[]|undefined {
 const bound=capturedListLayouts.get(layout)
 return bound&&bound.source===source&&bound.doc===doc&&bound.roots===roots&&bound.lists===layout.lists?bound.emptyBodies:undefined
}

// Only copy boundaries and complete atomic endpoints have a raw insertion point.
function rawPoint(trace:SourceTrace,at:number):number|undefined {
 const points=new Set<number>()
 const index=firstPiece(trace,at)
 for(const p of [trace.pieces[index-1],trace.pieces[index]]){
  if(!p)continue
  if(p.kind==='generated')continue
  if(p.kind==='copy'&&p.from<=at&&at<=p.to)points.add(p.sourceFrom+at-p.from)
  else {if(p.from===at)points.add(p.sourceFrom);if(p.to===at)points.add(p.sourceTo)}
 }
 return points.size===1?[...points][0]:undefined
}
function emptyInline(collector:Capture,from:number,to=from,before='',after=''):EmptyPlace|undefined {
 const a=rawPoint(collector.trace,from),b=rawPoint(collector.trace,to)
 return a===undefined||b===undefined?undefined:{kind:'inline',range:{from:a,to:b},before,after}
}
function actualEol(collector:Capture,end:number):RawRange|undefined {
 return collector.trace.text[end]==='\n'?rawRange(collector.trace,end,end+1):undefined
}

/** Internal source-render guard; a missing capture fact is not permission. */
export function sourceRootHasClosedFences(root: SourceRoot): boolean {
  return capturedRootFencesClosed.get(root) === true
}

// markdown-it rule storage and ParseState are private APIs. Keep shape-sensitive
// access here and fail closed for capture if the installed contract changes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapCaptureRule(ruler: any, name: string, wrapper: (original: any, ...args: any[]) => any, preserveAlternates = false) {
  const original = ruler.__rules__?.find((rule: { name: string }) => rule.name === name)?.fn
  if (typeof original !== 'function') { captureAvailable = false; return }
  const alt = preserveAlternates ? ruler.__rules__.find((rule: { name: string }) => rule.name === name).alt.slice() : []
  ruler.at(name, (...args: any[]) => {
    const [state,line,,silent]=args,frame=containerFrames.get(state)?.at(-1)
    const read=ruler===md.block.ruler&&!silent&&frame?.kind==='list'?frame.current:undefined
    const index=state.tokens?.length
    const entry=read&&index===read.index+1?{from:state.bMarks[line]+state.tShift[line],end:state.eMarks[line]}:undefined
    const result=wrapper(original,...args)
    if(result&&entry&&state.tokens[index]&&state.tokens[index].map?.[0]===line){read!.body=entry.from;read!.e=entry.end}
    return result
  }, { alt })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collectorFor = (state: any): Capture | undefined => state.env?.[captureKey]
type NestedBlankRead={line:number;b:number;e:number;t:number;s:number;bs:number;lineMax:number;insertBefore:number;prefix:SourcePrefix;range:RawRange;eol?:RawRange}
type SeparatorToken={range:RawRange;side:'left'|'right';definition?:ProtectedSource}
const separatorTokens=new WeakMap<object,readonly SeparatorToken[]>()
const nestedBlanks=new WeakMap<object,readonly {place:EmptyPlace;level:number;line:number}[]>()
type ContainerRead={tokenizing?:boolean;blanks?:NestedBlankRead[];token:any;index:number;line:number;b:number;t:number;e:number;body?:number;prefix?:SourcePrefix;first?:any}
type ContainerFrame={kind:string;entryIndent:number;marker:number;prefix:SourcePrefix;reads:ContainerRead[];current?:ContainerRead}
const containerFrames=new WeakMap<object,ContainerFrame[]>()
const containerEnds=new WeakMap<object,{collector:Capture;place:EmptyPlace;kind:string}>()
function activePrefix(state:any):SourcePrefix {
 const frames=containerFrames.get(state),frame=frames?.[frames.length-1]
 return frame?.current?.prefix??frame?.prefix??[]
}
function observeOwnedBlank(actual:any,frame:ContainerFrame,collector:Capture,line:number):NestedBlankRead|undefined {
     if(line>=actual.lineMax)return
     const b=actual.bMarks[line],e=actual.eMarks[line],t=actual.tShift[line],s=actual.sCount[line],bs=actual.bsCount[line]
     const physical=collector.lineStarts[line]
     if(physical===undefined||b+t<e)return
     // A quote must actually have stripped a marker on this line. Other
     // containers own only continuation lines meeting their active indent.
     if(frame.kind==='blockquote'?(b<=physical||!actual.src.slice(physical,b).includes('>')):s<actual.blkIndent)return
     let body=b,width=0
     while(body<e&&width<actual.blkIndent){
      const ch=actual.src[body]
      if(ch===' ')width++
      else if(ch==='\t')width+=4-(width+bs)%4
      else if(body-b<t)width++
      else break
      body++
     }
     // A partial TAB expansion creates body padding without a raw boundary.
     if(width>actual.blkIndent)return
     const prefix=rawRange(collector.trace,physical,body),range=emptyInline(collector,body,e)
     if(!prefix||range?.kind!=='inline')return
     const eol=actualEol(collector,e)
     if(!eol&&e!==collector.trace.text.length)return
     return {line,b,e,t,s,bs,lineMax:actual.lineMax,insertBefore:actual.tokens.length,
      prefix:[prefix],range:range.range,...(eol?{eol}:{})}
}
// An instance-local facade observes the installed tokenizer exactly once.
function observeContainerTokenize(state:any):void {
 const engine=state.md,block=engine.block,facade=Object.create(engine),localBlock=Object.create(block)
 localBlock.tokenize=function(actual:any,start:number,end:number,...rest:any[]){
  const frames=containerFrames.get(actual),frame=frames?.[frames.length-1],collector=collectorFor(actual)
  if(frame&&collector){
   let read=frame.current
   if(frame.kind==='footnote_def'){
    const token=actual.tokens[actual.tokens.length-1]
    if(token?.type!=='footnote_reference_open')throw new UnsupportedSourceCapture()
    read={token,index:actual.tokens.length-1,line:start,b:actual.bMarks[start],t:actual.tShift[start],e:actual.eMarks[start]}
    frame.reads.push(read);frame.current=read
   }
   if(read){
    if(start!==read.line)throw new UnsupportedSourceCapture()
    read.body=actual.bMarks[start]+actual.tShift[start]
    if(frame.kind==='blockquote'){
     const raw=rawRange(collector.trace,frame.marker,actual.bMarks[start])
     if(raw)read.prefix=[...frame.prefix,raw]
    }else read.prefix=[...frame.prefix,{spaces:actual.blkIndent-frame.entryIndent}]
    const first=actual.tokens.length
    const skip=actual.skipEmptyLines,isEmpty=actual.isEmpty,blanks=new Map<number,NestedBlankRead>()
    const observe=(line:number)=>{
     if(frames?.at(-1)?.current!==read)return
     const blank=observeOwnedBlank(actual,frame,collector,line);if(blank)blanks.set(line,blank)
    }
    actual.skipEmptyLines=function(line:number){const result=skip.call(this,line);for(let n=line;n<result;n++)observe(n);return result}
    actual.isEmpty=function(line:number){const result=isEmpty.call(this,line);if(result)observe(line);return result}
    let result;read.tokenizing=true
    try{result=block.tokenize.call(block,actual,start,end,...rest)}finally{actual.skipEmptyLines=skip;actual.isEmpty=isEmpty;read.tokenizing=false}
    read.blanks=[...blanks.values()].filter(blank=>blank.line<actual.line)
    read.first=actual.tokens[first]
    return result
   }
  }
  return block.tokenize.call(block,actual,start,end,...rest)
 }
 facade.block=localBlock;state.md=facade
}
for(const name of ['list','blockquote','footnote_def'])wrapCaptureRule(md.block.ruler,name,(original,state,startLine,endLine,silent)=>{
 const collector=collectorFor(state)
 if(!collector||silent)return original(state,startLine,endLine,silent)
 let frames=containerFrames.get(state)
 if(!frames){frames=[];containerFrames.set(state,frames)}
 const frame:ContainerFrame={kind:name,entryIndent:state.blkIndent,marker:name==='blockquote'?state.bMarks[startLine]+state.tShift[startLine]:0,prefix:activePrefix(state),reads:[]}
 const push=state.push,engine=state.md,isEmpty=state.isEmpty,outer=frames.length===0
 if(outer)observeContainerTokenize(state)
 frames.push(frame)
 state.push=function(type:string,...args:any[]){
  const token=push.call(this,type,...args)
  if(frames![frames!.length-1]===frame&&((name==='list'&&type==='list_item_open')||(name==='blockquote'&&type==='blockquote_open'))){
   const line=name==='blockquote'?startLine:this.line
   const read:ContainerRead={token,index:this.tokens.length-1,line,b:this.bMarks[line],t:this.tShift[line],e:this.eMarks[line]}
   frame.reads.push(read);frame.current=read
  }
  return token
 }
 state.isEmpty=function(line:number){
  const result=isEmpty.call(this,line),read=frame.current
  if(result&&name==='list'&&frames!.at(-1)===frame&&read&&!read.tokenizing){
   const blank=observeOwnedBlank(this,frame,collector,line)
   if(blank)read.blanks=[...(read.blanks??[]).filter(item=>item.line!==line),blank]
  }
  return result
 }
 let result
 try{result=original(state,startLine,endLine,silent)}finally{state.isEmpty=isEmpty;state.push=push;frames.pop();if(outer)state.md=engine}
 if(!result)return result
 for(const read of frame.reads){
  const token=read.token,index=read.index
  if(name==='footnote_def')token.map=[startLine,state.line]
  if(token.map?.[0]!==read.line||state.tokens[index]!==token)throw new UnsupportedSourceCapture()
  let close=index+1,depth=1
  for(;close<state.tokens.length;close++){depth+=state.tokens[close].nesting;if(depth===0)break}
  const last=state.tokens[close]
  if(last?.type!==token.type.replace('_open','_close'))throw new UnsupportedSourceCapture()
  let place:EmptyPlace|undefined
  if(close===index+1){
   let from=read.b
   if(name==='list'){
    const marker=String(token.info??'')+token.markup,start=read.b+read.t
    if(state.src.slice(start,start+marker.length)!==marker)throw new UnsupportedSourceCapture()
    from=start+marker.length
    const padding=state.src.slice(from,read.e)
    if(/^[ \t]*$/.test(padding)){
     if(padding[0]===' ')from++
     place=emptyInline(collector,from,read.e,from===start+marker.length?' ':'')
    }
   }else{
    from=name==='blockquote'?read.b:read.body??read.b
    if(/^[ \t]*$/.test(state.src.slice(from,read.e)))place=emptyInline(collector,from,read.e)
   }
  }else if(name==='list'&&read.first&&read.first===state.tokens[index+1]&&read.first.type!=='paragraph_open'&&read.body!==undefined&&read.prefix){
   const at=rawPoint(collector.trace,read.body)
   if(at!==undefined)place={kind:'prepend',at,eol:actualEol(collector,read.e),continuation:read.prefix}
  }
  // A marker-only list line has no owned blank because its required padding
  // is generated. Its actual EOL and continuation still certify the separator.
  if(name==='list'&&place?.kind==='inline'&&place.before&&read.prefix){
   const eol=actualEol(collector,read.e)
   if(eol&&place.range.to===eol.from&&collector.protectedSources.some(p=>p.sourceFrom===eol.to)){
    const prefix=read.prefix.map(p=>'spaces' in p?' '.repeat(p.spaces):collector.source.slice(p.from,p.to)).join('')
    place={...place,after:collector.source.slice(eol.from,eol.to)+prefix}
   }
  }
  if(place)containerEnds.set(last,{collector,place,kind:name==='list'?'list_item':name==='blockquote'?'blockquote':'footnote_definition'})
  const children:{from:number;to:number;index:number}[]=[]
  for(let i=index+1;i<close;i++){
   const child=state.tokens[i]
   if(child.level!==token.level+1||child.nesting===-1||!child.map)continue
   children.push({from:child.map[0],to:child.map[1],index:i})
  }
  const blanks=(read.blanks??[]).filter(blank=>blank.line>=token.map[0]&&blank.line<token.map[1]
   &&!children.some(child=>child.from<=blank.line&&blank.line<child.to)
   &&!collector.protectedSources.some(p=>p.sourceFrom< (blank.eol?.to??blank.range.to)&&p.sourceTo>blank.range.from))
  if(!children.length&&blanks.some(blank=>blank.line!==read.line)&&place){
   nestedBlanks.set(last,[{level:token.level+1,place,line:read.line}]);containerEnds.delete(last)
  }
  let priorRight:number|undefined,definitionLeft=false,definitionRight=false
  for(const [blankIndex,blank] of blanks.entries()){
   const previous=blanks[blankIndex-1]
   const firstInRun=!previous||previous.line+1!==blank.line
   let lastInRun=blank
   for(let next=blankIndex+1;firstInRun&&blanks[next]?.line===lastInRun.line+1;next++)lastInRun=blanks[next]!
   const begin=blank.prefix[0],end=lastInRun.eol?.to??lastInRun.range.to
   if(firstInRun){
    definitionLeft=!!begin&&'from' in begin&&collector.protectedSources.some(p=>p.sourceTo===begin.from)
    definitionRight=collector.protectedSources.some(p=>p.sourceFrom===end)
   }
   const touchesDefinition=firstInRun&&(definitionLeft||definitionRight)
   const left=children.filter(child=>child.to<=blank.line).at(-1),right=children.find(child=>child.from>blank.line)
   // First between-body blank is the separator; empty-only baseline is
   // emitted by the schema and already certified at the actual close token.
   if(touchesDefinition){
    // The schema-filled baseline is also a real empty body. Keep the
    // definition separator proved by this owned blank on that same fact.
    if(!children.length&&blank.line===read.line&&place?.kind==='inline'
     &&place.range.from===blank.range.from&&place.range.to===blank.range.to){
     const baseline:EmptyPlace={kind:'nested-blank',range:blank.range,
      prefix:name!=='blockquote'&&read.prefix?read.prefix:blank.prefix,
      ...(blank.eol?{eol:blank.eol}:{}),leftBody:definitionLeft,rightBody:definitionRight,leftSeparator:true}
     const pending=nestedBlanks.get(last)
     if(pending)nestedBlanks.set(last,pending.map(item=>item.place===place?{...item,place:baseline}:item))
     else containerEnds.set(last,{collector,place:baseline,kind:name==='list'?'list_item':name==='blockquote'?'blockquote':'footnote_definition'})
    }
    const begin=blank.prefix[0]
    const definition=definitionRight&&!definitionLeft?collector.protectedSources.find(p=>p.sourceFrom===end):definitionLeft&&!definitionRight&&begin&&'from' in begin?collector.protectedSources.find(p=>p.sourceTo===begin.from):undefined
    const side=definitionRight?'left':'right',child=definitionRight?left:right,target=child&&state.tokens[child.index+1]
    if(definition&&target?.type==='inline'&&blank.prefix.length===1&&begin&&'from' in begin&&begin.to===blank.range.from&&blank.eol?.from===blank.range.to){
     const range={from:begin.from,to:blank.eol.to}
     separatorTokens.set(target,[...(separatorTokens.get(target)??[]),{range,side,definition}])
    }
    priorRight=right?.index;continue
   }
   if(name==='list'&&place?.kind==='prepend'&&!left&&blank===blanks[0])continue
   if(left&&right&&priorRight!==right.index){
    const leftInline=state.tokens[left.index+1],rightInline=state.tokens[right.index+1],begin=blank.prefix[0]
    // This exact consumed line has no PM paragraph: it separates two real
    // bodies. Record both token relationships, never infer it from an empty fact.
    if(leftInline?.type==='inline'&&rightInline?.type==='inline'&&blank.prefix.length===1&&begin&&'from' in begin&&begin.to===blank.range.from&&blank.eol?.from===blank.range.to){
     const range={from:begin.from,to:blank.eol.to}
     for(const [target,side] of [[leftInline,'left'],[rightInline,'right']] as const)separatorTokens.set(target,[...(separatorTokens.get(target)??[]),{range,side}])
    }
    priorRight=right.index;continue
   }
   if(!children.length&&blank.line===read.line)continue
   const before=right?.index??close,target=state.tokens[before]
   const items=[...(nestedBlanks.get(target)??[])]
   items.push({level:token.level+1,line:blank.line,place:{kind:'nested-blank',range:blank.range,prefix:blank.line===read.line&&name!=='blockquote'&&read.prefix?read.prefix:blank.prefix,
    ...(blank.eol?{eol:blank.eol}:{}),leftBody:!!left||definitionLeft,rightBody:!!right||definitionRight,leftSeparator:definitionLeft||definitionRight}})
   nestedBlanks.set(target,items)
  }
 }
 return result
},true)
function captureContainerEmission(state:any,token:any,delegate:()=>void):void {
 const fact=containerEnds.get(token)
 if(!fact){delegate();return}
 const outer=state.stack[state.stack.length-2],slot=outer?.content.length
 delegate()
 const node:PmNode|undefined=outer?.content[slot]
 if(!node||node.type.name!==fact.kind)return
 const parent=node.firstChild
 if(!parent||parent.type.name!=='paragraph'||parent.content.size||!parent.hasMarkup(parent.type))return
 fact.collector.emissions.push({from:0,to:0,kind:'paragraph',runFrom:fact.collector.runs.length,runTo:fact.collector.runs.length,node:parent,empty:fact.place})
}
wrapCaptureRule(md.block.ruler, 'fence', (original, state, startLine, endLine, silent) => {
  if (!collectorFor(state) || silent) return original(state, startLine, endLine, silent)
  const originalGetLines = state.getLines, descriptor = Object.getOwnPropertyDescriptor(state, 'getLines')
  if (typeof originalGetLines !== 'function' || descriptor?.configurable === false) throw new UnsupportedSourceCapture()
  const tokenStart = state.tokens.length
  let contentEnd: number | undefined, bodyTrace:SourceTrace|undefined,empty:EmptyPlace|undefined,bodyUnstripped=false
  Object.defineProperty(state, 'getLines', {
    configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false,
    value: function (this: unknown, begin: number, end: number, indent: number, keepLastLF: boolean) {
      if (this !== state || contentEnd !== undefined || begin !== startLine + 1
        || !Number.isInteger(end) || end < begin || end > endLine || keepLastLF !== true) throw new UnsupportedSourceCapture()
      contentEnd = end
      const read:LineRead={begin,end,indent,keepLastLF,rows:Array.from({length:end-begin},(_,i)=>{
        const line=begin+i;return {b:state.bMarks[line],e:state.eMarks[line],t:state.tShift[line],bs:state.bsCount[line]}
      })}
      const value=originalGetLines.call(this,begin,end,indent,keepLastLF)
      bodyTrace=traceConsumedLines(collectorFor(state)!.trace,read,value)
      bodyUnstripped=!!bodyTrace&&bodyTrace.pieces.length>0&&bodyTrace.pieces[0]!.sourceFrom===rawPoint(collectorFor(state)!.trace,state.bMarks[begin])
        &&bodyTrace.pieces.every((p,i)=>p.kind!=='generated'&&(!i||bodyTrace!.pieces[i-1]!.sourceTo===p.sourceFrom))
      empty=emptyLiteral(state,startLine,end,indent,value)
      return value
    },
  })
  let result
  try { result = original(state, startLine, endLine, silent) } finally {
    if (descriptor) Object.defineProperty(state, 'getLines', descriptor)
    else delete state.getLines
  }
  if (result) {
    const tokens = state.tokens.slice(tokenStart), token = tokens[0]
    if (tokens.length !== 1 || token?.type !== 'fence' || contentEnd === undefined
      || token.map?.[0] !== startLine || token.map?.[1] !== state.line
      || (state.line !== contentEnd && state.line !== contentEnd + 1)) throw new UnsupportedSourceCapture()
    capturedFenceClosed.set(token, state.line === contentEnd + 1)
    if(state.line===contentEnd+1){
      const collector=collectorFor(state)!,a=state.bMarks[startLine]+state.tShift[startLine],b=state.bMarks[contentEnd]+state.tShift[contentEnd]
      const character=token.markup[0] as '`'|'~';let end=b
      while(state.src[end]===character)end++
      const open=rawRange(collector.trace,a,a+token.markup.length),close=rawRange(collector.trace,b,end)
      const whole=rawRange(collector.trace,collector.lineStarts[startLine]!,collector.lineStarts[state.line]!),eol=actualEol(collector,state.eMarks[startLine])
      if(open&&close&&whole&&eol&&close.to-close.from>=token.markup.length)
        fenceTokens.set(token,{sourceFrom:whole.from,sourceTo:whole.to,open,close,character,openLength:token.markup.length,closeLength:close.to-close.from,eol:collector.source.slice(eol.from,eol.to) as '\n'|'\r\n'|'\r',contiguousTopLevel:token.level===0&&bodyUnstripped})
    }
    if(bodyTrace)literalFacts.set(token,{collector:collectorFor(state)!,trace:bodyTrace,kind:token.type,...(state.line===contentEnd+1&&empty?{empty}:{})})
  } else if (contentEnd !== undefined) throw new UnsupportedSourceCapture()
  return result
},true)
// Capture the installed literal getLines call while container line tables are active.
for(const name of ['code','html_block'])wrapCaptureRule(md.block.ruler,name,(original,state,...args)=>{
  const collector=collectorFor(state)
  if(!collector)return original(state,...args)
  const getLines=state.getLines,descriptor=Object.getOwnPropertyDescriptor(state,'getLines'),start=state.tokens.length
  let bodyTrace:SourceTrace|undefined
  state.getLines=function(begin:number,end:number,indent:number,keepLastLF:boolean){
    const read:LineRead={begin,end,indent,keepLastLF,rows:Array.from({length:end-begin},(_,i)=>{
      const line=begin+i;return {b:this.bMarks[line],e:this.eMarks[line],t:this.tShift[line],bs:this.bsCount[line]}
    })}
    const value=getLines.call(this,begin,end,indent,keepLastLF)
    bodyTrace=traceConsumedLines(collector.trace,read,value)
    return value
  }
  let result
  try{result=original(state,...args)}finally{
    if(descriptor)Object.defineProperty(state,'getLines',descriptor)
    else delete state.getLines
  }
  const added=state.tokens.slice(start),token=added[0]
  if(result&&added.length===1&&bodyTrace&&token.type===(name==='code'?'code_block':'html_block')){
    // code's final LF is generated by the rule and removed by the PM handler.
    if(name==='code')bodyTrace={text:bodyTrace.text+'\n',pieces:[...bodyTrace.pieces,
      {from:bodyTrace.text.length,to:bodyTrace.text.length+1,sourceFrom:0,sourceTo:0,kind:'generated'}]}
    if(bodyTrace.text===token.content)literalFacts.set(token,{collector,trace:bodyTrace,kind:token.type})
  }
  return result
},true)
wrapCaptureRule(md.block.ruler,'table',(original,state,...args)=>{
  const collector=collectorFor(state),start=state.tokens.length
  const result=original(state,...args)
  if(!collector||!result)return result
  const tokens=state.tokens.slice(start)
  for(let i=0;i<tokens.length;i++){
    const row=tokens[i]
    if(row.type!=='tr_open'||!row.map)continue
    const slots:InlineToken[]=[]
    let j=i+1
    for(;j<tokens.length&&tokens[j].type!=='tr_close';j+=3){
      if(!['th_open','td_open'].includes(tokens[j]?.type)||tokens[j+1]?.type!=='inline'
        ||tokens[j+2]?.type!==tokens[j].type.replace('_open','_close'))throw new UnsupportedSourceCapture()
      slots.push(tokens[j+1])
    }
    if(tokens[j]?.type!=='tr_close')throw new UnsupportedSourceCapture()
    const line=row.map[0]
    const projected=traceTableRow(collector.trace,state.bMarks[line]+state.tShift[line],state.eMarks[line],slots.map(t=>t.content),slot=>{
      const at=rawPoint(collector.trace,slot.missing?slot.rowEnd:slot.from)
      if(at===undefined)return
      const empty:EmptyPlace=slot.missing?{kind:'missing-cell',at,row:line,slot:slot.slot,present:slot.present,closingPipe:slot.closingPipe}
        :{kind:'inline',range:{from:at,to:at},before:'',after:''}
      inlineFacts.set(slots[slot.slot]!,{collector,empty})
    })
    if(projected)slots.forEach((token,k)=>{const trace=projected[k];if(trace)bindInlineTrace(token,collector,trace,'table-cell')})
    i=j
  }
  return result
},true)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inlineEngine = md.inline as any
const OriginalInlineState = inlineEngine.State
if (typeof OriginalInlineState !== 'function') captureAvailable = false
inlineEngine.State = function (...args: unknown[]) {
  const state = new OriginalInlineState(...args)
  const collector = collectorFor(state)
  const owner = owners.get(args[3] as object)
  if (collector && owner) {
    if (state.src !== owner.text || state.tokens !== args[3] || typeof state.pending !== 'string'
      || typeof state.pushPending !== 'function') throw new UnsupportedSourceCapture()
    inlineStateOwners.set(state, owner)
    pendingSources.set(state, [])
    const pushPending = state.pushPending.bind(state)
    state.pushPending = () => {
      const token = pushPending()
      tokenSources.set(token, { collector, runs: pendingSources.get(state)! })
      pendingSources.set(state, [])
      return token
    }
  }
  return state
}
wrapCaptureRule(md.core.ruler, 'normalize', (original, state) => {
  const collector = collectorFor(state)
  if (!collector) return original(state)
  if (state.src !== collector.trace.text) throw new UnsupportedSourceCapture()
  const projection = projectLineEndings(state.src)
  collector.trace = editTrace(collector.trace, projection.changes.map(c => ({
    from: c.sourceFrom, to: c.sourceTo, text: '\n',
  })))
  const nulEdits: TraceEdit[] = []
  for (let i = 0; i < collector.trace.text.length; i++) {
    if (collector.trace.text[i] === '\0') nulEdits.push({ from: i, to: i + 1, text: '\uFFFD' })
  }
  collector.trace = editTrace(collector.trace, nulEdits)
  const result = original(state)
  if (state.src !== collector.trace.text) throw new UnsupportedSourceCapture()
  collector.lineStarts = lineStarts(collector.trace.text)
  return result
})
wrapCaptureRule(md.block.ruler, 'reference', function observeReferenceCandidate(original, state, startLine, endLine, silent) {
  const collector = collectorFor(state)
  if (!collector || silent) return original(state, startLine, endLine, silent)
  const scope = state.level === 0 && state.blkIndent === 0 ? 'top-level' : 'nested'
  const had = Object.hasOwn(state.env, 'references'), saved = state.env.references
  const candidates: Record<string, { href: string; title: string }> = {}
  state.env.references = candidates
  let result
  try { result = original(state, startLine, endLine, silent) } finally {
    if (had) state.env.references = saved
    else delete state.env.references
  }
  if (!result) return result
  const entries = Object.entries(candidates)
  if (entries.length !== 1) throw new UnsupportedSourceCapture()
  const [label, value] = entries[0]!
  if (typeof state.env.references === 'undefined') state.env.references = {}
  if (typeof state.env.references[label] === 'undefined') state.env.references[label] = value
  const from = collector.lineStarts[startLine], to = collector.lineStarts[state.line]
  if (from === undefined || to === undefined || to <= from) throw new UnsupportedSourceCapture()
  const raw = rawRange(collector.trace, from, to)
  if (raw) {
    const previous = collector.protectedSources[collector.protectedSources.length - 1]
    if (previous && previous.sourceTo > raw.from) throw new UnsupportedSourceCapture()
    collector.protectedSources.push(Object.freeze({ kind: 'reference-definition', sourceFrom: raw.from, sourceTo: raw.to, scope }))
    collector.file?.definitions.push({ kind: 'reference', label, href: value.href, title: value.title,
      sourceFrom: raw.from, sourceTo: raw.to, scope })
  }
  return result
})
function bindInlineTrace(token:any,collector:Capture,trace:SourceTrace,kind:InlineBody['kind']):void {
  if(trace.text!==token.content||!Array.isArray(token.children))throw new UnsupportedSourceCapture()
  owners.set(token.children,trace);tokenArrays.set(token,token.children)
  inlineFacts.set(token,{...inlineFacts.get(token),collector,trace,kind})
}
for(const name of ['paragraph','lheading'])wrapCaptureRule(md.block.ruler,name,(original,state,...args)=>{
  const collector=collectorFor(state)
  if(!collector)return original(state,...args)
  const level=state.level,originalGetLines=state.getLines,start=state.tokens.length
  if(typeof originalGetLines!=='function'||!Array.isArray(state.bMarks)||!Array.isArray(state.eMarks))throw new UnsupportedSourceCapture()
  let capturedLines:SourceTrace|undefined,terminal:string|undefined,trimEnd:number|undefined
  state.getLines=function(begin:number,end:number,indent:number,keepLastLF:boolean){
    const read:LineRead={begin,end,indent,keepLastLF,rows:Array.from({length:end-begin},(_,i)=>{
      const line=begin+i;return {b:this.bMarks[line],e:this.eMarks[line],t:this.tShift[line],bs:this.bsCount[line]}
    })}
    const value:string=originalGetLines.call(this,begin,end,indent,keepLastLF)
    let part=traceConsumedLines(collector.trace,read,value)
    if(!part)throw new UnsupportedSourceCapture()
    const endOfLine=read.rows[read.rows.length-1]?.e
    if(endOfLine!==undefined)trimEnd=rawPoint(collector.trace,endOfLine)
    let slashes=0
    for(let i=value.length-1;i>=0&&value[i]==='\\';i--)slashes++
    const restore=name==='paragraph'&&!keepLastLF&&endOfLine!==undefined&&this.src[endOfLine]==='\n'
      &&(value.endsWith('  ')||slashes%2===1)
    const left=value.length-value.trimStart().length
    if(restore){
      const eol=sliceTrace(collector.trace,endOfLine!,endOfLine!+1)
      part={text:part.text+eol.text,pieces:[...part.pieces,...eol.pieces.map(p=>({...p,from:p.from+value.length,to:p.to+value.length}))]}
      terminal=value.trimStart()+'\n'
    }
    capturedLines=sliceTrace(part,left,restore?part.text.length:left+value.trim().length)
    return value
  }
  let result
  try{result=original(state,...args)}finally{state.getLines=originalGetLines}
  if(result)for(const token of state.tokens.slice(start)){
    if(token.type!=='inline'||token.level!==level+1)continue
    if(terminal!==undefined)token.content=terminal
    if(!capturedLines)throw new UnsupportedSourceCapture()
    bindInlineTrace(token,collector,capturedLines,name==='paragraph'?'paragraph':'heading')
    if(trimEnd!==undefined)inlineFacts.set(token,{...inlineFacts.get(token)!,trimEnd})
  }
  return result
},true)
wrapCaptureRule(md.block.ruler,'heading',(original,state,startLine,endLine,silent)=>{
  const collector=collectorFor(state)
  if(!collector||silent)return original(state,startLine,endLine,silent)
  const start=state.tokens.length
  // Observe the original rule's actual tail-boundary calls; do not search text.
  const spaces=state.skipSpacesBack,chars=state.skipCharsBack
  let spacesEnd:number|undefined,charsEnd:number|undefined,bodyFrom:number|undefined
  state.skipSpacesBack=function(...args:any[]){bodyFrom=args[1];return spacesEnd=spaces.apply(this,args)}
  state.skipCharsBack=function(...args:any[]){return charsEnd=chars.apply(this,args)}
  let result
  try{result=original(state,startLine,endLine,silent)}finally{state.skipSpacesBack=spaces;state.skipCharsBack=chars}
  if(result){
    const [open,token]=state.tokens.slice(start),from=bodyFrom!
    if(open.type!=='heading_open'||token.type!=='inline'||token.level!==open.level+1||spacesEnd===undefined||charsEnd===undefined||bodyFrom===undefined)throw new UnsupportedSourceCapture()
    const end=charsEnd>from&&/[ \t]/.test(state.src[charsEnd-1])?charsEnd:spacesEnd
    const part=sliceTrace(collector.trace,from,end),left=part.text.length-part.text.trimStart().length
    bindInlineTrace(token,collector,sliceTrace(part,left,left+part.text.trim().length),'heading')
    if(token.content===''){
      const closing=charsEnd<spacesEnd,at=closing?Math.min(from+1,charsEnd):state.eMarks[startLine]
      const empty=emptyInline(collector,at,at,at===from?' ':'',closing&&at===charsEnd?' ':'')
      if(empty)inlineFacts.set(token,{...inlineFacts.get(token)!,empty})
    }
  }
  return result
},true)
wrapCaptureRule(md.core.ruler, 'inline', (original, state) => {
  if (!collectorFor(state)) return original(state)
  const collector = collectorFor(state)!
  if (collector.file) collector.file.blockTokens = cloneTokenBatch(state.tokens, collector)
  const mapped = state.tokens.filter((token: object) => tokenArrays.has(token))
  const check = () => {
    for (const token of mapped) {
      if (!Array.isArray(token.children) || token.children !== tokenArrays.get(token)) throw new UnsupportedSourceCapture()
    }
  }
  check()
  const result = original(state)
  check()
  return result
})
// The installed newline rule removes trailing U+0020 before pushPending.
// Mirror only that declared consumption so text before the break stays writable.
wrapCaptureRule(md.inline.ruler, 'newline', (original, state, silent) => {
  if (silent || !inlineStateOwners.has(state) || state.src[state.pos] !== '\n') return original(state, silent)
  let end = state.pending.length
  while (end > 0 && state.pending[end - 1] === ' ') end--
  const expected = state.pending.slice(0, end)
  let trim = state.pending.length - end
  const syntaxFrom=state.pos-trim,syntaxTo=state.pos+1
  const runs = pendingSources.get(state)!
  while (trim > 0 && runs.length) {
    const run = runs.pop()!
    if (run.text.length <= trim) { trim -= run.text.length; continue }
    const keep = run.text.length - trim
    runs.push(run.trace && run.kind === 'linear'
      ? { text: run.text.slice(0, keep), kind: 'linear', trace: sliceTrace(run.trace, 0, keep) }
      : { text: run.text.slice(0, keep) })
    trim = 0
  }
  if (trim || runs.map(run => run.text).join('') !== expected) throw new UnsupportedSourceCapture()
  const start = state.tokens.length
  const result = original(state, silent)
  if (!result || state.pending !== '' || (expected && (state.tokens[start]?.type !== 'text'
    || state.tokens[start].content !== expected))) throw new UnsupportedSourceCapture()
  const token=state.tokens.at(-1),owner=inlineStateOwners.get(state)!
  if(token?.type==='hardbreak'||token?.type==='softbreak'){const raw=rawRange(owner,syntaxFrom,syntaxTo);if(raw)atomTokenRanges.set(token,raw)}
  return result
})
// Both unclosed-backtick paths append the literal marker to pending directly.
// Capture that declared addition; matched code remains an opaque node/mark.
wrapCaptureRule(md.inline.ruler, 'backticks', (original, state, silent) => {
  const owner = inlineStateOwners.get(state)
  if (silent || !owner || state.src[state.pos] !== '`') return original(state, silent)
  const from = state.pos, pending = state.pending, tokenCount = state.tokens.length
  if (!Number.isInteger(state.posMax) || state.posMax <= from || state.posMax > state.src.length) {
    throw new UnsupportedSourceCapture()
  }
  let end = from + 1
  while (end < state.posMax && state.src[end] === '`') end++
  const marker = state.src.slice(from, end)
  const result = original(state, silent)
  if (!result) throw new UnsupportedSourceCapture()
  if (state.pos === end) {
    if (state.backticksScanned !== true || state.pending !== pending + marker || state.tokens.length !== tokenCount) {
      throw new UnsupportedSourceCapture()
    }
    pendingSources.get(state)!.push({ text: marker, kind: 'linear', trace: sliceTrace(owner, from, end) })
  }
  if(state.pos>end){
    const token=state.tokens.at(-1)
    if(token?.type!=='code_inline')throw new UnsupportedSourceCapture()
    let a=end,b=state.pos-marker.length
    const normalized=state.src.slice(a,b).replace(/\n/g,' ')
    if(/^ (.+) $/.test(normalized)){a++;b--}
    const runs:SourceRun[]=[]
    for(let i=a;i<b;i++)runs.push({text:state.src[i]==='\n'?' ':state.src[i],kind:state.src[i]==='\n'?'atomic':'linear',trace:sliceTrace(owner,i,i+1)})
    if(runs.map(r=>r.text).join('')!==token.content)throw new UnsupportedSourceCapture()
    tokenSources.set(token,{collector:collectorFor(state)!,runs})
    const open=rawRange(owner,from,a),close=rawRange(owner,b,state.pos)
    if(open&&close)edgeTokens.set(token,{open,close,side:'code'})
  }
  return result
})
wrapCaptureRule(md.inline.ruler, 'text', (original, state, silent) => {
  const from = state.pos
  const ok = original(state, silent)
  const owner = inlineStateOwners.get(state)
  if (ok && !silent && owner) {
    pendingSources.get(state)!.push({ trace: sliceTrace(owner, from, state.pos), text: state.src.slice(from, state.pos), kind: 'linear' })
  }
  return ok
})
for (const name of ['entity', 'escape']) {
  wrapCaptureRule(md.inline.ruler, name, (original, state, silent) => {
    const from = state.pos
    const ok = original(state, silent)
    const collector = collectorFor(state)
    const owner = inlineStateOwners.get(state)
    if (ok && !silent && collector && owner) {
      const token = state.tokens[state.tokens.length - 1]
      if(name==='escape'&&token.type==='hardbreak'){const raw=rawRange(owner,from,from+2);if(raw)atomTokenRanges.set(token,raw)}
      if (token.type === 'text_special') tokenSources.set(token, { collector,
        runs: [{ trace: sliceTrace(owner, from, state.pos), text: token.content, kind: 'atomic' }] })
    }
    return ok
  })
}
wrapCaptureRule(md.inline.ruler, 'emphasis', (original, state, silent) => {
  const from = state.pos
  const ok = original(state, silent)
  const collector = collectorFor(state)
  const owner = inlineStateOwners.get(state)
  if (ok && !silent && collector && owner) {
    const count = state.pos - from
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state.tokens.slice(-count).forEach((token: any, i: number) => tokenSources.set(token, { collector,
      runs: [{ trace: sliceTrace(owner, from + i, from + i + 1), text: token.content, kind: 'linear' }] }))
  }
  return ok
})
function registerEdge(opened:object,closed:object,trace:SourceTrace,a:number,b:number,c:number,d:number):void {
 const open=rawRange(trace,a,b),close=rawRange(trace,c,d)
 if(open&&close){edgeTokens.set(opened,{open,close,side:'open'});edgeTokens.set(closed,{open,close,side:'close'})}
}
for(const name of ['strikethrough','mark'])wrapCaptureRule(md.inline.ruler,name,(original,state,silent)=>{
 const from=state.pos,before=state.tokens.length,ok=original(state,silent),trace=inlineStateOwners.get(state),collector=collectorFor(state)
 if(ok&&!silent&&trace&&collector){
  let at=from
  for(const token of state.tokens.slice(before))if(token.type==='text'&&token.content&&/^[~=]+$/.test(token.content)){
   tokenSources.set(token,{collector,runs:[{text:token.content,kind:'linear',trace:sliceTrace(trace,at,at+token.content.length)}]});at+=token.content.length
  }
 }
 return ok
})
for(const name of ['emphasis','strikethrough','mark'])wrapCaptureRule(md.inline.ruler2,name,(original,state)=>{
 const collector=collectorFor(state)
 if(!collector)return original(state)
 const pairs:{o:any;c:any;open:{from:number;to:number};close:{from:number;to:number}}[]=[]
 for(const ds of [state.delimiters,...state.tokens_meta.map((m:any)=>m?.delimiters).filter(Boolean)])for(const d of ds){
  if(d.end<0)continue
  const o=state.tokens[d.token],c=state.tokens[ds[d.end].token]
  const a=tokenSources.get(o)?.runs[0]?.trace,b=tokenSources.get(c)?.runs[0]?.trace
  const open=a&&rawRange(a,0,a.text.length),close=b&&rawRange(b,0,b.text.length)
  if(open&&close)pairs.push({o,c,open,close})
 }
 const result=original(state)
 for(const p of pairs)if(p.o.nesting===1&&p.c.nesting===-1){
  let open=p.open,close=p.close
  if(p.o.type==='strong_open'){
   const neighbor=pairs.find(q=>q.open.to===open.from&&q.close.from===close.to&&q.o.content==='')
   if(!neighbor)continue
   open={from:neighbor.open.from,to:open.to};close={from:close.from,to:neighbor.close.to}
  }
  edgeTokens.set(p.o,{open,close,side:'open'});edgeTokens.set(p.c,{open,close,side:'close'})
 }
 return result
})
// Read-only whole occurrence authority from the installed successful rule.
// No math delimiters or payload are parsed again, and no text span is granted.
for(const name of ['math_inline','math_inline_double','footnote_ref','footnote_ref_orphan'])wrapCaptureRule(md.inline.ruler,name,(original,state,silent)=>{
 const from=state.pos,result=original(state,silent),trace=inlineStateOwners.get(state)
 if(result&&!silent&&trace){
  const token=state.tokens.at(-1),view=sliceTrace(trace,from,state.pos)
  if(token?.type===(name==='footnote_ref_orphan'?'footnote_ref':name)&&view.pieces.length&&view.pieces.every((p,i)=>p.kind!=='generated'&&(!i||view.pieces[i-1]!.sourceTo===p.sourceFrom))){
   const raw=rawRange(trace,from,state.pos);if(raw)atomTokenRanges.set(token,raw)
  }
 }
 return result
})
wrapCaptureRule(md.inline.ruler,'html_inline',(original,state,silent)=>{
 const start=state.pos,result=original(state,silent),trace=inlineStateOwners.get(state)
 if(result&&!silent&&trace){const token=state.tokens.at(-1),range=rawRange(trace,start,state.pos);if(token?.type==='html_inline'&&range)htmlTokenRanges.set(token,range)}
 return result
})
wrapCaptureRule(md.inline.ruler,'link',(original,state,silent)=>{
 const trace=inlineStateOwners.get(state)
 if(silent||!trace)return original(state,silent)
 const start=state.pos,before=state.tokens.length,tokenize=state.md.inline.tokenize
 let label:{from:number;to:number}|undefined
 state.md.inline.tokenize=function(current:any){if(current===state&&!label)label={from:current.pos,to:current.posMax};return tokenize.call(this,current)}
 let result;try{result=original(state,silent)}finally{state.md.inline.tokenize=tokenize}
 if(result&&label){
  const opened=state.tokens.slice(before).find((t:any)=>t.type==='link_open'),closed=state.tokens.at(-1)
  if(opened&&closed?.type==='link_close')registerEdge(opened,closed,trace,start,label.from,label.to,state.pos)
 }
 return result
})
md.inline.ruler.push('source_capture_fallback', (state, silent) => {
  const owner = inlineStateOwners.get(state)
  if (silent || !owner) return false
  const from = state.pos++
  const text = state.src.slice(from, state.pos)
  state.pending += text
  pendingSources.get(state)!.push({ trace: sliceTrace(owner, from, state.pos), text, kind: 'linear' })
  return true
})
// Both installed join rules collapse adjacent text into the last surviving token.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function captureJoin(tokens: any[], collector: Capture, special: boolean) {
  let runs: SourceRun[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type !== 'text' && !(special && token.type === 'text_special')) continue
    if (token.content) for (const run of tokenSources.get(token)?.runs ?? [{ text: token.content }]) runs.push(run)
    const next = tokens[i + 1]
    if (!next || (next.type !== 'text' && !(special && next.type === 'text_special'))) {
      // Only the last token survives the installed join rule. Earlier tokens
      // must not retain successively copied prefixes (or share a growing array).
      tokenSources.set(token, { collector, runs })
      runs = []
    }
  }
}
wrapCaptureRule(md.inline.ruler2, 'fragments_join', (original, state) => {
  const collector = collectorFor(state)
  if (collector && inlineStateOwners.has(state)) captureJoin(state.tokens, collector, false)
  return original(state)
})
wrapCaptureRule(md.core.ruler, 'text_join', (original, state) => {
  const collector = collectorFor(state)
  if (collector) for (const token of state.tokens) {
    if (token.type === 'inline') captureJoin(token.children, collector, true)
  }
  return original(state)
})

// Installed MarkdownParseState appends content, except addText may replace
// the last text node with a merged immutable node. Closed frames are popped;
// their completed node is appended to the parent. Account for each new child
// once and re-read only the mutable tail, never the completed prefix.
const frameSizes = new WeakMap<object, { content: PmNode[]; length: number; size: number; tailSize: number }>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function captureCursor(state: any): number {
  if (!Array.isArray(state.stack) || !state.stack.length) throw new UnsupportedSourceCapture()
  let pos = state.stack.length - 1
  for (const frame of state.stack) {
    if (!Array.isArray(frame.content) || !Array.isArray(frame.marks)) throw new UnsupportedSourceCapture()
    const content: PmNode[] = frame.content
    const previous = frameSizes.get(frame)
    if (previous && (previous.content !== content || content.length < previous.length)) throw new UnsupportedSourceCapture()
    let size = previous ? previous.size - previous.tailSize : 0
    let tailSize = 0
    for (let i = previous ? Math.max(0, previous.length - 1) : 0; i < content.length; i++) {
      tailSize = content[i]!.nodeSize
      size += tailSize
    }
    frameSizes.set(frame, { content, length: content.length, size, tailSize })
    pos += size
  }
  return pos
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function captureText(state: any, token: any, delegate: () => void) {
  const provenance = tokenSources.get(token)
  if (!provenance) { delegate(); return }
  const { collector, runs } = provenance
  if (runs.map(run => run.text).join('') !== token.content) throw new UnsupportedSourceCapture()
  let pos = captureCursor(state)
  const supported = state.stack[state.stack.length - 1].marks.every((mark: Mark) => capturedTextMarks.includes(mark.type.name))
  for (const run of runs) {
    const a = pos
    pos += run.text.length
    if (!supported || !run.trace || !run.text) continue
    const ps = run.trace.pieces
    if (run.kind === 'linear' && run.trace.text === run.text) {
      for (const p of ps) if (p.kind !== 'generated') collector.runs.push({
        sourceFrom: p.sourceFrom, sourceTo: p.sourceTo,
        pmFrom: a + p.from, pmTo: a + p.to, kind: p.kind === 'copy' ? 'linear' : 'atomic',
      })
      continue
    }
    const contiguous = ps.length > 0 && ps.every((p, i) => p.kind !== 'generated' && (!i || ps[i - 1]!.sourceTo === p.sourceFrom))
    if (!contiguous) continue
    collector.runs.push({ sourceFrom: ps[0]!.sourceFrom, sourceTo: ps[ps.length - 1]!.sourceTo,
      pmFrom: a, pmTo: pos, kind: 'atomic' })
  }
  delegate()
  if (captureCursor(state) !== pos) throw new UnsupportedSourceCapture()
}

function captureAtomEmission(state:any,token:any,delegate:()=>void):void {
 const critic=criticTokens.get(token),raw=atomTokenRanges.get(token)??(critic?.kind==='note_anchor'?{from:critic.syntaxFrom,to:critic.syntaxTo}:undefined),collector=currentInlineCollector.get(state)
 if(!raw||!collector){delegate();return}
 const frame=state.stack.at(-1),slot=frame.content.length,pmFrom=captureCursor(state)
 delegate()
 const node:PmNode|undefined=frame.content[slot],pmTo=captureCursor(state)
 if(state.stack.at(-1)!==frame||frame.content.length!==slot+1||!node||!['math_inline','note_anchor','hardbreak','footnote_ref'].includes(node.type.name)||!node.isAtom||node.nodeSize!==pmTo-pmFrom)return
 collector.atoms.push({body:-1,pmFrom,pmTo,sourceFrom:raw.from,sourceTo:raw.to,node})
 if(critic?.kind==='note_anchor'&&node.type.name==='note_anchor')collector.critic.push({...critic,id:collector.critic.length,body:-1,pmFrom,pmTo,note:node.attrs.note})
}

function captureEdgeEmission(state:any,token:any,delegate:()=>void):void {
 const edge=edgeTokens.get(token),collector=currentInlineCollector.get(state)
 if(!edge){delegate();return}
 const position=captureCursor(state),frame=state.stack.at(-1)
 let active=activeEdges.get(state);if(!active){active=new Map();activeEdges.set(state,active)}
 if(edge.side==='code'){
  if(!collector){delegate();return}
  captureText(state,token,delegate)
  const mark=state.schema.marks.code.create(),marks=mark.addToSet(frame.marks)
  collector.edges.push({id:collector.edges.length,body:-1,family:'code',pmFrom:position,pmTo:captureCursor(state),open:edge.open,close:edge.close,marks})
  return
 }
 if(edge.side==='close'){
  const opened=active.get(edge.open.from)
  delegate()
  if(opened&&collector){
   const mark=opened.marks.find(m=>!m.isInSet(frame.marks))
   if(mark){
    collector.edges.push({id:collector.edges.length,body:-1,family:mark.type.name,pmFrom:opened.pmFrom,pmTo:position,open:edge.open,close:edge.close,marks:opened.marks})
    const critic=criticTokens.get(token)
    if(critic?.kind==='annotation'&&mark.type.name==='annotation')collector.critic.push({...critic,id:collector.critic.length,body:-1,pmFrom:opened.pmFrom,pmTo:position,note:mark.attrs.note})
   }
  }
  active.delete(edge.open.from);return
 }
 delegate();active.set(edge.open.from,{pmFrom:position,marks:frame.marks.slice()})
}

function emptyLiteral(state:any,start:number,end:number,indent:number,content:string):EmptyPlace|undefined {
 const collector=collectorFor(state)!
 if(content!==''&&content!=='\n')return undefined
 const eol=actualEol(collector,state.eMarks[start]);if(!eol)return undefined
 const prefix:SourcePrefix=[...activePrefix(state),...(indent>state.blkIndent?[{spaces:indent-state.blkIndent}]:[])]
 if(content==='\n'){
  const terminal=actualEol(collector,state.eMarks[start+1]),at=rawPoint(collector.trace,state.eMarks[start+1])
  if(!terminal||at===undefined)return undefined
  return {kind:'literal',at,terminal,eol,prefix,closed:true}
 }
 const at=rawPoint(collector.trace,collector.lineStarts[end]!)
 return at===undefined?undefined:{kind:'literal',at,eol,prefix,closed:true}
}

// noCloseToken handlers addText directly, so observe their completed actual node.
function captureLiteralEmission(state:any,token:any,delegate:()=>void):void {
  const fact=literalFacts.get(token)
  if(!fact){delegate();return}
  const frame=state.stack[state.stack.length-1],index=frame.content.length,from=captureCursor(state)+1
  delegate()
  if(state.stack[state.stack.length-1]!==frame||frame.content.length!==index+1)return
  const node:PmNode=frame.content[index],kind=fact.kind==='fence'?'code_block':fact.kind==='front_matter'?'frontmatter':fact.kind
  if(node.type.name!==kind||!['code_block','frontmatter','html_block'].includes(kind))return
  const text=token.content.endsWith('\n')?token.content.slice(0,-1):token.content
  if(node.textContent!==text||node.content.size!==text.length||node.marks.length)return
  let plain=true;node.forEach(child=>{if(!child.isText||child.marks.length)plain=false})
  if(!plain||fact.trace.text!==token.content)return
  const trace=sliceTrace(fact.trace,0,text.length),runFrom=fact.collector.runs.length
  for(const p of trace.pieces)if(p.kind!=='generated')fact.collector.runs.push({sourceFrom:p.sourceFrom,sourceTo:p.sourceTo,
    pmFrom:from+p.from,pmTo:from+p.to,kind:p.kind==='copy'?'linear':'atomic'})
  const fence=fenceTokens.get(token)
  const contiguous=trace.pieces.length>0&&trace.pieces.every((p,i)=>p.kind!=='generated'&&(!i||trace.pieces[i-1]!.sourceTo===p.sourceFrom))
  const raw=fence&&trace.pieces.length?{from:trace.pieces[0]!.sourceFrom,to:trace.pieces.at(-1)!.sourceTo}:undefined
  fact.collector.emissions.push({from,to:from+text.length,kind,runFrom,runTo:fact.collector.runs.length,node,...(fact.empty?{empty:fact.empty}:{}),
    ...(fence&&raw?{fence:{...fence,contiguousTopLevel:fence.contiguousTopLevel&&contiguous,pmFrom:from-1,pmTo:from+text.length+1,contentFrom:raw.from,contentTo:raw.to}}:{})})
}

// Inline handlers emit into one actual open PM frame, including table cell paragraphs.
function captureInlineEmission(state:any,token:any,delegate:()=>void):void {
  const fact=inlineFacts.get(token)
  if(!fact){delegate();return}
  if(!inlineCloseStates.has(state)){
    const close=state.closeNode
    state.closeNode=function(){
      const frame=this.stack[this.stack.length-1],emission=inlineFrames.get(frame),node=close.call(this)
      if(emission){
        if(!node||node.type.name!==emission.kind||node.content.size!==emission.to-emission.from||emission.node)throw new UnsupportedSourceCapture()
        emission.node=node
      }
      return node
    }
    inlineCloseStates.add(state)
  }
  const frame=state.stack[state.stack.length-1],from=captureCursor(state),runFrom=fact.collector.runs.length
  currentInlineCollector.set(state,fact.collector)
  const edgeFrom=fact.collector.edges.length,atomFrom=fact.collector.atoms.length,criticFrom=fact.collector.critic.length
  delegate()
  const edgeTo=fact.collector.edges.length,atomTo=fact.collector.atoms.length,criticTo=fact.collector.critic.length,to=captureCursor(state)
  if(state.stack[state.stack.length-1]!==frame)throw new UnsupportedSourceCapture()
  if(!['paragraph','heading'].includes(frame.type.name))return
  const emission:InlineEmission={from,to,edgeFrom,edgeTo,atomFrom,atomTo,criticFrom,criticTo,separators:separatorTokens.get(token)??[],kind:frame.type.name,runFrom,runTo:fact.collector.runs.length,...(fact.empty?{empty:fact.empty}:{})}
  fact.collector.emissions.push(emission);inlineFrames.set(frame,emission)
  if(fact.trace&&fact.kind){
    const pieces=fact.trace.pieces
    const actual=pieces.length>0&&pieces.every(p=>p.kind!=='generated')
    // getLines may omit container continuation prefixes between real pieces.
    // They belong to this consumed envelope only as immutable recipe gaps.
    const raw=actual?{from:pieces[0]!.sourceFrom,to:pieces.at(-1)!.sourceTo}:undefined
    if(raw)emission.body={pmFrom:from,pmTo:to,sourceFrom:raw.from,sourceTo:raw.to,kind:fact.kind,
      singlePhysicalLine:!/[\r\n]/.test(fact.collector.source.slice(raw.from,raw.to))}
  }
}

// The existing task parser consumes only the first text child's prefix. Keep
// that token's existing provenance in step; never manufacture a missing trace.
function consumeCheckboxSource(token: InlineToken, count: number): void {
  const provenance = tokenSources.get(token)
  if (!provenance) return
  if (provenance.runs.map(run => run.text).join('') !== token.content) throw new UnsupportedSourceCapture()
  let remaining = Math.min(count, token.content.length)
  const runs: SourceRun[] = []
  for (const run of provenance.runs) {
    if (!remaining) { runs.push(run); continue }
    if (remaining >= run.text.length) { remaining -= run.text.length; continue }
    if (run.kind === 'atomic') throw new UnsupportedSourceCapture()
    const text = run.text.slice(remaining)
    if (run.trace) {
      if (run.trace.text !== run.text || run.trace.pieces.some(p => p.kind === 'atomic' && p.from < remaining && remaining < p.to)) throw new UnsupportedSourceCapture()
      runs.push({ text, kind: run.kind, trace: sliceTrace(run.trace, remaining, run.text.length) })
    } else runs.push({ text })
    remaining = 0
  }
  if (remaining || runs.map(run => run.text).join('') !== token.content.slice(count)) throw new UnsupportedSourceCapture()
  tokenSources.set(token, { collector: provenance.collector, runs })
}

type RootDraft = {
  collector: Capture; kind: 'natural' | 'synthetic'; gapIndex: number
  id: number; tokenType: string; sourceFrom: number; sourceTo: number; tailFrom: number
  childFrom?: number; pmFrom?: number; layout?: BlankDraft | 'fallback'
  closedFences?: boolean
}
const rootStarts = new WeakMap<object, RootDraft>()
const rootEnds = new WeakMap<object, RootDraft>()

type ListDraft = {
  collector: Capture; id: number; kind: 'bullet' | 'ordered'; marker: ListMarker
  sourceFrom: number; sourceTo: number; tight: boolean; order?: number
  parent?: { content: PmNode[] }; slot?: number; node?: PmNode
}
const listStarts = new WeakMap<object, ListDraft>()
const listEnds = new WeakMap<object, ListDraft>()

// One pass over the actual token sequence; only paragraphs directly inside an
// item of this list determine tightness. Empty items have no visible paragraph.
function prepareListEvents(tokens: InlineToken[], collector: Capture): void {
  const stack: { token: InlineToken; list: ListDraft | undefined }[] = []
  for (const token of tokens) {
    if (token.nesting === -1) {
      const open = stack.pop()
      if (!open || open.token.type.replace(/_open$/, '_close') !== token.type) throw new UnsupportedSourceCapture()
      if (open.list) {
        if (token.markup !== open.list.marker) throw new UnsupportedSourceCapture()
        listEnds.set(token, open.list)
      }
      continue
    }
    let list: ListDraft | undefined
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const kind = token.type === 'bullet_list_open' ? 'bullet' : 'ordered', marker = token.markup
      if (token.nesting !== 1 || !token.map || token.map.length !== 2
        || !token.map.every(Number.isInteger) || !marker
        || !(kind === 'bullet' ? ['-', '+', '*'] : ['.', ')']).includes(marker)) throw new UnsupportedSourceCapture()
      const from = collector.lineStarts[token.map[0]], to = collector.lineStarts[token.map[1]]
      if (from === undefined || to === undefined || to <= from) throw new UnsupportedSourceCapture()
      const raw = rawRange(collector.trace, from, to)
      if (!raw || (kind === 'ordered' && typeof token.attrGet !== 'function')) throw new UnsupportedSourceCapture()
      list = { collector, id: collector.lists.length, kind, marker: marker as ListMarker,
        sourceFrom: raw.from, sourceTo: raw.to, tight: true,
        ...(kind === 'ordered' ? { order: Number(token.attrGet!('start') ?? 1) } : {}) }
      collector.lists.push(list); listStarts.set(token, list)
    } else if (token.type === 'paragraph_open' && stack[stack.length - 1]?.token.type === 'list_item_open') {
      const direct = stack[stack.length - 2]?.list
      if (direct) {
        if (typeof token.hidden !== 'boolean') throw new UnsupportedSourceCapture()
        if (!token.hidden) direct.tight = false
      }
    }
    if (token.nesting === 1) stack.push({ token, list })
  }
  if (stack.length) throw new UnsupportedSourceCapture()
}

// Capture the actual appended object, not a temporary cursor: createAndFill
// may later insert an empty paragraph before a list in its containing item.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function captureListEmission(state: any, token: any, delegate: () => void): void {
  const start = listStarts.get(token), end = listEnds.get(token)
  if (start) {
    const parent = state.stack?.[state.stack.length - 1]
    if (!parent || !Array.isArray(parent.content) || start.parent) throw new UnsupportedSourceCapture()
    start.parent = parent; start.slot = parent.content.length
  }
  delegate()
  if (end) {
    const parent = state.stack?.[state.stack.length - 1]
    if (!parent || parent !== end.parent || end.slot === undefined
      || parent.content.length !== end.slot + 1 || end.node) throw new UnsupportedSourceCapture()
    const node: PmNode = parent.content[end.slot]
    if (node.type.name !== end.kind + '_list' || (end.kind === 'ordered' && node.attrs.order !== end.order)) throw new UnsupportedSourceCapture()
    end.node = node
  }
}

function finishSourceLists(doc: PmNode, collector: Capture): readonly SourceListLexeme[] {
  const byNode = new Map<PmNode, ListDraft>(), facts: SourceListLexeme[] = []
  for (const draft of collector.lists) {
    if (!draft.node || byNode.has(draft.node)) throw new UnsupportedSourceCapture()
    byNode.set(draft.node, draft)
  }
  let rootIndex = 0
  const seen = new Set<ListDraft>()
  doc.descendants((node, pmFrom) => {
    const draft = byNode.get(node)
    if (!draft) {
      if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') throw new UnsupportedSourceCapture()
      return
    }
    if (seen.has(draft)) throw new UnsupportedSourceCapture()
    seen.add(draft)
    const pmTo = pmFrom + node.nodeSize
    while (collector.roots[rootIndex] && collector.roots[rootIndex]!.pmTo <= pmFrom) rootIndex++
    const root = collector.roots[rootIndex]
    if (!root || root.pmFrom > pmFrom || root.pmTo < pmTo
      || root.sourceFrom > draft.sourceFrom || root.sourceTo < draft.sourceTo
      || node.type.name !== draft.kind + '_list' || (draft.kind === 'ordered' && node.attrs.order !== draft.order)) throw new UnsupportedSourceCapture()
    facts.push(Object.freeze({ id: draft.id, rootId: root.id, pmFrom, pmTo,
      sourceFrom: draft.sourceFrom, sourceTo: draft.sourceTo, kind: draft.kind, marker: draft.marker, tight: draft.tight }))
  })
  if (seen.size !== collector.lists.length) throw new UnsupportedSourceCapture()
  return Object.freeze(facts)
}

function prepareRootEvents(tokens: InlineToken[], collector: Capture): InlineToken[] {
  const starts = collector.lineStarts
  const renderable = new Set(['paragraph_open', 'heading_open', 'bullet_list_open', 'ordered_list_open',
    'blockquote_open', 'table_open', 'footnote_reference_open', 'dl_open', 'hr',
    'fence', 'code_block', 'front_matter', 'html_block', 'math_block', 'math_block_eqno'])
  const flowTail = new Set(['bullet_list_open', 'ordered_list_open', 'blockquote_open'])
  const natural: { draft: RootDraft; first: number; last: number; from: number; to: number; boundaryTo: number }[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.level !== 0 || token.nesting === -1 || !token.map) continue
    let last = i
    if (token.nesting === 1) {
      last = i + 1
      while (last < tokens.length && !(tokens[last]!.level === 0 && tokens[last]!.nesting === -1)) last++
      if (last === tokens.length) throw new UnsupportedSourceCapture()
    } else if (token.nesting !== 0) throw new UnsupportedSourceCapture()
    const from = starts[token.map[0]], to = starts[token.map[1]]
    if (from === undefined || to === undefined || to <= from) throw new UnsupportedSourceCapture()
    const raw = rawRange(collector.trace, from, to)
    if (!raw) throw new UnsupportedSourceCapture()
    let tailFrom = raw.to, boundaryTo = to
    if (renderable.has(token.type)) {
      const tailWork = rendererTailStart(collector.trace.text, from, to, token.type)
      const tail = rawRange(collector.trace, tailWork, to)
      if (tail) { if (tail.to !== raw.to) throw new UnsupportedSourceCapture(); tailFrom = tail.from }
      if (flowTail.has(token.type) && collector.trace.text[tailWork] === '\n'
        && /^[ \t\n]*$/.test(collector.trace.text.slice(tailWork + 1, to))) boundaryTo = tailWork + 1
    }
    // Owned nested blanks are part of this root's body, never top-level
    // layout units. Keep only their final physical EOL as the root terminal.
    for(let at=i;at<=last;at++)for(const pending of nestedBlanks.get(tokens[at]!)??[]){
      const place=pending.place
      if(place.kind==='nested-blank'){
        tailFrom=Math.max(tailFrom,place.range.to)
        boundaryTo=Math.max(boundaryTo,starts[pending.line+1]!)
      }
    }
    const id = natural.length
    let closedFences = true
    for (let at = i; at <= last; at++) if (tokens[at]!.type === 'fence') {
      const closed = capturedFenceClosed.get(tokens[at]!)
      if (closed === undefined) throw new UnsupportedSourceCapture()
      if (!closed) closedFences = false
    }
    const draft: RootDraft = { collector, kind: 'natural', gapIndex: id, id, tokenType: token.type,
      sourceFrom: raw.from, sourceTo: raw.to, tailFrom, closedFences }
    rootStarts.set(token, draft); rootEnds.set(tokens[last]!, draft)
    natural.push({ draft, first: i, last, from, to, boundaryTo }); i = last
  }
  const regions: LayoutRegion[] = []
  for (let i = 0; i <= natural.length; i++) {
    const previous = natural[i - 1], next = natural[i]
    regions.push({ from: previous?.boundaryTo ?? 0, to: next?.from ?? collector.trace.text.length,
      insertBefore: next?.first ?? tokens.length, gapIndex: i, left: !!previous, right: !!next,
      ...(previous ? { previousRoot: previous.draft } : {}) })
  }
  collector.blankLines = collectBlankDrafts(collector.source, collector.trace, starts, regions, collector.protectedSources)
  const inserts = new Map<number, InlineToken[]>()
  function emit(at: number, layout: BlankDraft | 'fallback') {
    const mk = (type: string, tag: string, nesting: number, extra: Partial<InlineToken> = {}): InlineToken => ({
      type, tag, nesting, content: '', children: null, attrs: null, info: '', meta: null, map: null,
      block: true, hidden: false, level: 0, markup: '', ...extra })
    const open = mk('paragraph_open', 'p', 1), close = mk('paragraph_close', 'p', -1)
    const draft: RootDraft = { collector, kind: 'synthetic', gapIndex: 0, id: -1, tokenType: 'paragraph_open',
      sourceFrom: 0, sourceTo: 0, tailFrom: 0, layout }
    rootStarts.set(open, draft); rootEnds.set(close, draft)
    const items = inserts.get(at) ?? []
    items.push(open, mk('inline', '', 0, { level: 1, block: false, children: [] }), close); inserts.set(at, items)
  }
  if (!natural.length) emit(0, 'fallback')
  for (const unit of collector.blankLines) if (unit.role === 'empty-paragraph') emit(unit.insertBefore, unit)
  const result: InlineToken[] = []
  for (let i = 0; i <= tokens.length; i++) {
    const before = inserts.get(i); if (before) for (const token of before) result.push(token)
    if (i < tokens.length) result.push(tokens[i]!)
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rootCursor(state: any): { count: number; pos: number } {
  if (!Array.isArray(state.stack) || state.stack.length !== 1 || !Array.isArray(state.stack[0].content)) {
    throw new UnsupportedSourceCapture()
  }
  return { count: state.stack[0].content.length, pos: captureCursor(state) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function captureRootEmission(state: any, token: any, delegate: () => void): void {
  const start = rootStarts.get(token), end = rootEnds.get(token)
  if (start) {
    const cursor = rootCursor(state)
    start.childFrom = cursor.count; start.pmFrom = cursor.pos
  }
  delegate()
  if (end) {
    const cursor = rootCursor(state)
    if (end.childFrom === undefined || end.pmFrom === undefined || cursor.count <= end.childFrom) {
      throw new UnsupportedSourceCapture()
    }
    const emission = { childFrom: end.childFrom, childTo: cursor.count, pmFrom: end.pmFrom, pmTo: cursor.pos }
    if (end.kind === 'synthetic') {
      if (end.layout === 'fallback') {
        end.collector.fallback = { kind: 'empty-document-baseline',
          sourceAnchor: end.collector.source.charCodeAt(0) === 0xFEFF ? 1 : 0, emission }
      } else {
        const unit = end.layout
        if (!unit || unit.role !== 'empty-paragraph' || unit.emission) throw new UnsupportedSourceCapture()
        unit.emission = emission
        if (unit.container.kind === 'gap') end.collector.synthetic.push({ gapIndex: unit.container.gapIndex, emission })
      }
    } else {
      if (end.closedFences === undefined) throw new UnsupportedSourceCapture()
      const root = { id: end.id, tokenType: end.tokenType,
        sourceFrom: end.sourceFrom, sourceTo: end.sourceTo, tailFrom: end.tailFrom, ...emission }
      capturedRootFencesClosed.set(root, end.closedFences)
      end.collector.roots.push(root)
    }
  }
}

function buildSourceGaps(source: string, roots: readonly SourceRoot[], synthetic: Capture['synthetic']): SourceGap[] {
  const grouped: SyntheticEmission[][] = Array.from({ length: roots.length + 1 }, () => [])
  for (const entry of synthetic) {
    if (!Number.isInteger(entry.gapIndex) || entry.gapIndex < 0 || entry.gapIndex > roots.length) {
      throw new UnsupportedSourceCapture()
    }
    grouped[entry.gapIndex]!.push(entry.emission)
  }
  const result: SourceGap[] = []
  let at = 0, lastChild = 0
  for (let i = 0; i <= roots.length; i++) {
    const root = roots[i], to = root?.sourceFrom ?? source.length
    if (to < at) throw new UnsupportedSourceCapture()
    result.push({ sourceFrom: at, sourceTo: to,
      kind: /^[\s\uFEFF]*$/u.test(source.slice(at, to)) ? 'trivia' : 'opaque',
      synthetic: grouped[i]! })
    if (root) {
      if (root.id !== i || root.sourceTo <= to || root.sourceTo > source.length || root.childFrom < lastChild) {
        throw new UnsupportedSourceCapture()
      }
      at = root.sourceTo; lastChild = root.childTo
    }
  }
  return result
}

// Patch md.parse to inject paired-tag pre-processing and blank-line preservation
// before prosemirror-markdown processes the tokens.
const _origMdParse = md.parse.bind(md)
md.parse = function (src: string, env: unknown) {
  let tokens = _origMdParse(src, env) as unknown as InlineToken[]
  tagPairedHtmlInline(tokens)
  fixFootnoteDefMaps(tokens)
  const collector = (env as { [captureKey]?: Capture } | undefined)?.[captureKey]
  if (collector) prepareListEvents(tokens, collector)
  tokens = collector ? prepareRootEvents(tokens, collector) : preserveBlankLines(tokens)
  return tokens as unknown as ReturnType<typeof _origMdParse>
}

// ── Parser ──────────────────────────────────────────────────────

/**
 * Token-to-node mapping for prosemirror-markdown's MarkdownParser.
 * markdown-it token names → ProseMirror node/mark names from schema.ts
 */
const parserTokens: Record<string, import('prosemirror-markdown').ParseSpec> = {
  // ── Block tokens ──
  paragraph: { block: 'paragraph' },
  blockquote: { block: 'blockquote' },
  heading: {
    block: 'heading',
    getAttrs(token) {
      return { level: Number(token.tag.slice(1)) }
    },
  },
  hr: { node: 'horizontal_rule' },
  bullet_list: { block: 'bullet_list' },
  ordered_list: {
    block: 'ordered_list',
    getAttrs(token) {
      return { order: Number(token.attrGet('start') ?? 1) }
    },
  },
  list_item: {
    block: 'list_item',
    getAttrs(_token, tokens, index) {
      // Check for task list checkbox in the first inline child.
      // The inline content starts with [x] or [ ]
      let checked: boolean | null = null
      for (let i = index + 1; i < tokens.length; i++) {
        const t = tokens[i]
        if (!t) continue
        if (t.type === 'inline' && t.content) {
          const match = t.content.match(/^\[( |x|X)\]\s?/)
          if (match) {
            checked = match[1] !== ' '
            // Strip the checkbox text from the token content
            const fact=inlineFacts.get(t)
            if(fact?.trace){
              if(fact.trace.text!==t.content)throw new UnsupportedSourceCapture()
              const at=rawPoint(fact.trace,match[0].length)
              const empty=match[0].length===fact.trace.text.length&&at!==undefined
                ?{kind:'inline' as const,range:{from:fact.trimEnd??at,to:fact.trimEnd??at},before:(fact.trimEnd??at)>at||/\s$/.test(match[0])?'':' ',after:''}:undefined
              inlineFacts.set(t,{...fact,trace:sliceTrace(fact.trace,match[0].length,fact.trace.text.length),...(empty?{empty}:{})})
            }
            t.content = t.content.slice(match[0].length)
            // Also update children if they exist
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const children = (t as any).children
            if (children && children.length > 0) {
              const firstChild = children[0]
              if (firstChild.type === 'text') {
                consumeCheckboxSource(firstChild, match[0].length)
                firstChild.content = firstChild.content.slice(match[0].length)
                if (!firstChild.content) {
                  children.shift()
                }
              }
            }
          }
          break
        }
        if (t.type === 'list_item_close') break
      }
      return { checked }
    },
  },
  code_block: {
    block: 'code_block',
    getAttrs() {
      return { language: '' }
    },
    noCloseToken: true,
  },
  fence: {
    block: 'code_block',
    getAttrs(token) {
      return { language: token.info.trim() }
    },
    noCloseToken: true,
  },
  front_matter: {
    block: 'frontmatter',
    noCloseToken: true,
  },
  html_block: {
    block: 'html_block',
    noCloseToken: true,
  },
  html_inline: {
    // markdown-it emits this token for inline HTML like <br>, <span>, <sup>,
    // and HTML comments <!-- ... -->. Store raw HTML in the `value` attr.
    node: 'html_inline',
    noCloseToken: true,
    getAttrs(token) {
      return { value: token.content }
    },
  },

  // ── Table tokens ──
  // NOTE: tr/th/td are NOT listed here — they are handled by custom tokenHandler
  // overrides in MorayaMarkdownParser below. The `block:` spec alone can't
  // handle (a) thead-row → table_header_row vs table_row dispatch, or
  // (b) wrapping inline content in the required paragraph child of each cell.
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },

  // ── Definition list tokens ──
  dl: { block: 'defList' },
  dt: { block: 'defListTerm' },
  dd: { block: 'defListDescription' },

  // ── Math tokens (from markdown-it-texmath) ──
  // Use block: spec (not node:) so token.content is added as text children,
  // correctly filling math_inline's `content: 'text*'`.
  math_inline: {
    block: 'math_inline',
    noCloseToken: true,
  },
  // markdown-it-texmath emits math_inline_double for $$...$$ in inline context.
  // Map to math_inline to prevent "Token type not supported" crash.
  math_inline_double: {
    block: 'math_inline',
    noCloseToken: true,
  },
  math_block: {
    node: 'math_block',
    noCloseToken: true,
    getAttrs(token) {
      return { value: token.content.trim() }
    },
  },

  // ── Inline tokens ──
  image: {
    node: 'image',
    getAttrs(token) {
      // Preserve ASCII escapes such as %20 and %25. Filesystem resolution
      // decodes once at the I/O boundary; decoding here makes a later
      // serialization emit invalid bare spaces and loses literal percent data.
      // Restore only markdown-it's encoded Windows separators so absolute and
      // relative Windows paths are still recognized before filesystem loading.
      const src = restoreLocalWindowsSeparators(
        decodeMultibytePercentSequences(token.attrGet('src') || ''),
      )
      return {
        src,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alt: ((token.children as any[]) || []).map(c => c.content).join('') || '',
        title: token.attrGet('title') || '',
      }
    },
  },
  hardbreak: { node: 'hardbreak' },
  softbreak: { node: 'hardbreak', attrs: { isInline: true } },

  // ── Mark tokens ──
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strike_through' },
  code_inline: { mark: 'code', noCloseToken: true },
  link: {
    mark: 'link',
    getAttrs(token) {
      // Decode percent-encoded non-ASCII UTF-8 characters (e.g. Chinese/Japanese/Korean)
      // so URLs preserve original characters through roundtrips.
      // Only decodes multi-byte UTF-8 sequences (C2-FF start bytes + 80-BF continuations),
      // leaving ASCII encodings like %20 (space), %28/%29 (parens) intact.
      const href = decodeMultibytePercentSequences(token.attrGet('href') || '')
      return {
        href,
        title: token.attrGet('title') || null,
      }
    },
  },
  mark: { mark: 'highlight', attrs: { delimiter: 'equals' } },
  caret_highlight: { mark: 'highlight', attrs: { delimiter: 'caret' } },
  critic_anno: {
    mark: 'annotation',
    getAttrs: (tok) => ({ note: ((tok.meta as { note?: string } | null)?.note) ?? '' }),
  },
  critic_note: {
    node: 'note_anchor',
    getAttrs: (tok) => ({ note: ((tok.meta as { note?: string } | null)?.note) ?? '' }),
  },

  // ── Footnote tokens ──
  // markdown-it-footnote 的引用 token(以及我们的兜底规则)都叫 footnote_ref。
  footnote_ref: {
    node: 'footnote_ref',
    getAttrs: (tok) => ({ label: ((tok.meta as { label?: string } | null)?.label) ?? '' }),
  },
  // 定义的 token 名是 footnote_reference_open/close —— markdown-it-footnote 的
  // 既定命名,不是 footnote_definition_*。`block:` 规格自动配对 open/close。
  footnote_reference: {
    block: 'footnote_definition',
    getAttrs: (tok) => {
      const meta = tok.meta as { label?: string; tight?: boolean } | null
      return { label: meta?.label ?? '', tight: meta?.tight === true }
    },
  },
}

/**
 * Custom MarkdownParser that correctly handles GFM table structure.
 *
 * Two problems with the default prosemirror-markdown `block:` approach for tables:
 *
 * 1. `table_header` and `table_cell` both have `content: 'paragraph+'` in our schema.
 *    prosemirror-markdown opens the cell block, then adds raw inline text via addText().
 *    When closeNode() calls createAndFill(attrs, [text("A")]), the content match
 *    for `paragraph+` cannot fit a bare text node, so createAndFill() returns null
 *    and the cell (and all its content) is silently dropped → empty table.
 *
 * 2. `table: content: 'table_header_row table_row*'` requires the first child to be
 *    a `table_header_row`, but the default `tr` handler always creates `table_row`.
 *    ProseMirror's createAndFill() then auto-inserts an empty `table_header_row`
 *    at the front, leaving the real header data in a wrongly-typed `table_row`.
 *
 * Fix: override tr/th/td tokenHandlers in the constructor.
 */
class MorayaMarkdownParser extends MarkdownParser {
  /**
   * The schema this parser instance is bound to. Captured for use in
   * tokenHandler overrides (tr_open / th_open / etc.) so they reference the
   * caller-provided schema rather than the module-level defaultSchema.
   */
  public readonly schema: Schema

  constructor(schemaArg: Schema = defaultSchema, tokenizer: MarkdownIt = md) {
    super(schemaArg, tokenizer, parserTokens)
    this.schema = schemaArg

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h: Record<string, (state: any, tok: any, tokens: any[], i: number) => void> =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).tokenHandlers

    // ── CSV fence → spreadsheet node ──────────────────────────────
    const defaultFence = h['fence']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h['fence'] = (state: any, tok: any, tokens: any[], i: number) => {
      const lang = (tok.info as string).trim().toLowerCase()
      if (lang === 'csv' && schemaArg.nodes.spreadsheet) {
        state.addNode(schemaArg.nodes.spreadsheet, { source: (tok.content as string).trim() })
        return
      }
      defaultFence!(state, tok, tokens, i)
    }

    function cellAlignment(tok: { attrGet(s: string): string | null }): string {
      const style = tok.attrGet('style') || ''
      const m = style.match(/text-align:\s*(\w+)/)
      return m && m[1] ? m[1] : 'left'
    }

    // tr_open: dispatch to table_header_row or table_row based on parent context
    h['tr_open'] = (state, _tok, tokens, i) => {
      let inThead = false
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j].type === 'thead_open') { inThead = true; break }
        if (tokens[j].type === 'thead_close' || tokens[j].type === 'tbody_open') break
      }
      state.openNode(inThead ? schemaArg.nodes.table_header_row : schemaArg.nodes.table_row, null)
    }
    h['tr_close'] = (state) => state.closeNode()

    // th_open/close: open table_header + inner paragraph so inline text lands correctly
    h['th_open'] = (state, tok) => {
      state.openNode(schemaArg.nodes.table_header, { alignment: cellAlignment(tok) })
      state.openNode(schemaArg.nodes.paragraph, null)
    }
    h['th_close'] = (state) => {
      state.closeNode() // close paragraph
      state.closeNode() // close table_header
    }

    // td_open/close: open table_cell + inner paragraph
    h['td_open'] = (state, tok) => {
      state.openNode(schemaArg.nodes.table_cell, { alignment: cellAlignment(tok) })
      state.openNode(schemaArg.nodes.paragraph, null)
    }
    h['td_close'] = (state) => {
      state.closeNode() // close paragraph
      state.closeNode() // close table_cell
    }

    // ── Empty link preservation ────────────────────────────────────
    // When markdown-it parses `[]()` or `[](url)`, it emits link_open → link_close
    // with no text token between them. ProseMirror discards marks with no content,
    // so the link completely disappears. Fix: detect empty-text links and insert
    // the raw markdown syntax as literal text instead of creating a mark.
    const defaultLinkOpen = h['link_open']
    const defaultLinkClose = h['link_close']

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h['link_open'] = (state: any, tok: any, tokens: any[], i: number) => {
      // Check if there's actual content between link_open and link_close
      let hasContent = false
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'link_close') break
        if (tokens[j].type === 'text' && tokens[j].content) {
          hasContent = true
          break
        }
        if (['image', 'code_inline', 'softbreak', 'hardbreak', 'html_inline'].includes(tokens[j].type)) {
          hasContent = true
          break
        }
      }

      if (!hasContent) {
        // Empty-text link: insert raw markdown syntax as literal text
        const href = decodeMultibytePercentSequences(tok.attrGet('href') || '')
        const title = tok.attrGet('title')
        let literal = `[](${href}`
        if (title) literal += ` "${title}"`
        literal += ')'
        state.addText(literal)
        // Mark the corresponding link_close to be skipped
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === 'link_close') {
            tokens[j].meta = { ...(tokens[j].meta || {}), skipClose: true }
            break
          }
        }
        return
      }

      defaultLinkOpen!(state, tok, tokens, i)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h['link_close'] = (state: any, tok: any, tokens: any[], i: number) => {
      if (tok.meta?.skipClose) return
      defaultLinkClose!(state, tok, tokens, i)
    }

    // ── Paired inline HTML → marks ─────────────────────────────────
    // Pre-scanned paired tags (meta.htmlPaired) become openMark/closeMark
    // so the visual editor renders them with styling. Unpaired tags stay
    // as html_inline atom nodes for exact roundtrip fidelity.
    //
    // Special case: <audio>/<video> inline tags (single-line, e.g.
    // `<audio src="..." controls></audio>`) are combined into a single
    // html_inline atom node so toDOM renders them as media players.
    const defaultTextHandler = h['text']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h['text'] = (state: any, tok: any, toks: any[], ii: number) => {
      if (tok.meta?.mediaSkip) return
      captureText(state, tok, () => defaultTextHandler!(state, tok, toks, ii))
    }

    h['html_inline'] = (state, tok, tokens, i) => {
      // Skip tokens already consumed by audio/video combination
      if (tok.meta?.mediaSkip) return

      const content: string = tok.content

      // <audio>/<video> inline: combine opening + closing into single atom.
      const mediaMatch = content.match(/^<(audio|video)\b/i)
      if (mediaMatch && mediaMatch[1]) {
        const tagName = mediaMatch[1].toLowerCase()
        const closeRe = new RegExp(`^</${tagName}\\s*>$`, 'i')
        let fullHtml = content
        for (let j = i + 1; j < tokens.length; j++) {
          const t = tokens[j]
          if (t.type === 'html_inline' && closeRe.test(t.content.trim())) {
            fullHtml += t.content
            t.meta = { ...(t.meta || {}), mediaSkip: true }
            break
          }
          if (t.content) fullHtml += t.content
          t.meta = { ...(t.meta || {}), mediaSkip: true }
        }
        state.addNode(schemaArg.nodes.html_inline, { value: fullHtml })
        return
      }

      if (tok.meta?.htmlPaired) {
        const htmlMark = schemaArg.marks.html_mark
        if (!htmlMark) {
          // Schema lacks html_mark — fall through to atom-node fallback
          state.addNode(schemaArg.nodes.html_inline, { value: content })
          return
        }
        if (!content.startsWith('</')) {
          // Opening tag → open mark
          const tagMatch = content.match(/^<([a-zA-Z][a-zA-Z0-9]*)/)
          const tagName = tagMatch && tagMatch[1] ? tagMatch[1].toLowerCase() : ''
          state.openMark(htmlMark.create({
            openTag: content,
            closeTag: `</${tagName}>`,
          }))
        } else {
          // Closing tag → close mark
          state.closeMark(htmlMark)
        }
        return
      }
      // Not paired → atom node (preserves current behavior)
      state.addNode(schemaArg.nodes.html_inline, { value: content })
    }

    // ── HTML <img> / <video> / <audio> tag: block → inline promotion ──
    // markdown-it tokenizes standalone <img> as html_block (renders as code block).
    // Promote to paragraph(html_inline) so the toDOM can render it as an image.
    // Source format is preserved: html_inline serializes attrs.value (original HTML).
    const defaultHtmlBlock = h['html_block']
    h['html_block'] = (state, tok, tokens, i) => {
      const content = tok.content.trim()
      if (/^<img\s/i.test(content)) {
        // Extract all <img> tags — put them in ONE paragraph with inline
        // hardbreaks between them, matching markdown image behavior.
        const imgPattern = /<img\s[^>]*\/?>/gi
        const imgs = content.match(imgPattern)
        state.openNode(schemaArg.nodes.paragraph, null)
        if (imgs && imgs.length > 0) {
          for (let j = 0; j < imgs.length; j++) {
            if (j > 0) {
              state.addNode(schemaArg.nodes.hardbreak, { isInline: true })
            }
            state.addNode(schemaArg.nodes.html_inline, { value: imgs[j] })
          }
        } else {
          state.addNode(schemaArg.nodes.html_inline, { value: content })
        }
        state.closeNode()
      } else if (/^<(video|audio)\b/i.test(content)) {
        // Promote <video>/<audio> blocks to paragraph(html_inline) so toDOM
        // renders them as actual media players instead of code blocks.
        state.openNode(schemaArg.nodes.paragraph, null)
        state.addNode(schemaArg.nodes.html_inline, { value: content })
        state.closeNode()
      } else {
        defaultHtmlBlock!(state, tok, tokens, i)
      }
    }
    for(const key of ['fence','code_block','front_matter','html_block']){
      const delegate=h[key]!
      h[key]=(state,tok,tokens,i)=>captureLiteralEmission(state,tok,()=>delegate(state,tok,tokens,i))
    }
    const defaultInline=h['inline']!
    h['inline']=(state,tok,tokens,i)=>captureInlineEmission(state,tok,()=>defaultInline(state,tok,tokens,i))
    for(const key of Object.keys(h)){
      const delegate=h[key]!
      h[key]=(state,tok,tokens,i)=>captureAtomEmission(state,tok,()=>captureEdgeEmission(state,tok,()=>delegate(state,tok,tokens,i)))
    }
    for (const key of Object.keys(h)) {
      const delegate = h[key]!
      h[key] = (state, tok, tokens, i) => captureRootEmission(state, tok,
        () => captureListEmission(state, tok, () => captureContainerEmission(state,tok,()=>delegate(state, tok, tokens, i))))
    }
  }
}

/** Default parser bound to {@link defaultSchema} (used when caller doesn't pass a schema). */
const defaultParser = new MorayaMarkdownParser(defaultSchema)

/**
 * Cache of parsers keyed by schema identity. Rebuilding the parser per call
 * would re-construct token handlers + retype-overrides on every parseMarkdown
 * invocation; this WeakMap avoids that. The defaultSchema entry is pre-seeded.
 */
const parserCache = new WeakMap<Schema, MorayaMarkdownParser>()
parserCache.set(defaultSchema, defaultParser)

function getParserFor(schema: Schema | undefined): MorayaMarkdownParser {
  if (!schema || schema === defaultSchema) return defaultParser
  let p = parserCache.get(schema)
  if (!p) {
    p = new MorayaMarkdownParser(schema)
    parserCache.set(schema, p)
  }
  return p
}

// ── Serializer ──────────────────────────────────────────────────

const serializer = new MarkdownSerializer(
  {
    // ── Block nodes ──
    doc(state, node) {
      state.renderContent(node)
    },
    paragraph(state, node) {
      if (node.content.size === 0) {
        state.write('')
      } else {
        state.renderInline(node)
      }
      state.closeBlock(node)
    },
    heading(state, node) {
      state.write(`${'#'.repeat(node.attrs.level as number)} `)
      // fromBlockStart=false: the `## ` prefix already prevents text from being
      // parsed as list markers / blockquote, so don't escape `1.`, `-`, `>` etc.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(state.renderInline as (n: PmNode, b?: boolean) => void)(node, false)
      state.closeBlock(node)
    },
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node))
    },
    code_block(state, node) {
      const lang = (node.attrs.language as string) || ''
      state.write(`\`\`\`${lang}\n`)
      state.text(node.textContent, false)
      state.ensureNewLine()
      state.write('```')
      state.closeBlock(node)
    },
    spreadsheet(state, node) {
      state.write('```csv\n')
      const src = node.attrs.source as string
      if (src) state.text(src, false)
      state.ensureNewLine()
      state.write('```')
      state.closeBlock(node)
    },
    frontmatter(state, node) {
      state.write('---\n')
      state.text(node.textContent, false)
      state.ensureNewLine()
      state.write('---')
      state.closeBlock(node)
    },
    horizontal_rule(state, node) {
      state.write('---')
      state.closeBlock(node)
    },
    bullet_list(state, node) {
      state.renderList(node, '  ', () => '- ')
    },
    ordered_list(state, node) {
      const start = (node.attrs.order as number) ?? 1
      state.renderList(node, '   ', (i: number) => `${start + i}. `)
    },
    list_item(state, node) {
      // Task list checkbox prefix
      if (node.attrs.checked != null) {
        const checkbox = node.attrs.checked ? '[x] ' : '[ ] '
        state.write(checkbox)
      }
      state.renderContent(node)
    },
    image(state, node) {
      const alt = state.esc((node.attrs.alt as string) || '', false)
      const destination = serializeImageDestination((node.attrs.src as string) || '')
      const title = node.attrs.title as string | null | undefined
      if (title) {
        state.write(`![${alt}](${destination} "${serializeImageTitle(title)}")`)
      } else {
        state.write(`![${alt}](${destination})`)
      }
    },
    hardbreak(state) {
      // Always use markdown hardbreak format (two spaces + newline)
      // for consistent parsing and roundtrip fidelity
      state.write('  \n')
    },
    html_block(state, node) {
      state.text(node.textContent, false)
      state.closeBlock(node)
    },
    html_inline(state, node) {
      // Write the raw HTML back verbatim (no escaping); value attr holds the original HTML.
      state.text(node.attrs.value as string, false)
    },
    note_anchor(state, node) {
      state.write(`{>>${sanitizeNote(node.attrs.note as string)}<<}`)
    },
    footnote_ref(state, node) {
      state.write(`[^${node.attrs.label as string}]`)
    },
    footnote_definition(state, node) {
      // tight = 源文件里紧贴着上一条定义写。flushClose(1) 只换一行、不留空行,
      // 保住 `[^a]: x` / `[^b]: y` 这种连续写法。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (node.attrs.tight) (state as any).flushClose(1)
      state.write(`[^${node.attrs.label as string}]: `)
      // 第一段紧跟冒号,后续段落缩进 4 空格 —— 标准脚注续行写法。
      // firstDelim 传 '' 因为首段前缀已由上面的 write 写过。
      state.wrapBlock('    ', '', node, () => state.renderContent(node))
    },

    // ── Table nodes ──
    table(state, node) {
      // Collect alignment from header row
      const alignments: string[] = []
      const headerRow = node.child(0)
      headerRow.forEach(cell => {
        alignments.push((cell.attrs.alignment as string) || 'left')
      })

      // Render header row
      renderTableRow(state, headerRow)

      // Render separator
      const sep = alignments.map(a => {
        switch (a) {
          case 'center': return ':---:'
          case 'right': return '---:'
          default: return '---'
        }
      })
      state.write(`| ${sep.join(' | ')} |`)
      state.ensureNewLine()

      // Render data rows
      for (let i = 1; i < node.childCount; i++) {
        renderTableRow(state, node.child(i))
      }
      state.closeBlock(node)
    },
    table_header_row() { /* handled by table */ },
    table_row() { /* handled by table */ },
    table_header(state, node) {
      state.renderInline(node.firstChild!)
    },
    table_cell(state, node) {
      state.renderInline(node.firstChild!)
    },

    // ── Math nodes ──
    math_inline(state, node) {
      state.write(`$${node.textContent}$`)
    },
    math_block(state, node) {
      state.write('$$\n')
      state.text((node.attrs.value as string) || node.textContent, false)
      state.ensureNewLine()
      state.write('$$')
      state.closeBlock(node)
    },

    // ── Definition list nodes ──
    defList(state, node) {
      state.renderContent(node)
    },
    defListTerm(state, node) {
      state.renderInline(node)
      state.closeBlock(node)
    },
    defListDescription(state, node) {
      state.write(':   ')
      state.renderContent(node)
    },

    // ── Fallback for text node (shouldn't be needed but safe) ──
    text(state, node) {
      state.text(node.text || '')
    },
  },
  {
    // ── Mark serializers ──
    strong: {
      open: '**',
      close: '**',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    em: {
      open: '*',
      close: '*',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    code: {
      open(_state: MarkdownSerializerState, mark: Mark, parent: PmNode, index: number) {
        return isPlainURL(mark, parent, index, 1) ? '' : '`'
      },
      close(_state: MarkdownSerializerState, mark: Mark, parent: PmNode, index: number) {
        return isPlainURL(mark, parent, index, -1) ? '' : '`'
      },
      escape: false,
    },
    link: {
      open(_state, mark, parent, index) {
        return isPlainURL(mark, parent, index, 1) ? '<' : '['
      },
      close(state, mark, parent, index) {
        const href = mark.attrs.href as string
        const title = mark.attrs.title as string | null | undefined
        if (isPlainURL(mark, parent, index, -1)) {
          return '>'
        }
        return title
          ? `](${href} "${state.esc(title, false)}")`
          : `](${href})`
      },
      mixable: false,
    },
    strike_through: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    highlight: {
      open(_state: MarkdownSerializerState, mark: Mark) {
        return mark.attrs.delimiter === 'equals' ? '==' : '^^'
      },
      close(_state: MarkdownSerializerState, mark: Mark) {
        return mark.attrs.delimiter === 'equals' ? '==' : '^^'
      },
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    html_mark: {
      open(_state: MarkdownSerializerState, mark: Mark) {
        return mark.attrs.openTag as string
      },
      close(_state: MarkdownSerializerState, mark: Mark) {
        return mark.attrs.closeTag as string
      },
    },
    annotation: {
      open: '{==',
      close(_state: MarkdownSerializerState, mark: Mark) {
        return `==}{>>${sanitizeNote(mark.attrs.note as string)}<<}`
      },
      // mixable so inner marks (**bold** etc.) don't split the annotation
      // into multiple {==…==}{>>…<<} fragments.
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({
    hardBreakNodeName: 'hardbreak',
    strict: false,
  } as any),
)

// Encode text-leaf edges before mark delimiters can consume their whitespace.
// This callback sees text, never list markers, link destinations or fence syntax.
function writeSourceText(state: MarkdownSerializerState, node: PmNode, parent: PmNode, index: number): void {
  const previous = parent.maybeChild(index - 1), next = parent.maybeChild(index + 1)
  const starts = !previous || previous.type.name === 'hardbreak'
    || node.marks.some(mark => !previous.marks.some(other => mark.eq(other)))
  const ends = !next || next.type.name === 'hardbreak'
    || node.marks.some(mark => !next.marks.some(other => mark.eq(other)))
  const value = node.text || ''
  const lines = value.split('\n')
  for (let line = 0; line < lines.length; line++) {
    if (line) state.text('\n', false)
    const text = lines[line]!, leading = line > 0 || starts ? /^[ \t]*/.exec(text)![0].length : 0
    const trailing = line < lines.length - 1 || ends ? /[ \t]*$/.exec(text)![0].length : 0
    const end = Math.max(leading, text.length - trailing)
    for (let i = 0; i < leading; i++) state.text(text[i] === '\t' ? '&#9;' : '&#32;', false)
    if (end > leading) state.text(text.slice(leading, end))
    for (let i = end; i < text.length; i++) state.text(text[i] === '\t' ? '&#9;' : '&#32;', false)
  }
}
export function sourceFenceLength(text:string,character:'`'|'~',minimum:number):number {
 let length=Math.max(3,minimum)
 for(const run of text.match(character==='`'?/`+/g:/~+/g)??[])length=Math.max(length,run.length+1)
 return length
}
function sourceCodeNode(state: MarkdownSerializerState, node: PmNode): void {
  const language = node.attrs.language
  if (typeof language !== 'string' || /[\r\n]/.test(language)) throw new UnsupportedSourceCapture()
  const info = language, character = info.includes('`') ? '~' : '`'
  const length=sourceFenceLength(node.textContent,character,3)
  const fence = character.repeat(length)
  state.write(fence + info + '\n')
  state.text(node.textContent, false)
  state.write('\n')
  state.write(fence)
  state.closeBlock(node)
}
export function sourceEmDelimiter(mark: Mark, parent: PmNode, index: number, opening: boolean): string {
  let from = opening ? index : index - 1, to = from + 1
  while (from > 0 && mark.isInSet(parent.child(from - 1).marks)) from--
  while (to < parent.childCount && mark.isInSet(parent.child(to).marks)) to++
  const left = parent.maybeChild(from - 1), right = parent.maybeChild(to)
  // Encoded whitespace beside an adjacent strong delimiter cannot share its
  // star run. Both ends of this one emphasis run choose the same delimiter.
  const strong = (node: PmNode | null) => node?.marks.some(item => item.type.name === 'strong')
  return strong(left) && /[ \t]$/.test(left!.textContent)
    || strong(right) && /^[ \t]/.test(right!.textContent) ? '_' : '*'
}
export function sourceCodeDelimiter(node: PmNode, opening: boolean): string {
  const text = node.text || '', runs = text.match(/`+/g) || []
  let length = 1
  for (const run of runs) length = Math.max(length, run.length + 1)
  const delimiter = '`'.repeat(length)
  const padding = /^`|`$/.test(text) || /^ .* $/.test(text) && /[^ ]/.test(text)
  return opening ? delimiter + (padding ? ' ' : '') : (padding ? ' ' : '') + delimiter
}
const sourceMarks = Object.fromEntries(Object.entries(serializer.marks).map(([name, mark]) => [
  name, mark.expelEnclosingWhitespace ? { ...mark, expelEnclosingWhitespace: false } : mark,
]))
sourceMarks.em = {
  ...sourceMarks.em!,
  open: (_state, mark, parent, index) => sourceEmDelimiter(mark, parent, index, true),
  close: (_state, mark, parent, index) => sourceEmDelimiter(mark, parent, index, false),
}
sourceMarks.code = {
  ...sourceMarks.code!,
  open: (_state, _mark, parent, index) => sourceCodeDelimiter(parent.child(index), true),
  close: (_state, _mark, parent, index) => sourceCodeDelimiter(parent.child(index - 1), false),
}
const terminalStarts = new WeakMap<PmNode, number>()
const sourceContinuationIndents=new WeakMap<MarkdownSerializerState,number>()
const sourceBlankTails=new WeakMap<MarkdownSerializerState,{terminal:boolean}>()
function renderSourceContainerChildren(state:MarkdownSerializerState,parent:PmNode,skipSchemaPrefix:boolean):void {
 const first=skipSchemaPrefix?1:0
 const empty=(n:PmNode)=>n.type.name==='paragraph'&&n.content.size===0&&n.hasMarkup(n.type)
 let hasEmpty=false
 for(let i=first;i<parent.childCount;i++)if(empty(parent.child(i)))hasEmpty=true
 const current=state as unknown as {out:string;closed:PmNode|null;delim:string;flushClose(size?:number):void}
 const end=()=>{
  if(!sourceContinuationIndents.has(state)&&current.delim&&/^[ ]+$/.test(current.delim))sourceContinuationIndents.set(state,current.delim.length)
 }
 if(!hasEmpty){for(let i=first;i<parent.childCount;i++)state.render(parent.child(i),parent,i);end();return}
 const prefix=()=>current.delim.includes('>')?current.delim.trimEnd():current.delim
 let leftBody=false,afterEmpty=false
 for(let i=first;i<parent.childCount;i++){
  const child=parent.child(i)
  if(empty(child)){
   if(i===first){state.write('');current.closed=null}
   else {current.flushClose(1);state.ensureNewLine();current.out+=prefix();current.closed=null}
   if(i===parent.childCount-1&&!current.delim.includes('>')&&i>first)state.ensureNewLine()
   sourceBlankTails.set(state,{terminal:current.out.endsWith('\n')})
   afterEmpty=true
  }else{
   if(afterEmpty){state.ensureNewLine();if(leftBody)current.out+=prefix()+'\n';current.closed=null}
   state.render(child,parent,i);leftBody=true;afterEmpty=false
  }
 }
 end()
}
const sourceRootSerializer = new MarkdownSerializer({
  ...serializer.nodes,
  text: writeSourceText,
  code_block: sourceCodeNode,
  math_block(state,node) {
    if(node.type===node.type.schema.nodes.math_block&&node.hasMarkup(node.type)&&!node.content.size){state.write('$$ $$');state.closeBlock(node)}
    else serializer.nodes.math_block!(state,node,node,0)
  },
  blockquote(state,node) {
    state.wrapBlock('> ',null,node,()=>renderSourceContainerChildren(state,node,false))
  },
  footnote_definition(state,node) {
    if(node.attrs.tight)(state as any).flushClose(1)
    state.write(`[^${node.attrs.label as string}]: `)
    state.wrapBlock('    ','',node,()=>renderSourceContainerChildren(state,node,false))
  },
  list_item(state,node) {
    if(node.attrs.checked!=null)state.write(node.attrs.checked?'[x] ':'[ ] ')
    const first=node.firstChild
    const skip=node.attrs.checked===null&&first?.type.name==='paragraph'&&first.content.size===0
      &&first.hasMarkup(first.type)&&node.childCount>1&&node.child(1).type.name!=='paragraph'
    renderSourceContainerChildren(state,node,!!skip)
  },
  hardbreak(state, node, parent, index) {
    if (node.attrs.isInline === true) { state.write('\n'); return }
    let start = terminalStarts.get(parent)
    if (start === undefined) {
      start = parent.childCount
      while (start > 0) {
        const previous = parent.child(start - 1)
        if (previous.type.name !== 'hardbreak' || previous.attrs.isInline !== false) break
        start--
      }
      terminalStarts.set(parent, start)
    }
    if (index >= start) state.write('\\\n')
    else serializer.nodes.hardbreak!(state, node, parent, index)
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}, sourceMarks, ({ hardBreakNodeName: 'hardbreak', strict: false } as any))

/** Render only inline content with the same conservative callbacks as roots. */
export function serializeSourceInlineBody(node:PmNode,tableCell=false):string {
  const inline=new MarkdownSerializer({...sourceRootSerializer.nodes,
    [node.type.name](state,body){state.renderInline(body)}},sourceRootSerializer.marks,tableCell?{...sourceRootSerializer.options,escapeExtraCharacters:/\|/g}:sourceRootSerializer.options)
  return inline.serialize(node.type.schema.topNodeType.create(null,[node]))
}

/** Internal source-root renderer; default serializeMarkdown stays unchanged. */
export type SourceListStyle = Readonly<{marker:'-'|'+'|'*'|'.'|')';tight:boolean}>
export type SourceRootRenderOptions = Readonly<{onContinuationIndent?:(indent:number)=>void;onOwnedBlank?:(terminal:boolean)=>void;lists?:readonly Readonly<{node:PmNode;style:SourceListStyle}>[]}>
function renderSourceList(state:MarkdownSerializerState,node:PmNode,style:SourceListStyle,indent:string,firstDelim:(index:number)=>string):void {
  if(node.attrs.tight!==undefined&&node.attrs.tight!==style.tight)throw new UnsupportedSourceCapture()
  const previous=state.options.tightLists
  state.options.tightLists=style.tight
  try{state.renderList(node,indent,firstDelim)}finally{
    if(previous===undefined)delete state.options.tightLists
    else state.options.tightLists=previous
  }
}
export function serializeSourceRootMarkdown(doc: PmNode, options:SourceRootRenderOptions={}): string {
  const styles=new Map(options.lists?.map(binding=>[binding.node,binding.style]))
  const styleFor=(node:PmNode)=>{const style=styles.get(node);if(!style)throw new UnsupportedSourceCapture();return style}
  const current=new MarkdownSerializer({...sourceRootSerializer.nodes,
    bullet_list(state,node){
      const style=styleFor(node)
      if(!['-','+','*'].includes(style.marker))throw new UnsupportedSourceCapture()
      renderSourceList(state,node,style,'  ',()=>style.marker+' ')
    },
    ordered_list(state,node){
      const style=styleFor(node),start=node.attrs.order
      if(!['.',')'].includes(style.marker)||!Number.isInteger(start)||start<0||start>999999999)throw new UnsupportedSourceCapture()
      const number=(i:number)=>start+i<=999999999?start+i:start
      const width=String(number(node.childCount-1)).length+2
      renderSourceList(state,node,style,' '.repeat(width),i=>String(number(i)).padStart(width-2,' ')+style.marker+' ')
    },
  },sourceRootSerializer.marks,sourceRootSerializer.options)
  let lastState:MarkdownSerializerState|undefined
  for(const [name,render] of Object.entries(current.nodes))current.nodes[name]=(state,node,parent,index)=>{
    lastState=state;sourceBlankTails.delete(state);sourceContinuationIndents.delete(state);render(state,node,parent,index)
  }
  const result = current.serialize(doc, {tightLists:true})
  const blank=lastState&&sourceBlankTails.get(lastState)
  if(blank)options.onOwnedBlank?.(blank.terminal)
  const indent=lastState&&sourceContinuationIndents.get(lastState)
  if(indent!==undefined)options.onContinuationIndent?.(indent)
  return result.replace(/\u200B/g, '')
}

/**
 * Helper: render a table row as `| cell1 | cell2 | ... |`
 *
 * Uses ProseMirror's built-in renderInline via output-buffer capture so that
 * ALL inline content (text, marks, hard breaks, math, images, etc.) is
 * serialized correctly — the same path used for headings and paragraphs.
 */
function renderTableRow(state: MarkdownSerializerState, row: PmNode) {
  const cells: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = state as any
  row.forEach(cell => {
    // Cells with 'paragraph+' content: each paragraph is one "line" in the cell.
    // GFM cells are single-line, so join multiple paragraphs with a space.
    const parts: string[] = []
    cell.forEach(para => {
      if (para.type.name !== 'paragraph') return
      // Capture renderInline output by swapping the serializer's output buffer.
      //
      // IMPORTANT: prosemirror-markdown's text() calls write() for every line,
      // and write() calls flushClose() which resets this.closed. We must save
      // and restore out, closed and the container delimiter. Cell inline
      // content must not capture the surrounding quote/list prefix, while
      // the pending block-separator (the
      // blank line between the preceding paragraph and this table) is not
      // accidentally consumed here — it must survive until state.write('| … |')
      // fires at the end of this function, where flushClose() will emit it.
      const savedOut: string = s.out
      const savedClosed = s.closed
      const savedDelim = s.delim
      s.delim = ''
      s.out = ''
      s.closed = null
      state.renderInline(para)
      const piece: string = (s.out as string).replace(/\n/g, ' ').trim()
      s.out = savedOut
      s.closed = savedClosed
      s.delim = savedDelim
      parts.push(piece)
    })
    cells.push(parts.join(' '))
  })
  state.write(`| ${cells.join(' | ')} |`)
  state.ensureNewLine()
}

/**
 * Clean a note string so it cannot break out of its CriticMarkup container:
 * newlines would end the inline run, and a literal `<<}` would close it early.
 */
function sanitizeNote(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/<<\}/g, '< <}')
}

/**
 * Check if a link mark represents a plain URL (autolink style).
 * If so, serialize as `<url>` instead of `[text](url)`.
 */
function isPlainURL(mark: Mark, parent: PmNode, index: number, side: number): boolean {
  if (mark.attrs.title || !/^\w+:/.test(mark.attrs.href as string)) return false
  const content = parent.child(index + (side < 0 ? -1 : 0))
  if (
    !content.isText ||
    content.text !== mark.attrs.href ||
    content.marks[content.marks.length - 1] !== mark
  ) {
    return false
  }
  if (index === (side < 0 ? 1 : parent.childCount - 1)) return true
  const next = parent.child(index + (side < 0 ? -2 : 1))
  return !mark.isInSet(next.marks)
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Ensure display math blocks ($$…$$) are surrounded by blank lines so
 * markdown-it-texmath parses them as math_block, not math_inline_double.
 * Without blank lines, they get absorbed into the preceding paragraph as
 * inline tokens, causing wrong rendering and roundtrip corruption.
 */
function normalizeMathBlocks(text: string, edits?: TraceEdit[]): string {
  if (!text.includes('$$')) return text

  const lines = text.split('\n')
  const starts: number[] = []
  if (edits) {
    let offset = 0
    for (const line of lines) { starts.push(offset); offset += line.length + 1 }
  }
  const result: string[] = []
  let inFence = false
  let inMathBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip fenced code blocks
    if (!inMathBlock && /^(`{3,}|~{3,})/.test(trimmed)) {
      inFence = !inFence
      result.push(line)
      continue
    }
    if (inFence) {
      result.push(line)
      continue
    }

    if (trimmed === '$$') {
      if (!inMathBlock) {
        // Opening $$: ensure blank line before
        const last = result[result.length - 1]
        if (result.length > 0 && last !== undefined && last.trim() !== '') {
          result.push('')
          if (edits) edits.push({ from: starts[i]!, to: starts[i]!, text: '\n' })
        }
        result.push(line)
        inMathBlock = true
      } else {
        // Closing $$
        result.push(line)
        inMathBlock = false
        // Ensure blank line after if next line is non-empty
        const next = lines[i + 1]
        if (next !== undefined && next.trim() !== '') {
          result.push('')
          if (edits) edits.push({ from: starts[i + 1]!, to: starts[i + 1]!, text: '\n' })
        }
      }
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Normalize smart/curly quotes to straight quotes in markdown syntax positions.
 * Only targets image/link title delimiters to preserve intentional smart quotes in prose.
 * Pattern: `](url "title")` or `](url 'title')` with curly quotes.
 */
type QuoteTraceObserver = (before: string, after: string, edits: readonly TraceEdit[]) => void
function normalizeSmartQuotes(text: string, observe?: QuoteTraceObserver): string {
  if (!/[“”„‟‘’‚‛]/.test(text)) return text
  const passes: [RegExp, string][] = [
    [/(\]\([^\n)]*\s)“([^”\n]*)”(\s*\))/g, '"'],
    [/(\]\([^\n)]*\s)“([^”\n]*)”(\s*\))/g, '"'],
    [/(\]\([^\n)]*\s)‘([^’\n]*)’(\s*\))/g, "'"],
  ]
  for (const [pattern, quote] of passes) {
    const before = text, edits: TraceEdit[] = []
    text = text.replace(pattern, (_m, pre: string, title: string, post: string, offset: number) => {
      if (observe) {
        const left = offset + pre.length, right = left + 1 + title.length
        edits.push({ from: left, to: left + 1, text: quote }, { from: right, to: right + 1, text: quote })
      }
      return pre + quote + title + quote + post
    })
    observe?.(before, text, edits)
  }
  return text
}

/**
 * Parse a markdown string into a ProseMirror document node. Never throws (§4.5).
 *
 * @param markdown   Source markdown string (may contain frontmatter, math, html, etc.).
 * @param schemaArg  Optional consumer schema. When provided, the returned doc's
 *                   `node.type` references the consumer's NodeType identities,
 *                   allowing it to be loaded directly into an `EditorState.create`
 *                   built with that same schema. Defaults to {@link defaultSchema}.
 */
export function parseMarkdown(markdown: string, schemaArg?: Schema): PmNode {
  const p = getParserFor(schemaArg)
  try {
    return p.parse(normalizeSmartQuotes(normalizeMathBlocks(markdown)))
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[parseMarkdown] best-effort fallback for malformed input:', err)
    }
    return p.schema.topNodeType.createAndFill()!
  }
}

const ASYNC_PARSE_THRESHOLD = 50_000

/**
 * Async version of parseMarkdown. For large files (≥50KB), yields to the
 * event loop via setTimeout(0) so the main thread stays responsive.
 * §4.5: never rejects.
 */
export function parseMarkdownAsync(markdown: string, schemaArg?: Schema): Promise<PmNode> {
  const p = getParserFor(schemaArg)
  const normalized = normalizeSmartQuotes(normalizeMathBlocks(markdown))
  if (normalized.length < ASYNC_PARSE_THRESHOLD) {
    return Promise.resolve(parseMarkdown(normalized, schemaArg))
  }
  return new Promise(resolve => setTimeout(() => {
    try {
      resolve(p.parse(normalized))
    } catch {
      resolve(p.schema.topNodeType.createAndFill()!)
    }
  }, 0))
}

// 每一组各试一次。分组而不是整体一把梭,是为了让一处必须保留的转义(例如字面量
// `\*star\*`)不至于连累同一文档里其他本可以松掉的转义(例如 `a\[0\]`)。
// 不含 `\\` —— 去掉反斜杠自身的转义会改变语义。
const ESCAPE_RELAX_GROUPS: RegExp[] = [
  /\\([[\]])/g,
  /\\(\*)/g,
  /\\([`~_])/g,
  /\\(#)/g,
  /\\([-+>.])/g,
]

const HAS_RELAXABLE_ESCAPE = /\\[`*#~_[\]\-+>.]/

/**
 * 松弛 prosemirror-markdown `esc()` 的过度转义。
 *
 * `esc()` 无条件转义 `` ` * \ ~ [ ] _ ``(行首另加 `- + > # 数字.`),于是正文里任何
 * 方括号都会被改写:`数组 a[0]` 存盘变成 `a\[0\]`,`[^loop]` 变成 `\[^loop\]`。对一个
 * 以 file-over-app 为硬原则的编辑器来说,这是每次保存都在悄悄改用户的文件。
 *
 * 但直接放宽转义规则是危险的:转义少了会让纯文本被解析成语法(字面量 `\*star\*` 变成
 * 斜体),那是语义级破坏,比多几个反斜杠严重得多。
 *
 * 所以这里不预测哪些转义"可以去掉",而是**去掉之后重新解析、验证文档没变**——
 * 让解析器自己当裁判。等价才采纳,存疑就保留。代价是含转义的文档多几次解析;
 * 不含转义的文档(绝大多数)走快速路径,零开销。
 *
 * 这同时取代了旧的链接 un-escape 正则(`\[x\](y)` → `[x](y)`):那条规则不看上下文,
 * 会把用户**故意**转义的字面量 `\[文档](url)` 还原成一个真链接。
 */
function relaxEscapes(md: string, doc: PmNode): string {
  if (!HAS_RELAXABLE_ESCAPE.test(md)) return md

  let reference: string
  try {
    reference = JSON.stringify(doc.toJSON())
  } catch {
    return md
  }

  let current = md
  for (const re of ESCAPE_RELAX_GROUPS) {
    const candidate = current.replace(re, '$1')
    if (candidate === current) continue
    try {
      // 走 parseMarkdown 而非裸 parser,确保与真实解析路径(含 smart-quote /
      // math-block 归一化)完全一致,否则等价判断会失真。
      if (JSON.stringify(parseMarkdown(candidate).toJSON()) === reference) current = candidate
    } catch {
      // 解析失败 → 这一组不安全,保留转义。
    }
  }
  return current
}

/**
 * Serialize a ProseMirror document node to a markdown string. Never throws (§4.5).
 */
export function serializeMarkdown(doc: PmNode): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result = serializer.serialize(doc, ({ tightLists: true } as any))
  result = relaxEscapes(result, doc)
  // Strip zero-width spaces used as cursor targets after inline code marks.
  result = result.replace(/​/g, '')
  return result
}

class UnsupportedSourceCapture extends Error {}

/** Internal experimental hook. Never uses parseMarkdown's empty-doc fallback. */
export function parseDocumentWithSourceCapture(source: string, schema?: Schema):
  { ok: true; value: CapturedDocument } | { ok: false; reason: 'unsupported-source' | 'parse-error' } {
  return captureFilePipeline(source, schema)
}

function finalizeCapturedDocument(collector: Capture, doc: PmNode): CapturedDocument {
  const source = collector.source
    // One occurrence index; equal/reused immutable nodes at different positions
    // never grant each other authority. Atoms leave position holes.
    const text:{node:PmNode;parentFrom:number;from:number;to:number}[]=[]
    const occurrences=new Set<number>(),emitted=new Map<PmNode,InlineEmission>()
    for(const emission of collector.emissions){
      if(!emission.node||emitted.has(emission.node))throw new UnsupportedSourceCapture()
      emitted.set(emission.node,emission)
    }
    const emptyParents=new Map<number,PmNode>();let rootIndex=0
    doc.descendants((parent,offset)=>{
      if(!capturedTextParents.includes(parent.type.name))return
      const from=offset+1,emission=emitted.get(parent)
      if(parent.content.size===0)emptyParents.set(from,parent)
      while(collector.roots[rootIndex]&&collector.roots[rootIndex]!.pmTo<=from)rootIndex++
      const root=collector.roots[rootIndex]
      if(emission){
        emitted.delete(parent);occurrences.add(from)
        if(parent.content.size!==emission.to-emission.from||parent.type.name!==emission.kind)throw new UnsupportedSourceCapture()
        const delta=from-emission.from
        for(let i=emission.runFrom;i<emission.runTo;i++){
          const run=collector.runs[i]!
          if(run.pmFrom<emission.from||run.pmTo>emission.to)throw new UnsupportedSourceCapture()
          run.pmFrom+=delta;run.pmTo+=delta
        }
        if(emission.empty&&parent.content.size===0)collector.emptyBodies.push({pmAt:from,parent,place:emission.empty,...(root&&root.pmFrom<from&&from<root.pmTo?{rootId:root.id}:{})})
        if(emission.body){
          const body=collector.bodies.length
          collector.bodies.push({...emission.body,pmFrom:from,pmTo:from+parent.content.size})
          for(let i=emission.atomFrom??0;i<(emission.atomTo??0);i++){
            const atom=collector.atoms[i]!,pmFrom=atom.pmFrom+delta,pmTo=atom.pmTo+delta
            if(pmFrom<from||pmTo>from+parent.content.size||doc.nodeAt(pmFrom)!==atom.node||pmTo-pmFrom!==atom.node.nodeSize)throw new UnsupportedSourceCapture()
            collector.atoms[i]={...atom,body,pmFrom,pmTo}
          }
          for(const separator of emission.separators??[]){
            let entry=collector.separators.find(s=>s.range.from===separator.range.from&&s.range.to===separator.range.to)
            if(!entry){entry={range:separator.range,...(separator.definition?{definition:separator.definition}:{})};collector.separators.push(entry)}
            if(entry[separator.side]!==undefined)throw new UnsupportedSourceCapture()
            entry[separator.side]=body
          }
          for(let i=emission.criticFrom??0;i<(emission.criticTo??0);i++){
            const critic=collector.critic[i]!
            collector.critic[i]={...critic,body,pmFrom:critic.pmFrom+delta,pmTo:critic.pmTo+delta}
          }
          for(let i=emission.edgeFrom??0;i<(emission.edgeTo??0);i++){
            const edge=collector.edges[i]!
            collector.edges[i]={...edge,body,pmFrom:edge.pmFrom+delta,pmTo:edge.pmTo+delta}
          }
        }
        if(emission.fence)collector.fences.push({...emission.fence,pmFrom:offset,pmTo:offset+parent.nodeSize})
      }
      parent.forEach((node,inner)=>{if(node.isText)text.push({node,parentFrom:from,from:from+inner,to:from+inner+node.nodeSize})})
      return false
    })
    if(emitted.size)throw new UnsupportedSourceCapture()
    let pmEnd = 0, sourceEnd = 0, textIndex = 0
    for (const run of collector.runs) {
      if (run.pmFrom < pmEnd || run.pmTo <= run.pmFrom || run.pmTo > doc.content.size
        || run.sourceFrom < sourceEnd || run.sourceTo <= run.sourceFrom || run.sourceTo > source.length
        || (run.kind === 'linear' && run.sourceTo - run.sourceFrom !== run.pmTo - run.pmFrom)) {
        throw new UnsupportedSourceCapture()
      }
      while (textIndex < text.length && text[textIndex]!.to <= run.pmFrom) textIndex++
      const paragraph = text[textIndex]?.parentFrom
      if(paragraph===undefined||!occurrences.has(paragraph))throw new UnsupportedSourceCapture()
      let pos = run.pmFrom
      while (pos < run.pmTo) {
        const part = text[textIndex]
        if (!part || part.parentFrom !== paragraph || part.from > pos || part.to <= pos
          || part.node.marks.some(mark => !capturedTextMarks.includes(mark.type.name))) {
          throw new UnsupportedSourceCapture()
        }
        const end = Math.min(part.to, run.pmTo)
        if (run.kind === 'linear' && source.slice(run.sourceFrom + pos - run.pmFrom, run.sourceFrom + end - run.pmFrom)
          !== part.node.text!.slice(pos - part.from, end - part.from)) throw new UnsupportedSourceCapture()
        pos = end
        if (pos === part.to) textIndex++
      }
      pmEnd = run.pmTo
      sourceEnd = run.sourceTo
    }
    const lists = finishSourceLists(doc, collector)
    const layout = finishSourceLayout(collector.blankLines, collector.fallback, lists)
    const layoutBody=(pmFrom:number,place:EmptyPlace)=>{
      const parent=emptyParents.get(pmFrom+1)
      if(parent&&parent.type.name==='paragraph'&&parent.hasMarkup(parent.type)&&!parent.content.size)
        collector.emptyBodies.push({pmAt:pmFrom+1,parent,place})
    }
    for(const u of layout.blankLines)if(u.role==='empty-paragraph')layoutBody(u.emission.pmFrom,{kind:'layout',origin:{kind:'blank',id:u.id}})
    if(layout.fallback)layoutBody(layout.fallback.emission.pmFrom,{kind:'layout',origin:{kind:'fallback'}})
    capturedListLayouts.set(layout, { recipe:Object.freeze({definitionSeparators:Object.freeze(collector.separators.filter(s=>s.definition&&(s.left!==undefined||s.right!==undefined)&&collector.protectedSources.some(p=>p.kind===s.definition!.kind&&p.scope===s.definition!.scope&&p.sourceFrom===s.definition!.sourceFrom&&p.sourceTo===s.definition!.sourceTo)).map(s=>Object.freeze({body:s.left??s.right!,side:s.left!==undefined?'after' as const:'before' as const,definition:Object.freeze(s.definition!),range:Object.freeze(s.range)}))),separators:Object.freeze(collector.separators.filter(s=>s.left!==undefined&&s.right!==undefined).map(s=>Object.freeze({left:s.left!,right:s.right!,range:Object.freeze(s.range)}))),critic:Object.freeze(collector.critic.filter(c=>c.body>=0).map(c=>Object.freeze(c))),atoms:Object.freeze(collector.atoms.filter(a=>a.body>=0).map(a=>Object.freeze(a))),bodies:Object.freeze(collector.bodies.map((b,body)=>Object.freeze({...b,body}))),edges:Object.freeze(collector.edges.filter(e=>e.body>=0).map(e=>Object.freeze(e))),fences:Object.freeze(collector.fences.map(f=>Object.freeze(f)))}),emptyBodies:Object.freeze(collector.emptyBodies.map(f=>Object.freeze(f))), source, doc, roots: collector.roots, lists, bodies:Object.freeze(collector.bodies.map(body=>Object.freeze(body))) })
    return { doc, textRuns: collector.runs,
      protectedSources: Object.freeze(collector.protectedSources),
      layout,
      roots: collector.roots, gaps: buildSourceGaps(source, collector.roots, collector.synthetic) }
}

/** Compatibility hook for callers requiring a fully mapped ordinary paragraph. */
export function parseParagraphWithSourceCapture(source: string, schema?: Schema):
  { ok: true; value: CapturedParagraph } | { ok: false; reason: 'unsupported-source' | 'parse-error' } {
  const parsed = parseDocumentWithSourceCapture(source, schema)
  if (!parsed.ok) return parsed
  const { doc, textRuns } = parsed.value
  if (doc.childCount !== 1 || doc.firstChild?.type.name !== 'paragraph') return { ok: false, reason: 'unsupported-source' }
  let pos = 1, supported = true
  for (const run of textRuns) {
    if (run.pmFrom !== pos) supported = false
    pos = run.pmTo
  }
  doc.firstChild.forEach(node => {
    if (!node.isText || node.marks.some(mark => !['em', 'strong', 'link'].includes(mark.type.name))) supported = false
  })
  return supported && pos === doc.content.size - 1 ? parsed : { ok: false, reason: 'unsupported-source' }
}

// A file capture owns every mutable parser object. Cached tokens are never
// handed to the ProseMirror handlers, which consume checkbox/media tokens.
type ActualToken = ReturnType<MarkdownIt['parse']>[number]
export type FileWorkAccumulator = { -readonly [K in keyof FileParseWork]: FileParseWork[K] }
export type FileDefinition = Readonly<{
  kind: 'reference' | 'footnote'; label: string; sourceFrom: number; sourceTo: number
  scope: 'top-level' | 'nested'; href?: string; title?: string
}>
type BlockScalars = Pick<StateBlock, 'parentType' | 'tight' | 'blkIndent' | 'level' | 'ddIndent' | 'listIndent'>
export type FileCheckpoint = Readonly<{
  line: number; offset: number; tokenIndex: number; definitionIndex: number
  hasEmptyLines: boolean; state: BlockScalars
}>
type FileCaptureState = {
  work: FileWorkAccumulator; checkpoints: FileCheckpoint[]; definitions: FileDefinition[]
  blockTokens: ActualToken[]; effects: string[][]; activeEffects?: string[]
}
export type FileTokenCache = Readonly<{
  source: string; trace: SourceTrace; lineStarts: readonly number[]
  blockTokens: readonly ActualToken[]; inlineTokens: readonly ActualToken[]
  checkpoints: readonly FileCheckpoint[]; definitions: readonly FileDefinition[]
  effects: readonly (readonly string[])[]
}>
export type FileCaptureResult = { ok: true; value: CapturedDocument; cache: FileTokenCache }
  | { ok: false; reason: 'unsupported-source' | 'parse-error' }

function newFileWork(): FileWorkAccumulator {
  return { mode: 'unchanged', blockWindows: [], blockParseCalls: 0, topLevelRunnerCalls: 0,
    blockRuleCalls: 0, nestedTokenizeCalls: 0, blockLinesVisited: 0, inlineParseCalls: 0,
    inlineInputUnits: 0, inlineRoots: [], rawTouchedBeforeRoots: [], environmentChanged: false,
    legacyParseCalls: 0, fullCaptureCalls: 0, pmEmissionTokenCount: 0, preprocessedCodeUnits: 0,
    lineTableCodeUnits: 0, rawSplicedCodeUnits: 0, inlineEffectReplayCount: 0 }
}

export function preprocessFileSource(source: string): SourceTrace {
  let trace = identityTrace(source)
  if (source.charCodeAt(0) === 0xFEFF) trace = editTrace(trace, [{ from: 0, to: 1, text: '' }])
  const mathEdits: TraceEdit[] = []
  const math = normalizeMathBlocks(trace.text, mathEdits)
  trace = editTrace(trace, mathEdits)
  if (trace.text !== math) throw new UnsupportedSourceCapture()
  normalizeSmartQuotes(math, (before, after, edits) => {
    if (trace.text !== before) throw new UnsupportedSourceCapture()
    trace = editTrace(trace, edits)
    if (trace.text !== after) throw new UnsupportedSourceCapture()
  })
  return trace
}

function newFileCollector(source: string, trace: SourceTrace, work: FileWorkAccumulator): Capture {
  return { source, trace, separators:[], critic:[], atoms:[], edges:[], fences:[], emptyBodies:[], bodies: [], emissions: [], lineStarts: [], protectedSources: [], runs: [], roots: [], synthetic: [], blankLines: [], lists: [],
    file: { work, checkpoints: [], definitions: [], blockTokens: [], effects: [] } }
}

// The installed plugins use primitive values, arrays and ordinary records in
// metadata. Reject an unrecognised object rather than erase its prototype.
function cloneTokenValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') throw new UnsupportedSourceCapture()
    return value
  }
  if (Array.isArray(value)) return value.map(cloneTokenValue)
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) throw new UnsupportedSourceCapture()
  const copy: Record<string, unknown> = Object.create(proto)
  for (const [key, item] of Object.entries(value)) copy[key] = cloneTokenValue(item)
  return copy
}

function shiftTrace(trace: SourceTrace, delta: number): SourceTrace {
  return delta === 0 ? trace : { text: trace.text, pieces: trace.pieces.map(p => ({ ...p,
    sourceFrom: p.sourceFrom + delta, sourceTo: p.sourceTo + delta })) }
}

function shiftEmpty(place:EmptyPlace,delta:number,lines:number):EmptyPlace {
 const range=(r:RawRange):RawRange=>({from:r.from+delta,to:r.to+delta})
 const prefix=(p:SourcePrefix):SourcePrefix=>p.map(r=>'spaces' in r?r:range(r))
 switch(place.kind){
  case 'inline':return {...place,range:range(place.range)}
  case 'missing-cell':return {...place,at:place.at+delta,row:place.row+lines}
  case 'literal':return {...place,at:place.at+delta,eol:range(place.eol),prefix:prefix(place.prefix),...(place.terminal?{terminal:range(place.terminal)}:{})}
  case 'prepend':return {...place,at:place.at+delta,continuation:prefix(place.continuation),eol:place.eol?range(place.eol):undefined}
  case 'nested-blank':return {...place,range:range(place.range),prefix:prefix(place.prefix),...(place.eol?{eol:range(place.eol)}:{})}
  case 'layout':return place
 }
}
function cloneTokenBatch(tokens: readonly ActualToken[], collector: Capture, rawDelta = 0, lineDelta = 0): ActualToken[] {
  const clone = (token: ActualToken): ActualToken => {
    const copy: ActualToken = Object.create(Object.getPrototypeOf(token))
    for (const [key, value] of Object.entries(token)) {
      if (key !== 'children') Object.defineProperty(copy, key, { value: cloneTokenValue(value), writable: true, enumerable: true, configurable: true })
    }
    copy.children = token.children ? token.children.map(clone) : null
    if (copy.map) copy.map = [copy.map[0] + lineDelta, copy.map[1] + lineDelta]
    if (token.children && copy.children) {
      const owner = owners.get(token.children)
      if (owner) owners.set(copy.children, shiftTrace(owner, rawDelta))
      if (tokenArrays.has(token)) tokenArrays.set(copy, copy.children)
    }
    const provenance = tokenSources.get(token)
    if (provenance) tokenSources.set(copy, { collector, runs: provenance.runs.map(run => run.trace
      ? { text: run.text, kind: run.kind, trace: shiftTrace(run.trace, rawDelta) } : { text: run.text }) })
    if(token.type==='inline'){
      const fact=inlineFacts.get(token)
      inlineFacts.set(copy,{collector,...(fact?.empty?{empty:shiftEmpty(fact.empty,rawDelta,lineDelta)}:{}),...(fact?.trimEnd!==undefined?{trimEnd:fact.trimEnd+rawDelta}:{}),...(fact?.kind?{kind:fact.kind}:{}),...(fact?.trace?{trace:shiftTrace(fact.trace,rawDelta)}:{})})
    }
    const literal=literalFacts.get(token)
    if(literal)literalFacts.set(copy,{collector,trace:shiftTrace(literal.trace,rawDelta),kind:literal.kind,...(literal.empty?{empty:shiftEmpty(literal.empty,rawDelta,lineDelta)}:{})})
    const container=containerEnds.get(token)
    if(container)containerEnds.set(copy,{collector,kind:container.kind,place:shiftEmpty(container.place,rawDelta,lineDelta)})
    const pending=nestedBlanks.get(token)
    if(pending)nestedBlanks.set(copy,pending.map(p=>({...p,line:p.line+lineDelta,place:shiftEmpty(p.place,rawDelta,lineDelta)})))
    const edge=edgeTokens.get(token)
    const shift=(r:{from:number;to:number})=>({from:r.from+rawDelta,to:r.to+rawDelta})
    const separators=separatorTokens.get(token);if(separators)separatorTokens.set(copy,separators.map(s=>({...s,range:shift(s.range),...(s.definition?{definition:{...s.definition,sourceFrom:s.definition.sourceFrom+rawDelta,sourceTo:s.definition.sourceTo+rawDelta}}:{})})))
    const critic=criticTokens.get(token)
    if(critic)criticTokens.set(copy,{...critic,syntaxFrom:critic.syntaxFrom+rawDelta,syntaxTo:critic.syntaxTo+rawDelta,noteFrom:critic.noteFrom+rawDelta,noteTo:critic.noteTo+rawDelta,close:shift(critic.close),...(critic.open?{open:shift(critic.open)}:{}),...(critic.middle?{middle:shift(critic.middle)}:{})})
    const atom=atomTokenRanges.get(token);if(atom)atomTokenRanges.set(copy,shift(atom))
    const html=htmlTokenRanges.get(token);if(html)htmlTokenRanges.set(copy,shift(html))
    if(edge)edgeTokens.set(copy,{...edge,open:shift(edge.open),close:shift(edge.close)})
    const fence=fenceTokens.get(token)
    if(fence)fenceTokens.set(copy,{...fence,sourceFrom:fence.sourceFrom+rawDelta,sourceTo:fence.sourceTo+rawDelta,open:shift(fence.open),close:shift(fence.close)})
    const closed = capturedFenceClosed.get(token)
    if (closed !== undefined) capturedFenceClosed.set(copy, closed)
    return copy
  }
  return tokens.map(clone)
}

function countTokens(tokens: readonly ActualToken[]): number {
  let count = 0
  const pending: (readonly ActualToken[])[] = [tokens]
  while (pending.length) for (const token of pending.pop()!) {
    count++
    if (token.children) pending.push(token.children)
  }
  return count
}

function injectNestedBlanks(tokens:ActualToken[],collector:Capture):ActualToken[] {
 const result:ActualToken[]=[]
 for(const token of tokens){
  for(const pending of nestedBlanks.get(token)??[]){
   const make=(type:string,tag:string,nesting:number,level:number):ActualToken=>({type,tag,nesting,level,
    content:'',children:null,attrs:null,info:'',meta:null,map:null,block:true,hidden:false,markup:''} as ActualToken)
   const open=make('paragraph_open','p',1,pending.level),inline=make('inline','',0,pending.level+1),close=make('paragraph_close','p',-1,pending.level)
   inline.children=[];inline.block=false
   inlineFacts.set(inline,{collector,empty:pending.place})
   result.push(open,inline,close)
  }
  result.push(token)
 }
 return result
}
function emitCapturedTokens(tokens: readonly ActualToken[], collector: Capture, schema?: Schema): PmNode {
  let batch = cloneTokenBatch(tokens, collector)
  tagPairedHtmlInline(batch)
  fixFootnoteDefMaps(batch)
  prepareListEvents(batch, collector)
  batch = injectNestedBlanks(batch,collector)
  batch = prepareRootEvents(batch, collector) as ActualToken[]
  collector.file!.work.pmEmissionTokenCount += countTokens(batch)
  const tokenizer: MarkdownIt = Object.create(md)
  let used = false
  tokenizer.parse = () => {
    if (used) throw new UnsupportedSourceCapture()
    used = true
    return batch
  }
  const doc = new MorayaMarkdownParser(schema, tokenizer).parse(collector.trace.text, { [captureKey]: collector })
  if (!used) throw new UnsupportedSourceCapture()
  return doc
}

function captureFailure(error: unknown): { ok: false; reason: 'unsupported-source' | 'parse-error' } {
  return { ok: false, reason: error instanceof UnsupportedSourceCapture || error instanceof UnsupportedOwnership ? 'unsupported-source' : 'parse-error' }
}

export function captureFilePipeline(source: string, schema?: Schema, work: FileWorkAccumulator = newFileWork()): FileCaptureResult {
  if (!captureAvailable || !fileHooksValid()) return { ok: false, reason: 'unsupported-source' }
  try {
    work.fullCaptureCalls++
    work.blockWindows = [...work.blockWindows, { sourceFrom: 0, sourceTo: source.length }]
    work.preprocessedCodeUnits += source.length
    const collector = newFileCollector(source, preprocessFileSource(source), work)
    const tokens = _origMdParse(collector.trace.text, { [captureKey]: collector })
    const file = collector.file!
    const cache: FileTokenCache = { source, trace: collector.trace, lineStarts: collector.lineStarts,
      blockTokens: file.blockTokens, inlineTokens: cloneTokenBatch(tokens, collector),
      checkpoints: file.checkpoints, definitions: file.definitions, effects: file.effects }
    const doc = emitCapturedTokens(cache.inlineTokens, collector, schema)
    return { ok: true, value: finalizeCapturedDocument(collector, doc), cache }
  } catch (error) { return captureFailure(error) }
}

export function replayFilePipeline(cache: FileTokenCache, schema?: Schema, work: FileWorkAccumulator = newFileWork()): FileCaptureResult {
  if (!captureAvailable || !fileHooksValid()) return { ok: false, reason: 'unsupported-source' }
  try {
    const collector = newFileCollector(cache.source, cache.trace, work)
    collector.lineStarts = [...cache.lineStarts]
    collector.protectedSources = cache.definitions.filter(d => d.kind === 'reference').map(d => ({
      kind: 'reference-definition', sourceFrom: d.sourceFrom, sourceTo: d.sourceTo, scope: d.scope }))
    return { ok: true, value: finalizeCapturedDocument(collector, emitCapturedTokens(cache.inlineTokens, collector, schema)), cache }
  } catch (error) { return captureFailure(error) }
}

function blockScalars(state: StateBlock): BlockScalars {
  return { parentType: state.parentType, tight: state.tight, blkIndent: state.blkIndent,
    level: state.level, ddIndent: state.ddIndent, listIndent: state.listIndent }
}

function newCheckedBlockState(src: string, env: object, tokens: ActualToken[], work: FileWorkAccumulator): StateBlock {
  const state = new md.block.State(src, md, env, tokens)
  work.lineTableCodeUnits += src.length
  for (const name of ['bMarks', 'eMarks', 'tShift', 'sCount', 'bsCount'] as const) {
    const table = state[name]
    if (!Array.isArray(table) || table.length !== state.lineMax + 1) throw new UnsupportedSourceCapture()
    state[name] = new Proxy(table, { get(target, key, receiver) {
      if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) work.blockLinesVisited++
      return Reflect.get(target, key, receiver)
    } })
  }
  if (state.src !== src || state.tokens !== tokens || state.env !== env || state.line !== 0
    || state.parentType !== 'root' || state.level !== 0 || state.ddIndent !== -1 || state.listIndent !== -1)
    throw new UnsupportedSourceCapture()
  return state
}

function runTopLevelWindow(state: StateBlock, cursor: { line: number; hasEmptyLines: boolean }, stopAfterEpilogue: (checkpoint: FileCheckpoint) => boolean, work: FileWorkAccumulator): void {
  work.topLevelRunnerCalls++
  const file = collectorFor(state)!.file!, rules = md.block.ruler.getRules('')
  const checkpoint = (): FileCheckpoint => ({ line: cursor.line, offset: state.bMarks[cursor.line]!,
    tokenIndex: state.tokens.length, definitionIndex: file.definitions.length,
    hasEmptyLines: cursor.hasEmptyLines, state: blockScalars(state) })
  file.checkpoints.push(checkpoint())
  while (cursor.line < state.lineMax) {
    state.line = cursor.line = state.skipEmptyLines(cursor.line)
    if (cursor.line >= state.lineMax || state.sCount[cursor.line]! < state.blkIndent) break
    const maxNesting = (state.md.options as { maxNesting?: number }).maxNesting
    if (typeof maxNesting !== 'number') throw new UnsupportedSourceCapture()
    if (state.level >= maxNesting) { state.line = state.lineMax; break }
    const previous = state.line
    let accepted = false
    for (const rule of rules) {
      if (rule(state, cursor.line, state.lineMax, false)) { accepted = true; break }
    }
    if (!accepted || state.line <= previous) throw new UnsupportedSourceCapture()
    state.tight = !cursor.hasEmptyLines
    if (state.isEmpty(state.line - 1)) cursor.hasEmptyLines = true
    cursor.line = state.line
    if (cursor.line < state.lineMax && state.isEmpty(cursor.line)) { cursor.hasEmptyLines = true; state.line = ++cursor.line }
    const next = checkpoint()
    file.checkpoints.push(next)
    if (stopAfterEpilogue(next)) return
  }
}

// Fixed wrappers dispatch only when the per-call collector requests a file
// pipeline. Ordinary Markdown parsing retains the installed parser behavior.
md.block.parse = function (src, engine, env, tokens) {
  const file = env?.[captureKey]?.file as FileCaptureState | undefined
  if (!file) return Object.getPrototypeOf(md.block).parse.call(this, src, engine, env, tokens)
  file.work.blockParseCalls++
  if (!src) return
  runTopLevelWindow(newCheckedBlockState(src, env, tokens, file.work), { line: 0, hasEmptyLines: false }, () => false, file.work)
}
const originalNestedTokenize = md.block.tokenize
md.block.tokenize = function (state, start, end) {
  const file = collectorFor(state)?.file
  if (file) file.work.nestedTokenizeCalls++
  return originalNestedTokenize.call(this, state, start, end)
}
md.inline.parse = function (src, engine, env, tokens) {
  const file = env?.[captureKey]?.file as FileCaptureState | undefined
  const outer = file && !file.activeEffects
  if (file) {
    file.work.inlineParseCalls++; file.work.inlineInputUnits += src.length
    if (outer) { file.activeEffects = []; file.effects.push(file.activeEffects) }
  }
  try { return Object.getPrototypeOf(md.inline).parse.call(this, src, engine, env, tokens) } finally {
    if (outer) delete file!.activeEffects
  }
}

wrapCaptureRule(md.block.ruler, 'footnote_def', function observeFootnoteDefinition(original, state, startLine, endLine, silent) {
  const collector = collectorFor(state), before = state.tokens.length
  const scope = state.level === 0 && state.blkIndent === 0 ? 'top-level' : 'nested'
  const result = original(state, startLine, endLine, silent)
  if (!result || silent || !collector?.file) return result
  const token = state.tokens[before]
  if (token?.type !== 'footnote_reference_open' || typeof token.meta?.label !== 'string') throw new UnsupportedSourceCapture()
  const from = collector.lineStarts[startLine], to = collector.lineStarts[state.line]
  if (from === undefined || to === undefined) throw new UnsupportedSourceCapture()
  const raw = rawRange(collector.trace, from, to)
  if (!raw) throw new UnsupportedSourceCapture()
  collector.file.definitions.push({ kind: 'footnote', label: token.meta.label, sourceFrom: raw.from, sourceTo: raw.to, scope })
  return result
}, true)
wrapCaptureRule(md.inline.ruler, 'footnote_ref', function observeFootnoteRuntime(original, state, silent) {
  const result = original(state, silent), file = collectorFor(state)?.file
  if (result && !silent && file) {
    const token = state.tokens[state.tokens.length - 1]
    if (token?.type !== 'footnote_ref' || typeof token.meta?.label !== 'string' || !file.activeEffects) throw new UnsupportedSourceCapture()
    file.activeEffects.push(token.meta.label)
  }
  return result
})

// Include failed and silent calls, including lookahead and nested dispatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const entry of (md.block.ruler as any).__rules__) {
  const original = entry.fn
  md.block.ruler.at(entry.name, (state, start, end, silent) => {
    const file = collectorFor(state)?.file
    if (file) file.work.blockRuleCalls++
    return original(state, start, end, silent)
  }, { alt: entry.alt.slice() })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fileRuleSnapshot = [md.core.ruler, md.block.ruler, md.inline.ruler, md.inline.ruler2].map(ruler => (ruler as any).__rules__.map((r: any) => ({ name: r.name, fn: r.fn, enabled: r.enabled, alt: [...r.alt] })))
function fileHooksValid(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [md.core.ruler, md.block.ruler, md.inline.ruler, md.inline.ruler2].every((ruler, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (ruler as any).__rules__ as { name: string; fn: unknown; enabled: boolean; alt: string[] }[]
    if (!Array.isArray(current)) return false
    const enabled = current.filter(r => r.enabled), actual = ruler.getRules('')
    if (enabled.length !== actual.length || enabled.some((r, j) => r.fn !== actual[j])) return false
    return current.length === fileRuleSnapshot[i].length && current.every((r, j) => {
      const previous = fileRuleSnapshot[i][j]
      return r.name === previous.name && r.fn === previous.fn && r.enabled === previous.enabled && sameTokenData(r.alt, previous.alt)
    })
  }) && md.options.html === true && md.options.linkify === false && md.options.typographer === false && (md.options as { maxNesting?: number }).maxNesting === 100
}

function sameTokenData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>, keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameTokenData(left[key], right[key]))
}

type FileEnvironment = { references?: Record<string, { href: string; title: string }>;
  footnotes?: { refs: Record<string, number>; list?: { label: string; count: number }[] }; [captureKey]?: Capture }
function definitionEnvironment(events: readonly FileDefinition[]): FileEnvironment {
  const env: FileEnvironment = {}
  for (const event of [...events].sort((a, b) => a.sourceFrom - b.sourceFrom)) {
    if (event.kind === 'reference') {
      env.references ??= {}
      if (typeof env.references[event.label] === 'undefined') env.references[event.label] = { href: event.href!, title: event.title! }
    } else {
      env.footnotes ??= { refs: {} }
      env.footnotes.refs[':' + event.label] = -1
    }
  }
  return env
}
function sameDefinitionEnvironment(a: readonly FileDefinition[], b: readonly FileDefinition[]): boolean {
  const canonical = (events: readonly FileDefinition[]) => {
    const env = definitionEnvironment(events)
    return JSON.stringify({ references: Object.entries(env.references ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      footnotes: Object.keys(env.footnotes?.refs ?? {}).sort() })
  }
  return canonical(a) === canonical(b)
}
function replayInlineEffects(labels: readonly string[], env: FileEnvironment, work: FileWorkAccumulator): void {
  for (const label of labels) {
    const refs = env.footnotes?.refs, key = ':' + label
    if (!refs || typeof refs[key] !== 'number') throw new UnsupportedSourceCapture()
    const list: { label: string; count: number }[] = env.footnotes!.list ??= []
    if (refs[key] < 0) { refs[key] = list.length; list.push({ label, count: 0 }) }
    const entry = list[refs[key]]
    if (!entry || entry.label !== label) throw new UnsupportedSourceCapture()
    entry.count++; work.inlineEffectReplayCount++
  }
}

// Admit only complete actual top-level rule segments, never a synthetic nested
// restart. Empty segments are real definition events between checkpoints.
function closedWindowSegments(tokens: readonly ActualToken[], checkpoints: readonly FileCheckpoint[]): boolean {
  const allowed = new Set(['paragraph', 'heading', 'blockquote', 'bullet_list', 'ordered_list',
    'list_item', 'footnote_reference', 'table', 'thead', 'tbody', 'tr', 'th', 'td'])
  if (checkpoints.length < 2) return false
  for (let i = 1; i < checkpoints.length; i++) {
    const left = checkpoints[i - 1]!, right = checkpoints[i]!, stack: string[] = []
    if (left.state.level !== 0 || right.state.level !== 0) return false
    for (const token of tokens.slice(left.tokenIndex, right.tokenIndex)) {
      if (token.map && (token.map[0] < left.line || token.map[1] > right.line || token.map[0] > token.map[1])) return false
      if (token.nesting === -1) {
        if (!token.type.endsWith('_close') || stack.pop() !== token.type.slice(0, -6)) return false
      }
      if (token.level !== stack.length) return false
      if (token.nesting === 1) {
        const kind = token.type.slice(0, -5)
        if (!token.type.endsWith('_open') || !allowed.has(kind)) return false
        stack.push(kind)
      } else if (token.nesting === 0 && token.type !== 'inline') return false
    }
    if (stack.length) return false
  }
  return true
}

// Only serializable facts belonging to these tokens participate in sentinel
// equality. Collector/frame/PM references are deliberately not source facts.
function windowTokenFacts(tokens: readonly ActualToken[]): unknown {
  return tokens.map(token => {
    const inline = inlineFacts.get(token), literal = literalFacts.get(token)
    return { inline: inline ? { kind: inline.kind, trace: inline.trace } : undefined,
      literal: literal ? { kind: literal.kind, trace: literal.trace } : undefined,
      closed: capturedFenceClosed.get(token),
      children: token.children ? windowTokenFacts(token.children) : undefined }
  })
}

/** All candidate rules still see the complete file and true EOF. */
export function captureFileWindow(cache: FileTokenCache, source: string,
  patches: readonly Readonly<{ from: number; to: number; text: string }>[], schema: Schema,
  work: FileWorkAccumulator, selection: Readonly<{ leftIndex: number; rightIndex: number }>): FileCaptureResult | null {
  if (!fileHooksValid() || !captureAvailable) return { ok: false, reason: 'unsupported-source' }
  if (!patches.length || cache.trace.text !== cache.source || !cache.checkpoints.length) return null
  try {
    work.preprocessedCodeUnits += source.length
    const trace = preprocessFileSource(source)
    if (trace.text !== source || /[\r\0]/.test(source)) return null
    const collector = newFileCollector(source, trace, work), file = collector.file!
    collector.lineStarts = lineStarts(source)
    const { leftIndex, rightIndex } = selection, left = cache.checkpoints[leftIndex]!
    if (!closedWindowSegments(cache.blockTokens, cache.checkpoints.slice(leftIndex, rightIndex + 1))) return null
    if (source.slice(0, left.offset) !== cache.source.slice(0, left.offset)) return null
    const delta = source.length - cache.source.length
    const tokens = cloneTokenBatch(cache.blockTokens.slice(0, left.tokenIndex), collector)
    file.definitions = cache.definitions.filter(d => d.sourceTo <= left.offset).map(d => ({ ...d }))
    const env = { ...definitionEnvironment(file.definitions), [captureKey]: collector }
    const state = newCheckedBlockState(source, env, tokens, work)
    Object.assign(state, left.state, { line: left.line })
    let matched: FileCheckpoint | undefined, matchedIndex = -1
    const checkpointByOffset = new Map(cache.checkpoints.map((checkpoint, index) => [checkpoint.offset, index]))
    work.blockParseCalls++
    runTopLevelWindow(state, { line: left.line, hasEmptyLines: left.hasEmptyLines }, checkpoint => {
      const oldIndex = checkpointByOffset.get(checkpoint.offset - delta) ?? -1
      if (oldIndex < rightIndex) return false
      const previous = cache.checkpoints[oldIndex - 1], old = cache.checkpoints[oldIndex]!
      if (JSON.stringify(old.state) !== JSON.stringify(checkpoint.state) || old.hasEmptyLines !== checkpoint.hasEmptyLines
        || source.slice(checkpoint.offset) !== cache.source.slice(old.offset)) return false
      const newPrevious = file.checkpoints[file.checkpoints.length - 2]
      if (previous && newPrevious && old.offset < cache.source.length) {
        const sentinelOld = cloneTokenBatch(cache.blockTokens.slice(previous.tokenIndex, old.tokenIndex), collector, delta, checkpoint.line - old.line)
        const sentinelNew = tokens.slice(newPrevious.tokenIndex, checkpoint.tokenIndex)
        if (!sameTokenData(sentinelOld, sentinelNew)
          || !sameTokenData(windowTokenFacts(sentinelOld), windowTokenFacts(sentinelNew))) return false
        const oldDefinitions = cache.definitions.filter(d => previous.offset <= d.sourceFrom && d.sourceFrom < old.offset)
          .map(d => ({ ...d, sourceFrom: d.sourceFrom + delta, sourceTo: d.sourceTo + delta }))
        const newDefinitions = file.definitions.filter(d => newPrevious.offset <= d.sourceFrom && d.sourceFrom < checkpoint.offset)
        if (!sameTokenData(oldDefinitions, newDefinitions)) return false
      }
      matched = checkpoint; matchedIndex = oldIndex
      return true
    }, work)
    work.blockWindows = [...work.blockWindows, { sourceFrom: left.offset, sourceTo: state.bMarks[state.line]! }]
    if (!matched || !closedWindowSegments(tokens, file.checkpoints)) return null
    const right = cache.checkpoints[matchedIndex]!, lineDelta = matched.line - right.line
    const tokenDelta = tokens.length - right.tokenIndex
    const windowEnd = tokens.length
    for (const token of cloneTokenBatch(cache.blockTokens.slice(right.tokenIndex), collector, delta, lineDelta)) tokens.push(token)
    for (const definition of cache.definitions) if (definition.sourceFrom >= right.offset)
      file.definitions.push({ ...definition, sourceFrom: definition.sourceFrom + delta, sourceTo: definition.sourceTo + delta })
    file.definitions.sort((a, b) => a.sourceFrom - b.sourceFrom)
    collector.protectedSources = file.definitions.filter(d => d.kind === 'reference').map(d => ({ kind: 'reference-definition',
      sourceFrom: d.sourceFrom, sourceTo: d.sourceTo, scope: d.scope }))
    const newCheckpoints = cache.checkpoints.slice(0, leftIndex).map(c => ({ ...c }))
    for (const checkpoint of file.checkpoints) newCheckpoints.push(checkpoint)
    const definitionDelta = file.definitions.length - cache.definitions.length
    for (const checkpoint of cache.checkpoints.slice(matchedIndex + 1)) newCheckpoints.push({ ...checkpoint,
      offset: checkpoint.offset + delta, line: checkpoint.line + lineDelta,
      tokenIndex: checkpoint.tokenIndex + tokenDelta, definitionIndex: checkpoint.definitionIndex + definitionDelta })
    file.checkpoints = newCheckpoints
    file.blockTokens = cloneTokenBatch(tokens, collector)
    const semanticChanged = !sameDefinitionEnvironment(cache.definitions, file.definitions)
    const oldEffects = new Map<number, readonly string[]>()
    let effectOrdinal = 0
    for (let i = 0; i < cache.blockTokens.length; i++) if (cache.blockTokens[i]!.type === 'inline')
      oldEffects.set(i, cache.effects[effectOrdinal++]!)
    const oldWindowEffects: string[] = []
    for (const [index, effects] of oldEffects) if (index >= left.tokenIndex && index < right.tokenIndex)
      for (const label of effects) oldWindowEffects.push(label)
    let parsedIndices: number[] = []
    const parseInlineSlots = (all: boolean): { tokens: ActualToken[]; env: FileEnvironment; windowEffects: string[] } => {
      const batch = cloneTokenBatch(file.blockTokens, collector), passEnv = { ...definitionEnvironment(file.definitions), [captureKey]: collector }
      const windowEffects: string[] = []
      file.effects = []
      for (let i = 0; i < batch.length; i++) {
        const token = batch[i]!
        if (token.type !== 'inline') continue
        const oldIndex = i < left.tokenIndex ? i : i >= windowEnd ? i - tokenDelta : undefined
        if (!all && oldIndex !== undefined) {
          const effects = oldEffects.get(oldIndex)
          if (!effects || !cache.inlineTokens[oldIndex] || cache.inlineTokens[oldIndex]!.type !== 'inline') throw new UnsupportedSourceCapture()
          batch[i] = cloneTokenBatch([cache.inlineTokens[oldIndex]!], collector, i >= windowEnd ? delta : 0, i >= windowEnd ? lineDelta : 0)[0]!
          replayInlineEffects(effects, passEnv, work)
          file.effects.push([...effects])
        } else {
          if (!token.children) throw new UnsupportedSourceCapture()
          md.inline.parse(token.content, md, passEnv, token.children)
          parsedIndices.push(i)
          if (i >= left.tokenIndex && i < windowEnd) for (const label of file.effects[file.effects.length - 1]!) windowEffects.push(label)
        }
      }
      return { tokens: batch, env: passEnv, windowEffects }
    }
    let pass = parseInlineSlots(semanticChanged)
    if (!semanticChanged && JSON.stringify(pass.windowEffects) !== JSON.stringify(oldWindowEffects)) pass = parseInlineSlots(true)
    const coreState = new md.core.State(source, md, pass.env)
    coreState.tokens = pass.tokens
    const coreRules = md.core.ruler.getRules('')
    // The snapshot guard below binds the configured normalize/block/inline
    // order; run every installed post-inline rule on this generation.
    for (const rule of coreRules.slice(3)) rule(coreState)
    const nextCache: FileTokenCache = { source, trace, lineStarts: collector.lineStarts, blockTokens: file.blockTokens,
      inlineTokens: cloneTokenBatch(coreState.tokens, collector), checkpoints: file.checkpoints,
      definitions: file.definitions, effects: file.effects }
    const doc = emitCapturedTokens(nextCache.inlineTokens, collector, schema)
    const value = finalizeCapturedDocument(collector, doc)
    const dirty = new Set<number>(), parsed = new Set(parsedIndices)
    const enclosingMaps: ActualToken['map'][] = []
    let rootIndex = 0
    for (const [index, token] of coreState.tokens.entries()) {
      // Cell inline tokens have no map, including completely empty cells.
      // Their actual enclosing block tokens still identify the parsed root.
      if (token.nesting === -1) enclosingMaps.pop()
      if (token.nesting === 1) enclosingMaps.push(token.map ?? enclosingMaps[enclosingMaps.length - 1] ?? null)
      if (!parsed.has(index)) continue
      const map = token.map ?? enclosingMaps[enclosingMaps.length - 1]
      if (!map) continue
      const from = collector.lineStarts[map[0]]!, to = collector.lineStarts[map[1]]!
      while (rootIndex < value.roots.length && value.roots[rootIndex]!.sourceTo <= from) rootIndex++
      for (let at = rootIndex; at < value.roots.length && value.roots[at]!.sourceFrom < to; at++) dirty.add(value.roots[at]!.id)
    }
    work.inlineRoots = [...dirty].sort((a, b) => a - b)
    if (work.mode !== 'full-fallback') work.mode = matchedIndex === rightIndex ? 'local' : 'expanded'
    return { ok: true, value, cache: nextCache }
  } catch (error) { return captureFailure(error) }
}
