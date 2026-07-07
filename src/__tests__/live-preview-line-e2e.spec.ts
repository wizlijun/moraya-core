/**
 * FAITHFUL REPRODUCTION — build the editor exactly as the app does, through the
 * real `createEditor` entry point with `inlineSyntaxScope: 'line'`, then type
 * `**bold**` and check whether the `**` delimiters remain visible.
 *
 * This mounts the FULL plugin stack (not a hand-picked subset), so if the app
 * still hides the markers, this test should reproduce it.
 */
import { describe, test, expect } from 'vitest'
import type { EditorView } from 'prosemirror-view'
import { createEditor } from '../setup'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'

function typeText(view: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch)) || false
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to))
  }
}

describe('real createEditor + inlineSyntaxScope line', () => {
  test('typing **bold** keeps the ** delimiters visible on the current line', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inst = await createEditor({
      container,
      initialContent: '',
      mediaResolver: new BrowserMediaResolver(),
      inlineSyntaxScope: 'line',
    })
    const view = inst.view

    typeText(view, '**bold**')

    const delims = Array.from(container.querySelectorAll('.syntax-md-mark')).map(
      (el) => el.textContent,
    )
    expect(delims).toEqual(['**', '**'])
    inst.destroy()
    container.remove()
  })
})
