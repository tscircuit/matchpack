import type { Point } from "@tscircuit/math-utils"

/** Normalize an arbitrary rotation to one of 0/90/180/270 (CCW). */
const normalizeQuarterTurn = (
  ccwRotationDegrees: number,
): 0 | 90 | 180 | 270 => {
  const snapped = Math.round(ccwRotationDegrees / 90) * 90
  return (((snapped % 360) + 360) % 360) as 0 | 90 | 180 | 270
}

/**
 * Rotate a pin offset around the chip center by a counterclockwise rotation in
 * degrees (snapped to 0/90/180/270). This matches the CCW convention used by
 * `visualizeInputProblem` and the packing solvers.
 */
export const rotatePinOffset = (
  offset: Point,
  ccwRotationDegrees: number,
): Point => {
  switch (normalizeQuarterTurn(ccwRotationDegrees)) {
    case 90:
      return { x: -offset.y, y: offset.x }
    case 180:
      return { x: -offset.x, y: -offset.y }
    case 270:
      return { x: offset.y, y: -offset.x }
    default:
      return { x: offset.x, y: offset.y }
  }
}

/**
 * Get a chip's footprint dimensions after a 0/90/180/270 rotation (width/height
 * are swapped for 90/270).
 */
export const getRotatedSize = (
  size: Point,
  ccwRotationDegrees: number,
): Point => {
  const turn = normalizeQuarterTurn(ccwRotationDegrees)
  if (turn === 90 || turn === 270) return { x: size.y, y: size.x }
  return { x: size.x, y: size.y }
}
