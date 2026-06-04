/**
 * Specialized layout for decoupling capacitor partitions.
 *
 * Lays the capacitors out as a tight, uniform bank (the way decoupling
 * capacitors are drawn in official datasheets): every capacitor is oriented
 * the same way (pin connected to the positive voltage source facing y+, pin
 * connected to ground facing y-), ordered deterministically by chip id, and
 * spaced with a consistent gap so the bank packs flush next to the main chip.
 */

import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  Chip,
  ChipId,
  NetId,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"

/** Maximum number of capacitors per row before the bank wraps into a grid */
const MAX_CAPS_PER_ROW = 8

/** Natural sort so C2 comes before C10 */
const compareChipIds = (a: ChipId, b: ChipId): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

/** Get the net ids directly connected to a pin */
const getNetIdsForPin = (
  pinId: PinId,
  partition: PartitionInputProblem,
): Set<NetId> => {
  const nets = new Set<NetId>()
  for (const [connKey, connected] of Object.entries(partition.netConnMap)) {
    if (!connected) continue
    const [p, n] = connKey.split("-") as [PinId, NetId]
    if (p === pinId) nets.add(n)
  }
  return nets
}

/**
 * Determine the rotation that orients the capacitor with its positive-voltage
 * pin facing y+ and its ground pin facing y-. Returns null when the
 * orientation cannot be determined (e.g. nets are not marked as
 * ground/positive voltage source).
 */
const getUniformCapRotation = (
  chip: Chip,
  partition: PartitionInputProblem,
): 0 | 180 | null => {
  if (chip.pins.length !== 2) return null
  const [pin1Id, pin2Id] = chip.pins as [PinId, PinId]
  const pin1 = partition.chipPinMap[pin1Id]
  const pin2 = partition.chipPinMap[pin2Id]
  if (!pin1 || !pin2) return null

  // Identify which pin is on top (y+) at rotation 0
  const topPinId = pin1.offset.y >= pin2.offset.y ? pin1Id : pin2Id
  const bottomPinId = topPinId === pin1Id ? pin2Id : pin1Id

  const isPositive = (pinId: PinId): boolean => {
    for (const netId of getNetIdsForPin(pinId, partition)) {
      if (partition.netMap[netId]?.isPositiveVoltageSource) return true
    }
    return false
  }
  const isGround = (pinId: PinId): boolean => {
    for (const netId of getNetIdsForPin(pinId, partition)) {
      if (partition.netMap[netId]?.isGround) return true
    }
    return false
  }

  if (isPositive(topPinId) && isGround(bottomPinId)) return 0
  if (isPositive(bottomPinId) && isGround(topPinId)) return 180
  return null
}

/** Clamp a desired rotation to the chip's available rotations */
const clampToAvailableRotations = (
  chip: Chip,
  desiredRotation: 0 | 180,
): number => {
  const available = chip.availableRotations
  if (!available || available.length === 0) return desiredRotation
  if (available.includes(desiredRotation)) return desiredRotation
  return available[0]!
}

/** Get the y offset of the topmost pin of a chip at the given rotation */
const getTopPinYOffset = (
  chip: Chip,
  partition: PartitionInputProblem,
  rotationDegrees: number,
): number => {
  let maxY = -Infinity
  for (const pinId of chip.pins) {
    const pin = partition.chipPinMap[pinId]
    if (!pin) continue
    const y = rotationDegrees === 180 ? -pin.offset.y : pin.offset.y
    if (y > maxY) maxY = y
  }
  return Number.isFinite(maxY) ? maxY : chip.size.y / 2
}

/**
 * Lay out a decoupling capacitor partition as a uniform bank.
 *
 * - Capacitors are ordered deterministically (natural sort by chip id)
 * - Every capacitor gets the same orientation: positive voltage pin facing
 *   y+, ground pin facing y- (when determinable and allowed by the chip's
 *   availableRotations)
 * - Capacitors are spaced with a consistent gap
 *   (decouplingCapsGap ?? chipGap) and aligned so the positive-voltage pins
 *   form a straight rail
 * - Large groups wrap into balanced rows of at most MAX_CAPS_PER_ROW
 */
export const layoutDecouplingCapPartition = (
  partition: PartitionInputProblem,
): OutputLayout => {
  const chipIds = Object.keys(partition.chipMap).sort(compareChipIds)
  const gap = partition.decouplingCapsGap ?? partition.chipGap

  // Uniform cell size so the bank forms a regular grid
  let cellWidth = 0
  let cellHeight = 0
  for (const chipId of chipIds) {
    const chip = partition.chipMap[chipId]!
    cellWidth = Math.max(cellWidth, chip.size.x)
    cellHeight = Math.max(cellHeight, chip.size.y)
  }

  // Balanced grid: at most MAX_CAPS_PER_ROW columns
  const rowCount = Math.ceil(chipIds.length / MAX_CAPS_PER_ROW)
  const colCount = Math.ceil(chipIds.length / rowCount)

  const chipPlacements: Record<ChipId, Placement> = {}

  for (let i = 0; i < chipIds.length; i++) {
    const chipId = chipIds[i]!
    const chip = partition.chipMap[chipId]!

    const desiredRotation = getUniformCapRotation(chip, partition) ?? 0
    const rotation = clampToAvailableRotations(chip, desiredRotation)

    const row = Math.floor(i / colCount)
    const col = i % colCount

    const x = col * (cellWidth + gap)
    // Align the top (positive voltage) pins of each row into a straight rail
    const rowTopY = -row * (cellHeight + gap)
    const y = rowTopY - getTopPinYOffset(chip, partition, rotation)

    chipPlacements[chipId] = {
      x,
      y,
      ccwRotationDegrees: rotation,
    }
  }

  return {
    chipPlacements,
    groupPlacements: {},
  }
}
