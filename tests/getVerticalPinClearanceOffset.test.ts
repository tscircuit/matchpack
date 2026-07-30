import { expect, test } from "bun:test"
import { getVerticalPinClearanceOffset } from "../lib/utils/getVerticalPinClearanceOffset"
import type { ChipPin } from "../lib/types/InputProblem"

const VERTICAL_PIN_CLEARANCE = 0.2

test("returns the offset needed for vertical pin clearance", () => {
  const upperPin: ChipPin = {
    pinId: "U1.1",
    offset: { x: 0, y: 0 },
    side: "y-",
  }
  const lowerPin: ChipPin = {
    pinId: "R1.1",
    offset: { x: 0, y: 0.5 },
    side: "y+",
  }

  const offset = getVerticalPinClearanceOffset({
    upperPin,
    upperPlacement: { x: 0, y: 0, ccwRotationDegrees: 0 },
    lowerPin,
    lowerPlacement: { x: 0, y: -0.5, ccwRotationDegrees: 0 },
  })

  expect(offset).toBeCloseTo(-VERTICAL_PIN_CLEARANCE)
})
