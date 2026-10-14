import { expect, it } from 'vitest'
import { StrokeSmoother } from '../src/renderer/ink/smooth'

// jittery horizontal line: y alternates ±3px around 100
function jittery(n: number): StrokeSmoother {
  const s = new StrokeSmoother()
  s.reset(0, 100)
  for (let i = 1; i < n; i++) s.push(i * 12, 100 + (i % 2 ? 3 : -3))
  return s
}

it('removes jitter without shifting the line', () => {
  const path = jittery(40).finish()
  const ys = path.filter((_, i) => i % 2 === 1)
  const mid = ys.slice(20, -20) // away from the exact endpoints
  expect(Math.max(...mid) - Math.min(...mid)).toBeLessThan(2.5) // raw swing is 6px
  const mean = mid.reduce((a, b) => a + b, 0) / mid.length
  expect(Math.abs(mean - 100)).toBeLessThan(0.5)
})

it('keeps the start and end points exact', () => {
  const s = jittery(10)
  const path = s.finish()
  expect(path.slice(0, 2)).toEqual([0, 100])
  expect(path.slice(-2)).toEqual([s.raw[s.raw.length - 2], s.raw[s.raw.length - 1]])
})

it('settled path plus live tail reaches the latest sample', () => {
  const s = jittery(12)
  const tail = s.tail()
  expect(tail.slice(-2)).toEqual(s.raw.slice(-2))
  expect(s.path.length).toBeGreaterThan(2) // early segments already final
})
