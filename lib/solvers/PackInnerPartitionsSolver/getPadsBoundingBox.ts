import type { InputPad } from "calculate-packing"

export const getPadsBoundingBox = (pads: InputPad[]) => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let hasPads = false

  pads.forEach((p) => {
    hasPads = true
    const firstX = p.offset.x - p.size.x / 2
    const secondX = p.offset.x + p.size.x / 2
    const firstY = p.offset.y - p.size.y / 2
    const secondY = p.offset.y + p.size.y / 2
    minX = Math.min(minX, firstX, secondX)
    maxX = Math.max(maxX, firstX, secondX)
    minY = Math.min(minY, firstY, secondY)
    maxY = Math.max(maxY, firstY, secondY)
  })

  if (!hasPads) return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  return { minX, maxX, minY, maxY }
}
