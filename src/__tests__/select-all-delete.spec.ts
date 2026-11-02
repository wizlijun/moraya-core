import { afterEach, describe, expect, it } from 'vitest'
import { AllSelection, TextSelection } from 'prosemirror-state'
import { createEditor } from '../setup'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import type { MorayaEditorInstance } from '../types'

const mounted: { editor: MorayaEditorInstance; container: HTMLElement }[] = []
afterEach(() => {
  for (const { editor, container } of mounted.splice(0)) {
    editor.destroy()
    container.remove()
  }
  window.getSelection()?.removeAllRanges()
})

async function mount(markdown: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const editor = await createEditor({
    container,
    initialContent: markdown,
    mediaResolver: new BrowserMediaResolver(),
    enableMath: false,
    enableMermaid: false,
    frontmatterViewFactory: {
      render(container, raw) {
        container.textContent = raw
        return { destroy() {} }
      },
    },
  })
  mounted.push({ editor, container })
  editor.view.focus()
  return editor.view
}

describe.each(['Backspace', 'Delete'])('%s respects the model selection', key => {
  it('deletes selected prose while retaining the unselected frontmatter', async () => {
    const view = await mount(`---\ntitle: t\n---\n\n${'body text '.repeat(40)}\n`)
    const first = view.state.doc.firstChild!
    view.dispatch(view.state.tr.setSelection(TextSelection.between(
      view.state.doc.resolve(first.nodeSize), view.state.doc.resolve(view.state.doc.content.size),
    )))
    // Reproduce the old fallback: selected prose exceeds 90% of DOM text.
    expect(window.getSelection()!.toString().length).toBeGreaterThan(view.dom.textContent!.length * 0.9)
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    expect(view.state.doc.firstChild!.eq(first)).toBe(true)
    expect(view.state.doc.child(1).textContent).toBe('')
  })

  it('keeps the unselected suffix when more than 90% of a paragraph is selected', async () => {
    const view = await mount('x'.repeat(95) + 'KEEP!')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 96)))
    expect(window.getSelection()!.toString().length).toBe(95)
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    expect(view.state.doc.textContent).toBe('KEEP!')
  })

  it('still clears an actual whole-document selection', async () => {
    const view = await mount('# Heading\n\nBody text\n')
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild!.type.name).toBe('paragraph')
    expect(view.state.doc.textContent).toBe('')
    expect(view.state.selection.from).toBe(1)
  })
})
