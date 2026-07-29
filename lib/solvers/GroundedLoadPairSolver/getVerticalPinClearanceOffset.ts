import type { ChipPin } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"

const VERTICAL_PIN_CLEARANCE = 0.2

const getPinY = (pin: ChipPin, placement: Placement) =>
  placement.y + rotatePinOffset(pin.offset, placement.ccwRotationDegrees).y

// Preserve a small routing channel between vertically aligned pins.
export const getVerticalPinClearanceOffset = ({
  upperPin,
  upperPlacement,
  lowerPin,
  lowerPlacement,
}: {
  upperPin: ChipPin
  upperPlacement: Placement
  lowerPin: ChipPin
  lowerPlacement: Placement
}) =>
  getPinY(upperPin, upperPlacement) -
  getPinY(lowerPin, lowerPlacement) -
  VERTICAL_PIN_CLEARANCE
