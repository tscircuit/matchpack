import { doesSegmentIntersectRect, type Point } from "@tscircuit/math-utils"
import type { GraphicsObject } from "graphics-debug"
import type {
  Chip,
  ChipId,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import type { Side } from "../../types/Side"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { BaseSolver } from "../BaseSolver"
import {
  getPlacementBounds,
  placementsOverlap,
} from "../AlignTestPointsSolver/placementsOverlap"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

type Axis = "x" | "y"

type AlignmentCandidate = {
  movableChipId: ChipId
  movablePinId: PinId
  anchorChipId: ChipId
  anchorPinId: PinId
  tangentAxis: Axis
  tangentDelta: number
}

const TWO_PIN_COMPONENT_PIN_COUNT = 2
const ALIGNMENT_EPSILON = 1e-6

const SIDE_VECTORS: Record<Side, Point> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

const OPPOSITE_SIDE: Record<Side, Side> = {
  "x-": "x+",
  "x+": "x-",
  "y-": "y+",
  "y+": "y-",
}

const vectorToSide = (vector: Point): Side => {
  if (Math.abs(vector.x) > Math.abs(vector.y)) {
    return vector.x < 0 ? "x-" : "x+"
  }
  return vector.y < 0 ? "y-" : "y+"
}

const rotateSide = (side: Side, ccwRotationDegrees: number): Side =>
  vectorToSide(rotatePinOffset(SIDE_VECTORS[side], ccwRotationDegrees))

const getAbsolutePinPosition = ({
  inputProblem,
  pinId,
  placement,
}: {
  inputProblem: InputProblem
  pinId: PinId
  placement: Placement
}): Point => {
  const pin = inputProblem.chipPinMap[pinId]!
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}

/**
 * Final polish pass for a connected pair of two-pin passives whose pins already
 * face each other. The generic packer minimizes the total distance to every net
 * and can leave a small perpendicular offset on a branched net. This pass
 * removes that offset when the move is local and remains collision-free.
 *
 * The resistor is the movable end of the pair and the anchor is another
 * two-pin passive, such as a diode. Keeping that movement policy narrow avoids
 * perturbing established layouts for unrelated passive pairs.
 */
export class AlignTwoPinPassivesSolver extends BaseSolver {
  outputLayout: OutputLayout | null = null
  private pinOwnerMap: Map<PinId, Chip>
  private stronglyConnectedPinsByPinId: ReturnType<
    typeof getPinIdToStronglyConnectedPinsObj
  >
  private netIdsByPinId = new Map<PinId, string[]>()
  private pinIdsByNetId = new Map<string, PinId[]>()

  constructor(
    private params: {
      inputProblem: InputProblem
      inputLayout: OutputLayout
    },
  ) {
    super()
    this.pinOwnerMap = createPinOwnerMap(params.inputProblem)
    this.stronglyConnectedPinsByPinId = getPinIdToStronglyConnectedPinsObj(
      params.inputProblem,
    )

    for (const pinId of Object.keys(params.inputProblem.chipPinMap)) {
      for (const netId of Object.keys(params.inputProblem.netMap)) {
        if (!params.inputProblem.netConnMap[`${pinId}-${netId}`]) continue
        const pinNetIds = this.netIdsByPinId.get(pinId) ?? []
        pinNetIds.push(netId)
        this.netIdsByPinId.set(pinId, pinNetIds)
        const netPinIds = this.pinIdsByNetId.get(netId) ?? []
        netPinIds.push(pinId)
        this.pinIdsByNetId.set(netId, netPinIds)
      }
    }
  }

  private getNetIdsForPin(pinId: PinId): string[] {
    return this.netIdsByPinId.get(pinId) ?? []
  }

  private getConnectedPinIds(pinId: PinId): PinId[] {
    const connectedPinIds = new Set<PinId>()
    for (const connectedPin of this.stronglyConnectedPinsByPinId[pinId] ?? []) {
      connectedPinIds.add(connectedPin.pinId)
    }

    for (const netId of this.getNetIdsForPin(pinId)) {
      for (const candidatePinId of this.pinIdsByNetId.get(netId) ?? []) {
        if (candidatePinId === pinId) continue
        connectedPinIds.add(candidatePinId)
      }
    }
    return [...connectedPinIds]
  }

  private getCandidate(
    movableChip: Chip,
    movablePinId: PinId,
    anchorChip: Chip,
    anchorPinId: PinId,
    chipPlacements: Record<ChipId, Placement>,
  ): AlignmentCandidate | null {
    const movablePlacement = chipPlacements[movableChip.chipId]
    const anchorPlacement = chipPlacements[anchorChip.chipId]
    const movablePin = this.params.inputProblem.chipPinMap[movablePinId]
    const anchorPin = this.params.inputProblem.chipPinMap[anchorPinId]
    if (!movablePlacement || !anchorPlacement || !movablePin || !anchorPin) {
      return null
    }

    const movableSide = rotateSide(
      movablePin.side,
      movablePlacement.ccwRotationDegrees,
    )
    const anchorSide = rotateSide(
      anchorPin.side,
      anchorPlacement.ccwRotationDegrees,
    )
    if (OPPOSITE_SIDE[movableSide] !== anchorSide) return null

    const movablePinPosition = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: movablePinId,
      placement: movablePlacement,
    })
    const anchorPinPosition = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: anchorPinId,
      placement: anchorPlacement,
    })
    const sideVector = SIDE_VECTORS[movableSide]
    const anchorDirection = {
      x: anchorPinPosition.x - movablePinPosition.x,
      y: anchorPinPosition.y - movablePinPosition.y,
    }
    const outwardDistance =
      anchorDirection.x * sideVector.x + anchorDirection.y * sideVector.y
    if (outwardDistance <= ALIGNMENT_EPSILON) return null

    const tangentAxis: Axis = movableSide.startsWith("x") ? "y" : "x"
    const tangentDelta =
      anchorPinPosition[tangentAxis] - movablePinPosition[tangentAxis]
    if (Math.abs(tangentDelta) <= ALIGNMENT_EPSILON) return null
    if (Math.abs(tangentDelta) > this.params.inputProblem.partitionGap) {
      return null
    }

    return {
      movableChipId: movableChip.chipId,
      movablePinId,
      anchorChipId: anchorChip.chipId,
      anchorPinId,
      tangentAxis,
      tangentDelta,
    }
  }

  private candidateIsClear(
    candidate: AlignmentCandidate,
    chipPlacements: Record<ChipId, Placement>,
  ): boolean {
    const movablePlacement = chipPlacements[candidate.movableChipId]!
    for (const [otherChipId, otherPlacement] of Object.entries(
      chipPlacements,
    )) {
      if (otherChipId === candidate.movableChipId) continue
      if (
        placementsOverlap({
          inputProblem: this.params.inputProblem,
          chipIdA: candidate.movableChipId,
          placementA: movablePlacement,
          chipIdB: otherChipId,
          placementB: otherPlacement,
        })
      ) {
        return false
      }
    }

    const segmentStart = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: candidate.movablePinId,
      placement: movablePlacement,
    })
    const segmentEnd = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: candidate.anchorPinId,
      placement: chipPlacements[candidate.anchorChipId]!,
    })
    for (const [otherChipId, otherPlacement] of Object.entries(
      chipPlacements,
    )) {
      if (
        otherChipId === candidate.movableChipId ||
        otherChipId === candidate.anchorChipId
      ) {
        continue
      }
      const otherBounds = getPlacementBounds({
        placement: otherPlacement,
        size: this.params.inputProblem.chipMap[otherChipId]!.size,
      })
      if (doesSegmentIntersectRect(segmentStart, segmentEnd, otherBounds)) {
        return false
      }
    }
    return true
  }

  private alignMovablePassive(
    movablePassive: Chip,
    chipPlacements: Record<ChipId, Placement>,
  ): void {
    const candidates: AlignmentCandidate[] = []
    for (const movablePinId of movablePassive.pins) {
      for (const anchorPinId of this.getConnectedPinIds(movablePinId)) {
        const anchorPassive = this.pinOwnerMap.get(anchorPinId)
        if (!anchorPassive || anchorPassive.chipId === movablePassive.chipId) {
          continue
        }
        if (anchorPassive.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
        if (anchorPassive.isResistor || anchorPassive.isCrystal) continue
        const candidate = this.getCandidate(
          movablePassive,
          movablePinId,
          anchorPassive,
          anchorPinId,
          chipPlacements,
        )
        if (candidate) candidates.push(candidate)
      }
    }

    candidates.sort(
      (a, b) => Math.abs(a.tangentDelta) - Math.abs(b.tangentDelta),
    )
    for (const candidate of candidates) {
      const placement = chipPlacements[movablePassive.chipId]!
      const previousTangentPosition = placement[candidate.tangentAxis]
      placement[candidate.tangentAxis] += candidate.tangentDelta
      if (this.candidateIsClear(candidate, chipPlacements)) return
      placement[candidate.tangentAxis] = previousTangentPosition
    }
  }

  override _step() {
    const outputLayout = structuredClone(this.params.inputLayout)
    for (const movablePassive of Object.values(
      this.params.inputProblem.chipMap,
    )) {
      if (
        !movablePassive.isResistor ||
        movablePassive.isCrystal ||
        movablePassive.fixedPosition
      ) {
        continue
      }
      if (movablePassive.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
      if (!outputLayout.chipPlacements[movablePassive.chipId]) continue
      this.alignMovablePassive(movablePassive, outputLayout.chipPlacements)
    }
    this.outputLayout = outputLayout
    this.solved = true
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
