import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undoDepth } from 'prosemirror-history'
import { createSchema } from '../schema'
import { BrowserMediaResolver } from '../adapters/browser-media-resolver'
import { createDiagramController, createDiagramStatePlugin, diagramLabels, diagramSnapshot } from '../plugins/diagram-interaction'

const schema = createSchema({ mediaResolver: new BrowserMediaResolver() })
const disposals: (() => void)[] = []
afterEach(() => { disposals.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks() })
function box(x: number, y: number, width: number, height: number) { return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON() {} } }
function fixture(svgHeight = 300) {
  const root = document.createElement('div'); root.style.overflowY = 'auto'; document.body.append(root)
  root.getBoundingClientRect = () => box(0, 0, 600, 800)
  const state = EditorState.create({ schema, doc: schema.node('doc', null, [schema.node('paragraph', null, schema.text('before')), schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B')), schema.node('paragraph', null, schema.text('after'))]), plugins: [createDiagramStatePlugin(), history()] })
  const view = new EditorView(root, { state })
  disposals.push(() => view.destroy())
  const wrapper = document.createElement('div'), toolbar = document.createElement('div'), right = document.createElement('div'), preview = document.createElement('div')
  toolbar.append(right); wrapper.append(toolbar, preview); view.dom.append(wrapper)
  preview.innerHTML = `<svg width="400" height="${svgHeight}"><rect width="400" height="${svgHeight}"/></svg>`
  preview.getBoundingClientRect = () => box(24, 32, 400, 300)
  toolbar.getBoundingClientRect = () => box(0, 0, 448, 32)
  Object.defineProperty(preview, 'clientWidth', { value: 400 })
  const svg = preview.querySelector('svg')!
  svg.getBoundingClientRect = () => box(24, 32, 400, svgHeight)
  const pos = 8, snapshot = diagramSnapshot(view, pos, 'graph TD; A-->B', 'mermaid')
  const controller = createDiagramController({ preview, wrapper, toolbar, toolbarRight: right, view, getPos: () => pos, snapshot, labels: diagramLabels })
  disposals.push(() => controller.destroy())
  return { root, view, wrapper, toolbar, preview, snapshot, controller, svg, pos }
}
function wheel(el: HTMLElement, x: number, y: number, deltaY: number, extra: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY, ...extra }); Object.assign(event, { clientX: x, clientY: y }); el.dispatchEvent(event); return event
}
describe('diagram controller', () => {
  it('zooms at the mouse anchor without document/history mutation and consumes endpoints', () => {
    const { preview, snapshot, view } = fixture()
    const before = view.state.doc.toJSON(), history = undoDepth(view.state)
    const event = wheel(preview, 124, 132, -120)
    expect(event.defaultPrevented).toBe(true)
    expect(snapshot.scale).toBeGreaterThan(1)
    expect((100 - snapshot.x) / snapshot.scale).toBeCloseTo(100, 6)
    expect((100 - snapshot.y) / snapshot.scale).toBeCloseTo(100, 6)
    for (let n = 0; n < 20; n++) wheel(preview, 124, 132, -120)
    expect(snapshot.scale).toBe(4)
    expect(wheel(preview, 124, 132, -120).defaultPrevented).toBe(true)
    expect(view.state.doc.toJSON()).toEqual(before); expect(undoDepth(view.state)).toBe(history)
  })
  it('keeps a wheel transaction with its first consumer, including latched event targets', () => {
    const { preview, root, snapshot } = fixture()
    let now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now)
    wheel(preview, 100, 100, -60)
    const zoomed = snapshot.scale
    expect(wheel(preview, 580, 100, -60).defaultPrevented).toBe(true)
    expect(snapshot.scale).toBe(zoomed)
    now += 200
    expect(wheel(root, 580, 100, -60).defaultPrevented).toBe(false)
    expect(wheel(root, 100, 100, -60).defaultPrevented).toBe(false)
    expect(snapshot.scale).toBe(zoomed)
    now += 200
    expect(wheel(root, 100, 100, -60).defaultPrevented).toBe(true)
    expect(snapshot.scale).toBeGreaterThan(zoomed)
  })
  it('does not compound noncancelable input or consume pure horizontal scrolling', () => {
    const { preview, snapshot } = fixture()
    expect(wheel(preview, 100, 100, -120, { cancelable: false }).defaultPrevented).toBe(false)
    expect(snapshot.scale).toBe(1)
    expect(wheel(preview, 100, 100, 0, { deltaX: 100 }).defaultPrevented).toBe(false)
  })
  it('uses native gesture scale relative to its start and suppresses matching wheel', () => {
    const { preview, snapshot } = fixture()
    function gesture(name: string, scale = 1) { const e = new Event(name, { bubbles: true, cancelable: true }); Object.assign(e, { scale }); preview.dispatchEvent(e); return e }
    gesture('gesturestart'); gesture('gesturechange', 1.2); gesture('gesturechange', 1.5)
    expect(snapshot.scale).toBeCloseTo(1.5)
    wheel(preview, 100, 100, -120, { ctrlKey: true }); expect(snapshot.scale).toBeCloseTo(1.5)
    gesture('gestureend')
  })
  it('does not steal a native gesture begun outside, including its compatible wheel', () => {
    const { root, preview, snapshot } = fixture()
    root.dispatchEvent(new Event('gesturestart', { bubbles: true, cancelable: true }))
    const change = new Event('gesturechange', { bubbles: true, cancelable: true }); Object.assign(change, { scale: 2 })
    preview.dispatchEvent(change)
    expect(wheel(preview, 100, 100, -120, { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(snapshot.scale).toBe(1)
    root.dispatchEvent(new Event('gestureend', { bubbles: true, cancelable: true }))
  })
  it('provides focus-local keyboard, 40px pointer pan, reset, and source-safe Escape', () => {
    const { preview, toolbar, view, snapshot, pos, controller } = fixture()
    preview.focus(); expect(view.state.selection.from).toBe(pos + 1)
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }))
    expect(snapshot.scale).toBe(1.25)
    controller.refresh()
    toolbar.querySelector<HTMLButtonElement>('.diagram-pan-right')!.click()
    expect(snapshot.x).toBe(-90)
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(view.state.selection.$from.parent.textContent).toBe('after')
    toolbar.querySelector<HTMLButtonElement>('.diagram-zoom-reset')!.click(); expect(snapshot.scale).toBe(1)
  })
  it('keeps original copy dimensions before a pending animation frame and resets fit below 50%', () => {
    const { preview, controller, svg, snapshot, toolbar } = fixture()
    wheel(preview, 100, 100, -120)
    expect(controller.originalSize(svg)).toEqual({ width: 400, height: 300 })
    svg.getBoundingClientRect = () => box(0, 0, 400, 2000)
    controller.refresh(); toolbar.querySelector<HTMLButtonElement>('.diagram-zoom-fit')!.click()
    expect(snapshot.scale).toBeLessThan(.5)
    expect(2000 * snapshot.scale).toBeLessThanOrEqual(560)
  })
  it('opens and restores long diagrams at the top while fit still shows the whole diagram', () => {
    const { snapshot, toolbar, controller, preview } = fixture(2000)
    expect(snapshot.y).toBe(0)
    expect(snapshot.scale).toBe(1)
    toolbar.querySelector<HTMLButtonElement>('.diagram-pan-down')!.click()
    expect(snapshot.y).toBe(-40)
    controller.refresh()
    expect(snapshot.y).toBe(-40) // A layout refresh must preserve intentional panning.
    toolbar.querySelector<HTMLButtonElement>('.diagram-zoom-reset')!.click()
    expect(snapshot.y).toBe(0)
    toolbar.querySelector<HTMLButtonElement>('.diagram-zoom-fit')!.click()
    expect(snapshot.scale).toBeLessThan(1)
    expect(snapshot.y).toBeCloseTo(0, 6)
    expect(2000 * snapshot.scale).toBeCloseTo(parseFloat(preview.style.height), 6)
    toolbar.querySelector<HTMLButtonElement>('.diagram-zoom-reset')!.click()
    expect(snapshot.scale).toBe(1)
    expect(snapshot.y).toBe(0)
  })
  it('moves the wheel router when a retained editor is attached to a new scroll container', () => {
    const { root, preview, controller, view, snapshot } = fixture()
    const next = document.createElement('div'); next.style.overflowY = 'auto'; document.body.append(next); next.append(view.dom)
    next.getBoundingClientRect = () => box(0, 0, 600, 800)
    controller.refresh()
    expect(wheel(root, 100, 100, -120).defaultPrevented).toBe(false)
    expect(wheel(preview, 100, 100, -120).defaultPrevented).toBe(true)
    expect(snapshot.scale).toBeGreaterThan(1)
  })
})

describe('diagram session state', () => {
  it('maps identity through unrelated edits; duplicated equal source gets independent state; edits reset', () => {
    const { view, snapshot, pos } = fixture()
    snapshot.scale = 2
    view.dispatch(view.state.tr.insertText('x', 2))
    expect(diagramSnapshot(view, pos + 1, snapshot.source, snapshot.language)).toBe(snapshot)
    const copy = view.state.doc.nodeAt(pos + 1)!
    view.dispatch(view.state.tr.insert(pos + 1, copy))
    const originalPosition = pos + 1 + copy.nodeSize
    expect(diagramSnapshot(view, originalPosition, snapshot.source, snapshot.language)).toBe(snapshot)
    const duplicate = diagramSnapshot(view, pos + 1, snapshot.source, snapshot.language)
    expect(duplicate).not.toBe(snapshot); expect(duplicate.scale).toBe(1)
    view.dispatch(view.state.tr.insertText('!', originalPosition + 1))
    expect(diagramSnapshot(view, originalPosition, '!' + snapshot.source, snapshot.language).scale).toBe(1)
  })
})
