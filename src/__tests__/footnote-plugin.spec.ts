import { describe, test, expect } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { DecorationSet } from 'prosemirror-view'
import { parseMarkdown } from '../markdown'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { createFootnotePlugin, footnotePluginKey } from '../plugins/footnote-plugin'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })

function decosFor(src: string): string[] {
  const doc = parseMarkdown(src, schema)
  const state = EditorState.create({ doc, plugins: [createFootnotePlugin()] })
  const set = footnotePluginKey.getState(state) as DecorationSet
  return set.find().map((d) => (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-num'])
}

describe('footnote numbering', () => {
  test('按首次出现顺序编号', () => {
    expect(decosFor('甲[^a] 乙[^b]。\n\n[^a]: A。\n\n[^b]: B。\n')).toEqual(['1', '2'])
  })

  test('同一 label 多次引用共用同一编号', () => {
    expect(decosFor('一[^x] 二[^x] 三[^y]。\n\n[^x]: X。\n\n[^y]: Y。\n')).toEqual(['1', '1', '2'])
  })

  test('编号按正文出现顺序,与定义书写顺序无关', () => {
    expect(decosFor('先[^second] 后[^first]。\n\n[^first]: 1。\n\n[^second]: 2。\n')).toEqual(['1', '2'])
  })

  test('无定义的裸引用照样参与编号', () => {
    expect(decosFor('裸[^none]。\n')).toEqual(['1'])
  })
})
