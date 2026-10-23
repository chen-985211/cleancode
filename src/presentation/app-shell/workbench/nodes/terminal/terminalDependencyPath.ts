interface Point {
  readonly x: number
  readonly y: number
}

// The visible input handle has a 9px border box. Trim the curve at its boundary
// instead of translating the marker: its tip and tangent then remain on the curve.
export const terminalDependencyPortRadius = 4.5

export function terminalDependencyPath(source: Point, target: Point): string {
  const gap = target.x - source.x
  // Preserve the usual right-to-left Bezier routing, including backwards links.
  const offset = gap >= 0 ? gap / 2 : 6.25 * Math.sqrt(-gap)
  const first = { x: source.x + offset, y: source.y }
  const second = { x: target.x - offset, y: target.y }
  let low = 0,
    high = 1
  for (let step = 0; step < 30; step++) {
    const t = (low + high) / 2
    const end = prefix(t).end
    if (Math.hypot(end.x - target.x, end.y - target.y) > terminalDependencyPortRadius) low = t
    else high = t
  }
  const curve = prefix(high)
  return `M${source.x},${source.y} C${curve.first.x},${curve.first.y} ${curve.second.x},${curve.second.y} ${curve.end.x},${curve.end.y}`

  // de Casteljau subdivision preserves the original curve and its end tangent.
  function prefix(t: number) {
    const a = mix(source, first, t),
      b = mix(first, second, t),
      c = mix(second, target, t)
    const d = mix(a, b, t),
      e = mix(b, c, t)
    return { first: a, second: d, end: mix(d, e, t) }
  }
}

function mix(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
