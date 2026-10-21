/**
 * Mermaid preview re-render on theme change.
 *
 * Hosts that follow the OS appearance may never mutate <html data-theme> —
 * mdeditor, for example, scopes `data-theme` to the editor host <div> and
 * restyles via `prefers-color-scheme` media queries. The mermaid theme
 * observer must therefore subscribe to the matchMedia change event directly,
 * in addition to the documentElement attribute observer.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { MorayaEditorInstance } from '../setup'
const editors: MorayaEditorInstance[] = []

type SchemeListener = (e: { matches: boolean }) => void

/** Replace window.matchMedia with a stub that records 'change' listeners. */
function stubMatchMedia() {
  const listeners: SchemeListener[] = []
  const mql = {
    matches: false,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, cb: SchemeListener) => { listeners.push(cb) },
    removeEventListener: () => {},
  }
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () => mql as unknown as MediaQueryList,
  )
  return listeners
}

/**
 * Mount a mermaid code-block NodeView from a fresh module instance
 * (vi.resetModules clears the module-level themeObserverInstalled guard).
 */
async function mountMermaidNodeView() {
  vi.resetModules()
  const { createEditor } = await import('../setup')
  const api = { renderMermaid: vi.fn(async () => ({ svg: '<svg><path/></svg>' })), updateMermaidTheme: vi.fn() }
  const container = document.createElement('div'); document.body.append(container)
  const editor = await createEditor({ container, initialContent: '```mermaid\ngraph TD; A-->B\n```',
    mediaResolver: { loadLocalImage: async () => '', loadLocalMedia: async () => '', loadRemoteMedia: async () => '' },
    mermaidLoader: async () => api,
  })
  editors.push(editor)
  await vi.waitFor(() => expect(container.querySelector('.mermaid-preview svg')).not.toBeNull())
  return { dom: container, api }
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
})

describe('mermaid theme observer', () => {
  test('re-renders preview on prefers-color-scheme change without data-theme mutation', async () => {
    const listeners = stubMatchMedia()
    const nodeView = await mountMermaidNodeView()
    const preview = (nodeView.dom as HTMLElement).querySelector('.mermaid-preview')!

    preview.innerHTML = '<div class="stale-svg"></div>'
    expect(listeners.length).toBeGreaterThan(0)
    for (const cb of listeners) cb({ matches: true })

    await vi.waitFor(() => expect(preview.querySelector('svg')).not.toBeNull())
    expect(preview.querySelector('.stale-svg')).toBeNull()
    expect(nodeView.api.updateMermaidTheme).toHaveBeenCalled()
    expect(nodeView.api.renderMermaid).toHaveBeenCalledTimes(2)
  })

  test('re-renders preview on documentElement data-theme mutation', async () => {
    stubMatchMedia()
    const nodeView = await mountMermaidNodeView()
    const preview = (nodeView.dom as HTMLElement).querySelector('.mermaid-preview')!

    preview.innerHTML = '<div class="stale-svg"></div>'
    document.documentElement.setAttribute('data-theme', 'dark')
    // MutationObserver callbacks are delivered asynchronously.
    await new Promise((r) => setTimeout(r, 0))

    await vi.waitFor(() => expect(preview.querySelector('svg')).not.toBeNull())
    expect(preview.querySelector('.stale-svg')).toBeNull()
    expect(nodeView.api.updateMermaidTheme).toHaveBeenCalled()
    expect(nodeView.api.renderMermaid).toHaveBeenCalledTimes(2)
  })

  test('re-renders when the actual editor host switches scoped data-theme', async () => {
    stubMatchMedia()
    const { dom, api } = await mountMermaidNodeView()
    dom.setAttribute('data-theme', 'effie')
    await vi.waitFor(() => expect(api.renderMermaid).toHaveBeenCalledTimes(2))
    expect(api.updateMermaidTheme).toHaveBeenCalledOnce()
    dom.setAttribute('data-theme', 'dark')
    await vi.waitFor(() => expect(api.renderMermaid).toHaveBeenCalledTimes(3))
    expect(api.updateMermaidTheme).toHaveBeenCalledTimes(2)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  test('does not re-render for subtree style, other attributes or rendered child changes', async () => {
    stubMatchMedia()
    const { dom, api } = await mountMermaidNodeView()
    const preview = dom.querySelector<HTMLElement>('.mermaid-preview')!
    dom.style.backgroundColor = 'rgb(242, 238, 228)'
    dom.setAttribute('data-unrelated', 'changed')
    preview.append(document.createElement('span'))
    await new Promise(resolve => setTimeout(resolve, 220))
    expect(api.renderMermaid).toHaveBeenCalledOnce()
    expect(api.updateMermaidTheme).not.toHaveBeenCalled()
  })

})
