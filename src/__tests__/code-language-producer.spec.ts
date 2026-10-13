import { afterEach, expect, it } from 'vitest'
import { parseMarkdown, parseMarkdownAsync, serializeMarkdown } from '../markdown'
import { applySourceBlockTransaction, createSourceSession } from '../source-fidelity'

import { DOMParser } from 'prosemirror-model'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { toggleCodeBlock } from '../commands'
import { buildInputRules, preloadEnhancementPlugins } from '../setup'
import { createEnterHandlerPlugin } from '../plugins/enter-handler'
import { createCodeBlockNodeViewFactory } from '../plugins/code-block-view'


it.each(['', 'text', 'TypeScript', 'mermaid', 'dot', 'graphviz'])(
  'retains exact fence language %j in sync/async/source', async language => {
    const raw = '```' + language + '\nx\n```'
    const doc = parseMarkdown(raw)
    expect(doc.firstChild!.attrs.language).toBe(language)
    expect(serializeMarkdown(doc)).toBe(raw)
    expect((await parseMarkdownAsync(raw)).eq(doc)).toBe(true)
    const capture = createSourceSession(raw, doc.type.schema)
    expect(capture.ok).toBe(true)
    if (!capture.ok) throw new Error(capture.reason)
    expect(capture.session.doc.firstChild!.attrs.language).toBe(language)
    expect(capture.session.source).toBe(raw)
  },
)


const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })
const views: EditorView[] = []
afterEach(() => { for (const view of views.splice(0)) view.destroy(); document.body.innerHTML = '' })

it('keeps explicit text in the real asynchronous parser branch', async () => {
  const raw = 'p\n\n'.repeat(20_000) + '```text\nx\n```'
  const doc = await parseMarkdownAsync(raw)
  expect(doc.lastChild!.attrs.language).toBe('text')
  expect(doc.eq(parseMarkdown(raw))).toBe(true)
})

it.each([['<pre><code>x</code></pre>', ''], ['<pre data-language="text"><code>x</code></pre>', 'text']])(
  'reads DOM language exactly from %s', (html, language) => {
    const container = document.createElement('div'); container.innerHTML = html!
    const doc = DOMParser.fromSchema(schema).parse(container)
    expect(doc.firstChild!.attrs.language).toBe(language)
    expect(serializeMarkdown(doc)).toBe('```' + language + '\nx\n```')
  },
)

it('keeps an untouched indented source code block and exposes no language', () => {
  const raw = '    x', captured = createSourceSession(raw)
  expect(parseMarkdown(raw).firstChild!.attrs.language).toBe('')
  expect(serializeMarkdown(parseMarkdown(raw))).toBe('```\nx\n```')
  expect(captured.ok && captured.session.source).toBe(raw)
  expect(captured.ok && captured.session.doc.firstChild!.attrs.language).toBe('')
})

it('uses the actual state schema when toggling code and commits its transaction to Source', () => {
  const captured = createSourceSession('x', schema)
  if (!captured.ok) throw new Error(captured.reason)
  const state = EditorState.create({ doc: captured.session.doc })
  let transaction: Transaction | undefined
  expect(toggleCodeBlock(state, tr => { transaction = tr })).toBe(true)
  if (!transaction) throw new Error('no code transaction')
  expect(transaction.doc.firstChild!.type).toBe(schema.nodes.code_block)
  expect(transaction.doc.firstChild!.attrs.language).toBe('')
  const applied = applySourceBlockTransaction(captured.session, transaction)
  expect(applied.ok).toBe(true)
  if (!applied.ok) throw new Error(applied.reason)
  expect(applied.session.source).toBe('```\nx\n```')
  expect(applied.session.doc.eq(transaction.doc)).toBe(true)
  const codeState = state.apply(transaction)
  expect(toggleCodeBlock(codeState, tr => { transaction = tr })).toBe(true)
  expect(transaction.doc.firstChild!.type).toBe(schema.nodes.paragraph)
  expect(transaction.doc.textContent).toBe('x')
})

it.each(['', 'text', 'TypeScript', 'mermaid', 'dot', 'graphviz'])(
  'creates exact language %j through actual Enter and setup input rules', async language => {
    const tier1 = await preloadEnhancementPlugins(schema)
    for (const producer of ['enter', 'input-rule']) {
      const seed = '```' + language
      const doc = schema.node('doc', null, schema.node('paragraph', null, schema.text(seed)))
      const transactions: Transaction[] = []
      const view = new EditorView(document.body, {
        state: EditorState.create({ doc, selection: TextSelection.create(doc, seed.length + 1),
          plugins: [buildInputRules(schema, tier1), createEnterHandlerPlugin()] }),
        dispatchTransaction(tr) { transactions.push(tr); view.updateState(view.state.apply(tr)) },
      })
      views.push(view)
      const before = view.state.doc
      const handled = producer === 'enter'
        ? view.someProp('handleKeyDown', handler => handler(view, new KeyboardEvent('keydown', { key: 'Enter' })))
        : view.someProp('handleTextInput', handler => handler(view, seed.length + 1, seed.length + 1, ' '))
      expect(handled).toBe(true)
      expect(before.firstChild!.type.name).toBe('paragraph')
      expect(transactions).toHaveLength(1)
      expect(transactions[0]!.before.eq(before)).toBe(true)
      expect(transactions[0]!.doc.eq(view.state.doc)).toBe(true)
      expect(view.state.doc.firstChild!.attrs.language).toBe(language)
      expect(view.state.doc.firstChild!.type.name).toBe('code_block')
    }
  },
)

