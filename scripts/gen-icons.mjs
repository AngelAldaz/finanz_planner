// Genera los íconos PWA (puro JS, sin dependencias nativas). Reproducible: `pnpm icons`.
// Diseño "bold": fondo lima + barras negras ascendentes (flujo de efectivo creciendo).
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const LIME = [0xcc, 0xff, 0x00]
const INK = [0x14, 0x14, 0x14]

function rect(png, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue
      const i = (png.width * y + x) << 2
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
}

function drawIcon(size) {
  const png = new PNG({ width: size, height: size })
  rect(png, 0, 0, size, size, LIME) // fondo lima
  // contenido dentro de la zona segura (para íconos "maskable")
  const pad = Math.round(size * 0.24)
  const cW = size - 2 * pad
  const cH = size - 2 * pad
  const barW = Math.round(cW / 5)
  const gap = Math.round((cW - 3 * barW) / 2)
  const heights = [0.45, 0.7, 1.0]
  for (let b = 0; b < 3; b++) {
    const h = Math.round(cH * heights[b])
    const x = pad + b * (barW + gap)
    const y = pad + (cH - h)
    rect(png, x, y, barW, h, INK)
  }
  return PNG.sync.write(png)
}

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), drawIcon(size))
}
writeFileSync(join(outDir, 'apple-touch-icon.png'), drawIcon(180))
console.log('Íconos generados en public/icons/')
