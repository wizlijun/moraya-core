/**
 * E2E through the real createEditor entry: when a frontmatterViewFactory is
 * supplied, the leading `--- … ---` block renders via the consumer NodeView
 * (read-only) instead of the raw <pre>, without breaking parse/serialize.
 */
import { describe, test, expect } from 'vitest'
import { createEditor } from '../setup'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import type { FrontmatterViewFactory } from '../types'

const DOC = `---\ntitle: Hello\ntags:\n  - a\n  - b\n---\n\n# Body\n`

// Minimal factory: render the raw YAML into a marked container so we can assert
// the NodeView path fired.
const factory: FrontmatterViewFactory = {
  render(container, raw) {
    const el = document.createElement('div')
    el.className = 'test-fm-render'
    el.textContent = raw
    container.appendChild(el)
    return { destroy() {} }
  },
}

async function mount(withFactory: boolean) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const inst = await createEditor({
    container,
    initialContent: DOC,
    mediaResolver: new BrowserMediaResolver(),
    ...(withFactory ? { frontmatterViewFactory: factory } : {}),
  })
  return { inst, container }
}

describe('frontmatterViewFactory', () => {
  test('renders frontmatter through the NodeView and keeps the doc intact', async () => {
    const { inst, container } = await mount(true)

    // NodeView container + consumer render both present; raw <pre> replaced.
    expect(container.querySelector('.frontmatter-node-view')).toBeTruthy()
    const rendered = container.querySelector('.test-fm-render')
    expect(rendered?.textContent).toBe('title: Hello\ntags:\n  - a\n  - b')
    expect(container.querySelector('pre.moraya-frontmatter')).toBeNull()

    // Model unchanged: first node is still the frontmatter node with raw text.
    const first = inst.view.state.doc.firstChild!
    expect(first.type.name).toBe('frontmatter')
    expect(first.textContent).toBe('title: Hello\ntags:\n  - a\n  - b')

    inst.destroy(); container.remove()
  })

  test('falls back to raw <pre> when no factory is supplied', async () => {
    const { inst, container } = await mount(false)
    expect(container.querySelector('.frontmatter-node-view')).toBeNull()
    expect(container.querySelector('pre.moraya-frontmatter')).toBeTruthy()
    inst.destroy(); container.remove()
  })
})
