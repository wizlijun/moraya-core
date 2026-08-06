/**
 * Regression: Cmd+A did nothing in the rich editor. Root cause turned out to
 * be one layer above this file (the host app's native Edit-menu "Select All"
 * is a PredefinedMenuItem whose native `selectAll:` responder action no-ops
 * on a ProseMirror DOM mixing editable text with non-editable atom nodes —
 * see mdeditor's src-tauri/src/lib.rs). But that investigation started here,
 * by isolating whether `buildKeymap`'s `Mod-a` binding itself was at fault.
 * It wasn't — this test pins that down permanently.
 *
 * Gotcha this test exists to document: prosemirror-keymap resolves "Mod" to
 * Meta/Cmd vs Ctrl by reading `navigator.platform` ONCE at module load time.
 * happy-dom's default platform string is "X11; Darwin arm64", which does NOT
 * match prosemirror-keymap's `/Mac|iP(hone|[oa]d)/` regex — so "Mod-a"
 * silently resolves to "Ctrl-a" under test, and a keydown event with only
 * `metaKey: true` (no `ctrlKey`) never matches, making a correct binding look
 * broken. Fix: pin `navigator.platform` to a real macOS value before the
 * first import of anything that pulls in prosemirror-keymap.
 */
import { describe, test, expect, beforeAll } from 'vitest'
import { AllSelection, TextSelection } from 'prosemirror-state'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'

Object.defineProperty(globalThis.navigator, 'platform', { value: 'MacIntel', configurable: true })

let createEditor: typeof import('../setup').createEditor
beforeAll(async () => {
  ;({ createEditor } = await import('../setup'))
})

describe('Mod-a (Cmd+A on Mac) select-all', () => {
  test('a trusted metaKey+a keydown reaching the view produces AllSelection', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inst = await createEditor({
      container,
      initialContent: '# Title\n\nSome body text here.\n',
      mediaResolver: new BrowserMediaResolver(),
    })
    const view = inst.view
    const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true })
    const handled = view.someProp('handleKeyDown', (f) => f(view, event))
    expect(handled).toBe(true)
    expect(view.state.selection).toBeInstanceOf(AllSelection)
    inst.destroy()
    container.remove()
  })

  test('inside a code block, Mod-a selects only that block (not AllSelection)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const inst = await createEditor({
      container,
      initialContent: '```js\nconst x = 1;\n```\n',
      mediaResolver: new BrowserMediaResolver(),
    })
    const view = inst.view
    // Put the cursor inside the code block (position 1 is right after its
    // opening boundary, per how ProseMirror numbers positions).
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
    const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true })
    const handled = view.someProp('handleKeyDown', (f) => f(view, event))
    expect(handled).toBe(true)
    expect(view.state.selection).not.toBeInstanceOf(AllSelection)
    inst.destroy()
    container.remove()
  })
})
