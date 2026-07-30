import type { ChipPin } from "../types/InputProblem"
import type { Placement } from "../types/OutputLayout"
import { rotatePinOffset } from "./rotatePinOffset"

const VERTICAL_PIN_CLEARANCE = 0.2

const getPinY = (pin: ChipPin, placement: Placement) =>
  placement.y + rotatePinOffset(pin.offset, placement.ccwRotationDegrees).y

// Return the translation needed to leave routing space between two pins.
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
