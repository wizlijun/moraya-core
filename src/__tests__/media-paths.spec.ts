import { describe, expect, it, vi } from 'vitest'
import { DOMSerializer } from 'prosemirror-model'
import { createSchema, setDocumentBaseDir } from '../schema'

function fixture() {
  const resolver = {
    loadLocalImage: vi.fn(async () => 'blob:image'),
    loadLocalMedia: vi.fn(async () => 'blob:media'),
    loadRemoteMedia: vi.fn(async (url: string) => url),
  }
  const schema = createSchema({ mediaResolver: resolver })
  const render = (type: 'image' | 'html_inline', attrs: Record<string, string>) => {
    const node = schema.nodes[type].create(attrs)
    return DOMSerializer.fromSchema(schema).serializeNode(node) as HTMLElement
  }
  return { resolver, render }
}

describe('local media URL boundary', () => {
  it('passes the original source to the consumer without decoding its base directory', async () => {
    setDocumentBaseDir('/vault/literal%20')
    const { resolver, render } = fixture()
    const dom = render('image', { src: './part%2520%23one%3F.png?q=1#section' })
    await vi.waitFor(() => expect(dom.querySelector('img')?.src).toBe('blob:image'))
    expect(resolver.loadLocalImage).toHaveBeenCalledWith('/vault/literal%20/part%20#one?.png', {
      src: './part%2520%23one%3F.png?q=1#section', baseDir: '/vault/literal%20',
    })
  })

  it.each(['video', 'audio'])('decodes %s URLs once and passes source context', async (tag) => {
    setDocumentBaseDir('/vault/literal%20')
    const { resolver, render } = fixture()
    const dom = render('html_inline', { value: `<${tag} src="./hello%20world.mp4?v=1#t=2"></${tag}>` })
    await vi.waitFor(() => expect(dom.querySelector(tag)?.getAttribute('src')).toBe('blob:media'))
    expect(resolver.loadLocalMedia).toHaveBeenCalledWith('/vault/literal%20/hello world.mp4', {
      src: './hello%20world.mp4?v=1#t=2', baseDir: '/vault/literal%20',
    })
  })

  it('resolves file URLs without joining them to the document directory', async () => {
    setDocumentBaseDir('/vault')
    const { resolver, render } = fixture()
    render('image', { src: 'file:///tmp/a%20b.png' })
    expect(resolver.loadLocalImage).toHaveBeenCalledWith('/tmp/a b.png', {
      src: 'file:///tmp/a%20b.png', baseDir: '/vault',
    })
  })

  it('routes video posters through the image resolver', async () => {
    setDocumentBaseDir('/vault')
    const { resolver, render } = fixture()
    const dom = render('html_inline', { value: '<video poster="/assets/cover%20photo.png"><source src="/assets/a%20b.mp4"></video>' })
    await vi.waitFor(() => expect(dom.querySelector('video')?.getAttribute('poster')).toBe('blob:image'))
    expect(resolver.loadLocalImage).toHaveBeenCalledWith('/assets/cover photo.png', {
      src: '/assets/cover%20photo.png', baseDir: '/vault',
    })
    expect(resolver.loadLocalMedia).toHaveBeenCalledWith('/assets/a b.mp4', {
      src: '/assets/a%20b.mp4', baseDir: '/vault',
    })
  })

  it.each(['https://example.com/a.png', '//example.com/a.png', 'data:image/png;base64,YQ==', 'blob:example'])('does not send remote sources to the filesystem: %s', (src) => {
    const { resolver, render } = fixture()
    const dom = render('image', { src })
    expect(dom.querySelector('img')?.getAttribute('src')).toBe(src)
    expect(resolver.loadLocalImage).not.toHaveBeenCalled()
  })
})
