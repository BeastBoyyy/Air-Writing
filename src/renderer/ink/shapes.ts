// QuickShape: turn a rough freehand stroke into a clean line, triangle, rectangle or ellipse.
import type { ShapeKind } from './geometry'

export type Snap = { shape: ShapeKind; geom: number[] } | null

type P = [number, number]

function perpDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
}

/** Ramer–Douglas–Peucker simplification. */
export function rdp(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts.slice()
  let max = 0, idx = 0
  const a = pts[0], b = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const dd = perpDist(pts[i], a, b)
    if (dd > max) { max = dd; idx = i }
  }
  if (max <= eps) return [a, b]
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
}

/** Corners of a closed stroke: simplify, merge near-duplicates, drop near-straight vertices. */
function corners(pts: P[], diag: number): P[] {
  let v = rdp(pts, diag * 0.07)
  if (v.length > 1 && Math.hypot(v[0][0] - v[v.length - 1][0], v[0][1] - v[v.length - 1][1]) < diag * 0.25) v.pop()
  // merge vertices that sit close together (rounded corners)
  for (let i = 0; i < v.length && v.length > 2; ) {
    const a = v[i], b = v[(i + 1) % v.length]
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < diag * 0.12) {
      v[i] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      v.splice((i + 1) % v.length, 1)
    } else i++
  }
  // drop vertices whose interior angle is nearly straight
  let changed = true
  while (changed && v.length > 3) {
    changed = false
    for (let i = 0; i < v.length; i++) {
      const p = v[(i + v.length - 1) % v.length], c = v[i], n = v[(i + 1) % v.length]
      const a1 = Math.atan2(p[1] - c[1], p[0] - c[0]), a2 = Math.atan2(n[1] - c[1], n[0] - c[0])
      let ang = Math.abs(a1 - a2)
      if (ang > Math.PI) ang = 2 * Math.PI - ang
      if (ang > (155 * Math.PI) / 180) {
        v.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return v
}

function ellipseError(pts: P[], cx: number, cy: number, rx: number, ry: number): number {
  let e = 0
  for (const [x, y] of pts) e += Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1)
  return e / pts.length
}

export function recognize(flat: number[]): Snap {
  const pts: P[] = []
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
  if (pts.length < 4) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, len = 0
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    if (i) len += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1])
  }
  const diag = Math.hypot(maxX - minX, maxY - minY)
  if (diag < 30) return null

  const first = pts[0], last = pts[pts.length - 1]
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1])

  // straight line: the path barely deviates from its chord
  if (chord / len > 0.9) {
    let dev = 0
    for (const p of pts) dev = Math.max(dev, perpDist(p, first, last))
    if (dev / chord < 0.08) return { shape: 'line', geom: [first[0], first[1], last[0], last[1]] }
  }

  // everything else must be (roughly) closed
  if (chord > diag * 0.25) return null

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  let rx = (maxX - minX) / 2, ry = (maxY - minY) / 2
  const ellErr = ellipseError(pts, cx, cy, Math.max(rx, 1), Math.max(ry, 1))
  const asEllipse = (): Snap => {
    if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) rx = ry = (rx + ry) / 2 // close enough → circle
    return { shape: 'ellipse', geom: [cx, cy, rx, ry] }
  }
  if (ellErr < 0.07) return asEllipse()

  const v = corners(pts, diag)
  if (v.length === 3) return { shape: 'polygon', geom: v.flat() }
  if (v.length === 4) {
    const axisAligned = v.every((a, i) => {
      const b = v[(i + 1) % 4]
      const ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0])) % (Math.PI / 2)
      return Math.min(ang, Math.PI / 2 - ang) < (15 * Math.PI) / 180
    })
    return { shape: 'polygon', geom: axisAligned ? [minX, minY, maxX, minY, maxX, maxY, minX, maxY] : v.flat() }
  }
  if (ellErr < 0.14) return asEllipse()
  return null
}