it.each(['', 'text', 'TypeScript'])(
  'mounts and updates language %j without mutation, then writes text only on picker selection', language => {
    const doc = parseMarkdown('```' + language + '\nx\n```', schema), transactions: Transaction[] = []
    const view = new EditorView(document.body, {
      state: EditorState.create({ doc }),
      nodeViews: { code_block: createCodeBlockNodeViewFactory() },
      dispatchTransaction(tr) { transactions.push(tr); view.updateState(view.state.apply(tr)) },
    })
    views.push(view)
    view.updateState(view.state.apply(view.state.tr.insertText('y', 2)))
    view.focus()
    expect(transactions.filter(tr => tr.docChanged)).toHaveLength(0)
    expect(view.state.doc.firstChild!.attrs.language).toBe(language)
    const label = view.dom.querySelector('.code-lang-label')!
    expect(label.textContent).toBe(language === '' ? 'text' : language === 'text' ? 'Plain Text' : 'TypeScript')
    label.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    const plain = Array.from(document.querySelectorAll<HTMLElement>('.code-lang-option')).find(el => el.textContent?.includes('Plain Text'))
    expect(plain).toBeDefined()
    plain!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.state.doc.firstChild!.attrs.language).toBe('text')
    expect(serializeMarkdown(view.state.doc)).toBe('```text\nxy\n```')
    expect(transactions.filter(tr => tr.docChanged)).toHaveLength(1)
  },
)

it.each(['', 'text'])(
  'Source preserves actual language %j including empty code and terminal content LF', language => {
    for (const content of ['', 'x', 'x\n']) {
      const raw = '```' + language + '\n' + content + '\n```'
      const captured = createSourceSession(raw, schema)
      if (!captured.ok) throw new Error(captured.reason)
      expect(captured.session.source).toBe(raw)
      expect(captured.session.doc.firstChild!.textContent).toBe(content)
      const nextLanguage = language === '' ? 'text' : ''
      const tr = EditorState.create({ doc: captured.session.doc }).tr.setNodeMarkup(0, undefined, { language: nextLanguage })
      const result = applySourceBlockTransaction(captured.session, tr)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.reason)
      expect(result.session.source).toBe('```' + nextLanguage + '\n' + content + '\n```')
      expect(result.session.doc.eq(tr.doc)).toBe(true)
    }
  },
)

it.each(['', 'text', 'TypeScript', 'mermaid', 'dot', 'graphviz', 'Mermaid', 'Dot'])(
  'routes exact renderer language %j and preserves attrs through preview toggles', async language => {
    const source = language.toLowerCase() === 'mermaid' ? 'graph TD; A-->B' : 'digraph G { A -> B }'
    const raw = '```' + language + '\n' + source + '\n```'
    const doc = parseMarkdown(raw, schema), transactions: Transaction[] = [], loaded: string[] = []
    const registry = {
      versions: { dot: 'test', graphviz: 'test' },
      has: (lang: string) => lang === 'dot' || lang === 'graphviz',
      load: async (lang: string) => {
        loaded.push(lang)
        return { render: (text: string, container: HTMLElement) => { container.textContent = text } }
      },
    }
    const view = new EditorView(document.body, {
      state: EditorState.create({ doc }),
      nodeViews: { code_block: createCodeBlockNodeViewFactory({ rendererRegistry: registry }) },
      dispatchTransaction(tr) { transactions.push(tr); view.updateState(view.state.apply(tr)) },
    })
    views.push(view)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const wrapper = view.dom.querySelector<HTMLElement>('.code-block-wrapper')!
    const mermaid = language === 'mermaid', renderer = language === 'dot' || language === 'graphviz'
    expect(wrapper.classList.contains('mermaid-preview-mode')).toBe(mermaid)
    expect(wrapper.classList.contains('renderer-preview-mode')).toBe(renderer)
    if (renderer) {
      await new Promise(resolve => setTimeout(resolve, 180))
      expect(loaded).toEqual([language])
      expect(wrapper.querySelector('.renderer-preview')!.textContent).toBe(source)
    } else expect(loaded).toEqual([])
    if (mermaid || renderer) {
      const toggle = wrapper.querySelector('.mermaid-toggle-btn')!
      toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      expect(wrapper.querySelector<HTMLElement>('pre')!.style.display).toBe('')
      toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      expect(wrapper.querySelector<HTMLElement>('pre')!.style.display).toBe('none')
    }
    expect(view.state.doc.firstChild!.attrs.language).toBe(language)
    expect(serializeMarkdown(view.state.doc)).toBe(raw)
    expect(transactions.filter(tr => tr.docChanged)).toHaveLength(0)
  },
)
