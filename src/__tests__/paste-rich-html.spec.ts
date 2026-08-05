/**
 * Paste into the rich editor — Cmd+V regression suite.
 *
 * The bug this file was written for: pasting **plain text** into a rich editor
 * inserted nothing at all. `clipboardTextParser` parsed the text with
 * `parseMarkdown(text)` — i.e. against the module-level `defaultSchema` — while
 * the editor runs on the per-call schema `createSchema()` built. ProseMirror
 * compares NodeType/MarkType by *identity*, so the resulting Slice could not be
 * fitted into the document and `replaceSelection` silently produced zero steps.
 * No throw, no console noise, just nothing pasted.
 *
 * These tests drive the FULL plugin stack through `createEditor` and dispatch a
 * real `paste` event carrying `text/html` and/or `text/plain`, exactly as the
 * clipboard delivers it. A diagnostic plugin sits in front of the stack to
 * expose the Slice, so an "empty slice" failure can be told apart from a
 * "non-empty slice that does not fit the schema" failure.
 */
import { describe, test, expect } from 'vitest'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import type { Slice } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { createEditor } from '../setup'
import { serializeMarkdown } from '../markdown'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'

/** Word-ish clipboard HTML: meta charset, mso styles, div/span soup. */
const WORD_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
<meta name=ProgId content=Word.Document>
<style><!-- p.MsoNormal {mso-style-parent:""; margin:0cm; font-size:10.5pt;} --></style>
</head><body lang=ZH-CN style='tab-interval:21.0pt'>
<div class=WordSection1>
<p class=MsoNormal style='mso-margin-top-alt:auto'><span style='font-size:12.0pt;
font-family:"Microsoft YaHei",sans-serif;mso-bidi-font-family:宋体'>第一段落<o:p></o:p></span></p>
<p class=MsoNormal><b><span style='font-weight:bold'>加粗的字</span></b><span>普通的字</span></p>
</div></body></html>`

/** WeChat-article-ish clipboard HTML: nested divs/sections, inline styles. */
const WECHAT_HTML = `<meta charset="utf-8"><div class="rich_media_content" id="js_content">
<section style="margin-bottom: 20px;"><span style="font-size: 16px; letter-spacing: 0.5px;">
微信公众号的一段话</span></section>
<section><p style="line-height: 1.75em;"><strong>重点</strong>后面还有内容</p></section>
</div>`

const WORD_PLAIN = '第一段落\n\n加粗的字普通的字'
const WECHAT_PLAIN = '微信公众号的一段话\n\n重点后面还有内容'

interface PasteProbe {
  called: boolean
  sliceSize: number
  openStart: number
  openEnd: number
  text: string
}

const probeKey = new PluginKey('paste-probe')

function makeProbe(): { plugin: Plugin; probe: PasteProbe } {
  const probe: PasteProbe = {
    called: false, sliceSize: -1, openStart: -1, openEnd: -1, text: '',
  }
  const plugin = new Plugin({
    key: probeKey,
    props: {
      handlePaste(_view: EditorView, _event: ClipboardEvent, slice: Slice) {
        probe.called = true
        probe.sliceSize = slice.content.size
        probe.openStart = slice.openStart
        probe.openEnd = slice.openEnd
        probe.text = slice.content.textBetween(0, slice.content.size, '\n', '')
        return false // never handle — just observe
      },
    },
  })
  return { plugin, probe }
}

/** Dispatch a synthetic `paste` event carrying html and/or plain. */
function firePaste(view: EditorView, html: string, plain: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData(type: string) {
        if (type === 'text/html') return html
        if (type === 'text/plain') return plain
        return ''
      },
      types: [html ? 'text/html' : '', plain ? 'text/plain' : ''].filter(Boolean),
    },
  })
  view.dom.dispatchEvent(event)
}

/** Mirrors mdeditor's `mountRichEditor` option set. */
async function mount(initial: string) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const inst = await createEditor({
    container,
    initialContent: initial,
    mediaResolver: new BrowserMediaResolver(),
    enableMath: true,
    enableMermaid: false,
    enableTableResize: true,
    enableImageSelection: true,
    enableHistory: true,
    enableInlineMarkInputRules: false,
    inlineSyntaxScope: 'line',
  })
  const { plugin, probe } = makeProbe()
  inst.view.updateState(
    inst.view.state.reconfigure({ plugins: [plugin, ...inst.view.state.plugins] }),
  )
  const v = inst.view
  v.focus()
  // Caret at the end of the seed paragraph — the realistic paste position.
  v.dispatch(v.state.tr.setSelection(
    TextSelection.create(v.state.doc, v.state.doc.content.size - 1),
  ))
  return {
    inst,
    view: v,
    probe,
    cleanup() { inst.destroy(); container.remove() },
  }
}

describe('paste — rich HTML sources (Word / WeChat)', () => {
  test('Word HTML lands as paragraphs with the bold run preserved', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, WORD_HTML, WORD_PLAIN)
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEED第一段落\n\n**加粗的字**普通的字')
    h.cleanup()
  })

  test('WeChat HTML lands as paragraphs with the strong run preserved', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, WECHAT_HTML, WECHAT_PLAIN)
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEED微信公众号的一段话\n\n**重点**后面还有内容')
    h.cleanup()
  })
})

describe('paste — plain-text-only clipboard', () => {
  test('plain text is inserted (the schema-identity regression)', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, '', 'hello world')

    // The slice is NOT empty — proving the failure was "does not fit", not
    // "nothing parsed". Before the fix this assertion held and the doc stayed
    // at 'SEED' anyway.
    expect(h.probe.called).toBe(true)
    expect(h.probe.sliceSize).toBeGreaterThan(0)
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEEDhello world')
    h.cleanup()
  })

  test('markdown in plain text renders instead of being escaped', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, '', '**bold** and plain')
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEED**bold** and plain')
    // ...and it really is a mark, not literal asterisks.
    let strong = 0
    h.view.state.doc.descendants((n) => {
      if (n.marks.some((m) => m.type.name === 'strong')) strong++
    })
    expect(strong).toBeGreaterThan(0)
    h.cleanup()
  })

  test('multi-paragraph plain text splits into blocks', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, '', 'line one\n\nline two')
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEEDline one\n\nline two')
    h.cleanup()
  })

  test('CJK plain text is inserted', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, '', '能否为密度泛函理论建立误差界')
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEED能否为密度泛函理论建立误差界')
    h.cleanup()
  })

  test('markdown image syntax becomes a real image node', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, '', '![alt](https://example.com/a.png)')
    let images = 0
    h.view.state.doc.descendants((n) => { if (n.type.name === 'image') images++ })
    expect(images).toBe(1)
    h.cleanup()
  })
})

describe('paste — HTML that yields nothing falls back to the plain text', () => {
  test('empty <a> tag falls back, and the fallback renders markdown', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, '<meta charset="utf-8"><a href="https://x.test"></a>', '**fallback** text')
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEED**fallback** text')
    h.cleanup()
  })

  test('HTML with only unparseable wrappers falls back to the plain text', async () => {
    const h = await mount('SEED\n')
    firePaste(h.view, '<meta charset="utf-8"><div><span></span></div>', 'plain rescue')
    expect(serializeMarkdown(h.view.state.doc)).toBe('SEEDplain rescue')
    h.cleanup()
  })

  test('an image-only paste is NOT clobbered by the plain-text fallback', async () => {
    const h = await mount('SEED\n')
    // Text-free slice, but it carries a real image node — must survive.
    firePaste(h.view, '<meta charset="utf-8"><img src="https://example.com/b.png">', 'b.png')
    let images = 0
    h.view.state.doc.descendants((n) => { if (n.type.name === 'image') images++ })
    expect(images).toBe(1)
    h.cleanup()
  })
})
