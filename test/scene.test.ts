import { describe, expect, it } from 'vitest'
import { Scene, parseProject, serialize } from '../src/renderer/ink/scene'
import { toSVG } from '../src/renderer/ink/svg'
import type { Op } from '../src/renderer/ink/geometry'

const stroke = (x: number): Op => ({ kind: 'stroke', brush: 'pen', color: '#ff0000', size: 6, pts: [x, 10, x + 20, 30, x + 40, 20] })

describe('scene', () => {
  it('undo/redo round-trips, including clear', () => {
    const s = new Scene()
    s.add(stroke(0))
    s.add(stroke(50))
    expect(s.clear()).toBe(true)
    expect(s.visible.length).toBe(0)
    s.undo()
    expect(s.visible.length).toBe(2)
    s.undo()
    s.redo()
    expect(s.visible.length).toBe(2)
    expect(s.canRedo).toBe(true)
    s.add(stroke(90))
    expect(s.canRedo).toBe(false)
    expect(s.clear()).toBe(true)
    expect(s.clear()).toBe(false) // nothing left to clear
  })

  it('project files round-trip and reject hostile input', () => {
    const s = new Scene()
    s.add(stroke(0))
    s.add({ kind: 'shape', shape: 'arrow', brush: 'marker', color: '#00ff00', size: 4, geom: [0, 0, 50, 50] })
    expect(parseProject(serialize(s, 800, 600))).toEqual(s.visible)
    const evil = JSON.stringify({ app: 'air-writing-pro', version: 1, ops: [{ ...stroke(0), color: '"/><script>alert(1)</script>' }] })
    expect(() => parseProject(evil)).toThrow()
  })
})

describe('svg export', () => {
  it('emits paths, and erasers mask only earlier content', () => {
    const ops: Op[] = [stroke(0), { kind: 'stroke', brush: 'eraser', color: '#000000', size: 30, pts: [10, 10, 20, 20] }, stroke(100)]
    const svg = toSVG(ops, 400, 300)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/<path [^>]*fill="#ff0000"/g)?.length).toBe(2)
    expect(svg).toContain('<mask id="e0"')
    // the second red stroke sits after (outside) the masked group
    expect(svg.lastIndexOf('fill="#ff0000"')).toBeGreaterThan(svg.indexOf('</g>'))
  })
})
