import {
  doBoundsOverlap,
  getBoundFromCenteredRect,
  getBoundsFromPoints,
  type Bounds,
} from "@tscircuit/math-utils"
import type { GraphicsObject } from "graphics-debug"
import type {
  ChipId,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
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
  return getBoundsFromPoints(corners)
}

const movedChipsOverlap = (
  movedChipIds: ChipId[],
  context: { inputProblem: InputProblem; layout: OutputLayout },
): boolean => {
  const movedChipIdSet = new Set(movedChipIds)
  return movedChipIds.some((movedChipId) => {
    const movedBounds = getChipBounds(movedChipId, context)
    return Object.keys(context.layout.chipPlacements).some((chipId) => {
      if (!movedBounds || movedChipIdSet.has(chipId)) return false
      const chipBounds = getChipBounds(chipId, context)
      return chipBounds ? doBoundsOverlap(movedBounds, chipBounds) : false
    })
  })
}

const getStronglyConnectedPinIds = (
  pinId: PinId,
  inputProblem: InputProblem,
): PinId[] => {
  const connectedPinIds: PinId[] = []
  for (const [connection, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connection.split("-") as [PinId, PinId]
    if (pinA === pinId) connectedPinIds.push(pinB)
    if (pinB === pinId) connectedPinIds.push(pinA)
  }
  return connectedPinIds
}

const getNetIdsForPin = (
  pinId: PinId,
  inputProblem: InputProblem,
): Set<string> => {
  const netIds = new Set<string>()
  for (const [connection, connected] of Object.entries(
    inputProblem.netConnMap,
  )) {
    if (!connected) continue
    const [connectedPinId, netId] = connection.split("-")
    if (connectedPinId === pinId && netId) netIds.add(netId)
  }
  return netIds
}

const getAbsolutePinPosition = (
  pinId: PinId,
  inputProblem: InputProblem,
  layout: OutputLayout,
): { x: number; y: number } | null => {
  const chip = Object.values(inputProblem.chipMap).find((candidate) =>
    candidate.pins.includes(pinId),
  )
  const pin = inputProblem.chipPinMap[pinId]
  const placement = chip && layout.chipPlacements[chip.chipId]
  if (!pin || !placement) return null
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}

const placeRailConnectedLoad = (
  {
    layout,
    railPartition,
  }: { layout: OutputLayout; railPartition: PackedPartition },
  { inputProblem, packedPartitions }: SolverOptions,
): void => {
  const rowPartition = railPartition.inputProblem as PartitionInputProblem
  const side = rowPartition.decouplingMainChipSide
  if (
    rowPartition.partitionType !== "decoupling_caps" ||
    (side !== "x+" && side !== "x-")
  ) {
    return
  }

  const rowChipIds = Object.keys(rowPartition.chipMap)
  if (rowChipIds.length < 2) return

  const rowPins = rowChipIds.flatMap(
    (chipId) => inputProblem.chipMap[chipId]?.pins ?? [],
  )
  const rowSignalNetIds = new Set(
    rowPins
      .flatMap((pinId) => [...getNetIdsForPin(pinId, inputProblem)])
      .filter((netId) => !inputProblem.netMap[netId]?.isGround),
  )
  if (rowSignalNetIds.size !== 1) return
  const [rowSignalNetId] = rowSignalNetIds

  const candidate = packedPartitions
    .filter(
      (partition) =>
        partition !== railPartition &&
        Object.keys(partition.inputProblem.chipMap).length === 2,
    )
    .flatMap((partition) =>
      Object.values(partition.inputProblem.chipMap)
        .filter((chip) => chip.isResistor && chip.pins.length === 2)
        .map((resistor) => ({ partition, resistor })),
    )
    .find(({ partition, resistor }) => {
      const partitionPinIds = new Set(
        Object.keys(partition.inputProblem.chipPinMap),
      )
      return resistor.pins.some((pinId) => {
        if (!getNetIdsForPin(pinId, inputProblem).has(rowSignalNetId!)) {
          return false
        }
        return resistor.pins.some(
          (otherPinId) =>
            otherPinId !== pinId &&
            getStronglyConnectedPinIds(otherPinId, inputProblem).some(
              (connectedPinId) => partitionPinIds.has(connectedPinId),
            ),
        )
      })
    })
  if (!candidate) return

  const resistorRailPinId = candidate.resistor.pins.find((pinId) =>
    getNetIdsForPin(pinId, inputProblem).has(rowSignalNetId!),
  )
  if (!resistorRailPinId) return

  const rowRailPinPositions = rowPins
    .filter((pinId) =>
      getNetIdsForPin(pinId, inputProblem).has(rowSignalNetId!),
    )
    .flatMap((pinId) => {
      const position = getAbsolutePinPosition(pinId, inputProblem, layout)
      return position ? [position] : []
    })
  const resistorRailPinPosition = getAbsolutePinPosition(
    resistorRailPinId,
    inputProblem,
    layout,
  )
  const candidateChipIds = Object.keys(candidate.partition.inputProblem.chipMap)
  const boundsContext = { inputProblem, layout }
  const rowBounds = getPartitionBounds(rowChipIds, boundsContext)
  const candidateBounds = getPartitionBounds(candidateChipIds, boundsContext)
  if (
    rowRailPinPositions.length === 0 ||
    !resistorRailPinPosition ||
    !rowBounds ||
    !candidateBounds
  ) {
    return
  }

  const terminalRowPin = rowRailPinPositions.reduce((terminal, position) => {
    if (side === "x+") return position.x > terminal.x ? position : terminal
    return position.x < terminal.x ? position : terminal
  })
  const offset = {
    x:
      side === "x+"
        ? rowBounds.maxX + inputProblem.chipGap - candidateBounds.minX
        : rowBounds.minX - inputProblem.chipGap - candidateBounds.maxX,
    y: terminalRowPin.y - resistorRailPinPosition.y,
  }

  const previousPlacements = new Map<ChipId, Placement>()
  for (const chipId of candidateChipIds) {
    const placement = layout.chipPlacements[chipId]
    if (!placement) continue
    previousPlacements.set(chipId, placement)
    layout.chipPlacements[chipId] = {
      ...placement,
      x: placement.x + offset.x,
      y: placement.y + offset.y,
    }
  }

  if (movedChipsOverlap(candidateChipIds, boundsContext)) {
    for (const [chipId, placement] of previousPlacements) {
      layout.chipPlacements[chipId] = placement
    }
  }
}

export class PlaceRailConnectedLoadsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(private options: SolverOptions) {
    super()
  }

  override _step() {
    this.outputLayout = structuredClone(this.options.inputLayout)
    for (const railPartition of this.options.packedPartitions) {
      placeRailConnectedLoad(
        { layout: this.outputLayout, railPartition },
        this.options,
      )
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
