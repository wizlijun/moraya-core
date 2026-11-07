import { afterEach, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView, type NodeViewConstructor } from 'prosemirror-view'
import { defaultSchema as schema } from '../schema'
import { preloadEnhancementPlugins } from '../setup'
import { createCodeBlockNodeViewFactory } from '../plugins/code-block-view'
import type { RendererPluginModule, RendererRegistry } from '../types'

const views: EditorView[] = []
afterEach(() => { views.splice(0).forEach(view => { if (!view.isDestroyed) view.destroy() }); document.body.replaceChildren(); vi.restoreAllMocks() })
const svg = (text: string) => `<svg width="240" height="120" viewBox="0 0 240 120"><text>${text}</text></svg>`
function deferredRenderer() {
  const pending: { source: string; output: HTMLElement; finish(text?: string): void }[] = []
  const module: RendererPluginModule = {
    render: vi.fn((source: string, output: HTMLElement) => new Promise<void>(resolve => {
      pending.push({ source, output, finish(text = source) { output.innerHTML = svg(text); resolve() } })
    })),
    destroy: vi.fn((output: HTMLElement) => { output.replaceChildren() }),
  }
  return { module, pending }
}
function registry(modules: Record<string, RendererPluginModule>): RendererRegistry {
  return { versions: Object.fromEntries(Object.keys(modules).map(k => [k, '1'])), has: language => language in modules, load: async language => modules[language] }
}
function mount(factory: NodeViewConstructor, source = 'same', language = 'dot') {
  const root = document.createElement('div'); document.body.append(root)
  const view = new EditorView(root, {
    state: EditorState.create({ schema, doc: schema.nodes.doc.create(null, schema.nodes.code_block.create({ language }, schema.text(source))) }),
    nodeViews: { code_block: factory },
  })
  views.push(view)
  return { root, view }
}
async function ready(root: HTMLElement, text: string) {
  await vi.waitFor(() => expect(root.querySelector('.renderer-preview svg')?.textContent).toBe(text))
}

it('commits only the latest source and cleans the old result without destroying the current one', async () => {
  const r = deferredRenderer(), reg = registry({ dot: r.module })
  const { root, view } = mount(createCodeBlockNodeViewFactory({ rendererRegistry: reg, diagramInteraction: true }), 'first')
  await vi.waitFor(() => expect(r.pending).toHaveLength(1))
  expect(r.pending[0].output.isConnected).toBe(true)
  view.dispatch(view.state.tr.insertText('second', 1, 6))
  await vi.waitFor(() => expect(r.pending).toHaveLength(2))
  expect(r.pending[1].output.isConnected).toBe(true)
  r.pending[1].finish(); await ready(root, 'second')
  r.pending[0].finish(); await vi.waitFor(() => expect(r.module.destroy).toHaveBeenCalledWith(r.pending[0].output))
  expect(root.querySelector('.renderer-preview svg')?.textContent).toBe('second')
  expect(root.querySelectorAll('.diagram-controls')).toHaveLength(1)
  expect(r.module.destroy).not.toHaveBeenCalledWith(r.pending[1].output)
  expect(view.state.doc.firstChild?.textContent).toBe('second')
})

it('invalidates a pending renderer when language changes even with identical source', async () => {
  const a = deferredRenderer(), b = deferredRenderer(), reg = registry({ dot: a.module, graphviz: b.module })
  const { root, view } = mount(createCodeBlockNodeViewFactory({ rendererRegistry: reg, diagramInteraction: true }))
  await vi.waitFor(() => expect(a.pending).toHaveLength(1))
  view.dispatch(view.state.tr.setNodeMarkup(0, undefined, { language: 'graphviz' }))
  await vi.waitFor(() => expect(b.pending).toHaveLength(1))
  b.pending[0].finish('new language'); await ready(root, 'new language')
  a.pending[0].finish('old language'); await vi.waitFor(() => expect(a.module.destroy).toHaveBeenCalledWith(a.pending[0].output))
  expect(root.querySelector('.renderer-preview svg')?.textContent).toBe('new language')
  expect(b.module.destroy).not.toHaveBeenCalled()
})

it.each(['delete', 'destroy', 'source'] as const)('a render arriving after %s cannot bind controls or write to the live preview', async action => {
  const r = deferredRenderer(), reg = registry({ dot: r.module })
  const { root, view } = mount(createCodeBlockNodeViewFactory({ rendererRegistry: reg, diagramInteraction: true }))
  await vi.waitFor(() => expect(r.pending).toHaveLength(1))
  const preview = root.querySelector('.renderer-preview')!
  if (action === 'delete') view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, schema.nodes.paragraph.create()))
  else if (action === 'destroy') view.destroy()
  else root.querySelector<HTMLButtonElement>('.mermaid-toggle-btn')!.click()
  // Cancellation must release resources now, even if the renderer Promise never settles.
  expect(r.module.destroy).toHaveBeenCalledWith(r.pending[0].output)
  expect(r.pending[0].output.isConnected).toBe(false)
  r.pending[0].finish('late')
  await Promise.resolve(); await Promise.resolve()
  // Cancellation and eventual settlement each clean only this obsolete output.
  expect(r.module.destroy).toHaveBeenCalledTimes(2)
  expect(preview.querySelector('svg')).toBeNull()
  expect(preview.querySelector('.diagram-transform')).toBeNull()
  expect(root.querySelector('.diagram-controls')).toBeNull()
})

