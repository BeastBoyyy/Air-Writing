// Pure geometry for ink ops: shared by the canvas renderer and SVG export (no DOM here).
import { getStroke } from 'perfect-freehand'

export type Brush = 'pen' | 'marker' | 'highlighter' | 'neon' | 'eraser'
export type ShapeKind = 'line' | 'arrow' | 'polygon' | 'ellipse'
export type ShapeTool = 'line' | 'arrow' | 'rect' | 'ellipse' | 'triangle'
export type Tool = Brush | 'laser' | ShapeTool

export const BRUSHES: Brush[] = ['pen', 'marker', 'highlighter', 'neon', 'eraser']
export const SHAPE_TOOLS: ShapeTool[] = ['line', 'arrow', 'rect', 'ellipse', 'triangle']

export interface StrokeOp {
  kind: 'stroke'
  brush: Brush
  color: string
  size: number
  pts: number[] // flat x,y pairs in CSS px
}
export interface ShapeOp {
  kind: 'shape'
  shape: ShapeKind
  brush: Brush
  color: string
  size: number
  geom: number[] // line/arrow: x1,y1,x2,y2 · polygon: closed x,y list · ellipse: cx,cy,rx,ry
}
export interface ClearOp {
  kind: 'clear'
}
export type Op = StrokeOp | ShapeOp | ClearOp

const OPTIONS: Record<Brush, { scale: number; thinning: number; smoothing: number; streamline: number }> = {
  pen: { scale: 1, thinning: 0.35, smoothing: 0.6, streamline: 0.08 }, // modest thinning: hand speed is noisy, so heavy thinning wobbles
  marker: { scale: 1, thinning: 0, smoothing: 0.6, streamline: 0.08 },
  highlighter: { scale: 3, thinning: 0, smoothing: 0.6, streamline: 0.1 },
  neon: { scale: 1, thinning: 0.25, smoothing: 0.6, streamline: 0.08 },
  eraser: { scale: 1, thinning: 0, smoothing: 0.4, streamline: 0.1 }
}

/** Width actually painted for a brush at a given size (highlighter is broad). */
export const brushWidth = (brush: Brush, size: number): number => size * OPTIONS[brush].scale

/** Filled outline polygon for a freehand stroke. `extra` are flat x,y points appended for live drawing (unsettled tail). */
export function outline(brush: Brush, pts: number[], size: number, extra?: number[], last = true): number[][] {
  const input: number[][] = []
  for (let i = 0; i < pts.length; i += 2) input.push([pts[i], pts[i + 1]])
  if (extra) for (let i = 0; i < extra.length; i += 2) input.push([extra[i], extra[i + 1]])
  const o = OPTIONS[brush]
  return getStroke(input, {
    size: size * o.scale,
    thinning: o.thinning,
    smoothing: o.smoothing,
    streamline: o.streamline,
    simulatePressure: o.thinning > 0,
    last
  })
}

/**
 * Append a Catmull-Rom curve from p1 to p2 (p1 excluded, p2 included) into `out`, one point every ~`step` px.
 * Camera samples arrive at 30–60Hz; this turns them into a smooth curve instead of a polygon.
 */
export function spline(out: number[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, step = 3): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step))
  for (let i = 1; i <= n; i++) {
    const t = i / n, t2 = t * t, t3 = t2 * t
    out.push(
      0.5 * (2 * x1 + (x2 - x0) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (3 * x1 - x0 - 3 * x2 + x3) * t3),
      0.5 * (2 * y1 + (y2 - y0) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (3 * y1 - y0 - 3 * y2 + y3) * t3)
    )
  }
}

/** Trace an outline with midpoint quadratic curves onto a Path2D or 2D context. */
export function traceOutline(p: { moveTo(x: number, y: number): void; quadraticCurveTo(a: number, b: number, c: number, d: number): void; closePath(): void }, o: number[][]): void {
  const n = o.length
  if (n < 3) return
  p.moveTo((o[0][0] + o[1][0]) / 2, (o[0][1] + o[1][1]) / 2)
  for (let i = 1; i <= n; i++) {
    const a = o[i % n]
    const b = o[(i + 1) % n]
    p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  }
  p.closePath()
}

const f = (v: number): string => (Math.round(v * 100) / 100).toString()

/** The same outline as an SVG path string. */
export function outlineD(o: number[][]): string {
  const n = o.length
  if (n < 3) return ''
  let d = `M${f((o[0][0] + o[1][0]) / 2)} ${f((o[0][1] + o[1][1]) / 2)}`
  for (let i = 1; i <= n; i++) {
    const a = o[i % n]
    const b = o[(i + 1) % n]
    d += `Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`
  }
  return d + 'Z'
}

/** SVG path (stroked, not filled) for a shape op. Also valid input for `new Path2D(d)`. */
export function shapeD(shape: ShapeKind, g: number[], size: number): string {
  if (shape === 'line' || shape === 'arrow') {
    const [x1, y1, x2, y2] = g
    let d = `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`
    if (shape === 'arrow') {
      const a = Math.atan2(y2 - y1, x2 - x1)
      const h = Math.max(14, size * 3.5)
      const w = Math.PI / 7
      d += `M${f(x2 - h * Math.cos(a - w))} ${f(y2 - h * Math.sin(a - w))}L${f(x2)} ${f(y2)}L${f(x2 - h * Math.cos(a + w))} ${f(y2 - h * Math.sin(a + w))}`
    }
    return d
  }
  if (shape === 'ellipse') {
    const [cx, cy, rx, ry] = g
    return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`
  }
  let d = `M${f(g[0])} ${f(g[1])}`
  for (let i = 2; i < g.length; i += 2) d += `L${f(g[i])} ${f(g[i + 1])}`
  return d + 'Z'
}

/** Shape created by dragging a shape tool from a to b. */
export function shapeFromDrag(tool: ShapeTool, ax: number, ay: number, bx: number, by: number): { shape: ShapeKind; geom: number[] } {
  const x1 = Math.min(ax, bx), x2 = Math.max(ax, bx), y1 = Math.min(ay, by), y2 = Math.max(ay, by)
  switch (tool) {
    case 'line':
    case 'arrow':
      return { shape: tool, geom: [ax, ay, bx, by] }
    case 'rect':
      return { shape: 'polygon', geom: [x1, y1, x2, y1, x2, y2, x1, y2] }
    case 'ellipse':
      return { shape: 'ellipse', geom: [(x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) / 2, (y2 - y1) / 2] }
    case 'triangle':
      return { shape: 'polygon', geom: [(ax + bx) / 2, ay, ax, by, bx, by] }
  }
}
