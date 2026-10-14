// Vector SVG export. Erasers become masks over everything drawn before them,
// which reproduces canvas 'destination-out' exactly.
import { brushWidth, outline, outlineD, shapeD, type Op } from './geometry'

export function toSVG(ops: Op[], width: number, height: number, background?: string): string {
  let content = ''
  let masks = ''
  let m = 0
  for (const op of ops) {
    if (op.kind === 'clear') {
      content = ''
      continue
    }
    const fill = op.kind === 'stroke'
    const d = fill ? outlineD(outline(op.brush, op.pts, op.size)) : shapeD(op.shape, op.geom, op.size)
    if (!d) continue
    if (op.brush === 'eraser') {
      const id = `e${m++}`
      masks += `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fff"/><path d="${d}" fill="#000"/></mask>`
      content = `<g mask="url(#${id})">${content}</g>`
      continue
    }
    const paint = (color: string, extra = '', widthScale = 1): string =>
      fill
        ? `<path d="${d}" fill="${color}"${extra}/>`
        : `<path d="${d}" fill="none" stroke="${color}" stroke-width="${brushWidth(op.brush, op.size) * widthScale}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
    if (op.brush === 'highlighter') content += paint(op.color, ' opacity="0.35"')
    else if (op.brush === 'neon') content += `<g filter="url(#glow)">${paint(op.color)}</g>` + paint('#fff', ' opacity="0.55"', 0.45)
    else content += paint(op.color)
  }
  const bg = background ? `<rect width="100%" height="100%" fill="${background}"/>` : ''
  const glow = `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${glow}${masks}</defs>${bg}${content}</svg>`
}
