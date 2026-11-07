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
  const controller = createDiagramController({ preview, wrapper, toolbar, view, getPos: () => pos, snapshot, labels: diagramLabels })
  disposals.push(() => controller.destroy())
  const badge = preview.querySelector<HTMLButtonElement>('.diagram-zoom-reset')!
  badge.getBoundingClientRect = () => box(360, 300, 60, 24)
  return { root, view, wrapper, toolbar, preview, snapshot, controller, svg, pos, badge }
}
function wheel(el: HTMLElement, x: number, y: number, deltaY: number, extra: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY, ...extra }); Object.assign(event, { clientX: x, clientY: y }); el.dispatchEvent(event); return event
}
function key(target: HTMLElement, value: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }); target.dispatchEvent(event); return event
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
  it('provides focus-local keyboard, 40px pan, reset, and source-safe Escape', () => {
    const { preview, view, snapshot, pos, controller, badge } = fixture()
    preview.focus(); expect(view.state.selection.from).toBe(pos + 1)
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true, cancelable: true }))
    expect(snapshot.scale).toBe(1.25)
    controller.refresh()
    key(preview, 'ArrowRight')
    expect(snapshot.x).toBe(-90)
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(view.state.selection.$from.parent.textContent).toBe('after')
    badge.click(); expect(snapshot.scale).toBe(1)
  })
  it('keeps original copy dimensions before a pending animation frame and resets fit below 50%', () => {
    const { preview, controller, svg, snapshot } = fixture()
    wheel(preview, 100, 100, -120)
    expect(controller.originalSize(svg)).toEqual({ width: 400, height: 300 })
    svg.getBoundingClientRect = () => box(0, 0, 400, 2000)
    controller.refresh(); key(preview, 'f')
    expect(snapshot.scale).toBeLessThan(.5)
    expect(2000 * snapshot.scale).toBeLessThanOrEqual(560)
  })
  it('opens and restores long diagrams at the top while fit still shows the whole diagram', () => {
    const { snapshot, controller, preview, badge } = fixture(2000)
    expect(snapshot.y).toBe(0)
    expect(snapshot.scale).toBe(1)
    key(preview, 'ArrowDown')
    expect(snapshot.y).toBe(-40)
    controller.refresh()
    expect(snapshot.y).toBe(-40) // A layout refresh must preserve intentional panning.
    key(preview, '0')
    expect(snapshot.y).toBe(0)
    key(preview, 'F')
    expect(snapshot.scale).toBeLessThan(1)
    expect(snapshot.y).toBeCloseTo(0, 6)
    expect(2000 * snapshot.scale).toBeCloseTo(parseFloat(preview.style.height), 6)
    key(preview, '0')
    expect(snapshot.scale).toBe(1)
    expect(snapshot.y).toBe(0)
  })
  it('shows only a fixed reset badge away from rounded 100% without snapping the actual scale', () => {
    const { preview, toolbar, snapshot, controller, badge } = fixture()
    expect(toolbar.querySelector('button')).toBeNull()
    expect(preview.querySelector('.diagram-controls')).toBeNull()
    expect(badge.parentElement).toBe(preview)
    expect(preview.querySelector('.diagram-transform')?.contains(badge)).toBe(false)
    expect(badge.hidden).toBe(true); expect(badge.tabIndex).toBe(-1)
    snapshot.scale = 1.004; controller.refresh()
    expect(snapshot.scale).toBe(1.004); expect(badge.hidden).toBe(true)
    snapshot.scale = 1.006; controller.refresh()
    expect(badge.hidden).toBe(false); expect(badge.textContent).toBe('101%'); expect(badge.tabIndex).toBe(0)
    expect(badge.getAttribute('aria-label')).toContain('101%')
    badge.focus(); badge.click(); controller.refresh()
    expect(snapshot.scale).toBe(1); expect(badge.hidden).toBe(true)
    expect(document.activeElement).toBe(preview)
  })
  it('excludes the badge from dragging, wheel zoom and native gestures', () => {
    const { preview, snapshot, controller, badge } = fixture()
    key(preview, '+'); controller.refresh(); badge.focus()
    const before = { scale: snapshot.scale, x: snapshot.x, y: snapshot.y }
    badge.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 380, clientY: 310, button: 0 }))
    badge.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 390, clientY: 310, button: 0 }))
    expect(document.activeElement).toBe(badge)
    expect(wheel(badge, 380, 310, -120).defaultPrevented).toBe(false)
    badge.dispatchEvent(new Event('gesturestart', { bubbles: true, cancelable: true }))
    const gesture = new Event('gesturechange', { bubbles: true, cancelable: true }); Object.assign(gesture, { scale: 2 }); badge.dispatchEvent(gesture)
    expect(gesture.defaultPrevented).toBe(false)
    expect({ scale: snapshot.scale, x: snapshot.x, y: snapshot.y }).toEqual(before)
    expect(key(badge, 'ArrowLeft').defaultPrevented).toBe(false)
    expect(snapshot.x).toBe(before.x)
  })
  it('retains a diagram wheel sequence across the badge but leaves a fresh badge sequence to the page', () => {
    const { preview, snapshot, controller, badge } = fixture()
    let now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now)
    expect(wheel(preview, 100, 100, -60).defaultPrevented).toBe(true)
    controller.refresh()
    const scale = snapshot.scale
    expect(wheel(badge, 380, 310, -60).defaultPrevented).toBe(true)
    expect(snapshot.scale).toBe(scale)
    now += 200
    expect(wheel(badge, 380, 310, -60).defaultPrevented).toBe(false)
    expect(wheel(preview, 100, 100, -60).defaultPrevented).toBe(false)
    expect(snapshot.scale).toBe(scale)
    now += 200
    expect(wheel(preview, 100, 100, -60).defaultPrevented).toBe(true)
    const gesture = new Event('gesturestart', { bubbles: true, cancelable: true }); preview.dispatchEvent(gesture)
    expect(wheel(badge, 380, 310, -60, { ctrlKey: true }).defaultPrevented).toBe(true)
  })
  it('keeps dragging through the badge, suppresses its release click, and accepts the next intentional reset', () => {
    const { preview, snapshot, controller, badge } = fixture()
    snapshot.scale = 4; snapshot.x = -600; snapshot.y = -400; controller.refresh()
    function pointer(target: HTMLElement, type: string, x: number, y: number) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
      Object.assign(event, { pointerId: 1 }); target.dispatchEvent(event)
    }
    pointer(preview, 'pointerdown', 300, 250)
    pointer(preview, 'pointermove', 310, 250)
    pointer(badge, 'pointermove', 380, 310)
    const atBadge = snapshot.x
    pointer(badge, 'pointermove', 400, 310)
    expect(snapshot.x).toBe(atBadge + 20)
    pointer(badge, 'pointerup', 400, 310)
    const releaseClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
    badge.dispatchEvent(releaseClick)
    expect(releaseClick.defaultPrevented).toBe(true)
    expect(snapshot.scale).toBe(4)
    pointer(badge, 'pointerdown', 380, 310)
    pointer(badge, 'pointerup', 380, 310)
    badge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    expect(snapshot.scale).toBe(1)
    expect(document.activeElement).toBe(preview)
  })
  it('supports faster Shift+arrow movement and fit while respecting IME and modifier boundaries', () => {
    const { preview, snapshot } = fixture(2000)
    key(preview, 'ArrowDown'); expect(snapshot.y).toBe(-40)
    key(preview, 'ArrowDown', { shiftKey: true }); expect(snapshot.y).toBe(-200)
    const scale = snapshot.scale
    expect(key(preview, '+', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(key(preview, 'F', { isComposing: true }).defaultPrevented).toBe(false)
    expect(snapshot.scale).toBe(scale)
    key(preview, 'F', { shiftKey: true }); expect(snapshot.scale).toBeLessThan(.5)
    expect(preview.getAttribute('aria-keyshortcuts')).toContain('Shift+ArrowDown')
    expect(preview.getAttribute('aria-keyshortcuts')).toContain('F')
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
