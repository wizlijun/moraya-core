/**
 * `enableInlineMarkInputRules` — when false, typing inline mark delimiters
 * (`**`/`__`, `*`/`_`, `` ` ``, `~~`, `^^`/`==`) must leave the delimiters
 * literal instead of auto-converting to a rendered mark. Block-level shortcuts
 * (headings, lists, …) stay live regardless of the flag.
 *
 * Simulates typing the *closing* delimiter through the same `handleTextInput`
 * path ProseMirror uses for real DOM input, then asserts the resulting doc.
 */
import { describe, test, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import type { MarkType } from 'prosemirror-model'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { buildInputRules } from '../setup'

/** Mount a single-paragraph editor holding `text`, caret at the paragraph end. */
function mount(text: string, enableInlineMarks: boolean) {
  const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })
  const rules = buildInputRules(schema, {}, enableInlineMarks)
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ])
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ schema, doc, plugins: [rules] }),
  })
  const end = view.state.doc.content.size - 1 // just inside the paragraph
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)))
  return view
}

/** Type `char` at the caret, going through the input-rule handler like real input. */
function typeChar(view: EditorView, char: string) {
  const { from, to } = view.state.selection
  const handled =
    view.someProp('handleTextInput', (f) => f(view, from, to, char)) || false
  if (!handled) view.dispatch(view.state.tr.insertText(char, from, to))
}

/** True when any text node in the doc carries `markName`. */
function hasMark(view: EditorView, markName: string): boolean {
  const type = view.state.schema.marks[markName] as MarkType | undefined
  if (!type) return false
  let found = false
  view.state.doc.descendants((node) => {
    if (node.isText && type.isInSet(node.marks)) found = true
    return !found
  })
  return found
}

describe('enableInlineMarkInputRules: false — inline markers stay literal', () => {
  const cases: Array<{ name: string; seed: string; close: string; mark: string }> = [
    { name: 'strong **',   seed: '**bold*',  close: '*', mark: 'strong' },
    { name: 'strong __',   seed: '__bold_',  close: '_', mark: 'strong' },
    { name: 'em *',        seed: '*it',      close: '*', mark: 'em' },
    { name: 'inline code', seed: '`x',       close: '`', mark: 'code' },
    { name: 'strike ~~',   seed: '~~s~',     close: '~', mark: 'strike_through' },
    { name: 'highlight ^^', seed: '^^h^',    close: '^', mark: 'highlight' },
    { name: 'highlight ==', seed: '==h=',    close: '=', mark: 'highlight' },
  ]

  for (const c of cases) {
    test(`${c.name} does not render`, () => {
      const view = mount(c.seed, false)
      typeChar(view, c.close)
      expect(view.state.doc.textContent).toBe(c.seed + c.close)
      expect(hasMark(view, c.mark)).toBe(false)
      view.destroy()
    })
  }
})

describe('enableInlineMarkInputRules: true — default live formatting still fires', () => {
  test('strong ** renders', () => {
    const view = mount('**bold*', true)
    typeChar(view, '*')
    expect(hasMark(view, 'strong')).toBe(true)
    expect(view.state.doc.textContent).toBe('bold')
    view.destroy()
  })

  test('highlight ^^ renders', () => {
    const view = mount('^^h^', true)
    typeChar(view, '^')
    expect(hasMark(view, 'highlight')).toBe(true)
    view.destroy()
  })
})

describe('block-level shortcuts stay live even when inline marks are off', () => {
  test('# space still converts to a heading', () => {
    const view = mount('#', false)
    typeChar(view, ' ')
    expect(view.state.doc.firstChild?.type.name).toBe('heading')
    view.destroy()
  })
})
