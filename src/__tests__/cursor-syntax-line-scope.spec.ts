/**
 * `cursor-syntax` inline scope — 'line' reveals every inline mark's source
 * delimiters in the caret's textblock (Obsidian Live-Preview style), while the
 * default 'cursor' scope reveals only the mark the caret sits inside.
 *
 * Mounts a real EditorView so the decoration widgets render to `.syntax-md-mark`
 * spans we can read back from the DOM.
 */
import { describe, test, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { parseMarkdown } from '../markdown'
import { createCursorSyntaxPlugin, type InlineSyntaxScope } from '../plugins/cursor-syntax'

/** Mount an editor from Markdown with cursor-syntax at the given scope. */
function mount(md: string, scope: InlineSyntaxScope) {
  const doc = parseMarkdown(md)
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [createCursorSyntaxPlugin(scope)] }),
  })
}

/** Put the caret just before the first occurrence of `needle` (plain text). */
function caretBefore(view: EditorView, needle: string) {
  let pos = -1
  view.state.doc.descendants((node, p) => {
    if (pos >= 0) return false
    if (node.isText && node.text?.includes(needle)) {
      pos = p + node.text.indexOf(needle)
      return false
    }
    return true
  })
  if (pos < 0) throw new Error(`"${needle}" not found`)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
}

/** The text of every rendered inline source-delimiter widget. */
function delimiters(view: EditorView): string[] {
  return Array.from(view.dom.querySelectorAll('.syntax-md-mark')).map(
    (el) => el.textContent ?? '',
  )
}

describe("inlineScope 'line' — whole current line shows source", () => {
  test('reveals all inline mark delimiters even when caret is outside every mark', () => {
    // "x " (plain) + "a" (strong) + " " + "b" (em) — caret parked in plain "x ".
    const view = mount('x **a** *b*', 'line')
    caretBefore(view, 'x')
    const d = delimiters(view)
    // strong open+close (**) and em open+close (*) → 4 widgets.
    expect(d.filter((s) => s === '**')).toHaveLength(2)
    expect(d.filter((s) => s === '*')).toHaveLength(2)
    view.destroy()
  })

  test('uses the highlight delimiter actually authored (== vs ^^)', () => {
    const view = mount('lead ==hi==', 'line')
    caretBefore(view, 'lead')
    expect(delimiters(view).filter((s) => s === '==')).toHaveLength(2)
    view.destroy()
  })

  test('only the caret line is revealed, not sibling paragraphs', () => {
    const view = mount('**a**\n\n**b**', 'line')
    caretBefore(view, 'a')
    // Just the first paragraph's strong → exactly 2 delimiters.
    expect(delimiters(view).filter((s) => s === '**')).toHaveLength(2)
    view.destroy()
  })
})

describe("inlineScope 'cursor' (default) — only the mark under the caret", () => {
  test('caret outside all marks reveals nothing', () => {
    const view = mount('x **a** *b*', 'cursor')
    caretBefore(view, 'x')
    expect(delimiters(view)).toHaveLength(0)
    view.destroy()
  })

  test('caret inside one mark reveals only that mark', () => {
    const view = mount('x **abc** *b*', 'cursor')
    // Place caret strictly inside "abc" (the strong run), past its left boundary.
    caretBefore(view, 'abc')
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, view.state.selection.from + 1),
      ),
    )
    const d = delimiters(view)
    expect(d.filter((s) => s === '**')).toHaveLength(2)
    expect(d.filter((s) => s === '*')).toHaveLength(0)
    view.destroy()
  })
})

/**
 * A block-prefix widget (`# `, `> `) inside a still-empty textblock left the
 * caret painting a line below the marker: the block then held only the widget
 * plus ProseMirror's trailing <br>, and the widget filling line 1 made WebKit
 * snap the end-of-block caret past that break. An empty paragraph escapes this
 * because nothing precedes its <br>, so an empty block emits no prefix at all.
 */
describe('cursor-syntax block prefixes', () => {
  const prefixes = (view: EditorView) =>
    Array.from(view.dom.querySelectorAll('.syntax-md-prefix')).map((n) => n.textContent)

  test('an empty heading shows no prefix widget', () => {
    const view = mount('# ', 'line')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
    expect(prefixes(view)).toHaveLength(0)
    // Same shape as an empty paragraph: nothing before the trailing break.
    expect(view.dom.innerHTML).toContain('<h1><br class="ProseMirror-trailingBreak"></h1>')
    view.destroy()
  })

  test('a heading with content still shows its prefix', () => {
    const view = mount('# x', 'line')
    caretBefore(view, 'x')
    expect(prefixes(view)).toEqual(['# '])
    view.destroy()
  })

  test('an empty blockquote paragraph shows no prefix widget', () => {
    const view = mount('> ', 'line')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
    expect(prefixes(view)).toHaveLength(0)
    view.destroy()
  })

  test('a blockquote with content still shows its prefix', () => {
    const view = mount('> hi', 'line')
    caretBefore(view, 'hi')
    expect(prefixes(view)).toEqual(['> '])
    view.destroy()
  })
})
