// One Euro filter (Casiez et al.) on a 2D point, plus short-horizon prediction.
// Camera samples arrive at 30–60Hz; predict() lets the cursor move at display rate
// by extrapolating the filtered position up to "now".

const alpha = (cutoff: number, dt: number): number => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))

export class PointFilter {
  x = 0
  y = 0
  /** Velocity in px/s used for the adaptive cutoff (slow, 1Hz derivative filter). */
  private dx = 0
  private dy = 0
  /** Velocity in px/s used for prediction (faster filter so it settles quickly when the hand stops). */
  vx = 0
  vy = 0
  t = -1

  constructor(
    public minCutoff = 1.2,
    public beta = 0.012,
    private dCutoff = 1,
    private pCutoff = 6
  ) {}

  get ready(): boolean {
    return this.t >= 0
  }

  reset(): void {
    this.t = -1
  }

  update(x: number, y: number, t: number): void {
    if (this.t < 0) {
      this.x = x
      this.y = y
      this.dx = this.dy = this.vx = this.vy = 0
      this.t = t
      return
    }
    if (t <= this.t) return
    const dt = (t - this.t) / 1000
    const rawVx = (x - this.x) / dt
    const rawVy = (y - this.y) / dt
    const ad = alpha(this.dCutoff, dt)
    this.dx += ad * (rawVx - this.dx)
    this.dy += ad * (rawVy - this.dy)
    const a = alpha(this.minCutoff + this.beta * Math.hypot(this.dx, this.dy), dt)
    const nx = this.x + a * (x - this.x)
    const ny = this.y + a * (y - this.y)
    const ap = alpha(this.pCutoff, dt)
    this.vx += ap * ((nx - this.x) / dt - this.vx)
    this.vy += ap * ((ny - this.y) / dt - this.vy)
    this.x = nx
    this.y = ny
    this.t = t
  }

  /** Position extrapolated to `now` (same clock as update's t), capped at maxLeadMs, scaled by strength 0..1. */
  predict(now: number, maxLeadMs: number, strength: number, out: { x: number; y: number }): void {
    const lead = (Math.min(Math.max(now - this.t, 0), maxLeadMs) / 1000) * strength
    out.x = this.x + this.vx * lead
    out.y = this.y + this.vy * lead
  }
}
