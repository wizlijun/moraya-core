import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import {
  type SchemaConfig,
  type MediaResolver,
  isNullMediaResolver,
  NULL_MEDIA_RESOLVER_SENTINEL,
  type NullMediaResolver,
} from './types'

/**
 * ProseMirror schema factory (host-agnostic).
 *
 * v0.60.0-pre §3.2 Public API. Replaces the previously-singleton schema
 * in Moraya desktop (`src/lib/editor/schema.ts`) with a config-injected
 * factory. The schema's NodeSpec / MarkSpec definitions are pure data;
 * the consumer-injected `mediaResolver` / `linkOpener` / `rendererRegistry`
 * are accessed by NodeViews (constructed at editor mount time, not here).
 *
 * Per v0.60.0-pre §6.1.1: this module does NOT export a default schema
 * singleton. The internal `defaultSchema` (used by parseMarkdown /
 * serializeMarkdown for fallback) uses a sentinel-tagged null resolver
 * and refuses to be passed to createSchema(config) by consumers.
 */

const nullMediaResolver: NullMediaResolver = {
  [NULL_MEDIA_RESOLVER_SENTINEL]: true,
  async loadLocalImage() {
    return ''
  },
  async loadLocalMedia() {
    return ''
  },
  async loadRemoteMedia(url) {
    return url
  },
}

const baseNodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: {
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },
  blockquote: {
    content: 'block+',
    group: 'block',
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },
  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },
  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', attrs: { level: 1 } },
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
      { tag: 'h4', attrs: { level: 4 } },
      { tag: 'h5', attrs: { level: 5 } },
      { tag: 'h6', attrs: { level: 6 } },
    ],
    toDOM: (node) => [`h${node.attrs.level as number}`, 0],
  },
  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    attrs: { params: { default: '' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full' as const,
        getAttrs: (node) => ({
          params: (node as HTMLElement).getAttribute('data-params') ?? '',
        }),
      },
    ],
    toDOM: (node) => [
      'pre',
      node.attrs.params ? { 'data-params': node.attrs.params as string } : {},
      ['code', 0],
    ],
  },
  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { order: { default: 1 }, tight: { default: false } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({
          order: (dom as HTMLElement).hasAttribute('start')
            ? +(dom as HTMLElement).getAttribute('start')!
            : 1,
          tight: (dom as HTMLElement).hasAttribute('data-tight'),
        }),
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = {}
      if (node.attrs.order !== 1) attrs.start = String(node.attrs.order)
      if (node.attrs.tight) attrs['data-tight'] = 'true'
      return ['ol', attrs, 0]
    },
  },
  bullet_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { tight: { default: false } },
    parseDOM: [{ tag: 'ul', getAttrs: (dom) => ({ tight: (dom as HTMLElement).hasAttribute('data-tight') }) }],
    toDOM: (node) => ['ul', node.attrs.tight ? { 'data-tight': 'true' } : {}, 0],
  },
  list_item: {
    content: 'paragraph block*',
    defining: true,
    parseDOM: [{ tag: 'li' }],
    toDOM: () => ['li', 0],
  },
  text: { group: 'inline' },
  image: {
    inline: true,
    attrs: {
      src: {},
      alt: { default: null },
      title: { default: null },
      width: { default: null },
    },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => ({
          src: (dom as HTMLImageElement).getAttribute('src'),
          title: (dom as HTMLImageElement).getAttribute('title'),
          alt: (dom as HTMLImageElement).getAttribute('alt'),
          width: (dom as HTMLImageElement).getAttribute('width'),
        }),
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = { src: node.attrs.src as string }
      if (node.attrs.alt) attrs.alt = node.attrs.alt as string
      if (node.attrs.title) attrs.title = node.attrs.title as string
      if (node.attrs.width) attrs.width = node.attrs.width as string
      return ['img', attrs]
    },
  },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
}

const baseMarks: Record<string, MarkSpec> = {
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM: () => ['em', 0],
  },
  strong: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node) => (node as HTMLElement).style.fontWeight !== 'normal' && null },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null },
    ],
    toDOM: () => ['strong', 0],
  },
  strikethrough: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
    toDOM: () => ['s', 0],
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => ({
          href: (dom as HTMLElement).getAttribute('href'),
          title: (dom as HTMLElement).getAttribute('title'),
        }),
      },
    ],
    toDOM: (node) => {
      const attrs: Record<string, string> = { href: node.attrs.href as string, rel: 'noopener noreferrer' }
      if (node.attrs.title) attrs.title = node.attrs.title as string
      return ['a', attrs, 0]
    },
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },
}

/**
 * Internal default schema (uses {@link nullMediaResolver}).
 * Used by parseMarkdown / serializeMarkdown for byte-stable roundtrip
 * without requiring a real consumer-provided MediaResolver.
 *
 * NOT exported via index.ts (consumers must call createSchema()).
 */
export const defaultSchema = new Schema({ nodes: baseNodes, marks: baseMarks })

/** Cached config-keyed schemas. Avoids reconstruction when consumers call createSchema with the same config. */
const schemaCache = new WeakMap<MediaResolver, Schema>()

/**
 * Create a ProseMirror Schema with consumer-injected dependencies.
 *
 * @throws TypeError if `config.mediaResolver` is missing or is the internal
 *   nullMediaResolver sentinel.
 */
export function createSchema(config: SchemaConfig): Schema {
  if (!config || typeof config !== 'object') {
    throw new TypeError('@moraya/markdown-core: createSchema() requires a config object with a MediaResolver')
  }
  if (!config.mediaResolver) {
    throw new TypeError('@moraya/markdown-core: createSchema() requires a MediaResolver')
  }
  if (isNullMediaResolver(config.mediaResolver)) {
    throw new TypeError(
      "@moraya/markdown-core: do not pass nullMediaResolver to createSchema(). That instance is reserved for parseMarkdown/serializeMarkdown internal use only. Provide a real MediaResolver implementation (e.g. BrowserMediaResolver from '@moraya/markdown-core/adapters/browser-media-resolver')."
    )
  }
  const cached = schemaCache.get(config.mediaResolver)
  if (cached) return cached
  // The schema definition itself does not embed mediaResolver; it lives in the config
  // accessible to NodeViews at editor-construction time. Schema spec stays pure data.
  const schema = new Schema({ nodes: baseNodes, marks: baseMarks })
  schemaCache.set(config.mediaResolver, schema)
  return schema
}

export type { SchemaConfig }
