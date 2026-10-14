import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DEFAULTS } from '../src/renderer/settings'
import { GestureTracker, pinchCloseness, pointer } from '../src/renderer/tracking/gestures'

type V = [number, number, number]

/**
 * Synthetic 3D hand in metres, fingers pointing up (−y). `up` = [index, middle, ring, pinky].
 * `tilt` rotates the whole hand about the x axis (bending toward/away from the camera).
 */
function hand(up: boolean[], opts: { pinch?: boolean; tilt?: number } = {}): number[] {
  const p: V[] = Array(21).fill([0, 0, 0])
  p[0] = [0, 0, 0]
  p[1] = [-0.03, -0.02, 0]; p[2] = [-0.05, -0.04, 0]; p[3] = [-0.065, -0.06, 0]; p[4] = [-0.08, -0.08, 0]
  const mcps: [number, number][] = [[-0.02, -0.09], [0, -0.095], [0.02, -0.09], [0.04, -0.08]]
  mcps.forEach(([x, y], f) => {
    const b = 5 + f * 4
    p[b] = [x, y, 0]
    if (up[f]) { p[b + 1] = [x, y - 0.04, 0]; p[b + 2] = [x, y - 0.065, 0]; p[b + 3] = [x, y - 0.085, 0] }
    else { p[b + 1] = [x, y - 0.03, -0.01]; p[b + 2] = [x, y - 0.015, -0.03]; p[b + 3] = [x, y + 0.01, -0.025] }
  })
  if (opts.pinch) p[4] = [p[8][0] - 0.012, p[8][1] + 0.008, p[8][2]]
  const a = opts.tilt ?? 0
  return p.flatMap(([x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)])
}

const T = (mode: 'pinch' | 'point' = 'point') => new GestureTracker({ drawMode: mode, pinchOn: 0.3, debounceMs: 50 })
// feed the same pose for 100ms so the debounce settles
const settle = (g: GestureTracker, w: number[], t0 = 0) => {
  let r = g.update(w, t0)
  for (let t = t0 + 20; t <= t0 + 100; t += 20) r = g.update(w, t)
  return r
}

describe('gestures', () => {
  it('classifies the prototype gesture table (point mode)', () => {
    expect(settle(T(), hand([true, false, false, false]))).toBe('DRAW')
    expect(settle(T(), hand([true, true, false, false]))).toBe('SELECT')
    expect(settle(T(), hand([true, true, true, false]))).toBe('ERASE')
    expect(settle(T(), hand([true, true, true, true]))).toBe('PALM')
    expect(settle(T(), hand([false, false, false, false]))).toBe('FIST')
  })

  it('pinch draws in pinch mode; index-only just hovers', () => {
    expect(settle(T('pinch'), hand([true, false, false, false]))).toBe('HOVER')
    expect(settle(T('pinch'), hand([true, false, false, false], { pinch: true }))).toBe('DRAW')
  })

  it('a pinch stays a pinch whatever the other fingers do', () => {
    const g = T('pinch')
    settle(g, hand([true, false, false, false], { pinch: true }))
    for (const others of [[true, true, true], [true, false, true], [false, false, false], [true, true, false]])
      expect(settle(g, hand([true, ...others], { pinch: true }))).toBe('DRAW')
  })

  it('real data: a relaxed pinch with the other fingers folded and the index curled over draws', () => {
    // world landmarks MediaPipe produced for the user's example photo
    const { world } = JSON.parse(readFileSync(new URL('./fixtures/pinch-curled-fingers.json', import.meta.url), 'utf8'))
    expect(settle(new GestureTracker({ drawMode: 'pinch', pinchOn: DEFAULTS.pinchOn, debounceMs: 50 }), world)).toBe('DRAW')
  })

  it('only thumb + index make a pinch: thumb on the middle fingertip does not', () => {
    const w = hand([false, true, false, false]) // index curled away, middle extended
    w.splice(12, 3, w[12 * 3] - 0.01, w[12 * 3 + 1] + 0.005, w[12 * 3 + 2]) // thumb tip onto the middle tip
    expect(settle(T('pinch'), w)).not.toBe('DRAW')
  })

  it('a pinch survives the hand tilting toward the camera', () => {
    const g = T('pinch')
    settle(g, hand([true, false, false, false], { pinch: true }))
    for (const tilt of [0.3, 0.7, 1.1]) expect(settle(g, hand([true, false, false, false], { pinch: true, tilt }))).toBe('DRAW')
  })

  it('pen down/up is instant in pinch mode, other changes are debounced', () => {
    const g = T('pinch')
    settle(g, hand([true, false, false, false]))
    expect(g.update(hand([true, false, false, false], { pinch: true }), 200)).toBe('DRAW')
    expect(g.update(hand([true, true, false, false]), 220)).toBe('DRAW') // SELECT not yet stable
    expect(g.update(hand([true, true, false, false]), 280)).toBe('SELECT')
  })

  it('a fist is not a pinch even though the thumb touches the index finger', () => {
    const w = hand([false, false, false, false])
    w.splice(12, 3, w[6 * 3], w[6 * 3 + 1], w[6 * 3 + 2]) // thumb tip onto the curled index's middle joint
    expect(settle(T('pinch'), w)).toBe('FIST')
  })

  it('finger state has hysteresis', () => {
    const w = hand([true, false, false, false])
    const g = T()
    g.update(w, 0)
    expect(g.up[0]).toBe(true)
    // shorten the index so tip/pip distance ratio ≈ 1.1: between OFF (1.05) and ON (1.15)
    const pip = Math.hypot(w[18], w[19], w[20])
    const k = (pip * 1.1) / Math.hypot(w[24], w[25], w[26])
    w[24] *= k; w[25] *= k; w[26] *= k
    g.update(w, 20)
    expect(g.up[0]).toBe(true) // was up, stays up
    const g2 = T()
    g2.update(w, 0)
    expect(g2.up[0]).toBe(false) // starting down, 1.1 is not enough to flip up
  })

  it('pointer glides from the index tip (open) to the thumb–index contact point (pinched)', () => {
    const lm = Array.from({ length: 42 }, (_, i) => i / 100)
    const o = { x: 0, y: 0 }
    pointer(lm, o, pinchCloseness(1.2, 0.45)) // hand open
    expect(o).toEqual({ x: lm[16], y: lm[17] })
    pointer(lm, o, pinchCloseness(0.4, 0.45)) // pinched
    expect(o.x).toBeCloseTo((lm[16] + lm[8]) / 2)
    expect(o.y).toBeCloseTo((lm[17] + lm[9]) / 2)
    pointer(lm, o, pinchCloseness(0.62, 0.45)) // half closed: in between
    expect(o.x).toBeGreaterThan(Math.min(lm[16], (lm[16] + lm[8]) / 2))
    expect(o.x).toBeLessThan(Math.max(lm[16], (lm[16] + lm[8]) / 2))
  })
})
