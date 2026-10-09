import type { Chip, InputProblem, NetId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

const GEOMETRY_TOLERANCE = 1e-6

const getNetPair = (chip: Chip, inputProblem: InputProblem): NetId[] => {
  if (chip.pins.length !== 2) return []
  const netsByPin = chip.pins.map((pinId) =>
    Object.keys(inputProblem.netMap).filter(
      (netId) => inputProblem.netConnMap[`${pinId}-${netId}`],
    ),
  )
  if (netsByPin.some((nets) => nets.length !== 1)) return []
  const netPair = netsByPin.map((nets) => nets[0]!)
  return netPair[0] === netPair[1] ? [] : netPair
}

// A half-turn must preserve both the body bounds and the pin locations.
// This excludes asymmetric custom symbols without inventing new clearance.
const getSymmetricPinOffsets = (
  chip: Chip,
  context: { inputProblem: InputProblem; placement: Placement },
) => {
  const pins = chip.pins.map((pinId) => context.inputProblem.chipPinMap[pinId])
  if (pins.some((pin) => !pin)) return null
  const offsets = pins.map((pin) =>
    rotatePinOffset(pin!.offset, context.placement.ccwRotationDegrees),
  )
  const [first, second] = offsets
  if (!first || !second) return null
  if (
    Math.abs(first.x + second.x) > GEOMETRY_TOLERANCE ||
    Math.abs(first.y + second.y) > GEOMETRY_TOLERANCE
  )
    return null
  const horizontal =
    Math.abs(first.y) < GEOMETRY_TOLERANCE &&
    Math.abs(first.x) > GEOMETRY_TOLERANCE
  const vertical =
    Math.abs(first.x) < GEOMETRY_TOLERANCE &&
    Math.abs(first.y) > GEOMETRY_TOLERANCE
  if (!horizontal && !vertical) return null
  return { first, axis: horizontal ? ("x" as const) : ("y" as const) }
}

/** Orient adjacent RC branches on two named nets with corresponding ends facing alike. */
export const orientParallelRc = (
  inputProblem: InputProblem,
  inputLayout: OutputLayout,
): OutputLayout => {
  const chipPlacements = { ...inputLayout.chipPlacements }
  const pinIdToStronglyConnectedPins =
    getPinIdToStronglyConnectedPinsObj(inputProblem)
  const resistors = Object.values(inputProblem.chipMap).filter(
    (chip) => chip.isResistor && chip.pins.length === 2,
  )
  for (const capacitor of Object.values(inputProblem.chipMap)) {
    if (!capacitor.isCapacitor || capacitor.fixedPosition) continue
    const netPair = getNetPair(capacitor, inputProblem)
    if (netPair.length !== 2) continue
    const matches = resistors.filter((resistor) => {
      const resistorNets = getNetPair(resistor, inputProblem)
      return (
        resistorNets.length === 2 &&
        resistorNets.every((net) => netPair.includes(net))
      )
    })
    if (matches.length !== 1) continue
    const resistor = matches[0]!
    // Preserve the orientation of capacitors anchored outside the RC pair.
    const hasExternalStrongConnection = capacitor.pins.some((pinId) =>
      pinIdToStronglyConnectedPins[pinId]?.some(
        (pin) =>
          !capacitor.pins.includes(pin.pinId) &&
          !resistor.pins.includes(pin.pinId),
      ),
    )
    if (hasExternalStrongConnection) continue
    const capacitorPlacement = chipPlacements[capacitor.chipId]
    const resistorPlacement = chipPlacements[resistor.chipId]
    if (!capacitorPlacement || !resistorPlacement) continue
    const ccwRotationDegrees =
      (((capacitorPlacement.ccwRotationDegrees + 180) % 360) + 360) % 360
    if (
      capacitor.availableRotations &&
      !capacitor.availableRotations.some(
        (allowed) => allowed === ccwRotationDegrees,
      )
    )
      continue
    const capacitorPins = getSymmetricPinOffsets(capacitor, {
      inputProblem,
      placement: capacitorPlacement,
    })
    const resistorPins = getSymmetricPinOffsets(resistor, {
      inputProblem,
      placement: resistorPlacement,
    })
    if (
      !capacitorPins ||
      !resistorPins ||
      capacitorPins.axis !== resistorPins.axis
    )
      continue
    const axis = capacitorPins.axis
    const crossAxis = axis === "x" ? "y" : "x"
    // Only branches alongside each other, with overlapping terminal spans.
    if (
      Math.abs(capacitorPlacement[crossAxis] - resistorPlacement[crossAxis]) <
      GEOMETRY_TOLERANCE
    )
      continue
    if (
      Math.abs(capacitorPlacement[axis] - resistorPlacement[axis]) >=
      Math.abs(capacitorPins.first[axis]) + Math.abs(resistorPins.first[axis])
    )
      continue
    const resistorNets = getNetPair(resistor, inputProblem)
    const correspondingOffset =
      resistorPins.first[axis] * (resistorNets[0] === netPair[0] ? 1 : -1)
    if (capacitorPins.first[axis] * correspondingOffset >= 0) continue
    chipPlacements[capacitor.chipId] = {
      ...capacitorPlacement,
      ccwRotationDegrees,
    }
  }
  return { ...inputLayout, chipPlacements }
}
