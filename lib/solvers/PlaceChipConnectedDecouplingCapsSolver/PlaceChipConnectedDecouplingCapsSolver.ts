/**
 * Post-pack placement solver that positions directly-wired decoupling capacitor rows
 * adjacent to their main chip.
 *
 * IdentifyDecouplingCapsSolver identifies decoupling capacitor groups and records
 * their mainChipId and mainChipSide (x-, x+, y+, y-). ChipPartitionsSolver isolates
 * each group into a `decoupling_caps` partition, and DecouplingCapRowSolver lays out
 * the caps into uniform rows.
 *
 * During global partition packing, these partitions can end up several body-widths
 * away from the main chip. PlaceNetOnlyDecouplingRowsSolver handles rail-only groups
 * but explicitly skips directly-connected groups (via partitionsHaveDirectConnection).
 *
 * This solver handles directly-wired decoupling rows across all four sides:
 * - x- / x+: Translates the row to abut the main partition edge on that side,
 *   aligning the positive rail pins vertically (via getVerticalPinClearanceOffset).
 * - y+ / y-: Translates the row above or below the main partition edge,
 *   aligning the positive rail pins horizontally.
 *
 * Overlap detection ensures translations that would collide with other components
 * are safely rolled back to their pre-placement positions.
 */

import {
  type Bounds,
  doBoundsOverlap,
  getBoundFromCenteredRect,
} from "@tscircuit/math-utils"
import type { GraphicsObject } from "graphics-debug"
import { applyToPoint, translate } from "transformation-matrix"
import type {
  ChipId,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getVerticalPinClearanceOffset } from "../../utils/getVerticalPinClearanceOffset"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

type SolverOptions = {
  inputProblem: InputProblem
  packedPartitions: PackedPartition[]
  inputLayout: OutputLayout
}

const getChipBounds = (
  chipId: ChipId,
  {
    inputProblem,
    layout,
  }: { inputProblem: InputProblem; layout: OutputLayout },
): Bounds | null => {
  const placement = layout.chipPlacements[chipId]
  const chip = inputProblem.chipMap[chipId]
  if (!placement || !chip) return null
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return getBoundFromCenteredRect({
    center: placement,
    width: size.x,
    height: size.y,
  })
}

const getPartitionBounds = (
  chipIds: ChipId[],
  context: { inputProblem: InputProblem; layout: OutputLayout },
): Bounds | null => {
  const corners = chipIds.flatMap((chipId) => {
    const bounds = getChipBounds(chipId, context)
    if (!bounds) return []
    return [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    ]
  })
  if (corners.length === 0) return null
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  }
}

const movedChipsOverlap = (
  movedChipIds: ChipId[],
  context: { inputProblem: InputProblem; layout: OutputLayout },
): boolean => {
  const movedChipIdSet = new Set(movedChipIds)
  return movedChipIds.some((movedChipId) => {
    const movedBounds = getChipBounds(movedChipId, context)
    if (!movedBounds) return false
    return Object.keys(context.layout.chipPlacements).some((chipId) => {
      if (movedChipIdSet.has(chipId)) return false
      const chipBounds = getChipBounds(chipId, context)
      return chipBounds ? doBoundsOverlap(movedBounds, chipBounds) : false
    })
  })
}

/**
 * Pin-to-pin wires between the partition's caps and the main chip.
 */
const getDirectWirePairs = ({
  partition,
  mainChipId,
  inputProblem,
}: {
  partition: PartitionInputProblem
  mainChipId: ChipId
  inputProblem: InputProblem
}): { rowPinId: PinId; mainPinId: PinId }[] => {
  const mainPinIdSet = new Set(inputProblem.chipMap[mainChipId]?.pins ?? [])
  const rowPinIdSet = new Set(Object.keys(partition.chipPinMap))
  return Object.entries(inputProblem.pinStrongConnMap)
    .filter(([connection, connected]) => {
      if (!connected) return false
      const [pinA, pinB] = connection.split("-") as [PinId, PinId]
      return (
        (rowPinIdSet.has(pinA!) && mainPinIdSet.has(pinB!)) ||
        (rowPinIdSet.has(pinB!) && mainPinIdSet.has(pinA!))
      )
    })
    .map(([connection]) => {
      const [pinA, pinB] = connection.split("-") as [PinId, PinId]
      return rowPinIdSet.has(pinA!)
        ? { rowPinId: pinA!, mainPinId: pinB! }
        : { rowPinId: pinB!, mainPinId: pinA! }
    })
}

const isOnPositiveRail = (pinId: PinId, problem: InputProblem): boolean =>
  Object.values(problem.netMap).some(
    (net) =>
      net.isPositiveVoltageSource &&
      problem.netConnMap[`${pinId}-${net.netId}`],
  )

