import { describe, expect, it, vi } from 'vitest'
import { AllSelection, EditorState, NodeSelection, Selection, TextSelection, type Transaction } from 'prosemirror-state'
import type { Node as PmNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { parseMarkdown } from '../markdown'
import { createEnterHandlerPlugin } from '../plugins/enter-handler'

// An arbitrary consumer-defined block range, with no dependency on a host type.
class BlockRange extends Selection {
  map(doc: PmNode) { return new BlockRange(doc.resolve(this.from), doc.resolve(this.to)) }
  eq(other: Selection) { return other instanceof BlockRange && other.from === this.from && other.to === this.to }
  toJSON() { return { type: 'test-block-range', from: this.from, to: this.to } }
}

function enter(doc: PmNode, selection: Selection, options: Record<string, unknown> = {}) {
  let state = EditorState.create({ doc, selection })
  const dispatch = vi.fn((tr: Transaction) => { state = state.apply(tr) })
  const view = { get state() { return state }, dispatch } as unknown as EditorView
  const plugin = createEnterHandlerPlugin()
  const event = { key: 'Enter', preventDefault: vi.fn(), ...options } as unknown as KeyboardEvent
  const handled = plugin.props.handleKeyDown!.call(plugin, view, event)
  return { handled, state, dispatch }
}

describe('Enter on consumer block-range selections', () => {
  it.each(['$$\nx\n$$', '---', '$$\nx\n$$\n\ntext', 'text\n\n$$\nx\n$$'])(
    'replaces the selected blocks through Selection.replace: %s', body => {
      const doc = parseMarkdown('---\ntitle: keep\n---\n\n' + body)
      const selection = new BlockRange(doc.resolve(doc.firstChild!.nodeSize), doc.resolve(doc.content.size))
      const replace = vi.spyOn(selection, 'replace')
      const result = enter(doc, selection)
      expect(result.handled).toBe(true)
      expect(replace).toHaveBeenCalledOnce()
      expect(result.dispatch).toHaveBeenCalledOnce()
      expect(result.state.doc.childCount).toBe(1)
      expect(result.state.doc.firstChild!.eq(doc.firstChild!)).toBe(true)
    },
  )

  it('keeps NodeSelection Enter adding a neighboring paragraph', () => {
    const doc = parseMarkdown('$$\nx\n$$')
    const result = enter(doc, NodeSelection.create(doc, 0))
    expect(result.handled).toBe(true)
    expect(result.state.doc.firstChild!.eq(doc.firstChild!)).toBe(true)
    expect(result.state.doc.childCount).toBe(2)
    expect(result.state.doc.lastChild!.type.name).toBe('paragraph')
  })

  it('keeps the existing AllSelection command fallthrough', () => {
    const doc = parseMarkdown('text')
    const result = enter(doc, new AllSelection(doc))
    expect(result.handled).toBe(false)
    expect(result.dispatch).not.toHaveBeenCalled()
  })

  it('keeps TextSelection Enter replacing text through splitBlock', () => {
    const doc = parseMarkdown('---\ntitle: keep\n---\n\ntext')
    const result = enter(doc, TextSelection.create(doc, doc.firstChild!.nodeSize + 1, doc.content.size - 1))
    expect(result.handled).toBe(true)
    expect(result.state.doc.firstChild!.eq(doc.firstChild!)).toBe(true)
    expect(result.state.doc.childCount).toBe(3)
    expect(result.state.doc.child(1).textContent).toBe('')
    expect(result.state.doc.child(2).textContent).toBe('')
  })

  it.each([{ isComposing: true }, { shiftKey: true }, { metaKey: true }, { ctrlKey: true }])(
    'leaves composing and modified Enter unchanged: %o', options => {
      const doc = parseMarkdown('---\ntitle: keep\n---\n\n$$\nx\n$$')
      const selection = new BlockRange(doc.resolve(doc.firstChild!.nodeSize), doc.resolve(doc.content.size))
      const result = enter(doc, selection, options)
      expect(result.handled).toBe(false)
      expect(result.dispatch).not.toHaveBeenCalled()
    },
  )
})
