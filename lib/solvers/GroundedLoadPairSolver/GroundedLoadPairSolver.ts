import type { GraphicsObject } from "graphics-debug"
import type { Chip, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

type GroundedLoadPair = {
  nearChip: Chip
  farChip: Chip
  chipSidePinId: PinId
  nearInternalPinId: PinId
  farInternalPinId: PinId
  groundPinId: PinId
}

export class GroundedLoadPairSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null

  constructor(
    private params: {
      inputProblem: InputProblem
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

    for (const pair of this.findPairs()) this.layoutPair(pair, placements)

    this.outputLayout = {
      chipPlacements: placements,
      groupPlacements: { ...this.params.inputLayout.groupPlacements },
    }
    this.solved = true
  }

  private findPairs(): GroundedLoadPair[] {
    const problem = this.params.inputProblem
    const pinOwner = new Map<PinId, Chip>()
    for (const chip of Object.values(problem.chipMap)) {
      for (const pinId of chip.pins) pinOwner.set(pinId, chip)
    }

    const pairs: GroundedLoadPair[] = []
    const pairedChipIds = new Set<string>()
    for (const nearChip of Object.values(problem.chipMap)) {
      if (
        nearChip.pins.length !== 2 ||
        nearChip.fixedPosition ||
        pairedChipIds.has(nearChip.chipId)
      ) {
        continue
      }

      for (const chipSidePinId of nearChip.pins) {
        const mainChip = this.connectedPins(chipSidePinId)
          .map((pinId) => pinOwner.get(pinId))
          .find((chip) => chip && chip.pins.length > 2 && !chip.isCrystal)
        if (!mainChip) continue

        const nearInternalPinId = nearChip.pins.find(
          (pinId) => pinId !== chipSidePinId,
        )!
        const farChip = this.connectedPins(nearInternalPinId)
          .map((pinId) => pinOwner.get(pinId))
          .find(
            (chip) =>
              chip &&
              chip.pins.length === 2 &&
              chip.chipId !== nearChip.chipId &&
              !chip.fixedPosition &&
              !pairedChipIds.has(chip.chipId),
          )
        if (!farChip) continue

        const farInternalPinId = farChip.pins.find((pinId) =>
          this.connectedPins(pinId).some(
            (connectedPinId) =>
              pinOwner.get(connectedPinId)?.chipId === nearChip.chipId,
          ),
        )
        const groundPinId = farChip.pins.find(
          (pinId) => pinId !== farInternalPinId && this.isGroundPin(pinId),
        )
        if (!farInternalPinId || !groundPinId) continue

        pairs.push({
          nearChip,
          farChip,
          chipSidePinId,
          nearInternalPinId,
          farInternalPinId,
          groundPinId,
        })
        pairedChipIds.add(nearChip.chipId)
        pairedChipIds.add(farChip.chipId)
        break
      }
    }
    return pairs
  }

  private layoutPair(
    pair: GroundedLoadPair,
    placements: Record<string, Placement>,
  ) {
    const nearPlacement = placements[pair.nearChip.chipId]
    if (!nearPlacement) return

    const chipSidePin = this.params.inputProblem.chipPinMap[pair.chipSidePinId]!
    const oldChipSideOffset = rotatePinOffset(
      chipSidePin.offset,
      nearPlacement.ccwRotationDegrees,
    )
    const chipSidePosition = {
      x: nearPlacement.x + oldChipSideOffset.x,
      y: nearPlacement.y + oldChipSideOffset.y,
    }
    const nearRotation = this.chooseRotation(
      pair.nearChip,
      pair.chipSidePinId,
      pair.nearInternalPinId,
    )
    const farRotation = this.chooseRotation(
      pair.farChip,
      pair.farInternalPinId,
      pair.groundPinId,
    )
    const newChipSideOffset = rotatePinOffset(chipSidePin.offset, nearRotation)
    const nearSize = getRotatedSize(pair.nearChip.size, nearRotation)
    const farSize = getRotatedSize(pair.farChip.size, farRotation)
    const centerDistance =
      nearSize.y / 2 + this.params.inputProblem.chipGap + farSize.y / 2
    const nearInternalOffset = rotatePinOffset(
      this.params.inputProblem.chipPinMap[pair.nearInternalPinId]!.offset,
      nearRotation,
    )
    const farInternalOffset = rotatePinOffset(
      this.params.inputProblem.chipPinMap[pair.farInternalPinId]!.offset,
      farRotation,
    )

    placements[pair.nearChip.chipId] = {
      x: chipSidePosition.x - newChipSideOffset.x,
      y: chipSidePosition.y - newChipSideOffset.y,
      ccwRotationDegrees: nearRotation,
    }
    placements[pair.farChip.chipId] = {
      x:
        placements[pair.nearChip.chipId]!.x +
        nearInternalOffset.x -
        farInternalOffset.x,
      y: placements[pair.nearChip.chipId]!.y - centerDistance,
      ccwRotationDegrees: farRotation,
    }
  }

  private chooseRotation(chip: Chip, topPinId: PinId, bottomPinId: PinId) {
    const topPin = this.params.inputProblem.chipPinMap[topPinId]!
    const bottomPin = this.params.inputProblem.chipPinMap[bottomPinId]!
    const rotations = chip.availableRotations ?? [0, 90, 180, 270]
    return rotations.reduce((bestRotation, rotation) => {
      const pinDelta = (candidateRotation: number) =>
        rotatePinOffset(topPin.offset, candidateRotation).y -
        rotatePinOffset(bottomPin.offset, candidateRotation).y
      return pinDelta(rotation) > pinDelta(bestRotation)
        ? rotation
        : bestRotation
    })
  }

  private connectedPins(pinId: PinId) {
    const connectedPins = new Set<PinId>()
    for (const [connection, connected] of Object.entries(
      this.params.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [pinA, pinB] = connection.split("-") as [PinId, PinId]
      if (pinA === pinId) connectedPins.add(pinB)
      if (pinB === pinId) connectedPins.add(pinA)
    }
    return [...connectedPins]
  }

  private isGroundPin(pinId: PinId) {
    return Object.entries(this.params.inputProblem.netConnMap).some(
      ([connection, connected]) => {
        if (!connected || !connection.startsWith(`${pinId}-`)) return false
        const netId = connection.slice(pinId.length + 1)
        return this.params.inputProblem.netMap[netId]?.isGround === true
      },
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
