import { expect, it, vi } from 'vitest'

vi.mock('../src/renderer/ui/icons', () => ({ icon: () => '' }))
vi.mock('../src/renderer/ui/dock', () => ({ TOOL_LABEL: {} }))
const { segmentAt } = await import('../src/renderer/ui/radial')

const at = (deg: number, r = 100): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180 // 0° = top, clockwise
  return [Math.cos(a) * r, Math.sin(a) * r]
}

it('maps directions to segments, top first, clockwise', () => {
  expect(segmentAt(...at(0), -1, 10)).toBe(0)
  expect(segmentAt(...at(108), -1, 10)).toBe(3) // segment centres every 36°
  expect(segmentAt(...at(36), -1, 10)).toBe(1)
  expect(segmentAt(...at(324), -1, 10)).toBe(9)
})

it('ignores the dead zone and far away', () => {
  expect(segmentAt(...at(0, 20), -1, 10)).toBe(-1)
  expect(segmentAt(...at(0, 400), -1, 10)).toBe(-1)
})

it('holds the highlighted segment until clearly past its edge', () => {
  // segment 0 spans -18°..18°; edge + ~8° hysteresis ≈ 26°
  expect(segmentAt(...at(22), 0, 10)).toBe(0) // past the edge but within hysteresis
  expect(segmentAt(...at(22), -1, 10)).toBe(1) // without a current highlight it's segment 1
  expect(segmentAt(...at(30), 0, 10)).toBe(1) // clearly past → moves on
})
