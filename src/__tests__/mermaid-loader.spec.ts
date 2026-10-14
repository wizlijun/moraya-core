import { afterEach, expect, it, vi } from 'vitest'
import { createEditor, type CreateEditorOptions, type MorayaEditorInstance } from '../setup'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import type { MermaidApi } from '../types'

const instances: MorayaEditorInstance[] = []
const legacy = vi.hoisted(() => ({ render: vi.fn(async () => ({ svg: '<svg id="legacy"/>' })) }))
vi.mock('../plugins/mermaid-renderer', () => ({ renderMermaid: legacy.render, updateMermaidTheme() {} }))
afterEach(() => { instances.splice(0).forEach(i => i.destroy()); document.body.replaceChildren(); vi.clearAllMocks() })
const settle = () => new Promise(resolve => setTimeout(resolve, 220))
async function mount(extra: Partial<CreateEditorOptions> = {}) {
  const container = document.createElement('div'); document.body.append(container)
  const editor = await createEditor({ container, mediaResolver: new BrowserMediaResolver(), initialContent: '```mermaid\ngraph TD; A-->B\n```', ...extra })
  instances.push(editor); await settle(); return { editor, container }
}
function api(id = 'injected'): MermaidApi { return { renderMermaid: vi.fn(async () => ({ svg: `<svg id="${id}"/>` })), updateMermaidTheme: vi.fn() } }
it.each([undefined, true, false])('without loader stays editable source (flag %s)', async enableMermaid => {
  const { container } = await mount({ ...(enableMermaid === undefined ? {} : { enableMermaid }) })
  expect(container.querySelector('pre')?.style.display).not.toBe('none')
  expect(legacy.render).not.toHaveBeenCalled()
})
it('uses injected capability and false suppresses it', async () => {
  const renderer = api(), loader = vi.fn(async () => renderer)
  const { container } = await mount({ mermaidLoader: loader })
  expect(container.querySelector('#injected')).not.toBeNull(); expect(loader).toHaveBeenCalledOnce()
  const disabled = await mount({ mermaidLoader: loader, enableMermaid: false })
  expect(disabled.container.querySelector('pre')?.style.display).not.toBe('none'); expect(loader).toHaveBeenCalledOnce()
})
it('load failure leaves source and retries on Preview', async () => {
  const renderer = api(), loader = vi.fn<() => Promise<MermaidApi>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(renderer)
  const { container } = await mount({ mermaidLoader: loader })
  expect(container.querySelector('pre')?.style.display).not.toBe('none')
  expect(container.querySelector('.mermaid-error')).not.toBeNull()
  container.querySelector<HTMLButtonElement>('.mermaid-toggle-btn')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  await settle(); expect(container.querySelector('#injected')).not.toBeNull(); expect(loader).toHaveBeenCalledTimes(2)
})
it.each(['language', 'destroy'])('ignores render arriving after %s change', async action => {
  let resolve!: (v: { svg: string }) => void
  const renderer = api(); renderer.renderMermaid = () => new Promise(r => { resolve = r })
  const { container, editor } = await mount({ mermaidLoader: async () => renderer })
  const preview = container.querySelector('.mermaid-preview')!
  if (action === 'destroy') editor.destroy()
  else editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { language: 'javascript' }))
  resolve({ svg: '<svg id="late"/>' }); await settle()
  expect(preview.querySelector('#late')).toBeNull()
})
it('Edit then Preview preserves source and reuses the loader', async () => {
  const loader = vi.fn(async () => api())
  const { container } = await mount({ mermaidLoader: loader })
  const toggle = container.querySelector<HTMLButtonElement>('.mermaid-toggle-btn')!
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  expect(container.querySelector('pre')?.style.display).not.toBe('none')
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await settle()
  expect(container.querySelector('#injected')).not.toBeNull(); expect(loader).toHaveBeenCalledOnce()
})
it('separates concurrent hosts and updates only their loaded APIs on theme change', async () => {
  const a = api('a'), b = api('b')
  const [first, second, source] = await Promise.all([mount({ mermaidLoader: async () => a }), mount({ mermaidLoader: async () => b }), mount()])
  expect(first.container.querySelector('#a')).not.toBeNull(); expect(first.container.querySelector('#b')).toBeNull()
  expect(second.container.querySelector('#b')).not.toBeNull(); expect(source.container.querySelector('.mermaid-preview svg')).toBeNull()
  document.documentElement.setAttribute('data-theme', 'dark'); await settle()
  expect(a.updateMermaidTheme).toHaveBeenCalled(); expect(b.updateMermaidTheme).toHaveBeenCalled()
  expect(a.renderMermaid).toHaveBeenCalledTimes(2)
  first.editor.destroy(); vi.mocked(a.updateMermaidTheme).mockClear()
  document.documentElement.setAttribute('data-theme', 'light'); await settle()
  expect(a.updateMermaidTheme).not.toHaveBeenCalled(); expect(b.renderMermaid).toHaveBeenCalledTimes(3)
})
it('does not delegate mermaid to the renderer registry and does not load an empty fence', async () => {
  const renderer = api(), loader = vi.fn(async () => renderer), load = vi.fn(async () => ({ render() {} }))
  const registry = { versions: { mermaid: '1' }, has: () => true, load }
  const source = await mount({ rendererRegistry: registry })
  expect(source.container.querySelector('pre')?.style.display).not.toBe('none'); expect(load).not.toHaveBeenCalled()
  await mount({ initialContent: '```mermaid\n```', mermaidLoader: loader, rendererRegistry: registry })
  expect(loader).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled()
})
it('ignores a late loader after language change and can return to mermaid', async () => {
  let release!: (v: MermaidApi) => void
  const renderer = api(), loader = () => new Promise<MermaidApi>(r => { release = r })
  const { editor, container } = await mount({ mermaidLoader: loader })
  editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { language: 'javascript' }))
  release(renderer); await settle(); expect(renderer.renderMermaid).not.toHaveBeenCalled()
  editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { language: 'mermaid' }))
  await settle(); expect(container.querySelector('#injected')).not.toBeNull()
})
it('keeps syntax failures editable without modifying the document', async () => {
  const renderer = api(); renderer.renderMermaid = async () => ({ error: 'Invalid graph' })
  const { editor, container } = await mount({ mermaidLoader: async () => renderer })
  expect(container.querySelector('pre')?.style.display).not.toBe('none')
  expect(container.querySelector('.mermaid-error')?.textContent).toBe('Invalid graph')
  expect(editor.view.state.doc.firstChild?.textContent).toBe('graph TD; A-->B')
})
