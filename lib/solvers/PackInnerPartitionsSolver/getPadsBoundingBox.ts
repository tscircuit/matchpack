import type { InputPad } from "calculate-packing"

export const getPadsBoundingBox = (pads: InputPad[]) => {
  const xs = pads.flatMap((p) => [
    p.offset.x - p.size.x / 2,
    p.offset.x + p.size.x / 2,
  ])
  const ys = pads.flatMap((p) => [
    p.offset.y - p.size.y / 2,
    p.offset.y + p.size.y / 2,
  ])
  const minX = xs.length ? Math.min(...xs) : 0
  const maxX = xs.length ? Math.max(...xs) : 0
  const minY = ys.length ? Math.min(...ys) : 0
  const maxY = ys.length ? Math.max(...ys) : 0
  return { minX, maxX, minY, maxY }
}
