// Radial tool wheel: opens at the fingertip and stays open until you pick a tool (point at it
// briefly, or pinch), make a fist, move well away, or leave it idle. A misread gesture doesn't close it.
import type { Tool } from '../ink/geometry'
import { TOOL_LABEL } from './dock'
import { icon } from './icons'

const ITEMS: Tool[] = ['pen', 'marker', 'highlighter', 'neon', 'laser', 'eraser', 'line', 'arrow', 'rect', 'ellipse']
const STEP = (Math.PI * 2) / ITEMS.length
const RADIUS = 96
const SIZE = 260
const DEAD_ZONE = 44
const PICK_MS = 380
const HYSTERESIS = 0.14 // rad (~8°) past a segment edge before the highlight moves on
const AWAY_PX = 240 // pointer this far from the centre for AWAY_MS closes the wheel
const AWAY_MS = 400
const IDLE_MS = 5000

/**
 * Which of `n` segments (0 at the top, clockwise) the offset (dx, dy) points at, or -1 inside the
 * dead zone / beyond reach. Keeps `hot` until the pointer is clearly past its edge (hysteresis).
 */
export function segmentAt(dx: number, dy: number, hot: number, n = ITEMS.length): number {
  const r = Math.hypot(dx, dy)
  if (r <= DEAD_ZONE || r > AWAY_PX) return -1
  const step = (Math.PI * 2) / n
  const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2)
  const idx = Math.floor((a + step / 2) / step) % n
  if (hot < 0 || idx === hot) return idx
  let diff = Math.abs(a - hot * step)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff < step / 2 + HYSTERESIS ? hot : idx
}

export class Radial {
  isOpen = false
  private cx = 0
  private cy = 0
  private hot = -1
  private since = 0
  private awaySince = 0
  private activeT = 0
  private items: HTMLElement[]
  private label: HTMLElement

  constructor(private root: HTMLElement, private current: () => Tool, private onPick: (t: Tool) => void) {
    this.items = ITEMS.map((t, i) => {
      const a = -Math.PI / 2 + i * STEP
      const el = document.createElement('div')
      el.className = 'radial-item'
      el.innerHTML = icon(t)
      el.style.setProperty('--ix', `${Math.cos(a) * RADIUS}px`)
      el.style.setProperty('--iy', `${Math.sin(a) * RADIUS}px`)
      root.append(el)
      return el
    })
    this.label = root.querySelector('#radial-label')!
  }

  open(x: number, y: number, now: number): void {
    const m = SIZE / 2 + 8
    this.cx = Math.min(Math.max(x, m), innerWidth - m)
    this.cy = Math.min(Math.max(y, m), innerHeight - m)
    this.root.style.setProperty('--x', `${this.cx - SIZE / 2}px`)
    this.root.style.setProperty('--y', `${this.cy - SIZE / 2}px`)
    const cur = this.current()
    this.items.forEach((el, i) => el.classList.toggle('current', ITEMS[i] === cur))
    this.label.textContent = TOOL_LABEL[cur]
    this.setHot(-1, now)
    this.awaySince = 0
    this.activeT = now
    this.root.classList.add('open')
    this.isOpen = true
  }

  close(): void {
    if (!this.isOpen) return
    this.isOpen = false
    this.root.classList.remove('open')
    this.setHot(-1, 0)
  }

  /** Pick the highlighted item now (pinch). Returns false if nothing is highlighted. */
  pickHot(): boolean {
    if (this.hot < 0) return false
    this.onPick(ITEMS[this.hot])
    this.close()
    return true
  }

  /** Returns dwell progress 0..1 on the highlighted item. */
  update(x: number, y: number, now: number): number {
    const dx = x - this.cx, dy = y - this.cy
    const r = Math.hypot(dx, dy)

    if (r > AWAY_PX) {
      this.awaySince ||= now
      if (now - this.awaySince > AWAY_MS) return this.close(), 0
    } else this.awaySince = 0

    const idx = segmentAt(dx, dy, this.hot)
    if (idx !== this.hot) this.setHot(idx, now)
    if (idx >= 0) this.activeT = now
    else if (now - this.activeT > IDLE_MS) return this.close(), 0
    if (idx < 0) return 0

    const p = (now - this.since) / PICK_MS
    if (p >= 1) {
      this.pickHot()
      return 0
    }
    return p
  }

  private setHot(i: number, now: number): void {
    if (this.hot >= 0) this.items[this.hot].classList.remove('hot')
    this.hot = i
    this.since = now
    if (i >= 0) {
      this.items[i].classList.add('hot')
      this.label.textContent = TOOL_LABEL[ITEMS[i]]
    } else if (this.isOpen) this.label.textContent = TOOL_LABEL[this.current()]
  }
}
