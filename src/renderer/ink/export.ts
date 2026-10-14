// PNG / SVG export, project files and video recording.
import { paintOp } from './render'
import type { Scene } from './scene'
import { parseProject, serialize } from './scene'
import { toSVG } from './svg'

const stamp = (): string => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')

export async function exportPNG(scene: Scene, w: number, h: number, dpr: number, background?: string): Promise<string | null> {
  const ink = document.createElement('canvas')
  ink.width = Math.round(w * dpr)
  ink.height = Math.round(h * dpr)
  const ictx = ink.getContext('2d')!
  ictx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const op of scene.visible) paintOp(ictx, op)

  const out = document.createElement('canvas')
  out.width = ink.width
  out.height = ink.height
  const ctx = out.getContext('2d')!
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, out.width, out.height)
  }
  ctx.drawImage(ink, 0, 0) // separate layer so erasers don't punch holes in the background
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'))
  return window.api.saveFile(`air-drawing-${stamp()}.png`, [{ name: 'PNG image', extensions: ['png'] }], await blob.arrayBuffer())
}

export function exportSVG(scene: Scene, w: number, h: number): Promise<string | null> {
  return window.api.saveFile(`air-drawing-${stamp()}.svg`, [{ name: 'SVG vector', extensions: ['svg'] }], toSVG(scene.visible, w, h))
}

export function saveProject(scene: Scene, w: number, h: number): Promise<string | null> {
  return window.api.saveFile(`air-drawing-${stamp()}.airboard`, [{ name: 'Air Writing Pro project', extensions: ['airboard'] }], serialize(scene, w, h))
}

/** Returns false if the user cancelled; throws if the file is invalid. */
export async function openProject(scene: Scene): Promise<boolean> {
  const text = await window.api.openFile([{ name: 'Air Writing Pro project', extensions: ['airboard'] }])
  if (text === null) return false
  scene.load(parseProject(text))
  return true
}

export class Recorder {
  startedAt = 0
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  private last = 0

  constructor(private compose: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {}

  get active(): boolean {
    return this.rec !== null
  }

  start(): void {
    const scale = Math.min(devicePixelRatio, 1920 / innerWidth)
    this.canvas.width = Math.round((innerWidth * scale) / 2) * 2 // encoders want even sizes
    this.canvas.height = Math.round((innerHeight * scale) / 2) * 2
    this.compose(this.ctx, this.canvas.width, this.canvas.height)
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    this.chunks = []
    this.rec = new MediaRecorder(this.canvas.captureStream(60), { mimeType, videoBitsPerSecond: 16_000_000 })
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(1000)
    this.startedAt = performance.now()
  }

  /** Call every display frame; composites at most 60 times per second. */
  frame(now: number): void {
    if (!this.rec || now - this.last < 1000 / 60 - 2) return
    this.last = now
    this.compose(this.ctx, this.canvas.width, this.canvas.height)
  }

  stop(): Promise<Blob> {
    const rec = this.rec!
    this.rec = null
    return new Promise((res) => {
      rec.onstop = () => res(new Blob(this.chunks, { type: 'video/webm' }))
      rec.stop()
    })
  }
}
