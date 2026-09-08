import type { Side } from "../types/Side"
import { rotatePinOffset } from "./rotatePinOffset"

/** Rotate the pin's facing direction, independently of its position on an edge. */
export const rotatePinSide = (side: Side, ccwRotationDegrees: number): Side => {
  const vectors: Record<Side, { x: number; y: number }> = {
    "x-": { x: -1, y: 0 },
    "x+": { x: 1, y: 0 },
    "y-": { x: 0, y: -1 },
    "y+": { x: 0, y: 1 },
  }
  const direction = rotatePinOffset(vectors[side], ccwRotationDegrees)
  if (direction.x !== 0) return direction.x > 0 ? "x+" : "x-"
  return direction.y > 0 ? "y+" : "y-"
}
