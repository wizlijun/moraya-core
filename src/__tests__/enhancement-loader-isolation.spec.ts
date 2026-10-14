import { expect, it } from 'vitest'
import { preloadEnhancementPlugins } from '../setup'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import type { MermaidLoader, RendererRegistry } from '../types'
const loader: MermaidLoader = async () => ({ renderMermaid: async () => ({ svg: '<svg/>' }), updateMermaidTheme() {} })
it('isolates pending and complete factories by schema, registry and loader', async () => {
  const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })
  const other = createSchema({ mediaResolver: new BrowserMediaResolver() })
  const registry: RendererRegistry = { has: () => false, versions: {}, load: async () => { throw new Error('unused') } }
  const a = preloadEnhancementPlugins(schema, undefined, loader)
  expect(preloadEnhancementPlugins(schema, undefined, loader)).toBe(a)
  const b = preloadEnhancementPlugins(schema), c = preloadEnhancementPlugins(other, undefined, loader), d = preloadEnhancementPlugins(schema, registry, loader)
  expect(b).not.toBe(a); expect(c).not.toBe(a); expect(d).not.toBe(a)
  const results = await Promise.all([a, b, c, d])
  expect(new Set(results.map(v => v.codeBlockView)).size).toBe(4)
  expect((await preloadEnhancementPlugins(schema, registry, loader)).codeBlockView).toBe(results[3]!.codeBlockView)
  expect((await preloadEnhancementPlugins(schema, registry)).codeBlockView).not.toBe(results[3]!.codeBlockView)
})
