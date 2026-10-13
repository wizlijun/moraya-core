import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import MarkdownIt from 'markdown-it'
import { captureFilePipeline, replayFilePipeline } from '../markdown'
import { emptyFileParseWork } from '../source-file-cache'

const cases = [
  '- [x] done\n- [ ] todo', '[empty]() and [other]()',
  '<audio src="a.mp3"></audio>\n\n<video src="v.mp4"></video>',
  '<b>bold</b> and <i>italic</i>', 'a\\*b &amp; c\\[d\\]',
  'alpha  \nbeta\\\n', '\n\nAlpha\n\n\n',
  '> ```\n> closed\n> ```\n', '> ```\n> unclosed\n',
  '[A][id]\n\n[id]: /one\n[id]: /two\n[unused]: /keep\n',
  'A[^x] ![alt[^x]](/img)\n\n[^x]: body\n',
  '\uFEFFalpha\r\n\r\nbeta\r\n',
]
it.each(cases)('replays independent token templates twice: %j', source => {
  const full = captureFilePipeline(source)
  expect(full.ok).toBe(true)
  if (!full.ok) throw new Error(full.reason)
  const before = JSON.stringify(full.cache)
  const probe = new MarkdownIt()
  const block = vi.spyOn(Object.getPrototypeOf(probe.block), 'parse')
  const inline = vi.spyOn(Object.getPrototypeOf(probe.inline), 'parse')
  try {
    for (let i = 0; i < 2; i++) {
      const work = emptyFileParseWork()
      const replay = replayFilePipeline(full.cache, undefined, work)
      expect(replay.ok).toBe(true)
      if (!replay.ok) throw new Error(replay.reason)
      expect(replay.value.doc.eq(full.value.doc)).toBe(true)
      for (const key of ['roots', 'gaps', 'protectedSources', 'layout', 'textRuns'] as const)
        expect(replay.value[key]).toEqual(full.value[key])
      expect(work.fullCaptureCalls).toBe(0)
      expect(work.blockParseCalls).toBe(0)
      expect(work.inlineParseCalls).toBe(0)
      expect(work.pmEmissionTokenCount).toBeGreaterThan(0)
      expect(JSON.stringify(full.cache)).toBe(before)
      for (const token of full.cache.blockTokens) expect(typeof token.attrGet).toBe('function')
    }
    expect(block).not.toHaveBeenCalled()
    expect(inline).not.toHaveBeenCalled()
  } finally { vi.restoreAllMocks() }
})

it('fails closed when actual rule dispatch is unavailable instead of emitting an empty document', () => {
  const probe = new MarkdownIt(), ruler = Object.getPrototypeOf(probe.core.ruler)
  const spy = vi.spyOn(ruler, 'getRules').mockReturnValue([])
  try { expect(captureFilePipeline('must survive')).toEqual({ ok: false, reason: 'unsupported-source' }) }
  finally { spy.mockRestore() }
})
it('fails closed when installed block State has an incompatible line table', () => {
  const probe = new MarkdownIt(), proto = Object.getPrototypeOf(probe.block), Original = proto.State
  const spy = vi.spyOn(proto, 'State').mockImplementation(function (...args: unknown[]) {
    const state = new Original(...args)
    state.bsCount = null
    return state
  })
  try { expect(captureFilePipeline('must survive')).toEqual({ ok: false, reason: 'unsupported-source' }) }
  finally { spy.mockRestore() }
})

const manifest = JSON.parse(readFileSync('src/__tests__/fixtures/source-fidelity/manifest.json', 'utf8')) as {name:string}[]
it.each(manifest)('replays frozen corpus three times without changing raw bytes: $name', ({name}) => {
  const source = readFileSync('src/__tests__/fixtures/source-fidelity/' + name + '.md', 'utf8')
  const full = captureFilePipeline(source)
  expect(full.ok).toBe(true)
  if(!full.ok) throw new Error(full.reason)
  const fingerprint = JSON.stringify(full.cache)
  for(let i=0;i<3;i++){
    const result = replayFilePipeline(full.cache)
    expect(result.ok).toBe(true)
    if(!result.ok) throw new Error(result.reason)
    expect(result.value.doc.eq(full.value.doc)).toBe(true)
    for(const key of ['roots','gaps','protectedSources','layout','textRuns'] as const)expect(result.value[key]).toEqual(full.value[key])
    expect(Buffer.from(result.cache.source)).toEqual(Buffer.from(source))
    expect(JSON.stringify(full.cache)).toBe(fingerprint)
  }
})
