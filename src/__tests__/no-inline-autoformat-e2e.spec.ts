/**
 * E2E through the real createEditor entry: with enableInlineMarkInputRules
 * false, typing inline markers must NOT auto-format — `**bold**` stays literal
 * text with no strong mark and the delimiters intact.
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

async function mount(enableInlineMarkInputRules: boolean) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const inst = await createEditor({
    container,
    initialContent: '',
    mediaResolver: new BrowserMediaResolver(),
    enableInlineMarkInputRules,
    inlineSyntaxScope: 'line',
  })
  return { inst, container }
}

describe('enableInlineMarkInputRules: false (rich autoformat off)', () => {
  test('typing **bold** stays literal — no strong mark, no <strong>', async () => {
    const { inst, container } = await mount(false)
    typeText(inst.view, '**bold**')
    expect(inst.view.state.doc.textContent).toBe('**bold**')
    expect(container.querySelector('strong')).toBeNull()
    inst.destroy(); container.remove()
  })

  test('typing ^^hi^^ stays literal — no highlight mark', async () => {
    const { inst, container } = await mount(false)
    typeText(inst.view, '^^hi^^')
    expect(inst.view.state.doc.textContent).toBe('^^hi^^')
    expect(container.querySelector('mark')).toBeNull()
    inst.destroy(); container.remove()
  })

  test('control: with the flag on, **bold** DOES form a strong mark', async () => {
    const { inst, container } = await mount(true)
    typeText(inst.view, '**bold**')
    expect(container.querySelector('strong')?.textContent).toContain('bold')
    inst.destroy(); container.remove()
  })
})
