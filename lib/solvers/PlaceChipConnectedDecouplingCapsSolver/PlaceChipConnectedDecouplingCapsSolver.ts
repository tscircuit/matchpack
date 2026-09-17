/**
 * Post-pack placement pass that pulls directly-wired decoupling capacitor rows
 * up against their main chip.
 *
 * IdentifyDecouplingCapsSolver finds each cap group and ChipPartitionsSolver
 * isolates it into a `decoupling_caps` partition, but nothing in the pipeline
 * ever moves the partition itself: it is packed wherever the global packer has
 * room, which can leave the caps several body-widths away from the chip they
 * decouple (repro50: U3 sits at x=+1, its directly-wired caps land at x=-4.3
 * through -11.7, spread over two y rows, and no pipeline phase moves them).
 *
 * PlaceNetOnlyDecouplingRowsSolver already pulls rows closer, but only for
 * net-only caps (caps wired to the rail without a direct pin-to-pin wire to the
 * main chip); a `decoupling_caps` partition whose caps ARE pin-to-pin wired to
 * the main chip bails out early via partitionsHaveDirectConnection. Those are
 * the most common decoupling caps on real boards, so this pass handles the
 * directly-wired case symmetrically:
 *
 * For each directly-wired decoupling cap group on a main-chip x-side, translate
 * the group's row so its edge sits chipGap away from the main partition's edge
 * on that side, and align each cap's positive rail pin with the main chip's
 * positive rail pin (through getVerticalPinClearanceOffset) so both rail pins
 * share a y. Caps keep the row order DecouplingCapRowSolver laid them out in
 * (main-chip pin order), so each cap lands next to the side of the chip its
 * wire leaves from. The translation is rejected (left as packed) whenever it
 * would overlap any other chip.
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
import { getRotatedSize } from "../../utils/rotatePinOffset"
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
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
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
 * Pin-to-pin wires between the partition's caps and the main chip, as
 * { rowPinId, mainPinId } pairs. The row pin on the group's positive rail and
 * its paired main pin share a wire, so aligning that pair aligns the rail.
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

  // Only directly-wired groups; net-only rows are PlaceNetOnlyDecouplingRowsSolver's job.
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

  // Target edge for the row on the main chip's side: chipGap away from the
  // main partition's edge on that side.
  const targetRowEdge =
    side === "x-"
      ? mainBounds.minX - inputProblem.chipGap
      : mainBounds.maxX + inputProblem.chipGap
  const edgeOffset =
    side === "x-"
      ? targetRowEdge - rowBounds.maxX
      : targetRowEdge - rowBounds.minX

  // Align the row's positive-rail pins with the main chip's pin on the SAME
  // wire, so each group hugs the side of the chip its own rail leaves from.
  // Two groups on different rails (net5 vs net7) then settle at different
  // heights beside the chip instead of colliding at one y.
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

  let yOffset = 0
  if (rowRailPin && rowRailPlacement && mainRailPin) {
    yOffset = getVerticalPinClearanceOffset({
      upperPin: mainRailPin,
      upperPlacement: mainPlacement,
      lowerPin: rowRailPin,
      lowerPlacement: rowRailPlacement,
    })
  } else {
    // No rail pin to align: center the row on the main chip's vertical span.
    const mainCenterY = (mainBounds.minY + mainBounds.maxY) / 2
    const rowCenterY = (rowBounds.minY + rowBounds.maxY) / 2
    yOffset = mainCenterY - rowCenterY
  }

  // Caps are wider than tall in the y direction after rotation handling; pull
  // the row's y to the main rail pin's y plus a small readable-trace clearance.
  const MAX_PIN_OFFSET_SHIFT = 4
  if (Math.abs(yOffset) > MAX_PIN_OFFSET_SHIFT) yOffset = 0

  const rowToPlacedTransform = translate(edgeOffset, yOffset)
  const previousPlacements = new Map<ChipId, Placement>()
  for (const chipId of rowChipIds) {
    const placement = layout.chipPlacements[chipId]
    if (!placement) continue
    previousPlacements.set(chipId, placement)
    layout.chipPlacements[chipId] = {
      ...placement,
      ...applyToPoint(rowToPlacedTransform, placement),
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
