export function createCanvasStatusbarLensMap(
  width: number,
  height: number,
  cornerRadius: number
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const radius = Math.min(cornerRadius, width / 2, height / 2)
  const bevel = Math.min(12, width / 3, height / 3)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5 - width / 2
      const py = y + 0.5 - height / 2
      const qx = Math.abs(px) - (width / 2 - radius)
      const qy = Math.abs(py) - (height / 2 - radius)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const length = Math.hypot(ox, oy)
      const depth = -(Math.min(Math.max(qx, qy), 0) + length - radius)
      const nx = length > 0 ? (ox / length) * Math.sign(px) : qx > qy ? Math.sign(px) : 0
      const ny = length > 0 ? (oy / length) * Math.sign(py) : qy >= qx ? Math.sign(py) : 0
      const profile = depth > 0 && depth < bevel ? Math.sin((depth / bevel) * Math.PI) : 0
      const offset = (y * width + x) * 4

      pixels[offset] = Math.round(128 - nx * profile * 112)
      pixels[offset + 1] = Math.round(128 - ny * profile * 112)
      pixels[offset + 2] = 128
      pixels[offset + 3] = 255
    }
  }

  return pixels
}
