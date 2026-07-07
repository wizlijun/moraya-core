/**
 * Cursor syntax plugin — Typora-style source-syntax overlay.
 *
 * Shows the source markdown delimiters (`# `, `> `, `**`, `*`, `` ` ``, `~~`)
 * around the cursor position so users see the underlying syntax while editing
 * rendered prose. Uses ProseMirror Decoration widgets with `side: ±1` so the
 * widgets sit visually adjacent to the cursor without becoming part of the
 * editable text.
 *
 * Block-level prefixes shown:
 *   - heading 1-6 → `# `, `## `, ... `###### `
 *   - blockquote → `> `
 *
 * Inline mark delimiters:
 *   - strong → `**` ... `**`
 *   - em → `*` ... `*`
 *   - code → `` ` `` ... `` ` ``
 *   - strike_through → `~~` ... `~~`
 *   - highlight → `^^` ... `^^`
 *
 * The `inlineScope` controls how much inline syntax is revealed:
 *   - `'cursor'` (default): only the single mark the cursor sits inside.
 *   - `'line'`: every inline mark in the cursor's textblock, so the whole
 *     current line reads as markdown source (Obsidian Live-Preview style);
 *     moving the cursor to another line re-renders this one.
 *
 * Link marks are handled by `link-text-plugin` (expand/collapse pattern).
 */

import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { MarkType, Mark } from 'prosemirror-model'

/** How much inline markdown syntax the plugin reveals around the cursor. */
export type InlineSyntaxScope = 'cursor' | 'line'

const pluginKey = new PluginKey('moraya-cursor-syntax')

const HEADING_PREFIX: Record<number, string> = {
  1: '# ',
  2: '## ',
  3: '### ',
  4: '#### ',
  5: '##### ',
  6: '###### ',
}

const MARK_DELIMITERS: Record<string, { open: string; close: string }> = {
  strong: { open: '**', close: '**' },
  em: { open: '*', close: '*' },
  code: { open: '`', close: '`' },
  strike_through: { open: '~~', close: '~~' },
  highlight: { open: '^^', close: '^^' },
}

function makeWidget(text: string, className: string): () => HTMLSpanElement {
  return () => {
    const span = document.createElement('span')
    span.className = className
    span.textContent = text
    return span
  }
}

/** A contiguous span of `markType` in a textblock, with the mark instance. */
interface MarkRun { from: number; to: number; mark: Mark }

/**
 * Collect every contiguous run of `markType` in the textblock that contains
 * `pos`. Positions are absolute document coordinates. The mark instance is
 * kept so callers can read per-run attributes (e.g. highlight delimiter).
 */
function getMarkRuns(state: EditorState, pos: number, markType: MarkType): MarkRun[] {
  const $pos = state.doc.resolve(pos)
  const parent = $pos.parent
  if (!parent.isTextblock) return []

  const base = $pos.start() // absolute position of parent content start
  const runs: MarkRun[] = []
  let runFrom = -1
  let runMark: Mark | null = null
  let nodePos = base

  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i)
    const childEnd = nodePos + child.nodeSize

    const mark = markType.isInSet(child.marks)
      ? child.marks.find(m => m.type === markType)!
      : null
    if (mark) {
      if (runFrom === -1) { runFrom = nodePos; runMark = mark }
    } else {
      if (runFrom !== -1) {
        runs.push({ from: runFrom, to: nodePos, mark: runMark! })
        runFrom = -1
        runMark = null
      }
    }
    nodePos = childEnd
  }
  if (runFrom !== -1) runs.push({ from: runFrom, to: nodePos, mark: runMark! })

  return runs
}

function buildDecorations(state: EditorState, inlineScope: InlineSyntaxScope): DecorationSet {
  const { selection } = state
  // Only show decorations when cursor is a single collapsed point (no selection)
  if (!selection.empty) return DecorationSet.empty

  const $from = selection.$from
  const decorations: Decoration[] = []
  const pos = $from.pos
  const depth = $from.depth
  const parent = $from.parent

  // 1. Block-level: heading prefix
  if (parent.type === state.schema.nodes.heading) {
    const level = parent.attrs.level as number
    const prefix = HEADING_PREFIX[level] ?? '# '
    const contentStart = $from.start(depth)
    decorations.push(
      Decoration.widget(contentStart, makeWidget(prefix, 'syntax-md-prefix'), {
        side: -1,
        key: 'heading-prefix',
      }),
    )
  }

  // 2. Block-level: blockquote prefix at start of current paragraph
  for (let d = depth - 1; d >= 1; d--) {
    if ($from.node(d).type === state.schema.nodes.blockquote) {
      const contentStart = $from.start(depth)
      decorations.push(
        Decoration.widget(contentStart, makeWidget('> ', 'syntax-md-prefix'), {
          side: -1,
          key: 'bq-prefix',
        }),
      )
      break
    }
  }

  // 3. Inline marks: strong, em, code, strike_through, highlight.
  //    'cursor' scope reveals only the run the caret is inside; 'line' scope
  //    reveals every run in the current textblock so the whole line reads as
  //    markdown source. Half-open interval [from, to): a caret exactly at r.to
  //    counts as "just exited" (avoids a DOM-mutation cursor bounce).
  for (const [markName, delim] of Object.entries(MARK_DELIMITERS)) {
    const markType = state.schema.marks[markName]
    if (!markType) continue

    const runs = getMarkRuns(state, pos, markType)
    const targets = inlineScope === 'line'
      ? runs
      : runs.filter(r => pos >= r.from && pos < r.to)

    for (const range of targets) {
      // For marks with a delimiter attr (highlight), show the actual delimiter.
      let openStr = delim.open
      let closeStr = delim.close
      if (markName === 'highlight' && range.mark.attrs?.delimiter === 'equals') {
        openStr = '=='
        closeStr = '=='
      }

      decorations.push(
        Decoration.widget(range.from, makeWidget(openStr, 'syntax-md-mark'), {
          side: -1,
          key: `${markName}-open-${range.from}`,
        }),
        Decoration.widget(range.to, makeWidget(closeStr, 'syntax-md-mark'), {
          side: 1,
          key: `${markName}-close-${range.to}`,
        }),
      )
    }
  }

  // 4. Link marks are handled by link-text-plugin (expand/collapse)

  return DecorationSet.create(state.doc, decorations)
}

export function createCursorSyntaxPlugin(inlineScope: InlineSyntaxScope = 'cursor'): Plugin {
  return new Plugin({
    key: pluginKey,
    state: {
      init(_, state) {
        return buildDecorations(state, inlineScope)
      },
      apply(tr, old, _, newState) {
        // Only recompute when selection or document changes
        if (!tr.selectionSet && !tr.docChanged) return old
        return buildDecorations(newState, inlineScope)
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)
      },
    },
  })
}
