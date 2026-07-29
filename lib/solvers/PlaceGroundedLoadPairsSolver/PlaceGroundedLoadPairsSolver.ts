import type { GraphicsObject } from "graphics-debug"
import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import type { PackedPartition } from "../PackInnerPartitionsSolver/PackInnerPartitionsSolver"

const PIN_OFFSET = 0.2
const PACKING_PIN_HALF_SIZE = 0.005

export class PlaceGroundedLoadPairsSolver extends BaseSolver {
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

  override _step() {
    const placements = Object.fromEntries(
      Object.entries(this.params.inputLayout.chipPlacements).map(
        ([chipId, placement]) => [chipId, { ...placement }],
      ),
    )
    const pinOwner = new Map<PinId, ChipId>()
    for (const chip of Object.values(this.params.inputProblem.chipMap)) {
      for (const pinId of chip.pins) pinOwner.set(pinId, chip.chipId)
    }
    const allPairChipIds = new Set(
      this.params.packedPartitions
        .filter(
          (partition) =>
            partition.inputProblem.partitionType === "grounded_load_pair",
        )
        .flatMap((partition) => Object.keys(partition.inputProblem.chipMap)),
    )
    const mainBounds = this.getBounds(
      Object.keys(placements).filter((chipId) => !allPairChipIds.has(chipId)),
      placements,
    )

    for (const partition of this.params.packedPartitions) {
      if (partition.inputProblem.partitionType !== "grounded_load_pair") {
        continue
      }
      this.placePair(partition, placements, pinOwner, mainBounds)
    }

    this.outputLayout = {
      chipPlacements: placements,
      groupPlacements: { ...this.params.inputLayout.groupPlacements },
    }
    this.solved = true
  }

  private placePair(
    partition: PackedPartition,
    placements: Record<ChipId, Placement>,
    pinOwner: Map<PinId, ChipId>,
    mainBounds: { minX: number; maxX: number },
  ) {
    const pairChipIds = new Set(Object.keys(partition.inputProblem.chipMap))
    const connection = Object.entries(
      this.params.inputProblem.pinStrongConnMap,
    ).find(([connectionKey, connected]) => {
      if (!connected) return false
      const [pinA, pinB] = connectionKey.split("-") as [PinId, PinId]
      const ownerA = pinOwner.get(pinA)
      const ownerB = pinOwner.get(pinB)
      return (
        ownerA && ownerB && pairChipIds.has(ownerA) !== pairChipIds.has(ownerB)
      )
    })
    if (!connection) return

    const [pinA, pinB] = connection[0].split("-") as [PinId, PinId]
    const pairPinId = pairChipIds.has(pinOwner.get(pinA)!) ? pinA : pinB
    const mainPinId = pairPinId === pinA ? pinB : pinA
    const pairChipId = pinOwner.get(pairPinId)!
    const mainChipId = pinOwner.get(mainPinId)!
    const pairPlacement = placements[pairChipId]
    const mainPlacement = placements[mainChipId]
    if (!pairPlacement || !mainPlacement) return

    const mainPinOffset = rotatePinOffset(
      this.params.inputProblem.chipPinMap[mainPinId]!.offset,
      mainPlacement.ccwRotationDegrees,
    )
    const sideDirection = Math.sign(mainPinOffset.x)
    if (sideDirection === 0) return

    const pairBounds = this.getBounds([...pairChipIds], placements)
    const pairCenterX = (pairBounds.minX + pairBounds.maxX) / 2
    const pairWidth = pairBounds.maxX - pairBounds.minX
    const mainPinX = mainPlacement.x + mainPinOffset.x
    const pinAlignedCenterX =
      mainPinX +
      sideDirection *
        (this.params.inputProblem.partitionGap +
          pairWidth / 2 +
          PACKING_PIN_HALF_SIZE)
    const boundaryAlignedCenterX =
      (sideDirection > 0 ? mainBounds.maxX : mainBounds.minX) +
      sideDirection * (this.params.inputProblem.partitionGap + pairWidth / 2)
    const targetPairCenterX =
      sideDirection > 0
        ? Math.max(pinAlignedCenterX, boundaryAlignedCenterX)
        : Math.min(pinAlignedCenterX, boundaryAlignedCenterX)

    const pairPinOffset = rotatePinOffset(
      this.params.inputProblem.chipPinMap[pairPinId]!.offset,
      pairPlacement.ccwRotationDegrees,
    )
    const mainPinY = mainPlacement.y + mainPinOffset.y
    const pairPinY = pairPlacement.y + pairPinOffset.y
    const offsetX = targetPairCenterX - pairCenterX
    const offsetY = mainPinY - pairPinY - PIN_OFFSET

    for (const chipId of pairChipIds) {
      placements[chipId]!.x += offsetX
      placements[chipId]!.y += offsetY
    }
  }

  private getBounds(chipIds: ChipId[], placements: Record<ChipId, Placement>) {
    return chipIds.reduce(
      (bounds, chipId) => {
        const placement = placements[chipId]!
        const size = getRotatedSize(
          this.params.inputProblem.chipMap[chipId]!.size,
          placement.ccwRotationDegrees,
        )
        return {
          minX: Math.min(bounds.minX, placement.x - size.x / 2),
          maxX: Math.max(bounds.maxX, placement.x + size.x / 2),
        }
      },
      { minX: Infinity, maxX: -Infinity },
    )
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.params.inputProblem,
      this.outputLayout ?? this.params.inputLayout,
    )
  }

  override getConstructorParams() {
    return [this.params]
  }
}
