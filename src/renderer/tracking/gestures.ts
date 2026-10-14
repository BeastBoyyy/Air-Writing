// Hand pose → gesture. Ported from the Python prototype's finger_states/classify, but measured on
// MediaPipe's metric 3D world landmarks, so tilting, rotating or bending the hand toward the camera
// doesn't change the reading. Hysteresis per finger and on the pinch, plus time-based debouncing.

export type Gesture = 'DRAW' | 'HOVER' | 'SELECT' | 'ERASE' | 'PALM' | 'FIST' | 'NONE'
export type DrawMode = 'pinch' | 'point'

export interface GestureConfig {
  drawMode: DrawMode
  pinchOn: number // pinch starts below this (3D thumb–index distance / palm length)
  debounceMs: number
}

// (tip, pip) landmark ids for index, middle, ring, pinky
const FINGERS = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18]
] as const
const UP_ON = 1.15
const UP_OFF = 1.05
const INDEX_CURLED = 0.85 // index tip/pip distance from wrist below this = fist-curled, not pinching
const PINCH_GAP = 0.12 // release threshold = pinchOn + gap (wide enough that fast strokes don't blur it open)

/** World landmarks: flat [x0,y0,z0,x1,…] for 21 points, in metres. */
export type World = ArrayLike<number>
/** Image landmarks: flat [x0,y0,x1,…] for 21 points, normalized to the frame. */
export type Landmarks = ArrayLike<number>

function d(w: World, a: number, b: number): number {
  return Math.hypot(w[a * 3] - w[b * 3], w[a * 3 + 1] - w[b * 3 + 1], w[a * 3 + 2] - w[b * 3 + 2])
}

/**
 * Normalized pointer position. `pinch` 0..1 is how closed the pinch is: 0 = the index fingertip (8),
 * 1 = the point where thumb (4) and index tips meet. Gliding between them as the fingers close means
 * the cursor sits on the fingertip when pointing, on the contact point when pinching, and never jumps.
 */
export function pointer(lm: Landmarks, out: { x: number; y: number }, pinch = 0): void {
  const k = pinch / 2
  out.x = lm[8 * 2] + (lm[4 * 2] - lm[8 * 2]) * k
  out.y = lm[8 * 2 + 1] + (lm[4 * 2 + 1] - lm[8 * 2 + 1]) * k
}

/** 0..1 closeness for `pointer`: 1 at the pinch threshold or tighter, 0 once clearly open. */
export function pinchCloseness(ratio: number, pinchOn: number): number {
  return Math.min(1, Math.max(0, (pinchOn + 0.35 - ratio) / 0.35))
}

export class GestureTracker {
  up = [false, false, false, false]
  pinching = false
  pinchRatio = 1
  stable: Gesture = 'NONE'
  private candidate: Gesture = 'NONE'
  private since = 0

  constructor(public cfg: GestureConfig) {}

  reset(): void {
    this.up = [false, false, false, false]
    this.pinching = false
    this.stable = this.candidate = 'NONE'
  }

  update(w: World, t: number): Gesture {
    for (let i = 0; i < 4; i++) {
      const [tip, pip] = FINGERS[i]
      const ratio = d(w, tip, 0) / Math.max(d(w, pip, 0), 1e-6)
      this.up[i] = ratio > (this.up[i] ? UP_OFF : UP_ON)
    }

    // Pinch = thumb tip meets index tip. Only these two fingers count; the others can do anything.
    const palm = Math.max(d(w, 0, 9), 1e-6)
    this.pinchRatio = d(w, 4, 8) / palm
    // In a fist the thumb also rests against the index, but the index is curled as tightly as the
    // other fingers (tip/pip ≈ 0.6). In a pinch it's only partly bent (≈ 1.0 measured on a real pinch).
    const indexBent = d(w, 8, 0) / Math.max(d(w, 6, 0), 1e-6) < INDEX_CURLED
    this.pinching = this.pinching
      ? this.pinchRatio < this.cfg.pinchOn + PINCH_GAP
      : this.pinchRatio < this.cfg.pinchOn && !indexBent

    const raw = this.classify()
    if (raw !== this.candidate) {
      this.candidate = raw
      this.since = t
    }
    // Pen up/down in pinch mode is already de-noised by pinch hysteresis: switch instantly for responsiveness.
    const instant =
      this.cfg.drawMode === 'pinch' &&
      ((raw === 'DRAW' && this.stable === 'HOVER') || (raw === 'HOVER' && this.stable === 'DRAW'))
    if (this.candidate !== this.stable && (instant || t - this.since >= this.cfg.debounceMs)) this.stable = this.candidate
    return this.stable
  }

  private classify(): Gesture {
    const pinchMode = this.cfg.drawMode === 'pinch'
    // While pinching, the other three fingers are ignored entirely: the pinch alone decides.
    if (pinchMode && this.pinching) return 'DRAW'
    const [i, m, r, p] = this.up
    if (i && !m && !r && !p) return pinchMode ? 'HOVER' : 'DRAW'
    if (i && m && !r && !p) return 'SELECT'
    if (i && m && r && !p) return 'ERASE'
    if (i && m && r && p) return 'PALM'
    if (!i && !m && !r && !p) return 'FIST'
    return pinchMode ? 'HOVER' : 'NONE'
  }
}