it('a late loader never starts rendering after its language has been replaced', async () => {
  const a = deferredRenderer(), b = deferredRenderer()
  let resolveA!: (module: RendererPluginModule) => void
  const reg: RendererRegistry = { versions: { dot: '1', graphviz: '1' }, has: () => true,
    load: vi.fn(language => language === 'dot' ? new Promise(resolve => { resolveA = resolve }) : Promise.resolve(b.module)) }
  const { root, view } = mount(createCodeBlockNodeViewFactory({ rendererRegistry: reg }))
  await vi.waitFor(() => expect(reg.load).toHaveBeenCalledWith('dot'))
  view.dispatch(view.state.tr.setNodeMarkup(0, undefined, { language: 'graphviz' }))
  await vi.waitFor(() => expect(b.pending).toHaveLength(1))
  b.pending[0].finish('current'); await ready(root, 'current')
  resolveA(a.module); await Promise.resolve(); await Promise.resolve()
  expect(a.module.render).not.toHaveBeenCalled()
  expect(root.querySelector('.renderer-preview svg')?.textContent).toBe('current')
})

it('pending and settled factory caches isolate opt-in and localized capabilities on the same schema and registry', async () => {
  const r = deferredRenderer(), reg = registry({ dot: r.module })
  const localized = { labels: { region: 'Localized diagram', zoomIn: 'Localized zoom' } }
  const first = preloadEnhancementPlugins(schema, reg, undefined, false)
  const second = preloadEnhancementPlugins(schema, reg, undefined, localized)
  expect(first).not.toBe(second)
  const [off, on] = await Promise.all([first, second])
  expect(off.codeBlockView).not.toBe(on.codeBlockView)
  const a = mount(off.codeBlockView!), b = mount(on.codeBlockView!)
  await vi.waitFor(() => expect(r.pending).toHaveLength(2))
  // Finish the later editor first, then the earlier editor.
  r.pending[1].finish('second'); await ready(b.root, 'second')
  r.pending[0].finish('first'); await ready(a.root, 'first')
  expect(a.root.querySelector('.diagram-viewport')).toBeNull()
  expect(b.root.querySelector('.diagram-viewport')?.getAttribute('aria-label')).toBe('Localized diagram')
  expect(b.root.querySelector('.diagram-zoom-in')?.getAttribute('aria-label')).toBe('Localized zoom')
  const againOff = await preloadEnhancementPlugins(schema, reg, undefined, false)
  const c = mount(againOff.codeBlockView!)
  await vi.waitFor(() => expect(r.pending).toHaveLength(3))
  r.pending[2].finish('third'); await ready(c.root, 'third')
  expect(c.root.querySelector('.diagram-viewport')).toBeNull()
})

it('a delayed Preview result does not steal focus after the user has moved elsewhere', async () => {
  const r = deferredRenderer(), reg = registry({ dot: r.module })
  const { root, view } = mount(createCodeBlockNodeViewFactory({ rendererRegistry: reg, diagramInteraction: true }))
  await vi.waitFor(() => expect(r.pending).toHaveLength(1))
  r.pending[0].finish(); await ready(root, 'same')
  const toggle = root.querySelector<HTMLButtonElement>('.mermaid-toggle-btn')!
  toggle.click()
  view.dispatch(view.state.tr.insertText('changed', 1, 5))
  toggle.click()
  await vi.waitFor(() => expect(r.pending).toHaveLength(2))
  const elsewhere = document.createElement('input'); document.body.append(elsewhere); elsewhere.focus()
  const selection = view.state.selection
  r.pending[1].finish(); await ready(root, 'changed')
  expect(document.activeElement).toBe(elsewhere)
  expect(view.state.selection.eq(selection)).toBe(true)
})

it('cleans resources allocated by an async renderer after its pending output was cancelled', async () => {
  let release!: () => void
  let finished!: () => void
  let resourceLive = false
  const gate = new Promise<void>(resolve => { release = resolve })
  const completion = new Promise<void>(resolve => { finished = resolve })
  const module: RendererPluginModule = {
    async render(_source, output) {
      await gate
      resourceLive = true
      output.innerHTML = svg('late resource')
      finished()
    },
    destroy: vi.fn(() => { resourceLive = false }),
  }
  const { root, view } = mount(createCodeBlockNodeViewFactory({ rendererRegistry: registry({ dot: module }), diagramInteraction: true }))
  await vi.waitFor(() => expect(root.querySelector('.renderer-content')).not.toBeNull())
  view.destroy()
  expect(module.destroy).toHaveBeenCalled()
  release(); await completion; await Promise.resolve(); await Promise.resolve()
  expect(resourceLive).toBe(false)
})
