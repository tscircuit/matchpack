import type {
  ChipPin,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"

const TWO_PIN_COMPONENT_PIN_COUNT = 2
const PIN_ALIGNMENT_TOLERANCE = 1e-6
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

// Move equal-height passive pins down to give the trace solver routing space.
export const applyVerticalPinClearanceToDirectPassive = ({
  problem,
  connectedPinsByPinId,
  chipPlacements,
}: {
  problem: PartitionInputProblem
  connectedPinsByPinId: Record<PinId, ChipPin[]>
  chipPlacements: Record<string, Placement>
}): void => {
  const chips = Object.values(problem.chipMap)
  if (chips.length !== TWO_PIN_COMPONENT_PIN_COUNT) return

  const passive = chips.find(
    (chip) =>
      chip.pins.length === TWO_PIN_COMPONENT_PIN_COUNT &&
      !chip.fixedPosition &&
      (chip.isCapacitor || chip.isResistor),
  )
  if (!passive) return

  const mainChip = chips.find((chip) => chip.chipId !== passive.chipId)
  if (!mainChip) return
  if (mainChip.pins.length <= TWO_PIN_COMPONENT_PIN_COUNT) return

  const passivePinId = passive.pins.find((pinId) =>
    (connectedPinsByPinId[pinId] ?? []).some((pin) =>
      mainChip.pins.includes(pin.pinId),
    ),
  )
  if (!passivePinId) return

  const passivePin = problem.chipPinMap[passivePinId]
  const mainPin = connectedPinsByPinId[passivePinId]?.find((pin) =>
    mainChip.pins.includes(pin.pinId),
  )
  if (!passivePin || !mainPin) return

  const passivePlacement = chipPlacements[passive.chipId]
  const mainPlacement = chipPlacements[mainChip.chipId]
  if (!passivePlacement || !mainPlacement) return

  // Only offset passives whose pins are vertically aligned.
  const [firstPinOffset, secondPinOffset] = passive.pins.map((pinId) =>
    rotatePinOffset(
      problem.chipPinMap[pinId]!.offset,
      passivePlacement.ccwRotationDegrees,
    ),
  )
  if (!firstPinOffset || !secondPinOffset) return
  const pinDeltaX = Math.abs(firstPinOffset.x - secondPinOffset.x)
  const pinDeltaY = Math.abs(firstPinOffset.y - secondPinOffset.y)
  if (pinDeltaX >= pinDeltaY) return

  if (
    Math.abs(
      getPinY(passivePin, passivePlacement) - getPinY(mainPin, mainPlacement),
    ) > PIN_ALIGNMENT_TOLERANCE
  )
    return

  passivePlacement.y += getVerticalPinClearanceOffset({
    upperPin: mainPin,
    upperPlacement: mainPlacement,
    lowerPin: passivePin,
    lowerPlacement: passivePlacement,
  })
}
