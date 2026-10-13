import { afterEach, describe, expect, it } from 'vitest'
import { Schema } from 'prosemirror-model'
import { EditorState, Plugin, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { undoDepth } from 'prosemirror-history'
import { createEditor, type CreateEditorOptions, type MorayaEditorInstance } from '../setup'
import { createSourceSession } from '../source-fidelity'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'

// Extra option typing allows RED to exercise the old real factory, without a
// missing import or a TypeScript error being mistaken for a behavioral failure.
type FactoryOptions = CreateEditorOptions & {
  configureSchema?: (base: Schema) => Schema
  createState?: (schema: Schema, plugins: readonly Plugin[]) => EditorState
  dispatchTransaction?: (view: EditorView, tr: Transaction) => void
}
const instances: MorayaEditorInstance[] = []
afterEach(() => { instances.splice(0).forEach(i => i.destroy()); document.body.replaceChildren() })
function options(extra: Partial<FactoryOptions> = {}): FactoryOptions {
  const container = document.createElement('div')
  document.body.append(container)
  return { container, mediaResolver: new BrowserMediaResolver(), ...extra }
}

describe('file factory first state', () => {
  it.each(['\ufeff---\r\ntitle: Hello\r\n---\r\n\r\nBody\r\n', '---\r\n---\r\n'])(
    'mounts the captured document with the final schema on its first frame: %j', async raw => {
      let finalSchema: Schema | undefined
      let supplied: EditorState | undefined
      const frames: { raw: string; state: EditorState | undefined }[] = []
      let dispatches = 0
      let changes = 0
      const opts = options({
        initialContent: raw,
        configureSchema(base) {
          finalSchema = new Schema({
            nodes: base.spec.nodes.update('paragraph', {
              ...base.spec.nodes.get('paragraph')!,
              attrs: { identity: { default: 'final' } },
            }),
            marks: base.spec.marks,
          })
          return finalSchema
        },
        createState(schema, plugins) {
          const result = createSourceSession(raw, schema)
          if (!result.ok) throw new Error(result.reason)
          supplied = EditorState.create({ schema, doc: result.session.doc, plugins })
          return supplied
        },
        frontmatterViewFactory: {
          render(container, yaml) {
            frames.push({ raw: yaml, state: supplied })
            container.textContent = yaml
            return { destroy() {} }
          },
        },
        dispatchTransaction() { dispatches++ },
        onChange() { changes++ },
      })
      const editor = await createEditor(opts)
      instances.push(editor)
      expect(supplied).toBeDefined()
      expect(editor.view.state).toBe(supplied)
      expect(editor.view.state.schema).toBe(finalSchema)
      expect(editor.view.state.doc.firstChild?.type.name).toBe('frontmatter')
      expect(frames).toEqual([{ raw: raw.includes('title') ? 'title: Hello' : '', state: supplied }])
      expect(undoDepth(editor.view.state)).toBe(0)
      expect(dispatches).toBe(0)
      expect(changes).toBe(0)
    },
  )

  it('does not even read initialContent when createState supplies the document', async () => {
    const opts = options({
      createState: (schema, plugins) => EditorState.create({
        schema, plugins, doc: schema.node('doc', null, [schema.node('paragraph', null, schema.text('capture'))]),
      }),
    })
    Object.defineProperty(opts, 'initialContent', { get() { throw new Error('legacy initial parse evaluated') } })
    const editor = await createEditor(opts)
    instances.push(editor)
    expect(editor.view.state.doc.textContent).toBe('capture')
  })

  it('delegates the actual view and unapplied transaction, allowing rejection', async () => {
    let calledView: EditorView | undefined
    let calledTr: Transaction | undefined
    const editor = await createEditor(options({
      initialContent: 'A',
      dispatchTransaction(view, tr) { calledView = view; calledTr = tr },
    }))
    instances.push(editor)
    const initial = editor.view.state
    const tr = initial.tr.insertText('B', 2)
    editor.view.dispatch(tr)
    expect(calledView === editor.view).toBe(true)
    expect(calledTr).toBe(tr)
    expect(editor.view.state).toBe(initial)
    expect(editor.view.state.doc.textContent).toBe('A')
  })

  it('rejects a state built with another schema before creating DOM resources', async () => {
    let renders = 0
    const opts = options({
      configureSchema: base => new Schema({ nodes: base.spec.nodes, marks: base.spec.marks }),
      createState: () => EditorState.create({ schema: new Schema({
        nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*', toDOM: () => ['p', 0] }, text: {} },
      }) }),
      initialContent: '---\ntitle: Wrong\n---\n',
      frontmatterViewFactory: { render() { renders++; return { destroy() {} } } },
    })
    let failure: unknown
    try { instances.push(await createEditor(opts)) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toMatch(/schema/i)
    expect(renders).toBe(0)
    expect(opts.container.childElementCount).toBe(0)
  })

  it('preserves default parsing and ProseMirror dispatch for legacy consumers', async () => {
    const editor = await createEditor(options({ initialContent: '**Legacy**' }))
    instances.push(editor)
    expect(editor.view.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe('strong')
    editor.view.dispatch(editor.view.state.tr.insertText('!', 7))
    expect(editor.view.state.doc.textContent).toBe('Legacy!\u200b')
    expect(undoDepth(editor.view.state)).toBe(1)
  })
})
