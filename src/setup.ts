import { EditorState, Plugin, type Plugin as PluginType } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import type { Node } from 'prosemirror-model'
import { createSchema } from './schema'
import { parseMarkdown, serializeMarkdown } from './markdown'
import type {
  MediaResolver,
  LinkOpener,
  RendererRegistry,
  Platform,
  SchemaConfig,
} from './types'
import { createDocCache, type DocCache } from './doc-cache'

/**
 * Editor lifecycle factory (§3.2 / §4.1).
 *
 * Replaces the previously-monolithic `setup.ts` in Moraya desktop with a
 * dependency-injected factory. v0.60.0-pre §1.1.1 mandates pure ESM (no
 * CommonJS `require()`) — this implementation uses top-level imports only.
 */

export interface EditorPluginOptions {
  /** Render features */
  enableMath?: boolean              // default true (KaTeX in toDOM, no plugin)
  enableMermaid?: boolean           // default false; Moraya desktop = true
  enableTableResize?: boolean       // default true (columnResizing)
  enableImageSelection?: boolean    // default true
  enableHistory?: boolean           // default true; v0.72 Yjs collab consumers set false

  /** Dependency injection (§3.3) */
  mediaResolver: MediaResolver           // required
  rendererRegistry?: RendererRegistry    // optional; default = highlight.js only
  linkOpener?: LinkOpener                // optional; default = window.open
  platform?: Platform                    // optional; default = navigator detection

  /** Change callbacks */
  onDocChanged?: (textContent: string) => void
  onChange?: (markdown: string) => void
  changeDebounceMs?: number              // default 500
}

export interface CreateEditorOptions extends EditorPluginOptions {
  container: HTMLElement
  initialContent?: string
  docCache?: DocCache
}

export interface MorayaEditorInstance {
  view: EditorView
  getMarkdown(): string
  setContent(md: string): void
  destroy(): void
}

const defaultPlatform = (): Platform => ({
  getCurrentFilePath: () => null,
  isMacOS:
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? ''),
})

const defaultLinkOpener = (): LinkOpener => ({
  open(url: string) {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  },
})

/**
 * Build the plugin array per v0.60.0-pre §4.1.
 *
 * Plugin order:
 *  1. keymap(baseKeymap) — minimum keybindings
 *  2. history (skipped if enableHistory=false; for v0.72 Yjs)
 *  3. change callbacks (debounced)
 */
export async function createEditorPlugins(opts: EditorPluginOptions): Promise<PluginType[]> {
  if (!opts.mediaResolver) {
    throw new TypeError(
      '@moraya/markdown-core: createEditorPlugins() requires a MediaResolver in opts.mediaResolver'
    )
  }

  // platform is unused at plugin level for v0.1.0 minimum-viable build;
  // available for future input-rule / keymap / NodeView injection.
  const _platform: Platform = opts.platform ?? defaultPlatform()
  void _platform
  void defaultLinkOpener

  const plugins: PluginType[] = [keymap(baseKeymap)]

  if (opts.enableHistory !== false) {
    plugins.push(history())
  }

  if (opts.onChange || opts.onDocChanged) {
    plugins.push(createChangePlugin(opts))
  }

  return plugins
}

function createChangePlugin(opts: EditorPluginOptions): PluginType {
  const debounceMs = opts.changeDebounceMs ?? 500
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSerialized = ''

  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          if (view.state.doc === prevState.doc) return

          if (opts.onDocChanged) {
            opts.onDocChanged(view.state.doc.textContent)
          }

          if (opts.onChange) {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
              const md = serializeMarkdown(view.state.doc)
              if (md !== lastSerialized) {
                lastSerialized = md
                opts.onChange!(md)
              }
            }, debounceMs)
          }
        },
        destroy() {
          if (timer) clearTimeout(timer)
        },
      }
    },
  })
}

/**
 * Create a full editor instance. Convenience wrapper that handles schema +
 * plugins + EditorState + EditorView wiring.
 */
export async function createEditor(opts: CreateEditorOptions): Promise<MorayaEditorInstance> {
  if (!opts.container) {
    throw new TypeError(
      '@moraya/markdown-core: createEditor() requires opts.container (HTMLElement)'
    )
  }
  if (!opts.mediaResolver) {
    throw new TypeError(
      '@moraya/markdown-core: createEditor() requires opts.mediaResolver'
    )
  }

  const schemaConfig: SchemaConfig = {
    mediaResolver: opts.mediaResolver,
    ...(opts.rendererRegistry ? { rendererRegistry: opts.rendererRegistry } : {}),
    ...(opts.linkOpener ? { linkOpener: opts.linkOpener } : {}),
  }
  const schema = createSchema(schemaConfig)
  const docCache = opts.docCache ?? createDocCache(10)
  void docCache // exposed for caller; not auto-applied at v0.1.0

  const plugins = await createEditorPlugins(opts)

  const initialDoc: Node = opts.initialContent
    ? parseMarkdown(opts.initialContent)
    : schema.topNodeType.createAndFill()!

  const state = EditorState.create({ schema, doc: initialDoc, plugins })
  const view = new EditorView(opts.container, { state })

  return {
    view,
    getMarkdown() {
      return serializeMarkdown(view.state.doc)
    },
    setContent(md: string) {
      const newDoc = parseMarkdown(md)
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content)
      view.dispatch(tr)
    },
    destroy() {
      view.destroy()
    },
  }
}
