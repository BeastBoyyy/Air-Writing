// The pen engine: turns a stream of (x, y, t) samples from the hand or the mouse into ops.
// Handles freehand brushes, shape tools, the eraser, the laser pointer and QuickShape snapping.
import { BRUSHES, SHAPE_TOOLS, outline, shapeD, shapeFromDrag, traceOutline, type Brush, type ShapeOp, type ShapeTool, type StrokeOp, type Tool } from './geometry'
import { paintOp, type InkLayer } from './render'
import type { Scene } from './scene'
import { recognize } from './shapes'
import { StrokeSmoother } from './smooth'

export interface PenStyle {
  tool: Tool
  color: string
  size: number
  eraserSize: number
  quickShape: boolean
}

const LASER_MS = 700
const HOLD_MS = 550
const HOLD_RADIUS = 9

export class Pen {
  down = false
  private tool: Tool = 'pen'
  private sm = new StrokeSmoother()
  private ax = 0
  private ay = 0
  private bx = 0
  private by = 0
  private snapped = false
  private holdX = 0
  private holdY = 0
  private holdT = 0
  private tried = false
  private laser: number[] = [] // x, y, t triples
  private flash: { op: ShapeOp; t: number } | null = null
  private live: StrokeOp = { kind: 'stroke', brush: 'pen', color: '', size: 1, pts: [] }

  constructor(private scene: Scene, private ink: InkLayer, private style: () => PenStyle) {}

  private get isBrush(): boolean {
    return BRUSHES.includes(this.tool as Brush)
  }

  begin(x: number, y: number, t: number, override?: Tool): void {
    if (this.down) this.end()
    this.down = true
    this.tool = override ?? this.style().tool
    this.sm.reset(x, y)
    this.ax = this.bx = x
    this.ay = this.by = y
    this.snapped = false
    this.tried = false
    this.holdX = x
    this.holdY = y
    this.holdT = t
    if (this.tool === 'laser') this.laser.push(NaN, NaN, t, x, y, t) // NaN = break between trails
  }

  move(x: number, y: number, t: number): void {
    if (!this.down || this.snapped) return
    const r = this.sm.raw
    const lx = r[r.length - 2], ly = r[r.length - 1]
    if (Math.hypot(x - lx, y - ly) < 0.75) return
    if (this.tool === 'eraser') this.ink.eraseSegment(lx, ly, x, y, this.style().eraserSize)
    if (this.tool === 'laser') this.laser.push(x, y, t)
    this.sm.push(x, y)
    this.bx = x
    this.by = y
    if (Math.hypot(x - this.holdX, y - this.holdY) > HOLD_RADIUS) {
      this.holdX = x
      this.holdY = y
      this.holdT = t
      this.tried = false
    }
  }

  end(): void {
    if (!this.down) return
    this.down = false
    if (this.snapped || this.tool === 'laser') return
    const pts = this.sm.finish()
    const s = this.style()
    if (this.isBrush) {
      const brush = this.tool as Brush
      this.scene.add({ kind: 'stroke', brush, color: s.color, size: brush === 'eraser' ? s.eraserSize : s.size, pts })
    } else if (Math.hypot(this.bx - this.ax, this.by - this.ay) > 4) {
      const { shape, geom } = shapeFromDrag(this.tool as ShapeTool, this.ax, this.ay, this.bx, this.by)
      this.scene.add({ kind: 'shape', shape, geom, brush: 'marker', color: s.color, size: s.size })
    }
  }

  /** Called every display frame: QuickShape fires when the pen holds still. */
  tick(now: number): void {
    const s = this.style()
    if (!this.down || this.snapped || this.tried || !s.quickShape || !this.isBrush || this.tool === 'eraser') return
    if (now - this.holdT < HOLD_MS || this.sm.count < 8) return
    this.tried = true
    const snap = recognize(this.sm.raw)
    if (!snap) return
    const op: ShapeOp = { kind: 'shape', shape: snap.shape, geom: snap.geom, brush: this.tool as Brush, color: s.color, size: s.size }
    this.scene.add(op)
    this.snapped = true
    this.flash = { op, t: now }
  }

  /** Paint the in-progress stroke (with a predicted tail), laser trail and snap flash. Returns true while something animates on its own (laser fade, snap flash). */
  drawLive(ctx: CanvasRenderingContext2D, tail: { x: number; y: number } | null, now: number): boolean {
    const s = this.style()
    let animating = false

    if (this.down && !this.snapped && this.tool !== 'laser') {
      if (this.isBrush && this.tool !== 'eraser') {
        const live = this.live
        live.brush = this.tool as Brush
        live.color = s.color
        live.size = s.size
        // settled path + provisional tail up to the newest sample (+ predicted cursor in live-video mode)
        const extra = this.sm.tail()
        if (tail) extra.push(tail.x, tail.y)
        const path = new Path2D()
        traceOutline(path, outline(live.brush, this.sm.path, s.size, extra, false))
        paintOp(ctx, live, path)
      } else if (SHAPE_TOOLS.includes(this.tool as ShapeTool)) {
        const bx = tail?.x ?? this.bx, by = tail?.y ?? this.by
        const { shape, geom } = shapeFromDrag(this.tool as ShapeTool, this.ax, this.ay, bx, by)
        const op: ShapeOp = { kind: 'shape', shape, geom, brush: 'marker', color: s.color, size: s.size }
        paintOp(ctx, op, new Path2D(shapeD(shape, geom, s.size)))
      }
    }

    // laser: fading glow trail, never saved
    if (this.laser.length) {
      while (this.laser.length && now - this.laser[2] > LASER_MS) this.laser.splice(0, 3)
      if (this.laser.length >= 6) {
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.shadowColor = s.color
        ctx.shadowBlur = 18
        ctx.strokeStyle = s.color
        for (let i = 3; i < this.laser.length; i += 3) {
          if (Number.isNaN(this.laser[i - 3]) || Number.isNaN(this.laser[i])) continue
          const k = 1 - (now - this.laser[i + 2]) / LASER_MS
          ctx.globalAlpha = Math.max(0, k)
          ctx.lineWidth = 3 + 5 * k
          ctx.beginPath()
          ctx.moveTo(this.laser[i - 3], this.laser[i - 2])
          ctx.lineTo(this.laser[i], this.laser[i + 1])
          ctx.stroke()
        }
        ctx.restore()
      }
      animating = this.laser.length > 0
    }

    // QuickShape snap: a short glow pulse over the new shape
    if (this.flash) {
      const k = (now - this.flash.t) / 320
      if (k >= 1) this.flash = null
      else {
        ctx.save()
        ctx.globalAlpha = 1 - k
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = 24
        ctx.strokeStyle = 'rgba(255,255,255,.9)'
        ctx.lineWidth = this.flash.op.size + 6 * (1 - k)
        ctx.lineCap = ctx.lineJoin = 'round'
        ctx.stroke(new Path2D(shapeD(this.flash.op.shape, this.flash.op.geom, this.flash.op.size)))
        ctx.restore()
        animating = true
      }
    }
    return animating
  }
}
