import { expect, it } from 'vitest'
import { recognize } from '../src/renderer/ink/shapes'
import { spline } from '../src/renderer/ink/geometry'

const wobble = (i: number) => Math.sin(i * 1.7) * 2

it('recognizes a line', () => {
  const pts: number[] = []
  for (let i = 0; i <= 40; i++) pts.push(10 + i * 5, 20 + i * 3 + wobble(i))
  expect(recognize(pts)?.shape).toBe('line')
})

it('recognizes a circle', () => {
  const pts: number[] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    pts.push(200 + 80 * Math.cos(a) + wobble(i), 200 + 80 * Math.sin(a))
  }
  const s = recognize(pts)!
  expect(s.shape).toBe('ellipse')
  expect(s.geom[2]).toBeCloseTo(s.geom[3]) // snapped to a circle
})

const polyline = (v: number[][]) => {
  const pts: number[] = []
  for (let k = 0; k < v.length - 1; k++)
    for (let i = 0; i < 20; i++)
      pts.push(v[k][0] + ((v[k + 1][0] - v[k][0]) * i) / 20 + wobble(i), v[k][1] + ((v[k + 1][1] - v[k][1]) * i) / 20 + wobble(i + 3))
  return pts
}

it('recognizes an axis-aligned rectangle', () => {
  const s = recognize(polyline([[100, 100], [300, 100], [300, 220], [100, 220], [100, 104]]))!
  expect(s.shape).toBe('polygon')
  expect(s.geom).toEqual([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)])
})

it('recognizes a triangle', () => {
  const s = recognize(polyline([[200, 50], [320, 250], [80, 250], [200, 54]]))!
  expect(s.shape).toBe('polygon')
  expect(s.geom.length).toBe(6)
})

it('leaves an open scribble alone', () => {
  const pts: number[] = []
  for (let i = 0; i <= 60; i++) pts.push(i * 6, 100 + Math.sin(i / 4) * 60)
  expect(recognize(pts)).toBeNull()
})

it('spline passes through the segment end and fills it densely', () => {
  const out: number[] = []
  spline(out, 0, 0, 10, 0, 40, 30, 60, 30, 3)
  expect(out.slice(-2)).toEqual([40, 30])
  for (let i = 2; i < out.length; i += 2) expect(Math.hypot(out[i] - out[i - 2], out[i + 1] - out[i - 1])).toBeLessThan(6)
})