export const placeChipConnectedDecouplingCapRow = ({
  layout,
  decouplingPartition,
  inputProblem,
  packedPartitions,
}: {
  layout: OutputLayout
  decouplingPartition: PackedPartition
  inputProblem: InputProblem
  packedPartitions: PackedPartition[]
}): void => {
  const partition = decouplingPartition.inputProblem as PartitionInputProblem
  const mainChipId = partition.decouplingMainChipId
  const side = partition.decouplingMainChipSide
  if (partition.partitionType !== "decoupling_caps" || !mainChipId || !side) {
    return
  }

  // Only handle directly-wired groups; net-only rows are handled by PlaceNetOnlyDecouplingRowsSolver.
  const directWirePairs = getDirectWirePairs({
    partition,
    mainChipId,
    inputProblem,
  }).filter((pair) => inputProblem.chipPinMap[pair.mainPinId]?.side === side)
  if (directWirePairs.length === 0) return

  const mainPartition = packedPartitions.find(
    (candidate) =>
      candidate !== decouplingPartition &&
      candidate.inputProblem.chipMap[mainChipId],
  )
  if (!mainPartition) return

  const rowChipIds = Object.keys(partition.chipMap)
  // If any capacitor in the group has a fixed position, preserve it
  if (
    rowChipIds.some((chipId) => inputProblem.chipMap[chipId]?.fixedPosition)
  ) {
    return
  }

  const boundsContext = { inputProblem, layout }
  const mainBounds = getPartitionBounds(
    Object.keys(mainPartition.inputProblem.chipMap),
    boundsContext,
  )
  const rowBounds = getPartitionBounds(rowChipIds, boundsContext)
  if (!mainBounds || !rowBounds) return

  const mainChip = inputProblem.chipMap[mainChipId]
  const mainPlacement = layout.chipPlacements[mainChipId]
  if (!mainChip || !mainPlacement) return

  const gap = inputProblem.chipGap
  const railPair = directWirePairs.find((pair) =>
    isOnPositiveRail(pair.rowPinId, inputProblem),
  )
  const mainRailPin = railPair
    ? inputProblem.chipPinMap[railPair.mainPinId]
    : undefined
  const rowRailPin = railPair
    ? partition.chipPinMap[railPair.rowPinId]
    : undefined
  const rowRailChipId = railPair
    ? rowChipIds.find((chipId) =>
        partition.chipMap[chipId]?.pins.includes(railPair.rowPinId!),
      )
    : undefined
  const rowRailPlacement = rowRailChipId
    ? layout.chipPlacements[rowRailChipId]
    : undefined

  let transform: ReturnType<typeof translate>

  if (side === "x-" || side === "x+") {
    // Primary placement axis is horizontal (X)
    const targetRowEdge =
      side === "x-" ? mainBounds.minX - gap : mainBounds.maxX + gap
    const edgeOffset =
      side === "x-"
        ? targetRowEdge - rowBounds.maxX
        : targetRowEdge - rowBounds.minX

    // Align the row's positive-rail pin with the main chip's rail pin vertically
    let yOffset = 0
    if (rowRailPin && rowRailPlacement && mainRailPin) {
      yOffset = getVerticalPinClearanceOffset({
        upperPin: mainRailPin,
        upperPlacement: mainPlacement,
        lowerPin: rowRailPin,
        lowerPlacement: rowRailPlacement,
      })
      const maxShift =
        (mainBounds.maxY - mainBounds.minY) / 2 +
        (rowBounds.maxY - rowBounds.minY) +
        gap
      if (Math.abs(yOffset) > Math.max(maxShift, 4)) yOffset = 0
    } else {
      const mainCenterY = (mainBounds.minY + mainBounds.maxY) / 2
      const rowCenterY = (rowBounds.minY + rowBounds.maxY) / 2
      yOffset = mainCenterY - rowCenterY
    }

    transform = translate(edgeOffset, yOffset)
  } else {
    // Primary placement axis is vertical (Y) for y+ / y-
    const targetRowEdge =
      side === "y-" ? mainBounds.minY - gap : mainBounds.maxY + gap
    const edgeOffset =
      side === "y-"
        ? targetRowEdge - rowBounds.maxY
        : targetRowEdge - rowBounds.minY

    // Align the row's positive-rail pin with the main chip's rail pin horizontally
    let xOffset = 0
    if (rowRailPin && rowRailPlacement && mainRailPin) {
      const mainPinWorldX =
        mainPlacement.x +
        rotatePinOffset(mainRailPin.offset, mainPlacement.ccwRotationDegrees).x
      const rowPinWorldX =
        rowRailPlacement.x +
        rotatePinOffset(rowRailPin.offset, rowRailPlacement.ccwRotationDegrees)
          .x
      xOffset = mainPinWorldX - rowPinWorldX
      const maxShift =
        (mainBounds.maxX - mainBounds.minX) / 2 +
        (rowBounds.maxX - rowBounds.minX) +
        gap
      if (Math.abs(xOffset) > Math.max(maxShift, 4)) xOffset = 0
    } else {
      const mainCenterX = (mainBounds.minX + mainBounds.maxX) / 2
      const rowCenterX = (rowBounds.minX + rowBounds.maxX) / 2
      xOffset = mainCenterX - rowCenterX
    }

    transform = translate(xOffset, edgeOffset)
  }

  const previousPlacements = new Map<ChipId, Placement>()
  for (const chipId of rowChipIds) {
    const placement = layout.chipPlacements[chipId]
    if (!placement) continue
    previousPlacements.set(chipId, placement)
    layout.chipPlacements[chipId] = {
      ...placement,
      ...applyToPoint(transform, placement),
    }
  }

  // Reject the translation when it collides with any chip outside the row.
  if (movedChipsOverlap(rowChipIds, boundsContext)) {
    for (const [chipId, placement] of previousPlacements) {
      layout.chipPlacements[chipId] = placement
    }
  }
}

export class PlaceChipConnectedDecouplingCapsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(private options: SolverOptions) {
    super()
  }

  override _step() {
    this.outputLayout = structuredClone(this.options.inputLayout)
    for (const decouplingPartition of this.options.packedPartitions) {
      placeChipConnectedDecouplingCapRow({
        layout: this.outputLayout,
        decouplingPartition,
        inputProblem: this.options.inputProblem,
        packedPartitions: this.options.packedPartitions,
      })
    }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.options.inputProblem,
      this.outputLayout ?? this.options.inputLayout,
    )
  }

  override getConstructorParams(): [SolverOptions] {
    return [this.options]
  }
}
