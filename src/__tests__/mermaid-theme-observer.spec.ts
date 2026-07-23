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
import type { EditorView } from 'prosemirror-view'
import { parseMarkdown } from '../markdown'

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
  const { createCodeBlockNodeViewFactory } = await import('../plugins/code-block-view')
  const factory = createCodeBlockNodeViewFactory()
  const doc = parseMarkdown('```mermaid\n```')
  const node = doc.firstChild!
  expect(node.attrs.language).toBe('mermaid')
  const nodeView = factory(node, {} as unknown as EditorView, () => 0)
  // Flush the deferred initial syncMermaidMode (requestAnimationFrame).
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  return nodeView
}

afterEach(() => {
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

    expect(preview.querySelector('.stale-svg')).toBeNull()
  })

  test('re-renders preview on documentElement data-theme mutation', async () => {
    stubMatchMedia()
    const nodeView = await mountMermaidNodeView()
    const preview = (nodeView.dom as HTMLElement).querySelector('.mermaid-preview')!

    preview.innerHTML = '<div class="stale-svg"></div>'
    document.documentElement.setAttribute('data-theme', 'dark')
    // MutationObserver callbacks are delivered asynchronously.
    await new Promise((r) => setTimeout(r, 0))

    expect(preview.querySelector('.stale-svg')).toBeNull()
  })
})
