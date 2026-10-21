import { afterEach, expect, it, vi } from 'vitest'
import { createEditor, type MorayaEditorInstance } from '../setup'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'

vi.mock('../plugins/mermaid-renderer', () => ({
  renderMermaid: async () => ({ svg: '<svg id="legacy-namespace"/>' }),
  updateMermaidTheme() {},
}))

const source = 'graph TD; A-->B'
const editors: MorayaEditorInstance[] = []
let width = 320
class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = []
  target?: Element
  constructor(private callback: ResizeObserverCallback) { ControlledResizeObserver.instances.push(this) }
  observe(target: Element) { this.target = target }
  disconnect() { this.target = undefined }
  emit(nextWidth: number, height = 100) {
    width = nextWidth
    if (this.target) this.callback([{ target: this.target, contentRect: { width: nextWidth, height } } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 210))
type RenderResult = { svg: string } | { error: string }
async function mount(responsive = true, render = vi.fn<(_code: string, _options?: { maxWidth?: number }) => Promise<RenderResult>>(async () => ({ svg: '<svg><text>ready</text></svg>' }))) {
  const api = { supportsResponsiveLayout: responsive, renderMermaid: render, updateMermaidTheme: vi.fn() }
  const container = document.createElement('div'); document.body.append(container)
  const editor = await createEditor({ container, initialContent: '```mermaid\n' + source + '\n```', mediaResolver: new BrowserMediaResolver(), mermaidLoader: async () => api })
  editors.push(editor); await settle()
  const toggle = () => container.querySelector('.mermaid-toggle-btn')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  return { container, editor, api, render, toggle }
}
afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy()); document.body.replaceChildren()
  document.documentElement.removeAttribute('data-theme'); vi.restoreAllMocks(); vi.unstubAllGlobals()
  ControlledResizeObserver.instances = []; width = 320
})
function controlWidths() {
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 100, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 100, toJSON() {} }))
}
it('keeps legacy rendering single-argument and creates no observer', async () => {
  controlWidths(); const { render, container } = await mount(false)
  expect(render).toHaveBeenCalledWith(source)
  expect(render.mock.calls[0]).toHaveLength(1)
  expect(container.querySelector('.mermaid-preview svg')?.textContent).toBe('ready')
  expect(ControlledResizeObserver.instances).toHaveLength(0)
})
it('passes content width and observes a stable wrapper, ignoring same width, height and zero changes', async () => {
  controlWidths(); const { render, container } = await mount()
  expect(render).toHaveBeenLastCalledWith(source, { maxWidth: 320, container: container.querySelector('.mermaid-preview') })
  expect((render.mock.calls[0]?.[1] as { container?: HTMLElement })?.container).toBe(container.querySelector('.mermaid-preview'))
  expect(ControlledResizeObserver.instances).toHaveLength(1)
  const observer = ControlledResizeObserver.instances[0]
  expect(observer.target).toBe(container.querySelector('.mermaid-preview')!.parentElement)
  observer.emit(320, 900); observer.emit(0); await settle()
  expect(render).toHaveBeenCalledTimes(1)
  observer.emit(240); await settle()
  expect(render).toHaveBeenLastCalledWith(source, { maxWidth: 240, container: container.querySelector('.mermaid-preview') })
  expect(render).toHaveBeenCalledTimes(2)
})
it('subtracts initial wrapper padding and borders before rendering content width', async () => {
  controlWidths()
  const style = document.createElement('style')
  style.textContent = '.code-block-wrapper { padding-left: 12px; padding-right: 18px; border-left: 2px solid; border-right: 3px solid; }'
  document.head.append(style)
  try {
    const { render, container } = await mount()
    expect(getComputedStyle(container.querySelector('.code-block-wrapper')!).paddingLeft).toBe('12px')
    expect(render).toHaveBeenLastCalledWith(source, { maxWidth: 285, container: container.querySelector('.mermaid-preview') })
    ControlledResizeObserver.instances[0].emit(240); await settle()
    expect(render).toHaveBeenLastCalledWith(source, { maxWidth: 240, container: container.querySelector('.mermaid-preview') })
  } finally { style.remove() }
})
it('waits for a hidden initial container to become visible', async () => {
  controlWidths(); width = 0
  const { render, container } = await mount()
  expect(render).not.toHaveBeenCalled()
  expect(ControlledResizeObserver.instances).toHaveLength(1)
  ControlledResizeObserver.instances[0].emit(280); await settle()
  expect(render).toHaveBeenCalledWith(source, { maxWidth: 280, container: container.querySelector('.mermaid-preview') })
  expect(container.querySelector('.mermaid-preview svg')?.textContent).toBe('ready')
})
it('invalidates a pending old-width result immediately, before resize debounce finishes', async () => {
  controlWidths(); let release!: (value: { svg: string }) => void
  const render = vi.fn((_code: string, options?: { maxWidth?: number }) => options?.maxWidth === 320 ? new Promise<{ svg: string }>(resolve => { release = resolve }) : Promise.resolve({ svg: '<svg><text>current-width</text></svg>' }))
  const { container } = await mount(true, render)
  expect(ControlledResizeObserver.instances).toHaveLength(1)
  ControlledResizeObserver.instances[0].emit(200)
  release({ svg: '<svg><text>stale-width</text></svg>' }); await Promise.resolve(); await Promise.resolve()
  expect(container.textContent).not.toContain('stale-width')
  await settle(); expect(container.querySelector('.mermaid-preview svg')?.textContent).toBe('current-width')
})
it('disconnects on Edit, reconnects with fresh width and preserves theme rendering', async () => {
  controlWidths(); const { render, toggle, container } = await mount()
  expect(ControlledResizeObserver.instances).toHaveLength(1)
  const observer = ControlledResizeObserver.instances[0]
  toggle(); expect(observer.target).toBeUndefined()
  width = 210; toggle(); await settle()
  expect(render).toHaveBeenLastCalledWith(source, { maxWidth: 210, container: container.querySelector('.mermaid-preview') })
  document.documentElement.setAttribute('data-theme', 'dark'); await settle()
  expect(render).toHaveBeenCalledTimes(3)
  expect(container.querySelector('.mermaid-preview svg')).not.toBeNull()
})
it.each(['language', 'destroy'])('disconnects and rejects pending results after %s', async action => {
  controlWidths(); let release!: (value: { svg: string }) => void
  const render = vi.fn((_code: string, _options?: { maxWidth?: number }) => new Promise<{ svg: string }>(resolve => { release = resolve }))
  const { editor, container } = await mount(true, render)
  expect(ControlledResizeObserver.instances).toHaveLength(1)
  const observer = ControlledResizeObserver.instances[0]
  if (action === 'destroy') editor.destroy()
  else editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { language: 'javascript' }))
  expect(observer.target).toBeUndefined()
  release({ svg: '<svg><text>late</text></svg>' }); await settle()
  expect(container.querySelector('.mermaid-preview svg')).toBeNull()
  if (action === 'language') {
    render.mockResolvedValue({ svg: '<svg><text>returned</text></svg>' })
    editor.view.dispatch(editor.view.state.tr.setNodeMarkup(0, undefined, { language: 'mermaid' })); await settle()
    expect(container.querySelector('.mermaid-preview svg')?.textContent).toBe('returned')
  }
})
it('disconnects on render failure and reconnects for Preview retry', async () => {
  controlWidths()
  const render = vi.fn(async (_code: string, _options?: { maxWidth?: number }): Promise<{ svg: string } | { error: string }> => ({ error: 'invalid' }))
  const { toggle, container } = await mount(true, render)
  expect(ControlledResizeObserver.instances).toHaveLength(1)
  expect(ControlledResizeObserver.instances[0].target).toBeUndefined()
  render.mockResolvedValue({ svg: '<svg><text>retried</text></svg>' }); width = 260; toggle(); await settle()
  expect(render).toHaveBeenLastCalledWith(source, { maxWidth: 260, container: container.querySelector('.mermaid-preview') })
  expect(container.querySelector('.mermaid-preview svg')?.textContent).toBe('retried')
})

it('renders a legacy module namespace without reading an absent capability export', async () => {
  controlWidths()
  const container = document.createElement('div'); document.body.append(container)
  const editor = await createEditor({ container, initialContent: '```mermaid\n' + source + '\n```',
    mediaResolver: new BrowserMediaResolver(), mermaidLoader: () => import('../plugins/mermaid-renderer') })
  editors.push(editor); await settle()
  expect(container.querySelector('#legacy-namespace')).not.toBeNull()
  expect(ControlledResizeObserver.instances).toHaveLength(0)
})
