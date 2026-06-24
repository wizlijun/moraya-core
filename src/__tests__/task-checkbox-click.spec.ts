/**
 * Task-list checkbox click toggling.
 *
 * The checkbox is a CSS `::before` pseudo-element drawn in the list item's left
 * padding (the schema emits no <input>), so the toggle is driven by a manual
 * hit-test in `toggleTaskCheckboxAtClick` against that padding band. These tests
 * mount a real EditorView (so `posAtDOM` / node-walking run against the real
 * schema) and mock only the layout that happy-dom can't compute.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { parseMarkdown, serializeMarkdown } from '../markdown'
import { toggleTaskCheckboxAtClick } from '../plugins/editor-props-plugin'

/** Build a mounted EditorView from Markdown and stub the list item's layout. */
function mountWithTask(markdown: string) {
  const doc = parseMarkdown(markdown)
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc }),
  })
  const li = view.dom.querySelector('li[data-item-type="task"]') as HTMLElement
  // li box: left 0..200, first line 0..20px.
  li.getBoundingClientRect = () =>
    ({ left: 0, right: 200, top: 0, bottom: 20, width: 200, height: 20 }) as DOMRect
  // padding-left: 1.5em ≈ 24px → checkbox band is x ∈ [0, 24].
  vi.spyOn(window, 'getComputedStyle').mockReturnValue(
    { paddingLeft: '24px' } as CSSStyleDeclaration,
  )
  return { view, li }
}

/** A minimal MouseEvent-like object targeting `el` at the given coordinates. */
function clickAt(el: HTMLElement, clientX: number, clientY: number) {
  return { target: el, clientX, clientY } as unknown as MouseEvent
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toggleTaskCheckboxAtClick', () => {
  test('click on checkbox band toggles unchecked → checked and updates Markdown', () => {
    const { view, li } = mountWithTask('- [ ] buy milk\n')

    const handled = toggleTaskCheckboxAtClick(view, clickAt(li, 6, 10))

    expect(handled).toBe(true)
    expect(serializeMarkdown(view.state.doc)).toBe('- [x] buy milk')
  })

  test('click toggles checked → unchecked', () => {
    const { view, li } = mountWithTask('- [x] buy milk\n')

    const handled = toggleTaskCheckboxAtClick(view, clickAt(li, 6, 10))

    expect(handled).toBe(true)
    expect(serializeMarkdown(view.state.doc)).toBe('- [ ] buy milk')
  })

  test('click on the text (past the padding band) does not toggle', () => {
    const { view, li } = mountWithTask('- [ ] buy milk\n')

    const handled = toggleTaskCheckboxAtClick(view, clickAt(li, 100, 10))

    expect(handled).toBe(false)
    expect(serializeMarkdown(view.state.doc)).toBe('- [ ] buy milk')
  })

  test('non-task list item is ignored even in the marker column', () => {
    const doc = parseMarkdown('- plain bullet\n')
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ doc }),
    })
    const li = view.dom.querySelector('li') as HTMLElement
    li.getBoundingClientRect = () =>
      ({ left: 0, right: 200, top: 0, bottom: 20, width: 200, height: 20 }) as DOMRect
    vi.spyOn(window, 'getComputedStyle').mockReturnValue(
      { paddingLeft: '24px' } as CSSStyleDeclaration,
    )

    const handled = toggleTaskCheckboxAtClick(view, clickAt(li, 6, 10))

    expect(handled).toBe(false)
  })
})
