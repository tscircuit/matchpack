import type { Chip, InputProblem, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"

type Rotation = NonNullable<Chip["availableRotations"]>[number]

const DEFAULT_ROTATIONS: Rotation[] = [0, 90, 180, 270]
const SIDE_ORDER: Side[] = ["x+", "y+", "x-", "y-"]

const rotateSide = (side: Side, rotation: Rotation): Side => {
  const currentIndex = SIDE_ORDER.indexOf(side)
  const steps = rotation / 90
  return SIDE_ORDER[(currentIndex + steps) % SIDE_ORDER.length]!
}

const getRequiredSideForPowerGroundPin = (
  inputProblem: InputProblem,
  pinId: PinId,
): "y+" | "y-" | undefined => {
  let isPower = false
  let isGround = false

  for (const [netId, net] of Object.entries(inputProblem.netMap)) {
    if (!inputProblem.netConnMap[`${pinId}-${netId}`]) continue
    if (net.isPositiveVoltageSource) isPower = true
    if (net.isGround) isGround = true
  }

  if (isPower === isGround) return undefined
  return isPower ? "y+" : "y-"
}

const getRequiredPowerGroundRotation = (
  inputProblem: InputProblem,
  chip: Chip,
): Rotation | undefined => {
  if (chip.availableRotations || chip.pins.length !== 2) return undefined

  const constraints: Array<{ pinId: PinId; side: "y+" | "y-" }> = []
  for (const pinId of chip.pins) {
    const side = getRequiredSideForPowerGroundPin(inputProblem, pinId)
    if (side) constraints.push({ pinId, side })
  }
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

export function applyTwoPinPowerGroundRotationConstraints<
  T extends InputProblem,
>(inputProblem: T): T {
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
