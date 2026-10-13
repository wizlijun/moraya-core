export type EolChange = Readonly<{
  sourceFrom: number
  sourceTo: number
  viewFrom: number
  viewTo: number
}>

export type EolProjection = Readonly<{
  text: string
  sourceLength: number
  changes: readonly EolChange[]
}>

function check(n: number, max: number) {
  if (!Number.isInteger(n) || n < 0 || n > max) throw new RangeError('offset')
}

export function projectLineEndings(source: string): EolProjection {
  const chunks: string[] = []
  const changes: EolChange[] = []
  let start = 0
  let view = 0

  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) !== 13) continue
    chunks.push(source.slice(start, i))
    view += i - start
    const end = i + (source.charCodeAt(i + 1) === 10 ? 2 : 1)
    changes.push({ sourceFrom: i, sourceTo: end, viewFrom: view, viewTo: view + 1 })
    chunks.push('\n')
    view++
    i = end - 1
    start = end
  }

  chunks.push(source.slice(start))
  return { text: chunks.join(''), sourceLength: source.length, changes }
}

function completed(p: EolProjection, n: number, key: 'viewTo' | 'sourceTo') {
  let lo = 0
  let hi = p.changes.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (p.changes[mid]![key] <= n) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function sourceOffsetAt(p: EolProjection, n: number) {
  check(n, p.text.length)
  const k = completed(p, n, 'viewTo')
  const c = p.changes[k - 1]
  return n + (c ? c.sourceTo - c.viewTo : 0)
}

export function viewOffsetAt(p: EolProjection, n: number, bias: -1 | 1) {
  check(n, p.sourceLength)
  const k = completed(p, n, 'sourceTo')
  const next = p.changes[k]
  const prev = p.changes[k - 1]
  if (next && n > next.sourceFrom) return bias < 0 ? next.viewFrom : next.viewTo
  return n - (prev ? prev.sourceTo - prev.viewTo : 0)
}
