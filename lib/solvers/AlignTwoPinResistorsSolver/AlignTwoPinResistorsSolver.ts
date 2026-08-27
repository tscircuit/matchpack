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
  resistorChipId: ChipId
  resistorPinId: PinId
  peerChipId: ChipId
  peerPinId: PinId
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
 * Final polish pass for a movable two-pin resistor whose pin already faces a
 * connected two-pin peer. The generic packer minimizes the total distance to
 * every net and can leave a small perpendicular offset on a branched net. This
 * pass removes that offset when the move is local and remains collision-free.
 */
export class AlignTwoPinResistorsSolver extends BaseSolver {
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
    resistor: Chip,
    resistorPinId: PinId,
    peerChip: Chip,
    peerPinId: PinId,
    chipPlacements: Record<ChipId, Placement>,
  ): AlignmentCandidate | null {
    const resistorPlacement = chipPlacements[resistor.chipId]
    const peerPlacement = chipPlacements[peerChip.chipId]
    const resistorPin = this.params.inputProblem.chipPinMap[resistorPinId]
    const peerPin = this.params.inputProblem.chipPinMap[peerPinId]
    if (!resistorPlacement || !peerPlacement || !resistorPin || !peerPin) {
      return null
    }

    const resistorSide = rotateSide(
      resistorPin.side,
      resistorPlacement.ccwRotationDegrees,
    )
    const peerSide = rotateSide(peerPin.side, peerPlacement.ccwRotationDegrees)
    if (OPPOSITE_SIDE[resistorSide] !== peerSide) return null

    const resistorPinPosition = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: resistorPinId,
      placement: resistorPlacement,
    })
    const peerPinPosition = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: peerPinId,
      placement: peerPlacement,
    })
    const sideVector = SIDE_VECTORS[resistorSide]
    const peerDirection = {
      x: peerPinPosition.x - resistorPinPosition.x,
      y: peerPinPosition.y - resistorPinPosition.y,
    }
    const outwardDistance =
      peerDirection.x * sideVector.x + peerDirection.y * sideVector.y
    if (outwardDistance <= ALIGNMENT_EPSILON) return null

    const tangentAxis: Axis = resistorSide.startsWith("x") ? "y" : "x"
    const tangentDelta =
      peerPinPosition[tangentAxis] - resistorPinPosition[tangentAxis]
    if (Math.abs(tangentDelta) <= ALIGNMENT_EPSILON) return null
    if (Math.abs(tangentDelta) > this.params.inputProblem.partitionGap) {
      return null
    }

    return {
      resistorChipId: resistor.chipId,
      resistorPinId,
      peerChipId: peerChip.chipId,
      peerPinId,
      tangentAxis,
      tangentDelta,
    }
  }

  private candidateIsClear(
    candidate: AlignmentCandidate,
    chipPlacements: Record<ChipId, Placement>,
  ): boolean {
    const resistorPlacement = chipPlacements[candidate.resistorChipId]!
    for (const [otherChipId, otherPlacement] of Object.entries(
      chipPlacements,
    )) {
      if (otherChipId === candidate.resistorChipId) continue
      if (
        placementsOverlap({
          inputProblem: this.params.inputProblem,
          chipIdA: candidate.resistorChipId,
          placementA: resistorPlacement,
          chipIdB: otherChipId,
          placementB: otherPlacement,
        })
      ) {
        return false
      }
    }

    const segmentStart = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: candidate.resistorPinId,
      placement: resistorPlacement,
    })
    const segmentEnd = getAbsolutePinPosition({
      inputProblem: this.params.inputProblem,
      pinId: candidate.peerPinId,
      placement: chipPlacements[candidate.peerChipId]!,
    })
    for (const [otherChipId, otherPlacement] of Object.entries(
      chipPlacements,
    )) {
      if (
        otherChipId === candidate.resistorChipId ||
        otherChipId === candidate.peerChipId
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

  private alignResistor(
    resistor: Chip,
    chipPlacements: Record<ChipId, Placement>,
  ): void {
    const candidates: AlignmentCandidate[] = []
    for (const resistorPinId of resistor.pins) {
      for (const peerPinId of this.getConnectedPinIds(resistorPinId)) {
        const peerChip = this.pinOwnerMap.get(peerPinId)
        if (!peerChip || peerChip.chipId === resistor.chipId) continue
        if (peerChip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
        if (peerChip.isResistor) continue
        const candidate = this.getCandidate(
          resistor,
          resistorPinId,
          peerChip,
          peerPinId,
          chipPlacements,
        )
        if (candidate) candidates.push(candidate)
      }
    }

    candidates.sort(
      (a, b) => Math.abs(a.tangentDelta) - Math.abs(b.tangentDelta),
    )
    for (const candidate of candidates) {
      const placement = chipPlacements[resistor.chipId]!
      const previousTangentPosition = placement[candidate.tangentAxis]
      placement[candidate.tangentAxis] += candidate.tangentDelta
      if (this.candidateIsClear(candidate, chipPlacements)) return
      placement[candidate.tangentAxis] = previousTangentPosition
    }
  }

  override _step() {
    const outputLayout = structuredClone(this.params.inputLayout)
    for (const resistor of Object.values(this.params.inputProblem.chipMap)) {
      if (!resistor.isResistor || resistor.fixedPosition) continue
      if (resistor.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT) continue
      if (!outputLayout.chipPlacements[resistor.chipId]) continue
      this.alignResistor(resistor, outputLayout.chipPlacements)
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
