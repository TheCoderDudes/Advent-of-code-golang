// Generates the PWA icon set with zero image dependencies.
// Pure math rasteriser -> RGBA buffer -> hand-rolled PNG encoder (node:zlib only).
// Run with: npm run icons
import { deflateSync, crc32 as zlibCrc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

const crc32 = (buf) => {
  if (typeof zlibCrc32 === 'function') return zlibCrc32(buf) >>> 0
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

const encodePng = (width, height, rgba) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // 10..12 stay 0: deflate / adaptive filtering / no interlace

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- tiny rasteriser -------------------------------------------------------

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t

/** Distance from point p to segment ab, all in normalised 0..1 space. */
const distToSegment = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const len2 = abx * abx + aby * aby
  const t = len2 === 0 ? 0 : clamp01((apx * abx + apy * aby) / len2)
  const dx = apx - abx * t
  const dy = apy - aby * t
  return Math.hypot(dx, dy)
}

/** Signed distance to a rounded rectangle centred at (cx, cy). */
const distToRoundedRect = (px, py, cx, cy, halfW, halfH, radius) => {
  const dx = Math.abs(px - cx) - (halfW - radius)
  const dy = Math.abs(py - cy) - (halfH - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - radius
}

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const INK_TOP = hexToRgb('#131a22')
const INK_BOTTOM = hexToRgb('#05080b')
const BRAND = hexToRgb('#38bdf8')
const ROAD = hexToRgb('#475a6e')

/**
 * @param {number} size pixel size
 * @param {{ rounded: boolean, scale: number }} opts
 *   rounded: clip the background to a rounded square (maskable icons must not)
 *   scale:   glyph scale, shrunk for maskable icons so it survives the safe zone crop
 */
const drawIcon = (size, { rounded, scale }) => {
  const rgba = Buffer.alloc(size * size * 4)
  const px = 1 / size // one pixel in normalised units, used for antialiasing

  // Glyph geometry in normalised coords, scaled about the centre.
  const s = (v) => 0.5 + (v - 0.5) * scale
  const strokeHalf = 0.082 * scale
  const roadHalf = 0.032 * scale

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size
      const ny = (y + 0.5) / size

      // Background: vertical gradient, optionally clipped to a rounded square.
      let r = mix(INK_TOP[0], INK_BOTTOM[0], ny)
      let g = mix(INK_TOP[1], INK_BOTTOM[1], ny)
      let b = mix(INK_TOP[2], INK_BOTTOM[2], ny)
      let a = 1
      if (rounded) {
        const d = distToRoundedRect(nx, ny, 0.5, 0.5, 0.5, 0.5, 0.22)
        a = clamp01(0.5 - d / px)
      }

      // The "road" under the mark.
      const roadCoverage = clamp01(
        0.5 + (roadHalf - distToSegment(nx, ny, s(0.3), s(0.815), s(0.7), s(0.815))) / px,
      )
      if (roadCoverage > 0) {
        r = mix(r, ROAD[0], roadCoverage)
        g = mix(g, ROAD[1], roadCoverage)
        b = mix(b, ROAD[2], roadCoverage)
      }

      // The "V" mark: two thick strokes meeting at the bottom.
      const dV = Math.min(
        distToSegment(nx, ny, s(0.27), s(0.26), s(0.5), s(0.7)),
        distToSegment(nx, ny, s(0.73), s(0.26), s(0.5), s(0.7)),
      )
      const vCoverage = clamp01(0.5 + (strokeHalf - dV) / px)
      if (vCoverage > 0) {
        r = mix(r, BRAND[0], vCoverage)
        g = mix(g, BRAND[1], vCoverage)
        b = mix(b, BRAND[2], vCoverage)
        a = Math.max(a, vCoverage)
      }

      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = Math.round(a * 255)
    }
  }
  return encodePng(size, size, rgba)
}

const targets = [
  ['icons/icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icons/icon-512.png', 512, { rounded: true, scale: 1 }],
  // Maskable icons get cropped to a circle-ish safe zone, so no corner rounding
  // and a smaller glyph.
  ['icons/icon-maskable-512.png', 512, { rounded: false, scale: 0.68 }],
  // iOS rounds the apple-touch-icon itself and dislikes transparency.
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.9 }],
]

mkdirSync(resolve(publicDir, 'icons'), { recursive: true })
for (const [file, size, opts] of targets) {
  const out = resolve(publicDir, file)
  writeFileSync(out, drawIcon(size, opts))
  console.log(`wrote ${file} (${size}x${size})`)
}
