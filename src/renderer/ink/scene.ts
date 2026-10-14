// The drawing as an ordered list of vector ops. Undo/redo just moves ops between stacks,
// so history is unlimited and costs a few bytes per stroke instead of a bitmap per step.
import { BRUSHES, type Op } from './geometry'

export type SceneEvent = { type: 'add'; op: Op } | { type: 'reset' }

export class Scene {
  ops: Op[] = []
  private redoStack: Op[] = []
  private listeners = new Set<(e: SceneEvent) => void>()

  on(cb: (e: SceneEvent) => void): void {
    this.listeners.add(cb)
  }

  private emit(e: SceneEvent): void {
    for (const cb of this.listeners) cb(e)
  }

  add(op: Op): void {
    this.ops.push(op)
    this.redoStack.length = 0
    this.emit({ type: 'add', op })
  }

  undo(): boolean {
    const op = this.ops.pop()
    if (!op) return false
    this.redoStack.push(op)
    this.emit({ type: 'reset' })
    return true
  }

  redo(): boolean {
    const op = this.redoStack.pop()
    if (!op) return false
    this.ops.push(op)
    this.emit({ type: 'add', op })
    return true
  }

  /** Clear is itself an op, so it can be undone. */
  clear(): boolean {
    if (this.isEmpty) return false
    this.add({ kind: 'clear' })
    return true
  }

  get canUndo(): boolean {
    return this.ops.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Ops after the last clear — what's actually on the canvas. */
  get visible(): Op[] {
    let i = this.ops.length - 1
    while (i >= 0 && this.ops[i].kind !== 'clear') i--
    return this.ops.slice(i + 1)
  }

  get isEmpty(): boolean {
    const last = this.ops[this.ops.length - 1]
    return !last || last.kind === 'clear'
  }

  load(ops: Op[]): void {
    this.ops = ops.slice()
    this.redoStack.length = 0
    this.emit({ type: 'reset' })
  }
}

// ---------- project files (.airboard) ----------

export interface Project {
  app: 'air-writing-pro'
  version: 1
  width: number
  height: number
  ops: Op[]
}

export function serialize(scene: Scene, width: number, height: number): string {
  const p: Project = { app: 'air-writing-pro', version: 1, width, height, ops: scene.visible }
  return JSON.stringify(p)
}

const COLOR = /^#[0-9a-f]{3,8}$/i
const nums = (a: unknown): a is number[] => Array.isArray(a) && a.every((n) => typeof n === 'number' && Number.isFinite(n))

/** Parse an untrusted project file; throws on anything malformed (colors end up in SVG export, so validate strictly). */
export function parseProject(text: string): Op[] {
  const p = JSON.parse(text) as Partial<Project>
  if (p?.app !== 'air-writing-pro' || !Array.isArray(p.ops)) throw new Error('Not an Air Writing Pro project')
  return p.ops.map((o: any): Op => {
    if (o?.kind === 'clear') return { kind: 'clear' }
    const common = typeof o?.size === 'number' && o.size > 0 && o.size < 500 && COLOR.test(o.color) && BRUSHES.includes(o.brush)
    if (o?.kind === 'stroke' && common && nums(o.pts) && o.pts.length % 2 === 0)
      return { kind: 'stroke', brush: o.brush, color: o.color, size: o.size, pts: o.pts }
    if (o?.kind === 'shape' && common && nums(o.geom) && ['line', 'arrow', 'polygon', 'ellipse'].includes(o.shape))
      return { kind: 'shape', shape: o.shape, brush: o.brush, color: o.color, size: o.size, geom: o.geom }
    throw new Error('Project contains an invalid item')
  })
}
