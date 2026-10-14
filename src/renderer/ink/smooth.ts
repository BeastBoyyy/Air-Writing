// Stroke smoothing for hand input: removes fingertip jitter without making the ink lag.
//
// Each sample is replaced by a centred binomial average of its neighbours ([1,4,6,4,1]/16),
// which cancels jitter but, being symmetric, doesn't shift the line or pull it behind the finger.
// A Catmull-Rom spline then runs through the smoothed samples. A segment "settles" (is final) once
// the samples it depends on have arrived, two samples later; until then it's drawn provisionally,
// so the ink tip stays on the finger and quietly firms up behind it. Start/end points stay exact.
import { spline } from './geometry'

export class StrokeSmoother {
  raw: number[] = []
  /** Final, smoothed path (flat x,y), densely sampled. */
  path: number[] = []
  private settled = 0 // segments (s_k → s_k+1) already in `path`

  reset(x: number, y: number): void {
    this.raw = [x, y]
    this.path = [x, y]
    this.settled = 0
  }

  get count(): number {
    return this.raw.length / 2
  }

  push(x: number, y: number): void {
    this.raw.push(x, y)
    // segment k needs s_{k+2} final, which needs raw up to k+4
    while (this.settled <= this.count - 5) this.segment(this.settled++, this.count, this.path)
  }

  /** Smoothed sample i when n raw samples exist (kernel shrinks symmetrically near the ends). */
  private sx = 0
  private sy = 0
  private at(i: number, n: number): void {
    const r = this.raw
    const rad = Math.min(2, i, n - 1 - i)
    if (rad <= 0) {
      this.sx = r[i * 2]
      this.sy = r[i * 2 + 1]
    } else if (rad === 1) {
      this.sx = (r[i * 2 - 2] + 2 * r[i * 2] + r[i * 2 + 2]) / 4
      this.sy = (r[i * 2 - 1] + 2 * r[i * 2 + 1] + r[i * 2 + 3]) / 4
    } else {
      this.sx = (r[i * 2 - 4] + 4 * r[i * 2 - 2] + 6 * r[i * 2] + 4 * r[i * 2 + 2] + r[i * 2 + 4]) / 16
      this.sy = (r[i * 2 - 3] + 4 * r[i * 2 - 1] + 6 * r[i * 2 + 1] + 4 * r[i * 2 + 3] + r[i * 2 + 5]) / 16
    }
  }

  private segment(k: number, n: number, out: number[]): void {
    this.at(Math.max(k - 1, 0), n); const x0 = this.sx, y0 = this.sy
    this.at(k, n); const x1 = this.sx, y1 = this.sy
    this.at(k + 1, n); const x2 = this.sx, y2 = this.sy
    this.at(Math.min(k + 2, n - 1), n); const x3 = this.sx, y3 = this.sy
    spline(out, x0, y0, x1, y1, x2, y2, x3, y3)
  }

  /** Provisional (not yet settled) remainder of the stroke, for live drawing. */
  tail(): number[] {
    const out: number[] = []
    const n = this.count
    for (let k = this.settled; k < n - 1; k++) this.segment(k, n, out)
    return out
  }

  /** Settle everything; returns the final path. */
  finish(): number[] {
    const n = this.count
    while (this.settled < n - 1) this.segment(this.settled++, n, this.path)
    return this.path
  }
}
