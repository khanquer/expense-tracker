// Generates the app icons (a white receipt on blue) without any image tooling.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [42, 120, 214]
const PAPER = [255, 255, 255]
const INK = [180, 198, 222]

/** Shape in unit coordinates (0..1). Returns a colour or null for background. */
function shade(x, y) {
  // Receipt body, kept within the maskable safe zone (central ~60%).
  const left = 0.3, right = 0.7, top = 0.2, bottom = 0.78
  if (x < left || x > right || y < top) return null
  // Zigzag bottom edge.
  const teeth = 5
  const w = (right - left) / teeth
  const phase = ((x - left) % w) / w
  const edge = bottom + 0.035 * (phase < 0.5 ? phase * 2 : (1 - phase) * 2)
  if (y > edge) return null
  // Text lines.
  const lines = [0.31, 0.4, 0.49]
  for (const [i, ly] of lines.entries()) {
    const end = i === 2 ? 0.52 : 0.62
    if (y > ly && y < ly + 0.035 && x > 0.37 && x < end) return INK
  }
  // Total line, bolder.
  if (y > 0.6 && y < 0.65 && x > 0.48 && x < 0.63) return BG
  return PAPER
}

function render(size) {
  const ss = 4
  const rows = []
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4)
    row[0] = 0
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size) ?? BG
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
        }
      const o = 1 + px * 4
      row[o] = acc[0] / (ss * ss)
      row[o + 1] = acc[1] / (ss * ss)
      row[o + 2] = acc[2] / (ss * ss)
      row[o + 3] = 255
    }
    rows.push(row)
  }
  return png(size, size, Buffer.concat(rows))
}

function png(w, h, raw) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

writeFileSync('public/icon-192.png', render(192))
writeFileSync('public/icon-512.png', render(512))
writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#2a78d6"/>
  <path d="M30 20h40v58l-4 3.5-4-3.5-4 3.5-4-3.5-4 3.5-4-3.5-4 3.5-4-3.5-4 3.5z" fill="#fff"/>
  <rect x="37" y="31" width="25" height="3.5" fill="#b4c6de"/>
  <rect x="37" y="40" width="25" height="3.5" fill="#b4c6de"/>
  <rect x="37" y="49" width="15" height="3.5" fill="#b4c6de"/>
  <rect x="48" y="60" width="15" height="5" fill="#2a78d6"/>
</svg>
`,
)
console.log('icons written')
