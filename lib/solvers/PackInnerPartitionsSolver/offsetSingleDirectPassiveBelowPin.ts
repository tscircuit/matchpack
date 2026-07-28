import type {
  ChipPin,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"

export const DIRECT_PASSIVE_VERTICAL_OFFSET = 0.2

// Move equal-height passive pins down to give the trace solver routing space.
export const offsetSingleDirectPassiveBelowPin = (
  problem: PartitionInputProblem,
  connectedPinsByPinId: Record<PinId, ChipPin[]>,
  chipPlacements: Record<string, Placement>,
): void => {
  const chips = Object.values(problem.chipMap)
  if (chips.length !== 2) return

  const passive = chips.find(
    (chip) =>
      chip.pins.length === 2 &&
      !chip.fixedPosition &&
      (chip.isCapacitor || chip.isResistor),
  )
  if (!passive) return

  const mainChip = chips.find((chip) => chip.chipId !== passive.chipId)!
  if (mainChip.pins.length <= 2) return

  const passivePinId = passive.pins.find((pinId) =>
    (connectedPinsByPinId[pinId] ?? []).some((pin) =>
      mainChip.pins.includes(pin.pinId),
    ),
  )
  if (!passivePinId) return

  const passivePin = problem.chipPinMap[passivePinId]!
  const mainPin = connectedPinsByPinId[passivePinId]!.find((pin) =>
    mainChip.pins.includes(pin.pinId),
  )!

  const passivePlacement = chipPlacements[passive.chipId]
  const mainPlacement = chipPlacements[mainChip.chipId]
  if (!passivePlacement || !mainPlacement) return

  const getPinY = (pin: ChipPin, placement: Placement) =>
    placement.y + rotatePinOffset(pin.offset, placement.ccwRotationDegrees).y
  if (
    Math.abs(
      getPinY(passivePin, passivePlacement) - getPinY(mainPin, mainPlacement),
    ) > 1e-6
  )
    return

  passivePlacement.y -= DIRECT_PASSIVE_VERTICAL_OFFSET
}
