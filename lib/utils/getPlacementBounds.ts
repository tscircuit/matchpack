import {
  getBoundFromCenteredRect,
  type Bounds,
  type Point,
} from "@tscircuit/math-utils"
import type { Placement } from "../types/OutputLayout"
import { getRotatedSize } from "./rotatePinOffset"

export const getPlacementBounds = ({
  placement,
  size,
  margin = 0,
}: {
  placement: Placement
  size: Point
  margin?: number
}): Bounds => {
  const rotatedSize = getRotatedSize(size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: rotatedSize.x + margin * 2,
    height: rotatedSize.y + margin * 2,
  })
}
