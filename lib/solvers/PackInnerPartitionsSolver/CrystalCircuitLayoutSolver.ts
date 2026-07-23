import type { GraphicsObject } from "graphics-debug"
import type {
  Chip,
  ChipId,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

type Rotation = 0 | 90 | 180 | 270

const rotationsFor = (chip: Chip): Rotation[] => {
  if (chip.availableRotations?.length) return chip.availableRotations
  return [0]
}

const chooseCrystalRotation = (
  chip: Chip,
  activePinIds: [PinId, PinId],
  problem: PartitionInputProblem,
): Rotation => {
  let bestRotation = rotationsFor(chip)[0]!
  let bestHorizontalScore = -Infinity

  for (const rotation of rotationsFor(chip)) {
    const pinA = problem.chipPinMap[activePinIds[0]]
    const pinB = problem.chipPinMap[activePinIds[1]]
    if (!pinA || !pinB) continue
    const offsetA = rotatePinOffset(pinA.offset, rotation)
    const offsetB = rotatePinOffset(pinB.offset, rotation)
    const score =
      Math.abs(offsetA.x - offsetB.x) - Math.abs(offsetA.y - offsetB.y)
    if (score > bestHorizontalScore) {
      bestHorizontalScore = score
      bestRotation = rotation
    }
  }

  return bestRotation
}

const chooseCapRotation = (
  chip: Chip,
  signalPinId: PinId,
  groundPinId: PinId,
  problem: PartitionInputProblem,
): Rotation => {
  let bestRotation = rotationsFor(chip)[0]!
  let bestVerticalScore = -Infinity

  for (const rotation of rotationsFor(chip)) {
    const signalPin = problem.chipPinMap[signalPinId]
    const groundPin = problem.chipPinMap[groundPinId]
    if (!signalPin || !groundPin) continue
    const signalOffset = rotatePinOffset(signalPin.offset, rotation)
    const groundOffset = rotatePinOffset(groundPin.offset, rotation)
    const score =
      signalOffset.y -
      groundOffset.y -
      Math.abs(signalOffset.x - groundOffset.x)
    if (score > bestVerticalScore) {
      bestVerticalScore = score
      bestRotation = rotation
    }
  }

  return bestRotation
}

const chooseResistorRotation = (
  chip: Chip,
  connectedPinId: PinId,
  problem: PartitionInputProblem,
): Rotation => {
  const otherPinId = chip.pins.find((pinId) => pinId !== connectedPinId)
  let bestRotation = rotationsFor(chip)[0]!
  let bestUpwardScore = -Infinity

  for (const rotation of rotationsFor(chip)) {
    const connectedPin = problem.chipPinMap[connectedPinId]
    const otherPin = otherPinId && problem.chipPinMap[otherPinId]
    if (!connectedPin || !otherPin) continue
    const connectedOffset = rotatePinOffset(connectedPin.offset, rotation)
    const otherOffset = rotatePinOffset(otherPin.offset, rotation)
    const score =
      otherOffset.y -
      connectedOffset.y -
      Math.abs(otherOffset.x - connectedOffset.x)
    if (score > bestUpwardScore) {
      bestUpwardScore = score
      bestRotation = rotation
    }
  }

  return bestRotation
}

export const canLayoutCrystalCircuit = (
  partition: PartitionInputProblem,
): boolean => {
  if (
    partition.partitionType !== "crystal_circuit" ||
    !partition.crystalCircuitGroup
  ) {
    return false
  }

  return Object.values(partition.chipMap).every(
    (chip) => chip.fixedPosition === undefined,
  )
}

/**
 * Places a standard crystal network directly:
 * - crystal centered with active pins on the horizontal axis
 * - one load capacitor below each active pin
 * - both capacitor ground pins on one horizontal row
 * - optional series resistors above the corresponding branch
 */
export class CrystalCircuitLayoutSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  layout: OutputLayout | null = null

  constructor(params: { partitionInputProblem: PartitionInputProblem }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
  }

  override _step() {
    const problem = this.partitionInputProblem
    const group = problem.crystalCircuitGroup!
    const crystal = problem.chipMap[group.crystalChipId]!
    const crystalRotation = chooseCrystalRotation(
      crystal,
      group.activeCrystalPinIds,
      problem,
    )
    const crystalSize = getRotatedSize(crystal.size, crystalRotation)
    const gap = problem.chipGap

    const chipPlacements: Record<ChipId, Placement> = {
      [crystal.chipId]: {
        x: 0,
        y: 0,
        ccwRotationDegrees: crystalRotation,
      },
    }

    const activePinOffsets = new Map<PinId, { x: number; y: number }>()
    for (const pinId of group.activeCrystalPinIds) {
      const pin = problem.chipPinMap[pinId]!
      activePinOffsets.set(pinId, rotatePinOffset(pin.offset, crystalRotation))
    }
    const activeOffsetA = activePinOffsets.get(group.activeCrystalPinIds[0])!
    const activeOffsetB = activePinOffsets.get(group.activeCrystalPinIds[1])!
    let crystalPinAxis: "x" | "y"
    if (
      Math.abs(activeOffsetA.x - activeOffsetB.x) >=
      Math.abs(activeOffsetA.y - activeOffsetB.y)
    ) {
      crystalPinAxis = "x"
    } else {
      crystalPinAxis = "y"
    }

    const capGeometry = group.loadCaps.map((loadCap, index) => {
      const chip = problem.chipMap[loadCap.chipId]!
      const rotation = chooseCapRotation(
        chip,
        loadCap.signalPinId,
        loadCap.groundPinId,
        problem,
      )
      const size = getRotatedSize(chip.size, rotation)
      const signalOffset = rotatePinOffset(
        problem.chipPinMap[loadCap.signalPinId]!.offset,
        rotation,
      )
      const groundOffset = rotatePinOffset(
        problem.chipPinMap[loadCap.groundPinId]!.offset,
        rotation,
      )
      const crystalPinId = group.activeCrystalPinIds[index]!
      const crystalPinOffset = activePinOffsets.get(crystalPinId)!
      const highestCenterY = -crystalSize.y / 2 - gap - size.y / 2

      return {
        chip,
        rotation,
        size,
        signalOffset,
        groundOffset,
        crystalPinOffset,
        highestGroundY: highestCenterY + groundOffset.y,
      }
    })

    if (crystalPinAxis === "x") {
      // Use the lowest allowable ground-pin coordinate so both capacitor bodies
      // clear the crystal even when their symbols have different dimensions.
      const groundRailY = Math.min(
        ...capGeometry.map((geometry) => geometry.highestGroundY),
      )

      for (const geometry of capGeometry) {
        chipPlacements[geometry.chip.chipId] = {
          x: geometry.crystalPinOffset.x - geometry.signalOffset.x,
          y: groundRailY - geometry.groundOffset.y,
          ccwRotationDegrees: geometry.rotation,
        }
      }
    } else {
      // If an explicit orientation locks the crystal vertically, put one load
      // capacitor on each side. Placing both "below" would collapse them onto
      // the same X coordinate. Each signal pin remains level with its crystal
      // terminal and body clearance comes from the horizontal extents.
      capGeometry.forEach((geometry, index) => {
        let side: 1 | -1
        if (index === 0) {
          side = -1
        } else {
          side = 1
        }
        chipPlacements[geometry.chip.chipId] = {
          x: side * (crystalSize.x / 2 + gap + geometry.size.x / 2),
          y: geometry.crystalPinOffset.y - geometry.signalOffset.y,
          ccwRotationDegrees: geometry.rotation,
        }
      })
    }

    for (const seriesResistor of group.seriesResistors) {
      const chip = problem.chipMap[seriesResistor.chipId]!
      const rotation = chooseResistorRotation(
        chip,
        seriesResistor.connectedPinId,
        problem,
      )
      const size = getRotatedSize(chip.size, rotation)
      const connectedOffset = rotatePinOffset(
        problem.chipPinMap[seriesResistor.connectedPinId]!.offset,
        rotation,
      )
      const crystalPinOffset = activePinOffsets.get(
        seriesResistor.crystalPinId,
      )!

      chipPlacements[chip.chipId] = {
        x: crystalPinOffset.x - connectedOffset.x,
        y: crystalSize.y / 2 + gap + size.y / 2,
        ccwRotationDegrees: rotation,
      }
    }

    this.layout = { chipPlacements, groupPlacements: {} }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.partitionInputProblem,
      this.layout ?? { chipPlacements: {}, groupPlacements: {} },
    )
  }

  override getConstructorParams(): [
    { partitionInputProblem: PartitionInputProblem },
  ] {
    return [{ partitionInputProblem: this.partitionInputProblem }]
  }
}
