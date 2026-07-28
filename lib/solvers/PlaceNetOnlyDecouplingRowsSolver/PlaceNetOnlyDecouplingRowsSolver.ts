import type { GraphicsObject } from "graphics-debug"
import type {
  ChipId,
  InputProblem,
  PartitionInputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type { Side } from "../../types/Side"
import { getRotatedSize } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

export class PlaceNetOnlyDecouplingRowsSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(
    private params: {
      inputProblem: InputProblem
      packedPartitions: PackedPartition[]
      inputLayout: OutputLayout
    },
  ) {
    super()
  }

  private getBounds(chipIds: ChipId[], layout: OutputLayout): Bounds | null {
    const bounds = chipIds.flatMap((chipId) => {
      const placement = layout.chipPlacements[chipId]
      const chip = this.params.inputProblem.chipMap[chipId]
      if (!placement || !chip) return []
      const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
      return [
        {
          minX: placement.x - size.x / 2,
          maxX: placement.x + size.x / 2,
          minY: placement.y - size.y / 2,
          maxY: placement.y + size.y / 2,
        },
      ]
    })
    if (!bounds.length) return null
    return {
      minX: Math.min(...bounds.map((b) => b.minX)),
      maxX: Math.max(...bounds.map((b) => b.maxX)),
      minY: Math.min(...bounds.map((b) => b.minY)),
      maxY: Math.max(...bounds.map((b) => b.maxY)),
    }
  }

  private getDirectNeighbor(
    mainPartition: PackedPartition,
    mainChipId: ChipId,
    side: Side,
  ): ChipId | null {
    const problem = this.params.inputProblem
    const sidePins = new Set(
      problem.chipMap[mainChipId]?.pins.filter(
        (pinId) => problem.chipPinMap[pinId]?.side === side,
      ),
    )
    for (const [connection, connected] of Object.entries(
      problem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [pinA, pinB] = connection.split("-") as [PinId, PinId]
      const neighborPin = sidePins.has(pinA)
        ? pinB
        : sidePins.has(pinB)
          ? pinA
          : null
      if (!neighborPin) continue
      const neighbor = Object.values(mainPartition.inputProblem.chipMap).find(
        (chip) => chip.chipId !== mainChipId && chip.pins.includes(neighborPin),
      )
      if (neighbor) return neighbor.chipId
    }
    return null
  }

  private partitionsHaveDirectConnection(
    partitionA: PackedPartition,
    partitionB: PackedPartition,
  ): boolean {
    const pinsA = new Set(Object.keys(partitionA.inputProblem.chipPinMap))
    const pinsB = new Set(Object.keys(partitionB.inputProblem.chipPinMap))
    return Object.entries(this.params.inputProblem.pinStrongConnMap).some(
      ([connection, connected]) => {
        if (!connected) return false
        const [pinA, pinB] = connection.split("-")
        return (
          (pinsA.has(pinA!) && pinsB.has(pinB!)) ||
          (pinsA.has(pinB!) && pinsB.has(pinA!))
        )
      },
    )
  }

  private movedChipsOverlap(
    layout: OutputLayout,
    movedChipIds: ChipId[],
  ): boolean {
    const moved = new Set(movedChipIds)
    return movedChipIds.some((movedChipId) => {
      const movedBounds = this.getBounds([movedChipId], layout)
      return Object.keys(layout.chipPlacements).some((chipId) => {
        if (moved.has(chipId)) return false
        const bounds = this.getBounds([chipId], layout)
        return (
          movedBounds &&
          bounds &&
          movedBounds.minX < bounds.maxX &&
          movedBounds.maxX > bounds.minX &&
          movedBounds.minY < bounds.maxY &&
          movedBounds.maxY > bounds.minY
        )
      })
    })
  }

  private placeRow(
    layout: OutputLayout,
    decouplingPartition: PackedPartition,
  ): void {
    const partition = decouplingPartition.inputProblem as PartitionInputProblem
    const mainChipId = partition.decouplingMainChipId
    const side = partition.decouplingMainChipSide
    if (partition.partitionType !== "decoupling_caps" || !mainChipId || !side) {
      return
    }

    const mainPartition = this.params.packedPartitions.find(
      (candidate) =>
        candidate !== decouplingPartition &&
        candidate.inputProblem.chipMap[mainChipId],
    )
    if (
      !mainPartition ||
      this.partitionsHaveDirectConnection(decouplingPartition, mainPartition)
    ) {
      return
    }

    const neighborId = this.getDirectNeighbor(mainPartition, mainChipId, side)
    const neighbor = neighborId && layout.chipPlacements[neighborId]
    const rowChipIds = Object.keys(partition.chipMap)
    const mainBounds = this.getBounds(
      Object.keys(mainPartition.inputProblem.chipMap),
      layout,
    )
    const rowBounds = this.getBounds(rowChipIds, layout)
    if (!neighbor || !mainBounds || !rowBounds) return

    const offset = {
      x: neighbor.x - (rowBounds.minX + rowBounds.maxX) / 2,
      y: neighbor.y - (rowBounds.minY + rowBounds.maxY) / 2,
    }
    const gap = this.params.inputProblem.chipGap
    if (side === "x+") offset.x = mainBounds.maxX + gap - rowBounds.minX
    if (side === "x-") offset.x = mainBounds.minX - gap - rowBounds.maxX
    if (side === "y+") offset.y = mainBounds.maxY + gap - rowBounds.minY
    if (side === "y-") offset.y = mainBounds.minY - gap - rowBounds.maxY

    const previous = new Map<ChipId, Placement>()
    for (const chipId of rowChipIds) {
      const placement = layout.chipPlacements[chipId]
      if (!placement) continue
      previous.set(chipId, placement)
      layout.chipPlacements[chipId] = {
        ...placement,
        x: placement.x + offset.x,
        y: placement.y + offset.y,
      }
    }
    if (this.movedChipsOverlap(layout, rowChipIds)) {
      for (const [chipId, placement] of previous) {
        layout.chipPlacements[chipId] = placement
      }
    }
  }

  override _step() {
    this.outputLayout = structuredClone(this.params.inputLayout)
    for (const partition of this.params.packedPartitions) {
      this.placeRow(this.outputLayout, partition)
    }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.params.inputProblem,
      this.outputLayout ?? this.params.inputLayout,
    )
  }

  override getConstructorParams(): [typeof this.params] {
    return [this.params]
  }
}
