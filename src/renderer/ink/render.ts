// Canvas painting for ops, and the cached ink layer that only repaints when the scene changes.
import { brushWidth, outline, shapeD, traceOutline, type Op, type ShapeOp, type StrokeOp } from './geometry'
import type { Scene } from './scene'

const paths = new WeakMap<Op, Path2D>()

export function opPath(op: StrokeOp | ShapeOp): Path2D {
  let p = paths.get(op)
  if (!p) {
    if (op.kind === 'stroke') {
      p = new Path2D()
      traceOutline(p, outline(op.brush, op.pts, op.size))
    } else p = new Path2D(shapeD(op.shape, op.geom, op.size))
    paths.set(op, p)
  }
  return p
}

/** Paint one op. Strokes are filled outlines, shapes are stroked paths. */
export function paintOp(ctx: CanvasRenderingContext2D, op: Op, path?: Path2D): void {
  if (op.kind === 'clear') {
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()
    return
  }
  const p = path ?? opPath(op)
  const fill = op.kind === 'stroke'
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = brushWidth(op.brush, op.size)
  const apply = (style: string): void => {
    if (fill) {
      ctx.fillStyle = style
      ctx.fill(p)
    } else {
      ctx.strokeStyle = style
      ctx.stroke(p)
    }
  }
  if (op.brush === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    apply('#000')
  } else if (op.brush === 'highlighter') {
    ctx.globalAlpha = 0.35
    apply(op.color)
  } else if (op.brush === 'neon') {
    ctx.shadowColor = op.color
    ctx.shadowBlur = op.size * 2.5 + 10
    apply(op.color)
    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.55
    if (!fill) ctx.lineWidth = op.size * 0.45
    apply('#fff')
  } else apply(op.color)
  ctx.restore()
}

export class InkLayer {
  readonly ctx: CanvasRenderingContext2D
  private dpr = 1

  constructor(readonly canvas: HTMLCanvasElement, private scene: Scene) {
    this.ctx = canvas.getContext('2d')!
    scene.on((e) => (e.type === 'add' ? this.paint(e.op) : this.redraw()))
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.redraw()
  }

  redraw(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    for (const op of this.scene.visible) this.paint(op)
  }

  paint(op: Op): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    paintOp(this.ctx, op)
  }

  /** Live erasing: punch the ink immediately so the eraser feels instant; the committed op repaints identically. */
  eraseSegment(x0: number, y0: number, x1: number, y1: number, size: number): void {
    const c = this.ctx
    c.save()
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    c.globalCompositeOperation = 'destination-out'
    c.lineCap = 'round'
    c.lineWidth = size
    c.beginPath()
    c.moveTo(x0, y0)
    c.lineTo(x1, y1)
    c.stroke()
    c.restore()
  }
}
