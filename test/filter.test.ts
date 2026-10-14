import { expect, it } from 'vitest'
import { PointFilter } from '../src/renderer/tracking/filter'

it('converges on a still target and suppresses jitter', () => {
  const f = new PointFilter()
  for (let i = 0; i < 120; i++) f.update(100 + (i % 2 ? 2 : -2), 50, i * 16)
  expect(Math.abs(f.x - 100)).toBeLessThan(1)
  expect(Math.abs(f.y - 50)).toBeLessThan(0.01)
})

it('predicts ahead along constant motion, capped by maxLead', () => {
  const f = new PointFilter()
  for (let i = 0; i <= 60; i++) f.update(i * 10, 0, i * 20) // 500 px/s
  const o = { x: 0, y: 0 }
  f.predict(f.t + 20, 40, 1, o)
  expect(o.x).toBeGreaterThan(f.x + 6) // ~10px ahead
  expect(o.x).toBeLessThan(f.x + 14)
  f.predict(f.t + 500, 40, 1, o)
  expect(o.x - f.x).toBeLessThan(25) // capped at 40ms of lead
})
