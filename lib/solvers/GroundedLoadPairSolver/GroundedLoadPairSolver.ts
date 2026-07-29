import type { GraphicsObject } from "graphics-debug"
import type { Chip, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"
import { getVerticalPinClearanceOffset } from "../PackInnerPartitionsSolver/getVerticalPinClearanceOffset"

type GroundedLoadPair = {
  nearChip: Chip
  farChip: Chip
  mainPinId: PinId
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
        const mainPinId = this.connectedPins(chipSidePinId).find((pinId) => {
          const chip = pinOwner.get(pinId)
          return chip && chip.pins.length > 2 && !chip.isCrystal
        })
        if (!mainPinId) continue

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
          mainPinId,
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
    const mainChip = Object.values(this.params.inputProblem.chipMap).find(
      (chip) => chip.pins.includes(pair.mainPinId),
    )
    const mainPlacement = mainChip ? placements[mainChip.chipId] : undefined
    if (!nearPlacement || !mainPlacement) return

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

    const nextNearPlacement = {
      x: chipSidePosition.x - newChipSideOffset.x,
      y: chipSidePosition.y - newChipSideOffset.y,
      ccwRotationDegrees: nearRotation,
    }
    nextNearPlacement.y += getVerticalPinClearanceOffset({
      upperPin: this.params.inputProblem.chipPinMap[pair.mainPinId]!,
      upperPlacement: mainPlacement,
      lowerPin: chipSidePin,
      lowerPlacement: nextNearPlacement,
    })
    placements[pair.nearChip.chipId] = nextNearPlacement
    placements[pair.farChip.chipId] = {
      x:
        placements[pair.nearChip.chipId]!.x +
        nearInternalOffset.x -
        farInternalOffset.x,
      y: placements[pair.nearChip.chipId]!.y - centerDistance,
      ccwRotationDegrees: farRotation,
    }
    this.movePairBelowCollisions(pair, placements)
  }

  private movePairBelowCollisions(
    pair: GroundedLoadPair,
    placements: Record<string, Placement>,
  ) {
    const pairChipIds = new Set([pair.nearChip.chipId, pair.farChip.chipId])
    const nearPlacement = placements[pair.nearChip.chipId]!
    const farPlacement = placements[pair.farChip.chipId]!
    const nearBounds = this.getBounds(pair.nearChip, nearPlacement)
    const farBounds = this.getBounds(pair.farChip, farPlacement)
    const pairBounds = {
      minX: Math.min(nearBounds.minX, farBounds.minX),
      maxX: Math.max(nearBounds.maxX, farBounds.maxX),
      maxY: Math.max(nearBounds.maxY, farBounds.maxY),
    }

    let downwardShift = 0
    for (const [chipId, placement] of Object.entries(placements)) {
      if (pairChipIds.has(chipId)) continue
      const chip = this.params.inputProblem.chipMap[chipId]
      if (!chip) continue
      const bounds = this.getBounds(chip, placement)
      const overlapsX =
        pairBounds.minX < bounds.maxX + this.params.inputProblem.chipGap &&
        pairBounds.maxX > bounds.minX - this.params.inputProblem.chipGap
      if (!overlapsX || bounds.maxY <= pairBounds.maxY) continue

      downwardShift = Math.max(
        downwardShift,
        pairBounds.maxY + this.params.inputProblem.chipGap - bounds.minY,
      )
    }

    nearPlacement.y -= downwardShift
    farPlacement.y -= downwardShift
  }

  private getBounds(chip: Chip, placement: Placement) {
    const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
    return {
      minX: placement.x - size.x / 2,
      maxX: placement.x + size.x / 2,
      minY: placement.y - size.y / 2,
      maxY: placement.y + size.y / 2,
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
