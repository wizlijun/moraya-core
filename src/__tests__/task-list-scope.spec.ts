/**
 * Regression test: wrapInTaskList must NOT touch sibling lists.
 *
 * The original implementation walked a ±200-character window around the
 * cursor after wrapping, which incorrectly flipped `checked: null → false`
 * on list_items in nearby (but unrelated) bullet lists. Reported as
 * "all my lists became checkboxes" when adding a single task item via
 * the slash menu.
 */
import { describe, test, expect } from 'vitest'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import { createSchema, parseMarkdown } from '../index'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { wrapInTaskList } from '../commands'

function mkState(md: string) {
  const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })
  return EditorState.create({ schema, doc: parseMarkdown(md) })
}

/** Place the cursor inside the first text node matching `needle`. */
function selectInsideText(state: EditorState, needle: string): EditorState {
  let pos = -1
  state.doc.descendants((node, p) => {
    if (pos >= 0) return false
    if (node.isText && node.text && node.text.includes(needle)) {
      pos = p + node.text.indexOf(needle) + 1
      return false
    }
    return true
  })
  if (pos < 0) throw new Error(`text "${needle}" not found in doc`)
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
}

/** Collect every list_item node and its `checked` attribute. */
function listItemChecked(state: EditorState): Array<{ text: string; checked: unknown }> {
  const out: Array<{ text: string; checked: unknown }> = []
  state.doc.descendants((node) => {
    if (node.type.name === 'list_item') {
      out.push({ text: node.textContent, checked: node.attrs.checked })
    }
    return true
  })
  return out
}

describe('wrapInTaskList — scope to enclosing list only', () => {
  test('does not flip sibling bullet_list items into task items', () => {
    // Two bullet lists separated by a paragraph that the user is about to
    // convert into a task list. If the implementation walks ±200 chars
    // around the cursor, the sibling lists will be polluted.
    const md = [
      '- alpha',
      '- beta',
      '',
      'gamma',
      '',
      '- delta',
      '- epsilon',
      '',
    ].join('\n')

    let state = mkState(md)
    state = selectInsideText(state, 'gamma')

    let dispatched: Transaction | null = null
    const ok = wrapInTaskList(state, (tr) => { dispatched = tr })
    expect(ok).toBe(true)
    expect(dispatched).not.toBeNull()

    const after = state.apply(dispatched as unknown as Transaction)
    const items = listItemChecked(after)

    const gamma = items.find((i) => i.text === 'gamma')
    expect(gamma, 'gamma list_item').toBeDefined()
    expect(gamma!.checked, 'gamma was wrapped → checked=false').toBe(false)

    for (const sibling of items.filter((i) => i.text !== 'gamma')) {
      expect(sibling.checked, `sibling "${sibling.text}" must stay non-task`).toBeNull()
    }
  })

  test('flips all list_items inside a multi-line selection wrapped together', () => {
    const md = ['para1', '', 'para2', ''].join('\n')
    let state = mkState(md)
    // Select across both paragraphs so wrapInList builds one list with both items
    state = selectInsideText(state, 'para1')
    const start = state.selection.from
    let endPos = -1
    state.doc.descendants((node, p) => {
      if (endPos >= 0) return false
      if (node.isText && node.text === 'para2') {
        endPos = p + node.text.length
        return false
      }
      return true
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, start, endPos)))

    let dispatched: Transaction | null = null
    const ok = wrapInTaskList(state, (tr) => { dispatched = tr })
    expect(ok).toBe(true)
    const after = state.apply(dispatched as unknown as Transaction)
    const items = listItemChecked(after)
    expect(items).toHaveLength(2)
    for (const it of items) {
      expect(it.checked).toBe(false)
    }
  })
})
