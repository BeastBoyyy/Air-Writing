// Renders build/icon.png (1024²): a glossy gradient squircle with a white air-written swoosh.
// Pure Node (zlib) so the icon can be regenerated without design tools: `node scripts/make-icon.mjs`
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 1024
const px = Buffer.alloc(S * S * 4)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const mix = (a, b, t) => a + (b - a) * t
const stops = [[10, 132, 255], [191, 90, 242], [255, 55, 95]] // blue → purple → pink

// swoosh: a smooth S-curve sampled as a polyline
const curve = []
for (let i = 0; i <= 200; i++) {
  const t = i / 200
  curve.push([mix(250, 790, t), 560 - Math.sin(t * Math.PI * 2) * 150 - t * 90])
}
const segDist = (x, y) => {
  let best = Infinity
  for (let i = 1; i < curve.length; i++) {
    const [ax, ay] = curve[i - 1], [bx, by] = curve[i]
    const dx = bx - ax, dy = by - ay
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy))
  }
  return best
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    // squircle mask with 1px anti-aliasing
    const nx = (x - S / 2) / (S * 0.45), ny = (y - S / 2) / (S * 0.45)
    const r = Math.pow(Math.pow(Math.abs(nx), 5) + Math.pow(Math.abs(ny), 5), 1 / 5)
    const alpha = clamp((1 - r) * S * 0.45 + 0.5)
    if (alpha <= 0) continue
    // diagonal gradient
    const g = clamp((x + y) / (2 * S))
    const k = g < 0.5 ? g * 2 : (g - 0.5) * 2
    const [c0, c1] = g < 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]]
    let [R, G, B] = [0, 1, 2].map((i) => mix(c0[i], c1[i], k))
    // top gloss
    const gloss = clamp(1 - y / (S * 0.55)) * 0.22
    R = mix(R, 255, gloss); G = mix(G, 255, gloss); B = mix(B, 255, gloss)
    // swoosh with soft glow
    const d = segDist(x, y)
    const core = clamp(46 - d)
    const glow = clamp(1 - (d - 40) / 70) * 0.35
    const w = Math.max(core, glow)
    R = mix(R, 255, w); G = mix(G, 255, w); B = mix(B, 255, w)
    const o = (y * S + x) * 4
    px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = alpha * 255
  }
}

// PNG encode
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
]))
console.log('wrote build/icon.png')
