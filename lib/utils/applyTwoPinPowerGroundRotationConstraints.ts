import type {
  Chip,
  InputProblem,
  Net,
  PartitionInputProblem,
  PinId,
} from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"

type Rotation = NonNullable<Chip["availableRotations"]>[number]

const DEFAULT_ROTATIONS: Rotation[] = [0, 90, 180, 270]
const SIDE_ORDER: Side[] = ["x+", "y+", "x-", "y-"]

type PinSideConstraint = {
  pinId: PinId
  side: "y+" | "y-"
}

const rotateSide = (side: Side, rotation: Rotation): Side => {
  const currentIndex = SIDE_ORDER.indexOf(side)
  const steps = rotation / 90
  return SIDE_ORDER[(currentIndex + steps) % SIDE_ORDER.length]!
}

const getConnectedNetsForPin = (
  inputProblem: InputProblem,
  pinId: PinId,
): Net[] => {
  const nets: Net[] = []

  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (inputProblem.netConnMap[`${pinId}-${netId}`]) {
      nets.push(net)
    }
  }

  return nets
}

const getPowerGroundConstraintsForChip = (
  inputProblem: InputProblem,
  chip: Chip,
): PinSideConstraint[] => {
  if (chip.pins.length !== 2) return []

  const constraints: PinSideConstraint[] = []
  let powerPinId: PinId | undefined
  let groundPinId: PinId | undefined
  let powerPinCount = 0
  let groundPinCount = 0

  for (const pinId of chip.pins) {
    const connectedNets = getConnectedNetsForPin(inputProblem, pinId)
    let isPower = false
    let isGround = false

    for (const net of connectedNets) {
      if (net.isPositiveVoltageSource) isPower = true
      if (net.isGround) isGround = true
    }

    if (isPower && !isGround) {
      powerPinId = pinId
      powerPinCount++
    }
    if (isGround && !isPower) {
      groundPinId = pinId
      groundPinCount++
    }
  }

  if (powerPinCount === 1 && powerPinId) {
    constraints.push({ pinId: powerPinId, side: "y+" })
  }
  if (groundPinCount === 1 && groundPinId) {
    constraints.push({ pinId: groundPinId, side: "y-" })
  }

  return constraints
}

const getRequiredPowerGroundRotation = (
  inputProblem: InputProblem,
  chip: Chip,
): Rotation | undefined => {
  if (chip.availableRotations) return undefined

  const constraints = getPowerGroundConstraintsForChip(inputProblem, chip)
  if (constraints.length === 0) return undefined

  for (const rotation of DEFAULT_ROTATIONS) {
    let satisfiesAllConstraints = true

    for (const constraint of constraints) {
      const pin = inputProblem.chipPinMap[constraint.pinId]
      if (!pin || rotateSide(pin.side, rotation) !== constraint.side) {
        satisfiesAllConstraints = false
        break
      }
    }

    if (satisfiesAllConstraints) return rotation
  }

  return undefined
}

export function applyTwoPinPowerGroundRotationConstraints(
  inputProblem: PartitionInputProblem,
): PartitionInputProblem
export function applyTwoPinPowerGroundRotationConstraints(
  inputProblem: InputProblem,
): InputProblem
export function applyTwoPinPowerGroundRotationConstraints(
  inputProblem: InputProblem,
): InputProblem {
  let nextChipMap: InputProblem["chipMap"] | undefined

  for (const [chipId, chip] of Object.entries(inputProblem.chipMap)) {
    const requiredRotation = getRequiredPowerGroundRotation(inputProblem, chip)
    if (requiredRotation === undefined) continue

    nextChipMap ??= { ...inputProblem.chipMap }
    nextChipMap[chipId] = {
      ...chip,
      availableRotations: [requiredRotation],
    }
  }

  if (!nextChipMap) return inputProblem

  return {
    ...inputProblem,
    chipMap: nextChipMap,
  }
}
