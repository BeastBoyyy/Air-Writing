// Hand-driven UI: hover highlight, dwell-to-press with SELECT, pinch-tap, and opening the radial wheel.
//
// Built to survive noisy tracking:
// - a highlighted button stays highlighted until the cursor is clearly outside it (no edge flicker);
// - a SELECT that drops out for a frame or two doesn't reset the dwell countdown;
// - a dwell fires once, and the pointer must leave the button before it can fire again.
import type { Gesture } from '../tracking/gestures'
import type { Radial } from './radial'

const DWELL_MS = 380
const RADIAL_HOLD_MS = 450
const STILL_PX = 18
const STICKY_PX = 16 // stay on a highlighted button until the cursor is this far outside it
const GLITCH_MS = 180 // SELECT misreads shorter than this are ignored

function near(el: HTMLElement, x: number, y: number, pad: number): boolean {
  const r = el.getBoundingClientRect()
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
}

export class AirPointer {
  private el: HTMLElement | null = null
  private since = 0
  private fired = false
  private selectT = -1e9
  private stillX = -1e9
  private stillY = -1e9
  private stillT = 0

  constructor(private radial: Radial) {}

  targetAt(x: number, y: number): HTMLElement | null {
    return document.elementFromPoint(x, y)?.closest<HTMLElement>('button:not(:disabled)') ?? null
  }

  /** The button a pinch-tap at (x, y) should press, honouring the sticky highlight. */
  current(x: number, y: number): HTMLElement | null {
    return this.el?.isConnected && near(this.el, x, y, STICKY_PX) ? this.el : this.targetAt(x, y)
  }

  press(el: HTMLElement): void {
    el.click()
    el.classList.add('air-press')
    setTimeout(() => el.classList.remove('air-press'), 160)
  }

  reset(): void {
    this.hover(null, 0)
    this.radial.close()
  }

  /** Call every display frame. Returns a 0..1 progress to draw as a ring around the cursor. */
  update(x: number, y: number, g: Gesture, now: number): number {
    if (g === 'SELECT') this.selectT = now
    const selecting = now - this.selectT < GLITCH_MS

    if (this.radial.isOpen) {
      if (g === 'FIST' || g === 'PALM') {
        this.radial.close()
        return 0
      }
      return this.radial.update(x, y, now)
    }

    let el: HTMLElement | null = null
    if (selecting || g === 'HOVER') el = this.current(x, y)
    if (el !== this.el) this.hover(el, now)

    if (!selecting) {
      this.stillT = now
      return 0
    }
    if (el) {
      const p = (now - this.since) / DWELL_MS
      if (p >= 1 && !this.fired) {
        this.fired = true
        this.press(el)
      }
      return this.fired ? 0 : Math.min(p, 1)
    }
    // SELECT held still over the canvas → open the tool wheel
    if (Math.hypot(x - this.stillX, y - this.stillY) > STILL_PX) {
      this.stillX = x
      this.stillY = y
      this.stillT = now
      return 0
    }
    const p = (now - this.stillT) / RADIAL_HOLD_MS
    if (p >= 1) {
      this.radial.open(x, y, now)
      return 0
    }
    return p > 0.25 ? p : 0 // don't flash a ring on every brief pause
  }

  private hover(el: HTMLElement | null, now: number): void {
    this.el?.classList.remove('air-hover')
    el?.classList.add('air-hover')
    this.el = el
    this.since = now
    this.fired = false
  }
}
